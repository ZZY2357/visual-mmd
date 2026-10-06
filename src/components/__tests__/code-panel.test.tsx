import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { MantineProvider } from '@mantine/core'
import { EditorView } from '@codemirror/view'
import { CodePanel } from '../CodePanel'
import { resetEditorHistory, useEditorStore } from '../../store/editor'
import { DEFAULT_DIAGRAM_SOURCE } from '../../lib/storage'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

describe('CodePanel 源码同步（工单 08）', () => {
  it('renders and syncs external change without crash', async () => {
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
    const host = document.createElement('div')
    document.body.appendChild(host)
    await act(async () => {
      createRoot(host).render(
        <MantineProvider>
          <CodePanel error={null} />
        </MantineProvider>,
      )
    })
    expect(host.querySelector('.cm-content')).toBeTruthy()
    // 模拟画布落码：store 源码外部变更 → CM 应回写
    await act(async () => {
      useEditorStore.setState({ source: DEFAULT_DIAGRAM_SOURCE + '    X --> Y\n' })
    })
    expect(host.querySelector('.cm-content')?.textContent).toContain('X --> Y')
    // 连续第二次外部变更也要回写（旧实现会被回声标记吞掉）
    await act(async () => {
      useEditorStore.setState({ source: DEFAULT_DIAGRAM_SOURCE + '    X --> Y\n    Y --> Z\n' })
    })
    expect(host.querySelector('.cm-content')?.textContent).toContain('Y --> Z')
  })
})

/** 工单 09：代码面板驱动 hasUnfinishedInput —— 打字置位、失焦清位（工单 11 接缝变真） */
describe('CodePanel 未完成输入探测（工单 09）', () => {
  it('打字置位 hasUnfinishedInput，失焦清位', async () => {
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
    useEditorStore.setState({ hasUnfinishedInput: false, pendingWriteback: null })
    const host = document.createElement('div')
    document.body.appendChild(host)
    await act(async () => {
      createRoot(host).render(
        <MantineProvider>
          <CodePanel error={null} />
        </MantineProvider>,
      )
    })
    const cmHost = host.querySelector('[aria-label]') as HTMLElement
    const view = EditorView.findFromDOM(cmHost.querySelector('.cm-editor') as HTMLElement)
    expect(view).not.toBeNull()
    expect(useEditorStore.getState().hasUnfinishedInput).toBe(false)

    // 真实键入路径：CM 事务 → updateListener → commitTypedSource → 置位
    await act(async () => {
      ;(view as EditorView).dispatch({ changes: { from: 0, insert: '%% hi\n' } })
    })
    expect(useEditorStore.getState().hasUnfinishedInput).toBe(true)

    // 失焦 = 输入会话结束 → 清位（挂起的写回仍留待用户选择）
    await act(async () => {
      cmHost.querySelector('.cm-content')?.dispatchEvent(new FocusEvent('blur', { bubbles: true }))
    })
    expect(useEditorStore.getState().hasUnfinishedInput).toBe(false)
  })
})
