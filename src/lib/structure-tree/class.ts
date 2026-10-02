// class 结构树分区（architecture-deepening-3 工单 02：自 structure-tree/partitions.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { AnyProjection } from '../diagram-registry'
import type { ClassProjection } from '../projection/class-projection'
import { diagramSection, withDiagramLabel, type TreeSection, type TreePartitionsContext } from './partitions'

// ---------- class ----------

export function classPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'class') return []
  const p: ClassProjection = projection.class
  return [
    withDiagramLabel(diagramSection('classDiagram'), t('app:propertyPanel.diagram')),
    {
      key: 'classes',
      heading: t('app:propertyPanel.classes'),
      count: p.classes.length,
      entries: p.classes.map((c) => ({
        key: c.elementId,
        label: c.generic !== null ? `${c.name}~${c.generic}~` : c.name,
        detail: c.hasBlock ? '{}' : undefined,
        depth: 1,
        selection: { kind: 'class', name: c.name },
      })),
    },
    {
      key: 'namespaces',
      heading: t('app:propertyPanel.namespaces'),
      count: p.namespaces.length,
      entries: p.namespaces.map((ns) => ({
        key: ns.elementId,
        label: ns.name,
        depth: 1,
        selection: { kind: 'class-namespace', elementId: ns.elementId },
      })),
    },
    {
      key: 'members',
      heading: t('app:propertyPanel.members'),
      count: p.members.length,
      entries: p.members.map((m) => ({
        key: m.elementId,
        label: `${m.vis === '' ? '' : m.vis + ' '}${m.text}`,
        detail: m.owner ?? undefined,
        depth: 2,
        selection: { kind: 'class-member', elementId: m.elementId },
      })),
    },
    {
      key: 'relations',
      heading: t('app:propertyPanel.relations'),
      count: p.relations.length,
      entries: p.relations.map((r) => ({
        key: r.elementId,
        label: `${r.from} ${r.kind} ${r.to}`,
        detail: r.label ?? undefined,
        depth: 1,
        selection: { kind: 'class-relation', elementId: r.elementId },
      })),
    },
    {
      key: 'notes',
      heading: t('app:propertyPanel.notes'),
      count: p.notes.length,
      entries: p.notes.map((n) => ({
        key: n.elementId,
        label:
          n.forClass !== null
            ? t('app:propertyPanel.noteFor', { cls: n.forClass })
            : t('app:propertyPanel.floatingNote'),
        detail: n.text || undefined,
        depth: 1,
        selection: { kind: 'class-note', elementId: n.elementId },
      })),
    },
    {
      key: 'classDefs',
      heading: t('app:propertyPanel.classDefs'),
      count: p.classDefs.length,
      entries: p.classDefs.map((cd) => ({
        key: cd.name,
        label: cd.name,
        detail: cd.props.fill,
        depth: 1,
        selection: { kind: 'classdef', name: cd.name },
      })),
    },
  ]
}
