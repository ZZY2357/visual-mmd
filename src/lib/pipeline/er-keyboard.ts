// er 画布键盘 / 删除语义（architecture-deepening-3 工单 01：自 editing/canvas-keyboard.ts 物理归位，代码块字节级搬移，逻辑零改动）

import { nextFreeName } from './element-id'
import type { KeyInput, KeyPlan } from '../editing/canvas-keyboard'
import type { ErIntent } from './er'
import type { ErProjection } from '../projection/er-projection'
import type { Selection } from '../projection/selection'

// ---------- er 编辑键（more-diagrams 工单 03 / ADR-0013）：就近结构映射 ----------

/**
 * 选中元素 → 删除意图（er）：实体（级联删属性块与触及关系，由管线负责）、属性、
 * 关系三类各映射到既有 delete-* 意图；已不在投影 / null / 别种选中 → null。
 */
export function erDeleteIntent(projection: ErProjection, selection: Selection | null): ErIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'er-entity':
      return projection.entities.some((e) => e.name === selection.name)
        ? { type: 'delete-entity', name: selection.name }
        : null
    case 'er-attribute':
      return projection.attributes.some((a) => a.elementId === selection.elementId)
        ? { type: 'delete-attribute', elementId: selection.elementId }
        : null
    case 'er-relation':
      return projection.relations.some((r) => r.elementId === selection.elementId)
        ? { type: 'delete-relation', elementId: selection.elementId }
        : null
    default:
      return null
  }
}

/**
 * 键 → plan（er，more-diagrams 工单 03 / ADR-0013 就近类比）：
 * - Delete = 删除选中元素（查 erDeleteIntent 唯一映射）
 * - Tab = 给该实体加属性（落码 + 选中；属性不做内联编辑——工单 03 明确，属性的双击
 *   与内联命名都不做，字段在右侧表单改）
 * - Enter = 从该实体拉一条关系（落到已有 AddErRelationInlineForm 表单浮层，不新造）
 */
export function erKeyPlan(projection: ErProjection, input: KeyInput): KeyPlan | null {
  if (input.key === 'Delete' || input.key === 'Backspace') {
    const intent = erDeleteIntent(projection, input.selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  if (input.key !== 'Tab' && input.key !== 'Enter') return null
  if (input.mods?.shift === true) return null
  const selection = input.selection
  if (selection === null || selection.kind !== 'er-entity') return null
  const entity = projection.entities.find((e) => e.name === selection.name)
  if (entity === undefined) return null
  if (input.key === 'Enter') return { intents: [], form: 'er-relation' }
  const attrName = nextFreeName('field', entity.attributes.map((a) => a.name))
  return {
    intents: [
      { type: 'add-attribute', entity: entity.name, attrType: 'string', name: attrName },
    ],
    newElementTarget: {
      selection: { kind: 'er-attribute', elementId: `attr:${entity.nextAttrOrdinal}` },
    },
  }
}
