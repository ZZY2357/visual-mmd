import { create } from 'zustand'
import { DEFAULT_DIAGRAM_SOURCE } from '../lib/storage'
import {
  bootstrapLibrary,
  createDiagramId,
  type StoredLibrary,
  type StoredLibraryDiagram,
} from '../lib/library-storage'
import { SnapshotStack } from '../lib/pipeline/snapshot-stack'
import { applyEdit } from '../lib/pipeline/pipeline'
import { applySetTheme, isMermaidTheme } from '../lib/pipeline/frontmatter'
import type { EditIntent } from '../lib/pipeline/parser'
import type { InlineEditTarget } from '../lib/editing/inline-edit'
import { detectDiagramType, DIAGRAM_TYPES, type DiagramTypeId } from '../lib/diagram-registry'
import { DIAGRAM_SELECTION, type Selection } from '../lib/projection/flowchart-projection'

/**
 * 编辑器状态：源码是唯一真相源（ADR-0008）。
 * 画布渲染与投影派生都只从 source 出发。
 *
 * 图表库（工单 09）：store 持有多张图表与活跃图表 id（索引）。
 * commit* 只改活跃图表的 source；切换图表（openDiagram/newDiagram/deleteDiagram）
 * 时快照栈 reset、选中状态清空，编辑器完整换装无残留。
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

/** 画布内联命名请求（工单 06，nonce 语义同 gotoLine）：结构树键盘添加节点后，
 * 画布侧消费该请求，在原位浮出命名输入框（use-canvas-inline-edit 的 beginEdit） */
export interface InlineEditRequest {
  target: InlineEditTarget
  nonce: number
}

interface EditorState {
  /** 图表库：全部图表 */
  diagrams: StoredLibraryDiagram[]
  /** 活跃图表 id（索引）；库为空时为 null */
  activeId: string | null
  /** 活跃图表的 Mermaid 源码（库为空时为 ''） */
  source: string
  canUndo: boolean
  canRedo: boolean
  /** 当前选中的结构树元素（表单与画布共享） */
  selection: Selection | null
  /** 错误行跳转请求（代码面板滚动并高亮） */
  gotoLine: GotoLineRequest | null
  /** 内联命名请求（结构树键盘添加节点 → 画布浮出命名输入框，工单 06） */
  pendingInlineEdit: InlineEditRequest | null
  /** 代码面板连续输入：按输入会话合并为一个快照 */
  commitTypedSource: (source: string) => void
  /** 表单/画布等离散编辑：独立快照 */
  commitEdit: (source: string) => void
  /** 表单意图入口：经管线手术式落码，独立快照；意图不可应用时返回 false */
  commitIntent: (intent: EditIntent) => boolean
  select: (selection: Selection | null) => void
  requestGotoLine: (line: number) => void
  requestInlineEdit: (target: InlineEditTarget) => void
  undo: () => void
  redo: () => void
  // ---- 图表库操作（工单 09）----
  /** 新建指定类型的图表（按模板起步）并切换为活跃图表 */
  newDiagram: (typeId: DiagramTypeId, baseName?: string) => void
  /** 打开（切换到）另一张图表：源码、撤销栈、选中状态完整换装 */
  openDiagram: (id: string) => void
  renameDiagram: (id: string, name: string) => void
  /** 复制图表（含源码），副本切换为活跃图表 */
  duplicateDiagram: (id: string) => void
  /** 删除图表；删除活跃图表时切换到剩余第一张（库空则进入空状态） */
  deleteDiagram: (id: string) => void
  /** （测试与启动用）用给定图表库整体替换当前库并切换到活跃图表 */
  replaceLibrary: (library: StoredLibrary) => void
}

function snapshotStackOf(): SnapshotStack {
  return new SnapshotStack('', { coalesceMs: TYPE_SESSION_COALESCE_MS })
}

const snapshotStack = snapshotStackOf()

