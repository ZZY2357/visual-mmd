import { act, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetEditorHistory, useEditorStore } from '../../../store/editor'
import { DEFAULT_DIAGRAM_SOURCE } from '../../../lib/storage'
import { flowchartParser } from '../../pipeline/flowchart'
import { buildFlowchartProjection } from '../../projection/flowchart-projection'
import { nodeDataIdResolver } from '../../canvas-selection/data-id'
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
  beginEdit: (target: { kind: 'flowchart'; nodeId: string }) => void
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
