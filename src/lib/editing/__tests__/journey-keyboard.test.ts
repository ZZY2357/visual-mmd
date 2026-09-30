import { describe, expect, it } from 'vitest'
import { journeyParser } from '../../pipeline/journey'
import { buildJourneyProjection } from '../../projection/journey-projection'
import { DIAGRAM_TYPES } from '../../diagram-registry'
import { journeyDeleteIntent, journeyKeyPlan } from '../canvas-keyboard'
import { contextMenuItems, contextMenuTargetFromSelection } from '../context-menu'

/**
 * journey 键位 / 删除意图 / 菜单测试（more-diagrams 工单 08，ADR-0013）：
 * 选中任务上 Tab = 同 section 加任务、Enter = 加 section、Delete = 删除。
 * journey 画布无 data-id（实测降级，见 journey-adapter），键操作从结构树选中生效。
 */

const SOURCE = `journey
    title 用户旅程示例
    section 发现
        访问首页: 5: 用户
        浏览商品: 3
    section 决策
        对比价格: 2: 用户, 客服
`

function projectionOf(source: string) {
  const parsed = journeyParser.parse(source)
  if (!parsed.ok) throw new Error('解析失败')
  return buildJourneyProjection(parsed.doc)
}

describe('journeyKeyPlan（ADR-0013 就近映射）', () => {
  const projection = projectionOf(SOURCE)

  it('Tab = 同 section 加任务：锚点 = 选中任务，落码 + 选中（预测序号），不做内联编辑', () => {
    const plan = journeyKeyPlan(projection, { key: 'Tab', selection: { kind: 'journey-task', elementId: 'task:1' } })
    expect(plan).not.toBeNull()
    expect(plan!.intents).toEqual([
      {
        type: 'add-task',
        name: '新任务',
        score: 3,
        actors: [],
        sectionElementId: 'section:1',
        afterElementId: 'task:1',
      },
    ])
    expect(plan!.newElementTarget).toEqual({ selection: { kind: 'journey-task', elementId: 'task:2' } })
    expect(plan!.newElementTarget!.inlineEdit).toBeUndefined()
  })

  it('Tab 占位名避重：已有「新任务」时落「新任务2」', () => {
    const p = projectionOf('journey\n    新任务: 3\nsection S\n    任务: 2\n')
    const plan = journeyKeyPlan(p, { key: 'Tab', selection: { kind: 'journey-task', elementId: 'task:1' } })
    expect(plan!.intents[0]).toMatchObject({ name: '新任务2' })
  })

  it('Enter = 加 section：落在所属 section 末尾之后，预测序号 = 该 section 之后一位', () => {
    const plan = journeyKeyPlan(projection, { key: 'Enter', selection: { kind: 'journey-task', elementId: 'task:1' } })
    expect(plan!.intents).toEqual([{ type: 'add-section', name: '新分组', afterElementId: 'task:2' }])
    expect(plan!.newElementTarget).toEqual({ selection: { kind: 'journey-section', elementId: 'section:2' } })
  })

  it('Enter on 空分组任务（无 section）：锚点 = 任务自身，序号 = 分组总数 + 1', () => {
    const p = projectionOf('journey\n    先行任务: 4\nsection S\n    归组任务: 2\n')
    const plan = journeyKeyPlan(p, { key: 'Enter', selection: { kind: 'journey-task', elementId: 'task:1' } })
    expect(plan!.intents).toEqual([{ type: 'add-section', name: '新分组', afterElementId: 'task:1' }])
    expect(plan!.newElementTarget).toEqual({ selection: { kind: 'journey-section', elementId: 'section:2' } })
  })

  it('Delete = 删除选中元素（唯一映射），落码后清空选中', () => {
    expect(journeyKeyPlan(projection, { key: 'Delete', selection: { kind: 'journey-task', elementId: 'task:2' } })).toEqual({
      intents: [{ type: 'delete-task', elementId: 'task:2' }],
      clearSelection: true,
    })
    expect(journeyKeyPlan(projection, { key: 'Backspace', selection: { kind: 'journey-section', elementId: 'section:1' } })).toEqual({
      intents: [{ type: 'delete-section', elementId: 'section:1' }],
      clearSelection: true,
    })
  })

  it('section 选中上无 Tab/Enter 语义；Shift / 无选中 / 已删元素 → null（不 preventDefault）', () => {
    expect(journeyKeyPlan(projection, { key: 'Tab', selection: { kind: 'journey-section', elementId: 'section:1' } })).toBeNull()
    expect(journeyKeyPlan(projection, { key: 'Enter', selection: { kind: 'journey-section', elementId: 'section:1' } })).toBeNull()
    expect(journeyKeyPlan(projection, { key: 'Tab', mods: { shift: true }, selection: { kind: 'journey-task', elementId: 'task:1' } })).toBeNull()
    expect(journeyKeyPlan(projection, { key: 'Tab', selection: null })).toBeNull()
    expect(journeyKeyPlan(projection, { key: 'Tab', selection: { kind: 'journey-task', elementId: 'task:999' } })).toBeNull()
  })
})

describe('journeyDeleteIntent', () => {
  const projection = projectionOf(SOURCE)

  it('任务与 section（级联由管线负责）各映射到 delete-* 意图；已不在投影 / 图表级 / null → null', () => {
    expect(journeyDeleteIntent(projection, { kind: 'journey-task', elementId: 'task:1' })).toEqual({
      type: 'delete-task',
      elementId: 'task:1',
    })
    expect(journeyDeleteIntent(projection, { kind: 'journey-section', elementId: 'section:2' })).toEqual({
      type: 'delete-section',
      elementId: 'section:2',
    })
    expect(journeyDeleteIntent(projection, { kind: 'journey-task', elementId: 'task:999' })).toBeNull()
    expect(journeyDeleteIntent(projection, { kind: 'diagram' })).toBeNull()
    expect(journeyDeleteIntent(projection, null)).toBeNull()
  })
})

describe('journey 菜单（工单 08 定案：画布无 data-id，只有空白菜单）', () => {
  it('空白 = 加任务 / 加分组；元素级画布菜单目标不存在', () => {
    expect(contextMenuItems({ kind: 'blank', diagramType: 'journey' })).toEqual([
      'add-journey-task',
      'add-journey-section',
    ])
    // 画布节点目标被 codec 拒绝（实测降级）：menuTargetOfCanvas 不产出 journey 元素目标
    expect(contextMenuTargetFromSelection({ kind: 'node', id: '随便什么' }, 'journey')).toBeNull()
  })

  it('能力包查表：journey 键盘投影 kind 同名、无 edgeAnnotator（无连线语法）', () => {
    const projection = projectionOf(SOURCE)
    const caps = DIAGRAM_TYPES.journey.canvas
    expect(caps.keyboardProjection({ type: 'journey', journey: projection }).kind).toBe('journey')
    expect(caps.edgeAnnotator).toBeUndefined()
  })
})
