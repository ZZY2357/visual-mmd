// xychart 画布键盘 / 删除语义（architecture-deepening-3 工单 01：自 editing/canvas-keyboard.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { KeyInput, KeyPlan } from '../editing/canvas-keyboard'
import type { XychartIntent } from './xychart'
import type { XychartProjection } from '../projection/xychart-projection'
import type { Selection } from '../projection/selection'

// ---------- xychart 编辑键（more-diagrams 工单 14 / ADR-0013）：就近结构映射 ----------

/**
 * 选中元素 → 删除意图（xychart）：系列映射到既有 delete-series 意图。轴与标题是
 * 文档级属性元素，没有「删除」的语法动作（只能改字段）→ null；已不在投影 / null /
 * 图表级 / 别种选中 → null。
 */
export function xychartDeleteIntent(
  projection: XychartProjection,
  selection: Selection | null,
): XychartIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'xychart-series':
      return projection.series.some((s) => s.elementId === selection.elementId)
        ? { type: 'delete-series', elementId: selection.elementId }
        : null
    default:
      return null
  }
}

/**
 * 键 → plan（xychart，工单 14 / ADR-0013 就近类比，工单定案）：
 * - Delete = 删除选中系列（查 xychartDeleteIntent 唯一映射）
 * - 选中系列上 Tab = 加系列（落到 AddXychartSeriesInlineForm 表单浮层，锚点为该系列行
 *   ——新系列落在其后；类型预取同款 bar↔bar / line↔line，不直接落码）；轴 / 标题上
 *   Tab 无自然类比（文档级属性元素，编辑走属性表单）→ 不做并记录
 * - Enter 无自然类比（系列名双击内联编辑承担，工单定案）→ 不做并记录
 * 注：xychart 画布 DOM 经类名组 + 位置序反注可寻址（见 xychart-adapter），画布键盘对
 * 画布选中的系列生效；结构树选中同样经画布键盘链路（读 store 选中）生效。
 */
export function xychartKeyPlan(projection: XychartProjection, input: KeyInput): KeyPlan | null {
  if (input.key === 'Delete' || input.key === 'Backspace') {
    const intent = xychartDeleteIntent(projection, input.selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  // Enter 不接（改系列名走双击内联编辑，工单定案）；只接 Tab
  if (input.key !== 'Tab') return null
  if (input.mods?.shift === true) return null
  const selection = input.selection
  if (selection === null || selection.kind !== 'xychart-series') return null
  const current = projection.series.find((s) => s.elementId === selection.elementId)
  if (current === undefined) return null
  // 类型预取同款：bar 上加 bar、line 上加 line（就近语义）
  return { intents: [], form: current.seriesType === 'bar' ? 'xychart-bar' : 'xychart-line' }
}
