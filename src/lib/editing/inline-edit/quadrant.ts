import { isValidQuadrantPointText } from '../../pipeline/quadrant'
import type { DiagramInlineEditDefinition } from '../inline-edit'
import { targetFromDataId } from './dom'

/**
 * quadrant（more-diagrams 工单 12）双击内联编辑：双击点 = 改文本（set-point-text
 * 意图）。点有 data-id 寻址（渲染后位置序反注）；轴/象限标题不做双击（右侧表单改）。
 */
export const quadrantInlineEdit: DiagramInlineEditDefinition = {
  targetFromEvent: (ctx) => {
    const byId = targetFromDataId(ctx.target, ctx.resolver)
    if (byId === null) return null
    // data-id = 投影 elementId（渲染后位置序反注），只有点可双击（改文本）；
    // 轴/象限标题双击安静忽略（右侧表单改）
    return byId.nodeId.startsWith('point:') ? { kind: 'quadrant-point', elementId: byId.nodeId } : null
  },
  commitOf: {
    'quadrant-point': (target, next) => {
      // 非空改动 = set-point-text（文本含冒号/引号/关键字前缀等非法输入拒绝落码，
      // 见 isValidQuadrantPointText）
      if (!isValidQuadrantPointText(next)) return { action: 'invalid' }
      return { action: 'commit', intent: { type: 'set-point-text', elementId: target.elementId, text: next } }
    },
  },
}
