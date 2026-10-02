import { isValidBlockLabel } from '../../pipeline/block'
import { parseBlockNodeElementId } from '../../pipeline/element-id'
import type { DiagramInlineEditDefinition } from '../inline-edit'
import { targetFromDataId } from './dom'

/**
 * block（more-diagrams 工单 09）双击内联编辑：双击块节点 = 改标签（set-node-label
 * 意图；id 是语法标识，不在此改。嵌套块无双击——组没有标签，宽度/列数在右侧属性表单改）。
 */
export const blockInlineEdit: DiagramInlineEditDefinition = {
  targetFromEvent: (ctx) => {
    const byId = targetFromDataId(ctx.target, ctx.resolver)
    if (byId === null) return null
    // resolver 返回 elementId（`block-node:<id>` / `block-group:<gid>`）；只有块节点
    // 可双击（改标签），嵌套块双击安静忽略
    const node = parseBlockNodeElementId(byId.nodeId)
    return node !== null ? { kind: 'block-node', id: node.id } : null
  },
  commitOf: {
    'block-node': (target, next) => {
      // 非空改动 = set-node-label（标签含引号/方括号/换行非法；清空 = 去掉标签变裸
      // 形状，走属性表单而非双击——通用守卫已按 unchanged 关闭）
      if (!isValidBlockLabel(next)) return { action: 'invalid' }
      return { action: 'commit', intent: { type: 'set-node-label', id: target.id, label: next } }
    },
  },
}
