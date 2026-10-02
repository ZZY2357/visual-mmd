import { isValidXychartText } from '../../pipeline/xychart'
import type { DiagramInlineEditDefinition } from '../inline-edit'
import { targetFromDataId } from './dom'

/**
 * xychart（more-diagrams 工单 14）双击内联编辑：双击系列 = 改系列名（set-series-name
 * 意图；位置序 elementId 寻址。轴/标题无双击——文档级属性元素，走右侧属性表单）。
 */
export const xychartInlineEdit: DiagramInlineEditDefinition = {
  targetFromEvent: (ctx) => {
    const byId = targetFromDataId(ctx.target, ctx.resolver)
    if (byId === null) return null
    // resolver 返回 node.id = `series:N` / 固定身份；只有系列可双击（改名字），
    // 轴/标题双击安静忽略（文档级属性，走右侧表单）
    return /^series:[1-9][0-9]*$/.test(byId.nodeId)
      ? { kind: 'xychart-series', elementId: byId.nodeId }
      : null
  },
  commitOf: {
    'xychart-series': (target, next) => {
      // 非空改动 = set-series-name（名字含引号/换行非法；清空 = 去名字变未命名系列
      // ——commit 为 set-series-name null，走属性表单而非双击——通用守卫已把清空按
      // unchanged 关闭）
      if (!isValidXychartText(next)) return { action: 'invalid' }
      return { action: 'commit', intent: { type: 'set-series-name', elementId: target.elementId, name: next } }
    },
  },
}
