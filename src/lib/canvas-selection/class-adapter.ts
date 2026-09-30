import { resolveClassSelection, type ClassProjection } from '../projection/class-projection'
import { classDeleteIntent, classKeyPlan } from '../editing/canvas-keyboard'
import { elementDataIdResolver, nodeDataIdResolver, type DataIdResolver } from './data-id'
import { edgeSelectionOf } from './edge-adapter'
import { annotateClassRelationIdentities, relationShapesOf } from './edge-locate'
import type { CanvasCapabilities, ProjectionOf } from './capabilities'

/**
 * class 适配器（工单 04）：把 class 投影接到画布能力包上（ADR-0015）。
 * 此前的 class resolver 在 CanvasPanel.resolverOf 里现场拼——本工单把它连同
 * 导航 / 键盘 / 选中映射 / 连线标注 / 选中回落一起收进能力包实例。
 *
 * data-id 约定（承 CanvasPanel.resolverOf 的 class 分支）：类的 data-id 即类名
 * （由 node-data-ids 的渲染后处理从 `{svgId}-classId-{类名}-{n}` 反注，工单 09）；
 * 关系边按**位置序**寻址（ADR-0012），data-id 为投影 elementId（`relation:1`…）。
 */

export function classDataIdResolver(projection: ClassProjection): DataIdResolver {
  const nodes = nodeDataIdResolver(projection.classes.map((c) => c.name))
  const edges = elementDataIdResolver(projection.relations.map((r) => r.elementId))
  return (dataId) => nodes(dataId) ?? edges(dataId)
}

/** class 画布能力包（工单 04，ADR-0015）：实例挂在 DiagramTypeRegistration.canvas 上。
 * 有位置序关系边 → 实现 edgeAnnotator（形状由投影的 label/基数算出）。 */
export const classCanvasCapabilities: CanvasCapabilities<ProjectionOf<'class'>> = {
  dataIdResolver: (projection) => classDataIdResolver(projection.class),
  toSelection: (canvas) => {
    // 位置序连线（工单 02）：经 edgeSelectionOf 收窄到本图种可寻址的种类（class-relation）
    if (canvas.kind === 'element') return edgeSelectionOf('class', canvas.elementId)
    if (canvas.kind === 'node') return { kind: 'class', name: canvas.id }
    return null
  },
  // class 的成员/注释未纳入画布寻址：只有类节点与关系边可寻址（安静地不高亮）
  canvasIdOf: (selection) => {
    if (selection.kind === 'class') return selection.name
    if (selection.kind === 'class-relation') return selection.elementId
    return null
  },
  navigationIds: (projection) => projection.class.classes.map((c) => c.name),
  keyboardProjection: (projection) => ({ kind: 'class', projection: projection.class }),
  edgeAnnotator: (projection) => (root) => annotateClassRelationIdentities(root, relationShapesOf(projection.class.relations)),
  resolveSelection: (projection, selection) => resolveClassSelection(projection.class, selection),
  // 删除意图（architecture-deepening-2 工单 03）：唯一映射在 canvas-keyboard.classDeleteIntent
  deleteIntent: (projection, selection) => classDeleteIntent(projection.class, selection),
  // 键位语义（architecture-deepening-2 工单 02）：唯一映射在 canvas-keyboard.classKeyPlan
  keyHandler: (projection) => (input) => classKeyPlan(projection.class, input),
}
