// architecture 结构树分区（architecture-deepening-3 工单 02：自 structure-tree/partitions.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { AnyProjection } from '../diagram-registry'
import type { ArchitectureProjection, ProjectionArchitectureGroup, ProjectionArchitectureJunction, ProjectionArchitectureService } from '../projection/architecture-projection'
import { diagramSection, withDiagramLabel, type TreeEntry, type TreeSection, type TreePartitionsContext } from './partitions'

// ---------- architecture（more-diagrams 工单 17） ----------

/**
 * architecture 结构树：分组（group）作为分组条目、其 service / junction / 嵌套组作为
 * children（复用与 block 嵌套块同一套树形渲染器）。三类节点共享 id 命名空间，React key
 * 加种类前缀。边走位置序分区（label `from → to`，detail 携带箭头形态）；align 单独一个
 * 分区（位置序身份）。边不可寻址（见 architecture-adapter），结构树 + 属性表单是完整编辑入口。
 */
export function architecturePartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'architecture') return []
  const p: ArchitectureProjection = projection.architecture

  const arrowLabel = (arrow: 'none' | 'source' | 'target' | 'both'): string =>
    t(`app:architectureArrows.${arrow}`)

  const serviceEntry = (service: ProjectionArchitectureService, depth: number): TreeEntry => ({
    key: `service:${service.id}`,
    label: service.title ?? service.id,
    detail:
      [
        service.title !== null ? service.id : undefined,
        service.icon,
        service.parent !== null ? t('app:propertyPanel.archInGroupShort', { group: service.parent }) : undefined,
      ]
        .filter((x) => x !== undefined)
        .join(' · ') || undefined,
    depth,
    selection: { kind: 'architecture-service', name: service.id },
  })

  const junctionEntry = (junction: ProjectionArchitectureJunction, depth: number): TreeEntry => ({
    key: `junction:${junction.id}`,
    label: junction.id,
    detail: junction.parent !== null ? t('app:propertyPanel.archInGroupShort', { group: junction.parent }) : undefined,
    depth,
    selection: { kind: 'architecture-junction', name: junction.id },
  })

  const groupEntry = (group: ProjectionArchitectureGroup, depth: number): TreeEntry => {
    const childServices = p.services.filter((s) => s.parent === group.id)
    const childJunctions = p.junctions.filter((j) => j.parent === group.id)
    const childGroups = p.groups.filter((g) => g.parent === group.id)
    const children = [
      ...childServices.map((s) => serviceEntry(s, depth + 1)),
      ...childJunctions.map((j) => junctionEntry(j, depth + 1)),
      ...childGroups.map((g) => groupEntry(g, depth + 1)),
    ]
    return {
      key: `group:${group.id}`,
      label: group.title ?? group.id,
      detail:
        [
          group.title !== null ? group.id : undefined,
          group.icon,
          group.parent !== null ? t('app:propertyPanel.archInGroupShort', { group: group.parent }) : undefined,
        ]
          .filter((x) => x !== undefined)
          .join(' · ') || undefined,
      depth,
      selection: { kind: 'architecture-group', name: group.id },
      children: children.length > 0 ? children : undefined,
    }
  }

  return [
    withDiagramLabel(diagramSection(p.keyword), t('app:propertyPanel.diagram')),
    {
      key: 'nodes',
      heading: t('app:propertyPanel.architectureNodes'),
      count: p.services.length + p.groups.length + p.junctions.length,
      entries: [
        ...p.services.filter((s) => s.parent === null).map((s) => serviceEntry(s, 1)),
        ...p.junctions.filter((j) => j.parent === null).map((j) => junctionEntry(j, 1)),
        ...p.groups.filter((g) => g.parent === null).map((g) => groupEntry(g, 1)),
      ],
    },
    {
      key: 'edges',
      heading: t('app:propertyPanel.architectureEdges'),
      count: p.edges.length,
      entries: p.edges.map((edge) => ({
        key: edge.elementId,
        label: `${edge.from} → ${edge.to}`,
        detail:
          [
            arrowLabel(edge.arrow),
            edge.fromPort !== null || edge.toPort !== null
              ? `${edge.fromPort ?? '-'}·${edge.toPort ?? '-'}`
              : undefined,
            edge.endpointValid ? undefined : t('app:propertyPanel.archEndpointInvalidShort'),
          ]
            .filter((x) => x !== undefined)
            .join(' · ') || undefined,
        depth: 1,
        selection: { kind: 'architecture-edge', elementId: edge.elementId },
      })),
    },
    {
      key: 'aligns',
      heading: t('app:propertyPanel.architectureAligns'),
      count: p.aligns.length,
      entries: p.aligns.map((align) => ({
        key: align.elementId,
        label: `align ${align.direction}`,
        detail: align.members.join(', '),
        depth: 1,
        selection: { kind: 'architecture-align', elementId: align.elementId },
      })),
    },
  ]
}
