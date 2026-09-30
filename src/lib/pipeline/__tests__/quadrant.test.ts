import { describe, expect, it } from 'vitest'
import {
  isQuadrantCoordinate,
  isValidQuadrantPointText,
  isValidQuadrantSegmentText,
  isValidQuadrantStyleValue,
  isValidQuadrantTitle,
  parseQuadrantCoordinate,
  quadrantParser,
  type QuadrantPointData,
} from '../quadrant'
import { QUADRANT_TEMPLATE } from '../../diagram-registry'
import { reassemble } from '../document'

/**
 * quadrant 解析器测试（more-diagrams 工单 12）：verbatim identity（ADR-0004，含模板）、
 * 解析（声明头 / title / 双段双轴 / quadrant-1..4 / 点行含 ::: 类标注与内联样式段）、
 * 意图往返（加点 / 改文本 / 改坐标 / 逐字段改样式 / 删点 / 改标题 / 改轴段 / 改象限文本）、
 * 错误边界（越界坐标拒绝落码 / 非法样式值拒绝 / 清单外意图不接）。
 *
 * 语法事实（research/data-display.md + mermaid 12 quadrant.jison 实证）：
 * 坐标 token 只有 `1` / `0` / `0.<数字>`；类标注是三冒号 `:::`（词法 rule 27）；
 * classDef 的 fill 等键不被 quadrantDb.parseStyles 支持（模板因此用 color）。
 */

const SAMPLE = `quadrantChart
    title 需求优先级评估
    x-axis 低价值 --> 高价值
    y-axis 低成本 --> 高成本
    quadrant-1 立即去做
    quadrant-2 规划排期
    quadrant-3 重新评估
    quadrant-4 谨慎投入
    Campaign A: [0.3, 0.6]
    Campaign B:::highlight: [0.45, 0.23]
    Campaign C: [0.57, 0.69] radius: 8, color: #ff6b00
    classDef highlight color:#f08c00
`

function parse(source: string) {
  const r = quadrantParser.parse(source)
  if (!r.ok) throw new Error(`解析失败：${r.error.message}`)
  return r.doc
}

/** 应用意图并重组装（返回新源码），意图被拒时抛错 */
function apply(source: string, intent: Parameters<typeof quadrantParser.resolveRewrites>[1]) {
  const doc = parse(source)
  const rewrites = quadrantParser.resolveRewrites(doc, intent)
  if (rewrites === null) throw new Error(`意图被拒绝：${JSON.stringify(intent)}`)
  return reassemble(doc, rewrites)
}

function pointOf(doc: ReturnType<typeof parse>, id: string): QuadrantPointData {
  const part = doc.elements.find((p) => p.id === id)
  if (part === undefined || part.element.kind !== 'quadrant-point') {
    throw new Error(`元素不存在或不是点：${id}`)
  }
  return part.element as QuadrantPointData
}

describe('verbatim identity（ADR-0004）', () => {
  it('样例源码原样重组装（含 ::: 类标注 / 内联样式段 / classDef / 双段轴）', () => {
    expect(reassemble(parse(SAMPLE))).toBe(SAMPLE)
  })

  it('起步模板原样重组装', () => {
    expect(reassemble(parse(QUADRANT_TEMPLATE))).toBe(QUADRANT_TEMPLATE)
  })

  it('frontmatter / 注释 / accTitle / accDescr（含多行）/ 引号点文本逐字保留', () => {
    const source = `---
title: 元数据
config:
  quadrantChart:
    chartWidth: 500
---
quadrantChart
    %% 注释行
    accTitle: 无障碍标题
    accDescr: 单行描述
    accDescr {
        多行描述
        第二行
    }
    "Point, with comma": [0.5, 0.5]
`
    expect(reassemble(parse(source))).toBe(source)
  })
})

