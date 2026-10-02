import { describe, expect, it } from 'vitest'
import { ganttParser } from '../../pipeline/gantt'
import { buildGanttProjection } from '../../projection/gantt-projection'
import { DIAGRAM_TYPES } from '../../diagram-registry'
import { ganttDeleteIntent, ganttKeyPlan } from '../../pipeline/gantt-keyboard'
import { contextMenuItems, contextMenuTargetFromSelection } from '../context-menu'

/**
 * gantt 键位 / 删除意图 / 菜单测试（more-diagrams 工单 11，ADR-0013）：
 * 选中任务上 Tab = 同 section 加任务、Enter = 加 section、Delete = 删除。
 * gantt 画布只有任务条可寻址（见 gantt-adapter），section 与指令行不可寻址——
 * 键操作主要从结构树选中生效。
 */

const SOURCE = `gantt
    dateFormat YYYY-MM-DD
    section 调研
        需求梳理 :done, a1, 2026-01-05, 3d
        方案设计 :2026-01-08, 5d
    section 开发
        编码实现 :after a1, 4d
`

function projectionOf(source: string) {
  const parsed = ganttParser.parse(source)
  if (!parsed.ok) throw new Error('解析失败')
  return buildGanttProjection(parsed.doc)
}

describe('ganttKeyPlan（ADR-0013 就近映射）', () => {
  const projection = projectionOf(SOURCE)

  it('Tab = 同 section 加任务：锚点 = 选中任务，元数据缺省（管线补 1d），不做内联编辑', () => {
    const plan = ganttKeyPlan(projection, { key: 'Tab', selection: { kind: 'gantt-task', elementId: 'task:1' } })
    expect(plan).not.toBeNull()
    expect(plan!.intents).toEqual([
      {
        type: 'add-task',
        name: '新任务',
        sectionElementId: 'section:1',
        afterElementId: 'task:1',
      },
    ])
    expect(plan!.newElementTarget).toEqual({ selection: { kind: 'gantt-task', elementId: 'task:2' } })
    expect(plan!.newElementTarget!.inlineEdit).toBeUndefined()
  })

  it('Tab 占位名避重：已有「新任务」时落「新任务2」', () => {
    const p = projectionOf('gantt\n    新任务 :2026-01-01, 3d\nsection S\n    任务 :2026-01-02, 3d\n')
    const plan = ganttKeyPlan(p, { key: 'Tab', selection: { kind: 'gantt-task', elementId: 'task:1' } })
    expect(plan!.intents[0]).toMatchObject({ name: '新任务2' })
  })

  it('Enter = 加 section：落在所属 section 末尾之后，预测序号 = 该 section 之后一位', () => {
    const plan = ganttKeyPlan(projection, { key: 'Enter', selection: { kind: 'gantt-task', elementId: 'task:1' } })
    expect(plan!.intents).toEqual([{ type: 'add-section', name: '新分组', afterElementId: 'task:2' }])
    expect(plan!.newElementTarget).toEqual({ selection: { kind: 'gantt-section', elementId: 'section:2' } })
  })

  it('Enter on 空分组任务（无 section）：锚点 = 任务自身，序号 = 分组总数 + 1', () => {
    const p = projectionOf('gantt\n    先行任务 :2026-01-01, 3d\nsection S\n    归组任务 :2026-01-02, 3d\n')
    const plan = ganttKeyPlan(p, { key: 'Enter', selection: { kind: 'gantt-task', elementId: 'task:1' } })
    expect(plan!.intents).toEqual([{ type: 'add-section', name: '新分组', afterElementId: 'task:1' }])
    expect(plan!.newElementTarget).toEqual({ selection: { kind: 'gantt-section', elementId: 'section:2' } })
  })

  it('Delete = 删除选中元素（唯一映射），落码后清空选中', () => {
    expect(ganttKeyPlan(projection, { key: 'Delete', selection: { kind: 'gantt-task', elementId: 'task:2' } })).toEqual({
      intents: [{ type: 'delete-task', elementId: 'task:2' }],
      clearSelection: true,
    })
    expect(ganttKeyPlan(projection, { key: 'Backspace', selection: { kind: 'gantt-section', elementId: 'section:1' } })).toEqual({
      intents: [{ type: 'delete-section', elementId: 'section:1' }],
      clearSelection: true,
    })
  })

  it('section / 指令行选中上无 Tab/Enter 语义；Shift / 无选中 / 已删元素 → null（不 preventDefault）', () => {
    expect(ganttKeyPlan(projection, { key: 'Tab', selection: { kind: 'gantt-section', elementId: 'section:1' } })).toBeNull()
    expect(ganttKeyPlan(projection, { key: 'Enter', selection: { kind: 'gantt-directive', elementId: 'directive:1' } })).toBeNull()
    expect(ganttKeyPlan(projection, { key: 'Tab', mods: { shift: true }, selection: { kind: 'gantt-task', elementId: 'task:1' } })).toBeNull()
    expect(ganttKeyPlan(projection, { key: 'Tab', selection: null })).toBeNull()
    expect(ganttKeyPlan(projection, { key: 'Tab', selection: { kind: 'gantt-task', elementId: 'task:999' } })).toBeNull()
  })
})

