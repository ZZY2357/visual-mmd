import type { ClassIntent } from '../pipeline/class'
import type { ErIntent } from '../pipeline/er'
import type { FlowchartIntent } from '../pipeline/flowchart'
import { nodeElementId } from '../pipeline/flowchart'
import {
  kanbanCardElementId,
  kanbanColumnElementId,
  mindmapNodeElementId,
  nextFreeName,
} from '../pipeline/element-id'
import { isValidGitgraphBranchName } from '../pipeline/gitgraph'
import type { KanbanIntent } from '../pipeline/kanban'
import type { MindmapIntent } from '../pipeline/mindmap'
import type { EditIntent } from '../pipeline/parser'
import type { SequenceIntent } from '../pipeline/sequence'
import type { StateIntent } from '../pipeline/state'
import type { GitgraphIntent } from '../pipeline/gitgraph'
import type { RequirementIntent } from '../pipeline/requirement'
import type { GitgraphProjection } from '../projection/gitgraph-projection'
import type { TimelineIntent } from '../pipeline/timeline'
import type { JourneyIntent } from '../pipeline/journey'
import type { PieIntent } from '../pipeline/pie'
import type { ClassProjection } from '../projection/class-projection'
import type { ErProjection } from '../projection/er-projection'
import type { RequirementProjection } from '../projection/requirement-projection'
import type { FlowchartProjection } from '../projection/flowchart-projection'
import type { KanbanProjection } from '../projection/kanban-projection'
import type { MindmapProjection } from '../projection/mindmap-projection'
import type { SequenceProjection } from '../projection/sequence-projection'
import type { StateProjection } from '../projection/state-projection'
import type { TimelineProjection } from '../projection/timeline-projection'
import type { JourneyProjection } from '../projection/journey-projection'
import type { PieProjection } from '../projection/pie-projection'
import type { Selection } from '../projection/selection'
import type { CanvasInlineEditTarget, Rect } from './inline-edit'

/**
 * 画布键盘的纯逻辑（工单 05 编辑动作 / 工单 14 方向键方位导航）：
 * 键位 → 动作、动作 → 编辑意图序列。
 * 落码经管线 applyEdit / commitIntent（编辑意图 + ADR-0008 手术式改写），快照入栈可撤销。
 *
 * 方向键 = **方位导航**（ADR-0011 与工单 14）：以选中节点的可视范围中心为锚点，
 * 在该按键所指方向的 45° 锥内取最近节点，**不再承诺源码顺序或树关系**（mermaid 的
 * dagre / cose-bilkent 布局与书写顺序无关）。纯几何选点在 directional-navigation.ts，
 * DOM 测量在 canvas-measure.ts，接线在 use-canvas-keyboard.ts；本模块只保留键位判定与
 * 编辑动作的纯逻辑。
 *
 * 编辑键（工单 05 / ADR-0013）：class / sequence 的 Tab/Enter/Delete 按「就近结构」映射
 * （class：加成员 / 加关系 / 删除；sequence：加参与者 / 加消息 / 删除），同样只在本模块
 * 产出动作与意图，表单浮层由 use-canvas-context-menu 复用（不新造浮层）。
 *
 * architecture-deepening-2 工单 02：四图种的键语义统一收敛为 KeyPlan 纯函数
 * （*KeyPlan，能力包 keyHandler 委托它们），plan 的执行收敛为唯一的 applyPlan——
 * 键盘、右键菜单、结构树三处的「循环执行 intents」共用同一份编排放策略。
 */

/** 参与画布键盘的图种投影（tagged union，keydown 时按图种分支） */
export type CanvasKeyboardProjection =
  | { kind: 'flowchart'; projection: FlowchartProjection }
  | { kind: 'mindmap'; projection: MindmapProjection }
  | { kind: 'class'; projection: ClassProjection }
  | { kind: 'sequence'; projection: SequenceProjection }
  | { kind: 'state'; projection: StateProjection }
  | { kind: 'er'; projection: ErProjection }
  | { kind: 'gitgraph'; projection: GitgraphProjection }
  | { kind: 'timeline'; projection: TimelineProjection }
  | { kind: 'kanban'; projection: KanbanProjection }
  | { kind: 'requirement'; projection: RequirementProjection }
  | { kind: 'journey'; projection: JourneyProjection }
  | { kind: 'pie'; projection: PieProjection }

export type NodeKeyAction = 'delete' | 'add-child' | 'add-sibling'

/** 键位 → 动作映射；带修饰键（Shift-Tab 等）不处理（交给原有行为） */
export function keyToNodeAction(key: string, mods: { shift?: boolean } = {}): NodeKeyAction | null {
  if (key === 'Delete' || key === 'Backspace') return 'delete'
  if (key === 'Tab') return mods.shift === true ? null : 'add-child'
  if (key === 'Enter') return mods.shift === true ? null : 'add-sibling'
  return null
}

/** 生成未冲突的新节点 id：n1、n2……跳过已有 id。
 * 编号口径收在 pipeline 的 nextFreeName（architecture-deepening-2 工单 04）：
 * 生成式 id 无引用语义，referential: false——从 1 起编号，不做 base 本身检查。 */
export function nextNodeId(existingIds: Iterable<string>): string {
  return nextFreeName('n', existingIds, { referential: false })
}

export interface NodeActionPlan {
  /** 依次经管线落码的编辑意图序列 */
  intents: FlowchartIntent[]
  /** 动作产生的新节点 id（删除为 null）；落码成功后选中之 */
  newNodeId: string | null
}

/**
 * 动作 → 意图序列（flowchart）：
 * - delete：删除节点（其出现与触及连线，由管线处理链式合并）
 * - add-child：新节点 + 选中节点 → 新节点的连线，两行都插在选中节点行后
 * - add-sibling：父节点 = 第一条指向选中节点连线的起点（childOf 推断）；
 *   无入边（根节点）时退化为 add-child
 * 选中节点已不存在于投影时返回 null（不产出意图）。
 */
