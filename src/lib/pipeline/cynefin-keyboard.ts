// cynefin 画布键盘 / 删除语义（architecture-deepening-3 工单 01：自 editing/canvas-keyboard.ts 物理归位，代码块字节级搬移，逻辑零改动）

import { nextFreeName } from './element-id'
import type { KeyInput, KeyPlan } from '../editing/canvas-keyboard'
import type { CynefinIntent } from './cynefin'
import type { CynefinProjection } from '../projection/cynefin-projection'
import type { Selection } from '../projection/selection'

// ---------- cynefin 编辑键（more-diagrams 工单 25 / ADR-0013）：就近结构映射 ----------

/**
 * 选中元素 → 删除意图（cynefin）：条目（位置序）、转移（位置序）两类各映射到既有
 * delete-* 意图；域名词行是固定五域的分组声明语句（删掉会让该域消失，工单定案不做
 * 删除——与 ishikawa 鱼头同口径）；已不在投影 / null / 图表级 / 别种选中 → null。
 */
export function cynefinDeleteIntent(
  projection: CynefinProjection,
  selection: Selection | null,
): CynefinIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'cynefin-item':
      return projection.items.some((i) => i.elementId === selection.elementId)
        ? { type: 'delete-item', elementId: selection.elementId }
        : null
    case 'cynefin-transition':
      return projection.transitions.some((t) => t.elementId === selection.elementId)
        ? { type: 'delete-transition', elementId: selection.elementId }
        : null
    default:
      return null
  }
}

/**
 * 键 → plan（cynefin，工单 25 / ADR-0013 就近类比，工单定案）：
 * - Delete = 删除选中元素（查 cynefinDeleteIntent 唯一映射；条目/转移，域名词行不可删）
 * - 选中条目上 Tab = 在该条目之后加条目（落地在同域内，锚点 = 该条目行，新条目位置序
 *   = 该条目文档序 + 1；占位文本避重、不做内联编辑——画布无 data-id，键操作实际从结构树
 *   选中后经画布键盘生效，与 ishikawa/treemap 降级同口径）
 * - 选中域名词行上 Tab = 在该域下加条目（锚点 = 域名词行，新条目位置序 = 该域末条目 + 1）
 * - 转移上无 Tab/Enter 语义（不扩就近类比；加转移走右键空白菜单 / 图表级表单）
 * - Enter 无自然类比（cynefin 的条目之间没有「同级另一类」的添加语义）→ 不做并记录
 */
export function cynefinKeyPlan(projection: CynefinProjection, input: KeyInput): KeyPlan | null {
  if (input.key === 'Delete' || input.key === 'Backspace') {
    const intent = cynefinDeleteIntent(projection, input.selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  if (input.key !== 'Tab') return null
  if (input.mods?.shift === true) return null
  const selection = input.selection
  if (selection === null) return null

  if (selection.kind === 'cynefin-domain') {
    const domain = projection.domains.find((d) => d.name === selection.name)
    if (domain === undefined) return null
    const text = nextFreeName('新条目', projection.items.map((i) => i.text))
    // 该域末条目之后（域无条目则紧跟域名词行）；新条目位置序 = 域末条目序号 + 1
    const lastItem = domain.items[domain.items.length - 1]
    const anchorId = lastItem !== undefined ? lastItem.elementId : domain.elementId
    const ordinal = lastItem !== undefined ? projection.items.findIndex((i) => i.elementId === lastItem.elementId) + 2 : projection.items.length + 1
    return {
      intents: [{ type: 'add-item', domain: domain.name, text, afterElementId: anchorId }],
      newElementTarget: { selection: { kind: 'cynefin-item', elementId: `cynefin-item:${ordinal}` } },
    }
  }

  if (selection.kind === 'cynefin-item') {
    const index = projection.items.findIndex((i) => i.elementId === selection.elementId)
    if (index === -1) return null
    const item = projection.items[index]
    const text = nextFreeName('新条目', projection.items.map((i) => i.text))
    return {
      intents: [{ type: 'add-item', domain: item.domain, text, afterElementId: item.elementId }],
      newElementTarget: { selection: { kind: 'cynefin-item', elementId: `cynefin-item:${index + 2}` } },
    }
  }

  return null
}
