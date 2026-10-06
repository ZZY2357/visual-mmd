import { create } from 'zustand'
import { copyDiagramName, unnamedDiagramName } from '../i18n/domain-strings'
import { DEFAULT_DIAGRAM_SOURCE } from '../lib/storage'
import {
  bootstrapLibrary,
  createDiagramId,
  defaultStorage,
  isStorageAvailable,
  type SaveLibraryFailure,
  type StoredLibrary,
  type StoredLibraryDiagram,
} from '../lib/library-storage'
import { SnapshotStack } from '../lib/pipeline/snapshot-stack'
import { nextFreeName } from '../lib/pipeline/element-id'
import { applyEdit } from '../lib/pipeline/pipeline'
import { applySetTheme, isMermaidTheme } from '../lib/pipeline/frontmatter'
import type { EditIntent } from '../lib/pipeline/parser'
import type { InlineEditTarget } from '../lib/editing/inline-edit'
import {
  detectDiagramType,
  DIAGRAM_TYPES,
  type RegisteredDiagramTypeId,
} from '../lib/diagram-registry'
import { DIAGRAM_SELECTION, sameSelection, type Selection } from '../lib/projection/flowchart-projection'
import type { RemoteDiagramChange } from '../lib/cross-tab'

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

/** 撤销/重做快照的载荷：源码 + 当时的选中（工单 12）。
 * 连线身份是位置序（ADR-0012），模型还原后按序数找回的选中可能漂到别的连线；
 * 快照携带选中即可把选中随模型一并还原。 */
interface EditorSnapshot {
  source: string
  selection: Selection | null
}

function sameSnapshot(a: EditorSnapshot, b: EditorSnapshot): boolean {
  if (a.source !== b.source) return false
  if (a.selection === null || b.selection === null) return a.selection === b.selection
  return sameSelection(a.selection, b.selection)
}

/**
 * 编辑来源（工单 09）：用于区分「代码面板正在进行的输入」与「表单/画布的外部写回」。
 * 只有 form / canvas 两类外部写回会在代码面板存在未完成输入时被挂起。
 * 显式类型参数（带默认值）而非启发式推断——调用点无法全部改造时默认值即代表
 * 「该函数的主要来源」，行为只依赖「是否为 form/canvas」，不依赖具体标签。
 */
export type CommitOrigin = 'code-panel' | 'form' | 'canvas' | 'system'

/** 会被挂起的外部写回来源 */
type SuspendableOrigin = Extract<CommitOrigin, 'form' | 'canvas'>

/** 被挂起的外部写回（工单 09）。
 *
 * 保留策略：**只保留最新一条**（覆盖旧的），不做队列。理由：挂起期间用户仍在打字，
 * 挂起提示立即可见；同一会话里连续的多个外部写回若排队，会在用户「接受」时把一串
 * 中间态逐个重放，语义混乱且几乎必然互相冲突。最新一条才是用户此刻要面对的外部意图；
 * 更早的写回本就基于已被后续写回取代的源码，丢弃它们不丢失「最终外部状态」。
 *
 * `source` 是挂起当时对**当时源码**预应用的结果；「接受」即以此替换本页源码——
 * 用户明确选择接受外部变更，因此本页其后继续输入的内容被外部版本取代是预期语义
 * （若想保住自己的输入，应选择「放弃外部变更」）。 */
