import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MantineProvider } from '@mantine/core'
import { initI18n } from '../../i18n'
import { ThreePaneLayout } from '../ThreePaneLayout'

/**
 * 手机单栏 + 切换器（工单 15）：视口 <= 768 时三栏折叠为单栏，
 * SegmentedControl 切换 代码 | 画布 | 属性，各面板逐一可达；
 * 视口 > 768 时切换器不出现（桌面/平板行为不回归）。
 */

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
initI18n()

function setViewport(width: number) {
  window.innerWidth = width
  window.dispatchEvent(new Event('resize'))
}

describe('ThreePaneLayout 手机单栏（工单 15）', () => {
  let host: HTMLDivElement
  let root: Root
  const originalWidth = window.innerWidth

  beforeEach(() => {
    window.localStorage?.clear()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    setViewport(originalWidth)
  })

  async function renderAt(width: number) {
    await act(async () => {
      setViewport(width)
    })
    await act(async () => {
      root.render(
        <MantineProvider>
          <ThreePaneLayout code={<div>code-pane</div>} canvas={<div>canvas-pane</div>} properties={<div>props-pane</div>} />
        </MantineProvider>,
      )
    })
  }

  function switcherLabels(): string[] {
    return Array.from(host.querySelectorAll('label')).map((l) => l.textContent ?? '')
  }

  it('手机视口：出现切换器，默认只渲染画布', async () => {
    await renderAt(375)
    expect(switcherLabels()).toEqual(['代码', '画布', '属性'])
    expect(host.textContent).toContain('canvas-pane')
    expect(host.textContent).not.toContain('code-pane')
    expect(host.textContent).not.toContain('props-pane')
  })

  it('切换器可切到代码面板与属性面板', async () => {
    await renderAt(375)
    const labels = Array.from(host.querySelectorAll('label'))
    const codeLabel = labels.find((l) => l.textContent === '代码')
    const propsLabel = labels.find((l) => l.textContent === '属性')
    if (codeLabel === undefined || propsLabel === undefined) throw new Error('切换器必须有代码 / 属性两个分段')

    await act(async () => {
      codeLabel.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    expect(host.textContent).toContain('code-pane')
    expect(host.textContent).not.toContain('canvas-pane')

    await act(async () => {
      propsLabel.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    expect(host.textContent).toContain('props-pane')
    expect(host.textContent).not.toContain('code-pane')
  })

  it('断点边界：768 仍为单栏；769 回到「窄屏只显示画布」（无切换器）', async () => {
    await renderAt(768)
    expect(switcherLabels()).toEqual(['代码', '画布', '属性'])

    await renderAt(769)
    expect(switcherLabels()).toEqual([])
    // 769 仍低于窄屏断点（960）：只显示画布，无三栏
    expect(host.textContent).toContain('canvas-pane')
    expect(host.textContent).not.toContain('code-pane')
  })

  it('桌面视口（>= 960）：三栏同屏且无切换器', async () => {
    await renderAt(1024)
    expect(switcherLabels()).toEqual([])
    expect(host.textContent).toContain('code-pane')
    expect(host.textContent).toContain('canvas-pane')
    expect(host.textContent).toContain('props-pane')
  })
})
