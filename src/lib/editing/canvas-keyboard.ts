import type { FlowchartIntent } from '../pipeline/flowchart'
import { nodeElementId } from '../pipeline/flowchart'
import type { MindmapIntent } from '../pipeline/mindmap'
import type { FlowchartProjection } from '../projection/flowchart-projection'
import type { MindmapProjection } from '../projection/mindmap-projection'

/**
 * 画布选中后的键盘操作（工单 05）：Del 删除、Tab 添加子节点、Enter 添加同级节点。
 *
 * 本模块是纯逻辑：键位 → 动作、动作 → 编辑意图序列。落码经管线
 * applyEdit / commitIntent（03 编辑意图 + ADR-0008 手术式改写），快照入栈可撤销。
 */

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
