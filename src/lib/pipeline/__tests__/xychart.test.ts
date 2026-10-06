import { describe, expect, it } from 'vitest'
import {
  decodeXychartText,
  encodeXychartText,
  isValidXychartNumberInput,
  isValidXychartText,
  parseXychartNumber,
  renderXychartArray,
  xychartParser,
  type XychartIntent,
  type XychartSeriesData,
} from '../xychart'
import { reassemble } from '../document'
import { buildXychartProjection, resolveXychartSelection } from '../../projection/xychart-projection'
import { xychartDeleteIntent, xychartKeyPlan } from '../../pipeline/xychart-keyboard'
import { annotateNodeDataIds } from '../../canvas-selection/node-data-ids'
import { annotateXychartIdentities } from '../../canvas-selection/edge-locate'
import { DIAGRAM_TYPES } from '../../diagram-registry'

/**
 * xychart 解析器测试（more-diagrams 工单 14，ADR-0004/0008）：
 * 覆盖声明头（双关键字 / 方向修饰符）、title 引号规则、轴两形态（类别数组 / 数值
 * range）、系列（带名/未命名、负数/小数/无前导零、点标签不展开）、token 级数组编辑
 * （原字面格式保留、未触碰 token 逐字回写）、落码门与投影派生。
 * 金样合法性（模板与端到端场景过 mermaid.parse）见 golden-validity.test.ts。
 */

const TEMPLATE = `xychart-beta
    title "季度销售趋势"
    x-axis ["一季度", "二季度", "三季度"]
    y-axis "销售额" 0 --> 400
    bar [200, 350, 150]
    line "均线" [150, 250, 300]
`

function parseOk(source: string) {
  const parsed = xychartParser.parse(source)
  if (!parsed.ok) throw new Error(`解析失败（${parsed.error.line}）：${parsed.error.message}`)
  return parsed.doc
}

function apply(source: string, intent: XychartIntent): string | null {
  const doc = parseOk(source)
  const rewrites = xychartParser.resolveRewrites(doc, intent)
  if (rewrites === null) return null
  return reassemble(doc, rewrites)
}

function seriesOf(source: string, elementId: string): XychartSeriesData {
  const part = parseOk(source).elements.find((p) => p.id === elementId)
  if (part === undefined || part.element.kind !== 'xychart-series') {
    throw new Error(`元素不存在或不是系列：${elementId}`)
  }
  return part.element as XychartSeriesData
}

// ---------- 词法助手 ----------

describe('文本编解码与落码门', () => {
  it('编码：词形 ASCII 裸写，其余（空格/中文/数字开头）引号包裹', () => {
    expect(encodeXychartText('Sales')).toBe('Sales')
    expect(encodeXychartText('销 售')).toBe('"销 售"')
    expect(encodeXychartText('2020')).toBe('"2020"')
    expect(encodeXychartText('a-b_c')).toBe('a-b_c')
  })

  it('解码：引号包裹取引号内文，裸词原样', () => {
    expect(decodeXychartText('"销 售"')).toBe('销 售')
    expect(decodeXychartText('Sales')).toBe('Sales')
  })

  it('文本落码门：非空、无引号、无换行、无 %%', () => {
    expect(isValidXychartText('ok')).toBe(true)
    expect(isValidXychartText('中文')).toBe(true) // 落码时引号包裹承载
    expect(isValidXychartText('')).toBe(false)
    expect(isValidXychartText('  ')).toBe(false)
    expect(isValidXychartText('a"b')).toBe(false) // STR 无转义，引号会提前闭合
    expect(isValidXychartText('a\nb')).toBe(false) // 单行语法
    expect(isValidXychartText('a%%b')).toBe(false) // TEXT token 在 %% 处被当注释截断
  })

  it('数值词法（jison 口径）：负号/小数/无前导零的 .98 合法', () => {
    expect(parseXychartNumber('45')).toBe(45)
    expect(parseXychartNumber('-5.5')).toBe(-5.5)
    expect(parseXychartNumber('+5')).toBe(5)
    expect(parseXychartNumber('.98')).toBe(0.98)
    expect(parseXychartNumber('1.2.3')).toBeNull()
    expect(parseXychartNumber('abc')).toBeNull()
    expect(parseXychartNumber('')).toBeNull()
  })

  it('表单数值落码口径：严格词法（不产出生僻的 + 前缀形态），字面格式保留', () => {
    expect(isValidXychartNumberInput('45')).toBe(true)
    expect(isValidXychartNumberInput('-5.5')).toBe(true)
    expect(isValidXychartNumberInput('.98')).toBe(true)
    expect(isValidXychartNumberInput(' 12 ')).toBe(true) // 表单输入 trim 后判定
    expect(isValidXychartNumberInput('+5')).toBe(false)
    expect(isValidXychartNumberInput('1.2.3')).toBe(false)
  })
})

