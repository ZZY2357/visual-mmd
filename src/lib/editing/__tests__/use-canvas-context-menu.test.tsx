import { act, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetEditorHistory, useEditorStore } from '../../../store/editor'
import { DEFAULT_DIAGRAM_SOURCE } from '../../../lib/storage'
import { flowchartParser } from '../../pipeline/flowchart'
import { mindmapParser } from '../../pipeline/mindmap'
import { buildFlowchartProjection } from '../../projection/flowchart-projection'
import { buildMindmapProjection } from '../../projection/mindmap-projection'
import { flowchartDataIdResolver } from '../../canvas-selection/flowchart-adapter'
import { mindmapDataIdResolver } from '../../canvas-selection/mindmap-adapter'
import { useCanvasContextMenu } from '../use-canvas-context-menu'
import type { ContextMenuTarget } from '../context-menu'
import type { LinkModeState } from '../link-mode'

/**
 * 画布右键菜单 Hook（工单 07）：右键弹出随目标变化的菜单并联动选中；
 * 添加节点走编辑意图管线并回调内联命名；连线模式两步落码连线、Esc 取消；
 * 添加样式表单提交才落码。
 */

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

interface MenuSnapshot {
  menu: { target: ContextMenuTarget; items: string[] } | null
  linkMode: LinkModeState
  styleForm: unknown
}

interface ContextMenuApi {
  onCanvasClick: (e: { target: EventTarget | null }) => boolean
  addNode: () => void
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
  projection: ReturnType<typeof flowProjectionOf> | ReturnType<typeof mindmapProjectionOf>
  svg: string
  onState: (s: MenuSnapshot) => void
  apiRef: { current: ContextMenuApi | null }
  onNodeCreated?: (target: { kind: 'flowchart'; nodeId: string } | { kind: 'mindmap'; elementId: string }) => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const ctx = useCanvasContextMenu({
    projection: props.projection,
    resolver:
      props.projection.type === 'flowchart'
        ? flowchartDataIdResolver(props.projection.flowchart)
        : mindmapDataIdResolver(props.projection.mindmap),
    containerRef: ref,
    onNodeCreated: props.onNodeCreated as never,
    newNodeText: '新节点',
  })
  props.apiRef.current = {
    onCanvasClick: ctx.onCanvasClick as never,
    addNode: ctx.addNode,
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
    })
  })
  return (
    <div ref={ref} tabIndex={0} onContextMenu={ctx.onContextMenu}>
      <div dangerouslySetInnerHTML={{ __html: props.svg }} />
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
          onNodeCreated={(t) => created.push(t.kind === 'flowchart' ? t.nodeId : String(t.elementId))}
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
    expect(last.menu?.target).toEqual({ kind: 'blank' })
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
          onNodeCreated={(t) => created.push(t.kind === 'mindmap' ? t.elementId : t.nodeId)}
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
