import { act, useMemo, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetEditorHistory, useEditorStore } from '../../../store/editor'
import { DEFAULT_DIAGRAM_SOURCE } from '../../../lib/storage'
import { flowchartParser } from '../../pipeline/flowchart'
import { mindmapParser } from '../../pipeline/mindmap'
import { buildFlowchartProjection } from '../../projection/flowchart-projection'
import { buildMindmapProjection } from '../../projection/mindmap-projection'
import type { Selection } from '../../projection/selection'
import { nodeDataIdResolver } from '../../canvas-selection/data-id'
import { useCanvasInlineEdit } from '../use-canvas-inline-edit'
import { useCanvasKeyboard, type CanvasKeyboardProjection } from '../use-canvas-keyboard'

/**
 * 工单 04 焦点体系：keydown 挂在画布容器上——
 * - 画布持有焦点（事件 target 落在容器）时 Tab/Enter 生效并 preventDefault
 * - 焦点在容器内的输入控件 / 容器外（代码面板）时完全不拦截
 * - 新节点落码成功后回调 onNodeCreated（工单 05 内联命名占位）
 * 工单 06：mindmap 画布键盘同方案（Tab 加子节点 / Enter 加同级 / Del 删除）。
 * 工单 02：键盘监听挂在容器上的前提是「容器真的持有焦点」——内联编辑 Enter 提交后
 * 必须归还焦点（见文末端到端用例）；焦点掉到 body 时事件到不了容器。
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

  it('焦点在容器内（背景拖拽区）的按钮上：完全不拦截，Enter 不落码（工单 12）', () => {
    const container = mountWithSelection()
    // 常驻的「适应窗口」按钮：真实点击 / 键盘 Enter 的事件起点落在内层 span 上
    const button = document.createElement('button')
    const span = document.createElement('span')
    span.textContent = '适应窗口'
    button.appendChild(span)
    container.appendChild(button)
    button.focus()
    expect(document.activeElement).toBe(button)

    expect(keyOn(span, 'Enter')).toBe(false)
    expect(useEditorStore.getState().source).toBe(SAMPLE)
    expect(useEditorStore.getState().source).not.toContain('新节点')
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

describe('useCanvasKeyboard（工单 03 方向键导航：flowchart）', () => {
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

  /** 挂载画布容器（投影序：A、B）；selection 为 null 时模拟「无选中」 */
  function mountFlow(selection: Selection | null = { kind: 'node', nodeId: 'A' }) {
    resetEditorHistory(SAMPLE)
    useEditorStore.getState().select(selection)
    const projection = flowProjectionOf(SAMPLE)
    act(() => {
      root.render(<Harness target={{ kind: 'flowchart', projection }} />)
    })
    return host.firstElementChild as HTMLDivElement
  }

  it('画布聚焦时 →：选中下一个节点（源码顺序）、preventDefault、不改源码', () => {
    const container = mountFlow()

    expect(keyOn(container, 'ArrowRight')).toBe(true)
    expect(useEditorStore.getState().selection).toEqual({ kind: 'node', nodeId: 'B' })
    expect(useEditorStore.getState().source).toBe(SAMPLE)

    expect(keyOn(container, 'ArrowUp')).toBe(true)
    expect(useEditorStore.getState().selection).toEqual({ kind: 'node', nodeId: 'A' })
  })

  it('到末尾按 → / ↓：无操作（不回绕）但仍 preventDefault（不滚动页面）', () => {
    const container = mountFlow({ kind: 'node', nodeId: 'B' })

    expect(keyOn(container, 'ArrowRight')).toBe(true)
    expect(useEditorStore.getState().selection).toEqual({ kind: 'node', nodeId: 'B' })
    expect(keyOn(container, 'ArrowDown')).toBe(true)
    expect(useEditorStore.getState().selection).toEqual({ kind: 'node', nodeId: 'B' })
  })

  it('选中图表级（无节点选中）时按方向键：选中投影首个节点', () => {
    const container = mountFlow(null)

    expect(keyOn(container, 'ArrowLeft')).toBe(true)
    expect(useEditorStore.getState().selection).toEqual({ kind: 'node', nodeId: 'A' })
  })

  it('焦点在容器内的输入控件上：完全不拦截，选中不变', () => {
    const container = mountFlow()
    const input = document.createElement('input')
    container.appendChild(input)

    expect(keyOn(input, 'ArrowRight')).toBe(false)
    expect(useEditorStore.getState().selection).toEqual({ kind: 'node', nodeId: 'A' })
  })

  it('焦点在容器外（代码面板等）：事件不经过容器监听，不拦截不改选中', () => {
    mountFlow()
    const outside = document.createElement('div')
    document.body.appendChild(outside)

    expect(keyOn(outside, 'ArrowRight')).toBe(false)
    expect(useEditorStore.getState().selection).toEqual({ kind: 'node', nodeId: 'A' })
    outside.remove()
  })
})