// ---------- 解析 ----------

describe('xychart 解析：verbatim identity 与声明头', () => {
  it('模板解析 + 原样重组装逐字相同（verbatim identity）', () => {
    expect(reassemble(parseOk(TEMPLATE))).toBe(TEMPLATE)
  })

  it('元素按文档序编号：标题/轴固定 id，系列位置序 series:N', () => {
    expect(parseOk(TEMPLATE).elements.map((p) => p.id)).toEqual([
      'xychart-header',
      'xychart-title',
      'xychart-x-axis',
      'xychart-y-axis',
      'series:1',
      'series:2',
    ])
  })

  it('xychart / xychart-beta 两关键字同认（大小写不敏感）+ 方向修饰符独立词', () => {
    expect(() => parseOk('xychart\nbar [1]\n')).not.toThrow()
    expect(() => parseOk('XYCHART-BETA\nbar [1]\n')).not.toThrow()
    const h = parseOk('xychart horizontal\nbar [1]\n').elements[0]
    expect(h.element).toMatchObject({ kind: 'xychart-header', keyword: 'xychart', orientation: 'horizontal', gap: ' ' })
    expect(parseOk('xychart-beta vertical\n').elements[0].element).toMatchObject({
      kind: 'xychart-header',
      keyword: 'xychart-beta',
      orientation: 'vertical',
    })
    // 声明行带别的内容 / 非声明开头 → 解析错误
    expect(xychartParser.parse('xychart-beta extra\n').ok).toBe(false)
    const err = xychartParser.parse('flowchart TD\nA-->B')
    expect(err.ok).toBe(false)
    expect(err.ok === false && err.error.line).toBe(1)
  })

  it('frontmatter（含 xyChart config）与 %% 注释 / accTitle 整块逐字保留（不做编辑）', () => {
    const src = [
      '---',
      'config:',
      '  xyChart:',
      '    width: 900',
      '---',
      'xychart-beta',
      '%% 渲染备注',
      'accTitle 无障碍标题',
      'bar [1, 2]',
      '',
    ].join('\n')
    const doc = parseOk(src)
    expect(doc.elements.map((p) => p.id)).toEqual(['xychart-header', 'series:1'])
    expect(reassemble(doc)).toBe(src)
  })

  it('\\r\\n 文件兼容：\\r 属于换行符，系列/轴行照常成元素且原文逐字保留', () => {
    const src = 'xychart-beta\r\ny-axis 0 --> 10\r\nbar [1, 2]\r\n'
    const doc = parseOk(src)
    expect(doc.elements.map((p) => p.id)).toEqual(['xychart-header', 'xychart-y-axis', 'series:1'])
    expect(seriesOf(src, 'series:1').arrayRaw).toBe('[1, 2]')
    expect(reassemble(doc)).toBe(src)
  })

  it('行尾 %% 注释随系列逐字保留', () => {
    const src = 'xychart-beta\nbar [1, 2] %% 上半年\n'
    expect(seriesOf(src, 'series:1').tail).toBe(' %% 上半年')
    expect(reassemble(parseOk(src))).toBe(src)
  })
})

describe('xychart 解析：title 与轴两形态', () => {
  it('title 引号/裸词两形态；空标题行不成元素（逐字保留）', () => {
    const q = parseOk('xychart-beta\n    title "季度销售"\nbar [1]\n')
    expect(q.elements[1].element).toMatchObject({ kind: 'xychart-title', gap: ' ', textRaw: '"季度销售"' })
    const bare = parseOk('xychart-beta\ntitle Sales\nbar [1]\n')
    expect(bare.elements[1].element).toMatchObject({ kind: 'xychart-title', textRaw: 'Sales' })
    expect(parseOk('xychart-beta\ntitle \nbar [1]\n').elements.map((p) => p.id)).toEqual([
      'xychart-header',
      'series:1',
    ])
  })

  it('轴：数值 range 形态（带/不带标题）', () => {
    const withTitle = parseOk(TEMPLATE).elements.find((p) => p.id === 'xychart-y-axis')!
    expect(withTitle.element).toMatchObject({ axis: 'y', titleRaw: '"销售额"', sep: ' ', restRaw: '0 --> 400' })
    const noTitle = parseOk('xychart-beta\ny-axis 0 --> 100\nbar [1]\n').elements[1]
    expect(noTitle.element).toMatchObject({ kind: 'xychart-axis', axis: 'y', titleRaw: null, restRaw: '0 --> 100' })
  })

  it('轴：类别数组形态（带/不带标题）；引号类别含逗号不切分', () => {
    const noTitle = parseOk(TEMPLATE).elements.find((p) => p.id === 'xychart-x-axis')!
    expect(noTitle.element).toMatchObject({ axis: 'x', titleRaw: null, restRaw: '["一季度", "二季度", "三季度"]' })
    const withTitle = parseOk('xychart-beta\nx-axis 季度 [a, "b, c"]\nbar [1]\n').elements[1]
    expect(withTitle.element).toMatchObject({ axis: 'x', titleRaw: '季度', sep: ' ', restRaw: '[a, "b, c"]' })
  })

  it('轴：只有标题段的形态（无后半段）', () => {
    const doc = parseOk('xychart-beta\nx-axis 时间\ny-axis "金额"\nbar [1]\n')
    expect(doc.elements[1].element).toMatchObject({ kind: 'xychart-axis', axis: 'x', titleRaw: '时间', restRaw: null })
    expect(doc.elements[2].element).toMatchObject({ kind: 'xychart-axis', axis: 'y', titleRaw: '"金额"', restRaw: null })
  })

  it('畸形轴行（引号不闭合 / 数组不闭合 / range 非数值）逐字保留、不成元素', () => {
    const doc = parseOk('xychart-beta\nx-axis "unclosed\nx-axis [a, b\ny-axis 0 --> abc\nbar [1]\n')
    expect(doc.elements.map((p) => p.id)).toEqual(['xychart-header', 'series:1'])
    expect(reassemble(doc)).toBe('xychart-beta\nx-axis "unclosed\nx-axis [a, b\ny-axis 0 --> abc\nbar [1]\n')
  })
})

