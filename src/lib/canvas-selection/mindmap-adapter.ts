import { parseMindmapNodeElementId } from '../pipeline/element-id'
import { resolveMindmapSelection, type MindmapProjection } from '../projection/mindmap-projection'
import { mindmapDeleteIntent } from '../editing/canvas-keyboard'
import type { CanvasSelection, DataIdResolver } from './data-id'
import type { CanvasCapabilities, ProjectionOf } from './capabilities'

/**
 * mindmap 适配器（工单 06）：把 mindmap 投影接到通用画布选中能力上。
 *
 * mermaid mindmap 渲染不发 data-id，但每个节点 <g> 的 DOM id 含 `node_N`
 * （N = 源码中节点行的 0 起序号，事实约定，与 mindmap-parser 的
 * `mindmap-node:{N+1}` 编号一一对应；mermaid v12 实测（工单 08）会在前面
 * 拼上 svgId 前缀（`{svgId}-node_N`），故解析与回查一律按 **后缀** 匹配）。
 * 因此适配器把 DOM id 映射回投影节点：
 * 只认已知序号，未知 id 返回 null（尽力而为，绝不凭空造出选中）。
 */

/** mindmap 节点 DOM id 形态：`{svgId}-node_{N}` 或裸 `node_{N}`（取尾部序号） */
const DOM_ID_SUFFIX = /(?:^|-)node_(\d+)$/

/** DOM id（任意 svgId 前缀形态）→ 序号；不是 mindmap 节点 id 时返回 null */
export function mindmapDomIdIndex(domId: string): number | null {
  const m = DOM_ID_SUFFIX.exec(domId)
  return m !== null ? Number(m[1]) : null
}

export function mindmapDataIdResolver(projection: MindmapProjection): DataIdResolver {
  const elementIdByIndex = new Map<number, string>()
  projection.nodes.forEach((n, i) => elementIdByIndex.set(i, n.elementId))
  return (dataId): CanvasSelection | null => {
    const index = mindmapDomIdIndex(dataId)
    if (index === null) return null
    const elementId = elementIdByIndex.get(index)
    return elementId !== undefined ? { kind: 'node', id: elementId } : null
  }
}

/** mindmap 节点 elementId（`mindmap-node:N`）→ 渲染 SVG 的 DOM id 尾部形态（`node_{N-1}`）；
 * 不是 mindmap 节点 elementId 时返回 null（高亮与内联编辑定位共用；使用方需按
 * id 或 id 后缀回查——mermaid v12 的节点 id 带 svgId 前缀） */
export function mindmapDomIdOf(elementId: string): string | null {
  const ordinal = parseMindmapNodeElementId(elementId)
  return ordinal !== null ? `node_${ordinal - 1}` : null
}

/** mindmap 画布能力包（工单 04，ADR-0015）。无连线 → 不实现 edgeAnnotator。
 * 画布选中只可能是节点（无连线），data-id 即节点 elementId（`mindmap-node:N`）；
 * 高亮 / 导航按 DOM id 形态（`node_{N-1}`）寻址。 */
export const mindmapCanvasCapabilities: CanvasCapabilities<ProjectionOf<'mindmap'>> = {
  dataIdResolver: (projection) => mindmapDataIdResolver(projection.mindmap),
  toSelection: (canvas) => (canvas.kind === 'node' ? { kind: 'mindmap-node', elementId: canvas.id } : null),
  canvasIdOf: (selection) => (selection.kind === 'mindmap-node' ? mindmapDomIdOf(selection.elementId) : null),
  // 非 mindmap-node 形态的 elementId 不入列表（不参与导航，与原 nodeDataIdsOf 同口径）
  navigationIds: (projection) => {
    const ids: string[] = []
    for (const n of projection.mindmap.nodes) {
      const domId = mindmapDomIdOf(n.elementId)
      if (domId !== null) ids.push(domId)
    }
    return ids
  },
  keyboardProjection: (projection) => ({ kind: 'mindmap', projection: projection.mindmap }),
  resolveSelection: (projection, selection) => resolveMindmapSelection(projection.mindmap, selection),
  // 删除意图（architecture-deepening-2 工单 03）：唯一映射在 canvas-keyboard.mindmapDeleteIntent
  deleteIntent: (projection, selection) => mindmapDeleteIntent(projection.mindmap, selection),
}