describe('解析（工单 12 范围）', () => {
  it('元素 id：位置序 point:N、文档级 x-axis / y-axis / quadrant:1..4（ADR-0012）', () => {
    const doc = parse(SAMPLE)
    expect(doc.elements.map((p) => p.id)).toEqual([
      'quadrant-header',
      'quadrant-title',
      'x-axis',
      'y-axis',
      'quadrant:1',
      'quadrant:2',
      'quadrant:3',
      'quadrant:4',
      'point:1',
      'point:2',
      'point:3',
    ])
  })

  it('轴行：双段（含分隔符两侧空白归 delimRaw）/ 单段 / 行尾注释', () => {
    const doc = parse(SAMPLE)
    expect(doc.elements.find((p) => p.id === 'x-axis')?.element).toMatchObject({
      kind: 'quadrant-axis',
      axis: 'x',
      keyword: 'x-axis',
      first: { quote: '', text: '低价值' },
      second: { quote: '', text: '高价值' },
    })
    const single = parse('quadrantChart\n    x-axis 只有左段\n')
    expect(single.elements.find((p) => p.id === 'x-axis')?.element).toMatchObject({
      first: { text: '只有左段' },
      second: null,
      delimRaw: null,
    })
    const commented = parse('quadrantChart\n    x-axis 左 --> 右 %% 注释\n')
    // `%%` 前的空格是 SPACE token（归右段段文本），注释从 `%%` 起进 tail
    expect(commented.elements.find((p) => p.id === 'x-axis')?.element).toMatchObject({ tail: '%% 注释' })
  })

  it('点行：文本 / ::: 类标注 / 坐标 / 样式条目逐字段解析；位置序按文档序 1 基', () => {
    const doc = parse(SAMPLE)
    expect(pointOf(doc, 'point:1')).toMatchObject({
      text: 'Campaign A',
      quote: '',
      classAnn: null,
      x: '0.3',
      y: '0.6',
      styles: [],
    })
    expect(pointOf(doc, 'point:2')).toMatchObject({
      text: 'Campaign B',
      classAnn: 'highlight',
      x: '0.45',
      y: '0.23',
    })
    const c = pointOf(doc, 'point:3')
    expect(c).toMatchObject({ text: 'Campaign C', x: '0.57', y: '0.69' })
    expect(c.styles.map((e) => e.key)).toEqual(['radius', 'color'])
    // 段首空白归 stylesLead，第 2 条起 raw 自带逗号后的前导空白
    expect(c.styles.map((e) => e.raw)).toEqual(['radius: 8', ' color: #ff6b00'])
  })

  it('引号点文本：内容可含冒号 / 逗号（STR 无转义），::: 类标注在闭引号之后', () => {
    const doc = parse('quadrantChart\n    "A: 冒号":::c1: [0.1, 0.2]\n')
    expect(pointOf(doc, 'point:1')).toMatchObject({ quote: '"', text: 'A: 冒号', classAnn: 'c1' })
  })

  it('引号内 %% 是字面内容不是注释（STR 无注释规则）', () => {
    const doc = parse('quadrantChart\n    "a%%b": [0.1, 0.2]\n')
    expect(pointOf(doc, 'point:1')).toMatchObject({ text: 'a%%b' })
  })

  it('不合文法的行整行不认（逐字保留，不产出幽灵元素）：坐标越界 / 缺坐标 / classDef', () => {
    const source = `quadrantChart
    越界: [1.5, 0.2]
    无坐标: 文本
    classDef known color:#fff
    section 某节
`
    const doc = parse(source)
    expect(doc.elements.map((p) => p.id)).toEqual(['quadrant-header'])
    expect(reassemble(parse(source))).toBe(source)
  })

  it('声明头缺失 / 首行不是 quadrantChart → 解析错误', () => {
    expect(quadrantParser.parse('title 没有')).toMatchObject({ ok: false })
    expect(quadrantParser.parse('')).toMatchObject({ ok: false })
  })
})

