import { describe, expect, it } from 'vitest'
import { reassemble, type SourceDocument } from '../document'
import {
  timelineParser,
  timelineDirectionOf,
  isValidTimelineEventText,
  isValidTimelinePeriodText,
  isValidTimelineSectionName,
  isValidTimelineDirection,
  parseTimelineOrdinal,
  type TimelineEventData,
  type TimelinePeriodData,
} from '../timeline'
import { TIMELINE_TEMPLATE } from '../../diagram-registry'

/**
 * timeline 解析器测试（more-diagrams 工单 05）：
 * verbatim identity（ADR-0004/0008）、核心语法覆盖（时期 / 事件两种写法 / section / title /
 * direction）、意图落码，以及工单 05 的关键承诺——**单行冒号串联事件的冒号分段手术改写**
 * （其余冒号段逐字不动）与续行事件只动自己那一行。
 */

function parseOk(source: string): SourceDocument {
  const result = timelineParser.parse(source)
  if (!result.ok) throw new Error(`解析失败（${result.error.line}）：${result.error.message}`)
  return result.doc
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

function eventsOf(doc: SourceDocument): TimelineEventData[] {
  return doc.elements.filter((p) => p.element.kind === 'timeline-event').map((p) => p.element as TimelineEventData)
}
function periodsOf(doc: SourceDocument): TimelinePeriodData[] {
  return doc.elements.filter((p) => p.element.kind === 'timeline-period').map((p) => p.element as TimelinePeriodData)
}

describe('timeline 解析器：verbatim identity（ADR-0004）', () => {
  it('解析后不做修改再重组装，输出与输入逐字相同', () => {
    expect(reassemble(parseOk(SIMPLE), new Map())).toBe(SIMPLE)
  })

  it('起步模板同样逐字还原', () => {
    expect(reassemble(parseOk(TIMELINE_TEMPLATE), new Map())).toBe(TIMELINE_TEMPLATE)
  })

  it('清单外语法（注释 / accTitle / frontmatter / 生僻行）逐字保留', () => {
    const source = `---
title: x
---
timeline
    %% 注释
    accTitle: 无障碍标题
    Day 1 : A : B
    ??? 生僻语法 ???
`
    expect(reassemble(parseOk(source), new Map())).toBe(source)
  })

  it('方向 token LR / TD 与省略三种形态都逐字还原', () => {
    for (const head of ['timeline', 'timeline LR', 'timeline TD']) {
      const source = `${head}\n    A : a1\n`
      expect(reassemble(parseOk(source), new Map())).toBe(source)
    }
  })

  it('未以 timeline 声明开头 → 报错（不产出非法解析产物）', () => {
    const result = timelineParser.parse('flowchart TD\n    A --> B\n')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.line).toBe(1)
  })
})

describe('timeline 解析器：语法覆盖（分层对齐核心清单）', () => {
  it('时期 + 单行冒号串联事件：一行拆成不重叠的多段，分隔原文逐字保留', () => {
    const doc = parseOk('timeline\n    Day 1 : A : B\n')
    const periods = periodsOf(doc)
    expect(periods).toHaveLength(1)
    expect(periods[0]).toMatchObject({ text: 'Day 1', tail: '' })
    const events = eventsOf(doc)
    expect(events.map((e) => ({ text: e.text, form: e.form, sep: e.sep }))).toEqual([
      { text: 'A', form: 'inline', sep: ' : ' },
      { text: 'B', form: 'inline', sep: ' : ' },
    ])
    // 元素 span 连续覆盖整行、不重叠（跳过 timeline-header）
    const lineParts = doc.elements.filter((p) => p.id !== 'timeline-header')
    expect(lineParts[0].id).toBe('period:1')
    expect(lineParts[1].id).toBe('event:1')
    expect(lineParts[0].span.end).toBe(lineParts[1].span.start)
    expect(lineParts[1].span.end).toBe(lineParts[2].span.start)
  })

  it('续行事件 `: Event` 归入前一个时期（无时期时逐字保留）', () => {
    const doc = parseOk('timeline\n    Day 1\n        : A\n        : B\n')
    expect(periodsOf(doc)).toHaveLength(1)
    const events = eventsOf(doc)
    expect(events.map((e) => ({ text: e.text, form: e.form }))).toEqual([
      { text: 'A', form: 'continuation' },
      { text: 'B', form: 'continuation' },
    ])
    // 无时期时的续行不解析，逐字保留
    const orphan = 'timeline\n    : 无归属\n'
    expect(reassemble(parseOk(orphan), new Map())).toBe(orphan)
    expect(eventsOf(parseOk(orphan))).toHaveLength(0)
  })

  it('section 与 title 解析出来；section 名称不含 `:`', () => {
    const doc = parseOk(SIMPLE)
    const title = doc.elements.find((p) => p.element.kind === 'timeline-title')
    expect(title?.element).toMatchObject({ kind: 'timeline-title', text: '项目里程碑' })
    const sections = doc.elements.filter((p) => p.element.kind === 'timeline-section')
    expect(sections.map((p) => p.element)).toMatchObject([
      { kind: 'timeline-section', name: '第一阶段' },
      { kind: 'timeline-section', name: '第二阶段' },
    ])
    // 含 `:` 的 section 行不解析（逐字保留）
    const weird = 'timeline\n    section a:b\n'
    expect(reassemble(parseOk(weird), new Map())).toBe(weird)
  })

  it('行尾注释 `#`：时期/事件文本与之分离，注释逐字保留', () => {
    const source = 'timeline\n    Day 1 : A : B # 备注\n'
    const doc = parseOk(source)
    expect(periodsOf(doc)[0]).toMatchObject({ text: 'Day 1' })
    const events = eventsOf(doc)
    expect(events.map((e) => e.text)).toEqual(['A', 'B'])
    expect(events[1].tail).toBe(' # 备注')
    expect(reassemble(doc, new Map())).toBe(source)
  })

  it('事件文本可含「不跟空白的冒号」（如 12:30），不误判为分隔', () => {
    const doc = parseOk('timeline\n    Day 1 : 12:30 开会\n')
    expect(eventsOf(doc).map((e) => e.text)).toEqual(['12:30 开会'])
  })
})

