import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MantineProvider } from '@mantine/core'
import { initI18n } from '../../i18n'
import { useEditorStore } from '../../store/editor'
import { LIBRARY_STORAGE_KEY } from '../../lib/library-storage'
import { CrossTabNotice } from '../CrossTabNotice'

/**
 * 跨标签页修改提示（工单 11）：组件 + storage 事件路径。
 * `storage` 事件不在写入方自身触发，故测试直接派发模拟 StorageEvent。
 */

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
initI18n()

const ACTIVE = 'd1'
const ORIGINAL = 'flowchart TD\n  A --> B\n'
const REMOTE = 'flowchart TD\n  A --> C\n'

function libraryValue(source: string): string {
  return JSON.stringify({
    version: 2,
    activeId: ACTIVE,
    diagrams: [{ id: ACTIVE, name: '图', source, savedAt: 7 }],
  })
}

function fireStorage(newValue: string): void {
  window.dispatchEvent(new StorageEvent('storage', { key: LIBRARY_STORAGE_KEY, newValue }))
}

describe('CrossTabNotice', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    useEditorStore.setState({
      diagrams: [{ id: ACTIVE, name: '图', source: ORIGINAL, savedAt: 1 }],
      activeId: ACTIVE,
      source: ORIGINAL,
      crossTabChange: null,
      hasUnfinishedInput: false,
    })
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    useEditorStore.setState({ crossTabChange: null })
  })

  async function render(props: { autoLoad?: boolean; unfinished?: boolean } = {}) {
    await act(async () => {
      root.render(
        <MantineProvider>
          <CrossTabNotice
            options={props.autoLoad === true ? { autoLoadWhenIdle: true } : undefined}
            hasUnfinishedInput={props.unfinished === undefined ? undefined : () => props.unfinished === true}
          />
        </MantineProvider>,
      )
    })
  }

  it('初始不渲染提示', async () => {
    await render()
    expect(host.querySelector('[data-cross-tab-notice]')).toBeNull()
  })

  it('他页改动当前图表 → 显示提示', async () => {
    await render()
    await act(async () => fireStorage(libraryValue(REMOTE)))
    const notice = host.querySelector('[data-cross-tab-notice="changed"]')
    expect(notice).not.toBeNull()
    expect(host.textContent).toContain('另一个标签页修改了当前图表')
    // 未载入：源码保持本页不变
    expect(useEditorStore.getState().source).toBe(ORIGINAL)
  })

  it('「载入最新」→ 源码替换为他页版本并清除提示', async () => {
    await render()
    await act(async () => fireStorage(libraryValue(REMOTE)))

    const loadButton = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('载入最新'),
    )
    if (loadButton === undefined) throw new Error('应有「载入最新」按钮')
    await act(async () => {
      loadButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })

    expect(useEditorStore.getState().source).toBe(REMOTE)
    expect(useEditorStore.getState().crossTabChange).toBeNull()
    expect(host.querySelector('[data-cross-tab-notice]')).toBeNull()
  })

  it('关闭提示不载入：源码保持本页版本', async () => {
    await render()
    await act(async () => fireStorage(libraryValue(REMOTE)))

    const dismissButton = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('忽略'),
    )
    if (dismissButton === undefined) throw new Error('应有「忽略」按钮')
    await act(async () => {
      dismissButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })

    expect(useEditorStore.getState().source).toBe(ORIGINAL)
    expect(useEditorStore.getState().crossTabChange).toBeNull()
  })

  it('他页改的是别的图 → 不弹提示', async () => {
    await render()
    const other = JSON.stringify({
      version: 2,
      activeId: ACTIVE,
      diagrams: [{ id: 'other', name: 'x', source: 'z', savedAt: 1 }],
    })
    await act(async () => fireStorage(other))
    expect(host.querySelector('[data-cross-tab-notice]')).toBeNull()
  })

  it('有未完成输入时，即便开启自动载入也弹提示、不覆盖本页（工单 09 语义）', async () => {
    await render({ autoLoad: true, unfinished: true })
    await act(async () => fireStorage(libraryValue(REMOTE)))
    expect(host.querySelector('[data-cross-tab-notice]')).not.toBeNull()
    expect(useEditorStore.getState().source).toBe(ORIGINAL)
  })

  it('无未完成输入且开启自动载入 → 自动载入并弹提示（无待处理）', async () => {
    await render({ autoLoad: true, unfinished: false })
    await act(async () => fireStorage(libraryValue(REMOTE)))
    expect(useEditorStore.getState().source).toBe(REMOTE)
    expect(host.querySelector('[data-cross-tab-notice]')).toBeNull()
  })
})
