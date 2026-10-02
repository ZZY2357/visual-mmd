import { resolveQuadrantSelection, type QuadrantProjection } from '../projection/quadrant-projection'
import type { Selection } from '../projection/selection'
import { quadrantDeleteIntent, quadrantKeyPlan } from '../pipeline/quadrant-keyboard'
import { annotateQuadrantDataIds } from './node-data-ids'
import type { CanvasSelection, DataIdResolver } from './data-id'
import type { CanvasCapabilities, ProjectionOf } from './capabilities'

/**
 * quadrant 适配器（more-diagrams 工单 12）：把 quadrantChart 投影接到画布能力包上
 * （ADR-0015）。**有画布寻址（位置序反注）**——结论来自 mermaid 12.0.0 渲染器源码
 * 离线核对（已记入工单 Comments）：
 *
 * - 渲染器（`quadrantDiagram-O4NWA36T.mjs` 的 draw）**不给任何元素写 id / data-id**，
 *   但包裹组结构稳定且类名专属：`g.main > g.quadrants > g.quadrant`（恒 4 个）、
 *   `g.main > g.data-points > g.data-point`（点，DOM 序 = 源码点序的**逆序**——
 *   `addPoint` 经 `addPoints` 头插）、`g.main > g.labels > g.label`（轴标签，
 *   DOM 序恒为 x左 → x右 → y下 → y上，条件渲染）。
 * - `annotateQuadrantDataIds`（node-data-ids）按位置序反注 `point:N` / `quadrant:1..4` /
 *   `x-axis` / `y-axis`（ADR-0012），作用域严格限定在 quadrant 专属包裹内，不进
 *   `nodeIdOfDomId` 通用循环（工单 06 约定）；点/轴标签条数与投影不符时整体不标。
 * - **不实现 `edgeAnnotator`**（quadrant 无连线语法，capabilities 查表测试断言）。
 * - x 轴的左右两个标签共享 data-id `x-axis`（同属一个源码元素）——点选/高亮两者同亮，
 *   与 sequence 参与者「生命线 + 实例同亮」同口径。
 */
export function quadrantDataIdResolver(projection: QuadrantProjection): DataIdResolver {
  const known = new Set<string>(quadrantCanvasIds(projection))
  return (dataId) => (known.has(dataId) ? { kind: 'node', id: dataId } : null)
}

/** 投影中全部可寻址 data-id：点 / 象限 / 轴（轴行存在才可寻址） */
export function quadrantCanvasIds(projection: QuadrantProjection): string[] {
  const ids: string[] = []
  if (projection.xAxis !== null) ids.push('x-axis')
  if (projection.yAxis !== null) ids.push('y-axis')
  for (const q of projection.quadrants) ids.push(q.elementId)
  for (const p of projection.points) ids.push(p.elementId)
  return ids
}

/**
 * 轴标签的预测 DOM 序（getAxisLabels 的 push 序）：x左 → x右 → y下 → y上，
 * 每段有文本才渲染。轴标签渲染条数与该预测不符（如手写 config 关闭坐标轴）时
 * 反注整体跳过——预测顺序只在 config 未动时成立（工单不做 config 编辑）。
 */
export function quadrantAxisLabelIds(projection: QuadrantProjection): string[] {
  const ids: string[] = []
  if (projection.xAxis !== null) {
    ids.push('x-axis')
    if (projection.xAxis.second !== null) ids.push('x-axis')
  }
  if (projection.yAxis !== null) {
    ids.push('y-axis')
    if (projection.yAxis.second !== null) ids.push('y-axis')
  }
  return ids
}

/**
 * 画布选中（data-id = 投影 elementId）→ 编辑器选中（唯一映射，adapter 与
 * `selection-codec` 的 fromCanvasId / menuTargetOfCanvas 共用）：
 * 按前缀/字面量解回点 / 轴 / 象限标题三类选中。
 */
export function quadrantSelectionOf(canvas: CanvasSelection): Selection | null {
  if (canvas.kind !== 'node') return null
  const id = canvas.id
  if (id === 'x-axis' || id === 'y-axis') return { kind: 'quadrant-axis', elementId: id }
  if (/^quadrant:[1-4]$/.test(id)) return { kind: 'quadrant-quadrant', elementId: id }
  if (/^point:[0-9]+$/.test(id)) return { kind: 'quadrant-point', elementId: id }
  return null
}

/** quadrant 画布能力包：点/轴/象限按位置序反注寻址 */
export const quadrantCanvasCapabilities: CanvasCapabilities<ProjectionOf<'quadrant'>> = {
  dataIdResolver: (projection) => quadrantDataIdResolver(projection.quadrant),
  toSelection: (canvas) => quadrantSelectionOf(canvas),
  // data-id 即投影 elementId（渲染后按位置序反注）
  canvasIdOf: (_projection, selection) => {
    if (
      selection.kind === 'quadrant-point' ||
      selection.kind === 'quadrant-axis' ||
      selection.kind === 'quadrant-quadrant'
    ) {
      return selection.elementId
    }
    return null
  },
  // 方位导航：点（投影顺序）；轴/象限是文档级属性元素，不参与导航
  navigationIds: (projection) => projection.quadrant.points.map((p) => p.elementId),
  keyboardProjection: (projection) => ({ kind: 'quadrant', projection: projection.quadrant }),
  nodeAnnotator: (projection) => (root) =>
    annotateQuadrantDataIds(root, {
      pointCount: projection.quadrant.points.length,
      axisLabels: quadrantAxisLabelIds(projection.quadrant),
    }),
  resolveSelection: (projection, selection) => resolveQuadrantSelection(projection.quadrant, selection),
  // 删除意图：唯一映射在 pipeline/quadrant-keyboard 的 quadrantDeleteIntent（仅点可删；轴/象限无删除语义）
  deleteIntent: (projection, selection) => quadrantDeleteIntent(projection.quadrant, selection),
  // 键位语义：唯一映射在 pipeline/quadrant-keyboard 的 quadrantKeyPlan（Tab 加点 / Delete 删点；
  // Enter 无自然类比，工单定案不做）
  keyHandler: (projection) => (input) => quadrantKeyPlan(projection.quadrant, input),
}
