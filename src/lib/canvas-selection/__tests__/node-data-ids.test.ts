import { describe, expect, it } from 'vitest'
import { annotateNodeDataIds } from '../node-data-ids'

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
