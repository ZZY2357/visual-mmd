import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MantineProvider } from '@mantine/core'
import { initI18n } from '../../i18n'
import { useEditorStore } from '../../store/editor'
import { StorageNotice } from '../StorageNotice'

/**
 * 存储降级提示（工单 07）：
 * - quota → 红色「保存失败」提示；dismiss 后消失
 * - unavailable → 黄色一次性提示；确认后消失
 * - 正常态不渲染任何东西
 */

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
initI18n()

describe('StorageNotice', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    window.localStorage?.clear()
    useEditorStore.setState({ storageIssue: null })
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    useEditorStore.setState({ storageIssue: null })
  })

  async function render() {
    await act(async () => {
      root.render(
        <MantineProvider>
          <StorageNotice />
        </MantineProvider>,
      )
    })
  }

  it('正常态不渲染提示', async () => {
    await render()
    expect(host.querySelector('[data-storage-notice]')).toBeNull()
  })

  it('quota → 显示「保存失败」，可关闭', async () => {
    useEditorStore.setState({ storageIssue: 'quota' })
    await render()
    const notice = host.querySelector('[data-storage-notice="quota"]')
    expect(notice).not.toBeNull()
    expect(host.textContent).toContain('保存失败')

    const button = host.querySelector('button')
    if (button === null) throw new Error('应有关闭按钮')
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    expect(useEditorStore.getState().storageIssue).toBeNull()
    expect(host.querySelector('[data-storage-notice]')).toBeNull()
  })

  it('unavailable → 显示存储不可用提示', async () => {
    useEditorStore.setState({ storageIssue: 'unavailable' })
    await render()
    const notice = host.querySelector('[data-storage-notice="unavailable"]')
    expect(notice).not.toBeNull()
    expect(host.textContent).toContain('无法访问浏览器存储')
  })
})
