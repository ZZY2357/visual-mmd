import { act, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetEditorHistory, useEditorStore } from '../../../store/editor'
import { DEFAULT_DIAGRAM_SOURCE } from '../../../lib/storage'
import { initI18n } from '../../../i18n'
import { flowchartParser } from '../../pipeline/flowchart'
import { mindmapParser } from '../../pipeline/mindmap'
import { classParser } from '../../pipeline/class'
import { sequenceParser } from '../../pipeline/sequence'
import { buildFlowchartProjection } from '../../projection/flowchart-projection'
import { buildMindmapProjection } from '../../projection/mindmap-projection'
import { buildClassProjection } from '../../projection/class-projection'
import { buildSequenceProjection } from '../../projection/sequence-projection'
import { flowchartDataIdResolver } from '../../canvas-selection/flowchart-adapter'
import { mindmapDataIdResolver } from '../../canvas-selection/mindmap-adapter'
import { nodeDataIdResolver } from '../../canvas-selection/data-id'
import type { AnyProjection } from '../../diagram-registry'
import { useCanvasContextMenu, type NodeFormState } from '../use-canvas-context-menu'
import { AddMemberInlineForm, AddRelationInlineForm } from '../../../components/class-forms'
import { AddMessageInlineForm } from '../../../components/sequence-forms'
import type { CanvasInlineEditTarget } from '../inline-edit'
import type { ContextMenuTarget } from '../context-menu'
import type { LinkModeState } from '../link-mode'

/**
 * 画布右键菜单 Hook（工单 07/04/06）：右键弹出随目标变化的菜单并联动选中；
 * 添加节点走编辑意图管线并回调内联命名；连线模式两步落码连线、Esc 取消；
 * 添加样式表单提交才落码；class/sequence 节点菜单的添加型表单提交才落码（工单 06）。
 */

initI18n()

const SAMPLE = `flowchart TD
    A[开始] --> B[处理]
    C[结束]
`

const MINDMAP_SAMPLE = `mindmap
  root((中心))
    分支A
      叶子
    分支B
`

const SVG_STUB =
  '<svg><g data-id="A">开始</g><g data-id="B">处理</g><g data-id="C">结束</g><path data-id="L_A_B_0"></path></svg>'

const MINDMAP_SVG_STUB = '<svg><g id="node_0">中心</g><g id="node_1">分支A</g></svg>'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

function flowProjectionOf(source: string) {
  const parsed = flowchartParser.parse(source)
  if (!parsed.ok) throw new Error(`样例源码必须可解析：${parsed.error.message}`)
  return { type: 'flowchart' as const, flowchart: buildFlowchartProjection(parsed.doc) }
}

function mindmapProjectionOf(source: string) {
  const parsed = mindmapParser.parse(source)
  if (!parsed.ok) throw new Error(`样例源码必须可解析：${parsed.error.message}`)
  return { type: 'mindmap' as const, mindmap: buildMindmapProjection(parsed.doc) }
}

function classProjectionOf(source: string) {
  const parsed = classParser.parse(source)
  if (!parsed.ok) throw new Error(`样例源码必须可解析：${parsed.error.message}`)
  return { type: 'class' as const, class: buildClassProjection(parsed.doc) }
}

function sequenceProjectionOf(source: string) {
  const parsed = sequenceParser.parse(source)
  if (!parsed.ok) throw new Error(`样例源码必须可解析：${parsed.error.message}`)
  return { type: 'sequence' as const, sequence: buildSequenceProjection(parsed.doc) }
}

/** 图种 → data-id resolver（与 CanvasPanel 的 resolverOf 同约定） */
function resolverOf(projection: AnyProjection) {
  if (projection.type === 'flowchart') return flowchartDataIdResolver(projection.flowchart)
  if (projection.type === 'mindmap') return mindmapDataIdResolver(projection.mindmap)
  if (projection.type === 'sequence') return nodeDataIdResolver(projection.sequence.participants.map((p) => p.actorId))
  return nodeDataIdResolver(projection.class.classes.map((c) => c.name))
}

