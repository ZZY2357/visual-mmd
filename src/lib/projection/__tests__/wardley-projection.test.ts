import { describe, expect, it } from 'vitest'
import { wardleyParser } from '../../pipeline/wardley'
import { buildWardleyProjection, resolveWardleySelection } from '../wardley-projection'

/**
 * wardley 投影测试（more-diagrams 工单 23）：节点名字即身份（`wardley-node:名`）、
 * 连线 / evolve 位置序身份、坐标合法性标注、悬空引用标注、选中回落。
 */

const SOURCE = `wardley-beta
title 茶铺价值链

anchor "顾客" [0.95, 0.63]
component "茶" [0.63, 0.81]
component "水壶" [0.43, 0.35]

"顾客" -> "茶"
"茶" -> "不存在"

evolve "水壶" 0.62
evolve "幽灵" 0.5
`

function projectionOf(src: string) {
  const parsed = wardleyParser.parse(src)
  if (!parsed.ok) throw new Error(`解析失败：${parsed.error.message}`)
  return buildWardleyProjection(parsed.doc)
}

describe('buildWardleyProjection', () => {
  const p = projectionOf(SOURCE)

  it('节点名字即身份（elementId = wardley-node:名）+ 坐标原文', () => {
    expect(p.nodes.map((n) => n.elementId)).toEqual([
      'wardley-node:顾客',
      'wardley-node:茶',
      'wardley-node:水壶',
    ])
    expect(p.nodes[0]).toMatchObject({
      nodeKind: 'anchor',
      visibilityText: '0.95',
      evolutionText: '0.63',
      coordsValid: true,
      inPipeline: false,
    })
  })

  it('连线 / evolve 位置序身份（elementId = wardley-link:N / wardley-evolve:N）', () => {
    expect(p.links.map((l) => l.elementId)).toEqual(['wardley-link:1', 'wardley-link:2'])
    expect(p.evolves.map((e) => e.elementId)).toEqual(['wardley-evolve:1', 'wardley-evolve:2'])
  })

  it('悬空引用标注：端点 / 名字不存在时 endpointsValid / nameValid = false', () => {
    expect(p.links[0].endpointsValid).toBe(true)
    expect(p.links[1].endpointsValid).toBe(false) // "不存在"
    expect(p.evolves[0].nameValid).toBe(true) // 水壶
    expect(p.evolves[1].nameValid).toBe(false) // 幽灵
  })

  it('title 提取为文档级原文；docLines 全量保留', () => {
    expect(p.title).toBe('茶铺价值链')
    expect(p.docLines.map((d) => d.docKind)).toContain('title')
  })

  it('越界 / 畸形坐标原样保留 + coordsValid = false', () => {
    const bad = projectionOf('wardley-beta\ncomponent "甲" [200, 0.5]\n')
    expect(bad.nodes[0].coordsValid).toBe(false)
    expect(bad.nodes[0].visibilityText).toBe('200')
  })

  it('nextNodeOrdinal / nextLinkOrdinal / nextEvolveOrdinal 为文档末尾追加的位置序预测', () => {
    expect(p.nextNodeOrdinal).toBe(4)
    expect(p.nextLinkOrdinal).toBe(3)
    expect(p.nextEvolveOrdinal).toBe(3)
  })
})

describe('resolveWardleySelection', () => {
  const p = projectionOf(SOURCE)

  it('仍存在的选中原样返回，缺失回落 null', () => {
    expect(resolveWardleySelection(p, { kind: 'wardley-node', name: '茶' })).toEqual({
      kind: 'wardley-node',
      name: '茶',
    })
    expect(resolveWardleySelection(p, { kind: 'wardley-node', name: '缺' })).toBeNull()
    expect(resolveWardleySelection(p, { kind: 'wardley-link', elementId: 'wardley-link:1' })).not.toBeNull()
    expect(resolveWardleySelection(p, { kind: 'wardley-link', elementId: 'wardley-link:9' })).toBeNull()
    expect(resolveWardleySelection(p, { kind: 'diagram' })).toEqual({ kind: 'diagram' })
    expect(resolveWardleySelection(p, null)).toBeNull()
  })
})
