import { resolveXychartSelection, type XychartProjection } from '../projection/xychart-projection'
import { xychartDeleteIntent, xychartKeyPlan } from '../editing/canvas-keyboard'
import type { Selection } from '../projection/selection'
import type { CanvasCapabilities, ProjectionOf } from './capabilities'
import type { DataIdResolver } from './data-id'
import { nodeDataIdResolver } from './data-id'
import { annotateXychartIdentities } from './edge-locate'

/**
 * xychart 适配器（more-diagrams 工单 14）：把 xychart 投影接到画布能力包上（ADR-0015）。
 * **有画布寻址（类名组 + 位置序）**——结论来自 mermaid 12 源码离线核对
 * （xychartDiagram-PMCCYNJV.mjs，渲染器无任何 data-id / id 写入，证据已记入工单 Comments）：
 *
 * - **系列**：`g.plot > g` 类名 `line-plot-N` / `bar-plot-N`（N = 源码声明序），
 *   按**位置序**反注 data-id = `series:N+1`（ADR-0012，名字会变不能当身份）。
 * - **标题 / 轴**：`g.chart-title` / 轴组类名按方向映射（vertical: bottom=x、left=y；
 *   horizontal: left=x、top=y——chunk 1704/1710 vs 1770/1777 行）反注固定身份。
 * - **双击内联编辑 = 改系列名**（工单定案）：系列是节点级元素，data-id 命中后走
 *   inline-edit 的 xychart-series 目标（set-series-name 意图）。
 */
export function xychartDataIdResolver(projection: XychartProjection): DataIdResolver {
  const ids = new Set<string>(['xychart-title', 'xychart-x-axis', 'xychart-y-axis'])
  for (const s of projection.series) ids.add(s.elementId)
  return nodeDataIdResolver(ids)
}

/** 画布选中 → 编辑器选中（唯一映射，adapter 与 `selection-codec.menuTargetOfCanvas` 共用）：
 * node.id = `series:N`（位置序）/ `xychart-title` / `xychart-x-axis` / `xychart-y-axis`（固定） */
export function xychartSelectionOf(canvas: { kind: 'node'; id: string }): Selection | null {
  if (canvas.id === 'xychart-title') return { kind: 'xychart-title' }
  if (canvas.id === 'xychart-x-axis') return { kind: 'xychart-axis', axis: 'x' }
  if (canvas.id === 'xychart-y-axis') return { kind: 'xychart-axis', axis: 'y' }
  if (/^series:[1-9][0-9]*$/.test(canvas.id)) return { kind: 'xychart-series', elementId: canvas.id }
  return null
}

/** xychart 画布能力包：系列按位置序反注、标题/轴按类名组反注，皆可点选 */
export const xychartCanvasCapabilities: CanvasCapabilities<ProjectionOf<'xychart'>> = {
  dataIdResolver: (projection) => xychartDataIdResolver(projection.xychart),
  toSelection: (canvas) => (canvas.kind === 'node' ? xychartSelectionOf(canvas) : null),
  // data-id：系列是位置序 elementId，标题/轴是固定 id
  canvasIdOf: (selection) => {
    if (selection.kind === 'xychart-series') return selection.elementId
    if (selection.kind === 'xychart-title') return 'xychart-title'
    if (selection.kind === 'xychart-axis') return selection.axis === 'x' ? 'xychart-x-axis' : 'xychart-y-axis'
    return null
  },
  // 方位导航：系列按投影顺序（data-id = 位置序 elementId）
  navigationIds: (projection) => projection.xychart.series.map((s) => s.elementId),
  keyboardProjection: (projection) => ({ kind: 'xychart', projection: projection.xychart }),
  edgeAnnotator: (projection) => (root) =>
    annotateXychartIdentities(root, {
      series: projection.xychart.series.length,
      orientation: projection.xychart.orientation,
    }),
  resolveSelection: (projection, selection) => resolveXychartSelection(projection.xychart, selection),
  // 删除意图：唯一映射在 canvas-keyboard.xychartDeleteIntent（仅系列可删）
  deleteIntent: (projection, selection) => xychartDeleteIntent(projection.xychart, selection),
  // 键位语义：唯一映射在 canvas-keyboard.xychartKeyPlan（系列 Tab 加系列 / Delete 删除）
  keyHandler: (projection) => (input) => xychartKeyPlan(projection.xychart, input),
}
