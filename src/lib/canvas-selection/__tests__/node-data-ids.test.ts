import { describe, expect, it } from 'vitest'
import { annotateNodeDataIds } from '../node-data-ids'
import { nodeDataIdResolver, selectionFromEventTarget } from '../data-id'
import { applyHighlight } from '../highlight'
import { kanbanDataIdResolver } from '../kanban-adapter'
import { buildKanbanProjection } from '../../projection/kanban-projection'
import { kanbanParser } from '../../pipeline/kanban'

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

describe('kanban 节点寻址链路（more-diagrams 工单 06）', () => {
  const KANBAN_SOURCE = `kanban
  Todo[待办]
    t1[写代码]
  Done[已完成]
`
  /** mermaid v12 kanban 渲染产物：列在 g.sections > g.cluster、卡片在 g.items > g.node，
   * DOM id 都是 `{svgId}-{节点id}`（无词元、无序号后缀） */
  function kanbanSvg(): HTMLElement {
    const root = document.createElement('div')
    root.innerHTML =
      '<svg id="mmd-preview-7">' +
      '<g class="sections">' +
      '<g class="cluster" id="mmd-preview-7-Todo"><rect/></g>' +
      '<g class="cluster" id="mmd-preview-7-Done"><rect/></g>' +
      '</g>' +
      '<g class="items">' +
      '<g class="node" id="mmd-preview-7-t1"><rect/><text>写代码</text></g>' +
      '</g>' +
      '</svg>'
    annotateNodeDataIds(root)
    return root
  }

  it('以 svg 根 id 剥离前缀，反注 g.cluster / g.node 的 data-id（作用域限定 sections/items）', () => {
    const root = kanbanSvg()
    expect(root.querySelector('[id="mmd-preview-7-Todo"]')?.getAttribute('data-id')).toBe('Todo')
    expect(root.querySelector('[id="mmd-preview-7-Done"]')?.getAttribute('data-id')).toBe('Done')
    expect(root.querySelector('[id="mmd-preview-7-t1"]')?.getAttribute('data-id')).toBe('t1')
  })

  it('包裹组之外的 g.node 不反注（不误伤其它图种）', () => {
    const root = document.createElement('div')
    root.innerHTML =
      '<svg id="mmd-preview-8">' +
      '<g class="node" id="mmd-preview-8-孤立"><rect/></g>' +
      '</svg>'
    annotateNodeDataIds(root)
    expect(root.querySelector('g.node')?.getAttribute('data-id')).toBeNull()
  })

  it('反注后可经 kanbanDataIdResolver + selectionFromEventTarget 命中列 / 卡片选中', () => {
    const root = kanbanSvg()
    const parsed = kanbanParser.parse(KANBAN_SOURCE)
    if (!parsed.ok) throw new Error('解析失败')
    const resolve = kanbanDataIdResolver(buildKanbanProjection(parsed.doc))
    expect(selectionFromEventTarget(root.querySelector('[id="mmd-preview-7-t1"] text'), resolve)).toEqual({
      kind: 'node',
      id: 'kanban-card:t1',
    })
    expect(selectionFromEventTarget(root.querySelector('[id="mmd-preview-7-Todo"] rect'), resolve)).toEqual({
      kind: 'node',
      id: 'kanban-column:Todo',
    })
  })
})

describe('requirement 节点寻址链路（more-diagrams 工单 07）', () => {
  /** mermaid v12 requirement 渲染产物：unified → dagre 布局器，g.node 落在 g.root > g.nodes，
   * DOM id = `{svgId}-{名字}`（无词元、无序号后缀） */
  function requirementSvg(): HTMLElement {
    const root = document.createElement('div')
    root.innerHTML =
      '<svg id="mmd-preview-9">' +
      '<g class="root">' +
      '<g class="nodes">' +
      '<g class="node" id="mmd-preview-9-login"><rect/></g>' +
      '<g class="node" id="mmd-preview-9-loginUI"><rect/></g>' +
      '<g class="node" id="mmd-preview-9-node_3"><rect/></g>' +
      '</g>' +
      '<g class="edgePaths"><path/></g>' +
      '</g>' +
      '</svg>'
    annotateNodeDataIds(root)
    return root
  }

  it('作用域内（g.root > g.nodes）以 svg 根 id 前缀剥离反注 data-id = 名字', () => {
    const root = requirementSvg()
    expect(root.querySelector('[id="mmd-preview-9-login"]')?.getAttribute('data-id')).toBe('login')
    expect(root.querySelector('[id="mmd-preview-9-loginUI"]')?.getAttribute('data-id')).toBe('loginUI')
  })

  it('mindmap 身份（node_{N}）显式让位；作用域外的孤立 g.node 不反注（不误伤，工单 06 约定）', () => {
    const root = requirementSvg()
    expect(root.querySelector('[id="mmd-preview-9-node_3"]')?.getAttribute('data-id')).toBeNull()
    const isolated = document.createElement('div')
    isolated.innerHTML =
      '<svg id="mmd-preview-10">' +
      '<g class="node" id="mmd-preview-10-孤立"><rect/></g>' +
      '</svg>'
    annotateNodeDataIds(isolated)
    expect(isolated.querySelector('g.node')?.getAttribute('data-id')).toBeNull()
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
