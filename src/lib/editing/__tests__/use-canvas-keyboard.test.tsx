import { act, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetEditorHistory, useEditorStore } from '../../../store/editor'
import { DEFAULT_DIAGRAM_SOURCE } from '../../../lib/storage'
import { flowchartParser } from '../../pipeline/flowchart'
import { mindmapParser } from '../../pipeline/mindmap'
import { buildFlowchartProjection } from '../../projection/flowchart-projection'
import { buildMindmapProjection } from '../../projection/mindmap-projection'
import { useCanvasKeyboard, type CanvasKeyboardProjection } from '../use-canvas-keyboard'

/**
 * 工单 04 焦点体系：keydown 挂在画布容器上——
 * - 画布持有焦点（事件 target 落在容器）时 Tab/Enter 生效并 preventDefault
 * - 焦点在容器内的输入控件 / 容器外（代码面板）时完全不拦截
 * - 新节点落码成功后回调 onNodeCreated（工单 05 内联命名占位）
 * 工单 06：mindmap 画布键盘同方案（Tab 加子节点 / Enter 加同级 / Del 删除）。
 */

const SAMPLE = `flowchart TD
    A[开始] --> B[处理]
`

const MINDMAP_SAMPLE = `mindmap
  root((中心))
    分支A
      叶子
    分支B
`

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

function flowProjectionOf(source: string) {
  const parsed = flowchartParser.parse(source)
  if (!parsed.ok) throw new Error(`样例源码必须可解析：${parsed.error.message}`)
  return buildFlowchartProjection(parsed.doc)
}

function mindmapProjectionOf(source: string) {
  const parsed = mindmapParser.parse(source)
  if (!parsed.ok) throw new Error(`样例源码必须可解析：${parsed.error.message}`)
  return buildMindmapProjection(parsed.doc)
}

/** 测试挂载点：外层 div 是「画布容器」（监听宿主），children 可塞入输入控件 */
function Harness(props: { target: CanvasKeyboardProjection | null; onNodeCreated?: (id: string) => void; newNodeText?: string; children?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null)
  useCanvasKeyboard(props.target, {
    containerRef: ref,
    onNodeCreated: props.onNodeCreated !== undefined ? (target) => props.onNodeCreated?.(target.kind === 'flowchart' ? target.nodeId : target.elementId) : undefined,
    newNodeText: props.newNodeText,
  })
  return (
    <div ref={ref} tabIndex={0}>
      {props.children}
    </div>
  )
}

function keyOn(target: Element, key: string): boolean {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event.defaultPrevented
}

describe('useCanvasKeyboard（工单 04 画布焦点体系）', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
    useEditorStore.getState().select(null)
  })

  function mountWithSelection(onNodeCreated?: (id: string) => void) {
    resetEditorHistory(SAMPLE)
    useEditorStore.getState().select({ kind: 'node', nodeId: 'A' })
    const projection = flowProjectionOf(SAMPLE)
    act(() => {
      root.render(<Harness target={{ kind: 'flowchart', projection }} onNodeCreated={onNodeCreated} />)
    })
    return host.firstElementChild as HTMLDivElement
  }

  it('画布聚焦时 Tab：连出新节点、preventDefault、回调 onNodeCreated', () => {
    const created: string[] = []
    const container = mountWithSelection((id) => created.push(id))

    const prevented = keyOn(container, 'Tab')

    expect(prevented).toBe(true)
    const { source } = useEditorStore.getState()
    expect(source).toContain('A --> n1')
    expect(created).toEqual(['n1'])
    expect(useEditorStore.getState().selection).toEqual({ kind: 'node', nodeId: 'n1' })
  })

  it('画布聚焦时 Enter：无入边的根节点退化为连出（A --> n1）', () => {
    const container = mountWithSelection()

    expect(keyOn(container, 'Enter')).toBe(true)
    expect(useEditorStore.getState().source).toContain('A --> n1')
  })

  it('焦点在容器内的输入控件上：完全不拦截，Tab 不落码', () => {
    const container = mountWithSelection()
    const input = document.createElement('input')
    container.appendChild(input)

    expect(keyOn(input, 'Tab')).toBe(false)
    expect(useEditorStore.getState().source).toBe(SAMPLE)
  })

  it('焦点在容器外（代码面板等）：事件不经过容器监听，不拦截不落码', () => {
    mountWithSelection()
    const outside = document.createElement('div')
    document.body.appendChild(outside)

    expect(keyOn(outside, 'Tab')).toBe(false)
    expect(useEditorStore.getState().source).toBe(SAMPLE)
    outside.remove()
  })

  it('未选中节点时：不处理（Tab 交给浏览器默认行为）', () => {
    resetEditorHistory(SAMPLE)
    useEditorStore.getState().select(null)
    const projection = flowProjectionOf(SAMPLE)
    act(() => {
      root.render(<Harness target={{ kind: 'flowchart', projection }} />)
    })
    const container = host.firstElementChild as HTMLDivElement

    expect(keyOn(container, 'Tab')).toBe(false)
    expect(useEditorStore.getState().source).toBe(SAMPLE)
  })
})

describe('useCanvasKeyboard（工单 06 mindmap 画布键盘）', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
    useEditorStore.getState().select(null)
  })

  function mountMindmap(onNodeCreated?: (id: string) => void) {
    resetEditorHistory(MINDMAP_SAMPLE)
    const projection = mindmapProjectionOf(MINDMAP_SAMPLE)
    // 选中「分支A」（elementId 与投影序号一致：root=1, 分支A=2, 叶子=3, 分支B=4）
    useEditorStore.getState().select({ kind: 'mindmap-node', elementId: 'mindmap-node:2' })
    act(() => {
      root.render(
        <Harness
          target={{ kind: 'mindmap', projection }}
          onNodeCreated={onNodeCreated}
          newNodeText="新节点"
        />,
      )
    })
    return host.firstElementChild as HTMLDivElement
  }

  it('Tab：给选中节点加子节点，缩进落码，选中新节点并回调内联命名', () => {
    const created: string[] = []
    const container = mountMindmap((id) => created.push(id))

    expect(keyOn(container, 'Tab')).toBe(true)

    const { source, selection } = useEditorStore.getState()
    // 「分支A」的子节点落在其后代（叶子）之后，同级缩进
    expect(source).toContain('      新节点')
    expect(selection).toEqual({ kind: 'mindmap-node', elementId: 'mindmap-node:4' })
    expect(created).toEqual(['mindmap-node:4'])
  })

  it('Enter：加同级节点，缩进层级与选中节点一致', () => {
    const container = mountMindmap()

    expect(keyOn(container, 'Enter')).toBe(true)

    const { source, selection } = useEditorStore.getState()
    expect(source).toContain('    新节点')
    // 同级节点同样落在「分支A」子树（叶子）之后，先于「分支B」
    expect(selection).toEqual({ kind: 'mindmap-node', elementId: 'mindmap-node:4' })
  })

  it('Delete：删除选中节点（连同子树），不产生新节点回调', () => {
    const created: string[] = []
    const container = mountMindmap((id) => created.push(id))

    expect(keyOn(container, 'Delete')).toBe(true)

    const { source } = useEditorStore.getState()
    expect(source).not.toContain('分支A')
    expect(source).not.toContain('叶子')
    expect(created).toEqual([])
  })
})
