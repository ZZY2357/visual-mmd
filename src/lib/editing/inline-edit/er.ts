import { isValidErName } from '../../pipeline/er'
import type { DiagramInlineEditDefinition } from '../inline-edit'
import { targetFromDataId } from './dom'

/**
 * er（more-diagrams 工单 03）双击内联编辑：双击实体 = 编辑别名（set-alias 意图；
 * 实体名是语法标识，不在此改。属性不做双击——工单 03 明确）。
 */
export const erInlineEdit: DiagramInlineEditDefinition = {
  targetFromEvent: (ctx) => {
    const byId = targetFromDataId(ctx.target, ctx.resolver)
    // 双击实体 = 编辑别名（set-alias；实体名是语法标识，不在此改）
    return byId !== null && isValidErName(byId.nodeId) ? { kind: 'er', name: byId.nodeId } : null
  },
  commitOf: {
    er: (target, next) => {
      if (!isValidErName(target.name)) return { action: 'invalid' }
      // 空白/未改动已被通用守卫短路（unchanged）；到这里的非空改动 = set-alias
      return { action: 'commit', intent: { type: 'set-alias', name: target.name, alias: next } }
    },
  },
}
