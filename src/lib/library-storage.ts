/**
 * 图表库（Library，工单 09）的 localStorage 存取接缝：
 * 图表库 = 多张图表 + 索引（活跃图表 id），整体序列化为一个 key（ADR-0002）。
 * 每张图表独立持有 source / savedAt，实现"每张图表独立自动保存"。
 * UI / store 层只调用 loadLibrary / saveLibrary，测试可注入 Storage 替身。
 */

import { STORAGE_KEY, loadDiagram } from './storage'
import { unnamedDiagramName } from '../i18n/domain-strings.ts'

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

export const LIBRARY_STORAGE_KEY = 'visual-mmd:library'

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

/** 读取图表库；不存在或损坏时返回 null（调用方决定回退） */
export function loadLibrary(storage: Storage = localStorage): StoredLibrary | null {
  try {
    const raw = storage.getItem(LIBRARY_STORAGE_KEY)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { diagrams, activeId } = parsed as { diagrams?: unknown; activeId?: unknown }
    if (!Array.isArray(diagrams) || !diagrams.every(isValidEntry)) return null
    const entries: StoredLibraryDiagram[] = diagrams.map((d) => ({
      id: d.id,
      name: d.name,
      source: d.source,
      savedAt: typeof d.savedAt === 'number' ? d.savedAt : 0,
    }))
    const active = typeof activeId === 'string' && entries.some((d) => d.id === activeId) ? activeId : null
    return { diagrams: entries, activeId: entries.length > 0 ? (active ?? entries[0].id) : null }
  } catch {
    // 损坏的数据视为无存档，不抛出
    return null
  }
}

export function saveLibrary(library: StoredLibrary, storage: Storage = localStorage): void {
  storage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(library))
}

/**
 * 启动引导：优先读图表库；图表库不存在时迁移旧版单图存档（工单 04 的 key），
 * 两者都无则用默认模板建一张起步图表。始终返回一个可用的图表库。
 */
export function bootstrapLibrary(storage: Storage = localStorage): StoredLibrary {
  const stored = loadLibrary(storage)
  if (stored !== null) return stored
  const legacy = loadDiagram(storage)
  if (legacy !== null) {
    return {
      diagrams: [{ id: createDiagramId(undefined, () => legacy.savedAt || Date.now()), name: unnamedDiagramName(), source: legacy.source, savedAt: legacy.savedAt }],
      activeId: null,
    }
  }
  return { diagrams: [], activeId: null }
}

/** 删除旧版单图存档 key（迁移完成后清理） */
export function removeLegacyDiagram(storage: Storage = localStorage): void {
  storage.removeItem(STORAGE_KEY)
}