describe('xychart 解析：系列词法', () => {
  it('未命名 / 裸词名 / 引号名（含空格）三形态', () => {
    expect(seriesOf('xychart-beta\nbar [1]\n', 'series:1')).toMatchObject({
      seriesType: 'bar',
      nameRaw: null,
      arrayRaw: '[1]',
    })
    expect(seriesOf('xychart-beta\nline sales [1]\n', 'series:1')).toMatchObject({
      seriesType: 'line',
      nameRaw: 'sales',
      gap2: ' ',
    })
    expect(seriesOf('xychart-beta\nline "my series" [1, 2]\n', 'series:1')).toMatchObject({
      seriesType: 'line',
      nameRaw: '"my series"',
    })
  })

  it('数值词法：负数 / 小数 / 无前导零的 .98 原文逐字保留', () => {
    const src = 'xychart-beta\nbar [-1, 2.5, .98]\n'
    expect(seriesOf(src, 'series:1').arrayRaw).toBe('[-1, 2.5, .98]')
    expect(reassemble(parseOk(src))).toBe(src)
  })

  it('v11.16 点标签系列：解析保留原文（不在表单展开——投影 editable=false）', () => {
    const src = 'xychart-beta\nline [1 "a", 2]\n'
    expect(seriesOf(src, 'series:1').arrayRaw).toBe('[1 "a", 2]')
    expect(reassemble(parseOk(src))).toBe(src)
  })

  it('畸形系列（空数组 / ] 后跟别的 token / 引号不闭合 / 非数值裸 token / line 后无空白）逐字保留', () => {
    const src = 'xychart-beta\nline []\nline [1] junk\nline "unclosed [1]\nline [abc]\nline[1]\nbar [1]\n'
    const doc = parseOk(src)
    expect(doc.elements.map((p) => p.id)).toEqual(['xychart-header', 'series:1'])
    expect(reassemble(doc)).toBe(src)
  })
})

// ---------- 意图落地：系列 ----------

describe('add-series：落码门与锚点', () => {
  it('缺省锚点 = 文档末尾（锚点行的行尾换行逐字保留）', () => {
    const next = apply(TEMPLATE, { type: 'add-series', seriesType: 'bar', name: null, values: ['10'] })
    expect(next?.endsWith('    line "均线" [150, 250, 300]\n    bar [10]\n')).toBe(true)
  })

  it('带名系列：中文自动引号包裹；指定锚点 = 插在该系列行后', () => {
    const next = apply(TEMPLATE, {
      type: 'add-series',
      seriesType: 'line',
      name: '新 系列',
      values: ['1.5'],
      afterElementId: 'series:1',
    })
    expect(next).toContain('    bar [200, 350, 150]\n    line "新 系列" [1.5]\n    line "均线"')
  })

  it('数值字面格式保留（45 不写 45.0）；负数/小数放行', () => {
    const next = apply(TEMPLATE, { type: 'add-series', seriesType: 'bar', name: null, values: ['45', '-2.5', '.5'] })
    expect(next?.endsWith('    bar [45, -2.5, .5]\n')).toBe(true)
  })

  it('落码门拒绝：空 values、非法数值、含引号名字（绝不产出非法 mermaid）', () => {
    expect(apply(TEMPLATE, { type: 'add-series', seriesType: 'bar', name: null, values: [] })).toBeNull()
    expect(apply(TEMPLATE, { type: 'add-series', seriesType: 'bar', name: null, values: ['abc'] })).toBeNull()
    expect(apply(TEMPLATE, { type: 'add-series', seriesType: 'bar', name: null, values: ['+5'] })).toBeNull()
    expect(apply(TEMPLATE, { type: 'add-series', seriesType: 'bar', name: 'a"b', values: ['1'] })).toBeNull()
  })

  it('空白文档（只有声明头）也能加系列：锚点回退到头', () => {
    const next = apply('xychart-beta\n', { type: 'add-series', seriesType: 'bar', name: null, values: ['1'] })
    expect(next).toBe('xychart-beta\nbar [1]\n')
  })
})

