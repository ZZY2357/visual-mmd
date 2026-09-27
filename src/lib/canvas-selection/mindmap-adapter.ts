import type { MindmapProjection } from '../projection/mindmap-projection'
import type { CanvasSelection, DataIdResolver } from './data-id'

/**
 * mindmap 适配器（工单 06）：把 mindmap 投影接到通用画布选中能力上。
 *
 * mermaid mindmap 渲染不发 data-id，但每个节点 <g> 的 DOM id 为 `node_N`
 * （N = 源码中节点行的 0 起序号，事实约定，与 mindmap-parser 的
 * `mindmap-node:{N+1}` 编号一一对应）。因此适配器把 DOM id 映射回投影节点：
 * 只认已知序号，未知 id 返回 null（尽力而为，绝不凭空造出选中）。
 */

/** mermaid 给 mindmap 节点生成的 DOM id 前缀 */
const DOM_ID_PREFIX = 'node_'

export function mindmapDataIdResolver(projection: MindmapProjection): DataIdResolver {
  const elementIdByDomId = new Map<string, string>()
  projection.nodes.forEach((n, i) => elementIdByDomId.set(`${DOM_ID_PREFIX}${i}`, n.elementId))
  return (dataId): CanvasSelection | null => {
    const elementId = elementIdByDomId.get(dataId)
    return elementId !== undefined ? { kind: 'node', id: elementId } : null
  }
}

/** mindmap 节点 elementId（`mindmap-node:N`）→ 渲染 SVG 的 DOM id（`node_{N-1}`）；
 * 不是 mindmap 节点 elementId 时返回 null（高亮与内联编辑定位共用） */
export function mindmapDomIdOf(elementId: string): string | null {
  const m = /^mindmap-node:(\d+)$/.exec(elementId)
  return m !== null ? `${DOM_ID_PREFIX}${Number(m[1]) - 1}` : null
}
