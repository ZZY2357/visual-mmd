import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MantineProvider } from '@mantine/core'
import { initI18n } from '../../i18n'
import { useEditorStore } from '../../store/editor'
import { DEFAULT_DIAGRAM_SOURCE } from '../../lib/storage'
import { PendingWritebackNotice } from '../PendingWritebackNotice'

/**
 * 挂起的外部写回提示（self-grill-hardening 工单 09）。
 * 覆盖两条路径：打字中「表单编辑」与「画布编辑」都被挂起并显示提示，
 * 用户可接受（应用外部变更）或放弃（LWW 本页获胜）。
 */

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
initI18n()

const TYPED = DEFAULT_DIAGRAM_SOURCE + '    X --> Y\n'

function click(host: HTMLElement, label: string): void {
  const button = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(label))
  if (button === undefined) throw new Error(`应有按钮：${label}`)
  button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
}

describe('PendingWritebackNotice', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    window.localStorage?.clear()
    useEditorStore.setState({
      diagrams: [{ id: 'd1', name: '图', source: DEFAULT_DIAGRAM_SOURCE, savedAt: 1 }],
      activeId: 'd1',
      source: DEFAULT_DIAGRAM_SOURCE,
      pendingWriteback: null,
      hasUnfinishedInput: false,
    })
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    useEditorStore.setState({ pendingWriteback: null, hasUnfinishedInput: false })
  })

  async function render() {
    await act(async () => {
      root.render(
        <MantineProvider>
          <PendingWritebackNotice />
        </MantineProvider>,
      )
    })
  }

  it('无挂起写回时不渲染', async () => {
    await render()
    expect(host.querySelector('[data-pending-writeback]')).toBeNull()
  })

  it('打字中表单编辑被挂起 → 显示提示，源码未被覆盖', async () => {
    // 打字：进入未完成输入态
    useEditorStore.getState().commitTypedSource(TYPED)
    // 表单编辑：被挂起
    useEditorStore.getState().commitIntent({ type: 'set-direction', direction: 'LR' })
    await render()

    const notice = host.querySelector('[data-pending-writeback="form"]')
    expect(notice).not.toBeNull()
    expect(host.textContent).toContain('表单或画布的改动已暂停')
    expect(host.textContent).toContain('接受外部变更')
    expect(host.textContent).toContain('放弃外部变更')
    // 打字内容未被静默覆盖
    expect(useEditorStore.getState().source).toBe(TYPED)
  })

  it('打字中画布编辑被挂起 → 显示提示，源码未被覆盖', async () => {
    useEditorStore.getState().commitTypedSource(TYPED)
    useEditorStore.getState().commitIntents([{ type: 'set-direction', direction: 'LR' }], 'canvas')
    await render()

    const notice = host.querySelector('[data-pending-writeback="canvas"]')
    expect(notice).not.toBeNull()
    expect(useEditorStore.getState().source).toBe(TYPED)
  })

  it('「接受外部变更」→ 应用外部版本并清除提示', async () => {
    useEditorStore.getState().commitTypedSource(TYPED)
    useEditorStore.getState().commitIntent({ type: 'set-direction', direction: 'LR' })
    const external = useEditorStore.getState().pendingWriteback?.source ?? ''
    await render()

    await act(async () => click(host, '接受外部变更'))
    expect(useEditorStore.getState().source).toBe(external)
    expect(useEditorStore.getState().pendingWriteback).toBeNull()
    expect(host.querySelector('[data-pending-writeback]')).toBeNull()
  })

  it('「放弃外部变更」→ 丢弃外部版本，本页源码获胜（LWW）', async () => {
    useEditorStore.getState().commitTypedSource(TYPED)
    useEditorStore.getState().commitIntent({ type: 'set-direction', direction: 'LR' })
    await render()

    await act(async () => click(host, '放弃外部变更'))
    expect(useEditorStore.getState().source).toBe(TYPED)
    expect(useEditorStore.getState().pendingWriteback).toBeNull()
    expect(host.querySelector('[data-pending-writeback]')).toBeNull()
  })
})
