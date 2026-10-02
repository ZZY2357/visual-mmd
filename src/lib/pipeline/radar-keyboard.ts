// radar 画布键盘 / 删除语义（architecture-deepening-3 工单 01：自 editing/canvas-keyboard.ts 物理归位，代码块字节级搬移，逻辑零改动）

import { nextRadarId, type RadarIntent } from './radar'
import type { KeyInput, KeyPlan } from '../editing/canvas-keyboard'
import type { RadarProjection } from '../projection/radar-projection'
import type { Selection } from '../projection/selection'

// ---------- radar 编辑键（more-diagrams 工单 15 / ADR-0013）：就近结构映射 ----------

/**
 * 选中元素 → 删除意图（radar）：轴（级联删曲线条目，由管线负责）与曲线两类
 * 各映射到既有 delete-* 意图；已不在投影 / null / 图表级 / 别种选中 → null。
 */
export function radarDeleteIntent(
  projection: RadarProjection,
  selection: Selection | null,
): RadarIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'radar-axis':
      return projection.axes.some((a) => a.elementId === selection.elementId)
        ? { type: 'delete-axis', elementId: selection.elementId }
        : null
    case 'radar-curve':
      return projection.curves.some((c) => c.elementId === selection.elementId)
        ? { type: 'delete-curve', elementId: selection.elementId }
        : null
    default:
      return null
  }
}

/**
 * 键 → plan（radar，工单 15 / ADR-0013，工单定案，与 pie 同构）：
 * - Delete = 删除选中元素（查 radarDeleteIntent 唯一映射；删轴的曲线级联由管线负责）
 * - 选中轴上 Tab = 加轴（管线语义：新轴总是追加到最后一条轴行行尾 → 新轴位置序 =
 *   轴总数+1）；占位 id 与占位标签「新轴」避重由管线负责，不做内联编辑（画布无 data-id）
 * - 选中曲线上 Tab = 加曲线（锚点插入在该曲线之后）；键值形态全 0（新曲线对每轴
 *   都有条目，mermaid computeCurveEntries 缺条目抛错），占位 id 与标签「新曲线」由管线负责
 * - Enter 无自然类比（轴 / 曲线之间没有「相邻结构」的添加语义）→ 不做并记录
 * 注：radar 画布 DOM 无 data-id（渲染器全程只有 class），键操作实际从结构树选中
 * 后经画布键盘生效。
 */
export function radarKeyPlan(projection: RadarProjection, input: KeyInput): KeyPlan | null {
  if (input.key === 'Delete' || input.key === 'Backspace') {
    const intent = radarDeleteIntent(projection, input.selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  // Enter 不接（工单定案：无自然类比，记录在案）；只接 Tab
  if (input.key !== 'Tab') return null
  if (input.mods?.shift === true) return null
  const selection = input.selection
  if (selection === null) return null
  if (selection.kind === 'radar-axis') {
    if (!projection.axes.some((a) => a.elementId === selection.elementId)) return null
    const id = nextRadarId('axis', projection.axes.map((a) => a.id))
    return {
      intents: [{ type: 'add-axis', id, afterElementId: selection.elementId } satisfies RadarIntent],
      newElementTarget: {
        // 管线语义：加轴总是追加到最后一条轴行行尾 → 新轴位置序 = 轴总数 + 1
        selection: { kind: 'radar-axis', elementId: `axis:${projection.axes.length + 1}` },
      },
    }
  }
  if (selection.kind === 'radar-curve') {
    if (!projection.curves.some((c) => c.elementId === selection.elementId)) return null
    const id = nextRadarId('curve', projection.curves.map((c) => c.id))
    return {
      intents: [{ type: 'add-curve', id, afterElementId: selection.elementId } satisfies RadarIntent],
      newElementTarget: {
        selection: {
          kind: 'radar-curve',
          elementId: `curve:${projection.curves.findIndex((c) => c.elementId === selection.elementId) + 2}`,
        },
      },
    }
  }
  return null
}
