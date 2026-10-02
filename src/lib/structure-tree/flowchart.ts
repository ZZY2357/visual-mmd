// flowchart 结构树分区（architecture-deepening-3 工单 02：自 structure-tree/partitions.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { AnyProjection } from '../diagram-registry'
import type { FlowchartProjection } from '../projection/flowchart-projection'
import { diagramSection, withDiagramLabel, type TreeSection, type TreePartitionsContext } from './partitions'

// ---------- flowchart ----------

export function flowchartPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'flowchart') return []
  const p: FlowchartProjection = projection.flowchart
  return [
    withDiagramLabel(diagramSection(p.direction ?? 'TB'), t('app:propertyPanel.diagram')),
    {
      key: 'nodes',
      heading: t('app:propertyPanel.nodes'),
      count: p.nodes.length,
      entries: p.nodes.map((node) => ({
        key: node.nodeId,
        label: node.text ?? node.nodeId,
        detail: node.text !== null ? node.nodeId : undefined,
        depth: 1,
        selection: { kind: 'node', nodeId: node.nodeId },
      })),
    },
    {
      key: 'edges',
      heading: t('app:propertyPanel.edges'),
      count: p.edges.length,
      entries: p.edges.map((edge) => ({
        key: `${edge.from}->${edge.to}#${edge.occurrence}`,
        label: t('app:propertyPanel.edgeLabel', { from: edge.from, to: edge.to }),
        detail: edge.label ?? undefined,
        depth: 1,
        selection: { kind: 'edge', from: edge.from, to: edge.to, occurrence: edge.occurrence },
      })),
    },
    {
      key: 'subgraphs',
      heading: t('app:propertyPanel.subgraphs'),
      count: p.subgraphs.length,
      entries: p.subgraphs.map((sg) => ({
        key: sg.elementId,
        label: sg.title ?? sg.id ?? t('app:propertyPanel.unnamedSubgraph'),
        depth: 1,
        selection: { kind: 'subgraph', elementId: sg.elementId },
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
