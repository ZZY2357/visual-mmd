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

export function loadDiagram(storage: Storage = localStorage): StoredDiagram | null {
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

export function saveDiagram(source: string, storage: Storage = localStorage): void {
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
