import { describe, expect, it } from 'vitest'
import { timelineParser } from '../../pipeline/timeline'
import { buildTimelineProjection } from '../../projection/timeline-projection'
import { DIAGRAM_TYPES } from '../../diagram-registry'
import { timelineDeleteIntent, timelineKeyPlan } from '../canvas-keyboard'
import { contextMenuItems } from '../context-menu'
import { timelineCanvasCapabilities } from '../../canvas-selection/timeline-adapter'

/**
 * timeline 键位 / 删除意图 / 菜单 / 画布降级测试（more-diagrams 工单 05，ADR-0013）：
 * 时期上 Tab = 加事件、Enter = 加下一时期、Delete = 删除；画布无 data-id 寻址（如实降级）。
 */

const SOURCE = `timeline
    title 项目
    section 第一阶段
        需求 : 调研 : 评审
        设计
            : 原型
    section 第二阶段
        开发
`

function projectionOf(source: string) {
  const parsed = timelineParser.parse(source)
  if (!parsed.ok) throw new Error('解析失败')
  return buildTimelineProjection(parsed.doc)
}

describe('timelineKeyPlan（ADR-0013 就近映射）', () => {
  const projection = projectionOf(SOURCE)

  it('Tab = 给该时期加事件：落码 add-event + 选中新事件（事件序号预测），不做内联编辑', () => {
    const plan = timelineKeyPlan(projection, { key: 'Tab', selection: { kind: 'timeline-period', elementId: 'period:1' } })
    expect(plan).not.toBeNull()
    expect(plan!.intents).toEqual([{ type: 'add-event', periodElementId: 'period:1', text: '新事件' }])
    // period:1 已含 2 个事件 → 新事件 event:3
    expect(plan!.newElementTarget).toEqual({ selection: { kind: 'timeline-event', elementId: 'event:3' } })
    // 事件不做内联编辑
    expect(plan!.newElementTarget?.inlineEdit).toBeUndefined()
  })

  it('Enter = 加下一个时期：落在该时期块之后 + 选中新时期（序号预测）', () => {
    const plan = timelineKeyPlan(projection, { key: 'Enter', selection: { kind: 'timeline-period', elementId: 'period:1' } })
    expect(plan!.intents).toEqual([{ type: 'add-period', text: '新阶段', afterElementId: 'event:2' }])
    expect(plan!.newElementTarget).toEqual({ selection: { kind: 'timeline-period', elementId: 'period:2' } })
  })

  it('Delete = 删除选中时期 / 事件（唯一映射，清空选中）；section 无删除意图', () => {
    expect(timelineKeyPlan(projection, { key: 'Delete', selection: { kind: 'timeline-period', elementId: 'period:2' } })).toEqual({
      intents: [{ type: 'delete-period', elementId: 'period:2' }],
      clearSelection: true,
    })
    expect(timelineKeyPlan(projection, { key: 'Delete', selection: { kind: 'timeline-event', elementId: 'event:1' } })).toEqual({
      intents: [{ type: 'delete-event', elementId: 'event:1' }],
      clearSelection: true,
    })
    expect(timelineKeyPlan(projection, { key: 'Delete', selection: { kind: 'timeline-section', elementId: 'section:1' } })).toBeNull()
  })

  it('无选中 / 别种选中 / Shift 修饰 / 非编辑键 → null（不 preventDefault）', () => {
    expect(timelineKeyPlan(projection, { key: 'Tab', selection: null })).toBeNull()
    expect(timelineKeyPlan(projection, { key: 'Tab', selection: { kind: 'timeline-event', elementId: 'event:1' } })).toBeNull()
    expect(timelineKeyPlan(projection, { key: 'Tab', mods: { shift: true }, selection: { kind: 'timeline-period', elementId: 'period:1' } })).toBeNull()
    expect(timelineKeyPlan(projection, { key: 'a', selection: { kind: 'timeline-period', elementId: 'period:1' } })).toBeNull()
  })
})

describe('timelineDeleteIntent', () => {
  const projection = projectionOf(SOURCE)
  it('时期 / 事件各映射到 delete-* 意图；section 与已不存在的目标 → null', () => {
    expect(timelineDeleteIntent(projection, { kind: 'timeline-period', elementId: 'period:1' })).toEqual({
      type: 'delete-period',
      elementId: 'period:1',
    })
    expect(timelineDeleteIntent(projection, { kind: 'timeline-event', elementId: 'event:3' })).toEqual({
      type: 'delete-event',
      elementId: 'event:3',
    })
    expect(timelineDeleteIntent(projection, { kind: 'timeline-section', elementId: 'section:1' })).toBeNull()
    expect(timelineDeleteIntent(projection, { kind: 'timeline-period', elementId: 'period:99' })).toBeNull()
    expect(timelineDeleteIntent(projection, null)).toBeNull()
  })
})

describe('timeline 右键菜单项', () => {
  it('空白 / 时期 / 事件的菜单项（工单 05 清单）', () => {
    expect(contextMenuItems({ kind: 'blank', diagramType: 'timeline' })).toEqual(['add-period', 'add-section'])
    expect(contextMenuItems({ kind: 'timeline-period', elementId: 'period:1' })).toEqual([
      'edit-period-text',
      'add-event',
      'delete',
    ])
    expect(contextMenuItems({ kind: 'timeline-event', elementId: 'event:1' })).toEqual(['edit-event-text', 'delete'])
  })
})

describe('timeline 画布能力包：如实降级（ADR-0007：无 data-id 不伪造）', () => {
  const timeline = projectionOf(SOURCE)
  const projection = { type: 'timeline' as const, timeline }

  it('resolver 永不命中、toSelection / canvasIdOf 恒 null、navigationIds 空、无 edgeAnnotator', () => {
    const caps = timelineCanvasCapabilities
    expect(caps.dataIdResolver(projection)('period:1')).toBeNull()
    expect(caps.dataIdResolver(projection)('node_0')).toBeNull()
    expect(caps.toSelection({ kind: 'node', id: 'period:1' })).toBeNull()
    expect(caps.canvasIdOf({ kind: 'timeline-period', elementId: 'period:1' })).toBeNull()
    expect(caps.navigationIds(projection)).toEqual([])
    expect(caps.edgeAnnotator).toBeUndefined()
    expect(caps.keyboardProjection(projection).kind).toBe('timeline')
  })
})

describe('timeline 注册表挂载', () => {
  it('detect / template / 模板可解析为非空投影', () => {
    expect(DIAGRAM_TYPES.timeline.detect('timeline\n    A\n')).toBe(true)
    expect(DIAGRAM_TYPES.timeline.detect('timeline LR\n    A\n')).toBe(true)
    expect(DIAGRAM_TYPES.timeline.detect('flowchart TD\n')).toBe(false)
    const parsed = DIAGRAM_TYPES.timeline.parser.parse(DIAGRAM_TYPES.timeline.template)
    if (!parsed.ok) throw new Error('模板必须可解析')
    const projection = DIAGRAM_TYPES.timeline.buildProjection(parsed.doc)
    if (projection.type !== 'timeline') throw new Error('图种必须为 timeline')
    expect(projection.timeline.periods.length).toBeGreaterThan(0)
    expect(projection.timeline.events.length).toBeGreaterThan(0)
  })
})
