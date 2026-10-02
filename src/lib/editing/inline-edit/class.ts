import { isValidClassName } from '../../pipeline/class'
import type { DiagramInlineEditDefinition } from '../inline-edit'
import { targetFromDataId } from './dom'

/**
 * class（工单 05）双击内联编辑：双击类名 = rename-class（类名即显示文本，
 * 与空白新建后命名同目标）。
 */

/** class：双击是否落在**类名文本**上。沿 DOM 向上找最近的、可见文本恰等于类名的元素；
 * 类节点内部的成员正文（另一行文本）与类名不等，故不会进入改名——与 spec 决策
 * 「双击成员正文不做内联编辑」一致。双击类框本身（类无成员时其文本即类名）仍命中。 */
function classTitleClicked(target: EventTarget | null, name: string): boolean {
  if (!(target instanceof Element)) return false
  let el: Element | null = target
  while (el !== null) {
    if ((el.textContent?.trim() ?? '') === name) return true
    // 已到类节点本身（data-id = 类名）仍不是纯类名文本（说明是成员等）→ 不命中
    if (el.getAttribute('data-id') === name) return false
    el = el.parentElement
  }
  return false
}

export const classInlineEdit: DiagramInlineEditDefinition = {
  targetFromEvent: (ctx) => {
    const byId = targetFromDataId(ctx.target, ctx.resolver)
    if (byId === null) return null
    return classTitleClicked(ctx.target, byId.nodeId) ? { kind: 'class', name: byId.nodeId } : null
  },
  commitOf: {
    class: (target, next) => {
      if (!isValidClassName(next)) return { action: 'invalid' }
      return { action: 'commit', intent: { type: 'rename-class', name: target.name, newName: next } }
    },
  },
}
