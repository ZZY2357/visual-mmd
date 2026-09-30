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
  { elementId: 'mindmap-node:1', text: '根节点', id: null, shapeType: null, icon: null, depth: 0, parentId: null },
  { elementId: 'mindmap-node:2', text: '子节点', id: null, shapeType: null, icon: null, depth: 1, parentId: 'mindmap-node:1' },
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

describe('inlineEditTargetFromEvent（工单 05：class / sequence 双击只改显示文本）', () => {
  const classResolver = (dataId: string): CanvasSelection | null =>
    dataId === 'Foo' ? { kind: 'node', id: 'Foo' } : dataId === 'relation:1' ? { kind: 'element', elementId: 'relation:1' } : null

  it('class：双击类名文本 → {kind:class}（等价 rename-class）', () => {
    const g = el('<g data-id="Foo"><text>Foo</text><text>+String name</text></g>')
    const title = g.querySelectorAll('text')[0]
    expect(inlineEditTargetFromEvent(title, classResolver, [], 'class')).toEqual({ kind: 'class', name: 'Foo' })
  })

  it('class：双击成员正文 → null（不做内联编辑，双击节点内另一行会与"选中节点"打架）', () => {
    const g = el('<g data-id="Foo"><text>Foo</text><text>+String name</text></g>')
    const member = g.querySelectorAll('text')[1]
    expect(inlineEditTargetFromEvent(member, classResolver, [], 'class')).toBeNull()
  })

  it('class：双击关系边（resolver 命中 element）→ null（关系标签不做双击）', () => {
    const path = el('<path data-id="relation:1"/>')
    expect(inlineEditTargetFromEvent(path, classResolver, [], 'class')).toBeNull()
  })

  it('sequence：双击参与者 → {kind:sequence-alias}（改 as 别名，actorId 不变）', () => {
    const seqResolver = (dataId: string): CanvasSelection | null =>
      dataId === '甲' ? { kind: 'node', id: '甲' } : dataId === 'message:1' ? { kind: 'element', elementId: 'message:1' } : null
    const g = el('<g data-id="甲"><text>甲</text></g>')
    expect(inlineEditTargetFromEvent(g.querySelector('text'), seqResolver, [], 'sequence')).toEqual({
      kind: 'sequence-alias',
      actorId: '甲',
    })
  })

  it('sequence：双击消息（resolver 命中 element）→ null（消息文本不做双击）', () => {
    const seqResolver = (dataId: string): CanvasSelection | null =>
      dataId === 'message:1' ? { kind: 'element', elementId: 'message:1' } : null
    const line = el('<line data-id="message:1"/>')
    expect(inlineEditTargetFromEvent(line, seqResolver, [], 'sequence')).toBeNull()
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

  // 工单 04：空白右键新建的 class / sequence 直入命名，编辑的是语法名
  it('class：类名变化 → rename-class 意图（中文类名合法）', () => {
    expect(inlineEditCommitOf({ kind: 'class', name: '新类' }, ' 订单 ', '新类')).toEqual({
      action: 'commit',
      intent: { type: 'rename-class', name: '新类', newName: '订单' },
    })
  })

  it('class：非法类名（含空格）→ invalid（不落码）', () => {
    expect(inlineEditCommitOf({ kind: 'class', name: '新类' }, 'Order Item', '新类')).toEqual({
      action: 'invalid',
    })
  })

  it('class：名字未改动 → unchanged', () => {
    expect(inlineEditCommitOf({ kind: 'class', name: '新类' }, '新类', '新类')).toEqual({ action: 'unchanged' })
  })

  it('sequence：参与者 id 变化 → rename-participant 意图（不生成 alias）', () => {
    expect(inlineEditCommitOf({ kind: 'sequence', actorId: '新参与者' }, '服务端', '新参与者')).toEqual({
      action: 'commit',
      intent: { type: 'rename-participant', actorId: '新参与者', newId: '服务端' },
    })
  })

  it('sequence：非法参与者 id（含空格或冒号）→ invalid', () => {
    expect(inlineEditCommitOf({ kind: 'sequence', actorId: '新参与者' }, 'a b', '新参与者')).toEqual({
      action: 'invalid',
    })
    expect(inlineEditCommitOf({ kind: 'sequence', actorId: '新参与者' }, 'a:b', '新参与者')).toEqual({
      action: 'invalid',
    })
  })

  // 工单 05：双击既有参与者改 `as` 别名（显示文本），actorId 不参与改动
  it('sequence-alias：文本变化 → set-participant（改 as 别名，actorId 不变）', () => {
    expect(inlineEditCommitOf({ kind: 'sequence-alias', actorId: '甲' }, ' 用户 ', '')).toEqual({
      action: 'commit',
      intent: { type: 'set-participant', actorId: '甲', alias: '用户' },
    })
  })

  it('sequence-alias：清空 → unchanged（去掉别名走属性面板，只做改显示文本）', () => {
    expect(inlineEditCommitOf({ kind: 'sequence-alias', actorId: '甲' }, '   ', '用户')).toEqual({
      action: 'unchanged',
    })
  })

  it('sequence-alias：别名未改动 → unchanged', () => {
    expect(inlineEditCommitOf({ kind: 'sequence-alias', actorId: '甲' }, '用户', '用户')).toEqual({
      action: 'unchanged',
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

describe('inlineEditTargetFromEvent / inlineEditCommitOf（more-diagrams 工单 11：gantt 双击改任务名）', () => {
  // 真实口径：data-id = mermaid 渲染 id（taskId），resolver 把它映射回位置序 elementId
  const ganttResolver = (dataId: string): CanvasSelection | null =>
    dataId === 'a1' ? { kind: 'node', id: 'task:1' } : null

  it('gantt：双击任务条（rect，data-id = 渲染 id）→ elementId 与 taskId 一次取齐', () => {
    const rect = el('<svg><rect id="g-1-a1" data-id="a1"/></svg>').querySelector('rect')!
    expect(inlineEditTargetFromEvent(rect, ganttResolver, [], 'gantt')).toEqual({
      kind: 'gantt-task',
      elementId: 'task:1',
      taskId: 'a1',
    })
  })

  it('gantt：双击任务文本（text，DOM id 带 -text 后缀）同样命中', () => {
    const text = el(
      '<svg><rect id="g-1-a1" data-id="a1"/><text id="g-1-a1-text" data-id="a1">需求梳理</text></svg>',
    ).querySelector('text')!
    expect(inlineEditTargetFromEvent(text, ganttResolver, [], 'gantt')).toEqual({
      kind: 'gantt-task',
      elementId: 'task:1',
      taskId: 'a1',
    })
  })

  it('gantt：点空白处（无 data-id，resolver 不命中）→ null，不进入编辑', () => {
    const other = el('<svg><text>别的</text></svg>')
    expect(inlineEditTargetFromEvent(other, ganttResolver, [], 'gantt')).toBeNull()
  })

  it('gantt：名字变化 → set-task-name 意图（位置序 elementId 寻址，taskId 只用于定位）', () => {
    expect(
      inlineEditCommitOf({ kind: 'gantt-task', elementId: 'task:1', taskId: 'a1' }, ' 需求评审 ', '需求梳理'),
    ).toEqual({
      action: 'commit',
      intent: { type: 'set-task-name', elementId: 'task:1', name: '需求评审' },
    })
  })

  it('gantt：非法任务名（含冒号）→ invalid；清空 → unchanged（不落码）', () => {
    expect(inlineEditCommitOf({ kind: 'gantt-task', elementId: 'task:1', taskId: 'a1' }, 'a:b', '需求梳理')).toEqual({
      action: 'invalid',
    })
    expect(inlineEditCommitOf({ kind: 'gantt-task', elementId: 'task:1', taskId: 'a1' }, '  ', '需求梳理')).toEqual({
      action: 'unchanged',
    })
  })
})
