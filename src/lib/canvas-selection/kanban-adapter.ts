import { parseKanbanCardElementId, parseKanbanColumnElementId } from '../pipeline/element-id'
import { resolveKanbanSelection, type KanbanProjection } from '../projection/kanban-projection'
import { kanbanDeleteIntent, kanbanKeyPlan } from '../pipeline/kanban-keyboard'
import type { CanvasSelection, DataIdResolver } from './data-id'
import type { CanvasCapabilities, ProjectionOf } from './capabilities'

/**
 * kanban 适配器（more-diagrams 工单 06）：把 kanban 投影接到画布能力包上（ADR-0015）。
 *
 * 画布可寻址性（离线核查 `node_modules/mermaid/dist/chunks/mermaid.core/kanban-definition-*.mjs`）：
 * 渲染器 `draw` 里 `node.domId = \`${id}-${node.id}\``，列经 `insertCluster`（`<g class="cluster">`）
 * 落进 `<g class="sections">`，卡片经 `insertNode`（`<g class="node">`）落进 `<g class="items">`——
 * 都**没有 data-id**，只有 DOM id `${svgId}-${节点id}`。`node-data-ids.annotateKanbanDataIds`
 * 以 svg 根 id 为前缀把两个包裹组内的元素反注成 `data-id = 节点id`（作用域限定，不误伤他图），
 * 于是选中 / 高亮 / 内联编辑走与 flowchart/class 同一条 data-id 链路。
 *
 * data-id 约定：**节点 id 即 data-id**（列与卡片各自语法 id，mermaid 要求全局唯一）。
 * 本适配器把 data-id 映射回投影 elementId（`kanban-column:<id>` / `kanban-card:<id>`），
 * 与 mindmap 适配器同形：只认投影已知 id，未知 id 返回 null（绝不凭空造出选中）。
 * 无连线概念（research 已核查）→ 不实现 edgeAnnotator。
 */

/** data-id（节点 id）→ 投影 elementId；未知 id 返回 null（列在前、卡片在后，均按投影顺序） */
export function kanbanDataIdResolver(projection: KanbanProjection): DataIdResolver {
  const byNodeId = new Map<string, string>()
  for (const column of projection.columns) byNodeId.set(column.id, column.elementId)
  for (const card of projection.cards) byNodeId.set(card.id, card.elementId)
  return (dataId): CanvasSelection | null => {
    const elementId = byNodeId.get(dataId)
    return elementId !== undefined ? { kind: 'node', id: elementId } : null
  }
}

/** elementId → 渲染 data-id（节点 id）；不是 kanban 元素 id 时 null（高亮 / 导航寻址） */
function nodeIdOfElementId(elementId: string): string | null {
  const column = parseKanbanColumnElementId(elementId)
  if (column !== null) return column.id
  const card = parseKanbanCardElementId(elementId)
  return card !== null ? card.id : null
}

/** elementId → 编辑器选中（列 / 卡片按前缀判种类）；不是 kanban 元素 id 时 null */
function selectionOfElementId(elementId: string): { kind: 'kanban-column' | 'kanban-card'; elementId: string } | null {
  if (parseKanbanColumnElementId(elementId) !== null) return { kind: 'kanban-column', elementId }
  if (parseKanbanCardElementId(elementId) !== null) return { kind: 'kanban-card', elementId }
  return null
}

/** kanban 画布能力包（工单 06 / ADR-0015）。无连线 → 不实现 edgeAnnotator。 */
export const kanbanCanvasCapabilities: CanvasCapabilities<ProjectionOf<'kanban'>> = {
  dataIdResolver: (projection) => kanbanDataIdResolver(projection.kanban),
  toSelection: (canvas) => (canvas.kind === 'node' ? selectionOfElementId(canvas.id) : null),
  // 节点 id 即 data-id（渲染后处理反注，见 node-data-ids.annotateKanbanDataIds）
  canvasIdOf: (_projection, selection) =>
    selection.kind === 'kanban-column' || selection.kind === 'kanban-card'
      ? nodeIdOfElementId(selection.elementId)
      : null,
  // 投影顺序：每列其后跟它的卡片（方位导航按此顺序取先者）
  navigationIds: (projection) => {
    const ids: string[] = []
    for (const column of projection.kanban.columns) {
      ids.push(column.id)
      for (const card of column.cards) ids.push(card.id)
    }
    return ids
  },
  keyboardProjection: (projection) => ({ kind: 'kanban', projection: projection.kanban }),
  resolveSelection: (projection, selection) => resolveKanbanSelection(projection.kanban, selection),
  // 删除意图：唯一映射在 pipeline/kanban-keyboard 的 kanbanDeleteIntent
  deleteIntent: (projection, selection) => kanbanDeleteIntent(projection.kanban, selection),
  // 键位语义：唯一映射在 pipeline/kanban-keyboard 的 kanbanKeyPlan
  keyHandler: (projection) => (input) => kanbanKeyPlan(projection.kanban, input),
}
