// treeview 画布键盘 / 删除语义（architecture-deepening-3 工单 01：自 editing/canvas-keyboard.ts 物理归位，代码块字节级搬移，逻辑零改动）

import { nextFreeName } from './element-id'
import type { KeyInput, KeyPlan } from '../editing/canvas-keyboard'
import type { TreeviewIntent } from './treeview'
import type { ProjectionTreeviewNode, TreeviewProjection } from '../projection/treeview-projection'
import type { Selection } from '../projection/selection'

// ---------- treeView 编辑键（more-diagrams 工单 24 / ADR-0013）：就近结构映射 ----------

/**
 * 选中元素 → 删除意图（treeView）：节点（连同子树，由管线负责）映射到既有
 * delete-node 意图；已不在投影 / null / 图表级 / 别种选中 → null。
 */
export function treeviewDeleteIntent(
  projection: TreeviewProjection,
  selection: Selection | null,
): TreeviewIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'treeview-node':
      return projection.nodes.some((n) => n.elementId === selection.elementId)
        ? { type: 'delete-node', elementId: selection.elementId }
        : null
    default:
      return null
  }
}

/** 节点子树在平铺 nodes 中的末尾下标（平铺即文档序，子树是连续区间） */
function treeviewSubtreeEnd(nodes: ProjectionTreeviewNode[], index: number): number {
  const level = nodes[index].level
  let end = index
  for (let i = index + 1; i < nodes.length && nodes[i].level > level; i++) end = i
  return end
}

/**
 * 键 → plan（treeView，工单 24 / ADR-0013，工单定案）：
 * - Delete = 删除选中节点（查 treeviewDeleteIntent 唯一映射；子树级联由管线负责）
 * - 选中目录上 Tab = 加子文件（含空格的占位名会用引号包裹，落在其子树末尾之后）
 * - 选中任意节点上 Enter = 加同级文件（同缩进，落在其子树之后）
 * - 不做内联编辑：画布 DOM 无 data-id（research §4 实测），键操作实际从结构树选中后
 *   经画布键盘生效；新名字避重，不进内联命名（与 treemap/ishikawa 降级同口径）。
 */
export function treeviewKeyPlan(projection: TreeviewProjection, input: KeyInput): KeyPlan | null {
  if (input.key === 'Delete' || input.key === 'Backspace') {
    const intent = treeviewDeleteIntent(projection, input.selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  if (input.key !== 'Tab' && input.key !== 'Enter') return null
  if (input.mods?.shift === true) return null
  const selection = input.selection
  if (selection === null || selection.kind !== 'treeview-node') return null
  const index = projection.nodes.findIndex((n) => n.elementId === selection.elementId)
  if (index === -1) return null
  const node = projection.nodes[index]
  const names = projection.nodes.map((n) => n.name)
  const name = nextFreeName('新文件', names)
  const ordinal = treeviewSubtreeEnd(projection.nodes, index) + 2
  if (input.key === 'Tab') {
    // 只有目录能挂子（文件叶子无子，语义底线；工单定案）
    if (!node.isDirectory) return null
    return {
      intents: [{ type: 'add-child', parentElementId: selection.elementId, name }],
      newElementTarget: { selection: { kind: 'treeview-node', elementId: `treeview-node:${ordinal}` } },
    }
  }
  return {
    intents: [{ type: 'add-sibling', elementId: selection.elementId, name }],
    newElementTarget: { selection: { kind: 'treeview-node', elementId: `treeview-node:${ordinal}` } },
  }
}