describe('ganttDeleteIntent', () => {
  const projection = projectionOf(SOURCE)

  it('任务与 section（级联由管线负责）各映射到 delete-* 意图；已不在投影 / 指令行 / null → null', () => {
    expect(ganttDeleteIntent(projection, { kind: 'gantt-task', elementId: 'task:1' })).toEqual({
      type: 'delete-task',
      elementId: 'task:1',
    })
    expect(ganttDeleteIntent(projection, { kind: 'gantt-section', elementId: 'section:2' })).toEqual({
      type: 'delete-section',
      elementId: 'section:2',
    })
    expect(ganttDeleteIntent(projection, { kind: 'gantt-task', elementId: 'task:999' })).toBeNull()
    expect(ganttDeleteIntent(projection, { kind: 'gantt-directive', elementId: 'directive:1' })).toBeNull()
    expect(ganttDeleteIntent(projection, { kind: 'diagram' })).toBeNull()
    expect(ganttDeleteIntent(projection, null)).toBeNull()
  })
})

describe('gantt 菜单与能力包（工单 11 定案：只有空白添加入口）', () => {
  it('空白 = 加任务 / 加分组；任务条虽可寻址但元素级菜单目标不做（与 journey/pie 同口径）', () => {
    expect(contextMenuItems({ kind: 'blank', diagramType: 'gantt' })).toEqual([
      'add-gantt-task',
      'add-gantt-section',
    ])
    expect(contextMenuTargetFromSelection({ kind: 'node', id: 'task:1' }, 'gantt')).toBeNull()
  })

  it('能力包查表：gantt 键盘投影 kind 同名、无 edgeAnnotator（无连线语法）、任务条 data-id 可反解', () => {
    const projection = projectionOf(SOURCE)
    const caps = DIAGRAM_TYPES.gantt.canvas
    const wrapper = { type: 'gantt' as const, gantt: projection }
    expect(caps.keyboardProjection(wrapper).kind).toBe('gantt')
    expect(caps.edgeAnnotator).toBeUndefined()
    // 画布寻址往返：渲染 id（task1）→ 位置序 elementId；canvasIdOf 反向映射回渲染 id
    const resolver = caps.dataIdResolver(wrapper)
    expect(resolver('task1')).toEqual({ kind: 'node', id: 'task:2' })
    expect(resolver('a1')).toEqual({ kind: 'node', id: 'task:1' })
    expect(resolver('__无__')).toBeNull()
    expect(caps.toSelection({ kind: 'node', id: 'task:2' })).toEqual({ kind: 'gantt-task', elementId: 'task:2' })
    expect(caps.canvasIdOf(wrapper, { kind: 'gantt-task', elementId: 'task:2' })).toBe('task1')
    expect(caps.canvasIdOf(wrapper, { kind: 'gantt-section', elementId: 'section:1' })).toBeNull()
  })
})
