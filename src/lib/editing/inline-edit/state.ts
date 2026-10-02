import { isValidStateId } from '../../pipeline/state'
import type { DiagramInlineEditDefinition } from '../inline-edit'
import { targetFromDataId } from './dom'

/**
 * state（more-diagrams 工单 02）双击内联编辑：双击状态节点 = 编辑描述（`id : desc`
 * 的 desc 段，set-state-desc 意图；id 是语法标识，不在此改）。
 */
export const stateInlineEdit: DiagramInlineEditDefinition = {
  targetFromEvent: (ctx) => {
    const byId = targetFromDataId(ctx.target, ctx.resolver)
    // 双击状态节点 = 编辑描述（set-state-desc；无描述状态输入即新增描述行）
    return byId !== null && isValidStateId(byId.nodeId) ? { kind: 'state', id: byId.nodeId } : null
  },
  commitOf: {
    state: (target, next) => {
      if (!isValidStateId(target.id)) return { action: 'invalid' }
      // 空白/未改动已被通用守卫短路（unchanged）；到这里的非空改动 = set-state-desc
      return { action: 'commit', intent: { type: 'set-state-desc', id: target.id, desc: next } }
    },
  },
}
