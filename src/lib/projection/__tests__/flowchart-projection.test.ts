import { describe, expect, it } from 'vitest'
import { flowchartParser } from '../../pipeline/flowchart'
import {
  buildFlowchartProjection,
  resolveSelection,
  selectionKey,
  type Selection,
} from '../flowchart-projection'

const SOURCE = `flowchart TD
    %% 保留注释
    A[开始] --> B{判断}
    B -- 是 --> C[通过]
    B -.否.-> D
    C --> A
    subgraph 子图一
        E(椭圆) --> F
    end
    classDef highlight fill:#fff3bf,stroke:#e8590c,stroke-dasharray:5 5,color:#c92a2a
    classDef plain fill:#dbe4ff
`

function project(source: string) {
  const parsed = flowchartParser.parse(source)
  if (!parsed.ok) throw new Error(`解析失败：${parsed.error.message}`)
  return buildFlowchartProjection(parsed.doc)
}

describe('buildFlowchartProjection：结构树数据', () => {
  it('提取图方向', () => {
    expect(project(SOURCE).direction).toBe('TD')
  })

  it('节点按首次出现去重，保留文本与形状', () => {
    const proj = project(SOURCE)
    const a = proj.nodes.find((n) => n.nodeId === 'A')
    const b = proj.nodes.find((n) => n.nodeId === 'B')
    const d = proj.nodes.find((n) => n.nodeId === 'D')
    const e = proj.nodes.find((n) => n.nodeId === 'E')
    expect(a).toEqual({ nodeId: 'A', text: '开始', shape: 'rectangle' })
    expect(b?.shape).toBe('rhombus')
    expect(d).toEqual({ nodeId: 'D', text: null, shape: null })
    expect(e).toEqual({ nodeId: 'E', text: '椭圆', shape: 'rounded' })
  })

  it('连线提取线型、标签与出现序号', () => {
    const proj = project(SOURCE)
    const labeled = proj.edges.find((e) => e.label === '是')
    expect(labeled).toMatchObject({ from: 'B', to: 'C', occurrence: 1 })
    expect(labeled?.spec.labelForm).toBe('inline')
    const dotted = proj.edges.find((e) => e.from === 'B' && e.to === 'D')
    expect(dotted?.spec.lineStyle).toBe('dotted')
  })

  it('同一对节点的多条连线 occurrence 递增', () => {
    const proj = project(`flowchart TD\n    A --> B\n    A -- 第二条 --> B\n`)
    const ab = proj.edges.filter((e) => e.from === 'A' && e.to === 'B')
    expect(ab.map((e) => e.occurrence).sort()).toEqual([1, 2])
  })

  it('subgraph 与 classDef（属性逐项）', () => {
    const proj = project(SOURCE)
    expect(proj.subgraphs).toEqual([{ elementId: 'subgraph:1', title: null, id: '子图一' }])
    const highlight = proj.classDefs.find((c) => c.name === 'highlight')
    expect(highlight?.props).toEqual({
      fill: '#fff3bf',
      stroke: '#e8590c',
      'stroke-dasharray': '5 5',
      color: '#c92a2a',
    })
    expect(proj.classDefs.find((c) => c.name === 'plain')?.props).toEqual({ fill: '#dbe4ff' })
  })
})

describe('resolveSelection：选中状态回落', () => {
  const proj = project(SOURCE)

  it('存在的元素原样返回', () => {
    const sel: Selection = { kind: 'node', nodeId: 'A' }
    expect(resolveSelection(proj, sel)).toEqual(sel)
    const edge: Selection = { kind: 'edge', from: 'B', to: 'C', occurrence: 1 }
    expect(resolveSelection(proj, edge)).toEqual(edge)
    const sg: Selection = { kind: 'subgraph', elementId: 'subgraph:1' }
    expect(resolveSelection(proj, sg)).toEqual(sg)
    const cd: Selection = { kind: 'classdef', name: 'highlight' }
    expect(resolveSelection(proj, cd)).toEqual(cd)
  })

  it('元素被删除后回落到 null（表单显示回落态）', () => {
    expect(resolveSelection(proj, { kind: 'node', nodeId: 'ZZZ' })).toBeNull()
    expect(resolveSelection(proj, { kind: 'classdef', name: 'missing' })).toBeNull()
    expect(resolveSelection(proj, { kind: 'edge', from: 'B', to: 'C', occurrence: 9 })).toBeNull()
  })

  it('selectionKey 区分不同元素', () => {
    expect(selectionKey({ kind: 'node', nodeId: 'A' })).toBe('node:A')
    expect(selectionKey({ kind: 'edge', from: 'A', to: 'B', occurrence: 2 })).toBe('edge:A->B#2')
    expect(selectionKey({ kind: 'diagram' })).toBe('diagram')
  })
})
