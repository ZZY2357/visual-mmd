import { describe, expect, it } from 'vitest'
import { mindmapParser } from '../../pipeline/mindmap'
import { buildMindmapProjection } from '../mindmap-projection'

/**
 * mindmap 投影（工单 05）：语法 id 透出（为空时 null），
 * 位置序寻址（elementId）与父子结构不受 id 影响。
 */

const SOURCE = `mindmap
  root((中心))
    子节点
    myid[分离节点]
      孙节点
`

function project(source: string) {
  const parsed = mindmapParser.parse(source)
  if (!parsed.ok) throw new Error(`解析失败：${parsed.error.message}`)
  return buildMindmapProjection(parsed.doc)
}

describe('buildMindmapProjection：节点 ID（工单 05）', () => {
  it('有 id 的节点透出 id，纯文本节点为 null', () => {
    const proj = project(SOURCE)
    expect(proj.nodes.map((n) => [n.elementId, n.text, n.id])).toEqual([
      ['mindmap-node:1', '中心', 'root'],
      ['mindmap-node:2', '子节点', null],
      ['mindmap-node:3', '分离节点', 'myid'],
      ['mindmap-node:4', '孙节点', null],
    ])
  })

  it('分离节点照常透出显示文本与形状（id 不参与渲染）', () => {
    const proj = project(SOURCE)
    const separated = proj.nodes[2]
    expect(separated.text).toBe('分离节点')
    expect(separated.shapeType).toBe('square')
  })

  it('寻址用位置序：elementId 与父子结构与 id 无关', () => {
    const proj = project(SOURCE)
    expect(proj.nodes.map((n) => n.parentId)).toEqual([
      null,
      'mindmap-node:1',
      'mindmap-node:1',
      'mindmap-node:3',
    ])
    expect(proj.nodes.map((n) => n.depth)).toEqual([0, 1, 1, 2])
  })

  it('全部节点都没有 id 时逐项为 null（默认不分离）', () => {
    const proj = project('mindmap\n  根\n    子\n')
    expect(proj.nodes.map((n) => n.id)).toEqual([null, null])
  })
})
