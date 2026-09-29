import { describe, expect, it } from 'vitest'
import { measureNodeExtents } from '../canvas-measure'
import type { Rect } from '../inline-edit'

/** 给元素桩一个固定的 getBoundingClientRect（happy-dom 无真实布局）。 */
function stubRect(el: Element, r: Rect): void {
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () =>
      ({
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
        right: r.left + r.width,
        bottom: r.top + r.height,
        x: r.left,
        y: r.top,
        toJSON: () => ({}),
      }) as DOMRect,
  })
}

/** 建一个容器（含原点桩）+ 一个作为测量 root 的宿主 SVG 包裹层。 */
function buildFixture(containerAt: { left: number; top: number }) {
  const container = document.createElement('div')
  stubRect(container, { left: containerAt.left, top: containerAt.top, width: 468, height: 569 })
  const root = document.createElement('div')
  container.appendChild(root)
  return { container, root }
}

describe('画布节点位置测量（工单 14）', () => {
  it('data-id 精确匹配：返回该元素矩形，并已减去容器原点', () => {
    const { container, root } = buildFixture({ left: 10, top: 20 })
    root.innerHTML = `<svg><g data-id="A"><rect/></g></svg>`
    const g = root.querySelector('g')!
    stubRect(g, { left: 100, top: 150, width: 30, height: 40 })

    const extents = measureNodeExtents(container, root, ['A'])

    expect(extents.get('A')).toEqual({ left: 90, top: 130, width: 30, height: 40 })
  })

  it('按 DOM id 后缀匹配（mermaid v12 的 svgId 前缀形态：{svgId}-node_N）', () => {
    const { container, root } = buildFixture({ left: 0, top: 0 })
    root.innerHTML = `<svg id="mermaid-1"><g id="mermaid-1-node_0"><rect/></g></svg>`
    const g = root.querySelector('g')!
    stubRect(g, { left: 50, top: 60, width: 45, height: 45 })

    const extents = measureNodeExtents(container, root, ['node_0'])

    expect(extents.get('node_0')).toEqual({ left: 50, top: 60, width: 45, height: 45 })
  })

  it('DOM id 精确相等匹配（mindmap 节点 g id = node_N）', () => {
    const { container, root } = buildFixture({ left: 0, top: 0 })
    root.innerHTML = `<svg id="m0"><g id="node_1"><rect/></g></svg>`
    const g = root.querySelector('g')!
    stubRect(g, { left: 5, top: 6, width: 7, height: 8 })

    const extents = measureNodeExtents(container, root, ['node_1'])

    expect(extents.get('node_1')).toEqual({ left: 5, top: 6, width: 7, height: 8 })
  })

  it('并集：同一 dataId 命中生命线与顶部实例两个元素时取外接矩形并集（让「位置」与高亮同一集合）', () => {
    const { container, root } = buildFixture({ left: 10, top: 10 })
    // sequence 参与者：生命线 line.actor-line + 顶部实例 g（底部实例不带 data-id）。
    root.innerHTML = `
      <svg>
        <line class="actor-line" data-id="使用者" />
        <g data-id="使用者"><rect/></g>
      </svg>`
    const line = root.querySelector('line')!
    const top = root.querySelector('g')!
    stubRect(line, { left: 100, top: 50, width: 2, height: 300 }) // bottom = 350
    stubRect(top, { left: 80, top: 30, width: 40, height: 30 }) // right = 120, bottom = 60

    const extents = measureNodeExtents(container, root, ['使用者'])
    const rect = extents.get('使用者')

    // 并集 = 外接矩形（非任一元素本身）。
    expect(rect).toEqual({ left: 70, top: 20, width: 40, height: 320 })
    expect(rect).not.toEqual({ left: 70, top: 40, width: 40, height: 30 })
    expect(rect).not.toEqual({ left: 90, top: 40, width: 2, height: 300 })
  })

  it('找不到元素：该 dataId 不出现在 Map 里（不抛错、无空条目）', () => {
    const { container, root } = buildFixture({ left: 0, top: 0 })
    root.innerHTML = `<svg><g data-id="A"><rect/></g></svg>`

    const extents = measureNodeExtents(container, root, ['不存在'])

    expect(extents.has('不存在')).toBe(false)
    expect(extents.size).toBe(0)
  })

  it('多个 dataId：键集合与传入顺序一致，未命中的被跳过', () => {
    const { container, root } = buildFixture({ left: 0, top: 0 })
    root.innerHTML = `
      <svg>
        <g id="m0-node_0"><rect/></g>
        <g id="m0-node_1"><rect/></g>
      </svg>`
    const [n0, n1] = Array.from(root.querySelectorAll('g'))
    stubRect(n0, { left: 0, top: 0, width: 10, height: 10 })
    stubRect(n1, { left: 100, top: 0, width: 10, height: 10 })

    const extents = measureNodeExtents(container, root, ['node_1', '缺失', 'node_0'])

    expect(Array.from(extents.keys())).toEqual(['node_1', 'node_0'])
    expect(extents.get('node_1')).toEqual({ left: 100, top: 0, width: 10, height: 10 })
    expect(extents.get('node_0')).toEqual({ left: 0, top: 0, width: 10, height: 10 })
  })

  it('root === null：返回空 Map（不抛错）', () => {
    const container = document.createElement('div')
    expect(measureNodeExtents(container, null, ['A']).size).toBe(0)
  })

  it('容器原点非 (0,0)：结果相对容器（overlayRectInContainer 的减法生效）', () => {
    const { container, root } = buildFixture({ left: 436, top: 135 })
    root.innerHTML = `<svg><g data-id="A"><rect/></g></svg>`
    const g = root.querySelector('g')!
    stubRect(g, { left: 656, top: 189, width: 48, height: 32 })

    const extents = measureNodeExtents(container, root, ['A'])

    expect(extents.get('A')).toEqual({ left: 220, top: 54, width: 48, height: 32 })
  })
})
