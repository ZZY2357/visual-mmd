import { describe, expect, it } from 'vitest'
import { kanbanParser } from '../../pipeline/kanban'
import { buildKanbanProjection, resolveKanbanSelection } from '../kanban-projection'
import type { Selection } from '../selection'

/**
 * kanban 投影测试（more-diagrams 工单 06，ADR-0016）：
 * 缩进归属在解析阶段已定，投影只需顺序归并——列携带其卡片、卡片携带归属列 elementId、
 * 元数据三字段；选中回落按投影存在性。
 */

const SOURCE = `kanban
  Todo[待办]
    t1[写代码]@{ assigned: '张三', ticket: 'VMMD-1', priority: 'High' }
    t2[写测试]
  Done[已完成]
    t3[发布]
`

function projectionOf(source: string) {
  const parsed = kanbanParser.parse(source)
  if (!parsed.ok) throw new Error(parsed.error.message)
  return buildKanbanProjection(parsed.doc)
}

describe('buildKanbanProjection', () => {
  it('列按文档序，卡片归并到其上方最近的列', () => {
    const p = projectionOf(SOURCE)
    expect(p.columns.map((c) => c.id)).toEqual(['Todo', 'Done'])
    expect(p.columns.map((c) => c.title)).toEqual(['待办', '已完成'])
    expect(p.columns[0].cards.map((c) => c.id)).toEqual(['t1', 't2'])
    expect(p.columns[1].cards.map((c) => c.id)).toEqual(['t3'])
    // 全量卡片按文档序（跨列）
    expect(p.cards.map((c) => c.id)).toEqual(['t1', 't2', 't3'])
  })

  it('卡片携带归属列 elementId 与元数据三字段', () => {
    const p = projectionOf(SOURCE)
    const t1 = p.cards.find((c) => c.id === 't1')!
    expect(t1).toMatchObject({
      elementId: 'kanban-card:t1',
      columnElementId: 'kanban-column:Todo',
      description: '写代码',
      assigned: '张三',
      ticket: 'VMMD-1',
      priority: 'High',
    })
    const t2 = p.cards.find((c) => c.id === 't2')!
    expect(t2).toMatchObject({ assigned: null, ticket: null, priority: null })
  })

  it('空看板（只有表头）投影为空', () => {
    const p = projectionOf('kanban\n')
    expect(p.columns).toEqual([])
    expect(p.cards).toEqual([])
  })
})

describe('resolveKanbanSelection', () => {
  const p = projectionOf(SOURCE)

  it('存在的列 / 卡片原样返回，图表级原样返回', () => {
    const column: Selection = { kind: 'kanban-column', elementId: 'kanban-column:Todo' }
    const card: Selection = { kind: 'kanban-card', elementId: 'kanban-card:t1' }
    expect(resolveKanbanSelection(p, column)).toEqual(column)
    expect(resolveKanbanSelection(p, card)).toEqual(card)
    expect(resolveKanbanSelection(p, { kind: 'diagram' })).toEqual({ kind: 'diagram' })
  })

  it('不存在的选中 / null / 别种选中 → null', () => {
    expect(resolveKanbanSelection(p, null)).toBeNull()
    expect(resolveKanbanSelection(p, { kind: 'kanban-column', elementId: 'kanban-column:__无__' })).toBeNull()
    expect(resolveKanbanSelection(p, { kind: 'kanban-card', elementId: 'kanban-card:__无__' })).toBeNull()
    expect(resolveKanbanSelection(p, { kind: 'node', nodeId: 'A' })).toBeNull()
  })
})
