import type { FlowchartIntent } from '../pipeline/flowchart'
import { nodeElementId } from '../pipeline/flowchart'
import type { MindmapIntent } from '../pipeline/mindmap'
import type { FlowchartProjection } from '../projection/flowchart-projection'
import type { MindmapProjection } from '../projection/mindmap-projection'
import type { Selection } from '../projection/selection'

/**
 * 画布键盘的纯逻辑（工单 05 编辑动作 / 工单 03 方向键导航）：
 * 键位 → 动作、动作 → 编辑意图序列、方向键 → 新的选中。
 * 落码经管线 applyEdit / commitIntent（03 编辑意图 + ADR-0008 手术式改写），快照入栈可撤销。
 */

/** 参与画布键盘的图种投影（tagged union，keydown 时按图种分支） */
export type CanvasKeyboardProjection =
  | { kind: 'flowchart'; projection: FlowchartProjection }
  | { kind: 'mindmap'; projection: MindmapProjection }

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
  const newElementId = `mindmap-node:${end + 2}`
  if (action === 'add-child' || node.parentId === null) {
    return { intents: [{ type: 'add-child', parentElementId: elementId, text: defaultText }], newElementId }
  }
  return { intents: [{ type: 'add-sibling', elementId, text: defaultText }], newElementId }
}

// ---------- 方向键导航（工单 03）：移动「选中」本身，不动 DOM 焦点 ----------

/** 本批参与导航的键位；其余键（含组合键）不参与 */
export function isNavigationKey(key: string): boolean {
  return key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown'
}

/**
 * 方向键 → 新的选中；无对应目标时 null（调用方仍应 preventDefault，避免页面滚动）。
 *
 * 语义（CONTEXT.md「选中」词条 + ADR-0010）：只移动选中，不引入独立于选中的「焦点」概念，
 * 焦点始终留在画布容器上。
 * - mindmap（树形四向）：`←` 父节点（根 → null）；`→` 第一个子节点（无子 → null）；
 *   `↑`/`↓` 上一个/下一个兄弟（到边界 → null）
 * - flowchart（线性）：`←`/`↑` 上一个节点、`→`/`↓` 下一个节点；顺序即投影数组顺序
 *   （源码出现顺序），**不是**画布上的视觉方位；到首/尾 → null
 * - 当前没有选中本图种的节点时（无选中 / 图表级 / 别种元素 / 选中已不在投影中）：
 *   任方向键选中第一个节点（mindmap 根 / flowchart 首节点）——应用初始选中是「图表级」，
 *   这让方向键一按即有落点
 *
 * 到边界一律无操作、不回绕；空投影返回 null。
 */
export function navigationTarget(
  target: CanvasKeyboardProjection,
  selection: Selection | null,
  key: string,
): Selection | null {
  return target.kind === 'mindmap'
    ? mindmapNavigationTarget(target.projection, selection, key)
    : flowchartNavigationTarget(target.projection, selection, key)
}

function mindmapNavigationTarget(
  projection: MindmapProjection,
  selection: Selection | null,
  key: string,
): Selection | null {
  const nodes = projection.nodes
  if (nodes.length === 0) return null
  const node =
    selection !== null && selection.kind === 'mindmap-node'
      ? nodes.find((n) => n.elementId === selection.elementId)
      : undefined
  if (node === undefined) return mindmapNodeSelection(nodes[0].elementId)

  if (key === 'ArrowLeft') {
    // 父节点；根节点（无父）无操作
    return node.parentId === null ? null : mindmapNodeSelection(node.parentId)
  }
  if (key === 'ArrowRight') {
    // 第一个子节点（文档序里首个 parentId 指向本节点的节点）
    const child = nodes.find((n) => n.parentId === node.elementId)
    return child === undefined ? null : mindmapNodeSelection(child.elementId)
  }
  // 兄弟 = 同父节点集合（根节点无父，其「兄弟」只有自己）
  const siblings = nodes.filter((n) => n.parentId === node.parentId)
  const index = siblings.findIndex((n) => n.elementId === node.elementId)
  const siblingIndex = key === 'ArrowUp' ? index - 1 : key === 'ArrowDown' ? index + 1 : -1
  const sibling = siblings[siblingIndex] // 非 ↑/↓ 或越界 → undefined（无操作）
  return sibling === undefined ? null : mindmapNodeSelection(sibling.elementId)
}

function flowchartNavigationTarget(
  projection: FlowchartProjection,
  selection: Selection | null,
  key: string,
): Selection | null {
  const nodes = projection.nodes
  if (nodes.length === 0) return null
  const index =
    selection !== null && selection.kind === 'node'
      ? nodes.findIndex((n) => n.nodeId === selection.nodeId)
      : -1
  if (index === -1) return { kind: 'node', nodeId: nodes[0].nodeId }

  const step =
    key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : key === 'ArrowRight' || key === 'ArrowDown' ? 1 : 0
  if (step === 0) return null
  const next = nodes[index + step]
  return next === undefined ? null : { kind: 'node', nodeId: next.nodeId }
}

function mindmapNodeSelection(elementId: string): Selection {
  return { kind: 'mindmap-node', elementId }
}