export function nodeActionIntents(
  projection: FlowchartProjection,
  nodeId: string,
  action: NodeKeyAction,
): NodeActionPlan | null {
  if (!projection.nodes.some((n) => n.nodeId === nodeId)) return null
  if (action === 'delete') {
    return { intents: [{ type: 'delete-node', nodeId }], newNodeId: null }
  }

  const newId = nextNodeId(projection.nodes.map((n) => n.nodeId))
  const anchor = nodeElementId(nodeId, 1)
  const parent =
    action === 'add-child' ? nodeId : projection.edges.find((e) => e.to === nodeId)?.from ?? nodeId
  return {
    intents: [
      { type: 'add-node', nodeId: newId, text: newId, shape: 'rectangle', afterElementId: anchor },
      { type: 'add-edge', from: parent, to: newId, afterElementId: anchor },
    ],
    newNodeId: newId,
  }
}

// ---------- mindmap（工单 06）：画布/结构树键盘同 flowchart 方案 ----------

export interface MindmapActionPlan {
  /** 依次经管线落码的编辑意图序列 */
  intents: MindmapIntent[]
  /** 动作产生的新节点 elementId（删除为 null）；落码成功后选中之并进入内联命名 */
  newElementId: string | null
}

/**
 * 动作 → 意图序列（mindmap，落码按缩进层级）：
 * - delete：删除节点（连同子树，由管线处理）
 * - add-child：插入为选中节点的最后一个子节点（管线落在其子树之后）
 * - add-sibling：插入为选中节点的同级（落在其子树之后）；根节点（无父）退化为 add-child
 *
 * 新节点 elementId 可确定性预计算：投影 nodes 即文档序，`mindmap-node:N` 的 N
 * = 节点行 1 起序号；插入点在选中节点子树末尾之后，故 N = 子树末节点序号 + 2。
 * defaultText 为新节点占位文本（确认前保留，内联命名确认后改写）。
 * 选中节点已不存在于投影时返回 null（不产出意图）。
 */
export function mindmapActionIntents(
  projection: MindmapProjection,
  elementId: string,
  action: NodeKeyAction,
  defaultText: string,
): MindmapActionPlan | null {
  const index = projection.nodes.findIndex((n) => n.elementId === elementId)
  if (index === -1) return null
  if (action === 'delete') {
    return { intents: [{ type: 'delete-node', elementId }], newElementId: null }
  }

  const node = projection.nodes[index]
  // 子树末节点：后续 depth 更大的连续节点（图标行不入投影，不占序号）
  let end = index
  while (end + 1 < projection.nodes.length && projection.nodes[end + 1].depth > node.depth) end++
  const newElementId = mindmapNodeElementId(end + 2)
  if (action === 'add-child' || node.parentId === null) {
    return { intents: [{ type: 'add-child', parentElementId: elementId, text: defaultText }], newElementId }
  }
  return { intents: [{ type: 'add-sibling', elementId, text: defaultText }], newElementId }
}

// ---------- KeyPlan（architecture-deepening-2 工单 02）：键在该图种上是什么意思 ----------

/**
 * 「一个键在某图种上是什么意思」收敛为能力包上的纯函数 `keyHandler(projection): KeyPlan`
 * （键事件 → `{ intents, newElementTarget, form? } | null`），取代散落五处的映射链
 * （键盘纯函数 → hook 分支 → CanvasPanel onEditKey lambda → openFormForSelection →
 * nodeFormForTarget）。plan 的执行收敛为下方唯一的 `applyPlan`。
 */

/** 编辑键请求打开的添加表单种类：member / relation / message 落到已有表单浮层
 * （锚点/预选由右键菜单 hook 从选中推出），participant 走既有创建路径（内联命名） */
export type KeyFormKind =
  | 'member'
  | 'relation'
  | 'message'
  | 'participant'
  | 'transition'
  | 'er-relation'
  | 'requirement-relation'

/** 键事件的语义 plan：执行器（applyPlan）按字段决定提交 / 选中 / 内联编辑 / 表单 */
export interface KeyPlan {
  /** 依次经管线落码的编辑意图序列（表单类 plan 为空——提交才落码） */
  intents: EditIntent[]
  /** 全部意图落码成功后：选中新元素，且（若有）进入内联编辑（删除类 plan 无此字段；
   * 属性类新元素不做内联编辑（er 属性无双击/内联，工单 03），inlineEdit 可省略） */
  newElementTarget?: { selection: Selection; inlineEdit?: CanvasInlineEditTarget }
  /** 编辑键要求打开的添加表单（class/sequence 的 Tab/Enter 落到已有表单，不直接落码） */
  form?: KeyFormKind
  /** 落码成功后清空选中（class/sequence 的删除，与右键菜单/属性面板删除一致；
   * flowchart/mindmap 的键盘删除保留原选中，由属性面板的 resolveSelection 回落） */
  clearSelection?: boolean
}

/** 键事件的纯描述（keydown 的 key / 修饰键 / 当前选中 / mindmap 占位文本） */
export interface KeyInput {
  key: string
  mods?: { shift?: boolean }
  selection: Selection | null
  /** mindmap 新节点占位文本（确认前落码用，内联命名确认后改写） */
  newNodeText?: string
}

/** 能力包上的键位处理器：`keyHandler(projection)` 一次绑定投影，之后每个键事件纯函数求值 */
export type KeyHandler = (input: KeyInput) => KeyPlan | null

/** plan 执行器消费的语境：提交 / 选中 / 内联编辑 / 表单 / preventDefault。
 * 键盘（hook）、右键菜单（menu-actions）、结构树三处共用同一份执行策略。 */
