import { act, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetEditorHistory, useEditorStore } from '../../../store/editor'
import { DEFAULT_DIAGRAM_SOURCE } from '../../../lib/storage'
import { initI18n, zhDict } from '../../../i18n'
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
import { nodeDataIdResolver, elementDataIdResolver } from '../../canvas-selection/data-id'
import type { AnyProjection } from '../../diagram-registry'
import { useCanvasContextMenu, type NodeFormState } from '../use-canvas-context-menu'
import { AddMemberInlineForm, AddRelationInlineForm, AddClassNoteInlineForm } from '../../../components/class-forms'
import { AddMessageInlineForm, AddNoteInlineForm, AddBlockInlineForm } from '../../../components/sequence-forms'
import { BLOCK_KEYWORD_OPTIONS } from '../sequence-forms'
import type { CanvasInlineEditTarget } from '../inline-edit'
import type { ContextMenuTarget } from '../context-menu'
import type { LinkModeState } from '../link-mode'

/**
 * 画布右键菜单 Hook（工单 07/04/06/03）：右键弹出随目标变化的菜单并联动选中；
 * 添加节点走编辑意图管线并回调内联命名；连线模式两步落码连线、Esc 取消；
 * 添加样式表单提交才落码；class/sequence 节点菜单的添加型表单提交才落码（工单 06）；
 * class 关系边与 sequence 消息的菜单（工单 03）：循环切换类型/箭头直接落码，
 * 删除经 delete-relation / delete-message / delete-note / delete-block 落码；
 * 编辑类菜单项（工单 05 定案 D5）= 选中该连线 + 关闭菜单，字段在右侧属性面板改；
 * 添加入口补全（工单 04）：sequence 空白加注释/逻辑块、sequence 参与者加逻辑块、
 * class 空白加浮动注释、class 类节点加 `note for X`，全部提交才落码。
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

/** 图种 → data-id resolver（与 CanvasPanel 的 resolverOf 同约定；工单 03 起含位置序连线） */
function resolverOf(projection: AnyProjection) {
  if (projection.type === 'flowchart') return flowchartDataIdResolver(projection.flowchart)
  if (projection.type === 'mindmap') return mindmapDataIdResolver(projection.mindmap)
  if (projection.type === 'sequence') {
    const nodes = nodeDataIdResolver(projection.sequence.participants.map((p) => p.actorId))
    const edges = elementDataIdResolver([
      ...projection.sequence.messages.map((m) => m.elementId),
      ...projection.sequence.notes.map((n) => n.elementId),
      ...projection.sequence.blocks.map((b) => b.elementId),
    ])
    return (dataId: string) => nodes(dataId) ?? edges(dataId)
  }
  const nodes = nodeDataIdResolver(projection.class.classes.map((c) => c.name))
  const edges = elementDataIdResolver(projection.class.relations.map((r) => r.elementId))
  return (dataId: string) => nodes(dataId) ?? edges(dataId)
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
    case 'sequence-alias':
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
  addNote: () => void
  addBlock: () => void
  enterLinkMode: (from?: string) => void
  addSubgraph: () => void
  applyStyle: (name: string) => void
  deleteTarget: () => void
  addChildToMindmap: () => void
  beginEditText: () => void
  /** flowchart 连线菜单的编辑类菜单项（工单 06：与 editRelation / editMessage 同语义） */
  beginEditLabel: () => void
  submitStyleForm: (name: string, color: string) => boolean
  openStyleForm: () => void
  closeStyleForm: () => void
  cycleRelationKind: () => void
  editRelation: () => void
  cycleMessageArrow: () => void
  editMessage: () => void
  /** 画布键盘编辑键（工单 05）：对当前选中元素打开添加表单 */
  openFormForSelection: (kind: 'member' | 'relation' | 'message') => void
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
    addNote: ctx.addNote,
    addBlock: ctx.addBlock,
    enterLinkMode: ctx.enterLinkMode,
    addSubgraph: ctx.addSubgraph,
    applyStyle: ctx.applyStyle,
    deleteTarget: ctx.deleteTarget,
    addChildToMindmap: ctx.addChildToMindmap,
    beginEditText: ctx.beginEditText,
    beginEditLabel: ctx.beginEditLabel,
    submitStyleForm: ctx.submitStyleForm,
    openStyleForm: ctx.openStyleForm,
    closeStyleForm: ctx.closeStyleForm,
    cycleRelationKind: ctx.cycleRelationKind,
    editRelation: ctx.editRelation,
    cycleMessageArrow: ctx.cycleMessageArrow,
    editMessage: ctx.editMessage,
    openFormForSelection: ctx.openFormForSelection,
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
      {ctx.nodeForm !== null && props.projection.type === 'sequence' && ctx.nodeForm.kind === 'note' && (
        <MantineProvider>
          <AddNoteInlineForm
            participants={props.projection.sequence.participants}
            afterElementId={ctx.nodeForm.anchorElementId}
            onDone={ctx.closeNodeForm}
          />
        </MantineProvider>
      )}
      {ctx.nodeForm !== null && props.projection.type === 'sequence' && ctx.nodeForm.kind === 'block' && (
        <MantineProvider>
          <AddBlockInlineForm afterElementId={ctx.nodeForm.anchorElementId} onDone={ctx.closeNodeForm} />
        </MantineProvider>
      )}
      {ctx.nodeForm !== null && props.projection.type === 'class' && ctx.nodeForm.kind === 'note' && (
        <MantineProvider>
          <AddClassNoteInlineForm
            classes={props.projection.class.classes}
            initialClassName={ctx.nodeForm.className}
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

  it('右键连线：菜单为「在属性面板中编辑」/删除', () => {
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

  it('菜单「在属性面板中编辑」（flowchart 连线）：菜单项自己选中该连线并关闭菜单，自身不落码（工单 06）', () => {
    const container = mountFlow()
    contextMenuOn(container, 'path[data-id="L_A_B_0"]')
    snapshots.length = 0

    // 与 class 关系 / sequence 消息同款：选中必须由菜单项自己确认，
    // 故先清掉右键时的联动选中，验证点完菜单项后选中一定落回该连线。
    act(() => useEditorStore.getState().select(null))
    const spy = vi.spyOn(useEditorStore.getState(), 'commitIntent')
    act(() => api.current!.beginEditLabel())

    expect(snapshots.at(-1)!.menu).toBeNull()
    expect(useEditorStore.getState().selection).toEqual({ kind: 'edge', from: 'A', to: 'B', occurrence: 1 })
    // 编辑类菜单项不是落码动作：改标签 / 线型归右侧 EdgeForm（set-edge 由表单触发）
    expect(spy).not.toHaveBeenCalled()
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

  it('class 空白右键（空图错误态）：菜单为「添加类 / 添加注释」，落码后选中并回调内联命名类名', () => {
    const container = mount(classProjectionOf(CLASS_HEADER_ONLY), CLASS_HEADER_ONLY)

    expect(blankContextMenu(container)).toBe(true)
    const last = snapshots.at(-1)!
    expect(last.menu?.target).toEqual({ kind: 'blank', diagramType: 'class' })
    expect(last.menu?.items).toEqual(['add-class', 'add-note'])

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

  it('sequence 空白右键（空图）：菜单为「添加参与者 / 添加注释 / 添加逻辑块」，落码不带 alias 并回调内联命名 id', () => {
    const container = mount(sequenceProjectionOf(SEQUENCE_HEADER_ONLY), SEQUENCE_HEADER_ONLY)

    expect(blankContextMenu(container)).toBe(true)
    expect(snapshots.at(-1)!.menu?.items).toEqual(['add-participant', 'add-note', 'add-block'])

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

/** 打开 Select 下拉，返回选项文案（Mantine 的选项渲染到 portal，按 role=option 取） */
async function optionTexts(host: HTMLElement, labelText: string): Promise<string[]> {
  const input = inputByLabel(host, labelText)
  await act(async () => {
    input.click()
  })
  return Array.from(document.querySelectorAll('[role="option"]')).map((o) => o.textContent?.trim() ?? '')
}

/** 打开 Select 下拉并点选文案匹配的选项 */
async function selectOption(host: HTMLElement, labelText: string, optionText: string): Promise<void> {
  const texts = await optionTexts(host, labelText)
  const index = texts.indexOf(optionText)
  if (index === -1) throw new Error(`未找到选项：${optionText}（现有：${texts.join(' | ')}）`)
  const options = Array.from(document.querySelectorAll('[role="option"]'))
  await act(async () => {
    ;(options[index] as HTMLElement).click()
  })
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

  it('右键 class 节点：菜单为添加成员/添加关系/添加注释/删除类并联动选中', () => {
    const container = mountClass()

    expect(contextMenuOn(container, '[data-id="Foo"]')).toBe(true)

    const last = snapshots.at(-1)!
    expect(last.menu?.target).toEqual({ kind: 'class-node', name: 'Foo' })
    expect(last.menu?.items).toEqual(['add-member', 'add-relation', 'add-note', 'delete-class'])
    expect(useEditorStore.getState().selection).toEqual({ kind: 'class', name: 'Foo' })
  })

  it('右键 sequence 参与者：菜单为添加消息/添加逻辑块/删除参与者并联动选中', () => {
    const container = mountSequence()

    expect(contextMenuOn(container, '[data-id="甲"]')).toBe(true)

    const last = snapshots.at(-1)!
    expect(last.menu?.target).toEqual({ kind: 'sequence-participant', actorId: '甲' })
    expect(last.menu?.items).toEqual(['add-message', 'add-block', 'delete-participant'])
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

  it('菜单「删除类」：级联删除成员与引用该类的 relation、清空选中', () => {    const container = mountClass()
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

  // ---- 画布键盘编辑键（工单 05）：无右键菜单，对当前选中元素打开同一份表单 ----

  it('键盘：选中类后打开成员/关系表单（锚点 = 该类声明，与右键菜单同一份 nodeForm）', () => {
    mountClass()
    act(() => useEditorStore.getState().select({ kind: 'class', name: 'Foo' }))

    act(() => api.current!.openFormForSelection('member'))
    expect(snapshots.at(-1)!.nodeForm).toMatchObject({
      kind: 'member',
      className: 'Foo',
      anchorElementId: 'class:Foo',
    })
    expect(snapshots.at(-1)!.menu).toBeNull()

    act(() => api.current!.openFormForSelection('relation'))
    expect(snapshots.at(-1)!.nodeForm).toMatchObject({
      kind: 'relation',
      className: 'Foo',
      anchorElementId: 'class:Foo',
    })
  })

  it('键盘：选中参与者后打开消息表单（起点与锚点 = 该参与者）', () => {
    mountSequence()
    act(() => useEditorStore.getState().select({ kind: 'participant', actorId: '甲' }))

    act(() => api.current!.openFormForSelection('message'))
    expect(snapshots.at(-1)!.nodeForm).toMatchObject({
      kind: 'message',
      from: '甲',
      anchorElementId: 'participant:甲',
    })
  })

  it('键盘：选中不是类/参与者（或未选中）时安静地不打开表单', () => {
    mountSequence()
    act(() => useEditorStore.getState().select({ kind: 'message', elementId: 'message:1' }))
    act(() => api.current!.openFormForSelection('message'))
    expect(snapshots.at(-1)!.nodeForm).toBeNull()

    act(() => useEditorStore.getState().select(null))
    act(() => api.current!.openFormForSelection('message'))
    expect(snapshots.at(-1)!.nodeForm).toBeNull()
  })

  it('键盘：成员表单提交落码带 afterElementId（复用右键菜单同一表单）', async () => {
    const container = mountClass()
    act(() => useEditorStore.getState().select({ kind: 'class', name: 'Foo' }))
    act(() => api.current!.openFormForSelection('member'))

    const spy = spyCommitIntent()
    await typeInto(inputByLabel(container, '成员声明（如 String name 或 add(id) bool）'), 'String id')
    await clickButton(container, '添加')

    expect(spy.mock.calls[0]?.[0]).toMatchObject({
      type: 'add-member',
      className: 'Foo',
      vis: '+',
      text: 'String id',
      afterElementId: 'class:Foo',
    })
    expect(useEditorStore.getState().source).toContain('+String id')
  })
})

describe('useCanvasContextMenu（工单 03 连线菜单）', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let snapshots: MenuSnapshot[]
  let api: { current: ContextMenuApi | null }
  let created: string[]

  // 两条不同的关系类型（relation:1 = -->，relation:2 = ..>）与两条不同箭头的消息
  const CLASS_EDGE_SAMPLE = `classDiagram
    class Foo
    class Bar
    Foo --> Bar
    Bar ..> Foo
`
  const CLASS_EDGE_SVG =
    '<svg><g data-id="Foo">Foo</g><g data-id="Bar">Bar</g><path data-id="relation:1"></path><path data-id="relation:2"></path></svg>'
  const SEQ_EDGE_SAMPLE = `sequenceDiagram
    participant 甲
    participant 乙
    甲->>乙: hi
    甲-->>乙: 收到
`
  const SEQ_EDGE_SVG =
    '<svg><g data-id="甲">甲</g><g data-id="乙">乙</g><line data-id="message:1"></line><line data-id="message:2"></line></svg>'
  // 注释 + 逻辑块（工单 03 边界裁定：只补删除）
  const SEQ_NOTE_BLOCK_SAMPLE = `sequenceDiagram
    participant 甲
    note over 甲: 备注
    alt 条件
        甲->>甲: 自语
    end
`
  const SEQ_NOTE_BLOCK_SVG =
    '<svg><g data-id="甲">甲</g><g data-id="note:1"></g><g data-id="block:1"></g></svg>'

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

  function mountClassEdge(): HTMLDivElement {
    return mount(classProjectionOf(CLASS_EDGE_SAMPLE), CLASS_EDGE_SAMPLE, CLASS_EDGE_SVG)
  }

  function mountSequenceEdge(): HTMLDivElement {
    return mount(sequenceProjectionOf(SEQ_EDGE_SAMPLE), SEQ_EDGE_SAMPLE, SEQ_EDGE_SVG)
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

  /** 监听 store 的 commitIntent（断言意图字段） */
  function spyCommitIntent() {
    return vi.spyOn(useEditorStore.getState(), 'commitIntent')
  }

  it('右键 class 关系边：菜单为切换类型/编辑基数标签/删除并联动选中', () => {
    const container = mountClassEdge()

    // 工单 02 的位置序身份写在 DOM 上，右键即命中（工单 03 起不再安静关闭）
    expect(contextMenuOn(container, 'path[data-id="relation:1"]')).toBe(true)

    const last = snapshots.at(-1)!
    expect(last.menu?.target).toEqual({ kind: 'class-relation', elementId: 'relation:1' })
    expect(last.menu?.items).toEqual(['cycle-relation-kind', 'edit-relation', 'delete-relation'])
    expect(useEditorStore.getState().selection).toEqual({ kind: 'class-relation', elementId: 'relation:1' })
  })

  it('菜单「删除关系」：只删该条关系，其余关系不受影响，清空选中', () => {
    const container = mountClassEdge()
    contextMenuOn(container, 'path[data-id="relation:1"]')
    snapshots.length = 0

    act(() => api.current!.deleteTarget())

    const source = useEditorStore.getState().source
    expect(source).not.toContain('Foo --> Bar')
    expect(source).toContain('Bar ..> Foo')
    expect(useEditorStore.getState().selection).toBeNull()
    expect(snapshots.at(-1)!.menu).toBeNull()
  })

  it('菜单「切换关系类型」：循环到下一个 kind 落码、可撤销、菜单保持打开', () => {
    const container = mountClassEdge()
    contextMenuOn(container, 'path[data-id="relation:1"]')

    const spy = spyCommitIntent()
    act(() => api.current!.cycleRelationKind())

    // RELATION_KINDS 顺序 <|-- <|.. *-- o-- --> ..>：当前 --> → 下一个 ..>
    expect(spy.mock.calls[0]?.[0]).toMatchObject({ type: 'set-relation', elementId: 'relation:1', kind: '..>' })
    expect(useEditorStore.getState().source).toContain('Foo ..> Bar')
    // 菜单不关：循环切换要能连着点（关掉的话这里会是 menu: null）
    expect(snapshots.at(-1)!.menu?.items).toEqual(['cycle-relation-kind', 'edit-relation', 'delete-relation'])

    useEditorStore.getState().undo()
    expect(useEditorStore.getState().source).toBe(CLASS_EDGE_SAMPLE)
  })

  it('菜单「在属性面板中编辑」（关系）：菜单项自己选中该关系并关闭菜单，自身不落码', () => {
    const container = mountClassEdge()
    contextMenuOn(container, 'path[data-id="relation:1"]')
    snapshots.length = 0

    // D5 定案：菜单项 = 选中该连线 + 关闭菜单，字段编辑在右侧 RelationForm 完成。
    // 选中必须由菜单项自己确认（改动前函数体只有 closeMenu()，选中依赖右键时的隐式联动），
    // 故这里先把选中清掉，验证点完菜单项后选中一定落回该关系。
    act(() => useEditorStore.getState().select(null))
    const spy = spyCommitIntent()
    act(() => api.current!.editRelation())

    expect(snapshots.at(-1)!.menu).toBeNull()
    expect(useEditorStore.getState().selection).toEqual({ kind: 'class-relation', elementId: 'relation:1' })
    // 编辑类菜单项不是落码动作：改源码归右侧表单（set-relation 由 cycleRelationKind 与表单各自触发）
    expect(spy).not.toHaveBeenCalled()
  })

  it('右键 sequence 消息：菜单为切换箭头/编辑激活文本/删除并联动选中', () => {
    const container = mountSequenceEdge()

    expect(contextMenuOn(container, 'line[data-id="message:1"]')).toBe(true)

    const last = snapshots.at(-1)!
    expect(last.menu?.target).toEqual({ kind: 'sequence-message', elementId: 'message:1' })
    expect(last.menu?.items).toEqual(['cycle-message-arrow', 'edit-message', 'delete-message'])
    expect(useEditorStore.getState().selection).toEqual({ kind: 'message', elementId: 'message:1' })
  })

  it('菜单「删除消息」：只删该条消息，其余消息不受影响，清空选中', () => {
    const container = mountSequenceEdge()
    contextMenuOn(container, 'line[data-id="message:1"]')
    snapshots.length = 0

    act(() => api.current!.deleteTarget())

    const source = useEditorStore.getState().source
    expect(source).not.toContain('hi')
    expect(source).toContain('甲-->>乙: 收到')
    expect(useEditorStore.getState().selection).toBeNull()
    expect(snapshots.at(-1)!.menu).toBeNull()
  })

  it('菜单「切换箭头」：循环到下一个箭头落码、可撤销', () => {
    const container = mountSequenceEdge()
    contextMenuOn(container, 'line[data-id="message:1"]')

    const spy = spyCommitIntent()
    act(() => api.current!.cycleMessageArrow())

    // MESSAGE_ARROW_OPTIONS 顺序 ->> --> -x --：当前 ->> → 下一个 -->
    expect(spy.mock.calls[0]?.[0]).toMatchObject({ type: 'set-message', elementId: 'message:1', arrow: '-->' })
    expect(useEditorStore.getState().source).toContain('甲-->乙: hi')

    useEditorStore.getState().undo()
    expect(useEditorStore.getState().source).toBe(SEQ_EDGE_SAMPLE)
  })

  it('菜单「在属性面板中编辑」（消息）：菜单项自己选中该消息并关闭菜单，自身不落码', () => {
    const container = mountSequenceEdge()
    contextMenuOn(container, 'line[data-id="message:1"]')
    snapshots.length = 0

    act(() => useEditorStore.getState().select(null))
    const spy = spyCommitIntent()
    act(() => api.current!.editMessage())

    expect(snapshots.at(-1)!.menu).toBeNull()
    expect(useEditorStore.getState().selection).toEqual({ kind: 'message', elementId: 'message:1' })
    // 与关系同理：编辑类菜单项只负责「选中 + 关菜单」，激活/文本在右侧 MessageForm 改
    expect(spy).not.toHaveBeenCalled()
  })

  it('右键 sequence 注释：菜单只放删除（工单 03 边界裁定），删除只去掉该注释', () => {
    const container = mount(
      sequenceProjectionOf(SEQ_NOTE_BLOCK_SAMPLE),
      SEQ_NOTE_BLOCK_SAMPLE,
      SEQ_NOTE_BLOCK_SVG,
    )
    contextMenuOn(container, '[data-id="note:1"]')
    expect(snapshots.at(-1)!.menu?.items).toEqual(['delete-note'])
    snapshots.length = 0

    act(() => api.current!.deleteTarget())

    const source = useEditorStore.getState().source
    expect(source).not.toContain('备注')
    expect(source).toContain('alt 条件')
  })

  it('右键 sequence 逻辑块：菜单只放删除，删除整块（open 到 end）', () => {
    const container = mount(
      sequenceProjectionOf(SEQ_NOTE_BLOCK_SAMPLE),
      SEQ_NOTE_BLOCK_SAMPLE,
      SEQ_NOTE_BLOCK_SVG,
    )
    contextMenuOn(container, '[data-id="block:1"]')
    expect(snapshots.at(-1)!.menu?.items).toEqual(['delete-block'])
    snapshots.length = 0

    act(() => api.current!.deleteTarget())

    const source = useEditorStore.getState().source
    expect(source).not.toContain('alt')
    expect(source).not.toContain('自语')
    expect(source).toContain('note over 甲: 备注')
  })
})

describe('useCanvasContextMenu（工单 04 添加入口补全）', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let snapshots: MenuSnapshot[]
  let api: { current: ContextMenuApi | null }
  let created: string[]

  const SEQ_SAMPLE = `sequenceDiagram
    participant 甲
    participant 乙
    甲->>乙: hi
`
  const CLASS_SAMPLE = `classDiagram
    class Foo
    class Bar
`
  const CLASS_SVG = '<svg><g data-id="Foo">Foo</g><g data-id="Bar">Bar</g></svg>'

  /** 投影 → 与 CanvasPanel 同约定的 SVG 桩（节点 + 位置序连线都带 data-id） */
  function seqSvgOf(projection: AnyProjection): string {
    if (projection.type !== 'sequence') throw new Error('只用于 sequence')
    const parts = [
      ...projection.sequence.participants.map((p) => `<g data-id="${p.actorId}"></g>`),
      ...projection.sequence.messages.map((m) => `<line data-id="${m.elementId}"></line>`),
      ...projection.sequence.notes.map((n) => `<g data-id="${n.elementId}"></g>`),
      ...projection.sequence.blocks.map((b) => `<g data-id="${b.elementId}"></g>`),
    ]
    return `<svg>${parts.join('')}</svg>`
  }

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

  /** 按当前 store 源码重新渲染（真实 app 每次编辑后重投影；场景 B 逐步走通要用） */
  function rerenderFromStore(svg: string): HTMLDivElement {
    act(() => {
      root.render(
        <Harness
          projection={sequenceProjectionOf(useEditorStore.getState().source)}
          svg={svg}
          onState={(s) => snapshots.push(s)}
          apiRef={api}
          onNodeCreated={(t) => created.push(createdIdOf(t))}
        />,
      )
    })
    return host.firstElementChild as HTMLDivElement
  }

  function mountSequence(): HTMLDivElement {
    return mount(sequenceProjectionOf(SEQ_SAMPLE), SEQ_SAMPLE, seqSvgOf(sequenceProjectionOf(SEQ_SAMPLE)))
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

  /** 右键画布空白（SVG 无 data-id 的包裹元素） */
  function blankContextMenu(container: HTMLDivElement): boolean {
    return contextMenuOn(container, 'div')
  }

  function spyCommitIntent() {
    return vi.spyOn(useEditorStore.getState(), 'commitIntent')
  }

  /** 提交的意图（断言意图字段与 afterElementId）；未提交时为 undefined */
  function intentAt(spy: ReturnType<typeof spyCommitIntent>, n: number): Record<string, unknown> | undefined {
    return spy.mock.calls[n]?.[0] as unknown as Record<string, unknown> | undefined
  }

  it('sequence 空白右键：菜单含「添加参与者 / 添加注释 / 添加逻辑块」，不改变选中', () => {
    const container = mountSequence()

    const selectionBefore = useEditorStore.getState().selection
    expect(blankContextMenu(container)).toBe(true)

    const last = snapshots.at(-1)!
    expect(last.menu?.target).toEqual({ kind: 'blank', diagramType: 'sequence' })
    expect(last.menu?.items).toEqual(['add-participant', 'add-note', 'add-block'])
    // 空白目标没有可联动的选中（selectTarget 对 blank 无分支）
    expect(useEditorStore.getState().selection).toBe(selectionBefore)
  })

  it('sequence 空白「添加注释」：浮出表单（无锚点）→ 提交落码 note over', async () => {
    const container = mountSequence()
    blankContextMenu(container)

    const spy = spyCommitIntent()
    act(() => api.current!.addNote())

    // 打开表单并收起菜单：空白右键没有锚点元素
    const form = snapshots.at(-1)!.nodeForm
    expect(form).toMatchObject({ kind: 'note' })
    expect(form?.anchorElementId).toBeUndefined()
    expect(snapshots.at(-1)!.menu).toBeNull()

    await typeInto(inputByLabel(container, '注释文本'), '备注')
    await clickButton(container, '添加')

    const intent = intentAt(spy, 0)
    expect(intent).toMatchObject({ type: 'add-note', pos: 'over', actors: ['甲', '乙'], text: '备注' })
    expect(intent?.afterElementId).toBeUndefined() // 无锚点 → 管线回退到文档最后一个元素
    expect(useEditorStore.getState().source).toContain('Note over 甲,乙: 备注')
  })

  it('sequence 空白「添加逻辑块」：六种关键字都在选项里，提交落码 open + end', async () => {
    const container = mountSequence()
    blankContextMenu(container)

    act(() => api.current!.addBlock())
    expect(snapshots.at(-1)!.nodeForm).toMatchObject({ kind: 'block' })
    expect(snapshots.at(-1)!.nodeForm?.anchorElementId).toBeUndefined()

    // 六种块关键字都可选（选项文案来自 app:blockKeywords）
    const labels = await optionTexts(container, '块类型')
    expect(labels).toEqual(BLOCK_KEYWORD_OPTIONS.map((k) => zhDict.app.blockKeywords[k.value]))

    const spy = spyCommitIntent()
    await selectOption(container, '块类型', zhDict.app.blockKeywords.alt)
    await typeInto(inputByLabel(container, '块标题（可选）'), '条件')
    await clickButton(container, '添加')

    const intent = intentAt(spy, 0)
    expect(intent).toMatchObject({ type: 'add-block', keyword: 'alt', label: '条件' })
    expect(intent?.afterElementId).toBeUndefined()
    const source = useEditorStore.getState().source
    expect(source).toContain('alt 条件')
    expect(source).toContain('end')
  })

  it('sequence 参与者「添加逻辑块」：锚点是右键的那个参与者（顺序即语义）', async () => {
    const container = mountSequence()
    expect(contextMenuOn(container, '[data-id="甲"]')).toBe(true)
    expect(snapshots.at(-1)!.menu?.items).toEqual(['add-message', 'add-block', 'delete-participant'])
    expect(useEditorStore.getState().selection).toEqual({ kind: 'participant', actorId: '甲' })

    const spy = spyCommitIntent()
    act(() => api.current!.addBlock())

    const form = snapshots.at(-1)!.nodeForm
    expect(form).toMatchObject({ kind: 'block', anchorElementId: 'participant:甲' })

    await typeInto(inputByLabel(container, '块标题（可选）'), '重试')
    await clickButton(container, '添加')

    expect(intentAt(spy, 0)).toMatchObject({
      type: 'add-block',
      keyword: 'loop',
      label: '重试',
      afterElementId: 'participant:甲',
    })
    // 块落在「participant 甲」声明之后（用户右键的那个位置），而不是文档末尾
    expect(useEditorStore.getState().source).toContain('participant 甲\n    loop 重试\n    end\n')
  })

  it('class 空白「添加注释」：浮动 note（className 缺省、无锚点）', async () => {
    const container = mount(classProjectionOf(CLASS_SAMPLE), CLASS_SAMPLE, CLASS_SVG)
    expect(blankContextMenu(container)).toBe(true)
    expect(snapshots.at(-1)!.menu?.items).toEqual(['add-class', 'add-note'])

    const spy = spyCommitIntent()
    act(() => api.current!.addNote())

    const form = snapshots.at(-1)!.nodeForm
    expect(form).toMatchObject({ kind: 'note' })
    // 空白右键不预选任何类 → 浮动 note
    expect(form?.className).toBeUndefined()
    expect(form?.anchorElementId).toBeUndefined()

    await typeInto(inputByLabel(container, '注释文本'), '整体说明')
    await clickButton(container, '添加')

    const intent = intentAt(spy, 0)
    expect(intent).toMatchObject({ type: 'add-note', className: null, text: '整体说明' })
    expect(intent?.afterElementId).toBeUndefined()
    expect(useEditorStore.getState().source).toContain('note "整体说明"')
  })

  it('class 类节点「添加注释」：note for X，锚点为该类声明', async () => {
    const container = mount(classProjectionOf(CLASS_SAMPLE), CLASS_SAMPLE, CLASS_SVG)
    expect(contextMenuOn(container, '[data-id="Foo"]')).toBe(true)
    expect(snapshots.at(-1)!.menu?.items).toEqual(['add-member', 'add-relation', 'add-note', 'delete-class'])

    const spy = spyCommitIntent()
    act(() => api.current!.addNote())

    const form = snapshots.at(-1)!.nodeForm
    expect(form).toMatchObject({ kind: 'note', className: 'Foo', anchorElementId: 'class:Foo' })

    await typeInto(inputByLabel(container, '注释文本'), 'Foo 的说明')
    await clickButton(container, '添加')

    expect(intentAt(spy, 0)).toMatchObject({
      type: 'add-note',
      className: 'Foo',
      text: 'Foo 的说明',
      afterElementId: 'class:Foo',
    })
    expect(useEditorStore.getState().source).toContain('note for Foo "Foo 的说明"')
  })

  it('添加注释 / 添加块都走 commitIntent（可撤销，撤销后源码回原样）', async () => {
    const container = mountSequence()
    blankContextMenu(container)
    act(() => api.current!.addBlock())
    await clickButton(container, '添加')

    expect(useEditorStore.getState().canUndo).toBe(true)
    useEditorStore.getState().undo()
    expect(useEditorStore.getState().source).toBe(SEQ_SAMPLE)
  })

  /**
   * 端到端场景 B 的**单测等价覆盖**（本轮未做真机端到端——用户指示跳过真机验收）：
   * 加参与者 → 互发三条消息 → 包一个 alt 块并写条件 → 右键一条消息改箭头并删掉它。
   * 逐步断言各自 intent 与 afterElementId；每步后按 store 源码重投影（与真实 app 的重渲染同构）。
   */
  it('端到端场景 B（单测等价覆盖）：加参与者 → 三条消息 → alt 块 → 改箭头 → 删消息', async () => {
    resetEditorHistory('sequenceDiagram\n')
    rerenderFromStore('<svg></svg>')
    let container = host.firstElementChild as HTMLDivElement

    // ① 加参与者 ×2（空白右键 → 添加参与者）；每步后按 store 源码重投影
    act(() => api.current!.addParticipant())
    rerenderFromStore('<svg></svg>')
    act(() => api.current!.addParticipant())
    expect(useEditorStore.getState().source).toContain('participant 新参与者')
    expect(useEditorStore.getState().source).toContain('participant 新参与者2')

    // ② 互发三条消息（右键参与者 → 添加消息 → 提交）
    for (let i = 0; i < 3; i++) {
      rerenderFromStore(seqSvgOf(sequenceProjectionOf(useEditorStore.getState().source)))
      container = host.firstElementChild as HTMLDivElement
      // 先装 spy 再打开表单：表单在渲染时从 store 取 commitIntent，装晚了它拿到的还是原函数
      const spy = spyCommitIntent()
      contextMenuOn(container, '[data-id="新参与者"]')
      act(() => api.current!.addMessage())
      await clickButton(container, '添加')
      expect(intentAt(spy, 0)).toMatchObject({
        type: 'add-message',
        from: '新参与者',
        to: '新参与者2',
        afterElementId: 'participant:新参与者',
      })
      vi.restoreAllMocks()
    }
    const withMessages = useEditorStore.getState().source
    expect(withMessages.match(/->>/g)).toHaveLength(3)

    // ③ 包一个 alt 块并写条件（右键参与者 → 添加逻辑块 → 选 alt、填条件）
    rerenderFromStore(seqSvgOf(sequenceProjectionOf(withMessages)))
    container = host.firstElementChild as HTMLDivElement
    const blockSpy = spyCommitIntent()
    contextMenuOn(container, '[data-id="新参与者"]')
    act(() => api.current!.addBlock())
    await selectOption(container, '块类型', zhDict.app.blockKeywords.alt)
    await typeInto(inputByLabel(container, '块标题（可选）'), '条件成立')
    await clickButton(container, '添加')
    expect(intentAt(blockSpy, 0)).toMatchObject({
      type: 'add-block',
      keyword: 'alt',
      label: '条件成立',
      afterElementId: 'participant:新参与者',
    })
    vi.restoreAllMocks()
    expect(useEditorStore.getState().source).toContain('alt 条件成立')

    // ④ 右键一条消息 → 改箭头
    const beforeEdit = useEditorStore.getState().source
    rerenderFromStore(seqSvgOf(sequenceProjectionOf(beforeEdit)))
    container = host.firstElementChild as HTMLDivElement
    expect(contextMenuOn(container, 'line[data-id="message:1"]')).toBe(true)
    const arrowSpy = spyCommitIntent()
    act(() => api.current!.cycleMessageArrow())
    expect(intentAt(arrowSpy, 0)).toMatchObject({ type: 'set-message', elementId: 'message:1', arrow: '-->' })
    vi.restoreAllMocks()
    expect(useEditorStore.getState().source).not.toBe(beforeEdit)

    // ⑤ 右键同一条消息 → 删掉它
    const beforeDelete = useEditorStore.getState().source
    rerenderFromStore(seqSvgOf(sequenceProjectionOf(beforeDelete)))
    container = host.firstElementChild as HTMLDivElement
    contextMenuOn(container, 'line[data-id="message:1"]')
    act(() => api.current!.deleteTarget())
    const after = useEditorStore.getState().source
    expect(after.match(/->>|-->/g)).toHaveLength(2)
    expect(useEditorStore.getState().selection).toBeNull()

    // 全程可撤销（每次编辑一次快照）
    expect(useEditorStore.getState().canUndo).toBe(true)
  })
})
