import { describe, expect, it } from 'vitest'
import {
  edgeDataIdResolver,
  elementDataIdResolver,
  nodeDataIdResolver,
  selectionFromEventTarget,
  type DataIdResolver,
} from '../data-id'
import { flowchartDataIdResolver, toEditorSelection } from '../flowchart-adapter'
import { buildFlowchartProjection, type FlowchartProjection } from '../../projection/flowchart-projection'
import { flowchartParser } from '../../pipeline/flowchart'

/**
 * 工单 05：data-id → 选中的通用匹配逻辑。
 * 固定 SVG 结构模拟 mermaid v12 渲染产物（节点 <g data-id="节点id">，
 * 边 <path data-id="L_from_to_n">），不依赖真实 mermaid 渲染。
 */

const SAMPLE = `flowchart TD
    A[开始] --> B[处理]
    B --> A
    B --> C[结束]
`

const projection: FlowchartProjection = (() => {
  const parsed = flowchartParser.parse(SAMPLE)
  if (!parsed.ok) throw new Error('样例源码必须可解析')
  return buildFlowchartProjection(parsed.doc)
})()

function buildSvg(): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = `<svg>
    <g class="node" data-id="A"><rect/><text>开始</text></g>
    <g class="node" data-id="B"><rect/></g>
    <g class="node" data-id="C"><rect/></g>
    <path class="flowchart-link" data-id="L_A_B_0"/>
    <path class="flowchart-link" data-id="L_B_A_0"/>
    <path class="flowchart-link" data-id="L_B_C_0"/>
  </svg>`
  return host
}

describe('nodeDataIdResolver（图种无关的节点匹配）', () => {
  const resolver = nodeDataIdResolver(['A', 'B', 'C'])

  it('data-id 精确等于已知节点 id 时命中', () => {
    expect(resolver('B')).toEqual({ kind: 'node', id: 'B' })
  })

  it('未知 data-id 返回 null（不选中、不崩溃）', () => {
    expect(resolver('X')).toBeNull()
    expect(resolver('L_A_B_0')).toBeNull()
  })
})

describe('edgeDataIdResolver（mermaid 边 data-id 的尽力而为匹配）', () => {
  const edges = [
    { from: 'A', to: 'B', occurrence: 1 },
    { from: 'B', to: 'A', occurrence: 1 },
  ]
  const resolver = edgeDataIdResolver(edges)

  it('L_from_to_0 匹配第一条连线', () => {
    expect(resolver('L_A_B_0')).toEqual({ kind: 'edge', from: 'A', to: 'B', occurrence: 1 })
  })

  it('节点 id 含连字符/下划线时按已知边集合消歧', () => {
    const r = edgeDataIdResolver([{ from: 'a-1', to: 'b', occurrence: 1 }])
    expect(r('L_a-1_b_0')).toEqual({ kind: 'edge', from: 'a-1', to: 'b', occurrence: 1 })
  })

  it('平行边 counter 映射到 occurrence', () => {
    const r = edgeDataIdResolver([
      { from: 'A', to: 'B', occurrence: 1 },
      { from: 'A', to: 'B', occurrence: 2 },
    ])
    expect(r('L_A_B_1')).toEqual({ kind: 'edge', from: 'A', to: 'B', occurrence: 2 })
  })

  it('不存在的边返回 null', () => {
    expect(resolver('L_A_C_0')).toBeNull()
    expect(resolver('A_B')).toBeNull()
  })
})

describe('elementDataIdResolver（工单 02：位置序连线的 data-id 匹配）', () => {
  const resolver = elementDataIdResolver(['relation:1', 'relation:2', 'message:1'])

  it('data-id 精确等于投影已知的 elementId 时命中', () => {
    expect(resolver('relation:2')).toEqual({ kind: 'element', elementId: 'relation:2' })
    expect(resolver('message:1')).toEqual({ kind: 'element', elementId: 'message:1' })
  })

  it('投影里没有的 id 一律 null（mermaid 自己的 data-id 不会误造选中）', () => {
    expect(resolver('relation:3')).toBeNull()
    expect(resolver('id_A_B_1')).toBeNull()
    expect(resolver('i1')).toBeNull()
    expect(resolver('A')).toBeNull()
  })
})

describe('selectionFromEventTarget（点击目标解析，无法匹配退化为 null）', () => {
  const resolver: DataIdResolver = (id) => (id === 'A' ? { kind: 'node', id: 'A' } : null)
  const host = buildSvg()

  it('点击节点内部元素 → 沿 DOM 向上找到 data-id', () => {
    const text = host.querySelector('text')!
    expect(selectionFromEventTarget(text, resolver)).toEqual({ kind: 'node', id: 'A' })
  })

  it('data-id 无法匹配（如边）→ null，不崩溃', () => {
    const path = host.querySelector('path')!
    expect(selectionFromEventTarget(path, resolver)).toBeNull()
  })

  it('目标为 null 或非 Element → null', () => {
    expect(selectionFromEventTarget(null, resolver)).toBeNull()
    expect(selectionFromEventTarget(window, resolver)).toBeNull()
  })

  it('resolver 为 null（图种未接入）→ null', () => {
    const g = host.querySelector('g')!
    expect(selectionFromEventTarget(g, null)).toBeNull()
  })
})

describe('flowchart 适配器：投影 → resolver → store Selection', () => {
  it('节点 data-id（即源码节点 id）命中节点选中', () => {
    const resolver = flowchartDataIdResolver(projection)
    expect(resolver('B')).toEqual({ kind: 'node', id: 'B' })
  })

  it('边 data-id 尽力而为命中边选中', () => {
    const resolver = flowchartDataIdResolver(projection)
    expect(resolver('L_A_B_0')).toEqual({ kind: 'edge', from: 'A', to: 'B', occurrence: 1 })
  })

  it('画布上存在但投影无法映射的 data-id → null（验收：不崩溃）', () => {
    const resolver = flowchartDataIdResolver(projection)
    expect(resolver('flowchart-A-9')).toBeNull()
  })

  it('toEditorSelection 映射到 store 的 Selection 形状', () => {
    expect(toEditorSelection({ kind: 'node', id: 'B' })).toEqual({ kind: 'node', nodeId: 'B' })
    expect(toEditorSelection({ kind: 'edge', from: 'A', to: 'B', occurrence: 1 })).toEqual({
      kind: 'edge',
      from: 'A',
      to: 'B',
      occurrence: 1,
    })
  })
})
