import {
  type FlowchartProjection,
  type Selection,
} from '../projection/flowchart-projection'
import {
  edgeDataIdResolver,
  nodeDataIdResolver,
  type CanvasSelection,
  type DataIdResolver,
} from './data-id'

/**
 * flowchart 适配器（工单 05）：把 flowchart 投影接到通用画布选中能力上。
 * 节点按 ADR-0007 的 data-id 精确匹配；边为尽力而为的 `L_{from}_{to}_{n}` 匹配。
 * 后续新图种（sequence/class/mindmap）照此写一个适配器即可接入画布选中。
 */

export function flowchartDataIdResolver(projection: FlowchartProjection): DataIdResolver {
  const nodes = nodeDataIdResolver(projection.nodes.map((n) => n.nodeId))
  const edges = edgeDataIdResolver(projection.edges)
  return (dataId) => nodes(dataId) ?? edges(dataId)
}

/** 通用选中描述 → 编辑器 store 的 Selection；flowchart 不会产出位置序连线
 * （`kind: 'element'`，工单 02）——真收到了返回 null，安静地不选中。 */
export function toEditorSelection(selection: CanvasSelection): Selection | null {
  switch (selection.kind) {
    case 'node':
      return { kind: 'node', nodeId: selection.id }
    case 'edge':
      return { kind: 'edge', from: selection.from, to: selection.to, occurrence: selection.occurrence }
    case 'element':
      return null
  }
}
