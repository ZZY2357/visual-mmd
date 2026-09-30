import { describe, expect, it } from 'vitest'
import { timelineParser } from '../../pipeline/timeline'
import { buildTimelineProjection, resolveTimelineSelection } from '../timeline-projection'
import { TIMELINE_TEMPLATE } from '../../diagram-registry'
import { DIAGRAM_SELECTION } from '../selection'

/**
 * timeline 投影测试（more-diagrams 工单 05）：时期归属、事件归属（两种写法同形）、
 * section 分组与 rootPeriods、预测序号（键盘加元素的选中），以及选中回落。
 */

function build(source: string) {
  const parsed = timelineParser.parse(source)
  if (!parsed.ok) throw new Error(parsed.error.message)
  return buildTimelineProjection(parsed.doc)
}

const SIMPLE = `timeline
    title 项目里程碑
    section 第一阶段
        需求 : 调研 : 评审
        设计
            : 原型
    section 第二阶段
        开发 : 编码 : 联调
`

describe('buildTimelineProjection', () => {
  it('title / direction / sections / periods / events 结构与文档序', () => {
    const p = build(SIMPLE)
    expect(p.title).toBe('项目里程碑')
    expect(p.direction).toBeNull()
    expect(p.sections.map((s) => ({ id: s.elementId, name: s.name }))).toEqual([
      { id: 'section:1', name: '第一阶段' },
      { id: 'section:2', name: '第二阶段' },
    ])
    expect(p.periods.map((x) => x.elementId)).toEqual(['period:1', 'period:2', 'period:3'])
    expect(p.periods.map((x) => x.text)).toEqual(['需求', '设计', '开发'])
    expect(p.events.map((e) => ({ id: e.elementId, text: e.text, form: e.form }))).toEqual([
      { id: 'event:1', text: '调研', form: 'inline' },
      { id: 'event:2', text: '评审', form: 'inline' },
      { id: 'event:3', text: '原型', form: 'continuation' },
      { id: 'event:4', text: '编码', form: 'inline' },
      { id: 'event:5', text: '联调', form: 'inline' },
    ])
  })

  it('时期归属 section；事件归属时期（两种写法同形）；tailElementId 指向上一个元素', () => {
    const p = build(SIMPLE)
    expect(p.sections[0].periods.map((x) => x.elementId)).toEqual(['period:1', 'period:2'])
    expect(p.sections[1].periods.map((x) => x.elementId)).toEqual(['period:3'])
    const [p1, p2, p3] = p.periods
    expect(p1.sectionName).toBe('第一阶段')
    expect(p3.sectionName).toBe('第二阶段')
    expect(p1.events.map((e) => e.elementId)).toEqual(['event:1', 'event:2'])
    expect(p2.events.map((e) => e.elementId)).toEqual(['event:3'])
    expect(p3.events.map((e) => e.elementId)).toEqual(['event:4', 'event:5'])
    expect(p1.tailElementId).toBe('event:2')
    expect(p2.tailElementId).toBe('event:3')
  })

  it('预测序号：nextEventOrdinal = 该时期之前(含)事件总数 + 1；nextPeriodOrdinal = 时期序号 + 1', () => {
    const p = build(SIMPLE)
    expect(p.periods.map((x) => x.nextEventOrdinal)).toEqual([3, 4, 6])
    expect(p.periods.map((x) => x.nextPeriodOrdinal)).toEqual([2, 3, 4])
    expect(p.nextPeriodOrdinal).toBe(4)
  })

  it('首个 section 之前的时期进 rootPeriods，sectionElementId 为 null', () => {
    const p = build('timeline\n    P0 : e0\n    section S\n        A : a1\n')
    expect(p.rootPeriods.map((x) => x.elementId)).toEqual(['period:1'])
    expect(p.rootPeriods[0].sectionElementId).toBeNull()
    expect(p.rootPeriods[0].sectionName).toBeNull()
    expect(p.periods.map((x) => x.elementId)).toEqual(['period:1', 'period:2'])
    expect(p.sections[0].periods.map((x) => x.elementId)).toEqual(['period:2'])
  })

  it('无事件的时期：events 空、tailElementId 指向时期自身', () => {
    const p = build('timeline\n    Day 1\n    Day 2 : A\n')
    expect(p.periods[0].events).toEqual([])
    expect(p.periods[0].tailElementId).toBe('period:1')
    expect(p.periods[0].nextEventOrdinal).toBe(1)
  })

  it('方向 token 解析进 direction', () => {
    expect(build('timeline TD\n    A\n').direction).toBe('TD')
    expect(build('timeline LR\n    A\n').direction).toBe('LR')
    expect(build('timeline\n    A\n').direction).toBeNull()
  })

  it('起步模板投影：一个 section、两个时期、两个事件（两种写法）', () => {
    const p = build(TIMELINE_TEMPLATE)
    expect(p.title).toBe('产品演进路线')
    expect(p.sections).toHaveLength(1)
    expect(p.periods).toHaveLength(2)
    expect(p.events.map((e) => e.form)).toEqual(['inline', 'continuation'])
  })
})

describe('resolveTimelineSelection', () => {
  it('图表级 / 存在的元素原样返回，不存在的回落 null，别种选中/null → null', () => {
    const p = build(SIMPLE)
    expect(resolveTimelineSelection(p, DIAGRAM_SELECTION)).toEqual(DIAGRAM_SELECTION)
    expect(resolveTimelineSelection(p, { kind: 'timeline-section', elementId: 'section:1' })).not.toBeNull()
    expect(resolveTimelineSelection(p, { kind: 'timeline-period', elementId: 'period:2' })).not.toBeNull()
    expect(resolveTimelineSelection(p, { kind: 'timeline-event', elementId: 'event:5' })).not.toBeNull()
    expect(resolveTimelineSelection(p, { kind: 'timeline-period', elementId: 'period:99' })).toBeNull()
    expect(resolveTimelineSelection(p, { kind: 'timeline-event', elementId: 'event:99' })).toBeNull()
    expect(resolveTimelineSelection(p, { kind: 'timeline-section', elementId: 'section:99' })).toBeNull()
    expect(resolveTimelineSelection(p, { kind: 'er-entity', name: 'CAR' })).toBeNull()
    expect(resolveTimelineSelection(p, null)).toBeNull()
  })
})
