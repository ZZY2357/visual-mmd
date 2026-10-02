import {
  parseBlockGroupElementId,
  parseBlockNodeElementId,
} from '../pipeline/element-id'
import { resolveBlockSelection, type BlockProjection } from '../projection/block-projection'
import type { Selection } from '../projection/selection'
import { blockDeleteIntent, blockKeyPlan } from '../pipeline/block-keyboard'
import type { CanvasSelection, DataIdResolver } from './data-id'
import { edgeSelectionOf } from './edge-adapter'
import { annotateBlockEdgeIdentities } from './edge-locate'
import type { CanvasCapabilities, ProjectionOf } from './capabilities'

/**
 * block 适配器（more-diagrams 工单 09）：把 block(-beta) 投影接到画布能力包上（ADR-0015）。
 * **有画布寻址**——结论来自 mermaid 12.0.0 源码离线核对（已记入工单 Comments）：
 *
 * - **节点**：block 渲染器把节点装进自己的包裹组 `<g class="block">`，形状处理器以
 *   `node.domId = \`${渲染id}-${块id}\`` 落 DOM id（`getNodeFromBlock` →
 *   `attr("id", node.domId ?? node.id)`）——与 kanban 同形，`annotateBlockDataIds`
 *   以 svg 根 id 前缀剥离反注 `data-id = 块id`；嵌套块（composite）同走此链路。
 *   space 不渲染（`insertBlockPositioned` 跳过 type space），无 DOM。
 * - **边**：`insertEdges` 按源码顺序逐条 `insertEdge`（`chunk-Z7XXMR3K:943` 统一写
 *   `data-id = edge.id`，但 block 的 edge.id 带渲染 id 前缀，不直接可用），path 落在
 *   `g.block` 下——按**位置序**反注 `edge:N`（ADR-0012），条数与投影不符时整体不标
 *   （绝不误归属）。
 * - **匿名嵌套块**（`block ... end` 无显式 id）由 mermaid 生成随机 id，反注出的身份
 *   不在投影里，resolver 安静拒绝；显式 `block:gid` 可寻址。
 * - 块 id 含空格等非法 DOM id 字符时 mermaid 原样塞进 DOM id，此类节点安静降级为
 *   不可寻址（结构树与属性表单仍是完整编辑入口）。
 */
export function blockDataIdResolver(projection: BlockProjection): DataIdResolver {
  const nodeIds = new Set(projection.nodes.map((n) => n.id))
  const groupIds = new Set(projection.groups.map((g) => g.id))
  const edgeIds = new Set(projection.edges.map((e) => e.elementId))
  return (dataId) => {
    // 节点先查（块与嵌套块共享 id 名空间时 mermaid 的 Map 语义下节点声明胜出）
    if (nodeIds.has(dataId)) return { kind: 'node', id: `block-node:${dataId}` }
    if (groupIds.has(dataId)) return { kind: 'node', id: `block-group:${dataId}` }
    return edgeIds.has(dataId) ? { kind: 'element', elementId: dataId } : null
  }
}

/**
 * 画布选中 → 编辑器选中（唯一映射，adapter 与 `selection-codec.menuTargetOfCanvas` 共用）：
 * - `node` 的 id 是**投影 elementId**（`block-node:<id>` / `block-group:<gid>`），按前缀解回；
 * - `element` 的 elementId 是位置序身份 `edge:N`，经 `edgeSelectionOf` 收窄。
 */
export function blockSelectionOf(canvas: CanvasSelection): Selection | null {
  if (canvas.kind === 'node') {
    const node = parseBlockNodeElementId(canvas.id)
    if (node !== null) return { kind: 'block-node', id: node.id }
    const group = parseBlockGroupElementId(canvas.id)
    return group !== null ? { kind: 'block-group', id: group.id } : null
  }
  if (canvas.kind === 'element') return edgeSelectionOf('block', canvas.elementId)
  return null
}

/** block 画布能力包：节点可点选、边按位置序标注 */
export const blockCanvasCapabilities: CanvasCapabilities<ProjectionOf<'block'>> = {
  dataIdResolver: (projection) => blockDataIdResolver(projection.block),
  toSelection: (canvas) => blockSelectionOf(canvas),
  // data-id 即块 id（渲染后从 DOM id 反注）；边是位置序 elementId
  canvasIdOf: (_projection, selection) => {
    if (selection.kind === 'block-node' || selection.kind === 'block-group') return selection.id
    if (selection.kind === 'block-edge') return selection.elementId
    return null
  },
  // 方位导航：节点与嵌套块按投影顺序（重名时 anchor 取先者）
  navigationIds: (projection) => [
    ...projection.block.nodes.map((n) => n.id),
    ...projection.block.groups.map((g) => g.id),
  ],
  keyboardProjection: (projection) => ({ kind: 'block', projection: projection.block }),
  edgeAnnotator: (projection) => (root) =>
    annotateBlockEdgeIdentities(root, projection.block.edges.length),
  resolveSelection: (projection, selection) => resolveBlockSelection(projection.block, selection),
  // 删除意图：唯一映射在 pipeline/block-keyboard 的 blockDeleteIntent
  deleteIntent: (projection, selection) => blockDeleteIntent(projection.block, selection),
  // 键位语义：唯一映射在 pipeline/block-keyboard 的 blockKeyPlan
  keyHandler: (projection) => (input) => blockKeyPlan(projection.block, input),
}
