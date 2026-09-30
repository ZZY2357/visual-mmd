import { describe, expect, it } from 'vitest'
import { pieParser } from '../../pipeline/pie'
import { buildPieProjection, resolvePieSelection } from '../pie-projection'

/**
 * pie 投影测试（more-diagrams 工单 10）：元素 id（位置序 sector:N）、数值非法标注
 * （valuePositive=false，valueText 原文保留）、nextSectorOrdinal 预测、resolveSelection
 * 回落（存在原样 / 不存在 null / 图表级透传 / 别种选中 null）。
 */

const SOURCE = `pie showData
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

describe('buildPieProjection', () => {
  it('扇区按文档序编 elementId（sector:N，ADR-0012 位置序），title 提取', () => {
    const p = buildPieProjection(parse(SOURCE))
    expect(p.title).toBe('预算分配')
    expect(p.sectors.map((s) => s.elementId)).toEqual(['sector:1', 'sector:2', 'sector:3'])
    expect(p.sectors[0]).toMatchObject({ label: '研发', valueText: '45', value: 45, valuePositive: true })
    expect(p.sectors[1]).toMatchObject({ label: '市场', valueText: '30.5', value: 30.5, valuePositive: true })
  })

  it('无 title / 无扇区：title null、sectors 空、nextSectorOrdinal = 1', () => {
    const p = buildPieProjection(parse('pie\n'))
    expect(p.title).toBeNull()
    expect(p.sectors).toEqual([])
    expect(p.nextSectorOrdinal).toBe(1)
  })

  it('非法数值（负数 / 零 / 非法词法）valueText 原文保留、valuePositive = false', () => {
    const p = buildPieProjection(parse('pie\n  "负" : -1\n  "零" : 0\n  "前导零" : 05\n'))
    expect(p.sectors[0]).toMatchObject({ valueText: '-1', value: -1, valuePositive: false })
    expect(p.sectors[1]).toMatchObject({ valueText: '0', value: 0, valuePositive: false })
    expect(p.sectors[2]).toMatchObject({ valueText: '05', value: null, valuePositive: false })
  })

  it('nextSectorOrdinal = 扇区总数 + 1（空白菜单加扇区的预测序号）', () => {
    expect(buildPieProjection(parse(SOURCE)).nextSectorOrdinal).toBe(4)
  })
})

describe('resolvePieSelection', () => {
  const projection = buildPieProjection(parse(SOURCE))

  it('存在的扇区选中原样返回；图表级透传', () => {
    expect(resolvePieSelection(projection, { kind: 'pie-sector', elementId: 'sector:2' })).toEqual({
      kind: 'pie-sector',
      elementId: 'sector:2',
    })
    expect(resolvePieSelection(projection, { kind: 'diagram' })).toEqual({ kind: 'diagram' })
  })

  it('不存在的扇区 / null / 别种选中 → null（由调用方回落图表级）', () => {
    expect(resolvePieSelection(projection, { kind: 'pie-sector', elementId: 'sector:99' })).toBeNull()
    expect(resolvePieSelection(projection, null)).toBeNull()
    expect(resolvePieSelection(projection, { kind: 'node', nodeId: 'n1' })).toBeNull()
  })
})
