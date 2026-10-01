import { describe, expect, it } from 'vitest'
import mermaid from 'mermaid'
import {
  escapeRadarLabel,
  isValidRadarId,
  isValidRadarLabelText,
  isValidRadarNumber,
  isValidRadarOptionValue,
  nextRadarId,
  radarParser,
  unescapeRadarLabel,
  type RadarCurveData,
  type RadarElementData,
} from '../radar'
import { RADAR_TEMPLATE } from '../../diagram-registry'
import { reassemble } from '../document'

/**
 * radar 解析器测试（more-diagrams 工单 15）：verbatim identity（ADR-0004，含模板）、
 * 解析（声明头、title、轴行多段、曲线双形态、选项行、行内段几何）、校验助手、
 * 意图往返（加/删轴与曲线、轴-曲线级联、双形态定点改写、选项与标题）、错误边界
 * （绝不产出非法 mermaid）、金样合法性（模板与编辑产物 mermaid.parse 通过）。
 */

const SAMPLE = `radar-beta
    title 技能评估
    axis math["数学"], science["科学"]
    curve alice["Alice"]{ 1, 2 }
    curve bob["Bob"]{ math: 4, science: 3 }
    max 5
`

function parse(source: string) {
  const r = radarParser.parse(source)
  if (!r.ok) throw new Error(`解析失败：${r.error.message}`)
  return r.doc
}

/** 应用意图并重组装（返回新源码），意图被拒时抛错 */
function apply(source: string, intent: Parameters<typeof radarParser.resolveRewrites>[1]) {
  const doc = parse(source)
  const rewrites = radarParser.resolveRewrites(doc, intent)
  if (rewrites === null) throw new Error(`意图被拒绝：${JSON.stringify(intent)}`)
  return reassemble(doc, rewrites)
}

function ofKind(doc: ReturnType<typeof parse>, kind: RadarElementData['kind']): RadarElementData[] {
  return doc.elements
    .filter((p) => (p.element as RadarElementData).kind === kind)
    .map((p) => p.element as RadarElementData)
}

function curveOf(source: string, id: string): RadarCurveData {
  const data = ofKind(parse(source), 'radar-curve').find((c) => (c as RadarCurveData).id === id)
  if (data === undefined) throw new Error(`曲线不存在：${id}`)
  return data as RadarCurveData
}

describe('verbatim identity（ADR-0004）', () => {
  it('样例源码原样重组装', () => {
    expect(reassemble(parse(SAMPLE))).toBe(SAMPLE)
  })

  it('起步模板原样重组装', () => {
    expect(reassemble(parse(RADAR_TEMPLATE))).toBe(RADAR_TEMPLATE)
  })

  it('frontmatter / 注释 / accTitle / accDescr（含多行）逐字保留', () => {
    const source = `---
title: 元数据
config:
  radar:
    showLegend: true
---
radar-beta
    %% 注释行
    accTitle: 无障碍标题
    accDescr: 单行描述
    accDescr {
        多行描述
        第二行
    }
    axis a["甲"]
`
    expect(reassemble(parse(source))).toBe(source)
  })

  it('清单外行（无花括号曲线 / 混杂条目 / 空标题）不解析、逐字保留', () => {
    const source = `radar-beta
    title
    curve 裸曲线没有花括号
    curve 混杂{ 1, b: 2 }
    axis a["甲"]
`
    expect(reassemble(parse(source))).toBe(source)
    expect(ofKind(parse(source), 'radar-title')).toHaveLength(0)
    expect(ofKind(parse(source), 'radar-curve')).toHaveLength(0)
  })
})

