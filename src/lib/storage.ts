/**
 * 图表自动保存到 localStorage 的纯逻辑接缝。
 * UI 层只调用 loadDiagram / saveDiagram，测试可注入 Storage 替身。
 */

export interface StoredDiagram {
  /** 当前图表的 Mermaid 源码 */
  source: string
  /** 上次保存时间（epoch ms） */
  savedAt: number
}

export const STORAGE_KEY = 'visual-mmd:current-diagram'

/** 安全取得默认存储：访问 `localStorage` 在隐私模式下会抛 SecurityError，
 * 裸全局取值会让调用直接崩；取不到时返回 null，按「无存储」降级。 */
function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function loadDiagram(storage: Storage | null = defaultStorage()): StoredDiagram | null {
  if (storage === null) return null
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as { source?: unknown }).source !== 'string'
    ) {
      return null
    }
    const { source, savedAt } = parsed as { source: string; savedAt?: unknown }
    return {
      source,
      savedAt: typeof savedAt === 'number' ? savedAt : 0,
    }
  } catch {
    // 损坏的数据视为无存档，不抛出
    return null
  }
}

export function saveDiagram(source: string, storage: Storage | null = defaultStorage()): void {
  if (storage === null) return
  const payload: StoredDiagram = { source, savedAt: Date.now() }
  storage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

/** 默认起步模板：一张能跑通的 flowchart（spec 用户故事 1） */
export const DEFAULT_DIAGRAM_SOURCE = `flowchart TD
    A[开始] --> B{是否学会 Mermaid?}
    B -- 是 --> C[享受画图]
    B -- 否 --> D[用 Visual MMD]
    D --> C
`