export interface PlanExecutor {
  /** 提交编辑意图（可撤销）；false = 被拒绝，中止后续步骤（含选中与内联编辑） */
  commitIntent: (intent: EditIntent) => boolean
  /** 更新编辑器选中 */
  select: (selection: Selection | null) => void
  /** 进入内联编辑（新建元素的命名）；结构树路径经由 pendingInlineEdit 请求间接接入 */
  beginInlineEdit?: (target: CanvasInlineEditTarget) => void
  /** 打开添加表单（键盘路径 = 画布中位浮出，菜单路径 = 菜单位置浮出） */
  openForm?: (kind: KeyFormKind) => void
  /** preventDefault 的时机由 applyPlan 定义：plan 确定要处理（非 null）即调用一次 */
  preventDefault?: () => void
}

/**
 * plan 的唯一执行器（architecture-deepening-2 工单 02）：preventDefault 时机、
 * 依次提交意图（第一个失败即中止）、更新选中、进入内联编辑、清空选中、打开表单——
 * 这些编排放策略只在这一处定义。返回 false = 某个意图被拒绝（中止且未完成）。
 */
export function applyPlan(plan: KeyPlan, exec: PlanExecutor): boolean {
  exec.preventDefault?.()
  if (plan.form !== undefined) {
    exec.openForm?.(plan.form)
    return true
  }
  for (const intent of plan.intents) {
    if (!exec.commitIntent(intent)) return false
  }
  if (plan.newElementTarget !== undefined) {
    exec.select(plan.newElementTarget.selection)
    if (plan.newElementTarget.inlineEdit !== undefined) exec.beginInlineEdit?.(plan.newElementTarget.inlineEdit)
  } else if (plan.clearSelection === true) {
    exec.select(null)
  }
  return true
}

/** 键 → plan（flowchart，工单 04）：keyToNodeAction 的键位表 + nodeActionIntents 的意图映射。
 * 无选中 / 选中不是节点 / 已不在投影 → null（不 preventDefault、不落码）。 */
export function flowchartKeyPlan(projection: FlowchartProjection, input: KeyInput): KeyPlan | null {
  const action = keyToNodeAction(input.key, input.mods)
  if (action === null || input.selection === null || input.selection.kind !== 'node') return null
  const plan = nodeActionIntents(projection, input.selection.nodeId, action)
  if (plan === null) return null
  const keyPlan: KeyPlan = { intents: plan.intents }
  if (plan.newNodeId !== null) {
    keyPlan.newElementTarget = {
      selection: { kind: 'node', nodeId: plan.newNodeId },
      inlineEdit: { kind: 'flowchart', nodeId: plan.newNodeId },
    }
  }
  return keyPlan
}

/** 键 → plan（mindmap，工单 06）：键位表同 flowchart，意图映射按 mindmap 缩进层级。 */
export function mindmapKeyPlan(projection: MindmapProjection, input: KeyInput): KeyPlan | null {
  const action = keyToNodeAction(input.key, input.mods)
  if (action === null || input.selection === null || input.selection.kind !== 'mindmap-node') return null
  const plan = mindmapActionIntents(projection, input.selection.elementId, action, input.newNodeText ?? '新节点')
  if (plan === null) return null
  const keyPlan: KeyPlan = { intents: plan.intents }
  if (plan.newElementId !== null) {
    keyPlan.newElementTarget = {
      selection: { kind: 'mindmap-node', elementId: plan.newElementId },
      inlineEdit: { kind: 'mindmap', elementId: plan.newElementId },
    }
  }
  return keyPlan
}

// ---------- class / sequence 编辑键（工单 05 / ADR-0013）：就近结构映射 ----------

/** class 编辑键动作：Tab = 加成员、Enter = 加关系、Delete = 删除选中元素 */
type ClassKeyAction = 'delete' | 'add-member' | 'add-relation'

/** sequence 编辑键动作：Tab = 加参与者、Enter = 加消息、Delete = 删除选中元素 */
type SequenceKeyAction = 'delete' | 'add-participant' | 'add-message'

/**
 * 键位 → 动作（class）。这是**就近类比**而非严格语义：class 是有向图，没有 flowchart
 * 的"子/同级"，当前元素附近最近的结构是成员（Tab）与关系（Enter）。带修饰键（Shift-Tab
 * 等）不处理，交给原有行为。
 */
function classKeyAction(key: string, mods: { shift?: boolean } = {}): ClassKeyAction | null {
  if (key === 'Delete' || key === 'Backspace') return 'delete'
  if (key === 'Tab') return mods.shift === true ? null : 'add-member'
  if (key === 'Enter') return mods.shift === true ? null : 'add-relation'
  return null
}

/**
 * 键位 → 动作（sequence）：参与者是列、消息是行，最近的"结构"是参与者（Tab）与消息（Enter）。
 * 带修饰键不处理。方向键语义不受影响（ADR-0011：仍是方位导航）。
 */
function sequenceKeyAction(key: string, mods: { shift?: boolean } = {}): SequenceKeyAction | null {
  if (key === 'Delete' || key === 'Backspace') return 'delete'
  if (key === 'Tab') return mods.shift === true ? null : 'add-participant'
  if (key === 'Enter') return mods.shift === true ? null : 'add-message'
  return null
}

/** 键 → plan（class，工单 05 / ADR-0013）：删除查能力包唯一映射（工单 03），
 * Tab/Enter 落到已有表单浮层（无选中 / 选中不是现存类 → null，不 preventDefault）。 */
