// zenuml 画布键盘 / 删除语义（architecture-deepening-3 工单 01：自 editing/canvas-keyboard.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { KeyInput, KeyPlan } from '../editing/canvas-keyboard'
import type { ZenumlIntent } from './zenuml'
import type { ZenumlProjection } from '../projection/zenuml-projection'
import type { Selection } from '../projection/selection'

// ---------- zenuml 编辑键（more-diagrams 工单 19 / ADR-0013）：就近结构映射 ----------

/**
 * 选中元素 → 删除意图（zenuml）：消息映射到 delete-zenuml-message；
 * 参与者（有声明行的显式声明）映射到 delete-zenuml-participant（仅删声明行，消息端点不级联——
 * zenuml 隐式端点由消息行持有，删声明行后端点会重新隐式合成同名参与者）；
 * 片段（分组）无删除意图（删片段要重排块内缩进/花括号，工单 19 不做，从结构树删元素走属性表单）；
 * 已不在投影 / null / 图表级 / 别种选中 → null。
 */
export function zenumlDeleteIntent(
  projection: ZenumlProjection,
  selection: Selection | null,
): ZenumlIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'zenuml-message':
      return projection.messages.some((m) => m.elementId === selection.elementId)
        ? { type: 'delete-zenuml-message', elementId: selection.elementId }
        : null
    case 'zenuml-participant':
      return projection.participants.some((p) => p.elementId === selection.elementId && p.declared)
        ? { type: 'delete-zenuml-participant', elementId: selection.elementId }
        : null
    default:
      return null
  }
}

/**
 * 键 → plan（zenuml，工单 19 / ADR-0013）：
 * - Delete = 删除选中元素（消息 / 参与者声明，查 zenumlDeleteIntent 唯一映射）
 * - 选中消息上 `Tab` = 加下一条消息（落到 AddZenumlMessageInlineForm 表单浮层，
 *   发起方预填该消息的发起方，不直接落码——工单 19 明确）
 * - 选中消息 / 参与者上 `Enter` 无自然类比（消息是平铺位置序，无「进入/展开」语义）→ 不做
 * - 片段（分组）上 Tab/Delete 均无动作（分组不是「就近文本结构」，工单 19 不做）
 * 注：zenuml 画布 DOM 无 data-id（见 zenuml-adapter），画布选中不产生——键路径实际由
 * 结构树选中驱动（结构树行内键经同一 usecanvasKeyPlan）。
 */
export function zenumlKeyPlan(projection: ZenumlProjection, input: KeyInput): KeyPlan | null {
  if (input.key === 'Delete' || input.key === 'Backspace') {
    const intent = zenumlDeleteIntent(projection, input.selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  // Enter 不接（工单 19 定案：无自然类比，记录在案）；只接 Tab
  if (input.key !== 'Tab') return null
  if (input.mods?.shift === true) return null
  const selection = input.selection
  if (selection === null || selection.kind !== 'zenuml-message') return null
  if (!projection.messages.some((m) => m.elementId === selection.elementId)) return null
  return { intents: [], form: 'zenuml-message' }
}
