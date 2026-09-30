import { describe, expect, it } from 'vitest'
import { BLOCK_TEMPLATE } from '../../diagram-registry'
import { blockParser } from '../../pipeline/block'
import { buildBlockProjection, resolveBlockSelection } from '../block-projection'
import type { SourceDocument } from '../../pipeline/document'

/**
 * block 投影（more-diagrams 工单 09，ADR-0016）：投影只吃解析产物的 *Data。
 * - 块节点按 id 归并（首个声明承担编辑入口）
 * - 边按位置序编 elementId（`edge:N`，ADR-0012）
 * - 嵌套块经 parentId 挂树；space 记录在案但不进结构树
 * - 边端点是隐式节点声明（mermaid 的 blockDatabase 语义）
 */

function parseDoc(src: string): SourceDocument {
  const r = blockParser.parse(src)
  if (!r.ok) throw new Error(`解析失败：${r.error.message}`)
  return r.doc
}

describe('buildBlockProjection', () => {
  it('模板：表头关键字、节点归并、嵌套块归属、位置序边、space 记录', () => {
    const p = buildBlockProjection(parseDoc(BLOCK_TEMPLATE))
    expect(p.keyword).toBe('block-beta')
    expect(p.title).toBeNull()
    expect(p.columns).toBe(3)

    expect(p.nodes.map((n) => n.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(p.nodes[0]).toMatchObject({ shape: 'square', label: '输入', parentId: null, elementId: 'block-node:a' })
    expect(p.nodes[3]).toMatchObject({ id: 'd', shape: 'round', parentId: 'group1' })

    expect(p.groups).toHaveLength(1)
    expect(p.groups[0]).toMatchObject({ id: 'group1', columns: 2, parentId: null, elementId: 'block-group:group1' })

    expect(p.edges.map((e) => e.elementId)).toEqual(['edge:1', 'edge:2'])
    expect(p.edges[0]).toMatchObject({ from: 'a', to: 'b', line: '-->', label: null })
    expect(p.edges[1]).toMatchObject({ from: 'b', to: 'c', label: '通过' })

    expect(p.spaces).toHaveLength(1)
    expect(p.spaces[0]).toMatchObject({ width: null, parentId: null })
  })

  it('边端点是隐式节点声明（未单独声明的端点进投影，elementId 为 null）', () => {
    const src = 'block-beta\n    a --> z\n'
    const p = buildBlockProjection(parseDoc(src))
    expect(p.nodes.map((n) => n.id)).toEqual(['a', 'z'])
    const z = p.nodes.find((n) => n.id === 'z')!
    expect(z.elementId).toBeNull() // 没有声明行，只经边出现
    expect(z.shape).toBeNull()
  })

  it('同名节点的多个声明归并成一个投影节点（首个承担编辑入口）', () => {
    const src = 'block-beta\n    a["首"]\n    a["次"]\n'
    const p = buildBlockProjection(parseDoc(src))
    expect(p.nodes).toHaveLength(1)
    expect(p.nodes[0]).toMatchObject({ id: 'a', label: '首', elementId: 'block-node:a' })
  })

  it('group 的 columns 行归属组；space 的 owner 记录所在组', () => {
    const src = 'block-beta\n    block:gid\n        columns 2\n        space\n        a["甲"]\n    end\n'
    const p = buildBlockProjection(parseDoc(src))
    expect(p.groups[0]?.columns).toBe(2)
    expect(p.spaces[0]?.parentId).toBe('gid')
    expect(p.nodes[0]?.parentId).toBe('gid')
  })

  it('title 行进投影', () => {
    const p = buildBlockProjection(parseDoc('block-beta\n    title 标题\n    a["甲"]\n'))
    expect(p.title).toBe('标题')
  })
})

describe('resolveBlockSelection（选中回落）', () => {
  const p = buildBlockProjection(parseDoc(BLOCK_TEMPLATE))

  it('存在的选中原样返回', () => {
    expect(resolveBlockSelection(p, { kind: 'diagram' })).toEqual({ kind: 'diagram' })
    expect(resolveBlockSelection(p, { kind: 'block-node', id: 'a' })).toEqual({ kind: 'block-node', id: 'a' })
    expect(resolveBlockSelection(p, { kind: 'block-group', id: 'group1' })).toEqual({ kind: 'block-group', id: 'group1' })
    expect(resolveBlockSelection(p, { kind: 'block-edge', elementId: 'edge:1' })).toEqual({ kind: 'block-edge', elementId: 'edge:1' })
  })

  it('已不存在的选中 / 别图种选中 / null → null（由调用方回落图表级）', () => {
    expect(resolveBlockSelection(p, { kind: 'block-node', id: '__无__' })).toBeNull()
    expect(resolveBlockSelection(p, { kind: 'block-edge', elementId: 'edge:999' })).toBeNull()
    expect(resolveBlockSelection(p, { kind: 'node', nodeId: 'a' })).toBeNull()
    expect(resolveBlockSelection(p, null)).toBeNull()
  })
})
