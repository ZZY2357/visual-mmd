// class 画布键盘 / 删除语义（architecture-deepening-3 工单 01：自 editing/canvas-keyboard.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { KeyInput, KeyPlan } from '../editing/canvas-keyboard'
import type { ClassIntent } from './class'
import type { ClassProjection } from '../projection/class-projection'
import type { Selection } from '../projection/selection'

/** class 编辑键动作：Tab = 加成员、Enter = 加关系、Delete = 删除选中元素 */
type ClassKeyAction = 'delete' | 'add-member' | 'add-relation'

/**
 * 键位 → 动作（class）。这是**就近类比**而非严格语义：class 是有向图，没有 flowchart
 * 的"子/同级"，当前元素附近最近的结构是成员（Tab）与关系（Enter）。带修饰键（Shift-Tab
 * 等）不处理，交给原有行为。
 */
function classKeyAction(key: string, mods: { shift?: boolean } = {}): ClassKeyAction | null {
  if (key === 'Delete' || key === 'Backspace') return 'delete'
  if (key === 'Tab') return mods.shift === true ? null : 'add-member'
  if (key === 'Enter') return mods.shift === true ? null : 'add-relation'
  return null
}

/** 键 → plan（class，工单 05 / ADR-0013）：删除查能力包唯一映射（工单 03），
 * Tab/Enter 落到已有表单浮层（无选中 / 选中不是现存类 → null，不 preventDefault）。 */
export function classKeyPlan(projection: ClassProjection, input: KeyInput): KeyPlan | null {
  const action = classKeyAction(input.key, input.mods)
  if (action === null) return null
  if (action === 'delete') {
    const intent = classDeleteIntent(projection, input.selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  const selection = input.selection
  if (selection === null || selection.kind !== 'class') return null
  if (!projection.classes.some((c) => c.name === selection.name)) return null
  return { intents: [], form: action === 'add-member' ? 'member' : 'relation' }
}

/**
 * 选中元素 → 删除意图（class）：四类可寻址元素各映射到既有 delete-* 意图，
 * 级联（删类连带成员/关系/note）由管线负责——与属性面板的删除走同一条链路，
 * 选中元素已不在投影 / 图表级 / 别种选中 → null（不落码、不 preventDefault）。
 */
export function classDeleteIntent(projection: ClassProjection, selection: Selection | null): ClassIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'class':
      return projection.classes.some((c) => c.name === selection.name)
        ? { type: 'delete-class', name: selection.name }
        : null
    case 'class-member':
      return projection.members.some((m) => m.elementId === selection.elementId)
        ? { type: 'delete-member', elementId: selection.elementId }
        : null
    case 'class-relation':
      return projection.relations.some((r) => r.elementId === selection.elementId)
        ? { type: 'delete-relation', elementId: selection.elementId }
        : null
    case 'class-note':
      return projection.notes.some((n) => n.elementId === selection.elementId)
        ? { type: 'delete-note', elementId: selection.elementId }
        : null
    default:
      return null
  }
}
