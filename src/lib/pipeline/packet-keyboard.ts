// packet 画布键盘 / 删除语义（architecture-deepening-3 工单 01：自 editing/canvas-keyboard.ts 物理归位，代码块字节级搬移，逻辑零改动）

import { PACKET_DEFAULT_FIELD_COUNT, type PacketIntent } from './packet'
import { nextFreeName } from './element-id'
import type { KeyInput, KeyPlan } from '../editing/canvas-keyboard'
import type { PacketProjection } from '../projection/packet-projection'
import type { Selection } from '../projection/selection'
import { newElementName } from '../../i18n/domain-strings.ts'

// ---------- packet 编辑键（more-diagrams 工单 16 / ADR-0013）：就近结构映射 ----------

/**
 * 选中元素 → 删除意图（packet）：字段映射到既有 delete-field 意图（管线侧校验结果
 * 序列连续性——后续显式起点字段会因位移拒绝落码，键位安静地无动作）；
 * 已不在投影 / null / 图表级 / 别种选中 → null。
 */
export function packetDeleteIntent(
  projection: PacketProjection,
  selection: Selection | null,
): PacketIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'packet-field':
      return projection.fields.some((f) => f.elementId === selection.elementId)
        ? { type: 'delete-field', elementId: selection.elementId }
        : null
    default:
      return null
  }
}

/**
 * 键 → plan（packet，工单 16 / ADR-0013，工单定案）：
 * - Delete = 删除选中字段（查 packetDeleteIntent 唯一映射；结果序列不连续时管线拒绝）
 * - 选中字段上 Tab = 加字段（+count 形态衔接前序——工单定案；锚点插入在该字段之后，
 *   缺省位宽 8（一个字节），名称避重），落码后选中新字段并进入内联命名
 * - Enter 无自然类比（字段是平铺序列，无「进入/展开」语义）→ 不做并记录
 */
export function packetKeyPlan(projection: PacketProjection, input: KeyInput): KeyPlan | null {
  if (input.key === 'Delete' || input.key === 'Backspace') {
    const intent = packetDeleteIntent(projection, input.selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  // Enter 不接（工单定案：无自然类比，记录在案）；只接 Tab
  if (input.key !== 'Tab') return null
  if (input.mods?.shift === true) return null
  const selection = input.selection
  if (selection === null || selection.kind !== 'packet-field') return null
  const index = projection.fields.findIndex((f) => f.elementId === selection.elementId)
  if (index === -1) return null
  const name = nextFreeName(newElementName('field'), projection.fields.map((f) => f.name))
  const newElementId = `field:${index + 2}`
  return {
    intents: [
      {
        type: 'add-field',
        name,
        count: `${PACKET_DEFAULT_FIELD_COUNT}`,
        afterElementId: selection.elementId,
      } satisfies PacketIntent,
    ],
    newElementTarget: {
      selection: { kind: 'packet-field', elementId: newElementId },
      inlineEdit: { kind: 'packet-field', elementId: newElementId },
    },
  }
}
