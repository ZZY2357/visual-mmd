import { act, useMemo, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetEditorHistory, useEditorStore } from '../../../store/editor'
import { DEFAULT_DIAGRAM_SOURCE } from '../../../lib/storage'
import { flowchartParser } from '../../pipeline/flowchart'
import { mindmapParser } from '../../pipeline/mindmap'
import { buildFlowchartProjection } from '../../projection/flowchart-projection'
import { buildMindmapProjection } from '../../projection/mindmap-projection'
import type { ClassProjection } from '../../projection/class-projection'
import type { SequenceProjection } from '../../projection/sequence-projection'
import type { Selection } from '../../projection/selection'
import { nodeDataIdResolver } from '../../canvas-selection/data-id'
import { useCanvasInlineEdit } from '../use-canvas-inline-edit'
import { useCanvasKeyboard, type CanvasKeyboardProjection } from '../use-canvas-keyboard'
import type { CanvasNavigation } from '../canvas-keyboard'

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
function Harness(props: {
  target: CanvasKeyboardProjection | null
  onNodeCreated?: (id: string) => void
  newNodeText?: string
  navigation?: CanvasNavigation
  children?: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  useCanvasKeyboard(props.target, {
    containerRef: ref,
    onNodeCreated: props.onNodeCreated !== undefined ? (target) => props.onNodeCreated?.(target.kind === 'flowchart' ? target.nodeId : target.elementId) : undefined,
    newNodeText: props.newNodeText,
    navigation: props.navigation,
  })
  return (
    <div ref={ref} tabIndex={0}>
      {props.children}
    </div>
  )
}

function keyOn(target: Element, key: string, init: KeyboardEventInit = {}): boolean {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
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

// ---------- 方向键方位导航（工单 14）：注入假 CanvasNavigation，不碰 DOM / mermaid ----------

/** 假可视范围：以 (cx, cy) 为中心、20×20 的容器坐标矩形 */
function rectAt(cx: number, cy: number): { left: number; top: number; width: number; height: number } {
  return { left: cx - 10, top: cy - 10, width: 20, height: 20 }
}

type FakeKind = 'flowchart' | 'mindmap' | 'class' | 'sequence'

/** 假导航适配对象（工单 14 §测试）：entries 的键 = data-id，插入顺序 = 投影顺序（并列取先者） */
function fakeNav(
  entries: Record<string, { left: number; top: number; width: number; height: number }>,
  kind: FakeKind,
) {
  const revealed: string[] = []
  const known = new Set(Object.keys(entries))
  const toSelection = (dataId: string): Selection | null => {
    if (kind === 'flowchart') return { kind: 'node', nodeId: dataId }
    if (kind === 'mindmap') return { kind: 'mindmap-node', elementId: dataId }
    if (kind === 'class') return { kind: 'class', name: dataId }
    return { kind: 'participant', actorId: dataId }
  }
  const nav: CanvasNavigation = {
    extents: () => Object.entries(entries).map(([dataId, rect]) => ({ dataId, rect })),
    // 与真实适配层同口径：选中对应的 data-id 必须在本图种投影里，否则无锚点（null）
    dataIdOf: (sel) => {
      if (sel === null) return null
      if (sel.kind === 'node') return kind === 'flowchart' && known.has(sel.nodeId) ? sel.nodeId : null
      if (sel.kind === 'mindmap-node') return kind === 'mindmap' && known.has(sel.elementId) ? sel.elementId : null
      if (sel.kind === 'class') return kind === 'class' && known.has(sel.name) ? sel.name : null
      if (sel.kind === 'participant') return kind === 'sequence' && known.has(sel.actorId) ? sel.actorId : null
      return null
    },
    toSelection,
    reveal: (id) => {
      revealed.push(id)
    },
    firstSelection: () => {
      const firstId = Object.keys(entries)[0]
      return firstId === undefined ? null : toSelection(firstId)
    },
  }
  return { revealed, nav }
}

// 锚点 A 中心 (100,100)；B 正上、C 正下、D 正右（插入顺序 = 投影顺序）
const FLOW_RECTS = {
  A: rectAt(100, 100),
  B: rectAt(100, 50),
  C: rectAt(100, 150),
  D: rectAt(150, 100),
}

describe('useCanvasKeyboard（工单 14 方向键方位导航：flowchart）', () => {
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

  /** 挂载画布容器（真 flowchart 投影走 select 链路；几何全部来自注入的假 navigation） */
  function mountFlow(selection: Selection | null, navigation?: CanvasNavigation) {
    resetEditorHistory(SAMPLE)
    useEditorStore.getState().select(selection)
    const projection = flowProjectionOf(SAMPLE)
    act(() => {
      root.render(<Harness target={{ kind: 'flowchart', projection }} navigation={navigation} />)
    })
    return host.firstElementChild as HTMLDivElement
  }

  it('四向落点：B 在正上 / C 在正下 / D 在正右 → 逐方向选中并 reveal', () => {
    const { nav, revealed } = fakeNav(FLOW_RECTS, 'flowchart')
    const container = mountFlow({ kind: 'node', nodeId: 'A' }, nav)

    expect(keyOn(container, 'ArrowUp')).toBe(true)
    expect(useEditorStore.getState().selection).toEqual({ kind: 'node', nodeId: 'B' })

    useEditorStore.getState().select({ kind: 'node', nodeId: 'A' })
    expect(keyOn(container, 'ArrowDown')).toBe(true)
    expect(useEditorStore.getState().selection).toEqual({ kind: 'node', nodeId: 'C' })

    useEditorStore.getState().select({ kind: 'node', nodeId: 'A' })
    expect(keyOn(container, 'ArrowRight')).toBe(true)
    expect(useEditorStore.getState().selection).toEqual({ kind: 'node', nodeId: 'D' })

    // 左向 45° 锥内无候选：选中不变、仍 preventDefault（不滚动页面 / 不回绕）
    useEditorStore.getState().select({ kind: 'node', nodeId: 'A' })
    expect(keyOn(container, 'ArrowLeft')).toBe(true)
    expect(useEditorStore.getState().selection).toEqual({ kind: 'node', nodeId: 'A' })

    expect(revealed).toEqual(['B', 'C', 'D'])
    expect(useEditorStore.getState().source).toBe(SAMPLE) // 导航只改选中，不改源码
  })

  it('距离并列取投影序靠前者', () => {
    // B(150,120) 与 C(150,80) 到 A(100,100) 的距离并列 → 取插入靠前的 B
    const { nav, revealed } = fakeNav({ A: rectAt(100, 100), B: rectAt(150, 120), C: rectAt(150, 80) }, 'flowchart')
    const container = mountFlow({ kind: 'node', nodeId: 'A' }, nav)

    expect(keyOn(container, 'ArrowRight')).toBe(true)
    expect(useEditorStore.getState().selection).toEqual({ kind: 'node', nodeId: 'B' })
    expect(revealed).toEqual(['B'])
  })

  it('正好 45°（|dx| == |dy|）算候选', () => {
    const { nav } = fakeNav({ A: rectAt(100, 100), D: rectAt(150, 150) }, 'flowchart')
    const container = mountFlow({ kind: 'node', nodeId: 'A' }, nav)

    // 边界算候选：→ 与 ↓ 都应命中 D（若不算候选则两者都无操作）
    expect(keyOn(container, 'ArrowRight')).toBe(true)
    expect(useEditorStore.getState().selection).toEqual({ kind: 'node', nodeId: 'D' })

    useEditorStore.getState().select({ kind: 'node', nodeId: 'A' })
    expect(keyOn(container, 'ArrowDown')).toBe(true)
    expect(useEditorStore.getState().selection).toEqual({ kind: 'node', nodeId: 'D' })
  })

  it('修饰键 + 方向键：不导航但仍 preventDefault（修前进/后退与静默改选中）', () => {
    const { nav, revealed } = fakeNav(FLOW_RECTS, 'flowchart')
    const container = mountFlow({ kind: 'node', nodeId: 'A' }, nav)

    for (const init of [{ shiftKey: true }, { altKey: true }, { metaKey: true }, { ctrlKey: true }]) {
      expect(keyOn(container, 'ArrowRight', init)).toBe(true)
      expect(useEditorStore.getState().selection).toEqual({ kind: 'node', nodeId: 'A' })
    }
    expect(revealed).toEqual([])
  })

  it('无选中（null）：任一方向键选中 firstSelection()（投影首节点）并 reveal', () => {
    const { nav, revealed } = fakeNav(FLOW_RECTS, 'flowchart')
    const container = mountFlow(null, nav)

    expect(keyOn(container, 'ArrowLeft')).toBe(true)
    expect(useEditorStore.getState().selection).toEqual({ kind: 'node', nodeId: 'A' })
    expect(revealed).toEqual(['A'])
  })

  it('选中已不在投影中（dataIdOf 返回 null）：回落首节点', () => {
    const { nav } = fakeNav(FLOW_RECTS, 'flowchart')
    const container = mountFlow({ kind: 'node', nodeId: 'X' }, nav)

    expect(keyOn(container, 'ArrowRight')).toBe(true)
    expect(useEditorStore.getState().selection).toEqual({ kind: 'node', nodeId: 'A' })
  })

  it('焦点在容器内输入控件 / 容器外代码面板：方向键不拦截、选中不变', () => {
    const { nav } = fakeNav(FLOW_RECTS, 'flowchart')
    const container = mountFlow({ kind: 'node', nodeId: 'A' }, nav)

    const input = document.createElement('input')
    container.appendChild(input)
    expect(keyOn(input, 'ArrowRight')).toBe(false)
    expect(useEditorStore.getState().selection).toEqual({ kind: 'node', nodeId: 'A' })

    const outside = document.createElement('div')
    document.body.appendChild(outside)
    expect(keyOn(outside, 'ArrowRight')).toBe(false)
    expect(useEditorStore.getState().selection).toEqual({ kind: 'node', nodeId: 'A' })
    outside.remove()
  })

  it('navigation 未接线（undefined）：方向键只 preventDefault、不移动选中、不抛错', () => {
    const container = mountFlow({ kind: 'node', nodeId: 'A' })

    expect(keyOn(container, 'ArrowRight')).toBe(true)
    expect(useEditorStore.getState().selection).toEqual({ kind: 'node', nodeId: 'A' })
    expect(useEditorStore.getState().source).toBe(SAMPLE)
  })
})

describe('useCanvasKeyboard（工单 14 方向键方位导航：mindmap）', () => {
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

  // 节点中心（容器坐标）：n1 左中、n2 正下、n3 正右（键即 elementId）
  const NODE_RECTS = { n1: rectAt(100, 100), n2: rectAt(100, 150), n3: rectAt(150, 100) }

  function mountMindmap(selection: Selection | null, navigation?: CanvasNavigation) {
    resetEditorHistory(MINDMAP_SAMPLE)
    useEditorStore.getState().select(selection)
    const projection = mindmapProjectionOf(MINDMAP_SAMPLE)
    act(() => {
      root.render(<Harness target={{ kind: 'mindmap', projection }} navigation={navigation} newNodeText="新节点" />)
    })
    return host.firstElementChild as HTMLDivElement
  }

  it('方向键按几何落点：elementId 形态的选中与 reveal', () => {
    const { nav, revealed } = fakeNav(NODE_RECTS, 'mindmap')
    const container = mountMindmap({ kind: 'mindmap-node', elementId: 'n1' }, nav)

    expect(keyOn(container, 'ArrowDown')).toBe(true)
    expect(useEditorStore.getState().selection).toEqual({ kind: 'mindmap-node', elementId: 'n2' })

    useEditorStore.getState().select({ kind: 'mindmap-node', elementId: 'n1' })
    expect(keyOn(container, 'ArrowRight')).toBe(true)
    expect(useEditorStore.getState().selection).toEqual({ kind: 'mindmap-node', elementId: 'n3' })

    expect(revealed).toEqual(['n2', 'n3'])
    expect(useEditorStore.getState().source).toBe(MINDMAP_SAMPLE) // 导航不改源码
  })

  it('无选中时按方向键：选中 firstSelection()（投影首节点）', () => {
    const { nav } = fakeNav(NODE_RECTS, 'mindmap')
    const container = mountMindmap(null, nav)

    expect(keyOn(container, 'ArrowDown')).toBe(true)
    expect(useEditorStore.getState().selection).toEqual({ kind: 'mindmap-node', elementId: 'n1' })
  })
})

// ---------- class / sequence 只享受方向键：编辑键命中也直接 return（不落码、不 preventDefault）----------

const CLASS_SAMPLE = `classDiagram
    class Customer
    Customer <|-- Account
`

const SEQ_SAMPLE = `sequenceDiagram
    participant 使用者
    participant 系统
`

const EMPTY_CLASS_PROJECTION: ClassProjection = { classes: [], members: [], relations: [], notes: [], classDefs: [] }
const EMPTY_SEQ_PROJECTION: SequenceProjection = { autonumber: false, participants: [], messages: [], notes: [], blocks: [] }

describe('useCanvasKeyboard（工单 14：class / sequence 只享受方向键）', () => {
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

  it('class：Tab / Enter / Delete 不落码、不 preventDefault；方向键仍方位导航', () => {
    resetEditorHistory(CLASS_SAMPLE)
    useEditorStore.getState().select({ kind: 'class', name: 'Customer' })
    const { nav, revealed } = fakeNav({ Customer: rectAt(100, 100), Account: rectAt(100, 150) }, 'class')
    act(() => {
      root.render(<Harness target={{ kind: 'class', projection: EMPTY_CLASS_PROJECTION }} navigation={nav} />)
    })
    const container = host.firstElementChild as HTMLDivElement

    for (const key of ['Tab', 'Enter', 'Delete']) {
      expect(keyOn(container, key)).toBe(false)
      expect(useEditorStore.getState().source).toBe(CLASS_SAMPLE)
    }

    expect(keyOn(container, 'ArrowDown')).toBe(true)
    expect(useEditorStore.getState().selection).toEqual({ kind: 'class', name: 'Account' })
    expect(revealed).toEqual(['Account'])
    expect(useEditorStore.getState().source).toBe(CLASS_SAMPLE)
  })

  it('sequence：Tab / Enter / Delete 不落码、不 preventDefault；方向键仍方位导航', () => {
    resetEditorHistory(SEQ_SAMPLE)
    useEditorStore.getState().select({ kind: 'participant', actorId: '使用者' })
    const { nav, revealed } = fakeNav({ 使用者: rectAt(100, 100), 系统: rectAt(150, 100) }, 'sequence')
    act(() => {
      root.render(<Harness target={{ kind: 'sequence', projection: EMPTY_SEQ_PROJECTION }} navigation={nav} />)
    })
    const container = host.firstElementChild as HTMLDivElement

    for (const key of ['Tab', 'Enter', 'Delete']) {
      expect(keyOn(container, key)).toBe(false)
      expect(useEditorStore.getState().source).toBe(SEQ_SAMPLE)
    }

    expect(keyOn(container, 'ArrowRight')).toBe(true)
    expect(useEditorStore.getState().selection).toEqual({ kind: 'participant', actorId: '系统' })
    expect(revealed).toEqual(['系统'])
    expect(useEditorStore.getState().source).toBe(SEQ_SAMPLE)
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
