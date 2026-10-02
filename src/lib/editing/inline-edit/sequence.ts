import { isValidParticipantId } from '../../pipeline/sequence'
import type { DiagramInlineEditDefinition } from '../inline-edit'
import { targetFromDataId } from './dom'

/**
 * sequence（工单 05）双击内联编辑：双击参与者 = 改 `as` 显示别名（actorId 是语法
 * 标识不碰）；空白新建后命名（sequence 目标，rename-participant）由右键菜单 /
 * 键盘新建构造，不经双击。消息文本不做双击（在线上，编辑走点选 → 右侧表单）。
 */
export const sequenceInlineEdit: DiagramInlineEditDefinition = {
  targetFromEvent: (ctx) => {
    const byId = targetFromDataId(ctx.target, ctx.resolver)
    return byId !== null ? { kind: 'sequence-alias', actorId: byId.nodeId } : null
  },
  commitOf: {
    sequence: (target, next) => {
      if (!isValidParticipantId(next)) return { action: 'invalid' }
      return { action: 'commit', intent: { type: 'rename-participant', actorId: target.actorId, newId: next } }
    },
    'sequence-alias': (target, next) => {
      // 只改显示别名（set-participant）；清空视为未改动（去掉别名走属性面板，spec：只做改显示文本）
      return { action: 'commit', intent: { type: 'set-participant', actorId: target.actorId, alias: next } }
    },
  },
}
