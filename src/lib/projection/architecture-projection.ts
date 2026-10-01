import type { SourceDocument } from '../pipeline/document'
import {
  archTitleText,
  archIconText,
  arrowOf,
  type ArchAlignData,
  type ArchArrow,
  type ArchEdgeData,
  type ArchNodeDeclData,
  type ArchPort,
  type ArchitectureHeaderData,
} from '../pipeline/architecture'
import type { Selection } from './selection'

/**
 * architecture-beta 投影（more-diagrams 工单 17，ADR-0008/0016）：从解析产物派生的只读结构视图。
 *
 * - service / group / junction 是**名字即身份**的三类节点（mermaid db 的 registeredIds
 *   一张表共享命名空间、重名抛错——离线核对 architectureDiagram db.addService/addGroup/
 *   addJunction）；声明行 elementId 即 `service:<id>` / `group:<gid>` / `junction:<jid>`。
 * - 边走位置序身份 `edge:N`（ADR-0012，与 block 边同前缀、图种先收窄）；端点存在性在投影里
 *   标注（`endpointValid`：端点必须是已声明的 service / junction——group 直接作端点是
 *   mermaid 渲染错误，原样展示不静默改写，工单定案）。
 * - `align` 是元素（位置序 `align:N`），进投影供结构树展示与删除。
 * - 画布 DOM 身份（离线核对 mermaid 12 architectureDiagram 渲染器源码）：service 外层
 *   `g.architecture-service` id 为 `${diagramId}-service-${id}`、背景 path id
 *   `${diagramId}-node-${id}`；junction 的 rect id 为 `${diagramId}-node-${id}`；
 *   group 的背景 path id 为 `${diagramId}-group-${id}`——三类节点的 DOM id 都带源码 id，
 *   渲染后可反注 data-id（见 architecture-adapter / node-data-ids）。**边不可寻址**：
 *   边 path id 是 `${diagramId}-L_${from}_${to}_0`（getEdgeId 计数器恒 0，同一对端点的
 *   多条边 DOM id 相互覆盖，端口也不在 id 里）——边画布寻址整体降级，结构树是完整入口。
 */

export interface ProjectionArchitectureService {
  kind: 'arch-service'
  /** service id（语法标识，名字即身份） */
  id: string
  /** 声明行 elementId（`service:<id>`） */
  elementId: string
  /** 图标名（内置枚举或 `pack:icon-name`）；未设 null */
  icon: string | null
  /** `[标题]`；未设 null（显示回落 id） */
  title: string | null
  /** 所属 group id（`in` 子句）；顶层 null */
  parent: string | null
}

export interface ProjectionArchitectureGroup {
  kind: 'arch-group'
  id: string
  elementId: string
  icon: string | null
  title: string | null
  /** 父 group id（组可嵌套）；顶层 null */
  parent: string | null
}

export interface ProjectionArchitectureJunction {
  kind: 'arch-junction'
  id: string
  elementId: string
  parent: string | null
}

export interface ProjectionArchitectureEdge {
  kind: 'arch-edge'
  /** 位置序身份 `edge:N`（ADR-0012） */
  elementId: string
  from: string
  to: string
  /** `{group}` 边界穿越标记（要求该端点 service 真的 `in` 某个组） */
  fromGroup: boolean
  toGroup: boolean
  fromPort: ArchPort | null
  toPort: ArchPort | null
  arrow: ArchArrow
  /** `-label-` 形态的标签；含 `-` 的标签整行 verbatim（不入投影），此处恒 null */
  label: string | null
  /** 端点是否为已声明的 service / junction（group 直接作端点 = mermaid 渲染错误） */
  endpointValid: boolean
}

export interface ProjectionArchitectureAlign {
  kind: 'arch-align'
  /** 位置序身份 `align:N` */
  elementId: string
  direction: 'row' | 'column'
  members: string[]
}

export interface ArchitectureProjection {
  /** 表头关键字原文（architecture-beta） */
  keyword: string
  services: ProjectionArchitectureService[]
  groups: ProjectionArchitectureGroup[]
  junctions: ProjectionArchitectureJunction[]
  edges: ProjectionArchitectureEdge[]
  aligns: ProjectionArchitectureAlign[]
}

