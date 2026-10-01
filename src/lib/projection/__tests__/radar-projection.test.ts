import { describe, expect, it } from 'vitest'
import { radarParser } from '../../pipeline/radar'
import { buildRadarProjection, resolveRadarSelection } from '../radar-projection'

/**
 * radar 投影测试（more-diagrams 工单 15）：位置序 elementId（axis:N / curve:N /
 * option:N，ADR-0012）、曲线双形态归一（键值按 ref、值列表按轴声明位序）、raw 形态
 * 空映射、nextOrdinal 预测、resolveSelection 回落（存在原样 / 不存在 null /
 * 图表级透传 / 别种选中 null）。
 */

const SOURCE = `radar-beta
    title 技能评估
    axis math["数学"], science["科学"]
    curve alice["Alice"]{ 1, 2 }
    curve bob["Bob"]{ math: 4, science: 3 }
    max 5
    graticule circle
`

function projectionOf(source: string) {
  const r = radarParser.parse(source)
  if (!r.ok) throw new Error(`解析失败：${r.error.message}`)
  return buildRadarProjection(r.doc)
}

describe('buildRadarProjection', () => {
  it('轴 / 曲线 / 选项按文档序编 elementId（位置序，ADR-0012），title 提取', () => {
    const p = projectionOf(SOURCE)
    expect(p.title).toBe('技能评估')
    expect(p.axes.map((a) => a.elementId)).toEqual(['axis:1', 'axis:2'])
    expect(p.axes[0]).toMatchObject({ id: 'math', label: '数学' })
    expect(p.curves.map((c) => c.elementId)).toEqual(['curve:1', 'curve:2'])
    expect(p.options.map((o) => o.elementId)).toEqual(['option:1', 'option:2'])
    expect(p.options[0]).toMatchObject({ name: 'max', value: '5' })
  })

  it('双形态归一：键值按 ref、值列表按轴声明位序（mermaid db 语义）', () => {
    const p = projectionOf(SOURCE)
    // alice 是值列表形态：第 i 个值属于第 i 个轴
    expect(p.curves[0]).toMatchObject({ id: 'alice', form: 'value-list', values: { math: 1, science: 2 } })
    // bob 是键值形态：条目 ref → 数值
    expect(p.curves[1]).toMatchObject({ id: 'bob', form: 'keyed', values: { math: 4, science: 3 } })
  })

  it('raw 形态（清单外条目）values 空映射；无 label 回退 null', () => {
    const p = projectionOf('radar-beta\n    axis a["甲"]\n    curve mix{ 1, b: 2 }\n    curve 裸\n')
    expect(p.curves[0]).toMatchObject({ form: 'raw', values: {} })
    // 无花括号曲线不解析（清单外），bare 不在投影
    expect(p.curves).toHaveLength(1)
    expect(projectionOf('radar-beta\n    axis a\n').axes[0]).toMatchObject({ label: null })
  })

  it('nextAxisOrdinal / nextCurveOrdinal = 总数 + 1（空白菜单加轴/加曲线的预测序号）', () => {
    const p = projectionOf(SOURCE)
    expect(p.nextAxisOrdinal).toBe(3)
    expect(p.nextCurveOrdinal).toBe(3)
    expect(projectionOf('radar-beta\n').nextAxisOrdinal).toBe(1)
  })
})

describe('resolveRadarSelection', () => {
  const projection = projectionOf(SOURCE)

  it('存在的轴 / 曲线选中原样返回；图表级透传', () => {
    expect(resolveRadarSelection(projection, { kind: 'radar-axis', elementId: 'axis:2' })).toEqual({
      kind: 'radar-axis',
      elementId: 'axis:2',
    })
    expect(resolveRadarSelection(projection, { kind: 'radar-curve', elementId: 'curve:1' })).toEqual({
      kind: 'radar-curve',
      elementId: 'curve:1',
    })
    expect(resolveRadarSelection(projection, { kind: 'diagram' })).toEqual({ kind: 'diagram' })
  })

  it('不存在的元素 / null / 别种选中 → null（由调用方回落图表级）', () => {
    expect(resolveRadarSelection(projection, { kind: 'radar-axis', elementId: 'axis:99' })).toBeNull()
    expect(resolveRadarSelection(projection, { kind: 'radar-curve', elementId: 'curve:99' })).toBeNull()
    expect(resolveRadarSelection(projection, null)).toBeNull()
    expect(resolveRadarSelection(projection, { kind: 'node', nodeId: 'n1' })).toBeNull()
  })
})
