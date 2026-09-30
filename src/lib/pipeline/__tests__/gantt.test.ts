import { describe, expect, it } from 'vitest'
import {
  GANTT_TAGS,
  buildGanttCoreFields,
  ganttParser,
  isGanttDuration,
  isValidGanttDirectiveValue,
  isValidGanttFields,
  isValidGanttSectionName,
  isValidGanttTags,
  isValidGanttTaskName,
  isValidGanttTitle,
  parseGanttOrdinal,
  parseGanttTaskMeta,
} from '../gantt'
import { GANTT_TEMPLATE } from '../../diagram-registry'
import { reassemble } from '../document'

/**
 * gantt 解析器测试（more-diagrams 工单 11）：verbatim identity（ADR-0004，含模板、
 * click 行、todayMarker 带 # 的样式值）、解析（指令行 / section / 任务行逐字字段 /
 * 标签剥离）、元数据形态模型（5 形态 + shape = null 清单外）、意图往返（加/改/删任务
 * 与 section、指令值、标题）、词法边界（# / ; 越界整行不认——不产出非法 mermaid）、
 * 错误边界（表头缺失 / 非法意图返回 null）。
 */

const SAMPLE = `gantt
    dateFormat YYYY-MM-DD
    axisFormat %m-%d
    title 项目排期示例

    section 调研
        需求梳理 :done, a1, 2026-01-05, 3d
        方案设计 :active, a2, after a1, 5d
    section 开发
        编码实现 :after a2, 4d
`

function parse(source: string) {
  const r = ganttParser.parse(source)
  if (!r.ok) throw new Error(`解析失败：${r.error.message}`)
  return r.doc
}

/** 应用意图并重组装（返回新 doc），意图被拒时抛错 */
function apply(source: string, intent: Parameters<typeof ganttParser.resolveRewrites>[1]) {
  const doc = parse(source)
  const rewrites = ganttParser.resolveRewrites(doc, intent)
  if (rewrites === null) throw new Error(`意图被拒绝：${JSON.stringify(intent)}`)
  return reassemble(doc, rewrites)
}

describe('verbatim identity（ADR-0004）', () => {
  it('样例源码原样重组装', () => {
    expect(reassemble(parse(SAMPLE))).toBe(SAMPLE)
  })

  it('起步模板原样重组装', () => {
    expect(reassemble(parse(GANTT_TEMPLATE))).toBe(GANTT_TEMPLATE)
  })

  it('frontmatter / 注释 / accTitle / accDescr（含多行）/ click 行逐字保留', () => {
    const source = `---
title: 元数据
---
gantt
    dateFormat YYYY-MM-DD
    %% 注释行
    accTitle: 无障碍标题
    accDescr: 单行描述
    accDescr {
        多行描述
    }
    click a1 href "https://example.com/a1" _
    section S
        任务一 : 2026-01-01, 3d
`
    expect(reassemble(parse(source))).toBe(source)
  })

  it('todayMarker 的样式值合法地含 #（只在 ; 截断）；含 ; 的指令行整行不认', () => {
    const source = `gantt
    todayMarker stroke-width:5px,stroke:#0f0
    dateFormat YYYY;MM
`
    expect(reassemble(parse(source))).toBe(source)
    const doc = parse(source)
    expect(doc.elements[1]?.element).toMatchObject({
      kind: 'gantt-directive',
      keyword: 'todayMarker',
      value: 'stroke-width:5px,stroke:#0f0',
    })
    expect(doc.elements.map((p) => p.id)).toEqual(['gantt-header', 'directive:1'])
  })

  it('行内空白 / 行尾空白逐字保留（gap / colonGap / tail 原文）', () => {
    const doc = parse('gantt\n    任务:  3d  \n')
    expect(doc.elements[1]?.element).toEqual({
      kind: 'gantt-task',
      name: '任务',
      gap1: '',
      colonGap: '  ',
      metadata: '3d',
      tail: '  ',
    })
  })
})

