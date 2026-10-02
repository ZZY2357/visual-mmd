// er 结构树分区（architecture-deepening-3 工单 02：自 structure-tree/partitions.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { AnyProjection } from '../diagram-registry'
import type { ErProjection } from '../projection/er-projection'
import { diagramSection, withDiagramLabel, type TreeSection, type TreePartitionsContext } from './partitions'

// ---------- er（more-diagrams 工单 03） ----------

export function erPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'er') return []
  const p: ErProjection = projection.er
  return [
    withDiagramLabel(diagramSection(p.direction ?? undefined), t('app:propertyPanel.diagram')),
    {
      key: 'entities',
      heading: t('app:propertyPanel.erEntities'),
      count: p.entities.length,
      entries: p.entities.map((entity) => ({
        key: entity.elementId ?? `implicit:${entity.name}`,
        label: entity.alias ?? entity.name,
        detail: entity.alias !== null ? entity.name : undefined,
        depth: 1,
        selection: { kind: 'er-entity', name: entity.name },
      })),
    },
    {
      key: 'attributes',
      heading: t('app:propertyPanel.erAttributes'),
      count: p.attributes.length,
      entries: p.attributes.map((attr) => ({
        key: attr.elementId,
        label:
          `${attr.keys.length > 0 ? attr.keys.join(', ') + ' ' : ''}${attr.type}${attr.nullable ? '?' : ''} ${attr.name}`,
        detail: attr.entity,
        depth: 2,
        selection: { kind: 'er-attribute', elementId: attr.elementId },
      })),
    },
    {
      key: 'relations',
      heading: t('app:propertyPanel.erRelations'),
      count: p.relations.length,
      entries: p.relations.map((rel) => ({
        key: rel.elementId,
        label: `${rel.from} ${rel.cardLeft}${rel.line}${rel.cardRight} ${rel.to}`,
        detail: rel.label ?? undefined,
        depth: 1,
        selection: { kind: 'er-relation', elementId: rel.elementId },
      })),
    },
  ]
}
