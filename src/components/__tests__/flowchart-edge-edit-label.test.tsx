import { act, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetEditorHistory, useEditorStore } from '../../store/editor'
import { DEFAULT_DIAGRAM_SOURCE } from '../../lib/storage'
import { initI18n, zhDict } from '../../i18n'
import { flowchartParser } from '../../lib/pipeline/flowchart'
import { buildFlowchartProjection } from '../../lib/projection/flowchart-projection'
import { flowchartDataIdResolver } from '../../lib/canvas-selection/flowchart-adapter'
import type { AnyProjection } from '../../lib/diagram-registry'
import { useCanvasContextMenu } from '../../lib/editing/use-canvas-context-menu'
import { PropertyPanel } from '../PropertyPanel'

/**
 * flowchart 连线菜单的编辑类菜单项（工单 06）：
 * 右键连线 → 点「在属性面板中编辑」→ 菜单关闭、选中停在该连线、右侧渲染出 `EdgeForm`。
 *
 * 这是工单 05 定案 D5 的连带项：class 关系 / sequence 消息的同类菜单项已统一为
 * 「选中该连线 + 关闭菜单」语义，flowchart 的 `beginEditLabel` 原先仍是只有
 * `closeMenu()` 的空壳，菜单项还挂着一句暗示「点了就能改」的旧文案（实际只关菜单）。
 * 本文件锁住两端：菜单项真的选中该连线，且右侧属性面板确实接住它（文案不是谎言）。
 */

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
initI18n()

const SAMPLE = `flowchart TD
    A[开始] -->|第一步| B[处理]
    C[结束]
`

/** 与 mermaid v12 flowchart 输出同构：节点 `<g data-id>`、连线 `<path data-id="L_A_B_0">` */
const SVG_STUB =
  '<svg><g data-id="A">开始</g><g data-id="B">处理</g><g data-id="C">结束</g><path data-id="L_A_B_0"></path></svg>'

function projectionOf(source: string): Extract<AnyProjection, { type: 'flowchart' }> {
  const parsed = flowchartParser.parse(source)
  if (!parsed.ok) throw new Error(`样例源码必须可解析：${parsed.error.message}`)
  return { type: 'flowchart', flowchart: buildFlowchartProjection(parsed.doc) }
}

interface Api {
  beginEditLabel: () => void
}

function Harness(props: {
  projection: Extract<AnyProjection, { type: 'flowchart' }>
  onState: (menuOpen: boolean) => void
  apiRef: { current: Api | null }
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const ctx = useCanvasContextMenu({
    projection: props.projection,
    resolver: flowchartDataIdResolver(props.projection.flowchart),
    containerRef: ref,
  })
  // 工单 01：菜单动作经 ctx.onMenuItem 查 MENU_ACTIONS 表分发
  props.apiRef.current = { beginEditLabel: () => ctx.onMenuItem('edit-label') }
  useEffect(() => {
    props.onState(ctx.menu !== null)
  })
  return (
    <div ref={ref} tabIndex={0} onContextMenu={ctx.onContextMenu}>
      <div dangerouslySetInnerHTML={{ __html: SVG_STUB }} />
      <MantineProvider>
        <PropertyPanel projection={props.projection} parseError={null} />
      </MantineProvider>
    </div>
  )
}

describe('flowchart 连线菜单「在属性面板中编辑」（工单 06）', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let menuOpen: boolean[]
  let api: { current: Api | null }

  beforeEach(() => {
    resetEditorHistory(SAMPLE)
    useEditorStore.getState().select(null)
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    menuOpen = []
    api = { current: null }
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
    useEditorStore.getState().select(null)
  })

  function mount(): HTMLElement {
    act(() => {
      root.render(
        <Harness
          projection={projectionOf(SAMPLE)}
          onState={(open) => menuOpen.push(open)}
          apiRef={api}
        />,
      )
    })
    return host.firstElementChild as HTMLElement
  }

  function contextMenuOn(container: Element, selector: string): void {
    act(() => {
      container.querySelector(selector)!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    })
  }

  it('文案与 class / sequence 两条完全一致', () => {
    // 验收口径：源码里不再有暗示「点了就能改」的旧文案。这里用字典直接锁住，防止文案回退
    expect(zhDict.app.canvas.menu['edit-label']).toBe('在属性面板中编辑')
    expect(zhDict.app.canvas.menu['edit-relation']).toBe('在属性面板中编辑')
    expect(zhDict.app.canvas.menu['edit-message']).toBe('在属性面板中编辑')
  })

  it('右键连线 → 点「在属性面板中编辑」：菜单关闭、选中停在该连线、右侧出现 EdgeForm', () => {
    const container = mount()

    contextMenuOn(container, 'path[data-id="L_A_B_0"]')
    expect(menuOpen.at(-1)).toBe(true)
    expect(useEditorStore.getState().selection).toEqual({ kind: 'edge', from: 'A', to: 'B', occurrence: 1 })

    // 菜单项的语义 = 选中该连线 + 关闭菜单（D5）；先把选中清掉，验证是菜单项自己选中的
    act(() => useEditorStore.getState().select(null))
    act(() => api.current!.beginEditLabel())

    expect(menuOpen.at(-1)).toBe(false)
    expect(useEditorStore.getState().selection).toEqual({ kind: 'edge', from: 'A', to: 'B', occurrence: 1 })
    // 右侧属性面板拿到的是这条连线：EdgeForm 的起终点行与标签字段都在
    const text = container.textContent ?? ''
    expect(text).toContain(zhDict.app.propertyPanel.edgeFrom)
    expect(text).toContain(zhDict.app.propertyPanel.edgeTo)
    expect(text).toContain(zhDict.app.propertyPanel.edgeLabelField)
    // 顺带确认标签不是谎言：表单里回显的正是这条连线的现有标签
    const labelInput = Array.from(container.querySelectorAll('input')).find(
      (i) => i.getAttribute('placeholder') === zhDict.app.propertyPanel.edgeLabelPlaceholder,
    )
    expect(labelInput).toBeDefined()
    expect((labelInput as HTMLInputElement).value).toBe('第一步')
  })
})
