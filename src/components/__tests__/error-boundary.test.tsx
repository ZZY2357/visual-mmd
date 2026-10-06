import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MantineProvider } from '@mantine/core'
import { initI18n } from '../../i18n'
import { ErrorBoundary } from '../ErrorBoundary'
import { ThreePaneLayout } from '../ThreePaneLayout'

/**
 * 面板级错误边界（工单 10）：
 * - 崩溃只降级所在面板（边界隔离），其余面板照常渲染；
 * - 「重新渲染」清错并重挂载子树（子组件不再抛错即恢复内容）；
 * - 「重置视图」只在画布面板出现，先调 onResetView 钩子再重挂载；
 * - 错误摘要（消息 + 堆栈）展示在可复制区。
 */

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
initI18n()

/** 可开关的抛错子组件：bomb = true 时渲染抛错，切回 false 后重挂载即恢复。
 * 错误消息不含 label，避免与面板内容断言（host.textContent）互相干扰。 */
function Bomb(props: { bomb: boolean; label: string }) {
  if (props.bomb) throw new Error('boom')
  return <div>{props.label}</div>
}

describe('ErrorBoundary 面板隔离与恢复（工单 10）', () => {
  let host: HTMLDivElement
  let root: Root
  const originalWidth = window.innerWidth
  // 错误边界会向 console.error 输出堆栈，测试里静音避免噪声
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    window.localStorage?.clear()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    window.innerWidth = originalWidth
    errorSpy.mockRestore()
  })

  async function render(node: React.ReactNode) {
    await act(async () => {
      root.render(<MantineProvider>{node}</MantineProvider>)
    })
  }

  it('边界隔离：画布抛错时，代码面板与属性面板仍照常渲染', async () => {
    window.innerWidth = 1024
    window.dispatchEvent(new Event('resize'))
    await render(
      <ThreePaneLayout
        code={
          <ErrorBoundary pane="code">
            <Bomb bomb={false} label="code-pane" />
          </ErrorBoundary>
        }
        canvas={
          <ErrorBoundary pane="canvas">
            <Bomb bomb label="canvas-pane" />
          </ErrorBoundary>
        }
        properties={
          <ErrorBoundary pane="properties">
            <Bomb bomb={false} label="props-pane" />
          </ErrorBoundary>
        }
      />,
    )

    // 崩溃面板显示错误态，不再渲染原内容
    expect(host.querySelector('[data-error-boundary="canvas"]')).not.toBeNull()
    expect(host.textContent).not.toContain('canvas-pane')
    // 其余面板不受影响
    expect(host.textContent).toContain('code-pane')
    expect(host.textContent).toContain('props-pane')
  })

  it('重新渲染：清错并重挂载子树，子组件恢复后显示内容', async () => {
    const tree = (bomb: boolean) => (
      <ErrorBoundary pane="canvas">
        <Bomb bomb={bomb} label="canvas-pane" />
      </ErrorBoundary>
    )
    await render(tree(true))
    expect(host.textContent).not.toContain('canvas-pane')
    expect(host.querySelector('[data-error-boundary="canvas"]')).not.toBeNull()

    // 修好子组件（对应真实场景：用户改源码 → App 重渲染 → 边界收到新的 children），
    // 此时边界仍停留在错误态；点「重新渲染」后重挂载，内容出现。
    await render(tree(false))
    expect(host.querySelector('[data-error-boundary="canvas"]')).not.toBeNull()
    const rerenderBtn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent === '重新渲染',
    )
    if (rerenderBtn === undefined) throw new Error('错误态必须有「重新渲染」按钮')
    await act(async () => {
      rerenderBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    expect(host.textContent).toContain('canvas-pane')
    expect(host.querySelector('[data-error-boundary="canvas"]')).toBeNull()
  })

  it('重置视图：只在画布面板出现，点击时调用 onResetView 钩子并恢复子树', async () => {
    const onResetView = vi.fn()
    const tree = (bomb: boolean) => (
      <ErrorBoundary pane="canvas" onResetView={onResetView}>
        <Bomb bomb={bomb} label="canvas-pane" />
      </ErrorBoundary>
    )
    await render(tree(true))
    await render(tree(false))
    const resetBtn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent === '重置视图',
    )
    if (resetBtn === undefined) throw new Error('画布错误态必须有「重置视图」按钮')

    await act(async () => {
      resetBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    expect(onResetView).toHaveBeenCalledTimes(1)
    expect(host.textContent).toContain('canvas-pane')
  })

  it('非画布面板不提供「重置视图」（无视图状态可重置）', async () => {
    await render(
      <ErrorBoundary pane="properties">
        <Bomb bomb label="props-pane" />
      </ErrorBoundary>,
    )
    expect(host.querySelector('[data-error-boundary="properties"]')).not.toBeNull()
    const labels = Array.from(host.querySelectorAll('button')).map((b) => b.textContent)
    expect(labels).toContain('重新渲染')
    expect(labels).not.toContain('重置视图')
  })

  it('错误摘要：可复制区含错误消息与堆栈，并提供复制按钮', async () => {
    await render(
      <ErrorBoundary pane="code">
        <Bomb bomb label="code-pane" />
      </ErrorBoundary>,
    )
    const summary = host.querySelector('[data-error-summary]')
    if (summary === null) throw new Error('错误态必须渲染摘要区')
    expect(summary.textContent).toContain('boom')
    expect(summary.textContent).toContain('代码面板')
    const copyBtn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent === '复制错误信息',
    )
    expect(copyBtn).not.toBeUndefined()
  })
})