describe('解析（工单 11 范围）', () => {
  it('指令行 / section / 任务行的位置序身份按文档序 1 基', () => {
    const doc = parse(SAMPLE)
    expect(doc.elements.map((p) => p.id)).toEqual([
      'gantt-header',
      'directive:1',
      'directive:2',
      'gantt-title',
      'section:1',
      'task:1',
      'task:2',
      'section:2',
      'task:3',
    ])
  })

  it('任务行：name / metadata 解析，标签剥离后字段按逗号拆分', () => {
    const doc = parse(SAMPLE)
    expect(doc.elements.find((p) => p.id === 'task:1')?.element).toMatchObject({
      kind: 'gantt-task',
      name: '需求梳理',
      metadata: 'done, a1, 2026-01-05, 3d',
    })
    const parsed = parseGanttTaskMeta('done, a1, 2026-01-05, 3d')
    expect(parsed.tags).toEqual(['done'])
    expect(parsed.fields).toEqual(['a1', '2026-01-05', '3d'])
  })

  it('标签必须独占逗号字段且大小写敏感（getTaskTags 精确匹配口径）', () => {
    expect(parseGanttTaskMeta('Done, 3d').tags).toEqual([])
    expect(parseGanttTaskMeta('done 3d, 2026-01-01').tags).toEqual([])
    expect(parseGanttTaskMeta('done, active, 3d').tags).toEqual(['done', 'active'])
  })

  it('vert 是任务标签不是指令行（mermaid 12 lexer 无 vert token，工单偏离记录在 Comments）', () => {
    expect(GANTT_TAGS).toContain('vert')
    expect(parseGanttTaskMeta('vert, 2026-01-01, 3d').tags).toEqual(['vert'])
  })

  it('click 行必须在任务行识别前排除（href 含 :// 会被误切成任务名 + 元数据）', () => {
    const doc = parse('gantt\n    click a1 href "https://x/a1" _\n')
    expect(doc.elements.map((p) => p.id)).toEqual(['gantt-header'])
  })

  it('元数据含 # 或 ; 的任务行整行不认（taskData = [^#\\n;]+ 词法），逐字保留', () => {
    const source = 'gantt\n    任务 : 2026-01-01, 3d # 备注\n    任务二 : 2026-01-01;3d\n'
    expect(reassemble(parse(source))).toBe(source)
    expect(parse(source).elements.map((p) => p.id)).toEqual(['gantt-header'])
  })
})

describe('元数据形态模型（工单定案：第几个逗号字段决定含义）', () => {
  it('date-end：起止日期（2 字段）', () => {
    expect(parseGanttTaskMeta('2026-01-01, 2026-01-05').meta).toEqual({
      shape: 'date-end',
      taskId: '',
      start: '2026-01-01',
      afterIds: '',
      end: '2026-01-05',
      untilId: '',
    })
  })

  it('date-duration：起始 + 时长（第 2 段命中 parseDuration 词法）', () => {
    expect(parseGanttTaskMeta('2026-01-01, 3d').meta?.shape).toBe('date-duration')
    expect(parseGanttTaskMeta('2026-01-01, 1.5w').meta?.shape).toBe('date-duration')
    expect(parseGanttTaskMeta('2026-01-01, 500ms').meta?.shape).toBe('date-duration')
    expect(isGanttDuration('3d')).toBe(true)
    expect(isGanttDuration('3x')).toBe(false)
  })

  it('3 字段 = 显式 id + 两个核心字段（mermaid compileData case 3 口径）', () => {
    expect(parseGanttTaskMeta('a1, 2026-01-01, 3d').meta).toEqual({
      shape: 'date-duration',
      taskId: 'a1',
      start: '2026-01-01',
      afterIds: '',
      end: '3d',
      untilId: '',
    })
    expect(parseGanttTaskMeta('a1, 2026-01-01, 2026-01-05').meta?.shape).toBe('date-end')
    expect(parseGanttTaskMeta('a1, after b1, until b2').meta?.shape).toBe('after-until')
  })

  it('after-end / date-until / after-until：按 after / until 前缀分派（ids 词法 [\\w- ]+）', () => {
    expect(parseGanttTaskMeta('after a1, 2026-01-05').meta?.shape).toBe('after-end')
    expect(parseGanttTaskMeta('after a1 t2, 3d').meta?.afterIds).toBe('a1 t2')
    expect(parseGanttTaskMeta('2026-01-01, until a2').meta?.shape).toBe('date-until')
    expect(parseGanttTaskMeta('2026-01-01, until a2').meta?.untilId).toBe('a2')
    expect(parseGanttTaskMeta('after a1, until a2').meta?.shape).toBe('after-until')
  })

  it('1 字段 / 空字段 / 含空字段：shape = null（清单外，不建模不静默改写）', () => {
    expect(parseGanttTaskMeta('3d').meta).toBeNull()
    expect(parseGanttTaskMeta('2026-01-01, , 2026-01-05').meta).toBeNull()
    expect(parseGanttTaskMeta('').meta).toBeNull()
  })

  it('buildGanttCoreFields：按形态拼回逗号序；显式 id 前置；非法值返回 null', () => {
    expect(
      buildGanttCoreFields({ shape: 'date-end', taskId: '', start: '2026-01-01', afterIds: '', end: '2026-01-05', untilId: '' }),
    ).toEqual(['2026-01-01', '2026-01-05'])
    expect(
      buildGanttCoreFields({ shape: 'after-end', taskId: 't1', start: '', afterIds: 'a1', end: '3d', untilId: '' }),
    ).toEqual(['t1', 'after a1', '3d'])
    expect(
      buildGanttCoreFields({ shape: 'date-end', taskId: '', start: '', afterIds: '', end: '', untilId: '' }),
    ).toBeNull()
    expect(
      buildGanttCoreFields({ shape: 'date-end', taskId: '', start: '2026-01-01', afterIds: '', end: '3;d', untilId: '' }),
    ).toBeNull()
    expect(
      buildGanttCoreFields({ shape: 'after-end', taskId: '', start: '', afterIds: 'a1,x', end: '3d', untilId: '' }),
    ).toBeNull()
  })
})