describe('set-series-name / set-series-type：手术改写', () => {
  it('改名为裸词 ASCII / 引号包裹中文；数组与类型逐字保留', () => {
    expect(apply(TEMPLATE, { type: 'set-series-name', elementId: 'series:2', name: 'sales' })).toContain(
      'line sales [150, 250, 300]',
    )
    expect(apply(TEMPLATE, { type: 'set-series-name', elementId: 'series:2', name: '销 售' })).toContain(
      'line "销 售" [150, 250, 300]',
    )
  })

  it('去名（null）变未命名系列；本就未命名 → no-op 拒绝', () => {
    expect(apply(TEMPLATE, { type: 'set-series-name', elementId: 'series:2', name: null })).toContain(
      'line [150, 250, 300]',
    )
    expect(apply(TEMPLATE, { type: 'set-series-name', elementId: 'series:1', name: null })).toBeNull()
  })

  it('落码门：空名 / 含引号名字 / 未知系列拒绝', () => {
    expect(apply(TEMPLATE, { type: 'set-series-name', elementId: 'series:1', name: '' })).toBeNull()
    expect(apply(TEMPLATE, { type: 'set-series-name', elementId: 'series:1', name: 'a"b' })).toBeNull()
    expect(apply(TEMPLATE, { type: 'set-series-name', elementId: 'series:99', name: 'x' })).toBeNull()
  })

  it('改类型只换关键字，名字与数组逐字保留；同类型 no-op 拒绝', () => {
    expect(apply(TEMPLATE, { type: 'set-series-type', elementId: 'series:1', seriesType: 'line' })).toContain(
      'line [200, 350, 150]',
    )
    expect(apply(TEMPLATE, { type: 'set-series-type', elementId: 'series:2', seriesType: 'line' })).toBeNull()
  })
})

describe('系列数组编辑：token 级手术改写（原字面格式与未触碰 token 逐字保留）', () => {
  it('set-series-value：只换目标 token，分隔原文与相邻 token 不动', () => {
    expect(apply(TEMPLATE, { type: 'set-series-value', elementId: 'series:1', index: 1, value: '-5.5' })).toContain(
      'bar [200, -5.5, 150]',
    )
    // 字面格式保留：45 落 45 而非 45.0
    expect(apply(TEMPLATE, { type: 'set-series-value', elementId: 'series:1', index: 0, value: '45' })).toContain(
      'bar [45, 350, 150]',
    )
  })

  it('set-series-value 拒绝：非法数值 / 越界 / 点标签系列（工单定案不展开）', () => {
    expect(apply(TEMPLATE, { type: 'set-series-value', elementId: 'series:1', index: 0, value: 'abc' })).toBeNull()
    expect(apply(TEMPLATE, { type: 'set-series-value', elementId: 'series:1', index: 3, value: '1' })).toBeNull()
    expect(apply(TEMPLATE, { type: 'set-series-value', elementId: 'series:99', index: 0, value: '1' })).toBeNull()
    expect(apply('xychart-beta\nline [1 "a"]\n', { type: 'set-series-value', elementId: 'series:1', index: 0, value: '5' })).toBeNull()
  })

  it('add-series-value：分隔沿用最后一个条目的风格（含逗号 → `, `，纯空白 → 空格）', () => {
    expect(apply(TEMPLATE, { type: 'add-series-value', elementId: 'series:1', value: '12' })).toContain(
      'bar [200, 350, 150, 12]',
    )
    expect(apply('xychart-beta\nbar [200 350]\n', { type: 'add-series-value', elementId: 'series:1', value: '12' })).toBe(
      'xychart-beta\nbar [200 350 12]\n',
    )
  })

  it('add-series-value：数组尾部悬挂分隔原文回收为新增条目的 lead（不产出双逗号）', () => {
    expect(apply('xychart-beta\nbar [200, ]\n', { type: 'add-series-value', elementId: 'series:1', value: '12' })).toBe(
      'xychart-beta\nbar [200, 12]\n',
    )
  })

  it('delete-series-value：与前驱之间的分隔顶替后继条目原 lead——删中项/首项/末项都不产出双逗号或前导逗号', () => {
    expect(apply(TEMPLATE, { type: 'delete-series-value', elementId: 'series:1', index: 1 })).toContain('bar [200, 150]')
    expect(apply(TEMPLATE, { type: 'delete-series-value', elementId: 'series:1', index: 0 })).toContain('bar [350, 150]')
    expect(apply(TEMPLATE, { type: 'delete-series-value', elementId: 'series:1', index: 2 })).toContain('bar [200, 350]')
    // 空白分隔风格同样成立
    expect(apply('xychart-beta\nbar [200 350]\n', { type: 'delete-series-value', elementId: 'series:1', index: 0 })).toBe(
      'xychart-beta\nbar [350]\n',
    )
  })

  it('delete-series-value 拒绝：越界 / 仅剩一个数值 / 点标签系列', () => {
    expect(apply(TEMPLATE, { type: 'delete-series-value', elementId: 'series:1', index: 3 })).toBeNull()
    expect(apply('xychart-beta\nbar [1]\n', { type: 'delete-series-value', elementId: 'series:1', index: 0 })).toBeNull()
    expect(apply('xychart-beta\nline [1 "a"]\n', { type: 'delete-series-value', elementId: 'series:1', index: 0 })).toBeNull()
  })

  it('数组尾部悬挂分隔在 token 级改写时逐字保留（ADR-0004）', () => {
    expect(apply('xychart-beta\nbar [200, 350, ]\n', { type: 'set-series-value', elementId: 'series:1', index: 0, value: '5' })).toBe(
      'xychart-beta\nbar [5, 350, ]\n',
    )
    // 轴类别同理（含裸 token 尾部空白原位保留）
    expect(
      apply('xychart-beta\nx-axis [a , b]\n', { type: 'set-axis-category', index: 1, text: 'c' }),
    ).toBe('xychart-beta\nx-axis [a , c]\n')
  })

  it('delete-series：整行移除（其余行逐字保留，重组装可再解析）', () => {
    const next = apply(TEMPLATE, { type: 'delete-series', elementId: 'series:1' })
    expect(next).not.toContain('bar [200')
    expect(next).toContain('line "均线" [150, 250, 300]')
    expect(reassemble(parseOk(next as string))).toBe(next)
    expect(apply(TEMPLATE, { type: 'delete-series', elementId: 'series:99' })).toBeNull()
  })
})

