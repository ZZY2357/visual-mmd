import { act, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetEditorHistory, useEditorStore } from '../../../store/editor'
import { DEFAULT_DIAGRAM_SOURCE } from '../../../lib/storage'
import { flowchartParser } from '../../pipeline/flowchart'
import { classParser } from '../../pipeline/class'
import { sequenceParser } from '../../pipeline/sequence'
import { ganttParser } from '../../pipeline/gantt'
import { buildFlowchartProjection } from '../../projection/flowchart-projection'
import { buildClassProjection } from '../../projection/class-projection'
import { buildSequenceProjection } from '../../projection/sequence-projection'
import { buildGanttProjection } from '../../projection/gantt-projection'
import { ganttDataIdResolver } from '../../canvas-selection/gantt-adapter'
import { nodeDataIdResolver } from '../../canvas-selection/data-id'
import { annotateNodeDataIds } from '../../canvas-selection/node-data-ids'
import type { CanvasInlineEditTarget } from '../inline-edit'
import { useCanvasInlineEdit, type InlineEditCloseOptions } from '../use-canvas-inline-edit'

/**
 * 工单 05 内联编辑 Hook：双击进入编辑 → 回车提交落码 / Esc 取消；
 * 新建节点经 beginEdit 直接进入（工单 04 的 onNodeCreated 占位接线）。
 * 工单 02：Enter/Esc（keydown 路径）提交后焦点归还画布容器，失焦提交不归还。
 */

const SAMPLE = `flowchart TD
    A[开始] --> B[处理]
`

const SVG_STUB = '<svg><g data-id="A"><text>开始</text></g><g data-id="B"><text>处理</text></g></svg>'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

function projectionOf(source: string) {
  const parsed = flowchartParser.parse(source)
  if (!parsed.ok) throw new Error(`样例源码必须可解析：${parsed.error.message}`)
  return { type: 'flowchart' as const, flowchart: buildFlowchartProjection(parsed.doc) }
}

interface InlineEditApi {
  commit: (text: string, options?: InlineEditCloseOptions) => void
  cancel: () => void
  beginEdit: (target: CanvasInlineEditTarget) => void
}

interface HarnessProps {
  projection: ReturnType<typeof projectionOf>
  onEditing: (editing: unknown) => void
  apiRef: { current: InlineEditApi | null }
}

function Harness({ projection, onEditing, apiRef }: HarnessProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const { editing, onDoubleClick, beginEdit, commit, cancel } = useCanvasInlineEdit({
    projection,
    resolver: nodeDataIdResolver(['A', 'B']),
    svg: SVG_STUB,
    containerRef: ref,
    view: null,
  })
  apiRef.current = { commit, cancel, beginEdit }
  useEffect(() => {
    onEditing(editing)
  }, [editing, onEditing])
  return (
    // tabIndex=0 与真实画布容器一致（可聚焦，是键盘监听的宿主）
    <div ref={ref} tabIndex={0} onDoubleClick={onDoubleClick}>
      <div dangerouslySetInnerHTML={{ __html: SVG_STUB }} />
    </div>
  )
}