export interface PendingWriteback {
  /** 预应用后的源码（接受后成为活跃图表源码） */
  source: string
  /** 来源（表单 / 画布） */
  origin: SuspendableOrigin
}

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
  /**
   * 存储降级状态（工单 07）：
   * - 'quota'：写入失败（空间满等）——「保存失败」提示可重试，成功保存后自动清除
   * - 'unavailable'：localStorage 整体不可用（隐私模式）——**一次性**明示，此后不再重复
   * - null：正常
   */
  storageIssue: SaveLibraryFailure | null
  /** 存储整体不可用是否已明示过（一次性；即便用户关闭提示也不再重复，工单 07） */
  storageUnavailableNotified: boolean
  /** 记录一次保存结果：失败置位对应状态（unavailable 一次性，已提示则不重复置位） */
  reportSaveResult: (result: { ok: true } | { ok: false; reason: SaveLibraryFailure }) => void
  /** 手动消除提示（quota 提示可关闭；unavailable 已在启动时明示） */
  dismissStorageIssue: () => void
  /**
   * 跨标签页修改提示（工单 11）：他页改动了**本页当前活跃图表**时暂存的待处理变更；
   * null = 无提示。用户「载入最新」或关闭后清除。
   */
  crossTabChange: RemoteDiagramChange | null
  /**
   * 本页是否有未完成输入（工单 09）：代码面板存在**未提交的输入会话**——
   * 即 commitTypedSource 已被调用（按 TYPE_SESSION_COALESCE_MS 会话合并），
   * 且该会话尚未被失焦（markInputFinished）关闭。为 true 时表单/画布的外部
   * 写回会被挂起（pendingWriteback）而非静默覆盖。
   * 工单 11 的跨页「载入最新」也读此字段（接缝 UnfinishedInputProbe 现已有真实实现）。
   */
  hasUnfinishedInput: boolean
  /**
   * 被挂起的外部写回（工单 09）：代码面板打字中，表单/画布写回暂存于此；
   * null = 无。用户「接受外部变更」应用之，「放弃外部变更」丢弃之（LWW：本页源码获胜）。
   */
  pendingWriteback: PendingWriteback | null
  /** 代码面板输入会话状态变化（聚焦/打字置 true；失焦置 false 并结算挂起写回） */
  setUnfinishedInput: (active: boolean) => void
  /** 代码面板失焦/显式提交：关闭输入会话；若有挂起写回则按当前选择结算 */
  markInputFinished: () => void
  /** 接受挂起的外部写回：以外部源码替换本页（可撤销），清空挂起与未完成输入 */
  acceptPendingWriteback: () => void
  /** 放弃挂起的外部写回：丢弃外部变更，本页源码获胜（LWW），清空挂起 */
  discardPendingWriteback: () => void
  /** 记录他页对本页活跃图表的修改（弹出提示） */
  noteCrossTabChange: (change: RemoteDiagramChange) => void
  /** 关闭跨页提示（不载入） */
  dismissCrossTabChange: () => void
  /** 载入他页最新：以他页源码替换本页活跃图表（可撤销），并清除提示 */
  loadCrossTabChange: () => void
  /** 代码面板连续输入：按输入会话合并为一个快照，并置位未完成输入（工单 09） */
  commitTypedSource: (source: string) => void
  /** 表单/画布等离散编辑：独立快照；来源为 form/canvas 且代码面板有未完成输入时被挂起 */
  commitEdit: (source: string, origin?: CommitOrigin) => void
  /** 表单意图入口：经管线手术式落码，独立快照；意图不可应用时返回 false */
  commitIntent: (intent: EditIntent, origin?: CommitOrigin) => boolean
  /** 多意图原子提交（同一动作的意图序列，如 Tab 添加节点 = 加节点 + 加边）：
   * 全部落码成功才产生**一个**撤销快照；任一失败则整体不提交并返回 false。
   * 单意图动作的中间态不应暴露给撤销栈（browser-findings 2026-10-02 #1）。 */
  commitIntents: (intents: EditIntent[], origin?: CommitOrigin) => boolean
  select: (selection: Selection | null) => void
  requestGotoLine: (line: number) => void
  requestInlineEdit: (target: InlineEditTarget) => void
  undo: () => void
  redo: () => void
  // ---- 图表库操作（工单 09）----
  /** 新建指定类型的图表（按模板起步）并切换为活跃图表（typeId 须是已注册图种） */
  newDiagram: (typeId: RegisteredDiagramTypeId, baseName?: string) => void
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

function snapshotStackOf(): SnapshotStack<EditorSnapshot> {
  return new SnapshotStack<EditorSnapshot>(
    { source: '', selection: null },
    { coalesceMs: TYPE_SESSION_COALESCE_MS, equals: sameSnapshot },
  )
}

const snapshotStack = snapshotStackOf()