describe('意图往返（编辑 → 落码 → 再解析）', () => {
  it('add-task：锚到 section 末尾，缺省时长 1d', () => {
    const source = apply(SAMPLE, { type: 'add-task', name: '联调测试', sectionElementId: 'section:2' })
    expect(source).toContain('编码实现 :after a2, 4d\n        联调测试: 1d')
  })

  it('add-task 不带锚点：回退文档末尾（归属最后一个 section——mermaid 按书写位置归组）', () => {
    const source = apply(SAMPLE, { type: 'add-task', name: '新任务' })
    expect(source.endsWith('编码实现 :after a2, 4d\n        新任务: 1d\n')).toBe(true)
  })

  it('set-task-name：只改 name 段，元数据与空白逐字保留', () => {
    expect(apply(SAMPLE, { type: 'set-task-name', elementId: 'task:1', name: '打开首页' })).toContain(
      '打开首页 :done, a1, 2026-01-05, 3d',
    )
  })

  it('set-task-meta：标签 + 按形态拼回的逗号字段整体改写', () => {
    expect(
      apply(SAMPLE, { type: 'set-task-meta', elementId: 'task:3', tags: ['crit'], fields: ['2026-01-10', '2d'] }),
    ).toContain('编码实现 :crit, 2026-01-10, 2d')
  })

  it('delete-task：只删自己的语句行', () => {
    const source = apply(SAMPLE, { type: 'delete-task', elementId: 'task:2' })
    expect(source).not.toContain('方案设计')
    expect(source).toContain('需求梳理 :done, a1, 2026-01-05, 3d')
  })

  it('add-section：缺省锚点回退文档末尾；set-section-name 只改名称', () => {
    const withSection = apply(SAMPLE, { type: 'add-section', name: '发布' })
    expect(withSection.endsWith('section 发布\n')).toBe(true)
    expect(apply(SAMPLE, { type: 'set-section-name', elementId: 'section:1', name: '触达' })).toContain(
      'section 触达',
    )
  })

  it('delete-section：级联删该 section 的全部任务，其它 section 不受影响', () => {
    const source = apply(SAMPLE, { type: 'delete-section', elementId: 'section:1' })
    expect(source).not.toContain('需求梳理')
    expect(source).not.toContain('方案设计')
    expect(source).toContain('section 开发')
    expect(source).toContain('编码实现 :after a2, 4d')
  })

  it('set-directive：改指令值（todayMarker off 开关同走此意图），空白形态逐字保留', () => {
    expect(apply(SAMPLE, { type: 'set-directive', elementId: 'directive:1', value: 'DD/MM/YYYY' })).toContain(
      'dateFormat DD/MM/YYYY',
    )
  })

  it('改写回写保留行内空白与行尾空白（gap / tail 原样，只动被编辑的段）', () => {
    const source = 'gantt\n    dateFormat  YYYY-MM-DD  \n    section  调研  \n    任务 :  3d  \n'
    expect(apply(source, { type: 'set-directive', elementId: 'directive:1', value: 'DD/MM' })).toContain(
      'dateFormat  DD/MM  ',
    )
    expect(apply(source, { type: 'set-section-name', elementId: 'section:1', name: '触达' })).toContain(
      'section  触达  ',
    )
    expect(apply(source, { type: 'set-task-name', elementId: 'task:1', name: '改名' })).toContain(
      '改名 :  3d  ',
    )
  })

  it('set-title：已有标题行原地改（gap 保留）；无标题行紧随声明头插入', () => {
    expect(apply(SAMPLE, { type: 'set-title', text: '新标题' })).toContain('title 新标题')
    expect(apply('gantt\n    任务: 3d\n', { type: 'set-title', text: 'T' })).toBe('gantt\ntitle T\n    任务: 3d\n')
  })
})