describe('useCanvasInlineEdit（工单 05 内联编辑）', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let snapshots: unknown[]
  let api: { current: InlineEditApi | null }

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    snapshots = []
    api = { current: null }
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
    useEditorStore.getState().select(null)
  })

  function mount() {
    resetEditorHistory(SAMPLE)
    act(() => {
      root.render(<Harness projection={projectionOf(SAMPLE)} onEditing={(e) => snapshots.push(e)} apiRef={api} />)
    })
    return host.firstElementChild as HTMLDivElement
  }

  it('双击 data-id 节点 → 进入编辑（flowchart 寻址）', () => {
    const container = mount()
    const node = container.querySelector('[data-id="A"]')!
    act(() => {
      node.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    })
    expect(snapshots.at(-1)).toMatchObject({ target: { kind: 'flowchart', nodeId: 'A' } })
  })

  it('提交：落码改文本并关闭输入框', () => {
    const container = mount()
    act(() => {
      container.querySelector('[data-id="A"]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    })
    act(() => {
      api.current!.commit('登录')
    })
    expect(useEditorStore.getState().source).toContain('A[登录]')
    expect(snapshots.at(-1)).toBeNull()
  })

  it('未改动提交：只关闭，不落码', () => {
    const container = mount()
    act(() => {
      container.querySelector('[data-id="A"]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    })
    act(() => {
      api.current!.commit('开始')
    })
    expect(useEditorStore.getState().source).toBe(SAMPLE)
    expect(snapshots.at(-1)).toBeNull()
  })

  it('取消（Esc 路径）：不落码', () => {
    const container = mount()
    act(() => {
      container.querySelector('[data-id="A"]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    })
    act(() => {
      api.current!.cancel()
    })
    expect(useEditorStore.getState().source).toBe(SAMPLE)
    expect(snapshots.at(-1)).toBeNull()
  })

  it('新建节点命名：beginEdit 直接进入（工单 04 onNodeCreated 接线路径）', () => {
    mount()
    act(() => {
      api.current!.beginEdit({ kind: 'flowchart', nodeId: 'B' })
    })
    expect(snapshots.at(-1)).toMatchObject({ target: { kind: 'flowchart', nodeId: 'B' } })
    act(() => {
      api.current!.commit('结束')
    })
    expect(useEditorStore.getState().source).toContain('B[结束]')
  })

  // ---- 工单 02：编辑结束后的焦点归还（ADR-0010） ----

  /** 进入编辑，并把焦点从画布容器上移走。
   * 模拟提交瞬间的真实状态：内联输入框（容器子元素）持焦，提交后它被卸载，
   * React 19 不会把焦点还给已移除的元素 → 焦点落到 body。 */
  function enterEditingWithFocusLost(): HTMLDivElement {
    const container = mount()
    act(() => {
      container.querySelector('[data-id="A"]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    })
    act(() => container.focus())
    act(() => container.blur())
    expect(document.activeElement).not.toBe(container)
    return container
  }

  it('Enter 提交（keydown 路径）：焦点归还画布容器', async () => {
    const container = enterEditingWithFocusLost()
    await act(async () => {
      api.current!.commit('登录', { restoreFocus: true })
    })
    expect(useEditorStore.getState().source).toContain('A[登录]')
    expect(document.activeElement).toBe(container)
  })

  it('Esc 取消：焦点同样归还画布容器（取消后还要继续在画布上操作）', async () => {
    const container = enterEditingWithFocusLost()
    await act(async () => {
      api.current!.cancel()
    })
    expect(useEditorStore.getState().source).toBe(SAMPLE)
    expect(document.activeElement).toBe(container)
  })

  it('失焦提交（blur 路径，不带 restoreFocus）：不归还焦点，不把用户从画布外拽回来', async () => {
    const container = enterEditingWithFocusLost()
    // 用户点到画布之外（如代码面板）
    const outside = document.createElement('button')
    host.appendChild(outside)
    act(() => outside.focus())
    expect(document.activeElement).toBe(outside)

    await act(async () => {
      api.current!.commit('登录')
    })

    expect(useEditorStore.getState().source).toContain('A[登录]')
    expect(document.activeElement).toBe(outside)
    expect(document.activeElement).not.toBe(container)
  })

  it('Enter 提交后紧接着的失焦兜底提交：不重复落码（同一编辑只提交一次）', async () => {
    enterEditingWithFocusLost()
    await act(async () => {
      api.current!.commit('登录', { restoreFocus: true })
    })
    // 归还焦点会让输入框失焦，其 onBlur 兜底提交拿的是已关闭的编辑状态
    await act(async () => {
      api.current!.commit('登录')
    })
    // 只压了一份快照：撤销一次即回到原源码
    act(() => useEditorStore.getState().undo())
    expect(useEditorStore.getState().source).toBe(SAMPLE)
  })
})

/**
 * 工单 06：IME 组合期间的提交/取消抑制。
 * 输入框的 Enter/Esc/blur 由渲染方（CanvasPanel 的 InlineEditInput）转成 commit/cancel
 * 调用，事件到不了 hook，故 hook 在画布容器上跟踪 compositionstart/end。组合期间收到的
 * commit/cancel 一律忽略：Enter 只是确认候选词、Esc 只是打断 IME，都不能把半截拼音写进源码。
 */
describe('useCanvasInlineEdit（工单 06 IME 组合输入）', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let snapshots: unknown[]
  let api: { current: InlineEditApi | null }

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    snapshots = []
    api = { current: null }
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
    useEditorStore.getState().select(null)
  })

  function mountAndEnterEdit() {
    resetEditorHistory(SAMPLE)
    act(() => {
      root.render(<Harness projection={projectionOf(SAMPLE)} onEditing={(e) => snapshots.push(e)} apiRef={api} />)
    })
    const container = host.firstElementChild as HTMLDivElement
    act(() => {
      container.querySelector('[data-id="A"]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    })
    return container
  }

  function compositionOn(target: Element, type: 'compositionstart' | 'compositionend'): void {
    target.dispatchEvent(new CompositionEvent(type, { bubbles: true }))
  }

  it('组合期间 Enter 提交：忽略（确认候选词不落码），编辑仍打开', () => {
    const container = mountAndEnterEdit()

    act(() => compositionOn(container, 'compositionstart'))
    act(() => api.current!.commit('zhong', { restoreFocus: true }))

    expect(useEditorStore.getState().source).toBe(SAMPLE)
    expect(snapshots.at(-1)).not.toBeNull() // 编辑未关闭

    // compositionend 后输入已确认的文本再提交：正常落码
    act(() => compositionOn(container, 'compositionend'))
    act(() => api.current!.commit('登录', { restoreFocus: true }))
    expect(useEditorStore.getState().source).toContain('A[登录]')
    expect(snapshots.at(-1)).toBeNull()
  })

  it('组合期间 Esc（打断 IME）：不取消内联编辑、不落码', () => {
    const container = mountAndEnterEdit()

    act(() => compositionOn(container, 'compositionstart'))
    act(() => api.current!.cancel())

    expect(useEditorStore.getState().source).toBe(SAMPLE)
    expect(snapshots.at(-1)).not.toBeNull() // 编辑仍打开

    act(() => compositionOn(container, 'compositionend'))
    act(() => api.current!.cancel())
    expect(snapshots.at(-1)).toBeNull()
  })

  it('组合期间失焦提交：忽略（不把组合缓冲写进源码）', () => {
    const container = mountAndEnterEdit()

    act(() => compositionOn(container, 'compositionstart'))
    act(() => api.current!.commit('ban'))

    expect(useEditorStore.getState().source).toBe(SAMPLE)
    expect(snapshots.at(-1)).not.toBeNull()
  })
})

/**
 * 工单 09：class 图新建类后的内联命名（浮层定位）。
 * 缺陷形态：类框 g.node 没有 data-id（v12 只有 `{svgId}-classId-{类名}-{n}`），
 * findTargetElement 找不到元素 → rect === null → 输入框 `display: none`、拿不到焦点。
 * 修复走 node-data-ids 的渲染后处理（反注 data-id），本用例覆盖「反注后能定位」
 * 与「不反注就定位不到」（负向对照，证明断言有效）。
 */

const CLASS_SAMPLE = `classDiagram
class 新类
`

/** mermaid v12 class 图类框的真实形态：无 data-id，只有 classId- 形式的 DOM id */
const CLASS_SVG = '<svg id="mmd-preview-21"><g class="node default" id="mmd-preview-21-classId-新类-19"><rect/><g class="label-group"><text>新类</text></g></g></svg>'

function classProjectionOf() {
  const parsed = classParser.parse(CLASS_SAMPLE)
  if (!parsed.ok) throw new Error(`样例源码必须可解析：${parsed.error.message}`)
  return { type: 'class' as const, class: buildClassProjection(parsed.doc) }
}

/** 投影引用必须跨渲染稳定（同 App 的 useMemo）：否则 rect 副作用会反复 setState */
const CLASS_PROJECTION = classProjectionOf()

function ClassHarness({
  annotate,
  onEditing,
  apiRef,
}: {
  annotate: boolean
  onEditing: (editing: unknown) => void
  apiRef: { current: InlineEditApi | null }
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  // 渲染后处理（与 use-canvas-selection 中 node-data-ids 的接线同序：先注入 SVG 再反注）
  useEffect(() => {
    if (annotate && ref.current !== null) annotateNodeDataIds(ref.current)
  }, [annotate])
  const { editing, beginEdit, commit } = useCanvasInlineEdit({
    projection: CLASS_PROJECTION,
    resolver: null,
    svg: CLASS_SVG,
    containerRef: ref,
    view: null,
  })
  apiRef.current = { commit, cancel: () => {}, beginEdit }
  useEffect(() => {
    onEditing(editing)
  }, [editing, onEditing])
  return <div ref={ref} tabIndex={0} dangerouslySetInnerHTML={{ __html: CLASS_SVG }} />
}

describe('useCanvasInlineEdit（工单 09：class 新建类的定位链路）', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let snapshots: unknown[]
  let api: { current: InlineEditApi | null }

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    snapshots = []
    api = { current: null }
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
    useEditorStore.getState().select(null)
  })

  function mountClass(annotate: boolean) {
    resetEditorHistory(CLASS_SAMPLE)
    act(() => {
      root.render(<ClassHarness annotate={annotate} onEditing={(e) => snapshots.push(e)} apiRef={api} />)
    })
  }

  it('反注 data-id 后：beginEdit({kind:class}) 拿到浮层定位（rect 非空，不再 display:none）', () => {
    mountClass(true)
    act(() => {
      api.current!.beginEdit({ kind: 'class', name: '新类' })
    })
    expect(snapshots.at(-1)).toMatchObject({ target: { kind: 'class', name: '新类' } })
    const editing = snapshots.at(-1) as { rect: unknown }
    expect(editing.rect).not.toBeNull()
  })

  it('负向对照：不反注 data-id 时定位不到（rect 保持 null —— 缺陷形态）', () => {
    mountClass(false)
    act(() => {
      api.current!.beginEdit({ kind: 'class', name: '新类' })
    })
    const editing = snapshots.at(-1) as { rect: unknown }
    expect(editing.rect).toBeNull()
  })

  it('提交类名 → rename-class 落码', () => {
    mountClass(true)
    act(() => {
      api.current!.beginEdit({ kind: 'class', name: '新类' })
    })
    act(() => {
      api.current!.commit('订单')
    })
    expect(useEditorStore.getState().source).toContain('class 订单')
  })
})

/**
 * 工单 05：双击既有元素的内联编辑接线（class 类名 / sequence 参与者别名）。
 * 与新建命中共用同一输入框，但双击走 onDoubleClick 的图种分支（class → rename-class，
 * sequence → set-participant）；成员正文/关系标签/消息文本不进入编辑。
 */

const CLASS_DBL_SAMPLE = `classDiagram
    class Foo {
        +String name
    }
`
const CLASS_DBL_SVG = '<svg><g data-id="Foo"><text>Foo</text><text>+String name</text></g></svg>'

const SEQ_DBL_SAMPLE = `sequenceDiagram
    participant 甲
    participant 乙
    甲->>乙: hi
`
const SEQ_DBL_SVG = '<svg><g data-id="甲"><text>甲</text></g><g data-id="乙"><text>乙</text></g><line data-id="message:1"/></svg>'

const CLASS_DBL_PROJECTION = (() => {
  const parsed = classParser.parse(CLASS_DBL_SAMPLE)
  if (!parsed.ok) throw new Error(`样例源码必须可解析：${parsed.error.message}`)
  return { type: 'class' as const, class: buildClassProjection(parsed.doc) }
})()

const SEQ_DBL_PROJECTION = (() => {
  const parsed = sequenceParser.parse(SEQ_DBL_SAMPLE)
  if (!parsed.ok) throw new Error(`样例源码必须可解析：${parsed.error.message}`)
  return { type: 'sequence' as const, sequence: buildSequenceProjection(parsed.doc) }
})()

type InlineEditOptions = Parameters<typeof useCanvasInlineEdit>[0]

function DblHarness(props: {
  projection: InlineEditOptions['projection']
  resolver: InlineEditOptions['resolver']
  svg: string
  onEditing: (editing: unknown) => void
  apiRef: { current: InlineEditApi | null }
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const { onEditing } = props
  const { editing, onDoubleClick, commit, beginEdit } = useCanvasInlineEdit({
    projection: props.projection,
    resolver: props.resolver,
    svg: props.svg,
    containerRef: ref,
    view: null,
  })
  props.apiRef.current = { commit, cancel: () => {}, beginEdit }
  useEffect(() => {
    onEditing(editing)
  }, [editing, onEditing])
  return (
    <div ref={ref} tabIndex={0} onDoubleClick={onDoubleClick} dangerouslySetInnerHTML={{ __html: props.svg }} />
  )
}

describe('useCanvasInlineEdit（工单 05：class / sequence 双击内联编辑）', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let snapshots: unknown[]
  let api: { current: InlineEditApi | null }

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    snapshots = []
    api = { current: null }
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
    useEditorStore.getState().select(null)
  })

  it('class：双击类名 → 进入改名（{kind:class}），提交落 rename-class', () => {
    resetEditorHistory(CLASS_DBL_SAMPLE)
    act(() => {
      root.render(
        <DblHarness
          projection={CLASS_DBL_PROJECTION}
          resolver={nodeDataIdResolver(['Foo'])}
          svg={CLASS_DBL_SVG}
          onEditing={(e) => snapshots.push(e)}
          apiRef={api}
        />,
      )
    })
    const container = host.firstElementChild as HTMLDivElement

    act(() => {
      container.querySelectorAll('text')[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    })
    expect(snapshots.at(-1)).toMatchObject({ target: { kind: 'class', name: 'Foo' } })

    act(() => api.current!.commit('订单'))
    expect(useEditorStore.getState().source).toContain('class 订单')
    expect(snapshots.at(-1)).toBeNull()
  })

  it('class：双击成员正文 → 不进入内联编辑（行为可预测性）', () => {
    resetEditorHistory(CLASS_DBL_SAMPLE)
    act(() => {
      root.render(
        <DblHarness
          projection={CLASS_DBL_PROJECTION}
          resolver={nodeDataIdResolver(['Foo'])}
          svg={CLASS_DBL_SVG}
          onEditing={(e) => snapshots.push(e)}
          apiRef={api}
        />,
      )
    })
    const container = host.firstElementChild as HTMLDivElement

    act(() => {
      container.querySelectorAll('text')[1].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    })
    expect(snapshots.at(-1)).toBeNull()
  })

  it('sequence：双击参与者 → {kind:sequence-alias}，提交落 set-participant（actorId 不变）', () => {
    resetEditorHistory(SEQ_DBL_SAMPLE)
    act(() => {
      root.render(
        <DblHarness
          projection={SEQ_DBL_PROJECTION}
          resolver={nodeDataIdResolver(['甲', '乙'])}
          svg={SEQ_DBL_SVG}
          onEditing={(e) => snapshots.push(e)}
          apiRef={api}
        />,
      )
    })
    const container = host.firstElementChild as HTMLDivElement

    act(() => {
      container.querySelector('[data-id="甲"] text')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    })
    expect(snapshots.at(-1)).toMatchObject({ target: { kind: 'sequence-alias', actorId: '甲' } })

    act(() => api.current!.commit('用户'))
    const source = useEditorStore.getState().source
    expect(source).toContain('participant 甲 as 用户') // actorId 仍是 甲，只加别名
    expect(source).toContain('甲->>乙: hi') // 消息端点不错位
  })

  it('sequence：双击消息 → 不进入内联编辑（消息文本走点选 → 右侧表单）', () => {
    resetEditorHistory(SEQ_DBL_SAMPLE)
    act(() => {
      root.render(
        <DblHarness
          projection={SEQ_DBL_PROJECTION}
          resolver={nodeDataIdResolver(['甲', '乙'])}
          svg={SEQ_DBL_SVG}
          onEditing={(e) => snapshots.push(e)}
          apiRef={api}
        />,
      )
    })
    const container = host.firstElementChild as HTMLDivElement

    act(() => {
      container.querySelector('line[data-id="message:1"]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    })
    expect(snapshots.at(-1)).toBeNull()
  })
})

// ---------- more-diagrams 工单 11：gantt 双击任务条/任务文本改任务名 ----------

const GANTT_DBL_SAMPLE = `gantt
    dateFormat YYYY-MM-DD
    section 调研
    需求梳理 :done, a1, 2026-01-05, 3d
    方案设计 :after a1, 5d
`
// 模拟 mermaid 渲染产物：任务条 rect / 任务文本 text 的 DOM id 带 svgId 前缀
// （`<svgId>-<taskId>` / `<svgId>-<taskId>-text`，ganttDiagram 渲染函数 1616–1617 /
// 1688–1689 行口径），data-id 由渲染后处理 annotateNodeDataIds 反注
const GANTT_DBL_SVG =
  '<svg id="g-1"><rect id="g-1-a1"/><text id="g-1-a1-text">需求梳理</text>' +
  '<rect id="g-1-task1"/><text id="g-1-task1-text">方案设计</text></svg>'

const GANTT_DBL_PROJECTION = (() => {
  const parsed = ganttParser.parse(GANTT_DBL_SAMPLE)
  if (!parsed.ok) throw new Error(`样例源码必须可解析：${parsed.error.message}`)
  return { type: 'gantt' as const, gantt: buildGanttProjection(parsed.doc) }
})()

describe('useCanvasInlineEdit（more-diagrams 工单 11：gantt 双击改任务名）', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let snapshots: unknown[]
  let api: { current: InlineEditApi | null }

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    snapshots = []
    api = { current: null }
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
    useEditorStore.getState().select(null)
  })

  function mount() {
    resetEditorHistory(GANTT_DBL_SAMPLE)
    act(() => {
      root.render(
        <DblHarness
          projection={GANTT_DBL_PROJECTION}
          resolver={ganttDataIdResolver(GANTT_DBL_PROJECTION.gantt)}
          svg={GANTT_DBL_SVG}
          onEditing={(e) => snapshots.push(e)}
          apiRef={api}
        />,
      )
    })
    return host.firstElementChild as HTMLDivElement
  }

  it('双击任务条（反注 data-id 后）→ {kind:gantt-task}，提交落 set-task-name（verbatim 保留元数据）', () => {
    const container = mount()
    annotateNodeDataIds(container) // 渲染后处理：DOM id `<svgId>-<taskId>` → data-id 反注
    act(() => {
      container.querySelector('rect#g-1-a1')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    })
    expect(snapshots.at(-1)).toMatchObject({
      target: { kind: 'gantt-task', elementId: 'task:1', taskId: 'a1' },
    })
    act(() => api.current!.commit('需求评审'))
    expect(useEditorStore.getState().source).toContain('需求评审 :done, a1, 2026-01-05, 3d')
    expect(snapshots.at(-1)).toBeNull()
  })

  it('双击任务文本同样命中（-text 后缀剥离后同一 data-id）；非法任务名（含冒号）不落码', () => {
    const container = mount()
    annotateNodeDataIds(container)
    act(() => {
      container.querySelector('text#g-1-task1-text')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    })
    expect(snapshots.at(-1)).toMatchObject({
      target: { kind: 'gantt-task', elementId: 'task:2', taskId: 'task1' },
    })
    act(() => api.current!.commit('方案:设计')) // 冒号终止 taskTxt 词法，任务名非法
    expect(useEditorStore.getState().source).toContain('方案设计 :after a1, 5d')
    expect(snapshots.at(-1)).toBeNull()
  })
})

// ---------- gui-test-2026-10-03 工单 01：sequence 参与者 inline 编辑框定位 ----------

/**
 * 缺陷形态（2026-10-03 实测）：mermaid 序列图渲染器给**两个**元素写 `data-id = actorId`
 * ——贯穿全程的生命线 `line.actor-line`（data-et="life-line"，宽 0.5px，文档序在前）与
 * 参与者框 `g.actor`（data-et="participant"）。findTargetElement 取首个命中即生命线，
 * 浮层退化成叠在生命线上的细长竖条、文字被裁剪。
 * 修复：sequence 目标优先取非生命线命中。本组用例以 mermaid 真实 DOM 形态 +
 * jsdom getBoundingClientRect 桩覆盖定位逻辑（不依赖真实浏览器）。
 */

const SEQ_BOX_SAMPLE = `sequenceDiagram
    participant 甲
    participant 乙
    甲->>乙: hi
`

/** mermaid v12 sequenceDiagram 真实形态：生命线 line（data-et=life-line）在前，
 * 参与者框 g（data-et=participant）在后，二者 data-id 同为 actorId */
const SEQ_BOX_SVG = `<svg><g class="root">
  <g><line id="actor0" class="actor-line 200" data-et="life-line" data-id="甲" /><g data-et="participant" data-id="甲"><rect class="actor" /><text class="actor">甲</text></g></g>
  <g><line id="actor1" class="actor-line 200" data-et="life-line" data-id="乙" /><g data-et="participant" data-id="乙"><rect class="actor" /><text class="actor">乙</text></g></g>
</g></svg>`

/** 负向回落形态：参与者框缺失（老结构 / 反注异常），只剩生命线可寻址 */
const SEQ_LIFELINE_ONLY_SVG = `<svg><g class="root">
  <line id="actor0" class="actor-line 200" data-et="life-line" data-id="甲" />
</g></svg>`

const SEQ_BOX_PROJECTION = (() => {
  const parsed = sequenceParser.parse(SEQ_BOX_SAMPLE)
  if (!parsed.ok) throw new Error(`样例源码必须可解析：${parsed.error.message}`)
  return { type: 'sequence' as const, sequence: buildSequenceProjection(parsed.doc) }
})()

interface RectLike {
  left: number
  top: number
  width: number
  height: number
}

describe('useCanvasInlineEdit（gui-test-2026-10-03 工单 01：sequence 参与者编辑框定位）', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let snapshots: unknown[]
  let api: { current: InlineEditApi | null }
  let rects: Map<Element, RectLike>

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    snapshots = []
    api = { current: null }
    rects = new Map()
    // jsdom 不做布局：按元素桩定几何（生命线 0.5px 宽、参与者框 80×40）
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const r = rects.get(this)
      const zero = { left: 0, top: 0, width: 0, height: 0 }
      return { ...zero, ...(r ?? zero) } as DOMRect
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    act(() => root.unmount())
    host.remove()
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
    useEditorStore.getState().select(null)
  })

  /** 画布容器 800×600 @ (0,0)；生命线 0.5×2000 @ (100,50)；参与者框 80×40 @ (60,10) */
  function mount(svg: string) {
    resetEditorHistory(SEQ_BOX_SAMPLE)
    act(() => {
      root.render(
        <DblHarness
          projection={SEQ_BOX_PROJECTION}
          resolver={nodeDataIdResolver(['甲', '乙'])}
          svg={svg}
          onEditing={(e) => snapshots.push(e)}
          apiRef={api}
        />,
      )
    })
    const container = host.firstElementChild as HTMLDivElement
    rects.set(container, { left: 0, top: 0, width: 800, height: 600 })
    for (const line of container.querySelectorAll('line.actor-line')) {
      rects.set(line, { left: 100, top: 50, width: 0.5, height: 2000 })
    }
    for (const box of container.querySelectorAll('g[data-et="participant"]')) {
      rects.set(box, { left: 60, top: 10, width: 80, height: 40 })
    }
    return container
  }

  it('新建命名（kind:sequence）：定位到参与者框（80×40），不是生命线的细长竖条', () => {
    const container = mount(SEQ_BOX_SVG)
    act(() => {
      api.current!.beginEdit({ kind: 'sequence', actorId: '甲' })
    })
    expect(snapshots.at(-1)).toMatchObject({ target: { kind: 'sequence', actorId: '甲' } })
    const editing = snapshots.at(-1) as { rect: RectLike | null }
    expect(editing.rect).toEqual({ left: 60, top: 10, width: 80, height: 40 })
    // 负向对照锚点：生命线矩形与此完全不同——断言有效
    expect(editing.rect).not.toEqual({ left: 100, top: 50, width: 0.5, height: 2000 })
    expect(container.querySelector('g[data-et="participant"][data-id="甲"]')).not.toBeNull()
  })

  it('双击参与者框文字（kind:sequence-alias）：同样定位到参与者框，提交落 set-participant', () => {
    mount(SEQ_BOX_SVG)
    const box = host.querySelector('g[data-et="participant"][data-id="甲"]')!
    act(() => {
      box.querySelector('text')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    })
    expect(snapshots.at(-1)).toMatchObject({ target: { kind: 'sequence-alias', actorId: '甲' } })
    const editing = snapshots.at(-1) as { rect: RectLike | null }
    expect(editing.rect).toEqual({ left: 60, top: 10, width: 80, height: 40 })
    act(() => api.current!.commit('用户'))
    expect(useEditorStore.getState().source).toContain('participant 甲 as 用户')
  })

  it('回落：只有生命线可寻址时仍能定位（rect 非空，输入框不至于 display:none）', () => {
    mount(SEQ_LIFELINE_ONLY_SVG)
    act(() => {
      api.current!.beginEdit({ kind: 'sequence', actorId: '甲' })
    })
    const editing = snapshots.at(-1) as { rect: RectLike | null }
    expect(editing.rect).toEqual({ left: 100, top: 50, width: 0.5, height: 2000 })
  })

  it('新建命名提交（rename-participant）：源码声明与消息引用同步改写', () => {
    mount(SEQ_BOX_SVG)
    act(() => {
      api.current!.beginEdit({ kind: 'sequence', actorId: '甲' })
    })
    act(() => {
      api.current!.commit('客户')
    })
    const source = useEditorStore.getState().source
    expect(source).toContain('participant 客户')
    expect(source).toContain('客户->>乙: hi') // 消息端点一并改名，源码不破
    expect(source).not.toContain('participant 甲')
    expect(snapshots.at(-1)).toBeNull()
  })
})
