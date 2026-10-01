import { describe, expect, it } from 'vitest'
import { ishikawaParser } from '../../pipeline/ishikawa'
import { buildIshikawaProjection, resolveIshikawaSelection } from '../ishikawa-projection'

/**
 * ishikawa 投影测试（more-diagrams 工单 22）：位置序身份、因果树组树、
 * 鱼头识别、选中回落（ADR-0012/0016）。
 */

const SOURCE = `ishikawa-beta
    成片发虚
    人
        手抖
        没按稳
    设备
        镜头脏
        对焦不准
    环境
        光线太暗
`

function projectionOf(source: string) {
  const parsed = ishikawaParser.parse(source)
  if (!parsed.ok) throw new Error(`解析失败：${parsed.error.message}`)
  return buildIshikawaProjection(parsed.doc)
}

describe('buildIshikawaProjection（工单 22）', () => {
  const projection = projectionOf(SOURCE)

  it('位置序身份：文档序 ishikawa-node:1..N（ADR-0012）', () => {
    expect(projection.nodes.map((n) => n.elementId)).toEqual([
      'ishikawa-node:1',
      'ishikawa-node:2',
      'ishikawa-node:3',
      'ishikawa-node:4',
      'ishikawa-node:5',
      'ishikawa-node:6',
      'ishikawa-node:7',
      'ishikawa-node:8',
      'ishikawa-node:9',
    ])
  })

  it('鱼头识别：root 为第一行、isRoot=true、depth 0；其余非 root', () => {
    expect(projection.root?.elementId).toBe('ishikawa-node:1')
    expect(projection.root?.text).toBe('成片发虚')
    expect(projection.root?.isRoot).toBe(true)
    expect(projection.nodes.filter((n) => n.isRoot)).toHaveLength(1)
    expect(projection.nodes.slice(1).every((n) => !n.isRoot)).toBe(true)
  })

  it('因果树组树：鱼头为根，三个主因挂其下，各自两个分支（文档序，depth 用 mermaid 原始 level）', () => {
    expect(projection.root?.children.map((c) => c.text)).toEqual(['人', '设备', '环境'])
    expect(projection.root?.children[0].children.map((c) => c.text)).toEqual(['手抖', '没按稳'])
    expect(projection.root?.children[1].children.map((c) => c.text)).toEqual(['镜头脏', '对焦不准'])
    expect(projection.root?.children[2].children.map((c) => c.text)).toEqual(['光线太暗'])
    // depth = rawLevel - baseLevel + 1（baseLevel = 4 = 人），不连续：1 / 5
    expect(projection.root?.children.map((c) => c.depth)).toEqual([1, 1, 1])
    expect(projection.root?.children[0].children.map((c) => c.depth)).toEqual([5, 5])
  })

  it('nextNodeOrdinal = 节点总数 + 1（结尾追加预测）', () => {
    expect(projection.nextNodeOrdinal).toBe(10)
  })

  it('无正文行时 root 为 null、nodes 为空（research 坑 7）', () => {
    const empty = projectionOf('ishikawa-beta\n')
    expect(empty.root).toBeNull()
    expect(empty.nodes).toEqual([])
    expect(empty.nextNodeOrdinal).toBe(1)
  })
})

describe('resolveIshikawaSelection（工单 22）', () => {
  const projection = projectionOf(SOURCE)

  it('存在的节点选中原样返回；diagram 原样返回', () => {
    const sel = { kind: 'ishikawa-node' as const, elementId: 'ishikawa-node:3' }
    expect(resolveIshikawaSelection(projection, sel)).toEqual(sel)
    expect(resolveIshikawaSelection(projection, { kind: 'diagram' })).toEqual({ kind: 'diagram' })
  })

  it('已不存在的节点 / null / 别种选中 → null', () => {
    expect(resolveIshikawaSelection(projection, { kind: 'ishikawa-node', elementId: 'ishikawa-node:99' })).toBeNull()
    expect(resolveIshikawaSelection(projection, null)).toBeNull()
    expect(resolveIshikawaSelection(projection, { kind: 'node', nodeId: 'A' })).toBeNull()
  })
})
