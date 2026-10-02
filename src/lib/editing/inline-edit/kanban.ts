import { isValidKanbanText } from '../../pipeline/kanban'
import { parseKanbanCardElementId, parseKanbanColumnElementId } from '../../pipeline/element-id'
import type { DiagramInlineEditDefinition } from '../inline-edit'
import { targetFromDataId } from './dom'

/**
 * kanban（more-diagrams 工单 06）双击内联编辑：双击卡片 = 改描述（set-description），
 * 双击列标题 = 改标题（set-column-title）；键盘 / 空白新建后命名同目标。
 * resolver 返回 elementId（`kanban-card:<id>` / `kanban-column:<id>`），按前缀判种类。
 */
export const kanbanInlineEdit: DiagramInlineEditDefinition = {
  targetFromEvent: (ctx) => {
    const byId = targetFromDataId(ctx.target, ctx.resolver)
    if (byId === null) return null
    if (parseKanbanCardElementId(byId.nodeId) !== null) return { kind: 'kanban-card', elementId: byId.nodeId }
    if (parseKanbanColumnElementId(byId.nodeId) !== null) return { kind: 'kanban-column', elementId: byId.nodeId }
    return null
  },
  commitOf: {
    'kanban-card': (target, next) => {
      if (!isValidKanbanText(next)) return { action: 'invalid' }
      return { action: 'commit', intent: { type: 'set-description', elementId: target.elementId, description: next } }
    },
    'kanban-column': (target, next) => {
      if (!isValidKanbanText(next)) return { action: 'invalid' }
      return { action: 'commit', intent: { type: 'set-column-title', elementId: target.elementId, title: next } }
    },
  },
}
