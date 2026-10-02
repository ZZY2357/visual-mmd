// requirement 画布键盘 / 删除语义（architecture-deepening-3 工单 01：自 editing/canvas-keyboard.ts 物理归位，代码块字节级搬移，逻辑零改动）

import { nextFreeName } from './element-id'
import type { KeyInput, KeyPlan } from '../editing/canvas-keyboard'
import type { RequirementIntent } from './requirement'
import type { RequirementProjection } from '../projection/requirement-projection'
import type { Selection } from '../projection/selection'

// ---------- requirement 编辑键（more-diagrams 工单 07 / ADR-0013）：就近结构映射 ----------

/**
 * 选中元素 → 删除意图（requirement）：requirement（级联删块内字段与触及关系，由管线负责）、
 * element、relation 三类各映射到既有 delete-* 意图；已不在投影 / null / 别种选中 → null。
 */
export function requirementDeleteIntent(
  projection: RequirementProjection,
  selection: Selection | null,
): RequirementIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'requirement':
      return projection.requirements.some((r) => r.name === selection.name)
        ? { type: 'delete-requirement', name: selection.name }
        : null
    case 'requirement-element':
      return projection.elements.some((e) => e.name === selection.name)
        ? { type: 'delete-element', name: selection.name }
        : null
    case 'requirement-relation':
      return projection.relations.some((r) => r.elementId === selection.elementId)
        ? { type: 'delete-relation', elementId: selection.elementId }
        : null
    default:
      return null
  }
}

/**
 * 键 → plan（requirement，工单 07 / ADR-0013，工单定案）：
 * - Delete = 删除选中元素（查 requirementDeleteIntent 唯一映射）
 * - Tab = 加 element（requirementDiagram 里「就近的结构」另一类节点就是 element；
 *   落码 + 选中；element 不做内联命名——工单明确 element 无双击编辑）
 * - Enter = 从该节点拉一条关系（落到 `AddRequirementRelationInlineForm` 表单浮层，不新造）
 * 关系 / 其他选中上无 Tab/Enter 语义（不扩就近类比）。
 */
export function requirementKeyPlan(projection: RequirementProjection, input: KeyInput): KeyPlan | null {
  if (input.key === 'Delete' || input.key === 'Backspace') {
    const intent = requirementDeleteIntent(projection, input.selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  if (input.key !== 'Tab' && input.key !== 'Enter') return null
  if (input.mods?.shift === true) return null
  const selection = input.selection
  if (selection === null) return null
  const anchor =
    selection.kind === 'requirement'
      ? projection.requirements.find((r) => r.name === selection.name)?.tailElementId
      : selection.kind === 'requirement-element'
        ? projection.elements.find((e) => e.name === selection.name)?.tailElementId
        : undefined
  if (anchor === undefined) return null
  if (input.key === 'Enter') return { intents: [], form: 'requirement-relation' }
  const name = nextFreeName('e', [
    ...projection.requirements.map((r) => r.name),
    ...projection.elements.map((e) => e.name),
  ])
  return {
    intents: [{ type: 'add-element', name, afterElementId: anchor }],
    newElementTarget: { selection: { kind: 'requirement-element', name } },
  }
}
