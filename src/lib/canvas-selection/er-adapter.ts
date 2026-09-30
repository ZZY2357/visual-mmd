import { resolveErSelection, type ErProjection } from '../projection/er-projection'
import { erDeleteIntent, erKeyPlan } from '../editing/canvas-keyboard'
import { elementDataIdResolver, nodeDataIdResolver, type DataIdResolver } from './data-id'
import { edgeSelectionOf } from './edge-adapter'
import { annotateErRelationIdentities } from './edge-locate'
import type { CanvasCapabilities, ProjectionOf } from './capabilities'

/**
 * er 适配器（more-diagrams 工单 03）：把 erDiagram 投影接到画布能力包上（ADR-0015）。
 *
 * data-id 约定：实体的 data-id 即实体名——mermaid v12 的 ER 实体 DOM id 形如
 * `entity-{实体名}-{n}`（erDb.addEntity，unified 渲染器以 `node.domId ?? node.id` 落 DOM，
 * 无 svgId 前缀），由 node-data-ids 的渲染后处理反注成 data-id；含空格的实体名 mermaid
 * 会产出非法 DOM id，此类实体安静降级为不可寻址（结构树仍是完整编辑入口）。
 * 关系边按**位置序**寻址（ADR-0012），data-id 为投影 elementId（`relation:1`…），
 * 渲染后由 annotateErRelationIdentities 写进 `.edgePaths > path`。
 * 属性行在实体框内部，无独立 DOM 元素——不进画布寻址（结构树可见可编辑）。
 */

export function erDataIdResolver(projection: ErProjection): DataIdResolver {
  const nodes = nodeDataIdResolver(projection.entities.map((e) => e.name))
  const edges = elementDataIdResolver(projection.relations.map((r) => r.elementId))
  return (dataId) => nodes(dataId) ?? edges(dataId)
}

/** er 画布能力包：有位置序关系边 → 实现 edgeAnnotator（条数不符时整体不标，绝不误归属）。 */
export const erCanvasCapabilities: CanvasCapabilities<ProjectionOf<'er'>> = {
  dataIdResolver: (projection) => erDataIdResolver(projection.er),
  toSelection: (canvas) => {
    // 位置序连线：经 edgeSelectionOf 收窄到本图种可寻址的种类（er-relation）
    if (canvas.kind === 'element') return edgeSelectionOf('er', canvas.elementId)
    if (canvas.kind === 'node') return { kind: 'er-entity', name: canvas.id }
    return null
  },
  // 属性行未纳入画布寻址：只有实体节点与关系边可寻址（安静地不高亮）
  canvasIdOf: (_projection, selection) => {
    if (selection.kind === 'er-entity') return selection.name
    if (selection.kind === 'er-relation') return selection.elementId
    return null
  },
  navigationIds: (projection) => projection.er.entities.map((e) => e.name),
  keyboardProjection: (projection) => ({ kind: 'er', projection: projection.er }),
  edgeAnnotator: (projection) => (root) => annotateErRelationIdentities(root, projection.er.relations.length),
  resolveSelection: (projection, selection) => resolveErSelection(projection.er, selection),
  // 删除意图：唯一映射在 canvas-keyboard.erDeleteIntent
  deleteIntent: (projection, selection) => erDeleteIntent(projection.er, selection),
  // 键位语义：唯一映射在 canvas-keyboard.erKeyPlan
  keyHandler: (projection) => (input) => erKeyPlan(projection.er, input),
}
