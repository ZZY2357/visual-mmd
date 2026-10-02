// c4 画布键盘 / 删除语义（architecture-deepening-3 工单 01：自 editing/canvas-keyboard.ts 物理归位，代码块字节级搬移，逻辑零改动）

import { C4_ELEMENT_MACROS, isValidC4Alias, type C4Intent } from './c4'
import { nextFreeName } from './element-id'
import type { KeyInput, KeyPlan } from '../editing/canvas-keyboard'
import { c4KnownAliases, type C4Projection } from '../projection/c4-projection'
import type { Selection } from '../projection/selection'

// ---------- C4 编辑键（more-diagrams 工单 18 / ADR-0013）：就近结构映射 ----------

/**
 * 选中元素 → 删除意图（C4）：元素 / 边界 / 关系三类各映射到既有 delete-* 意图
 * （删元素会级联删去引用它的关系、删边界只删开行，级联在 C4Parser.resolveDelete* 内完成）。
 * 已不在投影 / null / 图表级 / 别种选中 → null。
 */
export function c4DeleteIntent(projection: C4Projection, selection: Selection | null): C4Intent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'c4-element':
      return projection.elements.some((e) => e.elementId === selection.elementId)
        ? { type: 'delete-c4-element', elementId: selection.elementId }
        : null
    case 'c4-boundary':
      return projection.boundaries.some((b) => b.elementId === selection.elementId)
        ? { type: 'delete-c4-boundary', elementId: selection.elementId }
        : null
    case 'c4-relation':
      return projection.relations.some((r) => r.elementId === selection.elementId)
        ? { type: 'delete-rel', elementId: selection.elementId }
        : null
    default:
      return null
  }
}

/**
 * 键 → plan（C4，工单 18 / ADR-0013）：
 * - Delete = 删除选中元素（元素 / 边界 / 关系，查 c4DeleteIntent 唯一映射）
 * - 选中**元素**上 Tab = 加同类元素（沿用该元素的声明宏，alias 由该宏种类前缀 + 序号避重；
 *   label 留空回落 alias 展示）
 * - 选中**元素**上 Enter = 从该元素拉一条关系（落到连线表单浮层，不新造浮层）
 * - 边界上不接 Tab/Enter（C4 边界的「同类」= 同类边界，语义含糊，工单定案不做——
 *   添加入口走空白右键菜单）
 * 不做内联编辑：画布 DOM 无 data-id（research §4 实测，见 c4-adapter），命名交给结构树 /
 * 属性表单（与 venn/treemap 降级同口径）。
 */
export function c4KeyPlan(projection: C4Projection, input: KeyInput): KeyPlan | null {
  if (input.key === 'Delete' || input.key === 'Backspace') {
    const intent = c4DeleteIntent(projection, input.selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  if (input.key !== 'Tab' && input.key !== 'Enter') return null
  if (input.mods?.shift === true) return null
  const selection = input.selection
  if (selection === null || selection.kind !== 'c4-element') return null
  const element = projection.elements.find((e) => e.elementId === selection.elementId)
  if (element === undefined) return null
  const used = c4KnownAliases(projection)
  if (input.key === 'Enter') {
    // 从这里拉关系：端点 = 该元素的 alias（关系引用语法标识），终点由表单选择
    return { intents: [], form: 'c4-relation' }
  }
  // Tab = 加同类元素：沿用该元素的声明宏（Person → Person、System_Ext → System_Ext），
  // alias 以元素种类前缀（person → Person、system → System…）避重
  if (C4_ELEMENT_MACROS[element.macro] === undefined) return null
  const alias = nextFreeName(c4AliasBase(element.macro), used)
  if (!isValidC4Alias(alias)) return null
  return {
    intents: [{ type: 'add-c4-element', macro: element.macro, alias, afterElementId: element.elementId }],
    newElementTarget: { selection: { kind: 'c4-element', elementId: `c4-element:${alias}` } },
  }
}

/** 新 C4 元素的 alias 前缀（Tab 加同类时避重用）：取宏名去掉下划线后缀的首段 */
function c4AliasBase(macro: string): string {
  const head = macro.split('_')[0]
  return head === '' ? 'Element' : head
}
