import { describe, expect, it } from 'vitest'
import { journeyParser, isValidJourneyActor, isValidJourneyTaskName, parseJourneyScore } from '../journey'
import { JOURNEY_TEMPLATE } from '../../diagram-registry'
import { reassemble } from '../document'

/**
 * journey 解析器测试（more-diagrams 工单 08）：verbatim identity（ADR-0004，含模板）、
 * 解析（section / 任务行三段与两段形态 / title）、意图往返（加/改/删任务与 section、
 * score 与 actors 编辑）、冒号词法边界（引号不救冒号——落码侧拒绝）、越界 score 原样
 * 保留（不静默改写）、错误边界（表头缺失 / 非法意图返回 null）。
 */

const SAMPLE = `journey
    title 用户旅程示例
    section 发现
        访问首页: 5: 用户, 搜索引擎
        浏览商品: 3
    section 决策
        对比价格: 2: 用户, 客服
`

function parse(source: string) {
  const r = journeyParser.parse(source)
  if (!r.ok) throw new Error(`解析失败：${r.error.message}`)
  return r.doc
}

/** 应用意图并重组装（返回新 doc），意图被拒时抛错 */
function apply(source: string, intent: Parameters<typeof journeyParser.resolveRewrites>[1]) {
  const doc = parse(source)
  const rewrites = journeyParser.resolveRewrites(doc, intent)
  if (rewrites === null) throw new Error(`意图被拒绝：${JSON.stringify(intent)}`)
  return reassemble(doc, rewrites)
}

describe('verbatim identity（ADR-0004）', () => {
  it('样例源码原样重组装', () => {
    expect(reassemble(parse(SAMPLE))).toBe(SAMPLE)
  })

  it('起步模板原样重组装', () => {
    expect(reassemble(parse(JOURNEY_TEMPLATE))).toBe(JOURNEY_TEMPLATE)
  })

  it('frontmatter / 注释 / accTitle / accDescr（含多行）逐字保留', () => {
    const source = `---
title: 元数据
---
journey
    %% 注释行
    accTitle: 无障碍标题
    accDescr: 单行描述
    accDescr {
        多行描述
        第二行
    }
    section S
        任务一: 4: 甲
`
    expect(reassemble(parse(source))).toBe(source)
  })
})

describe('解析（工单 08 范围）', () => {
  it('任务行三段形态：name / score / actors 逐字段解析', () => {
    const doc = parse(SAMPLE)
    const task1 = doc.elements.find((p) => p.id === 'task:1')
    expect(task1?.element).toMatchObject({
      kind: 'journey-task',
      name: '访问首页',
      score: '5',
      hasActors: true,
      actors: '用户, 搜索引擎',
    })
  })

  it('任务行两段形态（无 actor 冒号）：hasActors = false', () => {
    const doc = parse(SAMPLE)
    const task2 = doc.elements.find((p) => p.id === 'task:2')
    expect(task2?.element).toMatchObject({ kind: 'journey-task', name: '浏览商品', score: '3', hasActors: false })
  })

  it('section 与 title 解析；位置序身份 task:N / section:N 按文档序 1 基', () => {
    const doc = parse(SAMPLE)
    expect(doc.elements.map((p) => p.id)).toEqual([
      'journey-header',
      'journey-title',
      'section:1',
      'task:1',
      'task:2',
      'section:2',
      'task:3',
    ])
  })

  it('actor 段内的 `#` 起注释：注释进 tail、任务本体照常解析（mermaid 词法同款）', () => {
    const doc = parse('journey\n    任务: 3: 甲# 备注\n')
    expect(doc.elements[1]?.element).toMatchObject({ name: '任务', score: '3', actors: '甲', tail: '# 备注' })
  })
})

describe('意图往返（编辑 → 落码 → 再解析）', () => {
  it('add-task：锚到 section 末尾（该 section 最后一个任务之后），带 actor 段', () => {
    const source = apply(SAMPLE, {
      type: 'add-task',
      name: '提交订单',
      score: 4,
      actors: ['用户', '支付网关'],
      sectionElementId: 'section:2',
    })
    expect(source).toContain('对比价格: 2: 用户, 客服\n        提交订单: 4: 用户, 支付网关')
  })

  it('add-task 不带锚点：回退文档末尾（归属最后一个 section——mermaid 按书写位置归组）', () => {
    const source = apply(SAMPLE, { type: 'add-task', name: '新任务', score: 3, actors: [] })
    expect(source.endsWith('对比价格: 2: 用户, 客服\n        新任务: 3\n')).toBe(true)
  })

  it('set-task-name：只改 name 段，score / actors / 行尾空白逐字保留', () => {
    const source = apply(SAMPLE, { type: 'set-task-name', elementId: 'task:1', name: '打开首页' })
    expect(source).toContain('打开首页: 5: 用户, 搜索引擎')
  })

  it('set-task-score：score 3 → 5，其余字段逐字保留', () => {
    const source = apply(SAMPLE, { type: 'set-task-score', elementId: 'task:2', score: 5 })
    expect(source).toContain('浏览商品: 5')
  })

  it('set-task-actors：改 actor 列表；空数组 = 移除 actor 段', () => {
    const source = apply(SAMPLE, { type: 'set-task-actors', elementId: 'task:1', actors: ['访客'] })
    expect(source).toContain('访问首页: 5: 访客')
    const noActors = apply(SAMPLE, { type: 'set-task-actors', elementId: 'task:1', actors: [] })
    expect(noActors).toContain('访问首页: 5\n')
  })

  it('delete-task：只删自己的语句行，其余逐字保留', () => {
    const source = apply(SAMPLE, { type: 'delete-task', elementId: 'task:2' })
    expect(source).not.toContain('浏览商品')
    expect(source).toContain('访问首页: 5: 用户, 搜索引擎')
  })

  it('add-section：落在文档末尾；set-section-name 只改名称', () => {
    const withSection = apply(SAMPLE, { type: 'add-section', name: '售后' })
    expect(withSection.endsWith('section 售后\n')).toBe(true)
    expect(apply(SAMPLE, { type: 'set-section-name', elementId: 'section:1', name: '触达' })).toContain(
      'section 触达',
    )
  })

  it('delete-section：级联删该 section 的全部任务，其它 section 不受影响', () => {
    const source = apply(SAMPLE, { type: 'delete-section', elementId: 'section:1' })
    expect(source).not.toContain('访问首页')
    expect(source).not.toContain('浏览商品')
    expect(source).toContain('section 决策')
    expect(source).toContain('对比价格: 2: 用户, 客服')
  })

  it('set-title：已有标题行原地改', () => {
    expect(apply(SAMPLE, { type: 'set-title', text: '新标题' })).toContain('title 新标题')
  })

  it('set-title 无标题行：紧随声明头插入一行（缩进跟随声明头）', () => {
    expect(apply('journey\n    任务: 3\n', { type: 'set-title', text: 'T' })).toBe('journey\ntitle T\n    任务: 3\n')
  })
})