// ---------- 意图落地：标题与轴 ----------

describe('set-title：原地改写或紧随声明头插入', () => {
  it('已有标题行：原地替换（缩进与换行不动），非 ASCII 引号包裹', () => {
    expect(apply(TEMPLATE, { type: 'set-title', text: '新标题' })).toContain('    title "新标题"')
    expect(apply(TEMPLATE, { type: 'set-title', text: 'Sales' })).toContain('    title Sales')
  })

  it('无标题行：紧随声明头插入一行', () => {
    const next = apply('xychart-beta\nbar [1]\n', { type: 'set-title', text: '销量' })
    expect(next).toBe('xychart-beta\ntitle "销量"\nbar [1]\n')
  })

  it('落码门拒绝：空标题 / 含引号 / 含 %%', () => {
    expect(apply(TEMPLATE, { type: 'set-title', text: '' })).toBeNull()
    expect(apply(TEMPLATE, { type: 'set-title', text: 'a"b' })).toBeNull()
    expect(apply(TEMPLATE, { type: 'set-title', text: 'a%%b' })).toBeNull()
  })
})

describe('轴意图：标题 / 类别 / range / 形态转换', () => {
  it('set-axis-title：range 形态原地改（非 ASCII 引号包裹）；与原标题相同 → no-op 拒绝', () => {
    expect(apply(TEMPLATE, { type: 'set-axis-title', axis: 'y', title: '金额' })).toContain('y-axis "金额" 0 --> 400')
    expect(apply(TEMPLATE, { type: 'set-axis-title', axis: 'y', title: '销售额' })).toBeNull()
  })

  it('set-axis-title：原本无标题段的轴补标题时补一个分隔空格（非 ASCII 引号包裹，绝不产出 `x-axis 时间[...]`）', () => {
    expect(apply(TEMPLATE, { type: 'set-axis-title', axis: 'x', title: '时间' })).toContain(
      'x-axis "时间" ["一季度", "二季度", "三季度"]',
    )
  })

  it('set-axis-range：y 轴原地改（字面格式保留）；x 轴类别形态直接转换为 range 形态', () => {
    expect(apply(TEMPLATE, { type: 'set-axis-range', axis: 'y', min: '0', max: '100' })).toContain('y-axis "销售额" 0 --> 100')
    expect(apply(TEMPLATE, { type: 'set-axis-range', axis: 'x', min: '0', max: '100' })).toContain('x-axis 0 --> 100')
  })

  it('set-axis-range / set-axis-title 落码门拒绝：非法数值 / 非法文本 / 未知轴', () => {
    expect(apply(TEMPLATE, { type: 'set-axis-range', axis: 'y', min: 'abc', max: '10' })).toBeNull()
    expect(apply(TEMPLATE, { type: 'set-axis-title', axis: 'y', title: '' })).toBeNull()
    expect(apply(TEMPLATE, { type: 'set-axis-title', axis: 'y', title: 'a%%b' })).toBeNull()
  })

  it('add-axis-category：类别形态追加（引号包裹中文）；range 形态转换为单类别数组', () => {
    expect(apply(TEMPLATE, { type: 'add-axis-category', text: '四季度' })).toContain(
      'x-axis ["一季度", "二季度", "三季度", "四季度"]',
    )
    expect(apply('xychart-beta\nx-axis 2020 --> 2030\nbar [1]\n', { type: 'add-axis-category', text: '一季度' })).toBe(
      'xychart-beta\nx-axis ["一季度"]\nbar [1]\n',
    )
  })

  it('set-axis-category：token 级改写，未触碰类别逐字保留；裸词合法时落裸写', () => {
    expect(apply(TEMPLATE, { type: 'set-axis-category', index: 1, text: 'Q2' })).toContain('x-axis ["一季度", Q2, "三季度"]')
    expect(apply(TEMPLATE, { type: 'set-axis-category', index: 1, text: '二 季度' })).toContain(
      'x-axis ["一季度", "二 季度", "三季度"]',
    )
  })

  it('delete-axis-category：删中项/首项不产出双逗号或前导逗号；仅剩一个不可删', () => {
    expect(apply(TEMPLATE, { type: 'delete-axis-category', index: 1 })).toContain('x-axis ["一季度", "三季度"]')
    expect(apply(TEMPLATE, { type: 'delete-axis-category', index: 0 })).toContain('x-axis ["二季度", "三季度"]')
    expect(apply('xychart-beta\nx-axis [a]\nbar [1]\n', { type: 'delete-axis-category', index: 0 })).toBeNull()
  })

  it('remove-axis-range：仅 y 轴（range 可省——自动推算）；本就没有 range → no-op 拒绝', () => {
    expect(apply(TEMPLATE, { type: 'remove-axis-range', axis: 'y' })).toContain('y-axis "销售额"')
    expect(apply('xychart-beta\ny-axis "金额"\nbar [1]\n', { type: 'remove-axis-range', axis: 'y' })).toBeNull()
  })
})

