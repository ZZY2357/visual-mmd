import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MantineProvider } from '@mantine/core'
import { EditorView } from '@codemirror/view'
import { CodePanel } from '../CodePanel'
import { resetEditorHistory, useEditorStore } from '../../store/editor'
import { DEFAULT_DIAGRAM_SOURCE } from '../../lib/storage'
import { spanOfSelection } from '../../lib/follow/source-index'
import { followGuard } from '../../lib/follow/follow-guard'
import { useCursorHintStore } from '../../lib/follow/hint-store'

/**
 * 代码面板的光标↔元素跟随（工单 16）：
 * - 选中元素 → 源码区间短暂高亮（.cm-followHighlight），到点清除；
 * - 光标停在源码某行 → 写画布提示（hint store），程序化事务不触发（防反馈循环）；
 * - 无 span（不可寻址 kind）→ 静默降级，不产生装饰。
 */

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

async function renderCodePanel(): Promise<{ host: HTMLDivElement; view: EditorView; root: Root }> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      <MantineProvider>
        <CodePanel error={null} />
      </MantineProvider>,
    )
  })
  const cmHost = host.querySelector('[aria-label]') as HTMLElement
  const view = EditorView.findFromDOM(cmHost.querySelector('.cm-editor') as HTMLElement) as EditorView
  expect(view).not.toBeNull()
  return { host, view, root }
}

describe('CodePanel 跟随（工单 16）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.localStorage?.clear()
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
    useEditorStore.getState().select(null)
    useCursorHintStore.getState().setHint(null)
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('选中节点 → 源码区间短暂高亮，到点自动清除', async () => {
    const { host, view, root } = await renderCodePanel()
    await act(async () => {
      useEditorStore.getState().select({ kind: 'node', nodeId: 'A' })
    })
    expect(host.querySelectorAll('.cm-followHighlight').length).toBeGreaterThan(0)

    await act(async () => {
      vi.advanceTimersByTime(1300)
    })
    expect(host.querySelectorAll('.cm-followHighlight').length).toBe(0)
    await act(async () => root.unmount())
    void view
  })

  it('选中不可寻址 kind（diagram）→ 无 span，静默降级不高亮', async () => {
    const { host, root } = await renderCodePanel()
    await act(async () => {
      useEditorStore.getState().select({ kind: 'diagram' })
    })
    expect(host.querySelectorAll('.cm-followHighlight').length).toBe(0)
    await act(async () => root.unmount())
  })

  it('光标停在源码元素区间 → 防抖后写入画布提示（不改选中）', async () => {
    const { view, root } = await renderCodePanel()
    const span = spanOfSelection(DEFAULT_DIAGRAM_SOURCE, { kind: 'node', nodeId: 'A' })
    expect(span).not.toBeNull()
    await act(async () => {
      view.dispatch({ selection: { anchor: span!.start } })
    })
    await act(async () => {
      vi.advanceTimersByTime(250)
    })
    expect(useCursorHintStore.getState().hint).toEqual({ kind: 'node', nodeId: 'A' })
    // 选中语义不受影响
    expect(useEditorStore.getState().selection).toBeNull()
    await act(async () => root.unmount())
  })

  it('程序化事务（跟随滚动）不触发画布提示（防反馈循环）', async () => {
    const { view, root } = await renderCodePanel()
    const span = spanOfSelection(DEFAULT_DIAGRAM_SOURCE, { kind: 'node', nodeId: 'A' })
    await act(async () => {
      followGuard.runProgrammatic(() => {
        view.dispatch({ selection: { anchor: span!.start } })
      })
    })
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    expect(useCursorHintStore.getState().hint).toBeNull()
    await act(async () => root.unmount())
  })

  it('光标落在元素区间之外（文档末尾）→ 提示清空', async () => {
    const { view, root } = await renderCodePanel()
    await act(async () => {
      view.dispatch({ selection: { anchor: view.state.doc.length } })
    })
    await act(async () => {
      vi.advanceTimersByTime(250)
    })
    expect(useCursorHintStore.getState().hint).toBeNull()
    await act(async () => root.unmount())
  })

  it('双向无反馈循环：选中 → 程序化滚动移动光标，防抖窗口后仍不产生画布提示', async () => {
    const { host, view, root } = await renderCodePanel()
    // 选中节点 D（源码在文档末尾附近）→ 触发程序化 scrollIntoView 移动光标
    await act(async () => {
      useEditorStore.getState().select({ kind: 'node', nodeId: 'D' })
    })
    // 高亮已出（选中→源码方向生效）
    expect(host.querySelectorAll('.cm-followHighlight').length).toBeGreaterThan(0)
    // 等待超过光标提示防抖窗口：程序化光标移动不得反向触发画布提示
    await act(async () => {
      vi.advanceTimersByTime(400)
    })
    expect(useCursorHintStore.getState().hint).toBeNull()
    // 选中语义保持
    expect(useEditorStore.getState().selection).toEqual({ kind: 'node', nodeId: 'D' })
    void view
    await act(async () => root.unmount())
  })

  it('真选中到来时清掉光标提示（真高亮接管，提示不滞留）', async () => {
    const { view, root } = await renderCodePanel()
    const span = spanOfSelection(DEFAULT_DIAGRAM_SOURCE, { kind: 'node', nodeId: 'A' })!
    // 先有光标提示
    await act(async () => {
      view.dispatch({ selection: { anchor: span.start } })
    })
    await act(async () => {
      vi.advanceTimersByTime(250)
    })
    expect(useCursorHintStore.getState().hint).toEqual({ kind: 'node', nodeId: 'A' })
    // 画布选中到来 → 提示清空
    await act(async () => {
      useEditorStore.getState().select({ kind: 'node', nodeId: 'B' })
    })
    expect(useCursorHintStore.getState().hint).toBeNull()
    await act(async () => root.unmount())
  })
})
