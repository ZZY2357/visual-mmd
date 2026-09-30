import { describe, expect, it } from 'vitest'
import {
  isPieValuePositive,
  isValidPieLabel,
  isValidPieTitle,
  parsePieValue,
  pieParser,
} from '../pie'
import { PIE_TEMPLATE } from '../../diagram-registry'
import { reassemble } from '../document'

/**
 * pie 解析器测试（more-diagrams 工单 10）：verbatim identity（ADR-0004，含模板）、
 * 解析（声明头带/不带 showData、title、扇区行、小数原样透传）、意图往返（加/改/删扇区、
 * 标签与数值编辑、小数风格保留）、非法数值原样保留并标注（不静默改写）、错误边界
 * （表头缺失 / 负数零数值落码被拒 / 非法标签拒绝）。
 */

const SAMPLE = `pie showData
    title 预算分配
    "研发" : 45
    "市场" : 30.5
    "运营" : 25
`

function parse(source: string) {
  const r = pieParser.parse(source)
  if (!r.ok) throw new Error(`解析失败：${r.error.message}`)
  return r.doc
}

/** 应用意图并重组装（返回新 doc），意图被拒时抛错 */
function apply(source: string, intent: Parameters<typeof pieParser.resolveRewrites>[1]) {
  const doc = parse(source)
  const rewrites = pieParser.resolveRewrites(doc, intent)
  if (rewrites === null) throw new Error(`意图被拒绝：${JSON.stringify(intent)}`)
  return reassemble(doc, rewrites)
}

describe('verbatim identity（ADR-0004）', () => {
  it('样例源码原样重组装', () => {
    expect(reassemble(parse(SAMPLE))).toBe(SAMPLE)
  })

  it('起步模板原样重组装', () => {
    expect(reassemble(parse(PIE_TEMPLATE))).toBe(PIE_TEMPLATE)
  })

  it('frontmatter / 注释 / accTitle / accDescr（含多行）逐字保留', () => {
    const source = `---
title: 元数据
config:
  pie:
    textPosition: 0.5
---
pie
    %% 注释行
    accTitle: 无障碍标题
    accDescr: 单行描述
    accDescr {
        多行描述
        第二行
    }
    "甲" : 40
`
    expect(reassemble(parse(source))).toBe(source)
  })
})

describe('解析（工单 10 范围）', () => {
  it('声明头：showData 可选，gap 与行尾空白逐字记录', () => {
    const doc = parse(SAMPLE)
    expect(doc.elements[0]?.element).toMatchObject({ kind: 'pie-header', showData: true, gap: ' ' })
    const bare = parse('pie\n  "a" : 5\n')
    expect(bare.elements[0]?.element).toMatchObject({ kind: 'pie-header', showData: false, gap: '' })
  })

  it('扇区行：label / 数值 / 尾注释逐字段解析；位置序身份 sector:N 按文档序 1 基', () => {
    const doc = parse(SAMPLE)
    expect(doc.elements.map((p) => p.id)).toEqual([
      'pie-header',
      'pie-title',
      'sector:1',
      'sector:2',
      'sector:3',
    ])
    expect(doc.elements.find((p) => p.id === 'sector:2')?.element).toMatchObject({
      kind: 'pie-sector',
      quote: '"',
      label: '市场',
      gap1: ' ',
      gap2: ' ',
      value: '30.5',
      tail: '',
    })
  })

  it('数值小数风格原样透传；行尾 %% 注释进 tail', () => {
    const doc = parse('pie\n  "a" : 42.96 %% 注释\n  "b" : 5\n')
    expect(doc.elements.find((p) => p.id === 'sector:1')?.element).toMatchObject({
      value: '42.96',
      tail: ' %% 注释',
    })
    expect(doc.elements.find((p) => p.id === 'sector:2')?.element).toMatchObject({ value: '5' })
  })

  it('非法数值（负数 / 零 / 前导零）仍按扇区解析——原文保留，交由结构树标注', () => {
    const doc = parse('pie\n  "负" : -1\n  "零" : 0\n  "前导零" : 05\n  "垃圾" : 5 abc\n')
    const labels = doc.elements
      .filter((p) => p.element.kind === 'pie-sector')
      .map((p) => (p.element as { label: string }).label)
    // 负数 / 零 / 前导零（NUMBER_PIE 词法不认）都是可标注的扇区；数值后跟垃圾 token
    // （mermaid lexer 错误）整行不认，不进结构树
    expect(labels).toEqual(['负', '零', '前导零'])
  })

  it('title 与 accTitle 同时存在时各归各位；title 文本到 %% 截断', () => {
    const doc = parse('pie\n  accTitle: t\n  title 标题 %% 注释\n  "a" : 5\n')
    expect(doc.elements.find((p) => p.id === 'pie-title')?.element).toMatchObject({ kind: 'pie-title', text: '标题' })
  })

  it('表头缺失 → 解析错误；无闭引号的行整行不认（不报错，逐字保留）', () => {
    expect(pieParser.parse('"a" : 5')).toMatchObject({ ok: false })
    expect(pieParser.parse('pie\n"ab').ok).toBe(true)
  })
})