// ---------- 投影 ----------

describe('xychart 投影：形态派生 + 原样标注（不静默改写）', () => {
  it('模板投影：方向缺省 vertical、标题解码、轴两形态、系列可编辑', () => {
    const p = buildXychartProjection(parseOk(TEMPLATE))
    expect(p.orientation).toBe('vertical')
    expect(p.title).toEqual({ text: '季度销售趋势', textValid: true })
    expect(p.xAxis).toMatchObject({ axis: 'x', title: null, form: 'categories' })
    expect(p.xAxis.categories.map((c) => c.text)).toEqual(['一季度', '二季度', '三季度'])
    expect(p.yAxis).toMatchObject({ axis: 'y', title: '销售额', form: 'range', range: { min: '0', max: '400' } })
    expect(p.series[0]).toMatchObject({ elementId: 'series:1', seriesType: 'bar', name: null, editable: true })
    expect(p.series[0].values.map((v) => v.num)).toEqual([200, 350, 150])
    expect(p.series[1]).toMatchObject({ elementId: 'series:2', seriesType: 'line', name: '均线', editable: true })
  })

  it('方向修饰符 horizontal 进投影', () => {
    expect(buildXychartProjection(parseOk('xychart horizontal\nbar [1]\n')).orientation).toBe('horizontal')
  })

  it('点标签系列：values 携带标签、num 为 null、整体 editable=false（工单定案不展开）', () => {
    const p = buildXychartProjection(parseOk('xychart-beta\nline [1 "a", 2]\n'))
    expect(p.series[0].values).toEqual([
      { raw: '1', num: 1, label: null },
      { raw: '"a"', num: null, label: 'a' },
      { raw: '2', num: 2, label: null },
    ])
    expect(p.series[0].editable).toBe(false)
  })

  it('手写非法文本（%% 截断语义）原样保留并标注 textValid/rawValid=false', () => {
    const p = buildXychartProjection(parseOk('xychart-beta\nline "a%%b" [1]\nx-axis ["a%%b"]\nbar [1]\n'))
    expect(p.series[0].name).toBe('a%%b')
    expect(p.series[0].nameValid).toBe(false)
    expect(p.xAxis.categories[0]).toMatchObject({ text: 'a%%b', rawValid: false })
  })

  it('resolveXychartSelection：现存选中原样返回，不存在 / 别种 → null', () => {
    const p = buildXychartProjection(parseOk(TEMPLATE))
    expect(resolveXychartSelection(p, { kind: 'diagram' })).toEqual({ kind: 'diagram' })
    expect(resolveXychartSelection(p, { kind: 'xychart-title' })).toEqual({ kind: 'xychart-title' })
    expect(resolveXychartSelection(p, { kind: 'xychart-axis', axis: 'x' })).toEqual({ kind: 'xychart-axis', axis: 'x' })
    expect(resolveXychartSelection(p, { kind: 'xychart-series', elementId: 'series:1' })).toEqual({
      kind: 'xychart-series',
      elementId: 'series:1',
    })
    expect(resolveXychartSelection(p, { kind: 'xychart-series', elementId: 'series:99' })).toBeNull()
    expect(resolveXychartSelection(p, { kind: 'node', nodeId: 'A' })).toBeNull()
    expect(resolveXychartSelection(p, null)).toBeNull()
    // 无标题行的文档：标题选中回落 null
    const noTitle = buildXychartProjection(parseOk('xychart-beta\nbar [1]\n'))
    expect(resolveXychartSelection(noTitle, { kind: 'xychart-title' })).toBeNull()
  })
})

