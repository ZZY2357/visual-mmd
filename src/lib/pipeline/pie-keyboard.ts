// pie 画布键盘 / 删除语义（architecture-deepening-3 工单 01：自 editing/canvas-keyboard.ts 物理归位，代码块字节级搬移，逻辑零改动）

import { nextFreeName } from './element-id'
import type { KeyInput, KeyPlan } from '../editing/canvas-keyboard'
import type { PieIntent } from './pie'
import type { PieProjection } from '../projection/pie-projection'
import type { Selection } from '../projection/selection'
import { newElementName } from '../../i18n/domain-strings.ts'

/**
 * 选中元素 → 删除意图（pie）：扇区映射到既有 delete-sector 意图；
 * 已不在投影 / null / 图表级 / 别种选中 → null。
 */
export function pieDeleteIntent(projection: PieProjection, selection: Selection | null): PieIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'pie-sector':
      return projection.sectors.some((s) => s.elementId === selection.elementId)
        ? { type: 'delete-sector', elementId: selection.elementId }
        : null
    default:
      return null
  }
}

/**
 * 键 → plan（pie，工单 10 / ADR-0013，工单定案）：
 * - Delete = 删除选中扇区（查 pieDeleteIntent 唯一映射）
 * - 选中扇区上 Tab = 加扇区（锚点插入在该扇区之后——文档序即扇区顺时针渲染序，
 *   新扇区落在它后面）；占位标签避重，数值取 1，不做内联编辑（画布无 data-id，工单降级定案）
 * - Enter 无自然类比（扇区之间没有「相邻结构」的添加语义）→ 不做并记录
 * 注：pie 画布 DOM 无 data-id，键操作实际从结构树选中后经画布键盘生效。
 */
export function pieKeyPlan(projection: PieProjection, input: KeyInput): KeyPlan | null {
  if (input.key === 'Delete' || input.key === 'Backspace') {
    const intent = pieDeleteIntent(projection, input.selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  // Enter 不接（工单定案：无自然类比，记录在案）；只接 Tab
  if (input.key !== 'Tab') return null
  if (input.mods?.shift === true) return null
  const selection = input.selection
  if (selection === null || selection.kind !== 'pie-sector') return null
  const index = projection.sectors.findIndex((s) => s.elementId === selection.elementId)
  if (index === -1) return null
  const label = nextFreeName(newElementName('sector'), projection.sectors.map((s) => s.label))
  return {
    intents: [
      { type: 'add-sector', label, value: '1', afterElementId: selection.elementId } satisfies PieIntent,
    ],
    newElementTarget: {
      selection: { kind: 'pie-sector', elementId: `sector:${index + 2}` },
    },
  }
}