describe('解析（工单 15 范围）', () => {
  it('声明头：radar-beta 必需，elementId 按文档序位置序 1 基', () => {
    const doc = parse(SAMPLE)
    expect(doc.elements.map((p) => p.id)).toEqual([
      'radar-header',
      'radar-title',
      'axis:1',
      'axis:2',
      'curve:1',
      'curve:2',
      'option:1',
    ])
  })

  it('轴行多段：首段 / 非首段的行内段几何（lead / keywordGap / tail / isFirst / isLast）', () => {
    const doc = parse(SAMPLE)
    const [first, second] = ofKind(doc, 'radar-axis')
    expect(first).toMatchObject({
      kind: 'radar-axis',
      id: 'math',
      hasLabel: true,
      label: '数学',
      quote: '"',
      isFirst: true,
      isLast: false,
      lead: '',
      keywordGap: ' ',
      tail: '',
    })
    expect(second).toMatchObject({
      kind: 'radar-axis',
      id: 'science',
      isFirst: false,
      isLast: true,
      lead: ', ',
      keywordGap: '',
    })
  })

  it('曲线双形态判定：键值 / 值列表 / 清单外（混杂或空）', () => {
    const source = `radar-beta
    axis a["甲"], b["乙"]
    curve keyed{ a: 1, b: 2.5 }
    curve list{ 1, 2 }
    curve raw{ 1, b: 2 }
    curve empty{}
`
    const doc = parse(source)
    const curves = ofKind(doc, 'radar-curve') as RadarCurveData[]
    expect(curves.map((c) => c.form)).toEqual(['keyed', 'value-list', 'raw', 'raw'])
    // 花括号外侧空白并进首末 piece 的 leadWs / trailWs（raw = leadWs+ref+mid+num+trailWs 恒等式）
    expect(curves[0]?.pieces).toEqual([
      { raw: ' a: 1', sepAfter: ', ', kind: 'keyed', leadWs: ' ', ref: 'a', mid: ': ', num: '1', trailWs: '' },
      { raw: 'b: 2.5 ', sepAfter: '', kind: 'keyed', leadWs: '', ref: 'b', mid: ': ', num: '2.5', trailWs: ' ' },
    ])
    expect(curves[1]?.pieces).toEqual([
      { raw: ' 1', sepAfter: ', ', kind: 'number', leadWs: ' ', num: '1', trailWs: '' },
      { raw: '2 ', sepAfter: '', kind: 'number', leadWs: '', num: '2', trailWs: ' ' },
    ])
  })

  it('键值条目冒号可省（RadarGrammar DetailedEntry 的 `:` cardinality "?"）', () => {
    const curve = curveOf('radar-beta\n    axis a["甲"]\n    curve c{ a 1 }\n', 'c')
    expect(curve.form).toBe('keyed')
    expect(curve.pieces[0]).toMatchObject({ ref: 'a', mid: ' ', num: '1', leadWs: ' ', trailWs: ' ' })
  })

  it('选项行：值到行尾；一行多段时后续段自带名字与间隔空白；值后带 %% 注释整行清单外', () => {
    const doc = parse('radar-beta\n    max 5\n    graticule circle, showLegend false\n')
    const options = ofKind(doc, 'radar-option')
    expect(options).toHaveLength(3)
    expect(options[0]).toMatchObject({ kind: 'radar-option', name: 'max', value: '5', tail: '' })
    expect(options[1]).toMatchObject({ name: 'graticule', value: 'circle', isFirst: true })
    expect(options[2]).toMatchObject({ name: 'showLegend', value: 'false', lead: ', ', isFirst: false })
    // 值后跟 %% 注释 = NUMBER 词法后垃圾 token（mermaid lexer 报错），整行清单外逐字保留
    const withTail = parse('radar-beta\n    max 5 %% 注释\n')
    expect(ofKind(withTail, 'radar-option')).toHaveLength(0)
  })

  it('title 文本到 %% 截断；首段不合法的轴行整行清单外（mermaid 该行报错）', () => {
    // `-bad` 不合 ID 词法（\\w 词素开头）；数字开头 9a 反而合法
    const doc = parse('radar-beta\n    title 标题 %% 注释\n    axis -bad, a["甲"]\n')
    expect(doc.elements.find((p) => p.element.kind === 'radar-title')?.element).toMatchObject({ text: '标题' })
    expect(ofKind(doc, 'radar-axis')).toHaveLength(0)
  })

  it('表头缺失 → 解析错误', () => {
    expect(radarParser.parse('axis a["甲"]')).toMatchObject({ ok: false })
  })
})