/** 内联编辑目标 → 便于断言的字符串 */
function createdIdOf(target: CanvasInlineEditTarget): string {
  switch (target.kind) {
    case 'flowchart':
      return target.nodeId
    case 'mindmap':
      return target.elementId
    case 'class':
      return target.name
    case 'sequence':
      return target.actorId
  }
}

interface MenuSnapshot {
  menu: { target: ContextMenuTarget; items: string[] } | null
  linkMode: LinkModeState
  styleForm: unknown
  nodeForm: NodeFormState | null
}

interface ContextMenuApi {
  onCanvasClick: (e: { target: EventTarget | null }) => boolean
  addNode: () => void
  addClass: () => void
  addParticipant: () => void
  addMindmapRoot: () => void
  addMember: () => void
  addRelation: () => void
  addMessage: () => void
  enterLinkMode: (from?: string) => void
  addSubgraph: () => void
  applyStyle: (name: string) => void
  deleteTarget: () => void
  addChildToMindmap: () => void
  beginEditText: () => void
  submitStyleForm: (name: string, color: string) => boolean
  openStyleForm: () => void
  closeStyleForm: () => void
}

function Harness(props: {
  projection: AnyProjection
  svg: string
  onState: (s: MenuSnapshot) => void
  apiRef: { current: ContextMenuApi | null }
  onNodeCreated?: (target: CanvasInlineEditTarget) => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const ctx = useCanvasContextMenu({
    projection: props.projection,
    resolver: resolverOf(props.projection),
    containerRef: ref,
    onNodeCreated: props.onNodeCreated,
    newNodeText: '新节点',
  })
  props.apiRef.current = {
    onCanvasClick: ctx.onCanvasClick as never,
    addNode: ctx.addNode,
    addClass: ctx.addClass,
    addParticipant: ctx.addParticipant,
    addMindmapRoot: ctx.addMindmapRoot,
    addMember: ctx.addMember,
    addRelation: ctx.addRelation,
    addMessage: ctx.addMessage,
    enterLinkMode: ctx.enterLinkMode,
    addSubgraph: ctx.addSubgraph,
    applyStyle: ctx.applyStyle,
    deleteTarget: ctx.deleteTarget,
    addChildToMindmap: ctx.addChildToMindmap,
    beginEditText: ctx.beginEditText,
    submitStyleForm: ctx.submitStyleForm,
    openStyleForm: ctx.openStyleForm,
    closeStyleForm: ctx.closeStyleForm,
  }
  useEffect(() => {
    props.onState({
      menu: ctx.menu !== null ? { target: ctx.menu.target, items: ctx.menu.items } : null,
      linkMode: ctx.linkMode,
      styleForm: ctx.styleForm,
      nodeForm: ctx.nodeForm,
    })
  })
  // 节点菜单的添加型表单：与 CanvasPanel 同样的接线（提交才落码，锚点为右键节点的声明）
  return (
    <div ref={ref} tabIndex={0} onContextMenu={ctx.onContextMenu}>
      <div dangerouslySetInnerHTML={{ __html: props.svg }} />
      {ctx.nodeForm !== null && props.projection.type === 'class' && ctx.nodeForm.kind === 'member' && (
        <MantineProvider>
          <AddMemberInlineForm
            classes={props.projection.class.classes}
            initialClassName={ctx.nodeForm.className}
            afterElementId={ctx.nodeForm.anchorElementId}
            onDone={ctx.closeNodeForm}
          />
        </MantineProvider>
      )}
      {ctx.nodeForm !== null && props.projection.type === 'class' && ctx.nodeForm.kind === 'relation' && (
        <MantineProvider>
          <AddRelationInlineForm
            classes={props.projection.class.classes}
            initialFrom={ctx.nodeForm.className}
            afterElementId={ctx.nodeForm.anchorElementId}
            onDone={ctx.closeNodeForm}
          />
        </MantineProvider>
      )}
      {ctx.nodeForm !== null && props.projection.type === 'sequence' && ctx.nodeForm.kind === 'message' && (
        <MantineProvider>
          <AddMessageInlineForm
            participants={props.projection.sequence.participants}
            initialFrom={ctx.nodeForm.from}
            afterElementId={ctx.nodeForm.anchorElementId}
            onDone={ctx.closeNodeForm}
          />
        </MantineProvider>
      )}
    </div>
  )
}

describe('useCanvasContextMenu（工单 07 右键菜单）', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let snapshots: MenuSnapshot[]
  let api: { current: ContextMenuApi | null }
  let created: string[]

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    snapshots = []
    api = { current: null }
    created = []
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
    useEditorStore.getState().select(null)
  })

  function mountFlow() {
    resetEditorHistory(SAMPLE)
    act(() => {
      root.render(
        <Harness
          projection={flowProjectionOf(SAMPLE)}
          svg={SVG_STUB}
          onState={(s) => snapshots.push(s)}
          apiRef={api}
          onNodeCreated={(t) => created.push(createdIdOf(t))}
        />,
      )
    })
    return host.firstElementChild as HTMLDivElement
  }

  function contextMenuOn(container: Element, selector: string): boolean {
    return contextMenuOnEl(container.querySelector(selector)!)
  }

  /** 直接在元素上右键（dispatch 包在 act 里让 React 状态同步刷新） */
  function contextMenuOnEl(el: Element): boolean {
    let prevented = false
    act(() => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
      el.dispatchEvent(event)
      prevented = event.defaultPrevented
    })
    return prevented
  }

  it('右键节点：阻止默认菜单，菜单为节点动作并联动选中', () => {
    const container = mountFlow()

    expect(contextMenuOn(container, '[data-id="A"]')).toBe(true)

    const last = snapshots.at(-1)!
    expect(last.menu?.target).toEqual({ kind: 'flowchart-node', nodeId: 'A' })
    expect(last.menu?.items).toEqual(['link-from-here', 'edit-text', 'apply-style', 'delete'])
    expect(useEditorStore.getState().selection).toEqual({ kind: 'node', nodeId: 'A' })
  })

  it('右键连线：菜单为编辑标签/删除', () => {
    const container = mountFlow()

    expect(contextMenuOn(container, 'path[data-id="L_A_B_0"]')).toBe(true)

    const last = snapshots.at(-1)!
    expect(last.menu?.target).toEqual({ kind: 'flowchart-edge', from: 'A', to: 'B', occurrence: 1 })
    expect(last.menu?.items).toEqual(['edit-label', 'delete'])
    expect(useEditorStore.getState().selection).toEqual({ kind: 'edge', from: 'A', to: 'B', occurrence: 1 })
  })

  it('右键空白：flowchart 弹添加类菜单，不改变选中', () => {
    const container = mountFlow()

    // 右键 SVG 包裹 div（无 data-id）= 空白处
    expect(contextMenuOnEl(container.firstElementChild as HTMLElement)).toBe(true)

    const last = snapshots.at(-1)!
    expect(last.menu?.target).toEqual({ kind: 'blank', diagramType: 'flowchart' })
    expect(last.menu?.items).toEqual(['add-node', 'link-mode', 'add-style', 'add-subgraph'])
  })

  it('菜单「添加节点」：落码新节点、选中并回调内联命名', () => {
    mountFlow()

    act(() => api.current!.addNode())

    expect(useEditorStore.getState().source).toContain('n1[n1]')
    expect(useEditorStore.getState().selection).toEqual({ kind: 'node', nodeId: 'n1' })
    expect(created).toEqual(['n1'])
  })

  it('菜单「删除」：删除右键节点并清空选中', () => {
    mountFlow()
    act(() => contextMenuOn(host.firstElementChild as HTMLDivElement, '[data-id="C"]'))
    snapshots.length = 0

    act(() => api.current!.deleteTarget())

    expect(useEditorStore.getState().source).not.toContain('C[结束]')
    expect(useEditorStore.getState().selection).toBeNull()
    expect(snapshots.at(-1)!.menu).toBeNull()
  })

  it('「从这里连线」预选起点，单击终点即落码连线', () => {
    const container = mountFlow()

    act(() => api.current!.enterLinkMode('A'))
    expect(snapshots.at(-1)!.linkMode).toEqual({ stage: 'pick-end', from: 'A' })
    // 单击终点（走 onCanvasClick 消费链路）
    act(() => api.current!.onCanvasClick({ target: container.querySelector('[data-id="B"]') }))

    expect(useEditorStore.getState().source).toContain('A --> B')
    expect(useEditorStore.getState().selection).toEqual({ kind: 'edge', from: 'A', to: 'B', occurrence: 1 })
    expect(snapshots.at(-1)!.linkMode).toEqual({ stage: 'idle' })
  })

  it('连线模式两步：单击起点、单击终点创建连线；点击空白取消', () => {
    const container = mountFlow()

    act(() => api.current!.enterLinkMode())
    act(() => api.current!.onCanvasClick({ target: container.querySelector('[data-id="C"]') }))
    expect(snapshots.at(-1)!.linkMode).toEqual({ stage: 'pick-end', from: 'C' })

    // 点击空白：取消，不落码
    act(() => api.current!.onCanvasClick({ target: container }))
    expect(snapshots.at(-1)!.linkMode).toEqual({ stage: 'idle' })
    expect(useEditorStore.getState().source).toBe(SAMPLE)

    // 重新进入并两步完成
    act(() => api.current!.enterLinkMode())
    act(() => api.current!.onCanvasClick({ target: container.querySelector('[data-id="A"]') }))
    act(() => api.current!.onCanvasClick({ target: container.querySelector('[data-id="C"]') }))
    expect(useEditorStore.getState().source).toContain('A --> C')
  })

  it('Esc 取消连线模式', () => {
    const container = mountFlow()

    act(() => api.current!.enterLinkMode())
    act(() => {
      container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(snapshots.at(-1)!.linkMode).toEqual({ stage: 'idle' })
    expect(useEditorStore.getState().source).toBe(SAMPLE)
  })

  it('菜单「编辑文本」：进入内联编辑（onNodeCreated 回调）', () => {
    mountFlow()

    act(() => api.current!.beginEditText())

    // 未右键具体目标时无动作
    expect(created).toEqual([])
  })

  it('添加样式表单：提交才落码，名称非法拒绝', () => {
    mountFlow()

    expect(api.current!.submitStyleForm('', '#ff0000')).toBe(false)
    expect(api.current!.submitStyleForm('a b', '#ff0000')).toBe(false)
    expect(useEditorStore.getState().source).toBe(SAMPLE)

    act(() => api.current!.submitStyleForm('hl', '#ff0000'))
    expect(useEditorStore.getState().source).toContain('classDef hl fill:#ff0000')
  })

  it('菜单「添加子图」：落码空 subgraph + end 两行', () => {
    mountFlow()

    act(() => api.current!.addSubgraph())

    expect(useEditorStore.getState().source).toContain('subgraph\n')
    expect(useEditorStore.getState().source).toContain('end')
  })
})

