import { describe, expect, it } from 'vitest'
import { mindmapParser } from '../mindmap'
import { toMindmapIR } from '../mindmap-ir'

/**
 * mindmap IR 转换单测（工单 06 spike）：icon 归属、id 可选（ADR-0009）、
 * shape 归一化、父子解析。
 */

function ir(source: string) {
  const parsed = mindmapParser.parse(source)
  if (!parsed.ok) throw new Error(`解析失败：${parsed.error.message}`)
  return toMindmapIR(parsed.doc)
}

describe('toMindmapIR', () => {
  it('icon 行折叠进其前一个节点，不再单独出现', () => {
    const doc = ir('mindmap\n  root\n    ::icon(fa fa-x)\n    child\n')
    expect(doc.nodes.map((n) => [n.text, n.icon])).toEqual([
      ['root', 'fa fa-x'],
      ['child', null],
    ])
  })

  it('icon 按元素相邻归属（与既有投影语义一致，元素级相邻）', () => {
    // icon 行与节点元素之间隔一个 verbatim part（空行）仍归属最近节点
    const doc = ir('mindmap\n  root\n\n  ::icon(fa fa-x)\n')
    expect(doc.nodes[0].icon).toBe('fa fa-x')
    expect(doc.nodes).toHaveLength(1)
  })

  it('id 可选（ADR-0009）：无 id 为 null，且不影响 elementId 与父子结构', () => {
    const doc = ir('mindmap\n  root\n    myid(子)\n      孙\n')
    expect(doc.nodes.map((n) => [n.elementId, n.id, n.parentId])).toEqual([
      ['mindmap-node:1', null, null],
      ['mindmap-node:2', 'myid', 'mindmap-node:1'],
      ['mindmap-node:3', null, 'mindmap-node:2'],
    ])
  })

  it('shape 归一化：六种形状 + 默认 null，text 不含形状括号', () => {
    const source = `mindmap
  方[一]
  圆角(二)
  圆((三))
  爆))四((
  云)五(
  六{{七}}
  八
`
    const doc = ir(source)
    expect(doc.nodes.map((n) => [n.text, n.shapeType])).toEqual([
      ['一', 'square'],
      ['二', 'rounded'],
      ['三', 'circle'],
      ['四', 'bang'],
      ['五', 'cloud'],
      ['七', 'hexagon'],
      ['八', null],
    ])
  })

  it('span 覆盖行首缩进到下一行行首（节点被干净移除的前提）', () => {
    const source = 'mindmap\n  root\n    child\n'
    const doc = ir(source)
    // 第二行 "    child\n"：'mindmap\n'（8）+ '  root\n'（7）= 从 15 到文档末尾
    expect(doc.nodes[1].span).toEqual({ start: 15, end: source.length })
  })
})