describe('校验助手（表单与落码门共用，避免第二份实现）', () => {
  it('isValidRadarId：ID 词法（\\w 词素，可数字开头——与 Langium ID terminal 一致）', () => {
    expect(isValidRadarId('a')).toBe(true)
    expect(isValidRadarId('math-1')).toBe(true)
    expect(isValidRadarId('_x')).toBe(true)
    expect(isValidRadarId('9a')).toBe(true)
    expect(isValidRadarId('')).toBe(false)
    expect(isValidRadarId('-a')).toBe(false)
    expect(isValidRadarId('a-')).toBe(false)
    expect(isValidRadarId('a b')).toBe(false)
  })

  it('isValidRadarNumber：NUMBER 词法（INT 无前导零 / FLOAT；radar 无负号）', () => {
    expect(isValidRadarNumber('5')).toBe(true)
    expect(isValidRadarNumber('42.96')).toBe(true)
    expect(isValidRadarNumber('-1')).toBe(false)
    expect(isValidRadarNumber('0')).toBe(true)
    expect(isValidRadarNumber('05')).toBe(false)
    expect(isValidRadarNumber('.5')).toBe(false)
    expect(isValidRadarNumber('5.')).toBe(false)
  })

  it('isValidRadarLabelText：非空、不含换行；引号与反斜杠允许（落码统一转义）', () => {
    expect(isValidRadarLabelText('数学')).toBe(true)
    expect(isValidRadarLabelText('')).toBe(false)
    expect(isValidRadarLabelText('  ')).toBe(false)
    expect(isValidRadarLabelText('含"引号')).toBe(true)
    expect(isValidRadarLabelText('含\\反斜杠')).toBe(true)
    expect(isValidRadarLabelText('含\n换行')).toBe(false)
  })

  it('escapeRadarLabel / unescapeRadarLabel：统一双引号 + `\\` 与 `"` 转义（往返）', () => {
    expect(escapeRadarLabel('数"学')).toBe('"数\\"学"')
    expect(escapeRadarLabel('a\\b')).toBe('"a\\\\b"')
    const roundtrip = (t: string) => unescapeRadarLabel(escapeRadarLabel(t).slice(1, -1))
    expect(roundtrip('数"学\\c')).toBe('数"学\\c')
  })

  it('isValidRadarOptionValue：按名字校验词法', () => {
    expect(isValidRadarOptionValue('showLegend', 'true')).toBe(true)
    expect(isValidRadarOptionValue('showLegend', 'false')).toBe(true)
    expect(isValidRadarOptionValue('showLegend', '1')).toBe(false)
    expect(isValidRadarOptionValue('graticule', 'circle')).toBe(true)
    expect(isValidRadarOptionValue('graticule', 'polygon')).toBe(true)
    expect(isValidRadarOptionValue('graticule', 'grid')).toBe(false)
    expect(isValidRadarOptionValue('max', '5')).toBe(true)
    expect(isValidRadarOptionValue('max', '-5')).toBe(false)
    expect(isValidRadarOptionValue('ticks', '4.5')).toBe(true)
    expect(isValidRadarOptionValue('min', '')).toBe(false)
  })

  it('nextRadarId：从 1 起编号，跳过已有 id', () => {
    expect(nextRadarId('axis', [])).toBe('axis1')
    expect(nextRadarId('axis', ['axis1', 'axis2'])).toBe('axis3')
  })
})