describe('timeline 解析器：意图落码', () => {
  it('add-period 在文档末尾落一行时期', () => {
    const doc = parseOk(SIMPLE)
    const rewrites = timelineParser.resolveRewrites(doc, { type: 'add-period', text: '第三阶段' })
    const next = reassemble(doc, rewrites!)
    expect(next).toContain('第三阶段')
    expect(reassemble(parseOk(next), new Map())).toBe(next)
  })

  it('set-period-text 只重写时期段，其后单行事件段逐字不动', () => {
    const doc = parseOk('timeline\n    Day 1 : A : B\n')
    const rewrites = timelineParser.resolveRewrites(doc, { type: 'set-period-text', elementId: 'period:1', text: 'Day X' })
    expect(reassemble(doc, rewrites!)).toBe('timeline\n    Day X : A : B\n')
  })

  it('delete-period 连同行 inline 段与后续续行事件行一起清理，其余逐字保留', () => {
    const source = 'timeline\n    Day 1 : A : B\n        : C\n    Day 2 : D\n'
    const doc = parseOk(source)
    const rewrites = timelineParser.resolveRewrites(doc, { type: 'delete-period', elementId: 'period:1' })
    const next = reassemble(doc, rewrites!)
    expect(next).not.toContain('Day 1')
    expect(next).not.toContain('      : C')
    expect(next).toContain('Day 2 : D')
    expect(reassemble(parseOk(next), new Map())).toBe(next)
  })

  it('add-event 落到该时期最后一个事件行之后（续行 `: 文本`）', () => {
    const doc = parseOk(SIMPLE)
    const rewrites = timelineParser.resolveRewrites(doc, { type: 'add-event', periodElementId: 'period:1', text: '复盘' })
    const next = reassemble(doc, rewrites!)
    expect(next).toContain(': 复盘')
    // 新事件紧随 period:1（需求）的最后一个事件行之后、下一时期（设计）之前
    expect(next.indexOf(': 复盘')).toBeGreaterThan(next.indexOf('需求 : 调研 : 评审'))
    expect(next.indexOf(': 复盘')).toBeLessThan(next.indexOf('设计'))
    expect(reassemble(parseOk(next), new Map())).toBe(next)
  })

  it('set-event-text：单行冒号串联事件按段手术改写（其余冒号段逐字不动）', () => {
    const source = 'timeline\n    Day 1 : A : B : C\n'
    const doc = parseOk(source)
    // 改中间那一段（event:2 = B）
    const r1 = timelineParser.resolveRewrites(doc, { type: 'set-event-text', elementId: 'event:2', text: 'B2' })
    expect(reassemble(doc, r1!)).toBe('timeline\n    Day 1 : A : B2 : C\n')
    // 改第一段（event:1 = A）
    const r2 = timelineParser.resolveRewrites(doc, { type: 'set-event-text', elementId: 'event:1', text: 'A2' })
    expect(reassemble(doc, r2!)).toBe('timeline\n    Day 1 : A2 : B : C\n')
    // 改最后一段（event:3 = C）
    const r3 = timelineParser.resolveRewrites(doc, { type: 'set-event-text', elementId: 'event:3', text: 'C2' })
    expect(reassemble(doc, r3!)).toBe('timeline\n    Day 1 : A : B : C2\n')
  })

  it('delete-event：单行段只摘掉自己那一段，续行段只清空自己那一行', () => {
    const inline = parseOk('timeline\n    Day 1 : A : B : C\n')
    const r1 = timelineParser.resolveRewrites(inline, { type: 'delete-event', elementId: 'event:2' })
    expect(reassemble(inline, r1!)).toBe('timeline\n    Day 1 : A : C\n')

    const source = 'timeline\n    Day 1\n        : A\n        : B\n    Day 2 : D\n'
    const doc = parseOk(source)
    const r2 = timelineParser.resolveRewrites(doc, { type: 'delete-event', elementId: 'event:1' })
    const next = reassemble(doc, r2!)
    expect(next).not.toContain(': A')
    expect(next).toContain(': B')
    expect(next).toContain('Day 2 : D')
    expect(reassemble(parseOk(next), new Map())).toBe(next)
  })

  it('add-section / set-section-name', () => {
    const doc = parseOk(SIMPLE)
    const r1 = timelineParser.resolveRewrites(doc, { type: 'add-section', name: '第三阶段' })
    expect(reassemble(doc, r1!)).toContain('section 第三阶段')
    const r2 = timelineParser.resolveRewrites(doc, { type: 'set-section-name', elementId: 'section:1', name: '起步' })
    expect(reassemble(doc, r2!)).toContain('section 起步')
  })

  it('set-title：已有标题原地改；无标题紧随声明头插入', () => {
    const doc = parseOk(SIMPLE)
    const r1 = timelineParser.resolveRewrites(doc, { type: 'set-title', text: '新标题' })
    expect(reassemble(doc, r1!)).toContain('title 新标题')

    const noTitle = parseOk('timeline\n    Day 1\n')
    const r2 = timelineParser.resolveRewrites(noTitle, { type: 'set-title', text: '补标题' })
    const next = reassemble(noTitle, r2!)
    // 新行缩进跟随声明头（头部无缩进 → 新 title 行也无缩进）
    expect(next).toBe('timeline\ntitle 补标题\n    Day 1\n')
    expect(reassemble(parseOk(next), new Map())).toBe(next)
  })

  it('set-direction：改写 / 新增 / 删除 token', () => {
    const doc = parseOk('timeline\n    Day 1\n')
    expect(reassemble(doc, timelineParser.resolveRewrites(doc, { type: 'set-direction', direction: 'TD' })!)).toBe(
      'timeline TD\n    Day 1\n',
    )
    const withDir = parseOk('timeline LR\n    Day 1\n')
    expect(
      reassemble(withDir, timelineParser.resolveRewrites(withDir, { type: 'set-direction', direction: null })!),
    ).toBe('timeline\n    Day 1\n')
  })

  it('非法取值返回 null（不落码）', () => {
    const doc = parseOk(SIMPLE)
    expect(timelineParser.resolveRewrites(doc, { type: 'set-period-text', elementId: 'period:1', text: 'a:b' })).toBeNull()
    expect(timelineParser.resolveRewrites(doc, { type: 'set-period-text', elementId: 'period:1', text: '' })).toBeNull()
    expect(timelineParser.resolveRewrites(doc, { type: 'set-event-text', elementId: 'event:1', text: 'a : b' })).toBeNull()
    expect(timelineParser.resolveRewrites(doc, { type: 'set-direction', direction: 'TB' })).toBeNull()
    // 目标不存在（列表外 id）
    expect(timelineParser.resolveRewrites(doc, { type: 'set-period-text', elementId: 'period:99', text: 'x' })).toBeNull()
    // 清单外意图
    expect(timelineParser.resolveRewrites(doc, { type: 'totally-unknown' })).toBeNull()
  })
})

