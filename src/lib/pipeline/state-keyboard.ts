// state 画布键盘 / 删除语义（architecture-deepening-3 工单 01：自 editing/canvas-keyboard.ts 物理归位，代码块字节级搬移，逻辑零改动）

import { nextFreeName } from './element-id'
import type { KeyInput, KeyPlan } from '../editing/canvas-keyboard'
import type { StateIntent } from './state'
import type { StateProjection } from '../projection/state-projection'
import type { Selection } from '../projection/selection'

// ---------- state 编辑键（more-diagrams 工单 02 / ADR-0013）：就近结构映射 ----------

/**
 * 选中元素 → 删除意图（state）：状态（级联删描述/复合块/触及转移与 note，由管线负责）、
 * 转移、note 三类各映射到既有 delete-* 意图；已不在投影 / null / 别种选中 → null。
 */
export function stateDeleteIntent(projection: StateProjection, selection: Selection | null): StateIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'state':
      return projection.states.some((s) => s.id === selection.id)
        ? { type: 'delete-state', id: selection.id }
        : null
    case 'state-transition':
      return projection.transitions.some((t) => t.elementId === selection.elementId)
        ? { type: 'delete-transition', elementId: selection.elementId }
        : null
    case 'state-note':
      return projection.notes.some((n) => n.elementId === selection.elementId)
        ? { type: 'delete-note', elementId: selection.elementId }
        : null
    default:
      return null
  }
}

/**
 * 键 → plan（state，more-diagrams 工单 02 / ADR-0013 就近类比）：
 * - Delete = 删除选中元素（查 stateDeleteIntent 唯一映射）
 * - Tab = 加同级状态（落码 + 选中 + 内联编辑描述）；复合状态内部的状态，新状态
 *   落在同一复合里（parentElementId），锚点为该状态的最后一个归属元素
 * - Enter = 从该状态拉一条转移（落到已有 AddTransitionInlineForm 表单浮层，不新造）
 */
export function stateKeyPlan(projection: StateProjection, input: KeyInput): KeyPlan | null {
  if (input.key === 'Delete' || input.key === 'Backspace') {
    const intent = stateDeleteIntent(projection, input.selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  if (input.key !== 'Tab' && input.key !== 'Enter') return null
  if (input.mods?.shift === true) return null
  const selection = input.selection
  if (selection === null || selection.kind !== 'state') return null
  const state = projection.states.find((s) => s.id === selection.id)
  if (state === undefined) return null
  if (input.key === 'Enter') return { intents: [], form: 'transition' }
  const id = nextFreeName('s', projection.states.map((s) => s.id))
  const intent: StateIntent = {
    type: 'add-state',
    id,
    afterElementId: state.tailElementId ?? undefined,
    parentElementId:
      state.parentId !== null
        ? (projection.states.find((s) => s.id === state.parentId)?.elementId ?? undefined)
        : undefined,
  }
  return {
    intents: [intent],
    newElementTarget: {
      selection: { kind: 'state', id },
      inlineEdit: { kind: 'state', id },
    },
  }
}