describe('校验助手（表单与落码门共用，避免第二份实现）', () => {
  it('parseQuadrantCoordinate：坐标词法只有 1 / 0 / 0.<数字>', () => {
    expect(parseQuadrantCoordinate('1')).toBe(1)
    expect(parseQuadrantCoordinate('0')).toBe(0)
    expect(parseQuadrantCoordinate('0.5')).toBe(0.5)
    expect(parseQuadrantCoordinate('0.25')).toBe(0.25)
    expect(parseQuadrantCoordinate('2')).toBeNull()
    expect(parseQuadrantCoordinate('1.5')).toBeNull()
    expect(parseQuadrantCoordinate('.5')).toBeNull()
    expect(parseQuadrantCoordinate('0.')).toBeNull()
    expect(parseQuadrantCoordinate('-1')).toBeNull()
    expect(parseQuadrantCoordinate('abc')).toBeNull()
    expect(isQuadrantCoordinate('0.5')).toBe(true)
    expect(isQuadrantCoordinate('1.5')).toBe(false)
  })

  it('isValidQuadrantPointText：非空、不含冒号 / 引号 / 方括号 / 尖括号 / %% / -->，不以保留字开头', () => {
    expect(isValidQuadrantPointText('Campaign A')).toBe(true)
    expect(isValidQuadrantPointText('')).toBe(false)
    expect(isValidQuadrantPointText('a:b')).toBe(false)
    expect(isValidQuadrantPointText('a"b')).toBe(false)
    expect(isValidQuadrantPointText('a[b]')).toBe(false)
    expect(isValidQuadrantPointText('a<b')).toBe(false)
    expect(isValidQuadrantPointText('a%%b')).toBe(false)
    expect(isValidQuadrantPointText('a-->b')).toBe(false)
    expect(isValidQuadrantPointText('x-axis 伪装')).toBe(false)
    expect(isValidQuadrantPointText('quadrant-1 伪装')).toBe(false)
    expect(isValidQuadrantPointText('X-Axis 轴')).toBe(false)
  })

  it('isValidQuadrantSegmentText：非空、不含冒号 / 引号 / 方括号 / --> / %%', () => {
    expect(isValidQuadrantSegmentText('低价值')).toBe(true)
    expect(isValidQuadrantSegmentText('')).toBe(false)
    expect(isValidQuadrantSegmentText('a:b')).toBe(false)
    expect(isValidQuadrantSegmentText('a"b')).toBe(false)
    expect(isValidQuadrantSegmentText('a-->b')).toBe(false)
    expect(isValidQuadrantSegmentText('a%%b')).toBe(false)
  })

  it('isValidQuadrantStyleValue：与 mermaid validateHexCode / validateNumber / validateSizeInPixels 同源', () => {
    expect(isValidQuadrantStyleValue('color', '#ff3300')).toBe(true)
    expect(isValidQuadrantStyleValue('color', 'ff3300')).toBe(true)
    expect(isValidQuadrantStyleValue('color', '#f30')).toBe(true)
    expect(isValidQuadrantStyleValue('color', 'blue')).toBe(false)
    expect(isValidQuadrantStyleValue('color', '#12345')).toBe(false)
    expect(isValidQuadrantStyleValue('radius', '10')).toBe(true)
    expect(isValidQuadrantStyleValue('radius', '10px')).toBe(false)
    expect(isValidQuadrantStyleValue('stroke-color', '#00ff0f')).toBe(true)
    expect(isValidQuadrantStyleValue('stroke-width', '5px')).toBe(true)
    expect(isValidQuadrantStyleValue('stroke-width', '5')).toBe(false)
  })

  it('isValidQuadrantTitle：非空、不含换行与 %%', () => {
    expect(isValidQuadrantTitle('需求优先级')).toBe(true)
    expect(isValidQuadrantTitle('')).toBe(false)
    expect(isValidQuadrantTitle('a%%b')).toBe(false)
  })
})

