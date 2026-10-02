import { resolveStateSelection, type StateProjection } from '../projection/state-projection'
import { stateDeleteIntent, stateKeyPlan } from '../pipeline/state-keyboard'
import { elementDataIdResolver, nodeDataIdResolver, type DataIdResolver } from './data-id'
import { edgeSelectionOf } from './edge-adapter'
import { annotateStateTransitionIdentities } from './edge-locate'
import type { CanvasCapabilities, ProjectionOf } from './capabilities'

/**
 * state 适配器（more-diagrams 工单 02）：把 stateDiagram-v2 投影接到画布能力包上（ADR-0015）。
 *
 * data-id 约定：状态的 data-id 即状态 id——mermaid v12 的状态节点 DOM id 形如
 * `{svgId}-state-{状态id}-{n}`（stateDomId），由 node-data-ids 的渲染后处理反注成 data-id
 * （`state-desc` 等 note 块形态解析出的 id 不是已知状态，resolver 安静拒绝）；
 * 转移边按**位置序**寻址（ADR-0012），data-id 为投影 elementId（`transition:1`…），
 * 渲染后由 annotateStateTransitionIdentities 写进 `.edgePaths > path`。
 * note 块不进画布寻址（结构树可见可编辑）。
 */

export function stateDataIdResolver(projection: StateProjection): DataIdResolver {
  const nodes = nodeDataIdResolver(projection.states.map((s) => s.id))
  const edges = elementDataIdResolver(projection.transitions.map((t) => t.elementId))
  return (dataId) => nodes(dataId) ?? edges(dataId)
}

/** state 画布能力包：有位置序转移边 → 实现 edgeAnnotator（条数不符时整体不标，绝不误归属）。 */
export const stateCanvasCapabilities: CanvasCapabilities<ProjectionOf<'state'>> = {
  dataIdResolver: (projection) => stateDataIdResolver(projection.state),
  toSelection: (canvas) => {
    // 位置序连线：经 edgeSelectionOf 收窄到本图种可寻址的种类（state-transition）
    if (canvas.kind === 'element') return edgeSelectionOf('state', canvas.elementId)
    if (canvas.kind === 'node') return { kind: 'state', id: canvas.id }
    return null
  },
  // note 块未纳入画布寻址：只有状态节点与转移边可寻址（安静地不高亮）
  canvasIdOf: (_projection, selection) => {
    if (selection.kind === 'state') return selection.id
    if (selection.kind === 'state-transition') return selection.elementId
    return null
  },
  navigationIds: (projection) => projection.state.states.map((s) => s.id),
  keyboardProjection: (projection) => ({ kind: 'state', projection: projection.state }),
  edgeAnnotator: (projection) => (root) => annotateStateTransitionIdentities(root, projection.state.transitions.length),
  resolveSelection: (projection, selection) => resolveStateSelection(projection.state, selection),
  // 删除意图：唯一映射在 pipeline/state-keyboard 的 stateDeleteIntent
  deleteIntent: (projection, selection) => stateDeleteIntent(projection.state, selection),
  // 键位语义：唯一映射在 pipeline/state-keyboard 的 stateKeyPlan
  keyHandler: (projection) => (input) => stateKeyPlan(projection.state, input),
}