describe('落码校验（绝不产出非法 mermaid）', () => {
  it('任务名含冒号/分号/#/换行：set-task-name / add-task 拒绝', () => {
    const doc = parse(SAMPLE)
    expect(ganttParser.resolveRewrites(doc, { type: 'set-task-name', elementId: 'task:1', name: 'A: B' })).toBeNull()
    expect(ganttParser.resolveRewrites(doc, { type: 'set-task-name', elementId: 'task:1', name: 'A;B' })).toBeNull()
    expect(ganttParser.resolveRewrites(doc, { type: 'add-task', name: 'A:B' })).toBeNull()
  })

  it('标签 / 字段非法：set-task-meta / add-task 拒绝', () => {
    const doc = parse(SAMPLE)
    expect(
      ganttParser.resolveRewrites(doc, { type: 'set-task-meta', elementId: 'task:1', tags: ['nope'], fields: ['1d'] }),
    ).toBeNull()
    expect(
      ganttParser.resolveRewrites(doc, { type: 'set-task-meta', elementId: 'task:1', tags: [], fields: [] }),
    ).toBeNull()
    expect(
      ganttParser.resolveRewrites(doc, { type: 'set-task-meta', elementId: 'task:1', tags: [], fields: ['1d', ''] }),
    ).toBeNull()
    expect(ganttParser.resolveRewrites(doc, { type: 'add-task', name: 'x', tags: ['done', 'done'], fields: ['1d'] })).toBeNull()
  })

  it('指令值含 ;（或 todayMarker 之外的 #）：set-directive 拒绝；空值同样拒绝', () => {
    const doc = parse(SAMPLE)
    expect(ganttParser.resolveRewrites(doc, { type: 'set-directive', elementId: 'directive:1', value: 'A;B' })).toBeNull()
    expect(ganttParser.resolveRewrites(doc, { type: 'set-directive', elementId: 'directive:1', value: '' })).toBeNull()
    expect(isValidGanttDirectiveValue('todayMarker', 'stroke:#0f0')).toBe(true)
    expect(isValidGanttDirectiveValue('dateFormat', 'A#B')).toBe(false)
  })

  it('isValid* 助手与落码门同一规则', () => {
    expect(isValidGanttTags(['done', 'crit'])).toBe(true)
    expect(isValidGanttTags(['done', 'done'])).toBe(false)
    expect(isValidGanttTags(['vert'])).toBe(true)
    expect(isValidGanttFields(['1d'])).toBe(true)
    expect(isValidGanttFields(['1d', '2d', '3d', '4d'])).toBe(false)
    expect(isValidGanttTaskName('普通任务')).toBe(true)
    expect(isValidGanttTaskName('  ')).toBe(false)
    expect(isValidGanttSectionName('A: B')).toBe(true)
    expect(isValidGanttSectionName('')).toBe(false)
    expect(isValidGanttTitle('标题')).toBe(true)
    expect(isValidGanttTitle('多\n行')).toBe(false)
  })
})

describe('位置序身份解析', () => {
  it('parseGanttOrdinal：task / section / directive 前缀各归各，形态不符 null', () => {
    expect(parseGanttOrdinal('task:3', 'task')).toBe(3)
    expect(parseGanttOrdinal('section:1', 'section')).toBe(1)
    expect(parseGanttOrdinal('directive:2', 'directive')).toBe(2)
    expect(parseGanttOrdinal('task:3', 'section')).toBeNull()
    expect(parseGanttOrdinal('task:03', 'task')).toBeNull()
    expect(parseGanttOrdinal('task:0', 'task')).toBeNull()
    expect(parseGanttOrdinal('task:-1', 'task')).toBeNull()
  })
})

describe('错误边界', () => {
  it('首行不是 gantt 声明：parse 失败并给出行号', () => {
    const r = ganttParser.parse('flowchart TD\n    A --> B\n')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.line).toBe(1)
      expect(r.error.message).toContain('gantt')
    }
  })

  it('frontmatter 之后才认表头', () => {
    const source = '---\nignore: x\n---\ngantt\n    任务: 3d\n'
    expect(reassemble(parse(source))).toBe(source)
  })

  it('目标不存在的编辑意图：返回 null', () => {
    const doc = parse(SAMPLE)
    expect(ganttParser.resolveRewrites(doc, { type: 'set-task-name', elementId: 'task:999', name: 'x' })).toBeNull()
    expect(ganttParser.resolveRewrites(doc, { type: 'delete-section', elementId: 'task:1' })).toBeNull()
    expect(ganttParser.resolveRewrites(doc, { type: 'set-directive', elementId: 'task:1', value: 'x' })).toBeNull()
  })

  it('未接线的意图类型（他图种的）：返回 null', () => {
    const doc = parse(SAMPLE)
    expect(ganttParser.resolveRewrites(doc, { type: 'set-direction', direction: 'LR' })).toBeNull()
  })
})