describe('useCanvasKeyboard（工单 03 方向键导航：mindmap）', () => {
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

  // 节点序：root=1，分支A=2，叶子=3，分支B=4
  function mountMindmap(selection: Selection | null = { kind: 'mindmap-node', elementId: 'mindmap-node:2' }) {
    resetEditorHistory(MINDMAP_SAMPLE)
    useEditorStore.getState().select(selection)
    const projection = mindmapProjectionOf(MINDMAP_SAMPLE)
    act(() => {
      root.render(<Harness target={{ kind: 'mindmap', projection }} newNodeText="新节点" />)
    })
    return host.firstElementChild as HTMLDivElement
  }

  it('画布聚焦时 ← 走父节点、→ 走第一个子节点、↓ 走下一个兄弟', () => {
    const container = mountMindmap()

    expect(keyOn(container, 'ArrowLeft')).toBe(true)
    expect(useEditorStore.getState().selection).toEqual({ kind: 'mindmap-node', elementId: 'mindmap-node:1' })
    expect(keyOn(container, 'ArrowRight')).toBe(true)
    expect(useEditorStore.getState().selection).toEqual({ kind: 'mindmap-node', elementId: 'mindmap-node:2' })
    expect(keyOn(container, 'ArrowDown')).toBe(true)
    expect(useEditorStore.getState().selection).toEqual({ kind: 'mindmap-node', elementId: 'mindmap-node:4' })
    // 不改源码：导航只移动选中
    expect(useEditorStore.getState().source).toBe(MINDMAP_SAMPLE)
  })

  it('到边界（根按 ←）无操作但仍 preventDefault（不滚动页面）', () => {
    const container = mountMindmap({ kind: 'mindmap-node', elementId: 'mindmap-node:1' })

    expect(keyOn(container, 'ArrowLeft')).toBe(true)
    expect(useEditorStore.getState().selection).toEqual({ kind: 'mindmap-node', elementId: 'mindmap-node:1' })
  })

  it('无选中时按 →：选中根节点', () => {
    const container = mountMindmap(null)

    expect(keyOn(container, 'ArrowRight')).toBe(true)
    expect(useEditorStore.getState().selection).toEqual({ kind: 'mindmap-node', elementId: 'mindmap-node:1' })
  })

  it('焦点在容器外的代码面板：方向键不拦截不改选中', () => {
    mountMindmap()
    const outside = document.createElement('div')
    document.body.appendChild(outside)

    expect(keyOn(outside, 'ArrowDown')).toBe(false)
    expect(useEditorStore.getState().selection).toEqual({ kind: 'mindmap-node', elementId: 'mindmap-node:2' })
    outside.remove()
  })
})

/**
 * 工单 02 端到端焦点断言：内联编辑 + 画布键盘两个 hook 接在同一条链路上
 * （与 CanvasPanel 的接线一致：Enter → commit(restoreFocus)，失焦 → commit 不归还）。
 *
 * 键盘监听挂在容器上，所以「第二次 Tab 能不能用」取决于事件是否经过容器——
 * 用例把 keydown 派发到 document.activeElement（真实输入时事件的起点），
 * 而不是直接派发到容器；这样焦点没归还时事件根本到不了容器，bug 会被钉住。
 */
