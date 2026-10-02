import { isValidPacketFieldName } from '../../pipeline/packet'
import type { DiagramInlineEditDefinition } from '../inline-edit'
import { targetFromDataId } from './dom'

/**
 * packet（more-diagrams 工单 16）双击内联编辑：双击字段 = 改字段名（set-field-name
 * 意图）。字段有 data-id 寻址（渲染后 start-bit 映射反注）。
 */
export const packetInlineEdit: DiagramInlineEditDefinition = {
  targetFromEvent: (ctx) => {
    const byId = targetFromDataId(ctx.target, ctx.resolver)
    if (byId === null) return null
    // data-id = 投影 elementId（渲染后 start-bit 映射反注），双击改字段名
    return byId.nodeId.startsWith('field:') ? { kind: 'packet-field', elementId: byId.nodeId } : null
  },
  commitOf: {
    'packet-field': (target, next) => {
      // 非空改动 = set-field-name（含引号/换行的名称拒绝落码，见 isValidPacketFieldName）
      if (!isValidPacketFieldName(next)) return { action: 'invalid' }
      return { action: 'commit', intent: { type: 'set-field-name', elementId: target.elementId, name: next } }
    },
  },
}
