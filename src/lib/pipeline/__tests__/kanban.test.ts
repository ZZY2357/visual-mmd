import { describe, expect, it } from 'vitest'
import { reassemble, type SourceDocument } from '../document'
import {
  kanbanParser,
  isValidKanbanId,
  isValidKanbanText,
  isValidKanbanMetaValue,
  KANBAN_PRIORITIES,
  isKanbanPriority,
  parseKanbanMeta,
  renderKanbanMeta,
  type KanbanNodeData,
} from '../kanban'
import { KANBAN_TEMPLATE } from '../../diagram-registry'

/**
 * kanban 解析器测试（more-diagrams 工单 06）：
 * verbatim identity（ADR-0004/0008）、缩进即语法（列 / 卡片归属）、元数据手术式改写、意图落码。
 */

function parseOk(source: string): SourceDocument {
  const result = kanbanParser.parse(source)
  if (!result.ok) throw new Error(`解析失败（${result.error.line}）：${result.error.message}`)
  return result.doc
}

const SIMPLE = `kanban
  Todo[待办]
    t1[写代码]@{ assigned: '张三', ticket: 'VMMD-1', priority: 'High' }
    t2[写测试]
  Done[已完成]
    t3[发布]
`

describe('kanban 解析器：verbatim identity（ADR-0004）', () => {
  it('解析后不做修改再重组装，输出与输入逐字相同', () => {
    expect(reassemble(parseOk(SIMPLE), new Map())).toBe(SIMPLE)
  })

  it('起步模板同样逐字还原', () => {
    expect(reassemble(parseOk(KANBAN_TEMPLATE), new Map())).toBe(KANBAN_TEMPLATE)
  })

  it('frontmatter / 注释 / 无法识别的行逐字保留（清单外语法不报错，ADR-0008）', () => {
    const source = `---
title: x
---
kanban
  %% 注释
  Todo[待办]
    t1[卡] ^^^ 生僻语法
`
    expect(reassemble(parseOk(source), new Map())).toBe(source)
  })

  it('缺少 kanban 声明报错（解析失败带行号）', () => {
    const result = kanbanParser.parse('flowchart TD\n  A\n')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toContain('kanban')
  })
})

describe('kanban 解析器：缩进即语法（列 / 卡片归属）', () => {
  it('首个节点的缩进宽度即列层级，更深的节点是卡片', () => {
    const doc = parseOk(SIMPLE)
    const columns = doc.elements.filter((p) => p.element.kind === 'kanban-column')
    const cards = doc.elements.filter((p) => p.element.kind === 'kanban-card')
    expect(columns.map((p) => p.id)).toEqual(['kanban-column:Todo', 'kanban-column:Done'])
    expect(cards.map((p) => p.id)).toEqual(['kanban-card:t1', 'kanban-card:t2', 'kanban-card:t3'])
    expect(columns.map((p) => (p.element as KanbanNodeData).text)).toEqual(['待办', '已完成'])
    expect(cards.map((p) => (p.element as KanbanNodeData).text)).toEqual(['写代码', '写测试', '发布'])
  })

  it('节点比列层级更浅 → 解析失败（mermaid 的 Items without section）', () => {
    const result = kanbanParser.parse('kanban\n    a[x]\n  b[y]\n')
    expect(result.ok).toBe(false)
  })

  it('无缩进的首节点即列（层级 0），卡片须缩进更深', () => {
    const doc = parseOk('kanban\nTodo[待办]\n  t1[卡]\n')
    const columns = doc.elements.filter((p) => p.element.kind === 'kanban-column')
    const cards = doc.elements.filter((p) => p.element.kind === 'kanban-card')
    expect(columns.map((p) => p.id)).toEqual(['kanban-column:Todo'])
    expect(cards.map((p) => p.id)).toEqual(['kanban-card:t1'])
  })
})

