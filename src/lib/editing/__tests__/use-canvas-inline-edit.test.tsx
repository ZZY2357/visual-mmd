import { act, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetEditorHistory, useEditorStore } from '../../../store/editor'
import { DEFAULT_DIAGRAM_SOURCE } from '../../../lib/storage'
import { flowchartParser } from '../../pipeline/flowchart'
import { buildFlowchartProjection } from '../../projection/flowchart-projection'
import { nodeDataIdResolver } from '../../canvas-selection/data-id'
import { useCanvasInlineEdit } from '../use-canvas-inline-edit'

/**
 * 工单 05 内联编辑 Hook：双击进入编辑 → 回车提交落码 / Esc 取消；
 * 新建节点经 beginEdit 直接进入（工单 04 的 onNodeCreated 占位接线）。
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
  commit: (text: string) => void
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
    <div ref={ref} onDoubleClick={onDoubleClick}>
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
})
