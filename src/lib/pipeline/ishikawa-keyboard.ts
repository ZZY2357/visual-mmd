// ishikawa 画布键盘 / 删除语义（architecture-deepening-3 工单 01：自 editing/canvas-keyboard.ts 物理归位，代码块字节级搬移，逻辑零改动）

import { nextFreeName } from './element-id'
import type { KeyInput, KeyPlan } from '../editing/canvas-keyboard'
import type { IshikawaIntent } from './ishikawa'
import type { IshikawaProjection, ProjectionIshikawaNode } from '../projection/ishikawa-projection'
import type { Selection } from '../projection/selection'
import { newElementName } from '../../i18n/domain-strings.ts'

/**
 * 选中元素 → 删除意图（ishikawa）：节点（连同子树，由管线负责）映射到既有
 * delete-node 意图；鱼头（root）不可删除（管线拒绝）；已不在投影 / null / 图表级 /
 * 别种选中 → null。
 */
export function ishikawaDeleteIntent(
  projection: IshikawaProjection,
  selection: Selection | null,
): IshikawaIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'ishikawa-node': {
      const node = projection.nodes.find((n) => n.elementId === selection.elementId)
      // 鱼头没有删除的语法动作（删掉会让整图失去问题本身，工单定案）
      return node !== undefined && !node.isRoot
        ? { type: 'delete-node', elementId: selection.elementId }
        : null
    }
    default:
      return null
  }
}

/** 节点子树在平铺 nodes 中的末尾下标（平铺即文档序，子树是连续区间） */
function ishikawaSubtreeEnd(nodes: ProjectionIshikawaNode[], index: number): number {
  const depth = nodes[index].depth
  let end = index
  for (let i = index + 1; i < nodes.length && nodes[i].depth > depth; i++) end = i
  return end
}

/**
 * 键 → plan（ishikawa，工单 22 / ADR-0013，工单定案）：
 * - Delete = 删除选中节点（查 ishikawaDeleteIntent 唯一映射；子树级联由管线负责；
 *   鱼头不可删，安静无动作）
 * - 选中任意节点上 Tab = 加子节点（落在该节点子树末尾之后，缩进由管线深一档）
 * - 选中任意节点上 Enter = 加同级节点（同缩进，落在其子树之后）
 * - 不做内联编辑：画布 DOM 无 data-id（research §4 实测），键操作实际从结构树选中后
 *   经画布键盘生效；新名字避重，不进内联命名（与 treemap/radar 降级同口径）。
 */
export function ishikawaKeyPlan(projection: IshikawaProjection, input: KeyInput): KeyPlan | null {
  if (input.key === 'Delete' || input.key === 'Backspace') {
    const intent = ishikawaDeleteIntent(projection, input.selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  if (input.key !== 'Tab' && input.key !== 'Enter') return null
  if (input.mods?.shift === true) return null
  const selection = input.selection
  if (selection === null || selection.kind !== 'ishikawa-node') return null
  const index = projection.nodes.findIndex((n) => n.elementId === selection.elementId)
  if (index === -1) return null
  const names = projection.nodes.map((n) => n.text)
  const name = nextFreeName(newElementName('cause'), names)
  const ordinal = ishikawaSubtreeEnd(projection.nodes, index) + 2
  if (input.key === 'Tab') {
    return {
      intents: [{ type: 'add-child', parentElementId: selection.elementId, text: name }],
      newElementTarget: { selection: { kind: 'ishikawa-node', elementId: `ishikawa-node:${ordinal}` } },
    }
  }
  return {
    intents: [{ type: 'add-sibling', elementId: selection.elementId, text: name }],
    newElementTarget: { selection: { kind: 'ishikawa-node', elementId: `ishikawa-node:${ordinal}` } },
  }
}