function historyOf(stack: SnapshotStack<EditorSnapshot>): Pick<EditorState, 'canUndo' | 'canRedo'> {
  return { canUndo: stack.canUndo, canRedo: stack.canRedo }
}

let gotoLineNonce = 0
let inlineEditNonce = 0
let idCounter = 0

function nextId(): string {
  // createDiagramId 已含时间戳与随机数；再拼计数器保证同毫秒内不重复
  return `${createDiagramId()}-${++idCounter}`
}

/** 让 baseName 在当前库内唯一（如「流程图」→「流程图 2」）。
 * 编号口径收在 pipeline 的 nextFreeName（architecture-deepening-2 工单 04）：
 * 条目名是可引用名（referential 缺省），分隔符为空格。 */
function uniqueName(name: string, diagrams: StoredLibraryDiagram[]): string {
  return nextFreeName(name, diagrams.map((d) => d.name), { separator: ' ' })
}

/** 启动引导：读图表库（含旧版单图迁移），空库时以默认模板建一张起步图表 */
export function bootstrapEditorLibrary(storage: Storage | null = defaultStorage()): void {
  let library = bootstrapLibrary(storage)
  if (library.diagrams.length === 0) {
    library = {
      diagrams: [{ id: nextId(), name: unnamedDiagramName(), source: DEFAULT_DIAGRAM_SOURCE, savedAt: 0 }],
      activeId: null,
    }
  }
  const activeId = library.activeId ?? library.diagrams[0].id
  const active = library.diagrams.find((d) => d.id === activeId) ?? library.diagrams[0]
  snapshotStack.reset({ source: active.source, selection: DIAGRAM_SELECTION })
  // 隐私模式等存储整体不可用：启动即一次性明示（工单 07），此后不再重复
  const storageAvailable = isStorageAvailable(storage)
  useEditorStore.setState({
    diagrams: library.diagrams,
    activeId: active.id,
    source: active.source,
    selection: DIAGRAM_SELECTION,
    gotoLine: null,
    storageIssue: storageAvailable ? null : 'unavailable',
    storageUnavailableNotified: !storageAvailable,
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

/** 单个意图落到当前源码：可应用返回新源码，不可应用返回 null（不产生副作用）。
 * 主题是图种无关的 frontmatter 编辑（工单 01）：不经图种解析器，直接手术式落码；
 * 源码有语法错误时也可用（不依赖解析成功）。theme: null = 「跟随 Mermaid 默认」。
 * 其余意图：源码不属于任何已注册图种（unsupported 态，more-diagrams 工单 01）时
 * 没有解析器可落码：拒绝意图而不是喂给 flowchart 误解析。 */
function applyIntentToSource(source: string, intent: EditIntent): string | null {
  if (intent.type === 'set-theme') {
    const theme = intent.theme
    if (theme !== null && (typeof theme !== 'string' || !isMermaidTheme(theme))) return null
    return applySetTheme(source, theme)
  }
  const registration = detectDiagramType(source)
  if (registration === null) return null
  const result = applyEdit(source, registration.parser, intent)
  return result.ok ? result.source : null
}

/** 外部写回是否应被挂起（工单 09）：来源为 form/canvas，且代码面板有未完成输入
 * **或**已有待用户处置的挂起写回（未完成输入已结束但用户尚未接受/放弃时，后续外部
 * 写回并入同一条挂起，绝不在用户选择前静默应用）。
 * code-panel（代码面板自身输入）与 system（导入/恢复等显式动作）永不挂起。 */
function shouldSuspend(state: EditorState, origin: CommitOrigin): boolean {
  if (origin !== 'form' && origin !== 'canvas') return false
  return state.hasUnfinishedInput || state.pendingWriteback !== null
}

/** 切换活跃图表：快照栈重置 + 选中状态清空（编辑器完整换装）。
 * 挂起的外部写回与未完成输入同属「上一张图表的编辑会话」，一并清空（工单 09）：
 * 换装后新图表不应继承旧图表的打字态或待处理写回。 */
function switchTo(diagram: StoredLibraryDiagram | null): Partial<EditorState> {
  snapshotStack.reset({ source: diagram?.source ?? '', selection: DIAGRAM_SELECTION })
  return {
    source: diagram?.source ?? '',
    selection: DIAGRAM_SELECTION,
    gotoLine: null,
    pendingInlineEdit: null,
    pendingWriteback: null,
    hasUnfinishedInput: false,
    ...historyOf(snapshotStack),
  }
}

export const useEditorStore = create<EditorState>((set, get) => ({
  diagrams: [],
  activeId: null,
  source: snapshotStack.current.source,
  ...historyOf(snapshotStack),
  selection: DIAGRAM_SELECTION,
  gotoLine: null,
  pendingInlineEdit: null,
  storageIssue: null,
  storageUnavailableNotified: false,
  crossTabChange: null,
  hasUnfinishedInput: false,
  pendingWriteback: null,
  setUnfinishedInput: (active) => {
    // 未完成输入仅置位/清位；清位不自动结算挂起写回——结算走 markInputFinished /
    // accept / discard，避免「先清位后结算」的中间态丢失外部变更。
    if (get().hasUnfinishedInput !== active) set({ hasUnfinishedInput: active })
  },
  markInputFinished: () => {
    // 输入会话结束（失焦/显式提交）：关掉未完成输入标记。
    // 挂起的写回**不在此自动应用**——由用户在提示里显式选择接受/放弃（本票要求可见选择）。
    set({ hasUnfinishedInput: false })
  },
  acceptPendingWriteback: () => {
    const state = get()
    const pending = state.pendingWriteback
    if (pending === null) {
      set({ hasUnfinishedInput: false })
      return
    }
    // 接受 = 一次可撤销的编辑（独立快照），随后清空挂起与打字态
    snapshotStack.commit({ source: pending.source, selection: state.selection })
    set({
      source: pending.source,
      diagrams: withActiveSource(state, pending.source),
      pendingWriteback: null,
      hasUnfinishedInput: false,
      ...historyOf(snapshotStack),
    })
  },
  discardPendingWriteback: () => {
    // 放弃 = 丢弃外部变更，本页源码保持不动（LWW：本页获胜，下次保存覆盖对方）
    set({ pendingWriteback: null, hasUnfinishedInput: false })
  },
  noteCrossTabChange: (change) => set({ crossTabChange: change }),
  dismissCrossTabChange: () => set({ crossTabChange: null }),
  loadCrossTabChange: () => {
    const state = get()
    const change = state.crossTabChange
    // 提示对应的图表已不是当前活跃图表（期间用户切了图）：丢弃，不误改
    if (change === null || change.diagramId !== state.activeId) {
      set({ crossTabChange: null })
      return
    }
    // 载入他页源码 = 一次可撤销的编辑（独立快照），随后清除提示
    snapshotStack.commit({ source: change.source, selection: state.selection })
    set({
      source: change.source,
      diagrams: withActiveSource(state, change.source),
      crossTabChange: null,
      ...historyOf(snapshotStack),
    })
  },
  reportSaveResult: (result) => {
    if (result.ok) {
      // 写入恢复正常：清除 quota 提示（unavailable 属启动一次性明示，不在此清除）
      if (get().storageIssue === 'quota') set({ storageIssue: null })
      return
    }
    if (result.reason === 'unavailable') {
      // unavailable 只明示一次：已提示过（哪怕用户已关闭）则不再重复置位
      if (get().storageUnavailableNotified) return
      set({ storageIssue: 'unavailable', storageUnavailableNotified: true })
      return
    }
    set({ storageIssue: result.reason })
  },
  dismissStorageIssue: () => set({ storageIssue: null }),
  commitTypedSource: (source) => {
    const state = get()
    snapshotStack.commit({ source, selection: state.selection }, { coalesce: true })
    // 打字即代表输入会话进行中（工单 09）：置位后表单/画布写回被挂起
    set({ source, diagrams: withActiveSource(state, source), hasUnfinishedInput: true, ...historyOf(snapshotStack) })
  },
  commitEdit: (source, origin = 'system') => {
    const state = get()
    if (shouldSuspend(state, origin)) {
      set({ pendingWriteback: { source, origin: origin as SuspendableOrigin } })
      return
    }
    snapshotStack.commit({ source, selection: state.selection })
    // system 级显式替换（如导入整份源码）是「推倒重来」：丢弃此前挂起的外部写回，
    // 避免接受时用旧图表的外部版本覆盖刚导入的内容。
    set({
      source,
      diagrams: withActiveSource(state, source),
      ...(origin === 'system' ? { pendingWriteback: null, hasUnfinishedInput: false } : null),
      ...historyOf(snapshotStack),
    })
  },
  commitIntent: (intent, origin = 'form') => {
    const state = get()
    // 已有挂起写回时，新意图基于**挂起源码**继续累积，使「最新一条」包含此前的外部变更
    const base = state.pendingWriteback?.source ?? state.source
    const next = applyIntentToSource(base, intent)
    if (next === null) return false
    if (shouldSuspend(state, origin)) {
      set({ pendingWriteback: { source: next, origin: origin as SuspendableOrigin } })
      return true
    }
    snapshotStack.commit({ source: next, selection: state.selection })
    set({ source: next, diagrams: withActiveSource(state, next), ...historyOf(snapshotStack) })
    return true
  },
  commitIntents: (intents, origin = 'form') => {
    const state = get()
    let source = state.pendingWriteback?.source ?? state.source
    for (const intent of intents) {
      const next = applyIntentToSource(source, intent)
      if (next === null) return false
      source = next
    }
    if (shouldSuspend(state, origin)) {
      set({ pendingWriteback: { source, origin: origin as SuspendableOrigin } })
      return true
    }
    snapshotStack.commit({ source, selection: state.selection })
    set({ source, diagrams: withActiveSource(state, source), ...historyOf(snapshotStack) })
    return true
  },
  select: (selection) => {
    // 选中变化本身不是编辑（不产生撤销步骤），但要同步进当前快照，
    // 这样下一次编辑压入历史的是「操作前的选中」，undo 才能回到它（工单 12）。
    snapshotStack.amend({ source: get().source, selection })
    set({ selection })
  },
  requestGotoLine: (line) => set({ gotoLine: { line, nonce: ++gotoLineNonce } }),
  requestInlineEdit: (target) => set({ pendingInlineEdit: { target, nonce: ++inlineEditNonce } }),
  undo: () => {
    const previous = snapshotStack.undo()
    if (previous === null) return
    set({
      source: previous.source,
      selection: previous.selection,
      diagrams: withActiveSource(get(), previous.source),
      ...historyOf(snapshotStack),
    })
  },
  redo: () => {
    const next = snapshotStack.redo()
    if (next === null) return
    set({
      source: next.source,
      selection: next.selection,
      diagrams: withActiveSource(get(), next.source),
      ...historyOf(snapshotStack),
    })
  },
  newDiagram: (typeId, baseName) => {
    const state = get()
    const diagram: StoredLibraryDiagram = {
      id: nextId(),
      name: uniqueName(baseName ?? unnamedDiagramName(), state.diagrams),
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
      name: uniqueName(copyDiagramName(origin.name), state.diagrams),
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

/** 兼容别名：以新源码替换当前图表并清空历史（旧测试与既有调用使用）。
 * 同时清空挂起写回与未完成输入（工单 09 的清空语义，与 switchTo 一致）。 */
export function resetEditorHistory(source: string): void {
  snapshotStack.reset({ source, selection: DIAGRAM_SELECTION })
  useEditorStore.setState({
    source,
    selection: DIAGRAM_SELECTION,
    gotoLine: null,
    pendingWriteback: null,
    hasUnfinishedInput: false,
    ...historyOf(snapshotStack),
  })
}

/** 旧入口：以指定类型模板替换当前活跃图表（工单 04 行为，保留给既有测试） */
export function newDiagramLegacy(typeId: RegisteredDiagramTypeId): void {
  resetEditorHistory(DIAGRAM_TYPES[typeId].template)
}

// 模块加载时即完成图表库引导（首帧就能恢复最近打开的图表）
bootstrapEditorLibrary()