describe('意图往返（编辑 → 落码 → 再解析）', () => {
  it('add-point：缺省锚点追加在文档末尾（classDef 行之前——最后一个元素之后），缩进跟随', () => {
    const source = apply(SAMPLE, { type: 'add-point', text: '新点', x: '0.5', y: '0.5' })
    expect(source).toContain('Campaign C: [0.57, 0.69] radius: 8, color: #ff6b00\n    新点: [0.5, 0.5]')
    const doc = parse(source)
    expect(pointOf(doc, 'point:4')).toMatchObject({ text: '新点', x: '0.5', y: '0.5' })
  })

  it('add-point 带锚点：落在锚点行之后', () => {
    const source = apply(SAMPLE, {
      type: 'add-point',
      text: '第二位',
      x: '0.2',
      y: '0.8',
      afterElementId: 'point:1',
    })
    expect(source).toContain('Campaign A: [0.3, 0.6]\n    第二位: [0.2, 0.8]\n    Campaign B')
  })

  it('set-point-text：只改文本，类标注 / 坐标 / 样式段逐字保留；引号形态沿用', () => {
    const source = apply(SAMPLE, { type: 'set-point-text', elementId: 'point:3', text: '重点项' })
    expect(source).toContain('重点项: [0.57, 0.69] radius: 8, color: #ff6b00')
    const quoted = apply('quadrantChart\n    "旧名": [0.1, 0.2]\n', {
      type: 'set-point-text',
      elementId: 'point:1',
      text: '新名',
    })
    expect(quoted).toContain('"新名": [0.1, 0.2]')
  })

  it('set-point-coords：只改坐标，文本 / 样式段逐字保留', () => {
    const source = apply(SAMPLE, { type: 'set-point-coords', elementId: 'point:1', x: '0.9', y: '0' })
    expect(source).toContain('Campaign A: [0.9, 0]')
    expect(source).toContain('Campaign C: [0.57, 0.69] radius: 8, color: #ff6b00')
  })

  it('set-point-style 新增字段：追加在样式段末尾；样式段为空时落一个空格起步', () => {
    const added = apply(SAMPLE, { type: 'set-point-style', elementId: 'point:1', field: 'radius', value: '12' })
    expect(added).toContain('Campaign A: [0.3, 0.6] radius: 12')
    const second = apply(SAMPLE, { type: 'set-point-style', elementId: 'point:1', field: 'stroke-width', value: '3px' })
    expect(second).toContain('Campaign A: [0.3, 0.6] stroke-width: 3px')
  })

  it('set-point-style 改已有字段：只重写目标条目，未触碰条目（含未知键）逐字保留', () => {
    const source = apply(SAMPLE, { type: 'set-point-style', elementId: 'point:3', field: 'radius', value: '20' })
    expect(source).toContain('Campaign C: [0.57, 0.69] radius: 20, color: #ff6b00')
    const unknown = parse('quadrantChart\n    P: [0.1, 0.2] fill: #abc, radius: 4\n')
    const rewrites = quadrantParser.resolveRewrites(unknown, {
      type: 'set-point-style',
      elementId: 'point:1',
      field: 'radius',
      value: '9',
    })
    expect(reassemble(unknown, rewrites!)).toContain('fill: #abc, radius: 9')
  })

  it('set-point-style 删除字段：value = null；首条目删除时后继条目前导空白规范化', () => {
    const source = apply(SAMPLE, { type: 'set-point-style', elementId: 'point:3', field: 'radius', value: null })
    expect(source).toContain('Campaign C: [0.57, 0.69] color: #ff6b00')
    const removed = apply(SAMPLE, { type: 'set-point-style', elementId: 'point:3', field: 'color', value: null })
    expect(removed).toContain('Campaign C: [0.57, 0.69] radius: 8')
    // 字段不存在时删除返回 null（无可做之事）
    expect(
      quadrantParser.resolveRewrites(parse(SAMPLE), {
        type: 'set-point-style',
        elementId: 'point:1',
        field: 'radius',
        value: null,
      }),
    ).toBeNull()
  })

  it('delete-point：语句行移除，其余行逐字保留', () => {
    const source = apply(SAMPLE, { type: 'delete-point', elementId: 'point:2' })
    expect(source).not.toContain('Campaign B')
    expect(source).toContain('Campaign A: [0.3, 0.6]')
    expect(source).toContain('Campaign C: [0.57, 0.69] radius: 8, color: #ff6b00')
    expect(source).toContain('classDef highlight color:#f08c00')
  })

  it('set-title：已有标题行原地改（gap 沿用）；无标题行时紧随声明头插入', () => {
    const renamed = apply(SAMPLE, { type: 'set-title', text: '新标题' })
    expect(renamed).toContain('title 新标题')
    const added = apply('quadrantChart\n    P: [0.1, 0.2]\n', { type: 'set-title', text: '标题' })
    expect(added).toContain('quadrantChart\ntitle 标题\n    P: [0.1, 0.2]')
  })

  it('set-axis：改左段 / 右段；悬空分隔符填充右段；单段行升级为双段', () => {
    const first = apply(SAMPLE, { type: 'set-axis', axis: 'x', segment: 'first', text: '便宜' })
    expect(first).toContain('x-axis 便宜 --> 高价值')
    const second = apply(SAMPLE, { type: 'set-axis', axis: 'y', segment: 'second', text: '昂贵' })
    expect(second).toContain('y-axis 低成本 --> 昂贵')
    const dangling = apply('quadrantChart\n    x-axis 左 -->\n', {
      type: 'set-axis',
      axis: 'x',
      segment: 'second',
      text: '右',
    })
    // delimRaw（` -->`，含左段尾随空白）逐字保留——落码 `-->右` 仍是合法词法（段文本可紧贴分隔符）
    expect(dangling).toContain('x-axis 左 -->右')
    const upgraded = apply('quadrantChart\n    x-axis 只有左段\n', {
      type: 'set-axis',
      axis: 'x',
      segment: 'second',
      text: '新右段',
    })
    expect(upgraded).toContain('x-axis 只有左段 --> 新右段')
  })

  it('set-quadrant-text：改象限标题（elementId = quadrant:N）', () => {
    const source = apply(SAMPLE, { type: 'set-quadrant-text', elementId: 'quadrant:2', text: '排期跟进' })
    expect(source).toContain('quadrant-2 排期跟进')
  })

  it('编辑后再解析仍 verbatim identity（往返稳定性，含样式改写后的行）', () => {
    const once = apply(SAMPLE, { type: 'set-point-style', elementId: 'point:3', field: 'stroke-color', value: '#0f0' })
    expect(reassemble(parse(once))).toBe(once)
  })
})

