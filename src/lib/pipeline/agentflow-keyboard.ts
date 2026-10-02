// agentflow 画布键盘 / 删除语义（architecture-deepening-3 工单 01：自 editing/canvas-keyboard.ts 物理归位，代码块字节级搬移，逻辑零改动）

import { nextFreeName } from './element-id'
import type { KeyInput, KeyPlan } from '../editing/canvas-keyboard'
import type { AgentflowIntent } from './agentflow'
import type { AgentflowProjection } from '../projection/agentflow-projection'
import type { Selection } from '../projection/selection'

/**
 * 选中元素 → 删除意图（agentflow，工单 27）：节点 / 边 / 容器 / 文档行四类各映射到
 * 既有 delete-* 意图。**删容器连带开行到 end 之间的全部元素**（与 flowchart
 * `delete-subgraph` 同口径，工单定案——避免留下孤儿 `end` 导致 mermaid 报错）。
 * 元素已不在投影 / null / 图表级 / 别种选中 → null。
 */
export function agentflowDeleteIntent(
  projection: AgentflowProjection,
  selection: Selection | null,
): AgentflowIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'agentflow-node':
      return projection.nodes.some((n) => n.nodeId === selection.nodeId)
        ? { type: 'delete-node', nodeId: selection.nodeId }
        : null
    case 'agentflow-edge':
      return projection.edges.some((e) => e.elementId === selection.elementId)
        ? { type: 'delete-edge', elementId: selection.elementId }
        : null
    case 'agentflow-flow':
      return projection.containers.some((c) => c.elementId === selection.elementId)
        ? { type: 'delete-flow', elementId: selection.elementId }
        : null
    case 'agentflow-doc':
      return projection.docLines.some((d) => d.elementId === selection.elementId)
        ? { type: 'delete-doc-line', elementId: selection.elementId }
        : null
    default:
      return null
  }
}

/**
 * 键 → plan（agentflow，工单 27 / ADR-0013 就近类比流程图，工单定案）：
 * - Delete = 删除选中元素（查 agentflowDeleteIntent 唯一映射；删节点级联删触及边、
 *   删容器级联删块内元素，均由管线负责）
 * - 选中节点上 Tab = 加子节点（新节点 + 该节点 → 新节点连线，两行插在该节点行后）
 * - 选中节点上 Enter = 加同级节点（父节点 = 第一条入边的起点；无入边退化为 add-child）
 * - 选中边上无 Tab/Enter 语义（「就近结构」的添加落在节点上；加边走右键空白菜单）
 * - 容器 / 文档行上无 Tab/Enter 语义（不做并记录）
 * 画布节点可寻址（反注 data-id），键操作在画布选中后即生效。
 */
export function agentflowKeyPlan(projection: AgentflowProjection, input: KeyInput): KeyPlan | null {
  if (input.key === 'Delete' || input.key === 'Backspace') {
    const intent = agentflowDeleteIntent(projection, input.selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  if (input.key !== 'Tab' && input.key !== 'Enter') return null
  if (input.mods?.shift === true) return null
  const selection = input.selection
  if (selection === null || selection.kind !== 'agentflow-node') return null
  if (!projection.nodes.some((n) => n.nodeId === selection.nodeId)) return null
  const newNodeId = nextFreeName('n', projection.nodes.map((n) => n.nodeId), { referential: false })
  const anchor = `node:${selection.nodeId}`
  const parent =
    input.key === 'Tab'
      ? selection.nodeId
      : projection.edges.find((e) => e.to === selection.nodeId)?.from ?? selection.nodeId
  return {
    intents: [
      { type: 'add-node', nodeId: newNodeId, text: newNodeId, shape: 'task', afterElementId: anchor },
      { type: 'add-edge', from: parent, to: newNodeId, afterElementId: anchor },
    ],
    newElementTarget: { selection: { kind: 'agentflow-node', nodeId: newNodeId } },
  }
}
