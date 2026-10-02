// block 结构树分区（architecture-deepening-3 工单 02：自 structure-tree/partitions.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { AnyProjection } from '../diagram-registry'
import type { BlockProjection } from '../projection/block-projection'
import { diagramSection, withDiagramLabel, type TreeEntry, type TreeSection, type TreePartitionsContext } from './partitions'

// ---------- block（more-diagrams 工单 09） ----------

/**
 * block 结构树：嵌套块作为分组条目，成员节点作为 children（与 kanban 列/卡片、
 * state 复合状态同一套树形渲染器）。space 不进结构树（布局空位，工单决策）；
 * 边单独一个分区（位置序身份）。节点/嵌套块共享 id 名空间，React key 加种类前缀。
 */
export function blockPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'block') return []
  const p: BlockProjection = projection.block

  const nodeEntry = (node: (typeof p.nodes)[number], depth: number): TreeEntry => {
    const shapeLabel =
      node.shape !== null ? t(`app:blockShapes.${node.shape}`) : undefined
    return {
      key: `node:${node.id}`,
      label: node.label ?? node.id,
      detail:
        [
          node.label !== null ? node.id : undefined,
          shapeLabel,
          node.arrowDirs !== null ? `(${node.arrowDirs})` : undefined,
          node.width !== null ? `x${node.width}` : undefined,
        ]
          .filter((x) => x !== undefined)
          .join(' · ') || undefined,
      depth,
      selection: { kind: 'block-node', id: node.id },
    }
  }

  // 嵌套块递归展开：组内直属节点作 children，嵌套组继续下钻
  const groupEntry = (group: (typeof p.groups)[number], depth: number): TreeEntry => {
    const memberNodes = p.nodes.filter((n) => n.parentId === group.id)
    const childGroups = p.groups.filter((g) => g.parentId === group.id)
    const children = [
      ...memberNodes.map((n) => nodeEntry(n, depth + 1)),
      ...childGroups.map((g) => groupEntry(g, depth + 1)),
    ]
    return {
      key: `group:${group.id}`,
      label: group.id,
      detail:
        [
          group.columns !== null ? `columns ${group.columns === 'auto' ? 'auto' : group.columns}` : undefined,
          group.width !== null ? `x${group.width}` : undefined,
        ]
          .filter((x) => x !== undefined)
          .join(' · ') || undefined,
      depth,
      selection: { kind: 'block-group', id: group.id },
      children: children.length > 0 ? children : undefined,
    }
  }

  return [
    withDiagramLabel(diagramSection(p.title ?? p.keyword), t('app:propertyPanel.diagram')),
    {
      key: 'nodes',
      heading: t('app:propertyPanel.blockNodes'),
      count: p.nodes.length + p.groups.length,
      entries: [
        ...p.nodes.filter((n) => n.parentId === null).map((n) => nodeEntry(n, 1)),
        ...p.groups.filter((g) => g.parentId === null).map((g) => groupEntry(g, 1)),
      ],
    },
    {
      key: 'edges',
      heading: t('app:propertyPanel.blockEdges'),
      count: p.edges.length,
      entries: p.edges.map((edge) => ({
        key: edge.elementId,
        label: `${edge.from} ${edge.line} ${edge.to}`,
        detail: edge.label ?? undefined,
        depth: 1,
        selection: { kind: 'block-edge', elementId: edge.elementId },
      })),
    },
  ]
}