describe('kanban 元数据（@{}）', () => {
  it('parseKanbanMeta 解析三字段，忽略未托管键', () => {
    expect(parseKanbanMeta(null)).toEqual({ assigned: null, ticket: null, priority: null })
    expect(parseKanbanMeta("@{ assigned: '张三', ticket: 'VMMD-1', priority: 'High' }")).toEqual({
      assigned: '张三',
      ticket: 'VMMD-1',
      priority: 'High',
    })
    // 引号内逗号不算分隔符；未托管键（icon）忽略
    expect(parseKanbanMeta("@{ assigned: '甲, 乙', icon: 'fa fa-x', priority: 'Low' }")).toEqual({
      assigned: '甲, 乙',
      ticket: null,
      priority: 'Low',
    })
  })

  it('renderKanbanMeta：只增删改三字段，未托管键逐字保留；空则无元数据段', () => {
    expect(renderKanbanMeta(null, { assigned: '甲', ticket: null, priority: 'High' })).toBe(
      "@{ assigned: '甲', priority: 'High' }",
    )
    expect(renderKanbanMeta("@{ icon: 'fa fa-x' }", { assigned: '甲', ticket: null, priority: null })).toBe(
      "@{ icon: 'fa fa-x', assigned: '甲' }",
    )
    expect(renderKanbanMeta("@{ assigned: '旧', ticket: 'T' }", { assigned: null, ticket: null, priority: null })).toBe('')
  })

  it('priority 枚举与判定', () => {
    expect(KANBAN_PRIORITIES).toEqual(['Very High', 'High', 'Low', 'Very Low'])
    expect(isKanbanPriority('High')).toBe(true)
    expect(isKanbanPriority('Urgent')).toBe(false)
  })

  it('词法约束：`] @{` 之间的空白不被接受（整行原样保留，与 mermaid 词法一致）', () => {
    const source = `kanban
  Todo[待办]
    t1[卡] @{ assigned: 'x' }
`
    const doc = parseOk(source)
    // 该行无法识别为卡片（保持可编辑性：只认紧跟 `]` 的 `@{`）
    expect(doc.elements.filter((p) => p.element.kind === 'kanban-card')).toHaveLength(0)
    expect(reassemble(doc, new Map())).toBe(source)
  })
})