export function classKeyPlan(projection: ClassProjection, input: KeyInput): KeyPlan | null {
  const action = classKeyAction(input.key, input.mods)
  if (action === null) return null
  if (action === 'delete') {
    const intent = classDeleteIntent(projection, input.selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  const selection = input.selection
  if (selection === null || selection.kind !== 'class') return null
  if (!projection.classes.some((c) => c.name === selection.name)) return null
  return { intents: [], form: action === 'add-member' ? 'member' : 'relation' }
}

/** 键 → plan（sequence，工单 05 / ADR-0013）：Tab 加参与者不依赖选中（参与者是列、
 * 没有锚点，走既有创建路径）；加消息需要选中一个现存参与者作为起点与锚点。 */
export function sequenceKeyPlan(projection: SequenceProjection, input: KeyInput): KeyPlan | null {
  const action = sequenceKeyAction(input.key, input.mods)
  if (action === null) return null
  if (action === 'delete') {
    const intent = sequenceDeleteIntent(projection, input.selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  if (action === 'add-participant') return { intents: [], form: 'participant' }
  const selection = input.selection
  if (selection === null || selection.kind !== 'participant') return null
  if (!projection.participants.some((p) => p.actorId === selection.actorId)) return null
  return { intents: [], form: 'message' }
}

// ---------- state 编辑键（more-diagrams 工单 02 / ADR-0013）：就近结构映射 ----------

/**
 * 选中元素 → 删除意图（state）：状态（级联删描述/复合块/触及转移与 note，由管线负责）、
 * 转移、note 三类各映射到既有 delete-* 意图；已不在投影 / null / 别种选中 → null。
 */
export function stateDeleteIntent(projection: StateProjection, selection: Selection | null): StateIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'state':
      return projection.states.some((s) => s.id === selection.id)
        ? { type: 'delete-state', id: selection.id }
        : null
    case 'state-transition':
      return projection.transitions.some((t) => t.elementId === selection.elementId)
        ? { type: 'delete-transition', elementId: selection.elementId }
        : null
    case 'state-note':
      return projection.notes.some((n) => n.elementId === selection.elementId)
        ? { type: 'delete-note', elementId: selection.elementId }
        : null
    default:
      return null
  }
}

/**
 * 键 → plan（state，more-diagrams 工单 02 / ADR-0013 就近类比）：
 * - Delete = 删除选中元素（查 stateDeleteIntent 唯一映射）
 * - Tab = 加同级状态（落码 + 选中 + 内联编辑描述）；复合状态内部的状态，新状态
 *   落在同一复合里（parentElementId），锚点为该状态的最后一个归属元素
 * - Enter = 从该状态拉一条转移（落到已有 AddTransitionInlineForm 表单浮层，不新造）
 */
export function stateKeyPlan(projection: StateProjection, input: KeyInput): KeyPlan | null {
  if (input.key === 'Delete' || input.key === 'Backspace') {
    const intent = stateDeleteIntent(projection, input.selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  if (input.key !== 'Tab' && input.key !== 'Enter') return null
  if (input.mods?.shift === true) return null
  const selection = input.selection
  if (selection === null || selection.kind !== 'state') return null
  const state = projection.states.find((s) => s.id === selection.id)
  if (state === undefined) return null
  if (input.key === 'Enter') return { intents: [], form: 'transition' }
  const id = nextFreeName('s', projection.states.map((s) => s.id))
  const intent: StateIntent = {
    type: 'add-state',
    id,
    afterElementId: state.tailElementId ?? undefined,
    parentElementId:
      state.parentId !== null
        ? (projection.states.find((s) => s.id === state.parentId)?.elementId ?? undefined)
        : undefined,
  }
  return {
    intents: [intent],
    newElementTarget: {
      selection: { kind: 'state', id },
      inlineEdit: { kind: 'state', id },
    },
  }
}

// ---------- er 编辑键（more-diagrams 工单 03 / ADR-0013）：就近结构映射 ----------

/**
 * 选中元素 → 删除意图（er）：实体（级联删属性块与触及关系，由管线负责）、属性、
 * 关系三类各映射到既有 delete-* 意图；已不在投影 / null / 别种选中 → null。
 */
export function erDeleteIntent(projection: ErProjection, selection: Selection | null): ErIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'er-entity':
      return projection.entities.some((e) => e.name === selection.name)
        ? { type: 'delete-entity', name: selection.name }
        : null
    case 'er-attribute':
      return projection.attributes.some((a) => a.elementId === selection.elementId)
        ? { type: 'delete-attribute', elementId: selection.elementId }
        : null
    case 'er-relation':
      return projection.relations.some((r) => r.elementId === selection.elementId)
        ? { type: 'delete-relation', elementId: selection.elementId }
        : null
    default:
      return null
  }
}

/**
 * 键 → plan（er，more-diagrams 工单 03 / ADR-0013 就近类比）：
 * - Delete = 删除选中元素（查 erDeleteIntent 唯一映射）
 * - Tab = 给该实体加属性（落码 + 选中；属性不做内联编辑——工单 03 明确，属性的双击
 *   与内联命名都不做，字段在右侧表单改）
 * - Enter = 从该实体拉一条关系（落到已有 AddErRelationInlineForm 表单浮层，不新造）
 */
export function erKeyPlan(projection: ErProjection, input: KeyInput): KeyPlan | null {
  if (input.key === 'Delete' || input.key === 'Backspace') {
    const intent = erDeleteIntent(projection, input.selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  if (input.key !== 'Tab' && input.key !== 'Enter') return null
  if (input.mods?.shift === true) return null
  const selection = input.selection
  if (selection === null || selection.kind !== 'er-entity') return null
  const entity = projection.entities.find((e) => e.name === selection.name)
  if (entity === undefined) return null
  if (input.key === 'Enter') return { intents: [], form: 'er-relation' }
  const attrName = nextFreeName('field', entity.attributes.map((a) => a.name))
  return {
    intents: [
      { type: 'add-attribute', entity: entity.name, attrType: 'string', name: attrName },
    ],
    newElementTarget: {
      selection: { kind: 'er-attribute', elementId: `attr:${entity.nextAttrOrdinal}` },
    },
  }
}

// ---------- gitGraph 编辑键（more-diagrams 工单 04 / ADR-0013）：语句序即拓扑 ----------

/**
 * 选中元素 → 删除意图（gitGraph）：commit（被 cherry-pick 引用时由管线拒绝落码）、
 * 分支（连带 checkout/merge 语句，由管线负责）、merge、cherry-pick 四类各映射到
 * 既有 delete-* 意图；已不在投影 / null / 别种选中 → null。
 */
export function gitgraphDeleteIntent(
  projection: GitgraphProjection,
  selection: Selection | null,
): GitgraphIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'gitgraph-commit':
      return projection.commits.some((c) => c.elementId === selection.elementId)
        ? { type: 'delete-commit', elementId: selection.elementId }
        : null
    case 'gitgraph-branch':
      return projection.branches.some((b) => b.name === selection.name)
        ? { type: 'delete-branch', name: selection.name }
        : null
    case 'gitgraph-merge':
      return projection.merges.some((m) => m.elementId === selection.elementId)
        ? { type: 'delete-merge', elementId: selection.elementId }
        : null
    case 'gitgraph-cherry-pick':
      return projection.cherryPicks.some((p) => p.elementId === selection.elementId)
        ? { type: 'delete-cherry-pick', elementId: selection.elementId }
        : null
    default:
      return null
  }
}

/**
 * 键 → plan（gitGraph，工单 04 / ADR-0013 就近类比，工单定案）：
 * - Delete = 删除选中元素（查 gitgraphDeleteIntent 唯一映射）
 * - 选中提交上 Tab = 当前分支加一个提交（锚点插入在该提交语句之后——语句序即拓扑，
 *   新提交与该提交同分支）
 * - 选中提交上 Enter = 加分支（创建并 checkout，锚点同上；分支名自动避重，不做改名）
 * 分支 / merge / cherry-pick 上无 Tab/Enter 语义（不加提交的「锚点」——不扩就近类比）。
 * 注：gitGraph 画布 DOM 无 data-id，键操作实际从结构树选中后经画布键盘生效。
 */
export function gitgraphKeyPlan(projection: GitgraphProjection, input: KeyInput): KeyPlan | null {
  if (input.key === 'Delete' || input.key === 'Backspace') {
    const intent = gitgraphDeleteIntent(projection, input.selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  if (input.key !== 'Tab' && input.key !== 'Enter') return null
  if (input.mods?.shift === true) return null
  const selection = input.selection
  if (selection === null || selection.kind !== 'gitgraph-commit') return null
  const index = projection.commits.findIndex((c) => c.elementId === selection.elementId)
  if (index === -1) return null
  if (input.key === 'Tab') {
    // 锚点插入：新提交的语句序位置 = 锚点提交之后（`commit:N` 的 N = 前面的 commit 语句数 + 1）
    return {
      intents: [{ type: 'add-commit', afterElementId: selection.elementId }],
      newElementTarget: { selection: { kind: 'gitgraph-commit', elementId: `commit:${index + 2}` } },
    }
  }
  const name = nextFreeName('dev', projection.branches.map((b) => b.name))
  if (!isValidGitgraphBranchName(name)) return null
  return {
    intents: [{ type: 'add-branch', name, afterElementId: selection.elementId }],
    newElementTarget: { selection: { kind: 'gitgraph-branch', name } },
  }
}

// ---------- requirement 编辑键（more-diagrams 工单 07 / ADR-0013）：就近结构映射 ----------

/**
 * 选中元素 → 删除意图（requirement）：requirement（级联删块内字段与触及关系，由管线负责）、
 * element、relation 三类各映射到既有 delete-* 意图；已不在投影 / null / 别种选中 → null。
 */
export function requirementDeleteIntent(
  projection: RequirementProjection,
  selection: Selection | null,
): RequirementIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'requirement':
      return projection.requirements.some((r) => r.name === selection.name)
        ? { type: 'delete-requirement', name: selection.name }
        : null
    case 'requirement-element':
      return projection.elements.some((e) => e.name === selection.name)
        ? { type: 'delete-element', name: selection.name }
        : null
    case 'requirement-relation':
      return projection.relations.some((r) => r.elementId === selection.elementId)
        ? { type: 'delete-relation', elementId: selection.elementId }
        : null
    default:
      return null
  }
}

/**
 * 键 → plan（requirement，工单 07 / ADR-0013，工单定案）：
 * - Delete = 删除选中元素（查 requirementDeleteIntent 唯一映射）
 * - Tab = 加 element（requirementDiagram 里「就近的结构」另一类节点就是 element；
 *   落码 + 选中；element 不做内联命名——工单明确 element 无双击编辑）
 * - Enter = 从该节点拉一条关系（落到 `AddRequirementRelationInlineForm` 表单浮层，不新造）
 * 关系 / 其他选中上无 Tab/Enter 语义（不扩就近类比）。
 */
export function requirementKeyPlan(projection: RequirementProjection, input: KeyInput): KeyPlan | null {
  if (input.key === 'Delete' || input.key === 'Backspace') {
    const intent = requirementDeleteIntent(projection, input.selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  if (input.key !== 'Tab' && input.key !== 'Enter') return null
  if (input.mods?.shift === true) return null
  const selection = input.selection
  if (selection === null) return null
  const anchor =
    selection.kind === 'requirement'
      ? projection.requirements.find((r) => r.name === selection.name)?.tailElementId
      : selection.kind === 'requirement-element'
        ? projection.elements.find((e) => e.name === selection.name)?.tailElementId
        : undefined
  if (anchor === undefined) return null
  if (input.key === 'Enter') return { intents: [], form: 'requirement-relation' }
  const name = nextFreeName('e', [
    ...projection.requirements.map((r) => r.name),
    ...projection.elements.map((e) => e.name),
  ])
  return {
    intents: [{ type: 'add-element', name, afterElementId: anchor }],
    newElementTarget: { selection: { kind: 'requirement-element', name } },
  }
}

// ---------- journey 编辑键（more-diagrams 工单 08 / ADR-0013）：就近结构映射 ----------

/**
 * 选中元素 → 删除意图（journey）：任务与 section（级联删其任务，由管线负责）两类
 * 各映射到既有 delete-* 意图；已不在投影 / null / 图表级 / 别种选中 → null。
 */
export function journeyDeleteIntent(
  projection: JourneyProjection,
  selection: Selection | null,
): JourneyIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'journey-task':
      return projection.tasks.some((t) => t.elementId === selection.elementId)
        ? { type: 'delete-task', elementId: selection.elementId }
        : null
    case 'journey-section':
      return projection.sections.some((s) => s.elementId === selection.elementId)
        ? { type: 'delete-section', elementId: selection.elementId }
        : null
    default:
      return null
  }
}

/**
 * 键 → plan（journey，工单 08 / ADR-0013，工单定案）：
 * - Delete = 删除选中元素（查 journeyDeleteIntent 唯一映射）
 * - 选中任务上 Tab = 同 section 加任务（锚点插入在该任务之后——文档序即渲染序，
 *   新任务与该任务同组）；占位名避重，不做内联编辑（画布无 data-id，工单降级定案）
 * - 选中任务上 Enter = 加 section（落在该任务所属 section 的末尾之后）
 * - section 选中上无 Tab/Enter 语义（不加任务的「锚点」歧义——不扩就近类比；
 *   section 的添加入口是空白菜单 / Enter-on-task）
 * 注：journey 画布 DOM 无 data-id，键操作实际从结构树选中后经画布键盘生效。
 */
export function journeyKeyPlan(projection: JourneyProjection, input: KeyInput): KeyPlan | null {
  if (input.key === 'Delete' || input.key === 'Backspace') {
    const intent = journeyDeleteIntent(projection, input.selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  if (input.key !== 'Tab' && input.key !== 'Enter') return null
  if (input.mods?.shift === true) return null
  const selection = input.selection
  if (selection === null || selection.kind !== 'journey-task') return null
  const task = projection.tasks.find((t) => t.elementId === selection.elementId)
  if (task === undefined) return null
  if (input.key === 'Tab') {
    // 同 section 加任务：无 section（空分组）时不带 sectionElementId（锚点 = 本任务）
    const name = nextFreeName('新任务', projection.tasks.map((t) => t.name))
    return {
      intents: [
        {
          type: 'add-task',
          name,
          score: 3,
          actors: [],
          sectionElementId: task.sectionElementId ?? undefined,
          afterElementId: task.elementId,
        } satisfies JourneyIntent,
      ],
      newElementTarget: {
        selection: { kind: 'journey-task', elementId: `task:${task.nextTaskOrdinal}` },
      },
    }
  }
  // Enter：加 section（落在该任务所属 section 的末尾之后；空分组任务落在文档末尾）
  const section = task.sectionElementId !== null
    ? projection.sections.find((s) => s.elementId === task.sectionElementId)
    : undefined
  const name = nextFreeName('新分组', projection.sections.map((s) => s.name))
  const anchor = section !== undefined ? section.tailElementId : task.tailElementId
  return {
    intents: [{ type: 'add-section', name, afterElementId: anchor } satisfies JourneyIntent],
    newElementTarget: {
      selection: {
        kind: 'journey-section',
        elementId: `section:${section !== undefined ? section.nextSectionOrdinal : projection.nextSectionOrdinal}`,
      },
    },
  }
}

// ---------- pie 编辑键（more-diagrams 工单 10 / ADR-0013）：就近结构映射 ----------

/**
 * 选中元素 → 删除意图（pie）：扇区映射到既有 delete-sector 意图；
 * 已不在投影 / null / 图表级 / 别种选中 → null。
 */
export function pieDeleteIntent(projection: PieProjection, selection: Selection | null): PieIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'pie-sector':
      return projection.sectors.some((s) => s.elementId === selection.elementId)
        ? { type: 'delete-sector', elementId: selection.elementId }
        : null
    default:
      return null
  }
}

/**
 * 键 → plan（pie，工单 10 / ADR-0013，工单定案）：
 * - Delete = 删除选中扇区（查 pieDeleteIntent 唯一映射）
 * - 选中扇区上 Tab = 加扇区（锚点插入在该扇区之后——文档序即扇区顺时针渲染序，
 *   新扇区落在它后面）；占位标签避重，数值取 1，不做内联编辑（画布无 data-id，工单降级定案）
 * - Enter 无自然类比（扇区之间没有「相邻结构」的添加语义）→ 不做并记录
 * 注：pie 画布 DOM 无 data-id，键操作实际从结构树选中后经画布键盘生效。
 */
export function pieKeyPlan(projection: PieProjection, input: KeyInput): KeyPlan | null {
  if (input.key === 'Delete' || input.key === 'Backspace') {
    const intent = pieDeleteIntent(projection, input.selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  // Enter 不接（工单定案：无自然类比，记录在案）；只接 Tab
  if (input.key !== 'Tab') return null
  if (input.mods?.shift === true) return null
  const selection = input.selection
  if (selection === null || selection.kind !== 'pie-sector') return null
  const index = projection.sectors.findIndex((s) => s.elementId === selection.elementId)
  if (index === -1) return null
  const label = nextFreeName('新扇区', projection.sectors.map((s) => s.label))
  return {
    intents: [
      { type: 'add-sector', label, value: '1', afterElementId: selection.elementId } satisfies PieIntent,
    ],
    newElementTarget: {
      selection: { kind: 'pie-sector', elementId: `sector:${index + 2}` },
    },
  }
}

/**
 * 选中元素 → 删除意图（timeline，more-diagrams 工单 05）：时期（连同其事件，由管线负责
 * 清理同行 inline 段与续行事件行）、事件两类各映射到既有 delete-* 意图；section 无删除
 * 意图（清单外，删 section 属改结构，未定义）；已不在投影 / null / 别种选中 → null。
 */
export function timelineDeleteIntent(
  projection: TimelineProjection,
  selection: Selection | null,
): TimelineIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'timeline-period':
      return projection.periods.some((p) => p.elementId === selection.elementId)
        ? { type: 'delete-period', elementId: selection.elementId }
        : null
    case 'timeline-event':
      return projection.events.some((e) => e.elementId === selection.elementId)
        ? { type: 'delete-event', elementId: selection.elementId }
        : null
    default:
      return null
  }
}

/**
 * 键 → plan（timeline，more-diagrams 工单 05 / ADR-0013 就近类比）：
 * - Delete = 删除选中元素（查 timelineDeleteIntent 唯一映射）
 * - Tab = 给该时期加事件（落续行 `: 文本`，锚点 = 该时期最后一个事件行 / 时期行）；
 *   新事件仅选中（事件不做内联编辑——工单 05 明确）
 * - Enter = 加下一个时期（落在该时期块之后）；新时期仅选中
 * 非时期选中 / 已不在投影 → null（不 preventDefault、不落码）。
 */
export function timelineKeyPlan(projection: TimelineProjection, input: KeyInput): KeyPlan | null {
  if (input.key === 'Delete' || input.key === 'Backspace') {
    const intent = timelineDeleteIntent(projection, input.selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  if (input.key !== 'Tab' && input.key !== 'Enter') return null
  if (input.mods?.shift === true) return null
  const selection = input.selection
  if (selection === null || selection.kind !== 'timeline-period') return null
  const period = projection.periods.find((p) => p.elementId === selection.elementId)
  if (period === undefined) return null
  if (input.key === 'Tab') {
    const text = nextFreeName('新事件', period.events.map((e) => e.text))
    return {
      intents: [{ type: 'add-event', periodElementId: period.elementId, text }],
      newElementTarget: {
        selection: { kind: 'timeline-event', elementId: `event:${period.nextEventOrdinal}` },
      },
    }
  }
  const text = nextFreeName('新阶段', projection.periods.map((p) => p.text))
  return {
    intents: [{ type: 'add-period', text, afterElementId: period.tailElementId }],
    newElementTarget: {
      selection: { kind: 'timeline-period', elementId: `period:${period.nextPeriodOrdinal}` },
    },
  }
}

// ---------- kanban 编辑键（more-diagrams 工单 06 / ADR-0013）：就近结构映射 ----------

/** kanban 编辑键动作：Tab = 同列加卡片、Enter = 加下一列、Delete = 删除选中元素 */
type KanbanKeyAction = 'delete' | 'add-card' | 'add-column'

/**
 * 键位 → 动作（kanban，ADR-0013 就近类比）：列是分组、卡片是行，卡片附近最近的结构是
 * 「同列再加一张卡片」（Tab）与「再开一列」（Enter）。带修饰键（Shift-Tab 等）不处理。
 */
function kanbanKeyAction(key: string, mods: { shift?: boolean } = {}): KanbanKeyAction | null {
  if (key === 'Delete' || key === 'Backspace') return 'delete'
  if (key === 'Tab') return mods.shift === true ? null : 'add-card'
  if (key === 'Enter') return mods.shift === true ? null : 'add-column'
  return null
}

/**
 * 选中元素 → 删除意图（kanban）：列（连同其卡片）与卡片各映射到既有 delete-* 意图，
 * 级联由管线负责；已不在投影 / null / 图表级 / 别种选中 → null。
 */
export function kanbanDeleteIntent(projection: KanbanProjection, selection: Selection | null): KanbanIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'kanban-column':
      return projection.columns.some((c) => c.elementId === selection.elementId)
        ? { type: 'delete-column', elementId: selection.elementId }
        : null
    case 'kanban-card':
      return projection.cards.some((c) => c.elementId === selection.elementId)
        ? { type: 'delete-card', elementId: selection.elementId }
        : null
    default:
      return null
  }
}

/** 全部已用节点 id（列 + 卡片）：mermaid kanban 要求 id 全局唯一，新建避重据此 */
function kanbanUsedIds(projection: KanbanProjection): string[] {
  return [...projection.columns.map((c) => c.id), ...projection.cards.map((c) => c.id)]
}

/**
 * 键 → plan（kanban，more-diagrams 工单 06 / ADR-0013 就近类比）：
 * - Delete = 删除选中元素（查 kanbanDeleteIntent 唯一映射）
 * - Tab = 同列加卡片（选中卡片取其所属列；选中列即该列）→ 落码 + 选中 + 内联编辑描述
 * - Enter = 加下一列（文档末尾追加）→ 落码 + 选中 + 内联编辑标题
 * 无选中 / 选中不是列或卡片 → null（不 preventDefault、不落码）。占位文本在落码后由
 * 内联命名改写（与 flowchart/mindmap 新建节点的既有口径一致）。
 */
export function kanbanKeyPlan(projection: KanbanProjection, input: KeyInput): KeyPlan | null {
  const action = kanbanKeyAction(input.key, input.mods)
  if (action === null) return null
  const selection = input.selection
  if (action === 'delete') {
    const intent = kanbanDeleteIntent(projection, selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  if (selection === null) return null
  if (selection.kind !== 'kanban-card' && selection.kind !== 'kanban-column') return null
  const used = kanbanUsedIds(projection)
  if (action === 'add-column') {
    const id = nextFreeName('col', used)
    return {
      intents: [{ type: 'add-column', id, title: '新列' }],
      newElementTarget: {
        selection: { kind: 'kanban-column', elementId: kanbanColumnElementId(id) },
        inlineEdit: { kind: 'kanban-column', elementId: kanbanColumnElementId(id) },
      },
    }
  }
  // add-card：选中卡片取其所属列；选中列即该列
  const columnElementId =
    selection.kind === 'kanban-column'
      ? selection.elementId
      : (projection.cards.find((c) => c.elementId === selection.elementId)?.columnElementId ?? null)
  if (columnElementId === null || !projection.columns.some((c) => c.elementId === columnElementId)) return null
  const id = nextFreeName('t', used)
  return {
    intents: [{ type: 'add-card', columnElementId, id, description: '新卡片' }],
    newElementTarget: {
      selection: { kind: 'kanban-card', elementId: kanbanCardElementId(id) },
      inlineEdit: { kind: 'kanban-card', elementId: kanbanCardElementId(id) },
    },
  }
}

/**
 * 选中元素 → 删除意图（flowchart，architecture-deepening-2 工单 03）：
 * 节点 / 连线 / 子图 / classDef 四类各映射到既有 delete-* 意图，存在性在这里校验一次
 * （已不在投影 / 图表级 / 别种选中 → null）。能力包 flowchart adapter 委托本函数，
 * 与 classDeleteIntent / sequenceDeleteIntent 同为「选中种类 → 删除意图」唯一映射的图种分片。
 */
export function flowchartDeleteIntent(
  projection: FlowchartProjection,
  selection: Selection | null,
): FlowchartIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'node':
      return projection.nodes.some((n) => n.nodeId === selection.nodeId)
        ? { type: 'delete-node', nodeId: selection.nodeId }
        : null
    case 'edge':
      return projection.edges.some(
        (e) =>
          e.from === selection.from && e.to === selection.to && e.occurrence === selection.occurrence,
      )
        ? { type: 'delete-edge', from: selection.from, to: selection.to, occurrence: selection.occurrence }
        : null
    case 'subgraph':
      return projection.subgraphs.some((s) => s.elementId === selection.elementId)
        ? { type: 'delete-subgraph', elementId: selection.elementId }
        : null
    case 'classdef':
      return projection.classDefs.some((c) => c.name === selection.name)
        ? { type: 'delete-classdef', name: selection.name }
        : null
    default:
      return null
  }
}

/** 选中元素 → 删除意图（mindmap，工单 03）：删节点（连同子树，由管线处理）。 */
export function mindmapDeleteIntent(
  projection: MindmapProjection,
  selection: Selection | null,
): MindmapIntent | null {
  if (selection === null || selection.kind !== 'mindmap-node') return null
  return projection.nodes.some((n) => n.elementId === selection.elementId)
    ? { type: 'delete-node', elementId: selection.elementId }
    : null
}

/**
 * 选中元素 → 删除意图（class）：四类可寻址元素各映射到既有 delete-* 意图，
 * 级联（删类连带成员/关系/note）由管线负责——与属性面板的删除走同一条链路，
 * 选中元素已不在投影 / 图表级 / 别种选中 → null（不落码、不 preventDefault）。
 */
export function classDeleteIntent(projection: ClassProjection, selection: Selection | null): ClassIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'class':
      return projection.classes.some((c) => c.name === selection.name)
        ? { type: 'delete-class', name: selection.name }
        : null
    case 'class-member':
      return projection.members.some((m) => m.elementId === selection.elementId)
        ? { type: 'delete-member', elementId: selection.elementId }
        : null
    case 'class-relation':
      return projection.relations.some((r) => r.elementId === selection.elementId)
        ? { type: 'delete-relation', elementId: selection.elementId }
        : null
    case 'class-note':
      return projection.notes.some((n) => n.elementId === selection.elementId)
        ? { type: 'delete-note', elementId: selection.elementId }
        : null
    default:
      return null
  }
}

