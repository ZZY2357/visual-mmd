// kanban 画布键盘 / 删除语义（architecture-deepening-3 工单 01：自 editing/canvas-keyboard.ts 物理归位，代码块字节级搬移，逻辑零改动）

import { kanbanCardElementId, kanbanColumnElementId } from './element-id'
import { nextFreeName } from './element-id'
import type { KeyInput, KeyPlan } from '../editing/canvas-keyboard'
import type { KanbanIntent } from './kanban'
import type { KanbanProjection } from '../projection/kanban-projection'
import type { Selection } from '../projection/selection'

// ---------- kanban 编辑键（more-diagrams 工单 06 / ADR-0013）：就近结构映射 ----------

/** kanban 编辑键动作：Tab = 同列加卡片、Enter = 加下一列、Delete = 删除选中元素 */
type KanbanKeyAction = 'delete' | 'add-card' | 'add-column'

/**
 * 键位 → 动作（kanban，ADR-0013 就近类比）：列是分组、卡片是行，卡片附近最近的结构是
 * 「同列再加一张卡片」（Tab）与「再开一列」（Enter）。带修饰键（Shift-Tab 等）不处理。
 */
function kanbanKeyAction(key: string, mods: { shift?: boolean } = {}): KanbanKeyAction | null {
  if (key === 'Delete' || key === 'Backspace') return 'delete'
  if (key === 'Tab') return mods.shift === true ? null : 'add-card'
  if (key === 'Enter') return mods.shift === true ? null : 'add-column'
  return null
}

/**
 * 选中元素 → 删除意图（kanban）：列（连同其卡片）与卡片各映射到既有 delete-* 意图，
 * 级联由管线负责；已不在投影 / null / 图表级 / 别种选中 → null。
 */
export function kanbanDeleteIntent(projection: KanbanProjection, selection: Selection | null): KanbanIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'kanban-column':
      return projection.columns.some((c) => c.elementId === selection.elementId)
        ? { type: 'delete-column', elementId: selection.elementId }
        : null
    case 'kanban-card':
      return projection.cards.some((c) => c.elementId === selection.elementId)
        ? { type: 'delete-card', elementId: selection.elementId }
        : null
    default:
      return null
  }
}

/** 全部已用节点 id（列 + 卡片）：mermaid kanban 要求 id 全局唯一，新建避重据此 */
function kanbanUsedIds(projection: KanbanProjection): string[] {
  return [...projection.columns.map((c) => c.id), ...projection.cards.map((c) => c.id)]
}

/**
 * 键 → plan（kanban，more-diagrams 工单 06 / ADR-0013 就近类比）：
 * - Delete = 删除选中元素（查 kanbanDeleteIntent 唯一映射）
 * - Tab = 同列加卡片（选中卡片取其所属列；选中列即该列）→ 落码 + 选中 + 内联编辑描述
 * - Enter = 加下一列（文档末尾追加）→ 落码 + 选中 + 内联编辑标题
 * 无选中 / 选中不是列或卡片 → null（不 preventDefault、不落码）。占位文本在落码后由
 * 内联命名改写（与 flowchart/mindmap 新建节点的既有口径一致）。
 */
export function kanbanKeyPlan(projection: KanbanProjection, input: KeyInput): KeyPlan | null {
  const action = kanbanKeyAction(input.key, input.mods)
  if (action === null) return null
  const selection = input.selection
  if (action === 'delete') {
    const intent = kanbanDeleteIntent(projection, selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  if (selection === null) return null
  if (selection.kind !== 'kanban-card' && selection.kind !== 'kanban-column') return null
  const used = kanbanUsedIds(projection)
  if (action === 'add-column') {
    const id = nextFreeName('col', used)
    return {
      intents: [{ type: 'add-column', id, title: '新列' }],
      newElementTarget: {
        selection: { kind: 'kanban-column', elementId: kanbanColumnElementId(id) },
        inlineEdit: { kind: 'kanban-column', elementId: kanbanColumnElementId(id) },
      },
    }
  }
  // add-card：选中卡片取其所属列；选中列即该列
  const columnElementId =
    selection.kind === 'kanban-column'
      ? selection.elementId
      : (projection.cards.find((c) => c.elementId === selection.elementId)?.columnElementId ?? null)
  if (columnElementId === null || !projection.columns.some((c) => c.elementId === columnElementId)) return null
  const id = nextFreeName('t', used)
  return {
    intents: [{ type: 'add-card', columnElementId, id, description: '新卡片' }],
    newElementTarget: {
      selection: { kind: 'kanban-card', elementId: kanbanCardElementId(id) },
      inlineEdit: { kind: 'kanban-card', elementId: kanbanCardElementId(id) },
    },
  }
}