describe('kanban 解析器：意图落码', () => {
  it('add-column：末尾追加整行（缩进取现有列）', () => {
    const doc = parseOk(SIMPLE)
    const rewrites = kanbanParser.resolveRewrites(doc, { type: 'add-column', id: 'New', title: '新列' })
    expect(rewrites).not.toBeNull()
    const next = reassemble(doc, rewrites!)
    expect(next).toContain('  New[新列]')
    expect(reassemble(parseOk(next), new Map())).toBe(next)
  })

  it('set-column-title：原地改方括号内文本', () => {
    const doc = parseOk(SIMPLE)
    const rewrites = kanbanParser.resolveRewrites(doc, {
      type: 'set-column-title',
      elementId: 'kanban-column:Todo',
      title: '待处理',
    })
    expect(reassemble(doc, rewrites!)).toContain('Todo[待处理]')
  })

  it('delete-column：连同其卡片一起移除（不动其它列）', () => {
    const doc = parseOk(SIMPLE)
    const rewrites = kanbanParser.resolveRewrites(doc, { type: 'delete-column', elementId: 'kanban-column:Todo' })
    const next = reassemble(doc, rewrites!)
    expect(next).not.toContain('Todo')
    expect(next).not.toContain('t1')
    expect(next).not.toContain('t2')
    expect(next).toContain('Done')
    expect(reassemble(parseOk(next), new Map())).toBe(next)
  })

  it('add-card：落在该列最后一张卡片之后（缩进跟随），选中锚点为所属列', () => {
    const doc = parseOk(SIMPLE)
    const rewrites = kanbanParser.resolveRewrites(doc, {
      type: 'add-card',
      columnElementId: 'kanban-column:Todo',
      id: 't9',
      description: '新卡片',
    })
    const next = reassemble(doc, rewrites!)
    expect(next).toContain('t9[新卡片]')
    // 插在 Todo 的最后一张卡片之后、Done 之前
    expect(next.indexOf('t9')).toBeGreaterThan(next.indexOf('t2'))
    expect(next.indexOf('t9')).toBeLessThan(next.indexOf('Done'))
    expect(reassemble(parseOk(next), new Map())).toBe(next)
  })

  it('set-description：原地改卡片描述', () => {
    const doc = parseOk(SIMPLE)
    const rewrites = kanbanParser.resolveRewrites(doc, {
      type: 'set-description',
      elementId: 'kanban-card:t1',
      description: '改后的描述',
    })
    expect(reassemble(doc, rewrites!)).toContain('t1[改后的描述]')
  })

  it('set-metadata：只改三字段，未托管键保留；null 表示移除整段', () => {
    const doc = parseOk(SIMPLE)
    const r1 = kanbanParser.resolveRewrites(doc, {
      type: 'set-metadata',
      elementId: 'kanban-card:t1',
      metadata: { assigned: '李四', ticket: null, priority: 'Low' },
    })
    const next1 = reassemble(doc, r1!)
    expect(next1).toContain("t1[写代码]@{ assigned: '李四', priority: 'Low' }")

    const r2 = kanbanParser.resolveRewrites(doc, {
      type: 'set-metadata',
      elementId: 'kanban-card:t1',
      metadata: null,
    })
    expect(reassemble(doc, r2!)).toContain('t1[写代码]\n')
  })

  it('delete-card：只移除该行', () => {
    const doc = parseOk(SIMPLE)
    const rewrites = kanbanParser.resolveRewrites(doc, { type: 'delete-card', elementId: 'kanban-card:t3' })
    const next = reassemble(doc, rewrites!)
    expect(next).not.toContain('t3')
    expect(next).toContain('Done')
    expect(reassemble(parseOk(next), new Map())).toBe(next)
  })

  it('非法取值返回 null（不落码）', () => {
    const doc = parseOk(SIMPLE)
    expect(kanbanParser.resolveRewrites(doc, { type: 'add-column', id: 'a b', title: 'x' })).toBeNull()
    expect(kanbanParser.resolveRewrites(doc, { type: 'add-column', id: 'ok', title: 'a]b' })).toBeNull()
    expect(
      kanbanParser.resolveRewrites(doc, {
        type: 'add-card',
        columnElementId: 'kanban-column:Todo',
        id: 'ok',
        description: 'a(b',
      }),
    ).toBeNull()
    expect(
      kanbanParser.resolveRewrites(doc, {
        type: 'set-metadata',
        elementId: 'kanban-card:t1',
        metadata: { assigned: null, ticket: null, priority: 'Urgent' },
      }),
    ).toBeNull()
    expect(
      kanbanParser.resolveRewrites(doc, {
        type: 'set-metadata',
        elementId: 'kanban-card:t1',
        metadata: { assigned: "a'b", ticket: null, priority: null },
      }),
    ).toBeNull()
    // 已不存在的 elementId
    expect(kanbanParser.resolveRewrites(doc, { type: 'delete-card', elementId: 'kanban-card:__无__' })).toBeNull()
  })
})

describe('kanban 词法助手', () => {
  it('isValidKanbanId：拒绝空白与 [ ] ( ) { } @', () => {
    expect(isValidKanbanId('Todo')).toBe(true)
    expect(isValidKanbanId('')).toBe(false)
    expect(isValidKanbanId('a b')).toBe(false)
    expect(isValidKanbanId('a[')).toBe(false)
    expect(isValidKanbanId('a@')).toBe(false)
  })

  it('isValidKanbanText：拒绝空白串与 ] ( ) } 与换行', () => {
    expect(isValidKanbanText('标题')).toBe(true)
    expect(isValidKanbanText('  ')).toBe(false)
    expect(isValidKanbanText('a]b')).toBe(false)
    expect(isValidKanbanText('a(b')).toBe(false)
    expect(isValidKanbanText('a\nb')).toBe(false)
  })

  it('isValidKanbanMetaValue：拒绝单引号与换行', () => {
    expect(isValidKanbanMetaValue('张三')).toBe(true)
    expect(isValidKanbanMetaValue("a'b")).toBe(false)
    expect(isValidKanbanMetaValue('a\nb')).toBe(false)
  })
})