function historyOf(stack: SnapshotStack): Pick<EditorState, 'canUndo' | 'canRedo'> {
  return { canUndo: stack.canUndo, canRedo: stack.canRedo }
}

let gotoLineNonce = 0
let inlineEditNonce = 0
let idCounter = 0

function nextId(): string {
  // createDiagramId 已含时间戳与随机数；再拼计数器保证同毫秒内不重复
  return `${createDiagramId()}-${++idCounter}`
}

/** 让 baseName 在当前库内唯一（如「流程图」→「流程图 2」） */
function uniqueName(name: string, diagrams: StoredLibraryDiagram[]): string {
  const taken = new Set(diagrams.map((d) => d.name))
  if (!taken.has(name)) return name
  for (let i = 2; ; i++) {
    const candidate = `${name} ${i}`
    if (!taken.has(candidate)) return candidate
  }
}

/** 启动引导：读图表库（含旧版单图迁移），空库时以默认模板建一张起步图表 */
export function bootstrapEditorLibrary(storage: Storage = localStorage): void {
  let library = bootstrapLibrary(storage)
  if (library.diagrams.length === 0) {
    library = {
      diagrams: [{ id: nextId(), name: '未命名图表', source: DEFAULT_DIAGRAM_SOURCE, savedAt: 0 }],
      activeId: null,
    }
  }
  const activeId = library.activeId ?? library.diagrams[0].id
  const active = library.diagrams.find((d) => d.id === activeId) ?? library.diagrams[0]
  snapshotStack.reset(active.source)
  useEditorStore.setState({
    diagrams: library.diagrams,
    activeId: active.id,
    source: active.source,
    selection: DIAGRAM_SELECTION,
    gotoLine: null,
    ...historyOf(snapshotStack),
  })
}

function activeDiagramOf(state: { diagrams: StoredLibraryDiagram[]; activeId: string | null }): StoredLibraryDiagram | null {
  if (state.activeId === null) return null
  return state.diagrams.find((d) => d.id === state.activeId) ?? null
}

/** 用新的活跃源码更新库中活跃图表（commit* 共用） */
function withActiveSource(state: EditorState, source: string): StoredLibraryDiagram[] {
  const active = activeDiagramOf(state)
  if (active === null) return state.diagrams
  return state.diagrams.map((d) => (d.id === active.id ? { ...d, source, savedAt: Date.now() } : d))
}

/** 切换活跃图表：快照栈重置 + 选中状态清空（编辑器完整换装） */
function switchTo(diagram: StoredLibraryDiagram | null): Partial<EditorState> {
  snapshotStack.reset(diagram?.source ?? '')
  return {
    source: diagram?.source ?? '',
    selection: DIAGRAM_SELECTION,
    gotoLine: null,
    pendingInlineEdit: null,
    ...historyOf(snapshotStack),
  }
}