describe('useCanvasContextMenu（工单 07 mindmap 节点菜单）', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let snapshots: MenuSnapshot[]
  let api: { current: ContextMenuApi | null }
  let created: string[]

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    snapshots = []
    api = { current: null }
    created = []
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
    useEditorStore.getState().select(null)
  })

  function mountMind() {
    resetEditorHistory(MINDMAP_SAMPLE)
    act(() => {
      root.render(
        <Harness
          projection={mindmapProjectionOf(MINDMAP_SAMPLE)}
          svg={MINDMAP_SVG_STUB}
          onState={(s) => snapshots.push(s)}
          apiRef={api}
          onNodeCreated={(t) => created.push(createdIdOf(t))}
        />,
      )
    })
    return host.firstElementChild as HTMLDivElement
  }

  it('右键 mindmap 节点：菜单为添加子节点/编辑文本/删除', () => {
    const container = mountMind()
    const el = container.querySelector('[id="node_1"]')!
    act(() => {
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    })

    const last = snapshots.at(-1)!
    expect(last.menu?.target).toEqual({ kind: 'mindmap-node', elementId: 'mindmap-node:2' })
    expect(last.menu?.items).toEqual(['add-child', 'edit-text', 'delete'])
  })

  it('菜单「添加子节点」：落码新节点、选中并回调内联命名', () => {
    const container = mountMind()
    const el = container.querySelector('[id="node_1"]')!
    act(() => {
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    })

    act(() => api.current!.addChildToMindmap())

    expect(useEditorStore.getState().source).toContain('新节点')
    // 新节点插在「分支A」子树（叶子）之后、先于「分支B」，文档序第 4 个节点行
    expect(useEditorStore.getState().selection).toEqual({ kind: 'mindmap-node', elementId: 'mindmap-node:4' })
    expect(created).toEqual(['mindmap-node:4'])
  })

  it('菜单「编辑文本」：进入内联编辑', () => {
    const container = mountMind()
    const el = container.querySelector('[id="node_1"]')!
    act(() => {
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    })

    act(() => api.current!.beginEditText())

    expect(created).toEqual(['mindmap-node:2'])
  })
})

