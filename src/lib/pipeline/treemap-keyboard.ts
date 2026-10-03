// treemap 画布键盘 / 删除语义（architecture-deepening-3 工单 01：自 editing/canvas-keyboard.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { KeyInput, KeyPlan } from '../editing/canvas-keyboard'
import { nextFreeName } from './element-id'
import type { TreemapIntent } from './treemap'
import type { ProjectionTreemapNode, TreemapProjection } from '../projection/treemap-projection'
import type { Selection } from '../projection/selection'
import { newElementName } from '../../i18n/domain-strings.ts'

// ---------- treemap 编辑键（more-diagrams 工单 20 / ADR-0013）：就近结构映射 ----------

/**
 * 选中元素 → 删除意图（treemap）：节点（连同子树，由管线负责）映射到既有
 * delete-node 意图；已不在投影 / null / 图表级 / 别种选中 → null。
 */
export function treemapDeleteIntent(
  projection: TreemapProjection,
  selection: Selection | null,
): TreemapIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'treemap-node':
      return projection.nodes.some((n) => n.elementId === selection.elementId)
        ? { type: 'delete-node', elementId: selection.elementId }
        : null
    default:
      return null
  }
}

/** 节点子树在平铺 nodes 中的末尾下标（平铺即文档序，子树是连续区间） */
function treemapSubtreeEnd(nodes: ProjectionTreemapNode[], index: number): number {
  const depth = nodes[index].depth
  let end = index
  for (let i = index + 1; i < nodes.length && nodes[i].depth > depth; i++) end = i
  return end
}

/**
 * 键 → plan（treemap，工单 20 / ADR-0013，工单定案）：
 * - Delete = 删除选中节点（查 treemapDeleteIntent 唯一映射；子树级联由管线负责）
 * - 选中 Section 上 Tab = 加叶子子节点（`"新节点": 1`，落在该 Section 子树末尾之后，
 *   缩进跟随既有子节点由管线负责）；叶子有值即叶子（research §3），叶子上 Tab 无动作
 * - 选中任意节点上 Enter = 加同级叶子（同缩进，落在其子树之后）
 * - 不做内联编辑：画布 DOM 无 data-id（research §4 实测），键操作实际从结构树选中后
 *   经画布键盘生效；新名字避重，不进内联命名（与 pie/journey 降级同口径）。
 */
export function treemapKeyPlan(projection: TreemapProjection, input: KeyInput): KeyPlan | null {
  if (input.key === 'Delete' || input.key === 'Backspace') {
    const intent = treemapDeleteIntent(projection, input.selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  if (input.key !== 'Tab' && input.key !== 'Enter') return null
  if (input.mods?.shift === true) return null
  const selection = input.selection
  if (selection === null || selection.kind !== 'treemap-node') return null
  const index = projection.nodes.findIndex((n) => n.elementId === selection.elementId)
  if (index === -1) return null
  const node = projection.nodes[index]
  const names = projection.nodes.map((n) => n.name)
  if (input.key === 'Tab') {
    if (node.nodeKind !== 'section') return null // 叶子下不挂子（有值即叶子）
    const name = nextFreeName(newElementName('node'), names)
    const ordinal = treemapSubtreeEnd(projection.nodes, index) + 2
    return {
      intents: [{ type: 'add-child', parentElementId: selection.elementId, name, value: '1' }],
      newElementTarget: { selection: { kind: 'treemap-node', elementId: `treemap-node:${ordinal}` } },
    }
  }
  const name = nextFreeName(newElementName('node'), names)
  const ordinal = treemapSubtreeEnd(projection.nodes, index) + 2
  return {
    intents: [{ type: 'add-sibling', elementId: selection.elementId, name, value: '1' }],
    newElementTarget: { selection: { kind: 'treemap-node', elementId: `treemap-node:${ordinal}` } },
  }
}
