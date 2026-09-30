import {
  resolveSelection as resolveFlowchartSelection,
  type FlowchartProjection,
  type Selection,
} from '../projection/flowchart-projection'
import type { CanvasCapabilities, ProjectionOf } from './capabilities'
import { flowchartDeleteIntent, flowchartKeyPlan } from '../editing/canvas-keyboard'
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

/** flowchart 画布能力包（工单 04，ADR-0015）：实例挂在 DiagramTypeRegistration.canvas 上。
 * 无位置序连线 → 不实现 edgeAnnotator（flowchart 的边走 mermaid data-id，ADR-0007）。 */
export const flowchartCanvasCapabilities: CanvasCapabilities<ProjectionOf<'flowchart'>> = {
  dataIdResolver: (projection) => flowchartDataIdResolver(projection.flowchart),
  toSelection: toEditorSelection,
  // flowchart 的 edge 选中不进高亮 data-id 链路（`L_{from}_{to}_{n}` 尽力匹配，
  // 与 selection-codec.canvasIdOf 同约定）：只有节点可寻址
  canvasIdOf: (_projection, selection) => (selection.kind === 'node' ? selection.nodeId : null),
  navigationIds: (projection) => projection.flowchart.nodes.map((n) => n.nodeId),
  keyboardProjection: (projection) => ({ kind: 'flowchart', projection: projection.flowchart }),
  resolveSelection: (projection, selection) => resolveFlowchartSelection(projection.flowchart, selection),
  // 删除意图（architecture-deepening-2 工单 03）：唯一映射在 canvas-keyboard.flowchartDeleteIntent
  deleteIntent: (projection, selection) => flowchartDeleteIntent(projection.flowchart, selection),
  // 键位语义（architecture-deepening-2 工单 02）：唯一映射在 canvas-keyboard.flowchartKeyPlan
  keyHandler: (projection) => (input) => flowchartKeyPlan(projection.flowchart, input),
}
