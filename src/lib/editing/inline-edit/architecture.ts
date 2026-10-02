import {
  parseArchitectureGroupElementId,
  parseArchitectureServiceElementId,
} from '../../pipeline/element-id'
import { isValidArchTitle } from '../../pipeline/architecture'
import type { DiagramInlineEditDefinition } from '../inline-edit'
import { targetFromDataId } from './dom'

/**
 * architecture（more-diagrams 工单 17）双击内联编辑：双击 service / group = 改标题
 * （set-service-title / set-group-title 意图；id 是语法标识不在此改。junction 无标题、
 * 边不可寻址——不接双击）。
 */
export const architectureInlineEdit: DiagramInlineEditDefinition = {
  targetFromEvent: (ctx) => {
    const byId = targetFromDataId(ctx.target, ctx.resolver)
    if (byId === null) return null
    // resolver 返回 node.id = 投影 elementId（`service:<id>` / `group:<gid>` /
    // `junction:<jid>`，渲染后从 DOM id 反注）；只有 service / group 可双击（改标题），
    // junction 双击安静忽略
    const service = parseArchitectureServiceElementId(byId.nodeId)
    if (service !== null) return { kind: 'architecture', elementKind: 'service', id: service.id }
    const group = parseArchitectureGroupElementId(byId.nodeId)
    return group !== null ? { kind: 'architecture', elementKind: 'group', id: group.id } : null
  },
  commitOf: {
    architecture: (target, next) => {
      // 非空改动 = set-service-title / set-group-title（标题含方括号/换行非法；清空 =
      // 去掉 [title]（显示回落 id）——清空已被通用守卫按 unchanged 关闭，走属性表单
      // 而非双击）
      if (!isValidArchTitle(next)) return { action: 'invalid' }
      return {
        action: 'commit',
        intent:
          target.elementKind === 'service'
            ? { type: 'set-service-title', id: target.id, title: next }
            : { type: 'set-group-title', id: target.id, title: next },
      }
    },
  },
}
