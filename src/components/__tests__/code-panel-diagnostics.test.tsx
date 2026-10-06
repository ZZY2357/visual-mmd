import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MantineProvider } from '@mantine/core'
import { EditorView } from '@codemirror/view'
import { CodePanel } from '../CodePanel'
import { resetEditorHistory, useEditorStore } from '../../store/editor'
import { DEFAULT_DIAGRAM_SOURCE } from '../../lib/storage'
import type { SourceParseError } from '../../lib/mermaid-error'

/**
 * 代码面板行内诊断（工单 14）：
 * - 错误行有可见标记（.cm-errorLine）且带 hover 文案（title）；
 * - 行号来自 mermaid 错误消息（error.line，已在 extractParseError 解析），不重复解析；
 * - 无行号 / 行号越界 → 不标任何行（退化为全局提示），绝不误标。
 */

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

async function renderCodePanel(error: SourceParseError | null): Promise<{ host: HTMLDivElement; root: Root; view: EditorView }> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      <MantineProvider>
        <CodePanel error={error} />
      </MantineProvider>,
    )
  })
  const cmHost = host.querySelector('[aria-label]') as HTMLElement
  const view = EditorView.findFromDOM(cmHost.querySelector('.cm-editor') as HTMLElement) as EditorView
  expect(view).not.toBeNull()
  return { host, root, view }
}

describe('CodePanel 行内诊断（工单 14）', () => {
  beforeEach(() => {
    window.localStorage?.clear()
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
    useEditorStore.getState().select(null)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('错误行有可见标记，且 title 携带错误信息（hover 可见）', async () => {
    const { host, root } = await renderCodePanel({ line: 2, message: 'Parse error on line 2: bad' })
    const marked = host.querySelectorAll('.cm-errorLine')
    expect(marked.length).toBe(1)
    const el = marked[0] as HTMLElement
    expect(el.getAttribute('data-error-line')).toBe('2')
    expect(el.getAttribute('title')).toBe('Parse error on line 2: bad')
    await act(async () => root.unmount())
  })

  it('无行号（line = null）→ 不标任何行，退化为全局提示', async () => {
    const { host, root } = await renderCodePanel({ line: null, message: 'something went wrong' })
    expect(host.querySelectorAll('.cm-errorLine').length).toBe(0)
    await act(async () => root.unmount())
  })

  it('行号越界（源码已缩短）→ 不误标，退化为全局提示', async () => {
    const { host, root } = await renderCodePanel({ line: 999, message: 'Parse error on line 999' })
    expect(host.querySelectorAll('.cm-errorLine').length).toBe(0)
    await act(async () => root.unmount())
  })

  it('错误清除后标记消失', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const render = (error: SourceParseError | null) =>
      act(async () => {
        root.render(
          <MantineProvider>
            <CodePanel error={error} />
          </MantineProvider>,
        )
      })
    await render({ line: 2, message: 'bad' })
    expect(host.querySelectorAll('.cm-errorLine').length).toBe(1)
    await render(null)
    expect(host.querySelectorAll('.cm-errorLine').length).toBe(0)
    await act(async () => root.unmount())
  })

  it('行号在范围内时标记落在正确行上', async () => {
    const { host, root, view } = await renderCodePanel({ line: 3, message: 'Parse error on line 3' })
    const el = host.querySelector('.cm-errorLine') as HTMLElement
    expect(el).not.toBeNull()
    // 标记行的 from 偏移应对应第 3 行行首
    const expectedFrom = view.state.doc.line(3).from
    const markedPos = view.posAtDOM(el)
    expect(markedPos).toBe(expectedFrom)
    await act(async () => root.unmount())
  })
})
