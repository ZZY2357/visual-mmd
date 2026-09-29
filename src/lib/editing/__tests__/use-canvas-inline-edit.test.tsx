import { act, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetEditorHistory, useEditorStore } from '../../../store/editor'
import { DEFAULT_DIAGRAM_SOURCE } from '../../../lib/storage'
import { flowchartParser } from '../../pipeline/flowchart'
import { classParser } from '../../pipeline/class'
import { sequenceParser } from '../../pipeline/sequence'
import { buildFlowchartProjection } from '../../projection/flowchart-projection'
import { buildClassProjection } from '../../projection/class-projection'
import { buildSequenceProjection } from '../../projection/sequence-projection'
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
  const { editing, onDoubleClick, commit, beginEdit } = useCanvasInlineEdit({
    projection: props.projection,
    resolver: props.resolver,
    svg: props.svg,
    containerRef: ref,
    view: null,
  })
  props.apiRef.current = { commit, cancel: () => {}, beginEdit }
  useEffect(() => {
    props.onEditing(editing)
  }, [editing, props.onEditing])
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
