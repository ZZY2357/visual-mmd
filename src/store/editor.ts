import { create } from 'zustand'
import { DEFAULT_DIAGRAM_SOURCE, loadDiagram } from '../lib/storage'
import { SnapshotStack } from '../lib/pipeline/snapshot-stack'

/**
 * 编辑器状态：源码是唯一真相源（ADR-0008）。
 * 画布渲染与后续的投影派生都只从 source 出发。
 *
 * 撤销/重做 = 代码快照单栈（ADR-0008 派生决策）：
 * - 表单/画布等离散编辑（commitEdit）产生独立快照
 * - 代码面板连续输入（commitTypedSource）按输入会话合并为一个快照
 */

/** 输入会话合并窗口：连续输入间隔小于该值时合并为同一撤销步骤 */
const TYPE_SESSION_COALESCE_MS = 1000

interface EditorState {
  /** 当前图表的 Mermaid 源码 */
  source: string
  canUndo: boolean
  canRedo: boolean
  /** 代码面板连续输入：按输入会话合并为一个快照 */
  commitTypedSource: (source: string) => void
  /** 表单/画布等离散编辑：独立快照 */
  commitEdit: (source: string) => void
  undo: () => void
  redo: () => void
}

function initialSource(): string {
  const stored = loadDiagram()
  return stored !== null ? stored.source : DEFAULT_DIAGRAM_SOURCE
}

const snapshotStack = new SnapshotStack(initialSource(), {
  coalesceMs: TYPE_SESSION_COALESCE_MS,
})

function historyOf(stack: SnapshotStack): Pick<EditorState, 'canUndo' | 'canRedo'> {
  return { canUndo: stack.canUndo, canRedo: stack.canRedo }
}

/** 以新源码替换当前图表并清空历史（未来"从图表库打开另一张图"时使用） */
export function resetEditorHistory(source: string): void {
  snapshotStack.reset(source)
  useEditorStore.setState({ source, ...historyOf(snapshotStack) })
}

export const useEditorStore = create<EditorState>((set) => ({
  source: snapshotStack.current,
  ...historyOf(snapshotStack),
  commitTypedSource: (source) => {
    snapshotStack.commit(source, { coalesce: true })
    set({ source, ...historyOf(snapshotStack) })
  },
  commitEdit: (source) => {
    snapshotStack.commit(source)
    set({ source, ...historyOf(snapshotStack) })
  },
  undo: () => {
    const previous = snapshotStack.undo()
    if (previous === null) return
    set({ source: previous, ...historyOf(snapshotStack) })
  },
  redo: () => {
    const next = snapshotStack.redo()
    if (next === null) return
    set({ source: next, ...historyOf(snapshotStack) })
  },
}))