/** 从解析产物构建 architecture 投影（纯函数，ADR-0016：投影吃解析产物） */
export function buildArchitectureProjection(doc: SourceDocument): ArchitectureProjection {
  const keywordPart = doc.elements.find((p) => p.element.kind === 'architecture-header')
  const keyword = keywordPart !== undefined ? (keywordPart.element as ArchitectureHeaderData).keyword : 'architecture-beta'

  const services: ProjectionArchitectureService[] = []
  const groups: ProjectionArchitectureGroup[] = []
  const junctions: ProjectionArchitectureJunction[] = []
  const edges: ProjectionArchitectureEdge[] = []
  const aligns: ProjectionArchitectureAlign[] = []
  // 名字 → 类别（registeredIds 共享命名空间：service / group / junction 不重名）
  const kindOf = new Map<string, 'service' | 'group' | 'junction'>()
  // 边端点合法性：必须是已声明的 service / junction（group 直接作端点 = mermaid 渲染错误）
  const validEndpoint = (id: string): boolean => {
    const k = kindOf.get(id)
    return k === 'service' || k === 'junction'
  }

  for (const part of doc.elements) {
    const data = part.element
    if (data.kind === 'architecture-node-decl') {
      const decl = data as ArchNodeDeclData
      kindOf.set(decl.id, decl.keyword)
      if (decl.keyword === 'service') {
        services.push({
          kind: 'arch-service',
          id: decl.id,
          elementId: part.id,
          icon: decl.iconRaw !== null ? archIconText(decl.iconRaw) : null,
          title: decl.titleRaw !== null ? archTitleText(decl.titleRaw) : null,
          parent: decl.inClause !== null ? decl.inClause.parent : null,
        })
      } else if (decl.keyword === 'group') {
        groups.push({
          kind: 'arch-group',
          id: decl.id,
          elementId: part.id,
          icon: decl.iconRaw !== null ? archIconText(decl.iconRaw) : null,
          title: decl.titleRaw !== null ? archTitleText(decl.titleRaw) : null,
          parent: decl.inClause !== null ? decl.inClause.parent : null,
        })
      } else {
        junctions.push({
          kind: 'arch-junction',
          id: decl.id,
          elementId: part.id,
          parent: decl.inClause !== null ? decl.inClause.parent : null,
        })
      }
    } else if (data.kind === 'architecture-edge') {
      const edge = data as ArchEdgeData
      edges.push({
        kind: 'arch-edge',
        elementId: part.id,
        from: edge.from,
        to: edge.to,
        fromGroup: edge.fromGroupRaw !== null,
        toGroup: edge.toGroupRaw !== null,
        fromPort: edge.fromPort,
        toPort: edge.toPort,
        arrow: arrowOf(edge),
        label: null,
        // 端点存在性标注（原样展示不静默改写，工单定案）
        endpointValid: validEndpoint(edge.from) && validEndpoint(edge.to),
      })
    } else if (data.kind === 'architecture-align') {
      const align = data as ArchAlignData
      aligns.push({
        kind: 'arch-align',
        elementId: part.id,
        direction: align.direction,
        members: [...align.members],
      })
    }
  }

  return { keyword, services, groups, junctions, edges, aligns }
}

// ---------- 选中回落 ----------

/** 选中目标在投影中仍存在则原样返回，否则回落 null（由调用方回落图表级） */
export function resolveArchitectureSelection(
  projection: ArchitectureProjection,
  selection: Selection | null,
): Selection | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'diagram':
      return selection
    case 'architecture-service':
      return projection.services.some((s) => s.id === selection.name) ? selection : null
    case 'architecture-group':
      return projection.groups.some((g) => g.id === selection.name) ? selection : null
    case 'architecture-junction':
      return projection.junctions.some((j) => j.id === selection.name) ? selection : null
    case 'architecture-edge':
      return projection.edges.some((e) => e.elementId === selection.elementId) ? selection : null
    case 'architecture-align':
      return projection.aligns.some((a) => a.elementId === selection.elementId) ? selection : null
    default:
      return null
  }
}
