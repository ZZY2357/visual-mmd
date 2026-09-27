import { create } from 'zustand'
import { DEFAULT_DIAGRAM_SOURCE, loadDiagram } from '../lib/storage'
import { SnapshotStack } from '../lib/pipeline/snapshot-stack'
import { applyEdit } from '../lib/pipeline/pipeline'
import type { EditIntent } from '../lib/pipeline/parser'
import { detectDiagramType, DIAGRAM_TYPES, type DiagramTypeId } from '../lib/diagram-registry'
import { DIAGRAM_SELECTION, type Selection } from '../lib/projection/flowchart-projection'

/**
 * 编辑器状态：源码是唯一真相源（ADR-0008）。
 * 画布渲染与投影派生都只从 source 出发。
 *
 * 撤销/重做 = 代码快照单栈（ADR-0008 派生决策）：
 * - 表单/画布等离散编辑（commitEdit / commitIntent）产生独立快照
 * - 代码面板连续输入（commitTypedSource）按输入会话合并为一个快照
 */

/** 输入会话合并窗口：连续输入间隔小于该值时合并为同一撤销步骤 */
const TYPE_SESSION_COALESCE_MS = 1000

/** 错误行跳转请求（nonce 区分同一行的重复跳转） */
export interface GotoLineRequest {
  line: number
  nonce: number
}

interface EditorState {
  /** 当前图表的 Mermaid 源码 */
  source: string
  canUndo: boolean
  canRedo: boolean
  /** 当前选中的结构树元素（表单与画布共享） */
  selection: Selection | null
  /** 错误行跳转请求（代码面板滚动并高亮） */
  gotoLine: GotoLineRequest | null
  /** 代码面板连续输入：按输入会话合并为一个快照 */
  commitTypedSource: (source: string) => void
  /** 表单/画布等离散编辑：独立快照 */
  commitEdit: (source: string) => void
  /** 表单意图入口：经管线手术式落码，独立快照；意图不可应用时返回 false */
  commitIntent: (intent: EditIntent) => boolean
  select: (selection: Selection | null) => void
  requestGotoLine: (line: number) => void
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

let gotoLineNonce = 0

/** 以新源码替换当前图表并清空历史（未来"从图表库打开另一张图"时使用） */
export function resetEditorHistory(source: string): void {
  snapshotStack.reset(source)
  useEditorStore.setState({
    source,
    selection: DIAGRAM_SELECTION,
    gotoLine: null,
    ...historyOf(snapshotStack),
  })
}

/** 新建指定类型的图表：套用该类型的模板并清空历史（图种注册表，工单 06） */
export function newDiagram(typeId: DiagramTypeId): void {
  resetEditorHistory(DIAGRAM_TYPES[typeId].template)
}

export const useEditorStore = create<EditorState>((set) => ({
  source: snapshotStack.current,
  ...historyOf(snapshotStack),
  selection: DIAGRAM_SELECTION,
  gotoLine: null,
  commitTypedSource: (source) => {
    snapshotStack.commit(source, { coalesce: true })
    set({ source, ...historyOf(snapshotStack) })
  },
  commitEdit: (source) => {
    snapshotStack.commit(source)
    set({ source, ...historyOf(snapshotStack) })
  },
  commitIntent: (intent) => {
    const current = useEditorStore.getState().source
    const result = applyEdit(current, detectDiagramType(current).parser, intent)
    if (!result.ok) return false
    snapshotStack.commit(result.source)
    set({ source: result.source, ...historyOf(snapshotStack) })
    return true
  },
  select: (selection) => set({ selection }),
  requestGotoLine: (line) => set({ gotoLine: { line, nonce: ++gotoLineNonce } }),
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