describe('校验助手（表单与落码门共用，避免第二份实现）', () => {
  it('parsePieValue：NUMBER_PIE 词法（整数无前导零、小数必须带整数位）', () => {
    expect(parsePieValue('5')).toBe(5)
    expect(parsePieValue('42.96')).toBe(42.96)
    expect(parsePieValue('-1')).toBe(-1)
    expect(parsePieValue('0')).toBe(0)
    expect(parsePieValue('05')).toBeNull()
    expect(parsePieValue('.5')).toBeNull()
    expect(parsePieValue('5.')).toBeNull()
    expect(parsePieValue('abc')).toBeNull()
  })

  it('isPieValuePositive：仅 >0 合法（负数是 mermaid 落码错误、零被渲染层过滤）', () => {
    expect(isPieValuePositive('5')).toBe(true)
    expect(isPieValuePositive('0.5')).toBe(true)
    expect(isPieValuePositive('0')).toBe(false)
    expect(isPieValuePositive('-1')).toBe(false)
    expect(isPieValuePositive('abc')).toBe(false)
  })

  it('isValidPieLabel：非空、不含引号 / 反斜杠 / 换行', () => {
    expect(isValidPieLabel('研发')).toBe(true)
    expect(isValidPieLabel('')).toBe(false)
    expect(isValidPieLabel('  ')).toBe(false)
    expect(isValidPieLabel('含"引号')).toBe(false)
    expect(isValidPieLabel("含'引号")).toBe(false)
    expect(isValidPieLabel('尾反斜杠\\')).toBe(false)
    expect(isValidPieLabel('含\n换行')).toBe(false)
  })

  it('isValidPieTitle：非空、不含换行与 %%', () => {
    expect(isValidPieTitle('预算')).toBe(true)
    expect(isValidPieTitle('')).toBe(false)
    expect(isValidPieTitle('带%%注释')).toBe(false)
  })
})

