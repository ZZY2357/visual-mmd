import { isValidRadarLabelText } from '../../pipeline/radar'
import type { CanvasInlineEditTarget, DiagramInlineEditDefinition, RadarAxisCandidate } from '../inline-edit'
import { targetFromDataId } from './dom'

/**
 * radar（more-diagrams 工单 15）双击内联编辑：双击轴标签 = 改 label（set-axis-label）。
 * radar 渲染器无 data-id（全程只有 class），轴标签按 **class 文本匹配** 寻址
 * （`text.radarAxisLabel` 的可见文本 = 轴展示文本，与 mindmap 同范式）；曲线标签
 * 不做双击（多条曲线标签文本可重复，文本匹配不可消歧——曲线编辑入口 = 结构树 +
 * 属性表单）。
 */

/** radar：沿 DOM 向上找最近的「可见文本 = 某轴展示文本」的元素，且该元素（或祖先）
 * 带 `radarAxisLabel` class——渲染器的轴标签只有 class 可依（无 id / data-id）。
 * 同文本轴匹配最先出现的那个（尽力而为）。 */
function targetFromRadarAxisText(
  target: EventTarget | null,
  axes: RadarAxisCandidate[],
): CanvasInlineEditTarget | null {
  if (target === null || !(target instanceof Element)) return null
  const byText = new Map<string, string>() // 文本 → elementId（首个同名生效）
  for (const a of axes) {
    if (!byText.has(a.text)) byText.set(a.text, a.elementId)
  }
  let el: Element | null = target
  while (el !== null) {
    if (el.classList.contains('radarAxisLabel')) {
      const elementId = byText.get(el.textContent?.trim() ?? '')
      if (elementId !== undefined) return { kind: 'radar-axis', elementId }
      // 已到轴标签本体仍匹配不上（文本已改过 / 奇异转义）→ 不命中
      return null
    }
    el = el.parentElement
  }
  return null
}

export const radarInlineEdit: DiagramInlineEditDefinition = {
  targetFromEvent: (ctx) => {
    // radar 渲染无 data-id，resolver 实际不会命中 node；万一命中按通用 node 目标
    // 原样返回（与原实现「落到链尾 return byId」逐字同径），否则回落文本匹配
    const byId = targetFromDataId(ctx.target, ctx.resolver)
    if (byId !== null) return byId
    return targetFromRadarAxisText(ctx.target, ctx.radarAxes)
  },
  commitOf: {
    'radar-axis': (target, next) => {
      // 非空改动 = set-axis-label（label 转义统一由管线落码；清空 = 移除 label 回退
      // id 展示——通用守卫已把清空按 unchanged 关闭，所以这里到不了空串；无 label
      // 轴双击预填 id，改完即创建 label）
      if (!isValidRadarLabelText(next)) return { action: 'invalid' }
      return { action: 'commit', intent: { type: 'set-axis-label', elementId: target.elementId, label: next } }
    },
  },
}
