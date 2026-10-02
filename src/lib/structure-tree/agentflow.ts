// agentflow 结构树分区（architecture-deepening-3 工单 02：自 structure-tree/partitions.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { AnyProjection } from '../diagram-registry'
import type { AgentflowProjection } from '../projection/agentflow-projection'
import { diagramSection, withDiagramLabel, type TreeEntry, type TreeSection, type TreePartitionsContext } from './partitions'

// ---------- agentflow（more-diagrams 工单 27） ----------

/**
 * agentflow 结构树（工单 27）：容器（`flow` 分组，作为分组条目、其内节点作为 children，
 * 复用树形渲染器）+ 顶层节点分区（含 `global … end` 块内节点——块内节点保持顶层）+
 * 边分区（位置序身份）+ 文档行分区。容器 `flow` 与 `global` 都进「容器」分区
 * （`global` 是作用域豁免、无渲染分组，如实呈现为容器条目）。
 *
 * agentflow 画布节点可寻址（反注 data-id，research §8.2 实测），边也可点选（原生
 * data-id）；容器不可点选（无 data-id，如实降级）——容器选中走结构树。
 * 故树条目不挂 onKeyDown（与 flowchart/sankey 同口径，区别于 pie/journey 的画布无寻址降级）。
 */
export function agentflowPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'agentflow') return []
  const p: AgentflowProjection = projection.agentflow

  // 容器归属：节点按 containerId 挂到最近的 flow 分组下；顶层节点（containerId=null）平铺
  const nodeEntry = (node: (typeof p.nodes)[number], depth: number): TreeEntry => ({
    key: `node:${node.nodeId}`,
    label: node.text ?? node.nodeId,
    detail:
      [
        node.text !== null ? node.nodeId : undefined,
        node.shape !== null ? t(`app:agentflowShapes.${node.shape}`) : undefined,
        node.isConnector ? t('app:propertyPanel.agentflowConnectorShort') : undefined,
        node.inGlobal ? t('app:propertyPanel.agentflowGlobalShort') : undefined,
      ]
        .filter((x) => x !== undefined)
        .join(' · ') || undefined,
    depth,
    selection: { kind: 'agentflow-node', nodeId: node.nodeId },
  })

  const flowEntry = (container: (typeof p.containers)[number]): TreeEntry => {
    const members = p.nodes.filter((n) => n.containerId === container.elementId)
    return {
      key: container.elementId,
      label: container.title ?? container.id ?? t(`app:propertyPanel.agentflowContainerKinds.${container.keyword}`),
      detail:
        container.title !== null && container.id !== null ? container.id : undefined,
      depth: 1,
      selection: { kind: 'agentflow-flow', elementId: container.elementId },
      children: members.length > 0 ? members.map((n) => nodeEntry(n, 2)) : undefined,
    }
  }

  return [
    withDiagramLabel(
      diagramSection(p.direction !== '' ? p.direction : undefined),
      t('app:propertyPanel.diagram'),
    ),
    {
      key: 'containers',
      heading: t('app:propertyPanel.agentflowContainers'),
      count: p.containers.length,
      entries: p.containers.map(flowEntry),
    },
    {
      key: 'nodes',
      heading: t('app:propertyPanel.agentflowNodes'),
      count: p.nodes.filter((n) => n.containerId === null).length,
      entries: p.nodes.filter((n) => n.containerId === null).map((n) => nodeEntry(n, 1)),
    },
    {
      key: 'edges',
      heading: t('app:propertyPanel.agentflowEdges'),
      count: p.edges.length,
      entries: p.edges.map((edge) => ({
        key: edge.elementId,
        label: `${edge.from} → ${edge.to}`,
        detail:
          [
            t(`app:agentflowEdgeKinds.${edge.edgeKind}`),
            edge.label !== '' ? edge.label : undefined,
          ]
            .filter((x) => x !== undefined)
            .join(' · ') || undefined,
        depth: 1,
        selection: { kind: 'agentflow-edge', elementId: edge.elementId },
      })),
    },
    {
      key: 'docLines',
      heading: t('app:propertyPanel.agentflowDocLines'),
      count: p.docLines.length,
      entries: p.docLines.map((line) => ({
        key: line.elementId,
        label: line.text,
        depth: 1,
        selection: { kind: 'agentflow-doc', elementId: line.elementId },
      })),
    },
  ]
}
