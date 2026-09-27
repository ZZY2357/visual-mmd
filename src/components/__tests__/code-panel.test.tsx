import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { MantineProvider } from '@mantine/core'
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
