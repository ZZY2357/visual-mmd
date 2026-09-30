import { describe, expect, it } from 'vitest'
import { quadrantParser } from '../../pipeline/quadrant'
import { buildQuadrantProjection, resolveQuadrantSelection } from '../quadrant-projection'

/**
 * quadrant 投影测试（more-diagrams 工单 12）：元素 id（位置序 point:N + 文档级
 * x-axis / y-axis / quadrant:1..4）、轴段（first = 左/下，second = 右/上，null = 无段）、
 * 坐标非法标注（coordsValid=false，xText/yText 原文保留）、内联样式四字段、
 * nextPointOrdinal 预测、resolveSelection 回落。
 */

const SOURCE = `quadrantChart
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

describe('buildQuadrantProjection', () => {
  it('title / 轴 / 象限 / 点按声明提取；点按文档序编 elementId（point:N，ADR-0012）', () => {
    const p = buildQuadrantProjection(parse(SOURCE))
    expect(p.title).toBe('需求优先级评估')
    expect(p.xAxis).toEqual({ elementId: 'x-axis', first: '低价值', second: '高价值' })
    expect(p.yAxis).toEqual({ elementId: 'y-axis', first: '低成本', second: '高成本' })
    expect(p.quadrants.map((q) => q.elementId)).toEqual([
      'quadrant:1',
      'quadrant:2',
      'quadrant:3',
      'quadrant:4',
    ])
    expect(p.quadrants[1]).toMatchObject({ index: 2, text: '规划排期' })
    expect(p.points.map((pt) => pt.elementId)).toEqual(['point:1', 'point:2', 'point:3'])
  })

  it('点字段：文本 / ::: 类名 / 坐标数值 / 内联样式四字段（未设置的为 null）', () => {
    const p = buildQuadrantProjection(parse(SOURCE))
    expect(p.points[0]).toMatchObject({
      text: 'Campaign A',
      className: null,
      x: 0.3,
      y: 0.6,
      coordsValid: true,
      color: null,
      radius: null,
      strokeColor: null,
      strokeWidth: null,
    })
    expect(p.points[1]).toMatchObject({ text: 'Campaign B', className: 'highlight', coordsValid: true })
    expect(p.points[2]).toMatchObject({ radius: '8', color: '#ff6b00', strokeColor: null, strokeWidth: null })
  })

  it('无轴行 / 单段轴：second = null；缺失的 quadrant-N 行不产生条目', () => {
    const p = buildQuadrantProjection(
      parse('quadrantChart\n    x-axis 只有左段\n    quadrant-2 只有它\n    P: [0.5, 0.5]\n'),
    )
    expect(p.title).toBeNull()
    expect(p.xAxis).toEqual({ elementId: 'x-axis', first: '只有左段', second: null })
    expect(p.yAxis).toBeNull()
    expect(p.quadrants.map((q) => q.index)).toEqual([2])
    expect(p.points).toHaveLength(1)
  })

  it('手写越界 / 畸形坐标行：解析门整行不认（mermaid 词法同样报错），逐字保留不产出幽灵元素', () => {
    const source = 'quadrantChart\n    越界: [1.5, 0.2]\n    畸形: [0.5, abc]\n'
    const p = buildQuadrantProjection(parse(source))
    // 坐标词法（1 / 0 / 0.<数字>）之外的行进不了元素层——coordsValid 恒为 true，
    // xText/coordsValid 字段是面向手写源的防御性暴露
    expect(p.points).toEqual([])
    expect(source).toContain('越界: [1.5, 0.2]')
  })

  it('nextPointOrdinal = 点总数 + 1（空白菜单加点的预测序号）', () => {
    expect(buildQuadrantProjection(parse(SOURCE)).nextPointOrdinal).toBe(4)
    expect(buildQuadrantProjection(parse('quadrantChart\n')).nextPointOrdinal).toBe(1)
  })
})

describe('resolveQuadrantSelection', () => {
  const projection = buildQuadrantProjection(parse(SOURCE))

  it('存在的点 / 轴 / 象限选中原样返回；图表级透传', () => {
    expect(resolveQuadrantSelection(projection, { kind: 'quadrant-point', elementId: 'point:2' })).toEqual({
      kind: 'quadrant-point',
      elementId: 'point:2',
    })
    expect(resolveQuadrantSelection(projection, { kind: 'quadrant-axis', elementId: 'y-axis' })).toEqual({
      kind: 'quadrant-axis',
      elementId: 'y-axis',
    })
    expect(resolveQuadrantSelection(projection, { kind: 'quadrant-quadrant', elementId: 'quadrant:3' })).toEqual({
      kind: 'quadrant-quadrant',
      elementId: 'quadrant:3',
    })
    expect(resolveQuadrantSelection(projection, { kind: 'diagram' })).toEqual({ kind: 'diagram' })
  })

  it('不存在的目标 / 缺失的轴 / null / 别种选中 → null（由调用方回落图表级）', () => {
    expect(resolveQuadrantSelection(projection, { kind: 'quadrant-point', elementId: 'point:99' })).toBeNull()
    expect(resolveQuadrantSelection(projection, { kind: 'quadrant-quadrant', elementId: 'quadrant:9' })).toBeNull()
    expect(
      resolveQuadrantSelection(
        buildQuadrantProjection(parse('quadrantChart\n    P: [0.5, 0.5]\n')),
        { kind: 'quadrant-axis', elementId: 'y-axis' },
      ),
    ).toBeNull()
    expect(resolveQuadrantSelection(projection, null)).toBeNull()
    expect(resolveQuadrantSelection(projection, { kind: 'node', nodeId: 'n1' })).toBeNull()
  })
})
