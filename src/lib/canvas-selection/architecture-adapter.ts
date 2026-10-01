import { resolveArchitectureSelection, type ArchitectureProjection } from '../projection/architecture-projection'
import {
  parseArchitectureGroupElementId,
  parseArchitectureJunctionElementId,
  parseArchitectureServiceElementId,
} from '../pipeline/element-id'
import { architectureDeleteIntent, architectureKeyPlan } from '../editing/canvas-keyboard'
import { nodeDataIdResolver, type DataIdResolver } from './data-id'
import { annotateArchitectureDataIds } from './node-data-ids'
import type { CanvasCapabilities, ProjectionOf } from './capabilities'
import type { Selection } from '../projection/selection'

/**
 * architecture 适配器（more-diagrams 工单 17）：把 architecture-beta 投影接到画布能力包上（ADR-0015）。
 *
 * **节点画布可寻址（离线核查 `node_modules/mermaid/dist/chunks/mermaid.core/
 * architectureDiagram-*.mjs`）**：渲染器给三类节点写带源码 id 的 DOM id——
 * service 外层 `g.architecture-service` id 为 `${diagramId}-service-${service.id}`（824 行）、
 * 背景路径 id 为 `${diagramId}-node-${service.id}`（819 行）；junction 的 rect id 为
 * `${diagramId}-node-${junction.id}`（837 行）；group 的背景路径 id 为
 * `${diagramId}-group-${data.id}`（743 行）。`node-data-ids.annotateArchitectureDataIds`
 * （本能力包 nodeAnnotator 承载，作用域限定在 svg 内这三种带 svgId 前缀的 id 形态，
 * 证据：注册图种中只有 architecture 用 `-service-` / `-group-` 词元；`-node-` 词元与
 * flowchart 的 `-flowchart-` / state 的 `-state-` 不同形）把这些元素反注成
 * `data-id = 源码 id`。三类节点共享一个 id 命名空间（registeredIds），data-id 即唯一。
 *
 * **边不可寻址（如实降级，工单 Comments 记证据）**：边 path 的 DOM id 是
 * `${diagramId}-L_${source}_${target}_0`（672 行，getEdgeId 计数器恒为缺省 0）——
 * 同一对端点的多条边 DOM id 相互覆盖、方向端口也不在 id 里，位置序无法回注。
 * 不实现 edgeAnnotator；边的编辑入口 = 结构树选中 + 属性表单（改端口 / 箭头 / 删除）。
 * 另：junction-only（图内无 service）的文档反注门卫（`.architecture-service`）不命中，
 * 此类退化同样记录在案。
 *
 * data-id 约定：data-id = 源码 id（service / group / junction 共享命名空间），resolver
 * 按投影映射回带前缀的 elementId（`service:<id>` 等）——**只认投影已知 id**，未知安静拒绝。
 */

/** data-id（源码 id）→ 节点选中（id = 投影 elementId，带 `service:` / `group:` / `junction:` 前缀） */
export function architectureDataIdResolver(projection: ArchitectureProjection): DataIdResolver {
  const byId = new Map<string, string>()
  for (const s of projection.services) byId.set(s.id, s.elementId)
  for (const g of projection.groups) byId.set(g.id, g.elementId)
  for (const j of projection.junctions) byId.set(j.id, j.elementId)
  const nodes = nodeDataIdResolver(byId.keys())
  return (dataId) => {
    const hit = nodes(dataId)
    return hit !== null ? { kind: 'node', id: byId.get(dataId) ?? dataId } : null
  }
}

/** 画布节点 id（投影 elementId）→ 编辑器选中；前缀不认识安静拒绝 */
export function architectureSelectionOf(canvas: { kind: 'node'; id: string }): Selection | null {
  const service = parseArchitectureServiceElementId(canvas.id)
  if (service !== null) return { kind: 'architecture-service', name: service.id }
  const group = parseArchitectureGroupElementId(canvas.id)
  if (group !== null) return { kind: 'architecture-group', name: group.id }
  const junction = parseArchitectureJunctionElementId(canvas.id)
  if (junction !== null) return { kind: 'architecture-junction', name: junction.id }
  return null
}

/** architecture 画布能力包。边不可寻址 → 不实现 edgeAnnotator。 */
export const architectureCanvasCapabilities: CanvasCapabilities<ProjectionOf<'architecture'>> = {
  // data-id = 源码 id（渲染后处理反注，见 node-data-ids.annotateArchitectureDataIds）
  dataIdResolver: (projection) => architectureDataIdResolver(projection.architecture),
  // resolver 返回的 node.id 即投影 elementId（`service:<id>` / `group:<gid>` / `junction:<jid>`）
  toSelection: (canvas) => (canvas.kind === 'node' ? architectureSelectionOf(canvas) : null),
  // 选中 → 源码 id（高亮 / 导航寻址；边 / align / 别种选中安静地不高亮）
  canvasIdOf: (_projection, selection) => {
    if (selection.kind === 'architecture-service' || selection.kind === 'architecture-group' || selection.kind === 'architecture-junction') {
      return selection.name
    }
    return null
  },
  // 投影顺序的节点 id（方位导航）：service → junction → group
  navigationIds: (projection) => [
    ...projection.architecture.services.map((s) => s.id),
    ...projection.architecture.junctions.map((j) => j.id),
    ...projection.architecture.groups.map((g) => g.id),
  ],
  keyboardProjection: (projection) => ({ kind: 'architecture', projection: projection.architecture }),
  // 节点 data-id 反注（渲染后处理；身份来自 DOM id，无需投影信息，绑定只为成员形状一致）
  nodeAnnotator: () => (root) => annotateArchitectureDataIds(root),
  resolveSelection: (projection, selection) => resolveArchitectureSelection(projection.architecture, selection),
  // 删除意图：唯一映射在 canvas-keyboard.architectureDeleteIntent
  deleteIntent: (projection, selection) => architectureDeleteIntent(projection.architecture, selection),
  // 键位语义：唯一映射在 canvas-keyboard.architectureKeyPlan
  keyHandler: (projection) => (input) => architectureKeyPlan(projection.architecture, input),
}
