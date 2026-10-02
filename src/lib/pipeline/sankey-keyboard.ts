// sankey 画布键盘 / 删除语义（architecture-deepening-3 工单 01：自 editing/canvas-keyboard.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { KeyInput, KeyPlan } from '../editing/canvas-keyboard'
import type { SankeyIntent } from './sankey'
import type { SankeyProjection } from '../projection/sankey-projection'
import type { Selection } from '../projection/selection'

// ---------- sankey 编辑键（more-diagrams 工单 13 / ADR-0013）：就近结构映射 ----------

/**
 * 选中元素 → 删除意图（sankey）：链路映射到既有 delete-link 意图。节点不落码
 * （链路行去重派生），没有「删除节点」的语法动作 → null（重命名在属性表单）；
 * 已不在投影 / null / 图表级 / 别种选中 → null。
 */
export function sankeyDeleteIntent(
  projection: SankeyProjection,
  selection: Selection | null,
): SankeyIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'sankey-link':
      return projection.links.some((l) => l.elementId === selection.elementId)
        ? { type: 'delete-link', elementId: selection.elementId }
        : null
    default:
      return null
  }
}

/**
 * 键 → plan（sankey，工单 13 / ADR-0013 就近类比，工单定案）：
 * - Delete = 删除选中链路（查 sankeyDeleteIntent 唯一映射）
 * - 选中链路上 Tab = 加链路（落到 AddSankeyLinkInlineForm 表单浮层，source 预填同源，
 *   不直接落码）；选中节点上 Tab 无自然类比（CSV 三列没有「相邻结构」的添加语义，
 *   节点不落码）→ 不做并记录
 * - Enter 无自然类比（链路是整行 CSV 记录，没有字段级结构键）→ 不做并记录
 * - 双击内联编辑不做：sankey 的可编辑字段是 CSV 三列，链路是 path、节点标签在独立的
 *   g.node-labels 里且身份是全局计数器，没有可寻址的单值文本锚点（工单定案）。
 * 注：sankey 画布 DOM 经位置序反注可寻址（见 sankey-adapter），画布键盘对画布选中的
 * 链路生效；结构树选中同样经画布键盘链路（读 store 选中）生效。
 */
export function sankeyKeyPlan(projection: SankeyProjection, input: KeyInput): KeyPlan | null {
  if (input.key === 'Delete' || input.key === 'Backspace') {
    const intent = sankeyDeleteIntent(projection, input.selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  // Enter 不接（工单定案：无自然类比，记录在案）；只接 Tab
  if (input.key !== 'Tab') return null
  if (input.mods?.shift === true) return null
  const selection = input.selection
  if (selection === null || selection.kind !== 'sankey-link') return null
  if (!projection.links.some((l) => l.elementId === selection.elementId)) return null
  return { intents: [], form: 'sankey-link' }
}
