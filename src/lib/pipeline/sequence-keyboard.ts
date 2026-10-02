// sequence 画布键盘 / 删除语义（architecture-deepening-3 工单 01：自 editing/canvas-keyboard.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { KeyInput, KeyPlan } from '../editing/canvas-keyboard'
import type { SequenceIntent } from './sequence'
import type { SequenceProjection } from '../projection/sequence-projection'
import type { Selection } from '../projection/selection'

/** sequence 编辑键动作：Tab = 加参与者、Enter = 加消息、Delete = 删除选中元素 */
type SequenceKeyAction = 'delete' | 'add-participant' | 'add-message'

/**
 * 键位 → 动作（sequence）：参与者是列、消息是行，最近的"结构"是参与者（Tab）与消息（Enter）。
 * 带修饰键不处理。方向键语义不受影响（ADR-0011：仍是方位导航）。
 */
function sequenceKeyAction(key: string, mods: { shift?: boolean } = {}): SequenceKeyAction | null {
  if (key === 'Delete' || key === 'Backspace') return 'delete'
  if (key === 'Tab') return mods.shift === true ? null : 'add-participant'
  if (key === 'Enter') return mods.shift === true ? null : 'add-message'
  return null
}

/** 键 → plan（sequence，工单 05 / ADR-0013）：Tab 加参与者不依赖选中（参与者是列、
 * 没有锚点，走既有创建路径）；加消息需要选中一个现存参与者作为起点与锚点。 */
export function sequenceKeyPlan(projection: SequenceProjection, input: KeyInput): KeyPlan | null {
  const action = sequenceKeyAction(input.key, input.mods)
  if (action === null) return null
  if (action === 'delete') {
    const intent = sequenceDeleteIntent(projection, input.selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  if (action === 'add-participant') return { intents: [], form: 'participant' }
  const selection = input.selection
  if (selection === null || selection.kind !== 'participant') return null
  if (!projection.participants.some((p) => p.actorId === selection.actorId)) return null
  return { intents: [], form: 'message' }
}

/** 选中元素 → 删除意图（sequence）：参与者 / 消息 / 注释 / 逻辑块，级联由管线负责。 */
export function sequenceDeleteIntent(
  projection: SequenceProjection,
  selection: Selection | null,
): SequenceIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'participant':
      return projection.participants.some((p) => p.actorId === selection.actorId)
        ? { type: 'delete-participant', actorId: selection.actorId }
        : null
    case 'message':
      return projection.messages.some((m) => m.elementId === selection.elementId)
        ? { type: 'delete-message', elementId: selection.elementId }
        : null
    case 'note':
      return projection.notes.some((n) => n.elementId === selection.elementId)
        ? { type: 'delete-note', elementId: selection.elementId }
        : null
    case 'block':
      return projection.blocks.some((b) => b.elementId === selection.elementId)
        ? { type: 'delete-block', elementId: selection.elementId }
        : null
    default:
      return null
  }
}
