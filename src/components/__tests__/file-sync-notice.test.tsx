import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MantineProvider } from '@mantine/core'
import { initI18n } from '../../i18n'
import { useEditorStore } from '../../store/editor'
import { useFileBindingStore } from '../../lib/file-binding'
import type { FsaFileHandle } from '../../lib/file-system-access'
import { FileSyncNotice } from '../FileSyncNotice'

/**
 * 本地文件绑定提示（self-grill-hardening 工单 18）：
 * - 未绑定不渲染
 * - ready：显示已连接文件名与 dirty 状态
 * - needs-permission / denied / error：显示重新连接 / 重试按钮
 * - 解除绑定按钮触发 onUnbind
 */

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
initI18n()

const handle: FsaFileHandle = {
  kind: 'file',
  name: 'diagram.mmd',
  getFile: () => Promise.resolve(new File([''], 'diagram.mmd')),
  createWritable: () => Promise.reject(new Error('unused')),
}

function click(host: HTMLElement, label: string): void {
  const button = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(label))
  if (button === undefined) throw new Error(`应有按钮：${label}`)
  button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
}

describe('FileSyncNotice', () => {
  let host: HTMLDivElement
  let root: Root
  const onReconnect = vi.fn()
  const onUnbind = vi.fn()

  beforeEach(() => {
    onReconnect.mockClear()
    onUnbind.mockClear()
    useFileBindingStore.setState({ status: 'none', fileName: null, handle: null, lastSavedSource: null })
    useEditorStore.setState({ source: '' })
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  async function render() {
    await act(async () => {
      root.render(
        <MantineProvider>
          <FileSyncNotice onReconnect={onReconnect} onUnbind={onUnbind} />
        </MantineProvider>,
      )
    })
  }

  it('未绑定不渲染', async () => {
    await render()
    expect(host.querySelector('[data-file-sync]')).toBeNull()
  })

  it('ready 且源码与磁盘一致 → clean 提示', async () => {
    useFileBindingStore.setState({ status: 'ready', fileName: 'diagram.mmd', handle, lastSavedSource: 'a\n' })
    useEditorStore.setState({ source: 'a\n' })
    await render()
    expect(host.querySelector('[data-file-sync="ready"]')).not.toBeNull()
    expect(host.textContent).toContain('diagram.mmd')
    expect(host.textContent).toContain('磁盘文件已是最新')
    expect(host.querySelector('[data-file-dirty="true"]')).toBeNull()
  })

  it('ready 且有未保存改动 → dirty 提示', async () => {
    useFileBindingStore.setState({ status: 'ready', fileName: 'diagram.mmd', handle, lastSavedSource: 'a\n' })
    useEditorStore.setState({ source: 'b\n' })
    await render()
    expect(host.querySelector('[data-file-dirty="true"]')).not.toBeNull()
    expect(host.textContent).toContain('有未保存的改动')
  })

  it('needs-permission → 重新连接按钮触发 onReconnect', async () => {
    useFileBindingStore.setState({ status: 'needs-permission', fileName: 'diagram.mmd', handle })
    await render()
    expect(host.querySelector('[data-file-sync="needs-permission"]')).not.toBeNull()
    expect(host.textContent).toContain('需要重新授权')
    await act(async () => click(host, '重新连接'))
    expect(onReconnect).toHaveBeenCalledTimes(1)
  })

  it('denied → 重试按钮', async () => {
    useFileBindingStore.setState({ status: 'denied', fileName: 'diagram.mmd', handle })
    await render()
    expect(host.querySelector('[data-file-sync="denied"]')).not.toBeNull()
    expect(host.textContent).toContain('没有访问文件')
    await act(async () => click(host, '重试'))
    expect(onReconnect).toHaveBeenCalledTimes(1)
  })

  it('解除绑定按钮触发 onUnbind', async () => {
    useFileBindingStore.setState({ status: 'ready', fileName: 'diagram.mmd', handle, lastSavedSource: 'a\n' })
    useEditorStore.setState({ source: 'a\n' })
    await render()
    await act(async () => click(host, '解除绑定'))
    expect(onUnbind).toHaveBeenCalledTimes(1)
  })
})
