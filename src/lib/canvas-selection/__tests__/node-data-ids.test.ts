import { describe, expect, it } from 'vitest'
import { annotateNodeDataIds } from '../node-data-ids'
import { nodeDataIdResolver, selectionFromEventTarget } from '../data-id'
import { applyHighlight } from '../highlight'

function svg(html: string): ParentNode {
  const root = document.createElement('div')
  root.innerHTML = html
  return root
}

describe('annotateNodeDataIds（工单 08：mermaid v12 节点 DOM id 反注 data-id）', () => {
  it('g.node 的 `{svgId}-flowchart-{id}-{n}` DOM id 反注为 data-id', () => {
    const root = svg(
      '<svg><g class="node default" id="mmd-preview-3-flowchart-A-0"><rect/></g>' +
        '<g class="node" id="mmd-preview-3-flowchart-B-1"><rect/></g></svg>',
    )
    annotateNodeDataIds(root)
    const [a, b] = root.querySelectorAll('g.node')
    expect(a.getAttribute('data-id')).toBe('A')
    expect(b.getAttribute('data-id')).toBe('B')
  })

  it('节点 id 自身含 `-` 时以尾部 `-数字` 切分', () => {
    const root = svg('<svg><g class="node" id="mmd-preview-1-flowchart-my-node-2-0"><rect/></g></svg>')
    annotateNodeDataIds(root)
    expect(root.querySelector('g.node')?.getAttribute('data-id')).toBe('my-node-2')
  })

  it('幂等：已有 data-id 的节点与重复调用不改写', () => {
    const root = svg(
      '<svg><g class="node" id="flowchart-A-0" data-id="A"><rect/></g>' +
        '<g class="node" id="flowchart-B-0"><rect/></g></svg>',
    )
    annotateNodeDataIds(root)
    annotateNodeDataIds(root)
    expect(root.querySelector('[id="flowchart-A-0"]')?.getAttribute('data-id')).toBe('A')
    expect(root.querySelector('[id="flowchart-B-0"]')?.getAttribute('data-id')).toBe('B')
  })

  it('无 id 或形态不符的 g.node 安静跳过', () => {
    const root = svg(
      '<svg><g class="node"><rect/></g><g class="node" id="node_0"><rect/></g></svg>',
    )
    annotateNodeDataIds(root)
    for (const g of root.querySelectorAll('g.node')) {
      expect(g.getAttribute('data-id')).toBeNull()
    }
  })
})

describe('annotateNodeDataIds 的 class 形态（工单 09）', () => {
  it('g.node 的 `{svgId}-classId-{类名}-{n}` DOM id 反注为 data-id（实测形态）', () => {
    const root = svg(
      '<svg><g class="node default" id="mmd-preview-21-classId-BankAccount-14">' +
        '<rect/><g class="label-group"><text>BankAccount</text></g></g>' +
        '<g class="node default" id="mmd-preview-22-classId-新类-19"><rect/></g></svg>',
    )
    annotateNodeDataIds(root)
    const [a, b] = root.querySelectorAll('g.node')
    expect(a.getAttribute('data-id')).toBe('BankAccount')
    expect(b.getAttribute('data-id')).toBe('新类')
  })

  it('类名自身含 `-` 时以尾部 `-数字` 切分', () => {
    const root = svg('<svg><g class="node" id="mmd-preview-2-classId-my-class-3-7"><rect/></g></svg>')
    annotateNodeDataIds(root)
    expect(root.querySelector('g.node')?.getAttribute('data-id')).toBe('my-class-3')
  })

  it('mindmap 的 `{svgId}-node_{N}` 与 svg 根 id 不反注（不误伤其它图种）', () => {
    const root = svg(
      '<svg id="mmd-preview-5"><g class="node" id="mmd-preview-5-node_0"><rect/></g></svg>',
    )
    annotateNodeDataIds(root)
    expect(root.querySelector('g.node')?.getAttribute('data-id')).toBeNull()
  })

  it('幂等：重复调用不改写（含 flowchart 与 class 混排）', () => {
    const root = svg(
      '<svg><g class="node" id="mmd-preview-1-flowchart-A-0" data-id="A"><rect/></g>' +
        '<g class="node" id="mmd-preview-1-classId-B-2"><rect/></g></svg>',
    )
    annotateNodeDataIds(root)
    annotateNodeDataIds(root)
    expect(root.querySelector('[id="mmd-preview-1-flowchart-A-0"]')?.getAttribute('data-id')).toBe('A')
    expect(root.querySelector('[id="mmd-preview-1-classId-B-2"]')?.getAttribute('data-id')).toBe('B')
  })
})

describe('class 节点寻址链路（工单 09：反注 data-id 后四处复用同一链路）', () => {
  const CLASS_NAMES = ['BankAccount', '新类']
  /** mermaid v12 class 图渲染产物（类框 g.node 无 data-id，只有 classId- 形态的 DOM id） */
  function classSvg(): HTMLElement {
    const root = document.createElement('div')
    root.innerHTML =
      '<svg id="mmd-preview-21">' +
      '<g class="node default" id="mmd-preview-21-classId-BankAccount-14">' +
      '<rect/><g class="label-group"><text>BankAccount</text></g></g>' +
      '<g class="node default" id="mmd-preview-21-classId-新类-19">' +
      '<rect/><g class="label-group"><text>新类</text></g></g>' +
      '<path id="BankAccount-Account-1" data-id="id_BankAccount_Account_1"/>' +
      '</svg>'
    annotateNodeDataIds(root)
    return root
  }

  it('左键点类框内的文本 → 沿 DOM 向上命中类选中（目标 1）', () => {
    const root = classSvg()
    const text = root.querySelectorAll('text')[1]
    expect(selectionFromEventTarget(text, nodeDataIdResolver(CLASS_NAMES))).toEqual({
      kind: 'node',
      id: '新类',
    })
  })

  it('类框带 data-id 后高亮按 data-id 命中（目标 1 的外圈高亮）', () => {
    const root = classSvg()
    applyHighlight(root, 'BankAccount')
    const marked = root.querySelectorAll('[data-vm-selected]')
    expect(marked).toHaveLength(1)
    expect(marked[0].getAttribute('id')).toBe('mmd-preview-21-classId-BankAccount-14')
  })

  it('点 class 关系边（data-id 为 id_*）不产生选中、不崩溃（空白菜单语义）', () => {
    const root = classSvg()
    expect(selectionFromEventTarget(root.querySelector('path'), nodeDataIdResolver(CLASS_NAMES))).toBeNull()
  })
})
