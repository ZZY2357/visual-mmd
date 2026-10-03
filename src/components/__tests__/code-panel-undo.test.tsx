import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { MantineProvider } from '@mantine/core'
import { EditorView } from '@codemirror/view'
import { CodePanel } from '../CodePanel'
import { resetEditorHistory, useEditorStore } from '../../store/editor'
import { DEFAULT_DIAGRAM_SOURCE } from '../../lib/storage'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

async function renderCodePanel(): Promise<{ host: HTMLDivElement; view: EditorView }> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  let view: EditorView | null = null
  await act(async () => {
    createRoot(host).render(
      <MantineProvider>
        <CodePanel error={null} />
      </MantineProvider>,
    )
  })
  const cmHost = host.querySelector('[aria-label]') as HTMLElement
  view = EditorView.findFromDOM(cmHost.querySelector('.cm-editor') as HTMLElement)
  expect(view).not.toBeNull()
  return { host, view: view as EditorView }
}

function keydown(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

/** gui-test-2026-10-03 工单 04：焦点在代码面板时的 Ctrl/Cmd+Z 撤销 */
describe('CodePanel 键盘撤销（工单 04）', () => {
  it('焦点在编辑器内时 Ctrl+Z 走应用快照栈撤销（非 CodeMirror 内建 history，无双轨）', async () => {
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
    const { host, view } = await renderCodePanel()

    // 真实键入路径：CM 事务 → updateListener → commitTypedSource
    await act(async () => {
      view.dispatch({ changes: { from: view.state.doc.length, insert: '    X --> Y\n' } })
    })
    expect(useEditorStore.getState().source).toContain('X --> Y')
    expect(useEditorStore.getState().canUndo).toBe(true)

    const content = host.querySelector('.cm-content') as HTMLElement
    content.focus()
    const event = keydown(content, { key: 'z', code: 'KeyZ', ctrlKey: true })
    await act(async () => {})

    // 撤销生效：文档与 store 同步回退
    expect(useEditorStore.getState().source).not.toContain('X --> Y')
    expect(content.textContent).not.toContain('X --> Y')
    // 关键判别：走应用栈（弹掉唯一快照、进 redo 队列），
    // 若被 CM 内建 history 接管，回退会被 updateListener 再次 commit（canUndo 仍 true / canRedo false 双轨特征）
    expect(event.defaultPrevented).toBe(true)
    expect(useEditorStore.getState().canUndo).toBe(false)
    expect(useEditorStore.getState().canRedo).toBe(true)
  })

  it('Shift+Ctrl+Z 与 Ctrl+Y 重做走应用快照栈', async () => {
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
    const { host, view } = await renderCodePanel()
    await act(async () => {
      view.dispatch({ changes: { from: view.state.doc.length, insert: '    X --> Y\n' } })
    })
    const content = host.querySelector('.cm-content') as HTMLElement
    content.focus()
    await act(async () => {
      keydown(content, { key: 'z', code: 'KeyZ', ctrlKey: true })
    })
    expect(useEditorStore.getState().source).not.toContain('X --> Y')

    // 真实浏览器 Shift+Ctrl+Z：key='Z'（大写）+ keyCode 90，CM 经 base 表回退匹配 'Shift-Ctrl-z'；
    // happy-dom 不提供 keyCode，手动补上以走真实浏览器同一匹配分支
    const redoEvent = new KeyboardEvent('keydown', { key: 'Z', code: 'KeyZ', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })
    Object.defineProperty(redoEvent, 'keyCode', { value: 90 })
    await act(async () => {
      content.dispatchEvent(redoEvent)
    })
    expect(useEditorStore.getState().source).toContain('X --> Y')
    expect(useEditorStore.getState().canRedo).toBe(false)

    await act(async () => {
      keydown(content, { key: 'z', code: 'KeyZ', ctrlKey: true })
    })
    await act(async () => {
      keydown(content, { key: 'y', code: 'KeyY', ctrlKey: true })
    })
    expect(useEditorStore.getState().source).toContain('X --> Y')
  })

  it('点击面板空白区（文档下方）后 Ctrl+Z 依然可撤销（工单 04 实测的失效场景）', async () => {
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
    const { host, view } = await renderCodePanel()
    await act(async () => {
      view.dispatch({ changes: { from: view.state.doc.length, insert: '    X --> Y\n' } })
    })

    // 修复后（fillPanelTheme + 宿主 onMouseDown 兜底）：点击编辑器之外的宿主表面，
    // 焦点也会交给 contentDOM（工单 04 实测的「点了面板但焦点没进编辑器」失效场景）
    const cmHost = host.querySelector('[aria-label]') as HTMLElement
    const content = host.querySelector('.cm-content') as HTMLElement
    await act(async () => {
      cmHost.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    })
    expect(document.activeElement).toBe(content)

    const event = keydown(content, { key: 'z', code: 'KeyZ', ctrlKey: true })
    await act(async () => {})
    expect(event.defaultPrevented).toBe(true)
    expect(useEditorStore.getState().source).not.toContain('X --> Y')
  })
})