/** 选中元素 → 删除意图（sequence）：参与者 / 消息 / 注释 / 逻辑块，级联由管线负责。 */
export function sequenceDeleteIntent(
  projection: SequenceProjection,
  selection: Selection | null,
): SequenceIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'participant':
      return projection.participants.some((p) => p.actorId === selection.actorId)
        ? { type: 'delete-participant', actorId: selection.actorId }
        : null
    case 'message':
      return projection.messages.some((m) => m.elementId === selection.elementId)
        ? { type: 'delete-message', elementId: selection.elementId }
        : null
    case 'note':
      return projection.notes.some((n) => n.elementId === selection.elementId)
        ? { type: 'delete-note', elementId: selection.elementId }
        : null
    case 'block':
      return projection.blocks.some((b) => b.elementId === selection.elementId)
        ? { type: 'delete-block', elementId: selection.elementId }
        : null
    default:
      return null
  }
}

// ---------- 方向键（工单 14）：方位导航的键位判定与适配对象 ----------

/** 参与方位导航的四个方向键；其余键（含组合键）不参与 */
export function isNavigationKey(key: string): boolean {
  return key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown'
}

/** 某节点在画布容器坐标系下的可视范围（工单 14 §4：= 高亮元素外接矩形的并集） */
export interface NodeExtent {
  dataId: string
  rect: Rect
}

/**
 * 方向键方位导航的适配对象（工单 14）：把 DOM 测量、选中映射、自动平移
 * 打包给 use-canvas-keyboard。各成员由 CanvasPanel 用现成的 resolver /
 * selectedDataIdOf / use-canvas-view 组装；测试注入假实现（不碰 DOM / mermaid）。
 */
export interface CanvasNavigation {
  /** 本图种全部节点的可视范围（容器坐标）；**数组顺序 = 投影顺序**（距离并列取先者用） */
  extents(): NodeExtent[]
  /** 当前选中对应的 data-id；null = 无锚点（无选中 / 图表级 / 别种元素 / 已不在投影） */
  dataIdOf(selection: Selection | null): string | null
  /** data-id → 编辑器选中；无法解析时 null */
  toSelection(dataId: string): Selection | null
  /** 把该节点的可视范围推入可见区（自动平移，瞬时无补间） */
  reveal(dataId: string): void
  /** 无锚点时的回落选中：本图种投影首个节点；投影为空时 null */
  firstSelection(): Selection | null
}