export const useEditorStore = create<EditorState>((set, get) => ({
  diagrams: [],
  activeId: null,
  source: snapshotStack.current,
  ...historyOf(snapshotStack),
  selection: DIAGRAM_SELECTION,
  gotoLine: null,
  pendingInlineEdit: null,
  commitTypedSource: (source) => {
    const state = get()
    snapshotStack.commit(source, { coalesce: true })
    set({ source, diagrams: withActiveSource(state, source), ...historyOf(snapshotStack) })
  },
  commitEdit: (source) => {
    const state = get()
    snapshotStack.commit(source)
    set({ source, diagrams: withActiveSource(state, source), ...historyOf(snapshotStack) })
  },
  commitIntent: (intent) => {
    const state = get()
    const current = state.source
    // 主题是图种无关的 frontmatter 编辑（工单 01）：不经图种解析器，
    // 直接手术式落码；源码有语法错误时也可用（不依赖解析成功）。
    // theme: null = 「跟随 Mermaid 默认」，清除主题键（连带清掉悬空的 config/frontmatter）
    if (intent.type === 'set-theme') {
      const theme = intent.theme
      if (theme !== null && (typeof theme !== 'string' || !isMermaidTheme(theme))) return false
      const next = applySetTheme(current, theme)
      snapshotStack.commit(next)
      set({ source: next, diagrams: withActiveSource(state, next), ...historyOf(snapshotStack) })
      return true
    }
    const result = applyEdit(current, detectDiagramType(current).parser, intent)
    if (!result.ok) return false
    snapshotStack.commit(result.source)
    set({ source: result.source, diagrams: withActiveSource(state, result.source), ...historyOf(snapshotStack) })
    return true
  },
  select: (selection) => set({ selection }),
  requestGotoLine: (line) => set({ gotoLine: { line, nonce: ++gotoLineNonce } }),
  requestInlineEdit: (target) => set({ pendingInlineEdit: { target, nonce: ++inlineEditNonce } }),
  undo: () => {
    const previous = snapshotStack.undo()
    if (previous === null) return
    set({ source: previous, diagrams: withActiveSource(get(), previous), ...historyOf(snapshotStack) })
  },
  redo: () => {
    const next = snapshotStack.redo()
    if (next === null) return
    set({ source: next, diagrams: withActiveSource(get(), next), ...historyOf(snapshotStack) })
  },
  newDiagram: (typeId, baseName) => {
    const state = get()
    const diagram: StoredLibraryDiagram = {
      id: nextId(),
      name: uniqueName(baseName ?? '未命名图表', state.diagrams),
      source: DIAGRAM_TYPES[typeId].template,
      savedAt: Date.now(),
    }
    set({ diagrams: [...state.diagrams, diagram], activeId: diagram.id, ...switchTo(diagram) })
  },
  openDiagram: (id) => {
    const state = get()
    if (id === state.activeId) return
    const diagram = state.diagrams.find((d) => d.id === id)
    if (diagram === undefined) return
    set({ activeId: diagram.id, ...switchTo(diagram) })
  },
  renameDiagram: (id, name) => {
    const trimmed = name.trim()
    if (trimmed === '') return
    set({
      diagrams: get().diagrams.map((d) => (d.id === id ? { ...d, name: trimmed } : d)),
    })
  },
  duplicateDiagram: (id) => {
    const state = get()
    const origin = state.diagrams.find((d) => d.id === id)
    if (origin === undefined) return
    const copy: StoredLibraryDiagram = {
      id: nextId(),
      name: uniqueName(`${origin.name} 副本`, state.diagrams),
      source: origin.source,
      savedAt: Date.now(),
    }
    set({ diagrams: [...state.diagrams, copy], activeId: copy.id, ...switchTo(copy) })
  },
  deleteDiagram: (id) => {
    const state = get()
    const remaining = state.diagrams.filter((d) => d.id !== id)
    if (remaining.length === state.diagrams.length) return
    if (id !== state.activeId) {
      set({ diagrams: remaining })
      return
    }
    const nextActive = remaining[0] ?? null
    set({ diagrams: remaining, activeId: nextActive?.id ?? null, ...switchTo(nextActive) })
  },
  replaceLibrary: (library) => {
    const activeId = library.activeId ?? library.diagrams[0]?.id ?? null
    const active = library.diagrams.find((d) => d.id === activeId) ?? null
    set({ diagrams: library.diagrams, activeId: active?.id ?? null, ...switchTo(active) })
  },
}))

/** 兼容别名：以新源码替换当前图表并清空历史（旧测试与既有调用使用） */
export function resetEditorHistory(source: string): void {
  snapshotStack.reset(source)
  useEditorStore.setState({ source, selection: DIAGRAM_SELECTION, gotoLine: null, ...historyOf(snapshotStack) })
}

/** 旧入口：以指定类型模板替换当前活跃图表（工单 04 行为，保留给既有测试） */
export function newDiagramLegacy(typeId: DiagramTypeId): void {
  resetEditorHistory(DIAGRAM_TYPES[typeId].template)
}

// 模块加载时即完成图表库引导（首帧就能恢复最近打开的图表）
bootstrapEditorLibrary()
