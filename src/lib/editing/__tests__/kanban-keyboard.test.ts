import { describe, expect, it } from 'vitest'
import { kanbanParser } from '../../pipeline/kanban'
import { buildKanbanProjection } from '../../projection/kanban-projection'
import { DIAGRAM_TYPES } from '../../diagram-registry'
import { kanbanDeleteIntent, kanbanKeyPlan } from '../../pipeline/kanban-keyboard'
import { contextMenuItems, contextMenuTargetFromSelection } from '../context-menu'
import { capabilitiesOf } from '../../canvas-selection/capabilities'
import { fromCanvasId, menuTargetOfCanvas } from '../../canvas-selection/selection-codec'

/**
 * kanban 键位 / 删除意图 / 菜单 / 画布寻址测试（more-diagrams 工单 06，ADR-0013）：
 * Tab = 同列加卡片（内联编辑描述）、Enter = 加下一列（内联编辑标题）、Delete = 删除。
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
  if (!parsed.ok) throw new Error('解析失败')
  return buildKanbanProjection(parsed.doc)
}

describe('kanbanKeyPlan（ADR-0013 就近映射）', () => {
  const projection = projectionOf(SOURCE)

  it('Tab（选中卡片）= 同列加卡片：落码 add-card + 选中新卡片并内联编辑描述', () => {
    const plan = kanbanKeyPlan(projection, { key: 'Tab', selection: { kind: 'kanban-card', elementId: 'kanban-card:t1' } })
    expect(plan).not.toBeNull()
    expect(plan!.intents).toEqual([{ type: 'add-card', columnElementId: 'kanban-column:Todo', id: 't', description: '新卡片' }])
    expect(plan!.newElementTarget).toEqual({
      selection: { kind: 'kanban-card', elementId: 'kanban-card:t' },
      inlineEdit: { kind: 'kanban-card', elementId: 'kanban-card:t' },
    })
  })

  it('Tab（选中列）= 该列加卡片', () => {
    const plan = kanbanKeyPlan(projection, { key: 'Tab', selection: { kind: 'kanban-column', elementId: 'kanban-column:Done' } })
    expect(plan!.intents).toEqual([{ type: 'add-card', columnElementId: 'kanban-column:Done', id: 't', description: '新卡片' }])
  })

  it('Enter = 加下一列：落码 add-column + 选中新列并内联编辑标题', () => {
    const plan = kanbanKeyPlan(projection, { key: 'Enter', selection: { kind: 'kanban-card', elementId: 'kanban-card:t1' } })
    expect(plan).toEqual({
      intents: [{ type: 'add-column', id: 'col', title: '新列' }],
      newElementTarget: {
        selection: { kind: 'kanban-column', elementId: 'kanban-column:col' },
        inlineEdit: { kind: 'kanban-column', elementId: 'kanban-column:col' },
      },
    })
  })

  it('Delete = 删除选中元素（唯一映射）', () => {
    expect(kanbanKeyPlan(projection, { key: 'Delete', selection: { kind: 'kanban-card', elementId: 'kanban-card:t1' } })).toEqual({
      intents: [{ type: 'delete-card', elementId: 'kanban-card:t1' }],
      clearSelection: true,
    })
    expect(kanbanKeyPlan(projection, { key: 'Backspace', selection: { kind: 'kanban-column', elementId: 'kanban-column:Todo' } })).toEqual({
      intents: [{ type: 'delete-column', elementId: 'kanban-column:Todo' }],
      clearSelection: true,
    })
  })

  it('无选中 / 别种选中 / Shift 修饰 / 方向键 → null（不 preventDefault）', () => {
    expect(kanbanKeyPlan(projection, { key: 'Tab', selection: null })).toBeNull()
    expect(kanbanKeyPlan(projection, { key: 'Tab', selection: { kind: 'node', nodeId: 'A' } })).toBeNull()
    expect(
      kanbanKeyPlan(projection, { key: 'Tab', mods: { shift: true }, selection: { kind: 'kanban-card', elementId: 'kanban-card:t1' } }),
    ).toBeNull()
    expect(kanbanKeyPlan(projection, { key: 'ArrowRight', selection: { kind: 'kanban-card', elementId: 'kanban-card:t1' } })).toBeNull()
  })
})

describe('kanbanDeleteIntent', () => {
  const projection = projectionOf(SOURCE)
  it('列 / 卡片各映射到 delete-* 意图；已不存在 / null / 别种 → null', () => {
    expect(kanbanDeleteIntent(projection, { kind: 'kanban-column', elementId: 'kanban-column:Todo' })).toEqual({
      type: 'delete-column',
      elementId: 'kanban-column:Todo',
    })
    expect(kanbanDeleteIntent(projection, { kind: 'kanban-card', elementId: 'kanban-card:t1' })).toEqual({
      type: 'delete-card',
      elementId: 'kanban-card:t1',
    })
    expect(kanbanDeleteIntent(projection, { kind: 'kanban-card', elementId: 'kanban-card:__无__' })).toBeNull()
    expect(kanbanDeleteIntent(projection, null)).toBeNull()
    expect(kanbanDeleteIntent(projection, { kind: 'node', nodeId: 'A' })).toBeNull()
  })
})

describe('kanban 右键菜单与画布寻址', () => {
  it('空白 / 列 / 卡片的菜单项', () => {
    expect(contextMenuItems({ kind: 'blank', diagramType: 'kanban' })).toEqual(['add-column'])
    expect(contextMenuItems({ kind: 'element', selection: { kind: 'kanban-column', elementId: 'kanban-column:Todo' } })).toEqual(['edit-text', 'add-card', 'delete'])
    expect(contextMenuItems({ kind: 'element', selection: { kind: 'kanban-card', elementId: 'kanban-card:t1' } })).toEqual([
      'edit-text',
      'edit-kanban-metadata',
      'delete',
    ])
  })

  it('画布选中 → 菜单目标（列 / 卡片按 elementId 前缀判种类）', () => {
    expect(contextMenuTargetFromSelection({ kind: 'node', id: 'kanban-column:Todo' }, 'kanban')).toEqual({
      kind: 'element',
      selection: { kind: 'kanban-column', elementId: 'kanban-column:Todo' },
    })
    expect(contextMenuTargetFromSelection({ kind: 'node', id: 'kanban-card:t1' }, 'kanban')).toEqual({
      kind: 'element',
      selection: { kind: 'kanban-card', elementId: 'kanban-card:t1' },
    })
    expect(contextMenuTargetFromSelection({ kind: 'node', id: '__未知__' }, 'kanban')).toBeNull()
  })

  it('选中 ↔ 画布 data-id 往返（列 / 卡片都是节点 data-id）', () => {
    expect(fromCanvasId('kanban', { kind: 'node', id: 'kanban-column:Todo' })).toEqual({
      kind: 'kanban-column',
      elementId: 'kanban-column:Todo',
    })
    expect(fromCanvasId('kanban', { kind: 'node', id: 'kanban-card:t1' })).toEqual({
      kind: 'kanban-card',
      elementId: 'kanban-card:t1',
    })
    expect(fromCanvasId('kanban', { kind: 'element', elementId: 'x' })).toBeNull()
    expect(menuTargetOfCanvas('kanban', { kind: 'node', id: 'kanban-card:t1' })).toEqual({
      kind: 'element',
      selection: { kind: 'kanban-card', elementId: 'kanban-card:t1' },
    })
  })
})

describe('kanban 画布能力包（ADR-0015）', () => {
  const projection = { type: 'kanban' as const, kanban: projectionOf(SOURCE) }
  const caps = capabilitiesOf(projection)

  it('导航顺序 = 每列其后跟它的卡片；无连线 → 不实现 edgeAnnotator', () => {
    expect(caps.navigationIds(projection)).toEqual(['Todo', 't1', 't2', 'Done', 't3'])
    expect(caps.edgeAnnotator).toBeUndefined()
  })

  it('data-id ↔ 选中 ↔ canvasIdOf 往返一致（首元素）', () => {
    const resolver = caps.dataIdResolver(projection)
    const canvas = resolver('Todo')
    expect(canvas).toEqual({ kind: 'node', id: 'kanban-column:Todo' })
    const selection = caps.toSelection(canvas!)
    expect(selection).toEqual({ kind: 'kanban-column', elementId: 'kanban-column:Todo' })
    expect(caps.canvasIdOf(projection, selection!)).toBe('Todo')
    expect(resolver('t1')).toEqual({ kind: 'node', id: 'kanban-card:t1' })
    expect(resolver('__无__')).toBeNull()
  })
})

describe('kanban 注册表挂载', () => {
  it('detect / template / 模板可解析为非空投影', () => {
    expect(DIAGRAM_TYPES.kanban.detect('kanban\n  Todo[x]\n')).toBe(true)
    expect(DIAGRAM_TYPES.kanban.detect('flowchart TD\n')).toBe(false)
    const parsed = DIAGRAM_TYPES.kanban.parser.parse(DIAGRAM_TYPES.kanban.template)
    if (!parsed.ok) throw new Error('模板必须可解析')
    const projection = DIAGRAM_TYPES.kanban.buildProjection(parsed.doc)
    if (projection.type !== 'kanban') throw new Error('图种必须为 kanban')
    expect(projection.kanban.columns.length).toBeGreaterThan(0)
    expect(projection.kanban.cards.length).toBeGreaterThan(0)
  })
})
