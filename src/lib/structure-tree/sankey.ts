// sankey 结构树分区（architecture-deepening-3 工单 02：自 structure-tree/partitions.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { AnyProjection } from '../diagram-registry'
import type { SankeyProjection } from '../projection/sankey-projection'
import type { Selection } from '../projection/selection'
import { diagramSection, withDiagramLabel, type TreeSection, type TreePartitionsContext } from './partitions'

// ---------- sankey（more-diagrams 工单 13） ----------

/**
 * sankey 结构树（工单 13）：**节点作为分组条目、链路作为其子元素呈现**（工单定案——
 * 节点不落码，名字只存在于链路行，故树以节点为组织轴；与 kanban 的「列分组 + 卡片
 * children」同款嵌套范式）。节点 = 链路行 source/target 首现去重派生，名字即身份；
 * 其 children = 该节点作为 source/target 参与的全部链路（`linkIds`，同一条链路会同时
 * 挂在两端节点下——参与语义，每条仍各自选中）。链路 detail 携带数值原文，**非法数值/
 * 非法名字原样展示并标注**（不静默改写，工单定案——非 ASCII 名字是 mermaid 词法错误、
 * value 走宽松 parseFloat）。sankey 画布经位置序反注可寻址（见 sankey-adapter），
 * 画布键盘直接生效，树条目不再挂 onKeyDown（与 flowchart 同口径，区别于 pie/journey
 * 的「画布无寻址」降级）。
 */
export function sankeyPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'sankey') return []
  const p: SankeyProjection = projection.sankey
  const linkById = new Map(p.links.map((l) => [l.elementId, l]))

  return [
    withDiagramLabel(diagramSection('sankey-beta'), t('app:propertyPanel.diagram')),
    {
      key: 'nodes',
      heading: t('app:propertyPanel.sankeyNodes'),
      count: p.nodes.length,
      entries: p.nodes.map((n) => ({
        key: `node:${n.name}`,
        label: n.name,
        detail:
          [
            t('app:propertyPanel.sankeyNodeDegree', { count: n.linkIds.length }),
            n.nameValid ? undefined : t('app:propertyPanel.sankeyNameInvalidShort', { name: n.name }),
          ]
            .filter((x) => x !== undefined)
            .join(' · ') || undefined,
        depth: 1,
        selection: { kind: 'sankey-node', name: n.name },
        children: n.linkIds
          .map((elementId) => {
            const l = linkById.get(elementId)
            if (l === undefined) return null
            return {
              key: elementId,
              label: `${l.source} → ${l.target}`,
              detail:
                [
                  l.valueValid ? l.valueText : t('app:propertyPanel.sankeyValueInvalidShort', { value: l.valueText }),
                  !l.sourceValid || !l.targetValid ? t('app:propertyPanel.sankeyEndpointInvalid') : undefined,
                ]
                  .filter((x) => x !== undefined)
                  .join(' · ') || undefined,
              depth: 2,
              selection: { kind: 'sankey-link', elementId: l.elementId } as Selection,
            }
          })
          .filter((x) => x !== null),
      })),
    },
  ]
}
