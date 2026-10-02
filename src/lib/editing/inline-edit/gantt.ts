import { isValidGanttTaskName } from '../../pipeline/gantt'
import type { DiagramInlineEditDefinition } from '../inline-edit'
import { closestDataId, targetFromDataId } from './dom'

/**
 * gantt（more-diagrams 工单 11）双击内联编辑：双击任务条/任务文本 = 改任务名
 * （set-task-name）。elementId 是位置序身份（`task:N`，提交寻址用）；taskId 是
 * mermaid 渲染 id（画布 data-id，浮层定位用——DOM 上只有它，无法从位置序
 * elementId 反解），双击时经 closestDataId 一次取齐。
 */
export const ganttInlineEdit: DiagramInlineEditDefinition = {
  targetFromEvent: (ctx) => {
    const byId = targetFromDataId(ctx.target, ctx.resolver)
    if (byId === null) return null
    // resolver 把渲染 id（data-id）映射回位置序 elementId；taskId 取 DOM 上的
    // data-id 原文（浮层定位用，见 closestDataId）
    const taskId = closestDataId(ctx.target)
    return taskId !== null ? { kind: 'gantt-task', elementId: byId.nodeId, taskId } : null
  },
  commitOf: {
    'gantt-task': (target, next) => {
      // 非空改动 = set-task-name（任务名含 `:` `;` `#` 换行非法；elementId 位置序
      // 寻址，taskId 只用于浮层定位）
      if (!isValidGanttTaskName(next)) return { action: 'invalid' }
      return { action: 'commit', intent: { type: 'set-task-name', elementId: target.elementId, name: next } }
    },
  },
}