describe('timeline 词法助手', () => {
  it('方向 token 解析', () => {
    expect(timelineDirectionOf(' LR')).toBe('LR')
    expect(timelineDirectionOf('  td ')).toBe('TD')
    expect(timelineDirectionOf('')).toBeNull()
    expect(timelineDirectionOf(' TB')).toBeNull()
    expect(isValidTimelineDirection('lr')).toBe(true)
    expect(isValidTimelineDirection('TB')).toBe(false)
  })

  it('时期 / 事件 / section 校验器', () => {
    expect(isValidTimelinePeriodText('Day 1')).toBe(true)
    expect(isValidTimelinePeriodText('a:b')).toBe(false)
    expect(isValidTimelinePeriodText('a#b')).toBe(false)
    expect(isValidTimelinePeriodText('  ')).toBe(false)
    expect(isValidTimelineEventText('发布 v1')).toBe(true)
    expect(isValidTimelineEventText('12:30')).toBe(true)
    expect(isValidTimelineEventText('a : b')).toBe(false)
    expect(isValidTimelineSectionName('第一阶段')).toBe(true)
    expect(isValidTimelineSectionName('a:b')).toBe(false)
  })

  it('位置序身份序号解析', () => {
    expect(parseTimelineOrdinal('period:3', 'period')).toBe(3)
    expect(parseTimelineOrdinal('event:12', 'event')).toBe(12)
    expect(parseTimelineOrdinal('period:0', 'period')).toBeNull()
    expect(parseTimelineOrdinal('period:x', 'period')).toBeNull()
    expect(parseTimelineOrdinal('timeline-header', 'period')).toBeNull()
  })
})