describe('useCanvasContextMenu（工单 04 空白处按图种建元素）', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let snapshots: MenuSnapshot[]
  let api: { current: ContextMenuApi | null }
  let created: string[]

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    snapshots = []
    api = { current: null }
    created = []
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.restoreAllMocks()
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
    useEditorStore.getState().select(null)
  })

  function mount(projection: AnyProjection, source: string, svg = '') {
    resetEditorHistory(source)
    act(() => {
      root.render(
        <Harness
          projection={projection}
          svg={svg}
          onState={(s) => snapshots.push(s)}
          apiRef={api}
          onNodeCreated={(t) => created.push(createdIdOf(t))}
        />,
      )
    })
    return host.firstElementChild as HTMLDivElement
  }

  /** 右键画布空白（SVG 无 data-id 的包裹元素） */
  function blankContextMenu(container: HTMLDivElement): boolean {
    let prevented = false
    act(() => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
      container.firstElementChild!.dispatchEvent(event)
      prevented = event.defaultPrevented
    })
    return prevented
  }

  /** 监听 store 的 commitIntent，取第 n 次收到的意图（断言意图字段与 afterElementId） */
  function spyCommitIntent() {
    return vi.spyOn(useEditorStore.getState(), 'commitIntent')
  }

  // 只有表头的文档：class 图在 mermaid 里是解析错误，app 自有解析器仍可用
  const CLASS_HEADER_ONLY = 'classDiagram\n'
  const SEQUENCE_HEADER_ONLY = 'sequenceDiagram\n'
  const MINDMAP_HEADER_ONLY = 'mindmap\n'
  const MINDMAP_SAMPLE_2 = `mindmap
  root((中心))
    分支A
`
  const CLASS_SVG_STUB = '<svg><g data-id="已有类">已有类</g></svg>'
  const SEQUENCE_SVG_STUB = '<svg><g data-id="甲">甲</g></svg>'

  it('class 空白右键（空图错误态）：菜单为「添加类」，落码后选中并回调内联命名类名', () => {
    const container = mount(classProjectionOf(CLASS_HEADER_ONLY), CLASS_HEADER_ONLY)

    expect(blankContextMenu(container)).toBe(true)
    const last = snapshots.at(-1)!
    expect(last.menu?.target).toEqual({ kind: 'blank', diagramType: 'class' })
    expect(last.menu?.items).toEqual(['add-class'])

    const spy = spyCommitIntent()
    act(() => api.current!.addClass())

    // 空白处没有锚点元素：不传 afterElementId，由管线回退到文档最后一个元素（这里即表头）
    const intent = spy.mock.calls[0]?.[0]
    expect(intent).toMatchObject({ type: 'add-class', name: '新类' })
    expect(intent !== undefined && 'afterElementId' in intent).toBe(false)

    const source = useEditorStore.getState().source
    // 表头后落一行 class（修复空 classDiagram 的解析错误）
    expect(source).toContain('classDiagram\nclass 新类')
    expect(useEditorStore.getState().selection).toEqual({ kind: 'class', name: '新类' })
    expect(created).toEqual(['新类'])
  })

  it('class 空白右键（已有内容）：默认名避重、锚点回退到最后一个元素', () => {
    const source = 'classDiagram\n    class 新类\n'
    const container = mount(classProjectionOf(source), source, CLASS_SVG_STUB)

    expect(blankContextMenu(container)).toBe(true)

    const spy = spyCommitIntent()
    act(() => api.current!.addClass())

    expect(spy.mock.calls[0]?.[0]).toMatchObject({ type: 'add-class', name: '新类2' })
    expect(useEditorStore.getState().source).toContain('class 新类2')
    expect(created).toEqual(['新类2'])
  })

  it('sequence 空白右键（空图）：菜单为「添加参与者」，落码不带 alias 并回调内联命名 id', () => {
    const container = mount(sequenceProjectionOf(SEQUENCE_HEADER_ONLY), SEQUENCE_HEADER_ONLY)

    expect(blankContextMenu(container)).toBe(true)
    expect(snapshots.at(-1)!.menu?.items).toEqual(['add-participant'])

    const spy = spyCommitIntent()
    act(() => api.current!.addParticipant())

    const intent = spy.mock.calls[0]?.[0]
    expect(intent).toMatchObject({ type: 'add-participant', actorId: '新参与者' })
    expect(intent !== undefined && 'alias' in intent).toBe(false)
    expect(intent !== undefined && 'afterElementId' in intent).toBe(false)

    // 表头后落一行 participant，且不带 as 别名
    expect(useEditorStore.getState().source).toContain('sequenceDiagram\nparticipant 新参与者')
    expect(useEditorStore.getState().source).not.toContain(' as ')
    expect(useEditorStore.getState().selection).toEqual({ kind: 'participant', actorId: '新参与者' })
    expect(created).toEqual(['新参与者'])
  })

  it('sequence 空白右键（已有参与者）：加在最后一行之后', () => {
    const source = 'sequenceDiagram\n    participant 甲\n    甲->>甲: 自己\n'
    const container = mount(sequenceProjectionOf(source), source, SEQUENCE_SVG_STUB)

    expect(blankContextMenu(container)).toBe(true)
    act(() => api.current!.addParticipant())

    expect(useEditorStore.getState().source).toContain('participant 新参与者')
    expect(created).toEqual(['新参与者'])
  })

  it('mindmap 空白右键（空图）：菜单为「添加根节点」，落码纯文本并回调内联命名显示文本', () => {
    const container = mount(mindmapProjectionOf(MINDMAP_HEADER_ONLY), MINDMAP_HEADER_ONLY)

    expect(blankContextMenu(container)).toBe(true)
    const last = snapshots.at(-1)!
    expect(last.menu?.target).toEqual({ kind: 'blank', diagramType: 'mindmap' })
    expect(last.menu?.items).toEqual(['add-root'])

    const spy = spyCommitIntent()
    act(() => api.current!.addMindmapRoot())

    expect(spy.mock.calls[0]?.[0]).toMatchObject({ type: 'add-child', text: '新节点' })
    expect(useEditorStore.getState().source).toContain('新节点')
    // 空文档：新根是第一个节点行
    expect(useEditorStore.getState().selection).toEqual({ kind: 'mindmap-node', elementId: 'mindmap-node:1' })
    expect(created).toEqual(['mindmap-node:1'])
  })

  it('mindmap 空白右键（已有内容）：挂到根节点下并选中新节点', () => {
    const container = mount(mindmapProjectionOf(MINDMAP_SAMPLE_2), MINDMAP_SAMPLE_2)

    expect(blankContextMenu(container)).toBe(true)
    act(() => api.current!.addMindmapRoot())

    expect(useEditorStore.getState().source).toContain('新节点')
    // 「分支A」子树末节点（第 2 行）之后 → 新节点是第 3 个节点行
    expect(useEditorStore.getState().selection).toEqual({ kind: 'mindmap-node', elementId: 'mindmap-node:3' })
    expect(created).toEqual(['mindmap-node:3'])
  })

  it('flowchart 空白菜单不回归（仍是四项，且走 add-node）', () => {
    const container = mount(flowProjectionOf(SAMPLE), SAMPLE, SVG_STUB)

    expect(blankContextMenu(container)).toBe(true)
    expect(snapshots.at(-1)!.menu?.items).toEqual(['add-node', 'link-mode', 'add-style', 'add-subgraph'])

    act(() => api.current!.addNode())
    expect(useEditorStore.getState().source).toContain('n1[n1]')
  })
})