// ---------- 键盘 ----------

describe('xychart 键盘：Delete 删系列、系列上 Tab 加同类型系列（ADR-0013 就近类比）', () => {
  const projection = buildXychartProjection(parseOk(TEMPLATE))

  it('xychartDeleteIntent：系列 → delete-series；轴/标题是文档级属性元素无删除 → null', () => {
    expect(xychartDeleteIntent(projection, { kind: 'xychart-series', elementId: 'series:1' })).toEqual({
      type: 'delete-series',
      elementId: 'series:1',
    })
    expect(xychartDeleteIntent(projection, { kind: 'xychart-series', elementId: 'series:99' })).toBeNull()
    expect(xychartDeleteIntent(projection, { kind: 'xychart-axis', axis: 'x' })).toBeNull()
    expect(xychartDeleteIntent(projection, { kind: 'xychart-title' })).toBeNull()
    expect(xychartDeleteIntent(projection, null)).toBeNull()
  })

  it('xychartKeyPlan：Delete/Backspace → 删除 + 清空选中；Tab → 表单预取同类型', () => {
    expect(
      xychartKeyPlan(projection, { key: 'Delete', selection: { kind: 'xychart-series', elementId: 'series:1' } }),
    ).toEqual({ intents: [{ type: 'delete-series', elementId: 'series:1' }], clearSelection: true })
    expect(
      xychartKeyPlan(projection, { key: 'Backspace', selection: { kind: 'xychart-series', elementId: 'series:1' } }),
    ).toEqual({ intents: [{ type: 'delete-series', elementId: 'series:1' }], clearSelection: true })
    expect(
      xychartKeyPlan(projection, { key: 'Tab', selection: { kind: 'xychart-series', elementId: 'series:1' } }),
    ).toEqual({ intents: [], form: 'xychart-bar' })
    expect(
      xychartKeyPlan(projection, { key: 'Tab', selection: { kind: 'xychart-series', elementId: 'series:2' } }),
    ).toEqual({ intents: [], form: 'xychart-line' })
  })

  it('xychartKeyPlan：轴/标题上 Tab 无落码语义 → null；Shift+Tab / Enter / null 选中 → null', () => {
    expect(xychartKeyPlan(projection, { key: 'Tab', selection: { kind: 'xychart-axis', axis: 'x' } })).toBeNull()
    expect(xychartKeyPlan(projection, { key: 'Tab', selection: { kind: 'xychart-title' } })).toBeNull()
    expect(
      xychartKeyPlan(projection, {
        key: 'Tab',
        mods: { shift: true },
        selection: { kind: 'xychart-series', elementId: 'series:1' },
      }),
    ).toBeNull()
    expect(xychartKeyPlan(projection, { key: 'Enter', selection: { kind: 'xychart-series', elementId: 'series:1' } })).toBeNull()
    expect(xychartKeyPlan(projection, { key: 'Tab', selection: null })).toBeNull()
  })
})

// ---------- 结构树 ----------

describe('xychart 结构树：文档级属性元素分区 + 系列分区（工单定案）', () => {
  const t = (key: string) => key
  const sections = DIAGRAM_TYPES.xychart.tree(
    DIAGRAM_TYPES.xychart.buildProjection(parseOk(TEMPLATE)),
    { t },
  )
  const docEntries = sections.find((s) => s.key === 'doc-elements')!.entries
  const seriesEntries = sections.find((s) => s.key === 'series')!.entries

  it('doc-elements 分区：标题 + x 轴 + y 轴（文档级属性元素，固定 id）', () => {
    expect(docEntries.map((e) => e.selection)).toEqual([
      { kind: 'xychart-title' },
      { kind: 'xychart-axis', axis: 'x' },
      { kind: 'xychart-axis', axis: 'y' },
    ])
  })

  it('series 分区：位置序系列，label = 名字 ?? 未命名占位', () => {
    expect(seriesEntries.map((e) => e.selection)).toEqual([
      { kind: 'xychart-series', elementId: 'series:1' },
      { kind: 'xychart-series', elementId: 'series:2' },
    ])
    expect(seriesEntries.map((e) => e.label)).toEqual([
      'app:propertyPanel.xychartUnnamedSeries',
      '均线',
    ])
  })
})

