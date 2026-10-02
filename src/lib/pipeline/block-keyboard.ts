// block 画布键盘 / 删除语义（architecture-deepening-3 工单 01：自 editing/canvas-keyboard.ts 物理归位，代码块字节级搬移，逻辑零改动）

import { isValidBlockId, type BlockIntent } from './block'
import { nextFreeName } from './element-id'
import type { KeyInput, KeyPlan } from '../editing/canvas-keyboard'
import type { BlockProjection } from '../projection/block-projection'
import type { Selection } from '../projection/selection'

// ---------- block 编辑键（more-diagrams 工单 09 / ADR-0013）：就近结构映射 ----------

/**
 * 选中元素 → 删除意图（block）：块节点（级联删触及边，由管线负责）、嵌套块
 * （连同成员与触及边）、边三类各映射到既有 delete-* 意图；已不在投影 / null / 别种选中 → null。
 */
export function blockDeleteIntent(projection: BlockProjection, selection: Selection | null): BlockIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'block-node':
      return projection.nodes.some((n) => n.id === selection.id)
        ? { type: 'delete-node', id: selection.id }
        : null
    case 'block-group':
      return projection.groups.some((g) => g.id === selection.id)
        ? { type: 'delete-group', id: selection.id }
        : null
    case 'block-edge':
      return projection.edges.some((e) => e.elementId === selection.elementId)
        ? { type: 'delete-edge', elementId: selection.elementId }
        : null
    default:
      return null
  }
}

/**
 * 键 → plan（block，工单 09 / ADR-0013 就近类比，工单定案）：
 * - Delete = 删除选中元素（查 blockDeleteIntent 唯一映射）
 * - Tab = 同父加块：块节点 → 同一作用域（嵌套块内/顶层）追加新节点（锚点 = 该节点
 *   声明行）；嵌套块 → 落进该组（锚点 = 组声明行）。落码 + 选中 + 内联编辑标签
 * - Enter = 从该节点拉一条边（落到 AddBlockEdgeInlineForm 表单浮层，不新造浮层形态）
 * 边上无 Tab/Enter 语义（不扩就近类比）。新节点 id 全局避重（节点与嵌套块共享 id 名空间）。
 */
export function blockKeyPlan(projection: BlockProjection, input: KeyInput): KeyPlan | null {
  if (input.key === 'Delete' || input.key === 'Backspace') {
    const intent = blockDeleteIntent(projection, input.selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  if (input.key !== 'Tab' && input.key !== 'Enter') return null
  if (input.mods?.shift === true) return null
  const selection = input.selection
  if (selection === null) return null
  if (input.key === 'Enter') {
    if (selection.kind !== 'block-node' || !projection.nodes.some((n) => n.id === selection.id)) return null
    return { intents: [], form: 'block-edge' }
  }
  // Tab：同父加块
  if (selection.kind === 'block-node') {
    const node = projection.nodes.find((n) => n.id === selection.id)
    if (node === undefined || node.elementId === null) return null
    const id = nextFreeName('b', [
      ...projection.nodes.map((n) => n.id),
      ...projection.groups.map((g) => g.id),
    ])
    if (!isValidBlockId(id)) return null
    return {
      intents: [
        { type: 'add-node', id, shape: 'square', label: id, parentGroupId: node.parentId, afterElementId: node.elementId },
      ],
      newElementTarget: {
        selection: { kind: 'block-node', id },
        inlineEdit: { kind: 'block-node', id },
      },
    }
  }
  if (selection.kind === 'block-group') {
    const group = projection.groups.find((g) => g.id === selection.id)
    if (group === undefined) return null
    const id = nextFreeName('b', [
      ...projection.nodes.map((n) => n.id),
      ...projection.groups.map((g) => g.id),
    ])
    if (!isValidBlockId(id)) return null
    return {
      intents: [{ type: 'add-node', id, shape: 'square', label: id, parentGroupId: group.id, afterElementId: group.elementId }],
      newElementTarget: {
        selection: { kind: 'block-node', id },
        inlineEdit: { kind: 'block-node', id },
      },
    }
  }
  return null
}
