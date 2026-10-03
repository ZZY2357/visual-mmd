// quadrant 画布键盘 / 删除语义（architecture-deepening-3 工单 01：自 editing/canvas-keyboard.ts 物理归位，代码块字节级搬移，逻辑零改动）

import { nextFreeName } from './element-id'
import type { KeyInput, KeyPlan } from '../editing/canvas-keyboard'
import type { QuadrantIntent } from './quadrant'
import type { QuadrantProjection } from '../projection/quadrant-projection'
import type { Selection } from '../projection/selection'
import { newElementName } from '../../i18n/domain-strings.ts'

// ---------- quadrant 编辑键（more-diagrams 工单 12 / ADR-0013）：就近结构映射 ----------

/**
 * 选中元素 → 删除意图（quadrant）：点映射到既有 delete-point 意图；
 * 轴 / 象限标题是**文档级属性元素**——无删除语义（删轴行/象限行会让段文本无处安放，
 * 工单定案不做），返回 null；已不在投影 / null / 图表级 / 别种选中 → null。
 */
export function quadrantDeleteIntent(
  projection: QuadrantProjection,
  selection: Selection | null,
): QuadrantIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'quadrant-point':
      return projection.points.some((p) => p.elementId === selection.elementId)
        ? { type: 'delete-point', elementId: selection.elementId }
        : null
    default:
      return null
  }
}

/**
 * 键 → plan（quadrant，工单 12 / ADR-0013，工单定案）：
 * - Delete = 删除选中点（查 quadrantDeleteIntent 唯一映射）
 * - 选中点上 Tab = 加点（锚点插入在该点之后——文档序即位置序身份的顺序），
 *   坐标落图正中 0.5, 0.5，文本避重，落码后选中新点并进入内联命名（点有 data-id
 *   寻址，工单 12 实测位置序反注可行）
 * - 轴 / 象限标题上 Delete/Tab 无动作（文档级属性元素，工单定案）
 * - Enter 无自然类比（点与点之间没有「相邻结构」的添加语义）→ 不做并记录
 */
export function quadrantKeyPlan(projection: QuadrantProjection, input: KeyInput): KeyPlan | null {
  if (input.key === 'Delete' || input.key === 'Backspace') {
    const intent = quadrantDeleteIntent(projection, input.selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  // Enter 不接（工单定案：无自然类比，记录在案）；只接 Tab
  if (input.key !== 'Tab') return null
  if (input.mods?.shift === true) return null
  const selection = input.selection
  if (selection === null || selection.kind !== 'quadrant-point') return null
  const index = projection.points.findIndex((p) => p.elementId === selection.elementId)
  if (index === -1) return null
  const text = nextFreeName(newElementName('point'), projection.points.map((p) => p.text))
  const newElementId = `point:${index + 2}`
  return {
    intents: [
      {
        type: 'add-point',
        text,
        x: '0.5',
        y: '0.5',
        afterElementId: selection.elementId,
      } satisfies QuadrantIntent,
    ],
    newElementTarget: {
      selection: { kind: 'quadrant-point', elementId: newElementId },
      inlineEdit: { kind: 'quadrant-point', elementId: newElementId },
    },
  }
}
