// mindmap 画布键盘 / 删除语义（architecture-deepening-3 工单 01：自 editing/canvas-keyboard.ts 物理归位，代码块字节级搬移，逻辑零改动）

import { keyToNodeAction, type KeyInput, type KeyPlan, type NodeKeyAction } from '../editing/canvas-keyboard'
import { mindmapNodeElementId } from './element-id'
import type { MindmapIntent } from './mindmap'
import type { MindmapProjection } from '../projection/mindmap-projection'
import type { Selection } from '../projection/selection'

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