function FocusFlowHarness() {
  const source = useEditorStore((s) => s.source)
  const flowchart = useMemo(() => flowProjectionOf(source), [source])
  // 与真实接线一致：projection 只在源码变化时换新（内联编辑 hook 的定位 effect 依赖其身份）
  const projection = useMemo(() => ({ type: 'flowchart' as const, flowchart }), [flowchart])
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { editing, beginEdit, commit, cancel } = useCanvasInlineEdit({
    projection,
    resolver: nodeDataIdResolver(flowchart.nodes.map((n) => n.nodeId)),
    svg: null,
    containerRef,
    view: null,
  })
  useCanvasKeyboard({ kind: 'flowchart', projection: flowchart }, { containerRef, onNodeCreated: beginEdit })

  const target = editing?.target
  const initialText =
    target !== undefined && target.kind === 'flowchart'
      ? flowchart.nodes.find((n) => n.nodeId === target.nodeId)?.text ?? ''
      : ''
  return (
    <div ref={containerRef} tabIndex={0}>
      {target !== undefined && (
        <input
          aria-label="inline-edit"
          defaultValue={initialText}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(e.currentTarget.value, { restoreFocus: true })
            else if (e.key === 'Escape') cancel()
          }}
          onBlur={(e) => commit(e.currentTarget.value)}
        />
      )}
    </div>
  )
}

/** 把 keydown 派发到当前真正持焦的元素（等价于用户在那上面按键） */
function keyOnFocused(key: string): boolean {
  return keyOn(document.activeElement ?? document.body, key)
}

describe('useCanvasKeyboard（工单 02 内联编辑提交后的焦点归还）', () => {
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

  function mountFlow() {
    resetEditorHistory(SAMPLE)
    useEditorStore.getState().select({ kind: 'node', nodeId: 'A' })
    act(() => {
      root.render(<FocusFlowHarness />)
    })
    return host.firstElementChild as HTMLDivElement
  }

  it('Tab → Enter 提交 → 焦点回容器 → 再 Tab 连续加出第二层节点', async () => {
    const container = mountFlow()

    // 第一次 Tab：A --> n1，落码后进入内联命名，输入框接管焦点
    act(() => {
      expect(keyOn(container, 'Tab')).toBe(true)
    })
    const input = container.querySelector('input')
    expect(input).not.toBeNull()
    act(() => input!.focus())
    expect(document.activeElement).toBe(input)

    // 输入名称后 Enter 提交（内联编辑 keydown 路径）
    act(() => {
      input!.value = '子节点'
    })
    await act(async () => {
      keyOn(input!, 'Enter')
    })
    expect(useEditorStore.getState().source).toContain('n1[子节点]')

    // 焦点已归还画布容器：提交卸载输入框不会把焦点丢在 body 上
    expect(document.activeElement).toBe(container)

    // 第二次 Tab 直接可用（事件派发到真正持焦的元素上）
    let prevented = false
    await act(async () => {
      prevented = keyOnFocused('Tab')
    })
    expect(prevented).toBe(true)
    expect(useEditorStore.getState().selection).toEqual({ kind: 'node', nodeId: 'n2' })
    // 第二层节点挂在刚命名的 n1 下（编辑结果与键盘操作连续生效）
    expect(useEditorStore.getState().source).toContain('n1[子节点]')
    expect(useEditorStore.getState().source).toContain('n1 --> n2')
  })

  it('失焦提交不归还焦点：焦点留在画布之外，后续 Tab 事件到不了容器', async () => {
    const container = mountFlow()

    act(() => {
      expect(keyOn(container, 'Tab')).toBe(true)
    })
    const input = container.querySelector('input')!
    act(() => input.focus())

    // 用户点到画布之外（如代码面板）：输入框失焦提交，不归还焦点
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    act(() => outside.focus())
    await act(async () => {
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })
    expect(document.activeElement).toBe(outside)
    expect(document.activeElement).not.toBe(container)

    // 焦点没回画布：Tab 事件不经过容器监听器，不落码（bug 复现路径的钉子）
    expect(keyOnFocused('Tab')).toBe(false)
    expect(document.activeElement).toBe(outside)
    expect(useEditorStore.getState().selection).toEqual({ kind: 'node', nodeId: 'n1' })
    expect(useEditorStore.getState().source).not.toContain('n2')
    outside.remove()
  })
})