describe('意图往返（编辑 → 落码 → 再解析）', () => {
  it('add-sector：追加在文档末尾（缺省锚点），落 `"标签" : 数值`', () => {
    const source = apply(SAMPLE, { type: 'add-sector', label: '新扇区', value: '10' })
    expect(source.endsWith('    "运营" : 25\n    "新扇区" : 10\n')).toBe(true)
    const doc = parse(source)
    expect(doc.elements.find((p) => p.id === 'sector:4')?.element).toMatchObject({
      kind: 'pie-sector',
      label: '新扇区',
      value: '10',
    })
  })

  it('add-sector 带锚点：落在锚点行之后，缩进跟随锚点行', () => {
    const source = apply(SAMPLE, {
      type: 'add-sector',
      label: '第二位',
      value: '7',
      afterElementId: 'sector:1',
    })
    expect(source).toContain('"研发" : 45\n    "第二位" : 7\n    "市场" : 30.5')
  })

  it('set-sector-label：只改标签，数值 / 空白 / 尾注释逐字保留', () => {
    const source = apply(SAMPLE, { type: 'set-sector-label', elementId: 'sector:2', label: '营销' })
    expect(source).toContain('"营销" : 30.5')
    expect(source).toContain('"研发" : 45')
  })

  it('set-sector-value：只改数值，小数风格随输入（`5` 落 `5` 而非 `5.00`，工单定案）', () => {
    const source = apply(SAMPLE, { type: 'set-sector-value', elementId: 'sector:1', value: '50' })
    expect(source).toContain('"研发" : 50')
    const decimal = apply(SAMPLE, { type: 'set-sector-value', elementId: 'sector:1', value: '50.25' })
    expect(decimal).toContain('"研发" : 50.25')
  })

  it('set-sector-value：手写负数扇区改回合法值（负数原文保留是解析侧行为，改写必须落回合法值）', () => {
    const bad = parse('pie\n  "负" : -1\n')
    const rewrites = pieParser.resolveRewrites(bad, { type: 'set-sector-value', elementId: 'sector:1', value: '3' })
    expect(rewrites).not.toBeNull()
    expect(reassemble(bad, rewrites!)).toBe('pie\n  "负" : 3\n')
  })

  it('delete-sector：语句文本移除，换行与行首缩进逐字保留（ADR-0008 手术式改写）', () => {
    const source = apply(SAMPLE, { type: 'delete-sector', elementId: 'sector:2' })
    expect(source).toBe('pie showData\n    title 预算分配\n    "研发" : 45\n    \n    "运营" : 25\n')
  })

  it('set-title：已有标题行原地改；无标题行时紧随声明头插入', () => {
    const renamed = apply(SAMPLE, { type: 'set-title', text: '新标题' })
    expect(renamed).toContain('title 新标题')
    const added = apply('pie\n  "a" : 5\n', { type: 'set-title', text: '标题' })
    expect(added).toBe('pie\ntitle 标题\n  "a" : 5\n')
  })

  it('编辑后再解析仍 verbatim identity（往返稳定性）', () => {
    const once = apply(SAMPLE, { type: 'add-sector', label: '新扇区', value: '10' })
    expect(reassemble(parse(once))).toBe(once)
  })
})

describe('错误边界（绝不产出非法 mermaid）', () => {
  it('add-sector：负数 / 零 / 非法数值被拒', () => {
    expect(pieParser.resolveRewrites(parse(SAMPLE), { type: 'add-sector', label: 'x', value: '0' })).toBeNull()
    expect(pieParser.resolveRewrites(parse(SAMPLE), { type: 'add-sector', label: 'x', value: '-3' })).toBeNull()
    expect(pieParser.resolveRewrites(parse(SAMPLE), { type: 'add-sector', label: 'x', value: 'abc' })).toBeNull()
  })

  it('add-sector：含引号 / 反斜杠 / 空白的标签被拒', () => {
    expect(pieParser.resolveRewrites(parse(SAMPLE), { type: 'add-sector', label: 'a"b', value: '1' })).toBeNull()
    expect(pieParser.resolveRewrites(parse(SAMPLE), { type: 'add-sector', label: 'a\\b', value: '1' })).toBeNull()
    expect(pieParser.resolveRewrites(parse(SAMPLE), { type: 'add-sector', label: '  ', value: '1' })).toBeNull()
  })

  it('set-sector-value / set-sector-label：非法输入被拒，目标不存在返回 null', () => {
    expect(pieParser.resolveRewrites(parse(SAMPLE), { type: 'set-sector-value', elementId: 'sector:1', value: '0' })).toBeNull()
    expect(pieParser.resolveRewrites(parse(SAMPLE), { type: 'set-sector-label', elementId: 'sector:1', label: '' })).toBeNull()
    expect(pieParser.resolveRewrites(parse(SAMPLE), { type: 'set-sector-label', elementId: 'sector:99', label: 'x' })).toBeNull()
    expect(pieParser.resolveRewrites(parse(SAMPLE), { type: 'delete-sector', elementId: 'sector:99' })).toBeNull()
  })

  it('set-title：空文本 / 含 %% 被拒', () => {
    expect(pieParser.resolveRewrites(parse(SAMPLE), { type: 'set-title', text: '' })).toBeNull()
    expect(pieParser.resolveRewrites(parse(SAMPLE), { type: 'set-title', text: 'a%%b' })).toBeNull()
  })

  it('清单外意图不接（返回 null）', () => {
    expect(pieParser.resolveRewrites(parse(SAMPLE), { type: 'add-node', nodeId: 'n1' })).toBeNull()
  })
})
