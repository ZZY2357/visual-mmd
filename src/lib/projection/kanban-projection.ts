import type { SourceDocument } from '../pipeline/document'
import { type KanbanNodeData, parseKanbanMeta } from '../pipeline/kanban'
import type { Selection } from './selection'

/**
 * kanban 投影（more-diagrams 工单 06，ADR-0008/0016）：从解析产物派生的只读结构视图，
 * 驱动结构树与属性表单。投影只认解析产物的 *Data（ADR-0016）。
 *
 * - 列是分组元素：列行 + 其下全部卡片行（缩进归属在解析阶段已定，投影只需顺序归并）。
 * - 卡片是节点元素：描述 + 元数据三字段（assigned / ticket / priority）。
 * - kanban 无连线概念（research 已核查），故无位置序连线身份（ADR-0012）。
 *
 * element id 直接取解析产物的 part.id（`kanban-column:<id>` / `kanban-card:<id>`），
 * 与 parser 计数器同源，画布 data-id 与编辑意图寻址共用同一键。
 */

export interface ProjectionKanbanCard {
  /** `kanban-card:<id>`，编辑意图寻址键 */
  elementId: string
  /** 卡片 id（语法标识，画布 data-id 也用它） */
  id: string
  /** 归属列的 elementId（`kanban-column:<id>`）；新卡片落码锚点等据此定位 */
  columnElementId: string
  /** 支持 Markdown 的描述文本（`[...]` 内） */
  description: string
  /** `@{ assigned }`；无 null */
  assigned: string | null
  /** `@{ ticket }`；无 null */
  ticket: string | null
  /** `@{ priority }`；无 null（取值见 KANBAN_PRIORITIES） */
  priority: string | null
}

export interface ProjectionKanbanColumn {
  /** `kanban-column:<id>`，编辑意图寻址键 */
  elementId: string
  /** 列 id（语法标识，画布 data-id 也用它） */
  id: string
  /** 列标题（`[...]` 内） */
  title: string
  /** 归属卡片（文档序） */
  cards: ProjectionKanbanCard[]
}

export interface KanbanProjection {
  /** 按文档顺序 */
  columns: ProjectionKanbanColumn[]
  /** 全部卡片，按文档序（跨列；键盘 / 菜单按 elementId 查找） */
  cards: ProjectionKanbanCard[]
}

/** 从解析产物构建 kanban 投影（纯函数，ADR-0016：投影吃 IR/解析产物） */
export function buildKanbanProjection(doc: SourceDocument): KanbanProjection {
  const columns: ProjectionKanbanColumn[] = []
  const cards: ProjectionKanbanCard[] = []
  // 归并栈：最近一个列（卡片缩进归属在解析阶段已定，卡片必属其上方最近一列）
  let current: ProjectionKanbanColumn | null = null

  for (const part of doc.elements) {
    const data = part.element
    if (data.kind === 'kanban-column') {
      const node = data as KanbanNodeData
      current = { elementId: part.id, id: node.id, title: node.text, cards: [] }
      columns.push(current)
    } else if (data.kind === 'kanban-card') {
      const node = data as KanbanNodeData
      const meta = parseKanbanMeta(node.metaRaw)
      const card: ProjectionKanbanCard = {
        elementId: part.id,
        id: node.id,
        // parser 保证首列之前不出现卡片；防御性判空以免越界
        columnElementId: current?.elementId ?? '',
        description: node.text,
        assigned: meta.assigned,
        ticket: meta.ticket,
        priority: meta.priority,
      }
      cards.push(card)
      if (current !== null) current.cards.push(card)
    }
  }

  return { columns, cards }
}

// ---------- 选中回落 ----------

/** 选中目标在投影中仍存在则原样返回，否则回落 null（由调用方回落图表级） */
export function resolveKanbanSelection(projection: KanbanProjection, selection: Selection | null): Selection | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'diagram':
      return selection
    case 'kanban-column':
      return projection.columns.some((c) => c.elementId === selection.elementId) ? selection : null
    case 'kanban-card':
      return projection.cards.some((c) => c.elementId === selection.elementId) ? selection : null
    default:
      return null
  }
}
