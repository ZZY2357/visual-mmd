import type { ClassIntent } from '../pipeline/class'
import type { FlowchartIntent } from '../pipeline/flowchart'
import { nodeElementId } from '../pipeline/flowchart'
import { mindmapNodeElementId } from '../pipeline/element-id'
import type { MindmapIntent } from '../pipeline/mindmap'
import type { SequenceIntent } from '../pipeline/sequence'
import type { ClassProjection } from '../projection/class-projection'
import type { FlowchartProjection } from '../projection/flowchart-projection'
import type { MindmapProjection } from '../projection/mindmap-projection'
import type { SequenceProjection } from '../projection/sequence-projection'
import type { Selection } from '../projection/selection'
import type { Rect } from './inline-edit'

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
 */

/** 参与画布键盘的图种投影（tagged union，keydown 时按图种分支） */
export type CanvasKeyboardProjection =
  | { kind: 'flowchart'; projection: FlowchartProjection }
  | { kind: 'mindmap'; projection: MindmapProjection }
  | { kind: 'class'; projection: ClassProjection }
  | { kind: 'sequence'; projection: SequenceProjection }

export type NodeKeyAction = 'delete' | 'add-child' | 'add-sibling'

/** 键位 → 动作映射；带修饰键（Shift-Tab 等）不处理（交给原有行为） */
export function keyToNodeAction(key: string, mods: { shift?: boolean } = {}): NodeKeyAction | null {
  if (key === 'Delete' || key === 'Backspace') return 'delete'
  if (key === 'Tab') return mods.shift === true ? null : 'add-child'
  if (key === 'Enter') return mods.shift === true ? null : 'add-sibling'
  return null
}

/** 生成未冲突的新节点 id：n1、n2……跳过已有 id */
export function nextNodeId(existingIds: Iterable<string>): string {
  const used = new Set(existingIds)
  for (let i = 1; i < 10000; i++) {
    const id = `n${i}`
    if (!used.has(id)) return id
  }
  return `n${Date.now()}` // 理论不可达的兜底
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

// ---------- class / sequence 编辑键（工单 05 / ADR-0013）：就近结构映射 ----------

/** class 编辑键动作：Tab = 加成员、Enter = 加关系、Delete = 删除选中元素 */
export type ClassKeyAction = 'delete' | 'add-member' | 'add-relation'

/** sequence 编辑键动作：Tab = 加参与者、Enter = 加消息、Delete = 删除选中元素 */
export type SequenceKeyAction = 'delete' | 'add-participant' | 'add-message'

/**
 * 键位 → 动作（class）。这是**就近类比**而非严格语义：class 是有向图，没有 flowchart
 * 的"子/同级"，当前元素附近最近的结构是成员（Tab）与关系（Enter）。带修饰键（Shift-Tab
 * 等）不处理，交给原有行为。
 */
export function keyToClassAction(key: string, mods: { shift?: boolean } = {}): ClassKeyAction | null {
  if (key === 'Delete' || key === 'Backspace') return 'delete'
  if (key === 'Tab') return mods.shift === true ? null : 'add-member'
  if (key === 'Enter') return mods.shift === true ? null : 'add-relation'
  return null
}

/**
 * 键位 → 动作（sequence）：参与者是列、消息是行，最近的"结构"是参与者（Tab）与消息（Enter）。
 * 带修饰键不处理。方向键语义不受影响（ADR-0011：仍是方位导航）。
 */
export function keyToSequenceAction(key: string, mods: { shift?: boolean } = {}): SequenceKeyAction | null {
  if (key === 'Delete' || key === 'Backspace') return 'delete'
  if (key === 'Tab') return mods.shift === true ? null : 'add-participant'
  if (key === 'Enter') return mods.shift === true ? null : 'add-message'
  return null
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
