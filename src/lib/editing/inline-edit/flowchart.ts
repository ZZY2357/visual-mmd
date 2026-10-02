import type { DiagramInlineEditDefinition } from '../inline-edit'
import { targetFromDataId } from './dom'

/**
 * flowchart（工单 05）双击内联编辑：双击节点 = 改节点文本。
 * data-id 即节点 id，精确匹配，无合法性校验（set-node-text 由管线转义）。
 */
export const flowchartInlineEdit: DiagramInlineEditDefinition = {
  targetFromEvent: (ctx) => targetFromDataId(ctx.target, ctx.resolver),
  commitOf: {
    flowchart: (target, next) => ({
      action: 'commit',
      intent: { type: 'set-node-text', nodeId: target.nodeId, text: next },
    }),
  },
}
