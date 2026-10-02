import { isValidMindmapNodeText } from '../../pipeline/mindmap'
import type { ProjectionMindmapNode } from '../../projection/mindmap-projection'
import type { DiagramInlineEditDefinition, InlineEditTarget } from '../inline-edit'
import { targetFromDataId } from './dom'

/**
 * mindmap（工单 05）双击内联编辑：双击节点 = 改节点显示文本。
 * mermaid 未给 mindmap 节点稳定 data-id（画布点选启用后节点命中走 resolver，是
 * 工单 08 补的 DOM id 反注）——文本匹配保留为回落范式（与 radar 同范式）。
 */

/** mindmap：沿 DOM 向上找最近一个「可见文本 = 某投影节点文本」的祖先元素。
 * 取的是双击点周围的实际标签文本；同名节点匹配最先出现的那个（尽力而为）。 */
function targetFromMindmapText(target: EventTarget | null, nodes: ProjectionMindmapNode[]): InlineEditTarget | null {
  if (target === null || !(target instanceof Element)) return null
  const byText = new Map<string, string>() // 文本 → elementId（首个同名生效）
  for (const n of nodes) {
    if (!byText.has(n.text)) byText.set(n.text, n.elementId)
  }
  let el: Element | null = target
  while (el !== null) {
    const text = el.textContent?.trim() ?? ''
    const elementId = byText.get(text)
    if (elementId !== undefined) return { kind: 'mindmap', elementId }
    el = el.parentElement
  }
  return null
}

export const mindmapInlineEdit: DiagramInlineEditDefinition = {
  targetFromEvent: (ctx) => {
    const byId = targetFromDataId(ctx.target, ctx.resolver)
    if (byId !== null) return { kind: 'mindmap', elementId: byId.nodeId }
    return targetFromMindmapText(ctx.target, ctx.mindmapNodes)
  },
  commitOf: {
    mindmap: (target, next) => {
      if (!isValidMindmapNodeText(next)) return { action: 'invalid' }
      return { action: 'commit', intent: { type: 'set-node-text', elementId: target.elementId, text: next } }
    },
  },
}