describe('意图往返（编辑 → 落码 → 再解析）', () => {
  it('add-axis：无轴文档落声明头之后（锚点回退文档末尾），缩进跟随锚点行', () => {
    const source = apply('radar-beta\n', { type: 'add-axis' })
    expect(source).toBe('radar-beta\naxis axis1["新轴"]\n')
  })

  it('add-axis：有轴时追加到最后一条轴行行尾，并给键值曲线级联补条目（值列表曲线不动）', () => {
    const source = apply(SAMPLE, { type: 'add-axis', afterElementId: 'axis:1' })
    expect(source).toContain('axis math["数学"], science["科学"], axis1["新轴"]')
    expect(curveOf(source, 'bob').entriesRaw).toBe(' math: 4, science: 3, axis1: 0 ')
    expect(curveOf(source, 'alice').entriesRaw).toBe(' 1, 2 ')
  })

  it('add-axis：显式 id / label 生效；与已有轴重名被拒', () => {
    const source = apply(SAMPLE, { type: 'add-axis', id: 'art', label: '艺术' })
    expect(source).toContain('art["艺术"]')
    expect(radarParser.resolveRewrites(parse(SAMPLE), { type: 'add-axis', id: 'math' })).toBeNull()
  })

  it('delete-axis：行内首段删除走「后段前移」组合，键值曲线删条目、值列表曲线删位序值', () => {
    const source = apply(SAMPLE, { type: 'delete-axis', elementId: 'axis:1' })
    expect(source).toBe(`radar-beta
    title 技能评估
    axis science["科学"]
    curve alice["Alice"]{ 2 }
    curve bob["Bob"]{ science: 3 }
    max 5
`)
  })

  it('delete-axis：删到曲线 0 条目时整条曲线一并删除（0 条目让 mermaid 崩溃）', () => {
    const source = apply('radar-beta\n    axis a["甲"]\n    curve c{ a: 1 }\n', { type: 'delete-axis', elementId: 'axis:1' })
    expect(source).toBe('radar-beta\n    \n    \n')
    expect(ofKind(parse(source), 'radar-curve')).toHaveLength(0)
  })

  it('delete-axis：值列表曲线按轴声明序删位序值（删第 i 个轴 = 删第 i 个值）', () => {
    const source = apply('radar-beta\n    axis a["甲"], b["乙"], c["丙"]\n    curve list{ 1, 2, 3 }\n', {
      type: 'delete-axis',
      elementId: 'axis:2',
    })
    expect(source).toContain('curve list{ 1, 3 }')
  })

  it('set-axis-id：同步改写键值曲线的引用（值列表曲线按位序不受影响）', () => {
    const source = apply(SAMPLE, { type: 'set-axis-id', elementId: 'axis:1', id: 'm1' })
    expect(source).toContain('axis m1["数学"], science["科学"]')
    expect(curveOf(source, 'bob').entriesRaw).toBe(' m1: 4, science: 3 ')
    expect(curveOf(source, 'alice').entriesRaw).toBe(' 1, 2 ')
  })

  it('set-axis-id：与其他轴重名 / 非法 id 被拒', () => {
    expect(radarParser.resolveRewrites(parse(SAMPLE), { type: 'set-axis-id', elementId: 'axis:1', id: 'science' })).toBeNull()
    expect(radarParser.resolveRewrites(parse(SAMPLE), { type: 'set-axis-id', elementId: 'axis:1', id: 'a b' })).toBeNull()
    expect(radarParser.resolveRewrites(parse(SAMPLE), { type: 'set-axis-id', elementId: 'axis:99', id: 'x' })).toBeNull()
  })

  it('set-axis-label：非空改写（转义落码）/ 空串移除 / 无 label 轴创建', () => {
    expect(apply(SAMPLE, { type: 'set-axis-label', elementId: 'axis:1', label: '代"数' })).toContain('math["代\\"数"]')
    expect(apply(SAMPLE, { type: 'set-axis-label', elementId: 'axis:1', label: '' })).toContain('axis math, science["科学"]')
    expect(apply('radar-beta\n    axis bare\n', { type: 'set-axis-label', elementId: 'axis:1', label: '新' })).toContain('axis bare["新"]')
  })

  it('add-curve：键值形态全轴补值（缺省 0），锚点缺省落文档末尾', () => {
    const source = apply(SAMPLE, { type: 'add-curve', id: 'carol' })
    expect(source.endsWith('    max 5\n    curve carol["新曲线"]{ math: 0, science: 0 }\n')).toBe(true)
  })

  it('add-curve：values 覆盖缺省值；无轴文档被拒（0 条目非法）；与已有曲线重名被拒', () => {
    const source = apply(SAMPLE, { type: 'add-curve', id: 'c', values: { math: '3' }, afterElementId: 'curve:1' })
    expect(curveOf(source, 'c').entriesRaw).toBe(' math: 3, science: 0 ')
    expect(radarParser.resolveRewrites(parse(SAMPLE), { type: 'add-curve', id: 'bob' })).toBeNull()
    expect(radarParser.resolveRewrites(parse('radar-beta\n'), { type: 'add-curve', id: 'c' })).toBeNull()
  })

  it('set-curve-id：只改曲线 id；曲线 id 无引用方，无需级联', () => {
    const source = apply(SAMPLE, { type: 'set-curve-id', elementId: 'curve:1', id: 'alice2' })
    expect(source).toContain('curve alice2["Alice"]{ 1, 2 }')
    expect(radarParser.resolveRewrites(parse(SAMPLE), { type: 'set-curve-id', elementId: 'curve:1', id: 'bob' })).toBeNull()
  })

  it('set-curve-label：非空改写 / 空串移除', () => {
    expect(apply(SAMPLE, { type: 'set-curve-label', elementId: 'curve:1', label: '爱丽丝' })).toContain('alice["爱丽丝"]')
    expect(apply(SAMPLE, { type: 'set-curve-label', elementId: 'curve:1', label: '' })).toContain('curve alice{ 1, 2 }')
  })

  it('set-curve-value：键值形态按引用定点改写（未触碰条目逐字保留）', () => {
    const source = apply(SAMPLE, { type: 'set-curve-value', elementId: 'curve:2', axisId: 'math', value: '9' })
    expect(curveOf(source, 'bob').entriesRaw).toBe(' math: 9, science: 3 ')
  })

  it('set-curve-value：值列表形态按轴声明位定点改写（分隔原文保留）', () => {
    const source = apply(SAMPLE, { type: 'set-curve-value', elementId: 'curve:1', axisId: 'science', value: '7' })
    expect(curveOf(source, 'alice').entriesRaw).toBe(' 1, 7 ')
  })

  it('set-curve-value：负数被拒（radar 无负号）；raw 形态 / 缺条目轴 / 目标不存在被拒', () => {
    expect(radarParser.resolveRewrites(parse(SAMPLE), { type: 'set-curve-value', elementId: 'curve:1', axisId: 'math', value: '-1' })).toBeNull()
    expect(radarParser.resolveRewrites(parse(SAMPLE), { type: 'set-curve-value', elementId: 'curve:1', axisId: 'ghost', value: '1' })).toBeNull()
    expect(radarParser.resolveRewrites(parse(SAMPLE), { type: 'set-curve-value', elementId: 'curve:99', axisId: 'math', value: '1' })).toBeNull()
  })

  it('delete-curve：整行语句删除，行首缩进与换行逐字保留（ADR-0008 手术式改写）', () => {
    const source = apply(SAMPLE, { type: 'delete-curve', elementId: 'curve:1' })
    expect(source).toBe(`radar-beta
    title 技能评估
    axis math["数学"], science["科学"]
    \n    curve bob["Bob"]{ math: 4, science: 3 }
    max 5
`)
  })

  it('set-option-value：max 原地改写；add-axis 追加段带方括号 label', () => {
    expect(apply(SAMPLE, { type: 'set-option-value', elementId: 'option:1', value: '10' })).toContain('max 10')
    const withNewAxis = apply(SAMPLE, { type: 'add-axis', id: 'art', label: '艺术' })
    expect(withNewAxis).toContain('art["艺术"]')
  })

  it('set-option-value：值词法不合 / 目标不存在被拒', () => {
    expect(radarParser.resolveRewrites(parse(SAMPLE), { type: 'set-option-value', elementId: 'option:1', value: '-1' })).toBeNull()
    expect(radarParser.resolveRewrites(parse(SAMPLE), { type: 'set-option-value', elementId: 'option:99', value: '1' })).toBeNull()
  })

  it('set-title：已有标题行原地改（gap 逐字保留）；无标题行紧随声明头插入；空文本 / %% 被拒', () => {
    expect(apply(SAMPLE, { type: 'set-title', text: '新标题' })).toContain('title 新标题')
    expect(apply('radar-beta\n    axis a["甲"]\n', { type: 'set-title', text: '标题' })).toBe('radar-beta\ntitle 标题\n    axis a["甲"]\n')
    expect(radarParser.resolveRewrites(parse(SAMPLE), { type: 'set-title', text: '' })).toBeNull()
    expect(radarParser.resolveRewrites(parse(SAMPLE), { type: 'set-title', text: 'a%%b' })).toBeNull()
  })

  it('编辑后再解析仍 verbatim identity（往返稳定性）', () => {
    const once = apply(SAMPLE, { type: 'add-axis' })
    expect(reassemble(parse(once))).toBe(once)
    const twice = apply(once, { type: 'delete-axis', elementId: 'axis:3' })
    expect(reassemble(parse(twice))).toBe(twice)
  })

  it('清单外意图不接（返回 null）', () => {
    expect(radarParser.resolveRewrites(parse(SAMPLE), { type: 'add-node', nodeId: 'n1' })).toBeNull()
  })
})

