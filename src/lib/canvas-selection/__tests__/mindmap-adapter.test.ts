import { describe, expect, it } from 'vitest'
import { mindmapParser } from '../../pipeline/mindmap'
import { buildMindmapProjection } from '../../projection/mindmap-projection'
import { mindmapDataIdResolver, mindmapDomIdOf } from '../mindmap-adapter'
import { selectionFromEventTarget } from '../data-id'

/**
 * mindmap 画布选中适配（工单 06）：mermaid mindmap 不发 data-id，节点 g 的
 * DOM id 为 `node_N`（N = 源码节点 0 起序）。适配器把 DOM id 映射回投影的
 * elementId（`mindmap-node:{N+1}`），未知 id 一律 null（尽力而为，不凭空选中）。
 */

const SAMPLE = `mindmap
  root((中心))
    分支A
`

function projectionOf() {
  const parsed = mindmapParser.parse(SAMPLE)
  if (!parsed.ok) throw new Error(`样例源码必须可解析：${parsed.error.message}`)
  return buildMindmapProjection(parsed.doc)
}

describe('mindmapDataIdResolver（工单 06）', () => {
  const resolver = mindmapDataIdResolver(projectionOf())

  it('DOM id node_N → 第 N 个节点的 elementId', () => {
    expect(resolver('node_0')).toEqual({ kind: 'node', id: 'mindmap-node:1' })
    expect(resolver('node_1')).toEqual({ kind: 'node', id: 'mindmap-node:2' })
  })

  it('mermaid v12 带 svgId 前缀的 DOM id（{svgId}-node_N）按后缀命中（工单 08）', () => {
    expect(resolver('mmd-preview-4-node_0')).toEqual({ kind: 'node', id: 'mindmap-node:1' })
    expect(resolver('mmd-preview-12-node_1')).toEqual({ kind: 'node', id: 'mindmap-node:2' })
  })

  it('未知 id（svg 根 id、越界序号）→ null', () => {
    expect(resolver('some-svg-id')).toBeNull()
    expect(resolver('node_99')).toBeNull()
  })

  it('空投影：任何 node_N 都不命中', () => {
    const empty = mindmapDataIdResolver({ nodes: [] })
    expect(empty('node_0')).toBeNull()
  })
})

describe('mindmapDomIdOf（elementId → 渲染 DOM id）', () => {
  it('mindmap-node:N → node_{N-1}', () => {
    expect(mindmapDomIdOf('mindmap-node:1')).toBe('node_0')
    expect(mindmapDomIdOf('mindmap-node:12')).toBe('node_11')
  })

  it('非 mindmap 节点 elementId → null', () => {
    expect(mindmapDomIdOf('node:B')).toBeNull()
    expect(mindmapDomIdOf('mindmap')).toBeNull()
  })
})

describe('selectionFromEventTarget 对 mindmap DOM id 的回落（工单 06）', () => {
  it('点击节点内文本：沿 DOM 向上经 g[id=node_N] 命中', () => {
    const host = document.createElement('div')
    host.innerHTML = `<svg id="m0"><g id="node_0"><rect/><text>中心</text></g></svg>`
    const selection = selectionFromEventTarget(host.querySelector('text'), mindmapDataIdResolver(projectionOf()))
    expect(selection).toEqual({ kind: 'node', id: 'mindmap-node:1' })
  })

  it('data-id 优先于 DOM id：带 data-id 的元素不再看 id', () => {
    const host = document.createElement('div')
    host.innerHTML = `<g id="other" data-id="node_1"><rect/></g>`
    const selection = selectionFromEventTarget(host.querySelector('rect'), mindmapDataIdResolver(projectionOf()))
    expect(selection).toEqual({ kind: 'node', id: 'mindmap-node:2' })
  })

  it('点在空白（无命中 id）→ null，不崩溃', () => {
    const host = document.createElement('div')
    host.innerHTML = `<svg id="m0"><rect/></svg>`
    const selection = selectionFromEventTarget(host.querySelector('rect'), mindmapDataIdResolver(projectionOf()))
    expect(selection).toBeNull()
  })
})