describe('冒号词法边界（工单定案：引号不救冒号，落码侧拒绝）', () => {
  it('任务名含冒号：set-task-name / add-task 拒绝（返回 null，绝不产出非法 mermaid）', () => {
    const doc = parse(SAMPLE)
    expect(journeyParser.resolveRewrites(doc, { type: 'set-task-name', elementId: 'task:1', name: 'A: B' })).toBeNull()
    expect(journeyParser.resolveRewrites(doc, { type: 'set-task-name', elementId: 'task:1', name: '"A: B"' })).toBeNull()
    expect(
      journeyParser.resolveRewrites(doc, { type: 'add-task', name: '带: 冒号', score: 3, actors: [] }),
    ).toBeNull()
  })

  it('actor 含逗号/冒号：set-task-actors 拒绝（逗号是分隔符、冒号破坏 taskData 词法）', () => {
    const doc = parse(SAMPLE)
    expect(journeyParser.resolveRewrites(doc, { type: 'set-task-actors', elementId: 'task:1', actors: ['甲,乙'] })).toBeNull()
    expect(journeyParser.resolveRewrites(doc, { type: 'set-task-actors', elementId: 'task:1', actors: ['甲:乙'] })).toBeNull()
  })

  it('isValidJourneyTaskName / isValidJourneyActor：表单侧同一规则', () => {
    expect(isValidJourneyTaskName('普通任务')).toBe(true)
    expect(isValidJourneyTaskName('  ')).toBe(false)
    expect(isValidJourneyTaskName('A:B')).toBe(false)
    expect(isValidJourneyTaskName('A#B')).toBe(false)
    expect(isValidJourneyActor('用户')).toBe(true)
    expect(isValidJourneyActor('')).toBe(false)
    expect(isValidJourneyActor('a,b')).toBe(false)
  })
})

describe('score 校验（表单 1–5 选择器；越界只可能来自手写源码）', () => {
  it('越界 score 原样保留、set-task-score 拒绝非 1–5 值（不静默改写用户源码）', () => {
    const source = 'journey\n    手滑任务: 9: 甲\n'
    expect(reassemble(parse(source))).toBe(source)
    const doc = parse(source)
    expect(journeyParser.resolveRewrites(doc, { type: 'set-task-score', elementId: 'task:1', score: 9 })).toBeNull()
    expect(journeyParser.resolveRewrites(doc, { type: 'set-task-score', elementId: 'task:1', score: 0 })).toBeNull()
  })

  it('非数字 score 原样保留（mermaid 的 Number() 宽松解析，渲染行为由 mermaid 自负）', () => {
    const source = 'journey\n    怪任务: abc\n'
    expect(reassemble(parse(source))).toBe(source)
  })

  it('parseJourneyScore：整数字面量可解析，其余 null', () => {
    expect(parseJourneyScore('3')).toBe(3)
    expect(parseJourneyScore(' 5 ')).toBe(5)
    expect(parseJourneyScore('3.5')).toBeNull()
    expect(parseJourneyScore('abc')).toBeNull()
    expect(parseJourneyScore('-1')).toBeNull()
  })

  it('add-task 带越界 score：拒绝（新建必须落合法值）', () => {
    const doc = parse(SAMPLE)
    expect(journeyParser.resolveRewrites(doc, { type: 'add-task', name: 'x', score: 7, actors: [] })).toBeNull()
  })
})

describe('错误边界', () => {
  it('首行不是 journey 声明：parse 失败并给出行号', () => {
    const r = journeyParser.parse('flowchart TD\n    A --> B\n')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.line).toBe(1)
      expect(r.error.message).toContain('journey')
    }
  })

  it('frontmatter 之后才认表头', () => {
    const source = '---\nignore: x\n---\njourney\n    任务: 3\n'
    expect(reassemble(parse(source))).toBe(source)
  })

  it('目标不存在的编辑意图：返回 null', () => {
    const doc = parse(SAMPLE)
    expect(journeyParser.resolveRewrites(doc, { type: 'set-task-name', elementId: 'task:999', name: 'x' })).toBeNull()
    expect(journeyParser.resolveRewrites(doc, { type: 'delete-section', elementId: 'task:1' })).toBeNull()
  })

  it('未接线的意图类型（他图种的）：返回 null', () => {
    const doc = parse(SAMPLE)
    expect(journeyParser.resolveRewrites(doc, { type: 'set-direction', direction: 'LR' })).toBeNull()
  })
})