// ---------- 画布 DOM 类名组 + 位置序反注 ----------

describe('annotateXychartIdentities：类名组 + 位置序反注（绝不误标）', () => {
  function buildXychartSvg(plotClasses: string[]): HTMLElement {
    const host = document.createElement('div')
    const plots = plotClasses.map((c) => `<g class="${c}"></g>`).join('')
    host.innerHTML = `<svg><g class="chart-title"></g><g class="plot">${plots}</g><g class="bottom-axis"></g><g class="left-axis"></g><g class="top-axis"></g></svg>`
    return host
  }

  it('vertical：x 轴 = bottom、y 轴 = left；系列组按类名序号反注 series:N', () => {
    const root = buildXychartSvg(['line-plot-0', 'bar-plot-1'])
    annotateXychartIdentities(root, { series: 2, orientation: 'vertical' })
    expect(root.querySelector('g.chart-title')!.getAttribute('data-id')).toBe('xychart-title')
    expect(root.querySelector('g.bottom-axis')!.getAttribute('data-id')).toBe('xychart-x-axis')
    expect(root.querySelector('g.left-axis')!.getAttribute('data-id')).toBe('xychart-y-axis')
    // vertical 下 top 轴组存在但不应被标注
    expect(root.querySelector('g.top-axis')!.getAttribute('data-id')).toBeNull()
    const plots = Array.from(root.querySelectorAll('g.plot > g'))
    expect(plots.map((g) => g.getAttribute('data-id'))).toEqual(['series:1', 'series:2'])
  })

  it('horizontal：x 轴 = left、y 轴 = top（轴组类名按 axisPosition 分发）', () => {
    const root = buildXychartSvg(['bar-plot-0'])
    annotateXychartIdentities(root, { series: 1, orientation: 'horizontal' })
    expect(root.querySelector('g.left-axis')!.getAttribute('data-id')).toBe('xychart-x-axis')
    expect(root.querySelector('g.top-axis')!.getAttribute('data-id')).toBe('xychart-y-axis')
    // horizontal 下 bottom 轴组存在但不应被标注
    expect(root.querySelector('g.bottom-axis')!.getAttribute('data-id')).toBeNull()
    expect(root.querySelector('g.plot > g')!.getAttribute('data-id')).toBe('series:1')
  })

  it('条数不符的系列组整体放弃（轴/标题照常标注）；类名序号与 DOM 序不符的组跳过', () => {
    const mismatch = buildXychartSvg(['line-plot-0', 'bar-plot-1'])
    annotateXychartIdentities(mismatch, { series: 3, orientation: 'vertical' })
    expect(mismatch.querySelector('g.plot g[data-id]')).toBeNull()
    expect(mismatch.querySelector('g.bottom-axis')!.getAttribute('data-id')).toBe('xychart-x-axis')
    // 双重校验：类名自带序号必须 === DOM 序（渲染器 plotIndex 即源码声明序）
    const wrongOrder = buildXychartSvg(['bar-plot-1', 'bar-plot-1'])
    annotateXychartIdentities(wrongOrder, { series: 2, orientation: 'vertical' })
    const plots = Array.from(wrongOrder.querySelectorAll('g.plot > g'))
    expect(plots[0].getAttribute('data-id')).toBeNull()
    expect(plots[1].getAttribute('data-id')).toBe('series:2')
  })

  it('与通用 annotateNodeDataIds 组合：xychart 渲染器不写元素 id，通用循环不产生误注', () => {
    const root = buildXychartSvg(['line-plot-0'])
    annotateNodeDataIds(root)
    expect(root.querySelector('g.plot g[data-id]')).toBeNull()
    annotateXychartIdentities(root, { series: 1, orientation: 'vertical' })
    expect(root.querySelector('g.plot > g')!.getAttribute('data-id')).toBe('series:1')
  })
})

// ---------- 数组渲染助手 ----------

describe('renderXychartArray：未触碰 token 与分隔原文逐字回写', () => {
  it('lead / token / tail / trailing 全部按原文拼接', () => {
    expect(
      renderXychartArray([
        { lead: '', token: '200' },
        { lead: ', ', token: '350' },
        { lead: ' , ', token: 'a', tail: ' ' },
      ], ', '),
    ).toBe('[200, 350 , a , ]')
  })
})
