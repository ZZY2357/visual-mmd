import { describe, expect, it } from 'vitest'
import { treemapParser } from '../../pipeline/treemap'
import { buildTreemapProjection, resolveTreemapSelection } from '../treemap-projection'
import type { SourceDocument } from '../../pipeline/document'

/**
 * treemap 投影测试（more-diagrams 工单 20）：层级组树、位置序身份、选中回落。
 */

function parse(source: string): SourceDocument {
  const result = treemapParser.parse(source)
  if (!result.ok) throw new Error(`解析失败：${result.error.message}`)
  return result.doc
}

describe('buildTreemapProjection（more-diagrams 工单 20）', () => {
  it('层级组树：Section 为分组、Leaf 为叶子，位置序 elementId（文档序，ADR-0012）', () => {
    const p = buildTreemapProjection(
      parse('treemap\n"根"\n    "甲"\n        "叶1": 3\n        "叶2": 2\n    "乙": 5\n'),
    )
    expect(p.nodes.map((n) => n.elementId)).toEqual([
      'treemap-node:1',
      'treemap-node:2',
      'treemap-node:3',
      'treemap-node:4',
      'treemap-node:5',
    ])
    expect(p.roots).toHaveLength(1)
    const root = p.roots[0]
    expect(root?.nodeKind).toBe('section')
    expect(root?.children.map((c) => c.name)).toEqual(['甲', '乙'])
    const branch = root?.children[0]
    expect(branch?.children.map((c) => c.nodeKind)).toEqual(['leaf', 'leaf'])
    expect(branch?.children[0]?.value).toBe(3)
    expect(p.nextNodeOrdinal).toBe(6)
  })

  it('多根允许（research 坑 5：mermaid parse 不跑单根校验，自家解析器不做单根约束）', () => {
    const p = buildTreemapProjection(parse('treemap\n"甲": 1\n"乙": 2\n'))
    expect(p.roots.map((r) => r.name)).toEqual(['甲', '乙'])
  })

  it('非法数值原样保留并标注（valueValid = false），不静默改写', () => {
    const p = buildTreemapProjection(parse('treemap\n"甲": -5\n"乙": x\n"丙": 2\n'))
    expect(p.nodes[0].valueText).toBe('-5')
    expect(p.nodes[0].valueValid).toBe(false)
    expect(p.nodes[1].valueText).toBe('x')
    expect(p.nodes[1].value).toBeNull()
    expect(p.nodes[1].valueValid).toBe(false)
    expect(p.nodes[2].valueValid).toBe(true)
  })

  it('resolveTreemapSelection：存在原样返回、不存在/null 落 null、图表级透传', () => {
    const p = buildTreemapProjection(parse('treemap\n"甲": 1\n'))
    expect(resolveTreemapSelection(p, { kind: 'treemap-node', elementId: 'treemap-node:1' })).toEqual({
      kind: 'treemap-node',
      elementId: 'treemap-node:1',
    })
    expect(resolveTreemapSelection(p, { kind: 'treemap-node', elementId: 'treemap-node:9' })).toBeNull()
    expect(resolveTreemapSelection(p, { kind: 'diagram' })).toEqual({ kind: 'diagram' })
    expect(resolveTreemapSelection(p, null)).toBeNull()
    expect(resolveTreemapSelection(p, { kind: 'node', nodeId: 'a' })).toBeNull()
  })
})