/** 按 label 文案定位输入框（Mantine 的 label 通过 for/id 关联输入框） */
function inputByLabel(host: HTMLElement, labelText: string): HTMLInputElement {
  const label = Array.from(host.querySelectorAll('label')).find((l) => l.textContent?.trim() === labelText)
  if (label === undefined) throw new Error(`未找到标签：${labelText}`)
  const input = document.getElementById(label.htmlFor)
  if (!(input instanceof HTMLInputElement)) throw new Error(`标签未关联输入框：${labelText}`)
  return input
}

/** React 受控输入：必须走原生 setter 再派发 input 事件，onChange 才会触发 */
async function typeInto(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** 按文案点击按钮（表单的提交按钮为「添加」） */
async function clickButton(host: HTMLElement, text: string): Promise<void> {
  const button = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === text)
  if (button === undefined) throw new Error(`未找到按钮：${text}`)
  await act(async () => button.click())
}

describe('useCanvasContextMenu（工单 06 class/sequence 节点菜单）', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let snapshots: MenuSnapshot[]
  let api: { current: ContextMenuApi | null }
  let created: string[]

  // 含成员块与关系的类图：验证删除类的级联
  const CLASS_SAMPLE = `classDiagram
    class Foo {
        +String name
    }
    class Bar
    Foo --> Bar
`
  const SEQ_SAMPLE = `sequenceDiagram
    participant 甲
    participant 乙
    甲->>乙: hi
`
  const CLASS_SVG = '<svg><g data-id="Foo">Foo</g><g data-id="Bar">Bar</g></svg>'
  const SEQ_SVG = '<svg><g data-id="甲">甲</g><g data-id="乙">乙</g></svg>'

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    snapshots = []
    api = { current: null }
    created = []
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.restoreAllMocks()
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
    useEditorStore.getState().select(null)
  })

  function mount(projection: AnyProjection, source: string, svg: string): HTMLDivElement {
    resetEditorHistory(source)
    act(() => {
      root.render(
        <Harness
          projection={projection}
          svg={svg}
          onState={(s) => snapshots.push(s)}
          apiRef={api}
          onNodeCreated={(t) => created.push(createdIdOf(t))}
        />,
      )
    })
    return host.firstElementChild as HTMLDivElement
  }

  function mountClass(): HTMLDivElement {
    return mount(classProjectionOf(CLASS_SAMPLE), CLASS_SAMPLE, CLASS_SVG)
  }

  function mountSequence(): HTMLDivElement {
    return mount(sequenceProjectionOf(SEQ_SAMPLE), SEQ_SAMPLE, SEQ_SVG)
  }

  function contextMenuOn(container: Element, selector: string): boolean {
    let prevented = false
    act(() => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
      container.querySelector(selector)!.dispatchEvent(event)
      prevented = event.defaultPrevented
    })
    return prevented
  }

  /** 监听 store 的 commitIntent，取第 n 次收到的意图（断言意图字段与 afterElementId） */
  function spyCommitIntent() {
    return vi.spyOn(useEditorStore.getState(), 'commitIntent')
  }

  it('右键 class 节点：菜单为添加成员/添加关系/删除类并联动选中', () => {
    const container = mountClass()

    expect(contextMenuOn(container, '[data-id="Foo"]')).toBe(true)

    const last = snapshots.at(-1)!
    expect(last.menu?.target).toEqual({ kind: 'class-node', name: 'Foo' })
    expect(last.menu?.items).toEqual(['add-member', 'add-relation', 'delete-class'])
    expect(useEditorStore.getState().selection).toEqual({ kind: 'class', name: 'Foo' })
  })

  it('右键 sequence 参与者：菜单为添加消息/删除参与者并联动选中', () => {
    const container = mountSequence()

    expect(contextMenuOn(container, '[data-id="甲"]')).toBe(true)

    const last = snapshots.at(-1)!
    expect(last.menu?.target).toEqual({ kind: 'sequence-participant', actorId: '甲' })
    expect(last.menu?.items).toEqual(['add-message', 'delete-participant'])
    expect(useEditorStore.getState().selection).toEqual({ kind: 'participant', actorId: '甲' })
  })

  it('菜单「添加成员」：打开表单（锚点为右键的那个类）→ 提交落码带 afterElementId', async () => {
    const container = mountClass()
    contextMenuOn(container, '[data-id="Foo"]')

    const spy = spyCommitIntent()
    act(() => api.current!.addMember())

    // 打开表单并收起菜单：kind / 预选类 / 落码锚点都来自右键节点
    const form = snapshots.at(-1)!.nodeForm
    expect(form).toMatchObject({ kind: 'member', className: 'Foo', anchorElementId: 'class:Foo' })
    expect(snapshots.at(-1)!.menu).toBeNull()

    await typeInto(inputByLabel(container, '成员声明（如 String name 或 add(id) bool）'), 'String name')
    await clickButton(container, '添加')

    expect(spy.mock.calls[0]?.[0]).toMatchObject({
      type: 'add-member',
      className: 'Foo',
      vis: '+',
      text: 'String name',
      afterElementId: 'class:Foo',
    })
    expect(useEditorStore.getState().source).toContain('+String name')
  })

  it('菜单「添加关系」：默认以右键的类为起点 → 提交落码带 afterElementId', async () => {
    const container = mountClass()
    contextMenuOn(container, '[data-id="Foo"]')

    const spy = spyCommitIntent()
    act(() => api.current!.addRelation())

    const form = snapshots.at(-1)!.nodeForm
    expect(form).toMatchObject({ kind: 'relation', className: 'Foo', anchorElementId: 'class:Foo' })

    // 起点默认右键的那个类，终点默认另一个类
    await clickButton(container, '添加')
    expect(spy.mock.calls[0]?.[0]).toMatchObject({
      type: 'add-relation',
      from: 'Foo',
      to: 'Bar',
      kind: '-->',
      afterElementId: 'class:Foo',
    })
    expect(useEditorStore.getState().source).toContain('Foo --> Bar')
  })

  it('菜单「添加消息」：默认以右键的参与者为起点 → 提交落码带 afterElementId', async () => {
    const container = mountSequence()
    contextMenuOn(container, '[data-id="甲"]')

    const spy = spyCommitIntent()
    act(() => api.current!.addMessage())

    const form = snapshots.at(-1)!.nodeForm
    expect(form).toMatchObject({ kind: 'message', from: '甲', anchorElementId: 'participant:甲' })

    await clickButton(container, '添加')
    expect(spy.mock.calls[0]?.[0]).toMatchObject({
      type: 'add-message',
      from: '甲',
      to: '乙',
      arrow: '->>',
      afterElementId: 'participant:甲',
    })
    expect(useEditorStore.getState().source).toContain('甲->>乙')
  })

  it('菜单「删除类」：级联删除成员与引用该类的 relation、清空选中', () => {
    const container = mountClass()
    contextMenuOn(container, '[data-id="Foo"]')
    snapshots.length = 0

    act(() => api.current!.deleteTarget())

    const source = useEditorStore.getState().source
    expect(source).not.toContain('Foo')
    expect(source).not.toContain('-->')
    expect(source).not.toContain('String name')
    expect(useEditorStore.getState().selection).toBeNull()
    expect(snapshots.at(-1)!.menu).toBeNull()
  })

  it('菜单「删除参与者」：级联删除引用它的语句、清空选中', () => {
    const container = mountSequence()
    contextMenuOn(container, '[data-id="甲"]')
    snapshots.length = 0

    act(() => api.current!.deleteTarget())

    const source = useEditorStore.getState().source
    expect(source).not.toContain('甲')
    expect(source).not.toContain('hi')
    expect(useEditorStore.getState().selection).toBeNull()
    expect(snapshots.at(-1)!.menu).toBeNull()
  })

  it('添加／删除都走 commitIntent（可撤销）', async () => {
    const container = mountClass()
    contextMenuOn(container, '[data-id="Foo"]')
    act(() => api.current!.addRelation())
    await clickButton(container, '添加')
    expect(useEditorStore.getState().canUndo).toBe(true)

    useEditorStore.getState().undo()
    expect(useEditorStore.getState().source).toBe(CLASS_SAMPLE)
  })
})
