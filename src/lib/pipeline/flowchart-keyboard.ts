// flowchart 画布键盘 / 删除语义（architecture-deepening-3 工单 01：自 editing/canvas-keyboard.ts 物理归位，代码块字节级搬移，逻辑零改动）

import { keyToNodeAction, nextNodeId, type KeyInput, type KeyPlan, type NodeKeyAction } from '../editing/canvas-keyboard'
import { nodeElementId, type FlowchartIntent } from './flowchart'
import type { FlowchartProjection } from '../projection/flowchart-projection'
import type { Selection } from '../projection/selection'

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
