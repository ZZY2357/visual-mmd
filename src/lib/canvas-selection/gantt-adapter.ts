import { resolveGanttSelection, type GanttProjection } from '../projection/gantt-projection'
import { ganttDeleteIntent, ganttKeyPlan } from '../editing/canvas-keyboard'
import type { CanvasSelection, DataIdResolver } from './data-id'
import type { CanvasCapabilities, ProjectionOf } from './capabilities'

/**
 * gantt 适配器（more-diagrams 工单 11）：把 gantt 投影接到画布能力包上（ADR-0015）。
 *
 * **任务画布可寻址（离线核查 `node_modules/mermaid/dist/chunks/mermaid.core/
 * ganttDiagram-*.mjs`）**：任务条 `rect` 与任务文本 `text` 各带 DOM id
 * `<svgId>-<taskId>` / `<svgId>-<taskId>-text`（渲染函数 1616–1617 / 1688–1689 行）。
 * taskId = 显式 id（3 个逗号字段时的第 1 个）或自动 `taskN`——parseId 计数器只在
 * 省略 id 时递增（1095–1101 行），且 db.clear() 每次 render 前把它重置为 0（834 行），
 * 自动 id 因此按文档序**确定**。`node-data-ids.annotateGanttDataIds` 把这些元素
 * 反注成 `data-id = taskId`（作用域限定在 svg 内带 svgId 前缀 id 的 rect/text，
 * 证据：注册图种中只有 gantt 给 rect/text 挂 svgId 前缀 id——journey/timeline 的
 * 前缀 id 在 `line` 上、sequence 在 `line`/defs 上、gitGraph 在 defs 上）。
 *
 * data-id 约定：data-id = mermaid 渲染 id（taskId），由投影按同一套 parseId 口径
 * 预计算（见 gantt-projection.ganttRenderTaskIdOf），本适配器把它映射回位置序
 * elementId——**只认投影已知 id**，未知 data-id 返回 null（绝不凭空造出选中）。
 * 显式 id 重复时（mermaid 本身不禁止）画布命中文档序首个（与 getElementById 语义
 * 一致，记录在案）；含空格等字符的显式 id mermaid 原样放进 DOM id（非法 DOM id，
 * 回注后的 data-id 仍可匹配 attribute 相等，寻址不受影响）。
 *
 * **section 与指令行不可寻址**：section 标题是 `sectionTitle` class 的 text
 * （1992 行）、指令行不产生 DOM 元素，二者无 DOM id / data-id——选中与编辑入口
 * = 结构树 + 属性表单（如实降级，ADR-0007）。无连线语法 → 不实现 edgeAnnotator。
 *
 * 注意：共享 codec 的 `canvasIdOf`（selection-codec）无法从位置序 elementId 反解
 * 渲染 id，对 gantt-task 返回 null；高亮与导航的 data-id 映射由本能力包的
 * `canvasIdOf`（投影感知）承担（CanvasPanel 导航已统一查能力包）。
 */

/** data-id（mermaid 渲染 id）→ 投影 elementId；未知 id 返回 null（重复显式 id 取文档序首个） */
export function ganttDataIdResolver(projection: GanttProjection): DataIdResolver {
  const byTaskId = new Map<string, string>()
  for (const task of projection.tasks) {
    if (!byTaskId.has(task.taskId)) byTaskId.set(task.taskId, task.elementId)
  }
  return (dataId): CanvasSelection | null => {
    const elementId = byTaskId.get(dataId)
    return elementId !== undefined ? { kind: 'node', id: elementId } : null
  }
}

/** gantt 画布能力包（工单 11 / ADR-0015）。无连线 → 不实现 edgeAnnotator。 */
export const ganttCanvasCapabilities: CanvasCapabilities<ProjectionOf<'gantt'>> = {
  // data-id = mermaid 渲染 id（渲染后处理反注，见 node-data-ids.annotateGanttDataIds）
  dataIdResolver: (projection) => ganttDataIdResolver(projection.gantt),
  // resolver 返回的 node.id 即位置序 elementId（`task:N`）
  toSelection: (canvas) => (canvas.kind === 'node' ? { kind: 'gantt-task', elementId: canvas.id } : null),
  // 选中 → 渲染 id（高亮 / 导航寻址；section / 指令行 / 别种选中安静地不高亮）
  canvasIdOf: (projection, selection) => {
    if (selection.kind !== 'gantt-task') return null
    return projection.gantt.tasks.find((t) => t.elementId === selection.elementId)?.taskId ?? null
  },
  // 投影顺序的任务渲染 id（方位导航；重复显式 id 去重，取文档序首个）
  navigationIds: (projection) => {
    const ids: string[] = []
    for (const task of projection.gantt.tasks) {
      if (!ids.includes(task.taskId)) ids.push(task.taskId)
    }
    return ids
  },
  keyboardProjection: (projection) => ({ kind: 'gantt', projection: projection.gantt }),
  resolveSelection: (projection, selection) => resolveGanttSelection(projection.gantt, selection),
  // 删除意图：唯一映射在 canvas-keyboard.ganttDeleteIntent
  deleteIntent: (projection, selection) => ganttDeleteIntent(projection.gantt, selection),
  // 键位语义：唯一映射在 canvas-keyboard.ganttKeyPlan（Tab 同 section 加任务 /
  // Enter 加 section / Delete 删除，工单定案）
  keyHandler: (projection) => (input) => ganttKeyPlan(projection.gantt, input),
}
