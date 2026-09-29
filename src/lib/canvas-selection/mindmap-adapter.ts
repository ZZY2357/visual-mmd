import { parseMindmapNodeElementId } from '../pipeline/element-id'
import type { MindmapProjection } from '../projection/mindmap-projection'
import type { CanvasSelection, DataIdResolver } from './data-id'

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
