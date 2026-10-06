/**
 * 图表库（Library，工单 09）的 localStorage 存取接缝：
 * 图表库 = 多张图表 + 索引（活跃图表 id），整体序列化为一个 key（ADR-0002）。
 * 每张图表独立持有 source / savedAt，实现"每张图表独立自动保存"。
 * UI / store 层只调用 loadLibrary / saveLibrary，测试可注入 Storage 替身。
 *
 * schema 版本（self-grill-hardening 工单 07）：落盘记录带 `version` 字段，读取时经
 * `library-migrations` 的迁移链升级旧记录（无 `version` 字段的旧形态即 v1），
 * 存储结构演进不再静默吃掉用户已有图表。
 *
 * 存储失败降级：`saveLibrary` 捕获 quota / 不可用异常，返回 `SaveLibraryResult`
 * 而不抛出——内存态继续可用，调用方（App）据结果浮出「保存失败」提示。
 */

import { STORAGE_KEY, loadDiagram } from './storage'
import { unnamedDiagramName } from '../i18n/domain-strings.ts'
import { createSampleDiagrams } from './sample-library'
import { LIBRARY_SCHEMA_VERSION, migrateLibraryRecord } from './library-migrations'

/** 图表库中单张图表的持久化形态 */
export interface StoredLibraryDiagram {
  id: string
  name: string
  source: string
  /** 该图表上次保存时间（epoch ms） */
  savedAt: number
}

/** 图表库整体：全部图表 + 活跃图表 id（索引） */
export interface StoredLibrary {
  diagrams: StoredLibraryDiagram[]
  activeId: string | null
}

/** 保存失败原因：quota = 写入异常（空间满等）；unavailable = 存储整体不可用（隐私模式） */
export type SaveLibraryFailure = 'quota' | 'unavailable'

/** 保存结果：调用方据 ok 决定是否浮出「保存失败」提示（不抛异常） */
export type SaveLibraryResult = { ok: true } | { ok: false; reason: SaveLibraryFailure }

export const LIBRARY_STORAGE_KEY = 'visual-mmd:library'

/** 探测存储可用性的探针键（写入后立即删除） */
const STORAGE_PROBE_KEY = 'visual-mmd:storage-probe'

/**
 * 安全取得默认存储：访问 `localStorage` 本身在隐私模式 / 禁用 cookie 时会抛
 * SecurityError，裸全局取值会让模块加载或调用直接崩。取不到时返回 null，
 * 各存取函数按「无存储」降级（内存态仍可用）。
 */
export function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** 存储是否真的可写：null 或读写探针抛异常即不可用（隐私模式 / 配额为 0） */
export function isStorageAvailable(storage: Storage | null): boolean {
  if (storage === null) return false
  try {
    storage.setItem(STORAGE_PROBE_KEY, '1')
    storage.removeItem(STORAGE_PROBE_KEY)
    return true
  } catch {
    return false
  }
}

/** 生成图表 id（测试可注入 rand 与 now） */
export function createDiagramId(rand: () => number = Math.random, now: () => number = Date.now): string {
  const random = rand().toString(36).slice(2, 10)
  return `diagram-${now().toString(36)}-${random}`
}

function isValidEntry(value: unknown): value is StoredLibraryDiagram {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.id === 'string' && typeof v.name === 'string' && typeof v.source === 'string'
}

/** 把已迁移的记录规整为 StoredLibrary（校验结构、回填缺省）；结构不对返回 null */
function toStoredLibrary(record: Record<string, unknown>): StoredLibrary | null {
  const { diagrams, activeId } = record
  if (!Array.isArray(diagrams) || !diagrams.every(isValidEntry)) return null
  const entries: StoredLibraryDiagram[] = diagrams.map((d) => ({
    id: d.id,
    name: d.name,
    source: d.source,
    savedAt: typeof d.savedAt === 'number' ? d.savedAt : 0,
  }))
  const active = typeof activeId === 'string' && entries.some((d) => d.id === activeId) ? activeId : null
  return { diagrams: entries, activeId: entries.length > 0 ? (active ?? entries[0].id) : null }
}

/**
 * 读取图表库；不存在、损坏、或版本无法迁移时返回 null（调用方决定回退）。
 * 旧版本记录（含无 `version` 字段的 v1）沿迁移链升级后再校验。
 */
export function loadLibrary(storage: Storage | null = defaultStorage()): StoredLibrary | null {
  if (storage === null) return null
  try {
    const raw = storage.getItem(LIBRARY_STORAGE_KEY)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const migrated = migrateLibraryRecord(parsed as Record<string, unknown>)
    if (migrated === null) return null
    return toStoredLibrary(migrated)
  } catch {
    // 损坏的数据视为无存档，不抛出
    return null
  }
}

/**
 * 保存图表库（带 schema 版本）。捕获写入异常（quota 满等）与存储整体不可用，
 * 返回结果而不抛出——调用方据此提示，内存态继续可用。
 */
export function saveLibrary(
  library: StoredLibrary,
  storage: Storage | null = defaultStorage(),
): SaveLibraryResult {
  if (storage === null) return { ok: false, reason: 'unavailable' }
  try {
    const record = { version: LIBRARY_SCHEMA_VERSION, ...library }
    storage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(record))
    return { ok: true }
  } catch {
    return { ok: false, reason: 'quota' }
  }
}

/**
 * 启动引导：优先读图表库；图表库不存在时迁移旧版单图存档（工单 04 的 key），
 * 两者都无（真·首次启动）则预置示例图表库（工单 17）。始终返回一个可用的图表库。
 *
 * 「只播种一次」的规则：只要存储里存在图表库 key（哪怕用户已删空为 `[]`），
 * 就原样返回、**绝不重新播种**——删除示例不会复活（工单 17 要求 3）。
 */
export function bootstrapLibrary(storage: Storage | null = defaultStorage()): StoredLibrary {
  const stored = loadLibrary(storage)
  if (stored !== null) return stored
  const legacy = loadDiagram(storage)
  if (legacy !== null) {
    return {
      diagrams: [{ id: createDiagramId(undefined, () => legacy.savedAt || Date.now()), name: unnamedDiagramName(), source: legacy.source, savedAt: legacy.savedAt }],
      activeId: null,
    }
  }
  // 真·首次启动：预置示例图表（3–5 张，覆盖不同图种；见 sample-library.ts）
  const samples = createSampleDiagrams()
  return { diagrams: samples, activeId: samples[0]?.id ?? null }
}

/** 删除旧版单图存档 key（迁移完成后清理） */
export function removeLegacyDiagram(storage: Storage | null = defaultStorage()): void {
  if (storage === null) return
  try {
    storage.removeItem(STORAGE_KEY)
  } catch {
    // 存储不可用时无可清理，忽略
  }
}
