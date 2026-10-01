import { resolveAgentflowSelection, type AgentflowProjection } from '../projection/agentflow-projection'
import { agentflowDeleteIntent, agentflowKeyPlan } from '../editing/canvas-keyboard'
import type { Selection } from '../projection/selection'
import type { CanvasSelection, DataIdResolver } from './data-id'
import { edgeDataIdResolver, nodeDataIdResolver } from './data-id'
import type { CanvasCapabilities, ProjectionOf } from './capabilities'

/**
 * agentflow 适配器（more-diagrams 工单 27）：把 agentflow-beta 投影接到画布能力包上（ADR-0015）。
 *
 * **有画布寻址（节点 + 边）**——结论来自 mermaid@12.0.0 安装包动态实测（research §8.2，
 * 已记入工单 Comments）：
 *
 * - **节点**：`<g class="node" id="{svgId}-agentflow-{节点id}-{n}">`——**无 `data-id`**，
 *   与 flowchart 的 `{svgId}-flowchart-{id}-{n}` **同形**（名称含 `-`/`_`/数字均实测通过），
 *   故走 `nodeAnnotator` 反注 `data-id` = 源码节点 id（`annotateAgentflowDataIds`，
 *   前缀剥离 + 作用域限定 `g.node`），既有选中/高亮/右键链路原样生效。
 * - **边**：`<path data-et="edge" data-id="L_{from}_{to}_{n}">`——**有原生 data-id**，
 *   形态是 flowchart 口径的 `L_{from}_{to}_{n}`（`n` 0 起），故复用既有 `edgeDataIdResolver`
 *   （best-effort，ADR-0007；结构树仍是边的主入口）。无 edgeAnnotator。
 * - **容器（`flow` 分组）**：`<g class="cluster flow-cluster" id="{svgId}-{flowId}">`——
 *   **无 `data-id`、无 `data-et`**（research §8.2 实测：§4 宣称的 `data-et="cluster"`
 *   对 agentflow 不成立），且 flowId 与节点 id 共用命名空间、折叠容器折成单节点时
 *   DOM 归属会变 → **容器不做画布点选**（如实降级，ADR-0007），容器选中走结构树。
 *
 * **`global … end` 块**：仅作用域豁免（research §2），无渲染分组——不产生容器条目，
 * 其内节点保持顶层（投影的 `inGlobal` 标注）。
 *
 * **双击内联编辑不做（工单定案，记录在案）**：agentflow 的节点文本是 `id["label"]` 的
 * 引号内文本，可寻址锚点是节点 `<g>`（可反注）；但样式 `@{ shape: … }` 与多行元数据
 * 是逐字保留（research §8.4），节点身份本身即源码 id（改名 = 改 id，涉及全图引用改写，
 * 与重命名节点的语义边界模糊）——编辑入口 = 结构树选中 + 右侧属性表单 / 右键菜单。
 *
 * `canvasIdOf` 用 `(_projection, selection)` 签名（gantt 起升级的约定，工单 27 遵循）。
 */

/** 节点 data-id = 源码节点 id；边 data-id = `L_{from}_{to}_{n}`（flowchart 口径，尽力而为）。
 * 边的 occurrence 按 (from, to) 文档序计数（同对节点的第几条），与 parser 的 elementId 后缀口径一致。 */
export function agentflowDataIdResolver(projection: AgentflowProjection): DataIdResolver {
  const nodes = nodeDataIdResolver(projection.nodes.map((n) => n.nodeId))
  const counts = new Map<string, number>()
  const edges = projection.edges.map((e) => {
    const key = `${e.from}->${e.to}`
    const occurrence = (counts.get(key) ?? 0) + 1
    counts.set(key, occurrence)
    return { from: e.from, to: e.to, occurrence }
  })
  const edgeResolver = edgeDataIdResolver(edges)
  return (dataId) => nodes(dataId) ?? edgeResolver(dataId)
}

/** 画布选中 → 编辑器选中（纯函数，无投影依赖——与 flowchart 的 toEditorSelection 同形）：
 * node 的 id 即节点 id（名字即身份）；edge 的 elementId 由 (from, to, occurrence) 直接
 * 重建（`edge:{from}->{to}`，重复边加 `#n`——parser 的位置序身份口径，见 pipeline/agentflow.ts）。 */
export function agentflowSelectionOf(canvas: CanvasSelection): Selection | null {
  if (canvas.kind === 'node') return { kind: 'agentflow-node', nodeId: canvas.id }
  if (canvas.kind === 'edge') {
    const key = `edge:${canvas.from}->${canvas.to}`
    const elementId = canvas.occurrence === 1 ? key : `${key}#${canvas.occurrence}`
    return { kind: 'agentflow-edge', elementId }
  }
  return null
}

/** agentflow 画布能力包：节点反注 data-id、边原生 data-id，皆可点选；容器降级走结构树 */
export const agentflowCanvasCapabilities: CanvasCapabilities<ProjectionOf<'agentflow'>> = {
  dataIdResolver: (projection) => agentflowDataIdResolver(projection.agentflow),
  toSelection: (canvas) => agentflowSelectionOf(canvas),
  // data-id：节点 = 节点 id；边 = 位置序 elementId（高亮链路只认节点/边两种）
  canvasIdOf: (_projection, selection) => {
    if (selection.kind === 'agentflow-node') return selection.nodeId
    return null
  },
  // 方位导航：节点按投影顺序（名字即 data-id）
  navigationIds: (projection) => projection.agentflow.nodes.map((n) => n.nodeId),
  keyboardProjection: (projection) => ({ kind: 'agentflow', projection: projection.agentflow }),
  // 节点反注走通用 annotateNodeDataIds（DOM id 形态 `{svgId}-agentflow-{id}-{n}` 已并入
  // nodeIdOfDomId，与 flowchart/class/state/er 同一条链路）——故无需 nodeAnnotator。
  resolveSelection: (projection, selection) =>
    resolveAgentflowSelection(projection.agentflow, selection),
  // 删除意图：唯一映射在 canvas-keyboard.agentflowDeleteIntent
  deleteIntent: (projection, selection) => agentflowDeleteIntent(projection.agentflow, selection),
  // 键位语义：唯一映射在 canvas-keyboard.agentflowKeyPlan
  keyHandler: (projection) => (input) => agentflowKeyPlan(projection.agentflow, input),
}
