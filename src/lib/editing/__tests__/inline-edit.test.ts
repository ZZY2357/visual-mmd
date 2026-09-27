import { describe, expect, it } from 'vitest'
import type { ProjectionMindmapNode } from '../../projection/mindmap-projection'
import type { CanvasSelection } from '../../canvas-selection/data-id'
import {
  inlineEditCommitOf,
  inlineEditTargetFromEvent,
  overlayRectInContainer,
  toRect,
} from '../inline-edit'

/**
 * 工单 05 内联编辑纯逻辑：
 * - 双击目标 → 编辑对象（flowchart data-id 精确匹配；mindmap 文本尽力匹配）
 * - 输入值 → 提交动作（未改动/清空不落码）
 * - 节点包围盒 → 相对画布容器的浮层定位
 */

const MINDMAP_NODES: ProjectionMindmapNode[] = [
  { elementId: 'mindmap-node:1', text: '根节点', shapeType: null, icon: null, depth: 0, parentId: null },
  { elementId: 'mindmap-node:2', text: '子节点', shapeType: null, icon: null, depth: 1, parentId: 'mindmap-node:1' },
]

function el(html: string): Element {
  const host = document.createElement('div')
  host.innerHTML = html
  return host.firstElementChild as Element
}

describe('inlineEditTargetFromEvent（双击目标 → 编辑对象）', () => {
  const flowResolver = (dataId: string): CanvasSelection | null =>
    dataId === 'A' ? { kind: 'node', id: 'A' } : null

  it('flowchart：沿 DOM 向上找 data-id 命中节点', () => {
    const path = el('<g data-id="A"><rect/><text>开始</text></g>')
    expect(inlineEditTargetFromEvent(path.querySelector('text'), flowResolver)).toEqual({
      kind: 'flowchart',
      nodeId: 'A',
    })
  })

  it('data-id 命中边（kind=edge）不进入编辑', () => {
    const edgeResolver = (dataId: string): CanvasSelection | null =>
      dataId === 'L_A_B_0' ? { kind: 'edge', from: 'A', to: 'B', occurrence: 1 } : null
    const path = el('<path data-id="L_A_B_0"/>')
    expect(inlineEditTargetFromEvent(path, edgeResolver)).toBeNull()
  })

  it('mindmap：无 data-id，按可见文本对投影节点尽力匹配（kind=mindmap 才回落文本）', () => {
    const text = el('<g class="label"><text>子节点</text></g>')
    expect(inlineEditTargetFromEvent(text, null, MINDMAP_NODES, 'mindmap')).toEqual({
      kind: 'mindmap',
      elementId: 'mindmap-node:2',
    })
  })

  it('mindmap：resolver 命中（画布点选的 DOM id 映射）→ 按图种改写为 mindmap 目标', () => {
    const mmResolver = (dataId: string): CanvasSelection | null =>
      dataId === 'node_1' ? { kind: 'node', id: 'mindmap-node:2' } : null
    const g = el('<g id="node_1"><text>子节点</text></g>')
    expect(inlineEditTargetFromEvent(g.querySelector('text'), mmResolver, MINDMAP_NODES, 'mindmap')).toEqual({
      kind: 'mindmap',
      elementId: 'mindmap-node:2',
    })
  })

  it('mindmap：文本匹配不上（点空白处/未知元素）返回 null，不进入编辑', () => {
    const other = el('<g><text>别的</text></g>')
    expect(inlineEditTargetFromEvent(other, null, MINDMAP_NODES, 'mindmap')).toBeNull()
  })

  it('mindmap：resolver 命中优先于文本匹配（命中 id ≠ 文本对应的 elementId 即证明）', () => {
    const node = el('<g data-id="A"><text>子节点</text></g>')
    expect(inlineEditTargetFromEvent(node, flowResolver, MINDMAP_NODES, 'mindmap')).toEqual({
      kind: 'mindmap',
      elementId: 'A', // resolver 命中的 id 原样作为 elementId，而非文本匹配到的 :2
    })
  })

  it('kind=flowchart：resolver 未命中不回落 mindmap 文本匹配', () => {
    const other = el('<g><text>子节点</text></g>')
    expect(inlineEditTargetFromEvent(other, null, MINDMAP_NODES, 'flowchart')).toBeNull()
  })
})

describe('inlineEditCommitOf（输入值 → 提交动作）', () => {
  it('flowchart：文本变化 → set-node-text 意图（ nodeId 寻址，文本去首尾空白）', () => {
    expect(
      inlineEditCommitOf({ kind: 'flowchart', nodeId: 'A' }, '  新文本  ', '旧文本'),
    ).toEqual({ action: 'commit', intent: { type: 'set-node-text', nodeId: 'A', text: '新文本' } })
  })

  it('文本未变化 → unchanged（关闭输入框，不落码）', () => {
    expect(inlineEditCommitOf({ kind: 'flowchart', nodeId: 'A' }, '旧文本', '旧文本')).toEqual({
      action: 'unchanged',
    })
  })

  it('清空文本 → unchanged（新建节点保留默认名）', () => {
    expect(inlineEditCommitOf({ kind: 'mindmap', elementId: 'mindmap-node:1' }, '   ', '根')).toEqual({
      action: 'unchanged',
    })
  })

  it('mindmap：文本变化 → set-node-text 意图（elementId 寻址）', () => {
    expect(
      inlineEditCommitOf({ kind: 'mindmap', elementId: 'mindmap-node:2' }, '改名', '旧名'),
    ).toEqual({
      action: 'commit',
      intent: { type: 'set-node-text', elementId: 'mindmap-node:2', text: '改名' },
    })
  })
})

describe('overlayRectInContainer（浮层定位）', () => {
  it('节点包围盒减去容器原点；宽高保持节点尺寸（视图变换已含在包围盒里）', () => {
    const overlay = overlayRectInContainer(
      toRect({ left: 100, top: 50, width: 400, height: 300 }),
      toRect({ left: 190, top: 98, width: 60, height: 24 }),
    )
    expect(overlay).toEqual({ left: 90, top: 48, width: 60, height: 24 })
  })
})
