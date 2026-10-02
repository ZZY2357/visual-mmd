// timeline 画布键盘 / 删除语义（architecture-deepening-3 工单 01：自 editing/canvas-keyboard.ts 物理归位，代码块字节级搬移，逻辑零改动）

import { nextFreeName } from './element-id'
import type { KeyInput, KeyPlan } from '../editing/canvas-keyboard'
import type { TimelineIntent } from './timeline'
import type { TimelineProjection } from '../projection/timeline-projection'
import type { Selection } from '../projection/selection'

/**
 * 选中元素 → 删除意图（timeline，more-diagrams 工单 05）：时期（连同其事件，由管线负责
 * 清理同行 inline 段与续行事件行）、事件两类各映射到既有 delete-* 意图；section 无删除
 * 意图（清单外，删 section 属改结构，未定义）；已不在投影 / null / 别种选中 → null。
 */
export function timelineDeleteIntent(
  projection: TimelineProjection,
  selection: Selection | null,
): TimelineIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'timeline-period':
      return projection.periods.some((p) => p.elementId === selection.elementId)
        ? { type: 'delete-period', elementId: selection.elementId }
        : null
    case 'timeline-event':
      return projection.events.some((e) => e.elementId === selection.elementId)
        ? { type: 'delete-event', elementId: selection.elementId }
        : null
    default:
      return null
  }
}

/**
 * 键 → plan（timeline，more-diagrams 工单 05 / ADR-0013 就近类比）：
 * - Delete = 删除选中元素（查 timelineDeleteIntent 唯一映射）
 * - Tab = 给该时期加事件（落续行 `: 文本`，锚点 = 该时期最后一个事件行 / 时期行）；
 *   新事件仅选中（事件不做内联编辑——工单 05 明确）
 * - Enter = 加下一个时期（落在该时期块之后）；新时期仅选中
 * 非时期选中 / 已不在投影 → null（不 preventDefault、不落码）。
 */
export function timelineKeyPlan(projection: TimelineProjection, input: KeyInput): KeyPlan | null {
  if (input.key === 'Delete' || input.key === 'Backspace') {
    const intent = timelineDeleteIntent(projection, input.selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  if (input.key !== 'Tab' && input.key !== 'Enter') return null
  if (input.mods?.shift === true) return null
  const selection = input.selection
  if (selection === null || selection.kind !== 'timeline-period') return null
  const period = projection.periods.find((p) => p.elementId === selection.elementId)
  if (period === undefined) return null
  if (input.key === 'Tab') {
    const text = nextFreeName('新事件', period.events.map((e) => e.text))
    return {
      intents: [{ type: 'add-event', periodElementId: period.elementId, text }],
      newElementTarget: {
        selection: { kind: 'timeline-event', elementId: `event:${period.nextEventOrdinal}` },
      },
    }
  }
  const text = nextFreeName('新阶段', projection.periods.map((p) => p.text))
  return {
    intents: [{ type: 'add-period', text, afterElementId: period.tailElementId }],
    newElementTarget: {
      selection: { kind: 'timeline-period', elementId: `period:${period.nextPeriodOrdinal}` },
    },
  }
}