describe('错误边界（绝不产出非法 mermaid）', () => {
  it('坐标越界 / 畸形拒绝落码（工单定案：源码始终合法）', () => {
    expect(
      quadrantParser.resolveRewrites(parse(SAMPLE), { type: 'add-point', text: 'x', x: '1.5', y: '0.5' }),
    ).toBeNull()
    expect(
      quadrantParser.resolveRewrites(parse(SAMPLE), { type: 'add-point', text: 'x', x: '2', y: '0.5' }),
    ).toBeNull()
    expect(
      quadrantParser.resolveRewrites(parse(SAMPLE), { type: 'add-point', text: 'x', x: '.5', y: '0.5' }),
    ).toBeNull()
    expect(
      quadrantParser.resolveRewrites(parse(SAMPLE), { type: 'set-point-coords', elementId: 'point:1', x: '1.2', y: '0.5' }),
    ).toBeNull()
  })

  it('点文本含冒号 / 引号 / 方括号 / 保留字开头被拒', () => {
    for (const text of ['a:b', 'a"b', 'a[b]', 'x-axis 假', '']) {
      expect(
        quadrantParser.resolveRewrites(parse(SAMPLE), { type: 'add-point', text, x: '0.5', y: '0.5' }),
      ).toBeNull()
    }
  })

  it('非法样式值被拒（mermaid parseStyles 对非法值抛错）', () => {
    expect(
      quadrantParser.resolveRewrites(parse(SAMPLE), {
        type: 'set-point-style',
        elementId: 'point:1',
        field: 'color',
        value: 'not-a-color',
      }),
    ).toBeNull()
    expect(
      quadrantParser.resolveRewrites(parse(SAMPLE), {
        type: 'set-point-style',
        elementId: 'point:1',
        field: 'stroke-width',
        value: '5',
      }),
    ).toBeNull()
  })

  it('轴段 / 象限文本清空或非法字符被拒；目标不存在返回 null', () => {
    expect(
      quadrantParser.resolveRewrites(parse(SAMPLE), { type: 'set-axis', axis: 'x', segment: 'first', text: '' }),
    ).toBeNull()
    expect(
      quadrantParser.resolveRewrites(parse(SAMPLE), { type: 'set-quadrant-text', elementId: 'quadrant:9', text: 'x' }),
    ).toBeNull()
    expect(
      quadrantParser.resolveRewrites(parse(SAMPLE), { type: 'set-point-text', elementId: 'point:99', text: 'x' }),
    ).toBeNull()
    expect(
      quadrantParser.resolveRewrites(parse(SAMPLE), { type: 'delete-point', elementId: 'point:99' }),
    ).toBeNull()
  })

  it('清单外意图不接（返回 null）', () => {
    expect(
      quadrantParser.resolveRewrites(parse(SAMPLE), { type: 'add-node', nodeId: 'n1' }),
    ).toBeNull()
  })
})
