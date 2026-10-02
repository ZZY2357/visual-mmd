import { resolveSankeySelection, type SankeyProjection } from '../projection/sankey-projection'
import { sankeyDeleteIntent, sankeyKeyPlan } from '../pipeline/sankey-keyboard'
import type { Selection } from '../projection/selection'
import type { CanvasSelection, DataIdResolver } from './data-id'
import { edgeSelectionOf } from './edge-adapter'
import { annotateSankeyIdentities } from './edge-locate'
import type { CanvasCapabilities, ProjectionOf } from './capabilities'

/**
 * sankey 适配器（more-diagrams 工单 13）：把 sankey-beta 投影接到画布能力包上（ADR-0015）。
 * **有画布寻址（位置序）**——结论来自 mermaid 12 源码离线核对（sankeyDiagram-IPEJSGJF.mjs
 * 692/725 行 + d3-sankey src/sankey.js，已记入工单 Comments）：
 *
 * - **节点**：`g.nodes > g.node` 的 DOM id 是 `Uid.next("node-")` 的**全局自增计数器**
 *   （跨渲染不稳定，不可内容寻址）；但 d3 join 的 data = db.getGraph().nodes（DB 按
 *   findOrCreateNode 首现去重保序产出），d3-sankey 不重排该数组 → **DOM 序 = 解析序**，
 *   按**位置序**反注 data-id = 节点名（名字即身份，ADR-0012）。
 * - **链路**：`g.links > g.link` 完全没有 id；d3 join 的 data = graph.links（DB 按源码
 *   序 push），同上按位置序反注 data-id = `link:N`。条数与投影不符时该组整体放弃
 *   （绝不误标，annotateSankeyIdentities 内做）。
 * - 通用 `annotateNodeDataIds` 的四种 DOM id 形态（flowchart/class/state/er）都不会
 *   命中 `node-N` 形态，不会抢先误注（见 edge-locate.annotateSankeyIdentities 注释）。
 * - **双击内联编辑不做（工单定案，记录在案）**：sankey 的可编辑字段是 CSV 三列——
 *   链路是 path、节点标签在独立的 `g.node-labels` 里（身份同是全局计数器），没有
 *   「单值文本」的可寻址锚点；编辑入口 = 结构树选中 + 右侧属性表单 / 右键菜单。
 */
export function sankeyDataIdResolver(projection: SankeyProjection): DataIdResolver {
  const nodeNames = new Set(projection.nodes.map((n) => n.name))
  const linkIds = new Set(projection.links.map((l) => l.elementId))
  return (dataId) => {
    if (nodeNames.has(dataId)) return { kind: 'node', id: dataId }
    return linkIds.has(dataId) ? { kind: 'element', elementId: dataId } : null
  }
}

/** 画布选中 → 编辑器选中（唯一映射，adapter 与 `selection-codec.menuTargetOfCanvas` 共用）：
 * node 的 id 即节点名（名字即身份）；element 的 elementId 是位置序身份 `link:N`，
 * 经 `edgeSelectionOf` 收窄。 */
export function sankeySelectionOf(canvas: CanvasSelection): Selection | null {
  if (canvas.kind === 'node') return { kind: 'sankey-node', name: canvas.id }
  if (canvas.kind === 'element') return edgeSelectionOf('sankey', canvas.elementId)
  return null
}

/** sankey 画布能力包：节点按名字反注、链路按位置序反注，皆可点选 */
export const sankeyCanvasCapabilities: CanvasCapabilities<ProjectionOf<'sankey'>> = {
  dataIdResolver: (projection) => sankeyDataIdResolver(projection.sankey),
  toSelection: (canvas) => sankeySelectionOf(canvas),
  // data-id 即节点名；链路是位置序 elementId
  canvasIdOf: (_projection, selection) => {
    if (selection.kind === 'sankey-node') return selection.name
    if (selection.kind === 'sankey-link') return selection.elementId
    return null
  },
  // 方位导航：节点按投影顺序（名字即 data-id）
  navigationIds: (projection) => projection.sankey.nodes.map((n) => n.name),
  keyboardProjection: (projection) => ({ kind: 'sankey', projection: projection.sankey }),
  edgeAnnotator: (projection) => (root) =>
    annotateSankeyIdentities(root, {
      nodeNames: projection.sankey.nodes.map((n) => n.name),
      links: projection.sankey.links.length,
    }),
  resolveSelection: (projection, selection) => resolveSankeySelection(projection.sankey, selection),
  // 删除意图：唯一映射在 pipeline/sankey-keyboard 的 sankeyDeleteIntent
  deleteIntent: (projection, selection) => sankeyDeleteIntent(projection.sankey, selection),
  // 键位语义：唯一映射在 pipeline/sankey-keyboard 的 sankeyKeyPlan（链路上 Tab 加链路 / Delete 删除；
  // Enter 无自然类比，工单定案不做）
  keyHandler: (projection) => (input) => sankeyKeyPlan(projection.sankey, input),
}
