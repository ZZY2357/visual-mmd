import { describe, expect, it } from 'vitest'
import { packetParser } from '../../pipeline/packet'
import { buildPacketProjection, resolvePacketSelection } from '../packet-projection'

/**
 * packet 投影测试（more-diagrams 工单 16）：字段按位置序编 elementId（field:N）；
 * 三种位形态归一为绝对区间（+count / single 依赖前序结束位；range 原文即绝对）；
 * form 原样保留供落码「保留原形态」；contiguous 标注衔接性（mermaid 12 全序列严格
 * 连续，不衔接 → 整图渲染失败 → 结构树/表单标注）；resolveSelection 回落。
 */

const SOURCE = `packet
    0-15: "Source Port"
    16-31: "Destination Port"
    +16: "Flags"
    48: "单 bit"
`

function parse(source: string) {
  const r = packetParser.parse(source)
  if (!r.ok) throw new Error(`解析失败：${r.error.message}`)
  return r.doc
}

describe('buildPacketProjection', () => {
  it('字段按文档序编 elementId（field:N，ADR-0012）；绝对区间归一：+count / single 依赖前序结束位', () => {
    const p = buildPacketProjection(parse(SOURCE))
    expect(p.fields.map((f) => f.elementId)).toEqual(['field:1', 'field:2', 'field:3', 'field:4'])
    expect(p.fields[0]).toMatchObject({ name: 'Source Port', absStart: 0, absEnd: 15, bits: 16 })
    // +16 衔接 31 → 32-47；single `48:` 即 [48, 48]
    expect(p.fields[2]).toMatchObject({ name: 'Flags', absStart: 32, absEnd: 47, bits: 16 })
    expect(p.fields[3]).toMatchObject({ name: '单 bit', absStart: 48, absEnd: 48, bits: 1 })
    expect(p.nextFieldOrdinal).toBe(5)
  })

  it('form 原样保留（落码「保留原形态」的依据）；contiguous 按衔接性标注', () => {
    const p = buildPacketProjection(parse(SOURCE))
    expect(p.fields[0].form).toEqual({ kind: 'range', start: '0', end: '15' })
    expect(p.fields[2].form).toEqual({ kind: 'count', count: '16' })
    expect(p.fields[3].form).toEqual({ kind: 'single', start: '48' })
    // 全部衔接（count 恒连续；显式起点恰好接前序）
    expect(p.fields.map((f) => f.contiguous)).toEqual([true, true, true, true])
  })

  it('手写不衔接（间隙 / 重叠 / 回退）：仍产出元素但 contiguous=false（结构树标注，不静默改写）', () => {
    const p = buildPacketProjection(
      parse('packet\n    0-7: "A"\n    16-23: "B"\n    8-15: "C"\n    40-47: "D"\n'),
    )
    expect(p.fields.map((f) => [f.name, f.contiguous])).toEqual([
      ['A', true],
      ['B', false], // 间隙（前序结束 7，起点 16）
      ['C', false], // 回退 / 重叠（起点 8 落在前序区间内）
      ['D', false], // 间隙（前序结束 15）
    ])
    // 归一不受连续性影响：绝对区间照常计算
    expect(p.fields[2]).toMatchObject({ absStart: 8, absEnd: 15 })
  })

  it('空图（只有声明头）：无字段，nextFieldOrdinal = 1', () => {
    const p = buildPacketProjection(parse('packet\n'))
    expect(p.fields).toEqual([])
    expect(p.nextFieldOrdinal).toBe(1)
  })
})

describe('resolvePacketSelection', () => {
  const projection = buildPacketProjection(parse(SOURCE))

  it('存在的字段 / 图表级选中原样返回', () => {
    expect(resolvePacketSelection(projection, { kind: 'packet-field', elementId: 'field:2' })).toEqual({
      kind: 'packet-field',
      elementId: 'field:2',
    })
    expect(resolvePacketSelection(projection, { kind: 'diagram' })).toEqual({ kind: 'diagram' })
  })

  it('不存在的字段 / null / 别种选中 → null（由调用方回落图表级）', () => {
    expect(resolvePacketSelection(projection, { kind: 'packet-field', elementId: 'field:99' })).toBeNull()
    expect(resolvePacketSelection(projection, null)).toBeNull()
    expect(resolvePacketSelection(projection, { kind: 'node', nodeId: 'n1' })).toBeNull()
  })
})