describe('金样合法性（模板与编辑产物 mermaid.parse 通过）', () => {
  it('起步模板 parse 通过', async () => {
    await expect(mermaid.parse(RADAR_TEMPLATE)).resolves.toBeTruthy()
  })

  it('编辑链产物全程 parse 通过：加轴 → 改曲线值 → 改网格形态 → 删曲线', async () => {
    const step1 = apply(RADAR_TEMPLATE, { type: 'add-axis', id: 'music', label: '音乐' })
    await expect(mermaid.parse(step1)).resolves.toBeTruthy()
    const step2 = apply(step1, { type: 'set-curve-value', elementId: 'curve:2', axisId: 'math', value: '5' })
    await expect(mermaid.parse(step2)).resolves.toBeTruthy()
    const step3 = apply(step2, { type: 'set-option-value', elementId: 'option:2', value: 'polygon' })
    await expect(mermaid.parse(step3)).resolves.toBeTruthy()
    const step4 = apply(step3, { type: 'delete-curve', elementId: 'curve:1' })
    await expect(mermaid.parse(step4)).resolves.toBeTruthy()
  })

  it('删轴级联产物 parse 通过（级联语义与 mermaid db 的 computeCurveEntries 对齐）', async () => {
    const step1 = apply(RADAR_TEMPLATE, { type: 'delete-axis', elementId: 'axis:1' })
    await expect(mermaid.parse(step1)).resolves.toBeTruthy()
  })
})
