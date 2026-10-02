// kanban 结构树分区（architecture-deepening-3 工单 02：自 structure-tree/partitions.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { AnyProjection } from '../diagram-registry'
import type { KanbanProjection } from '../projection/kanban-projection'
import { diagramSection, withDiagramLabel, type TreeSection, type TreePartitionsContext } from './partitions'

// ---------- kanban（more-diagrams 工单 06） ----------

/**
 * kanban 结构树：列作为分组条目，其卡片作为 children（复用与 state 复合状态
 * 同一套树形渲染器）。卡片显示描述，携带元数据的卡片把 assigned / ticket /
 * priority 拼进 detail——结构树是画布未寻址内容（元数据）的完整编辑入口。
 */
export function kanbanPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'kanban') return []
  const p: KanbanProjection = projection.kanban
  return [
    withDiagramLabel(diagramSection('kanban'), t('app:propertyPanel.diagram')),
    {
      key: 'columns',
      heading: t('app:propertyPanel.kanbanColumns'),
      count: p.columns.length,
      entries: p.columns.map((column) => ({
        key: column.elementId,
        label: column.title,
        detail: column.title !== column.id ? column.id : undefined,
        depth: 1,
        selection: { kind: 'kanban-column', elementId: column.elementId },
        children:
          column.cards.length > 0
            ? column.cards.map((card) => ({
                key: card.elementId,
                label: card.description,
                detail:
                  [
                    card.assigned !== null ? `@${card.assigned}` : undefined,
                    card.ticket !== null ? `#${card.ticket}` : undefined,
                    card.priority !== null ? t(`app:kanbanPriorities.${card.priority}`) : undefined,
                  ]
                    .filter((x) => x !== undefined)
                    .join(' · ') || undefined,
                depth: 2,
                selection: { kind: 'kanban-card', elementId: card.elementId },
              }))
            : undefined,
      })),
    },
  ]
}
