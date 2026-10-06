import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MantineProvider } from '@mantine/core'
import { initI18n } from '../../i18n'
import { ThreePaneLayout } from '../ThreePaneLayout'

/**
 * 折叠互斥的禁用态与提示（gui-test-2026-10-03 工单 03）：
 * 另一面板已折叠时，本面板折叠按钮呈 disabled 态，aria-label/tooltip
 * 改述互斥原因（app:layout.collapseDisabled）；单面板折叠/展开行为不回归。
 */

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
initI18n()

const COLLAPSE_DISABLED_TEXT = '另一面板已折叠，至多同时折叠一个面板'

function buttons(host: HTMLElement) {
  const icons = Array.from(host.querySelectorAll('button'))
  const findByAria = (needle: string) => {
    const b = icons.find((el) => (el.getAttribute('aria-label') ?? '').includes(needle))
    if (!b) throw new Error(`找不到 aria-label 含「${needle}」的折叠按钮`)
    return b
  }
  // 代码按钮：aria 含「代码面板」或互斥提示（属性面板同理）；互斥提示时靠位置区分
  const code =
    icons.find((el) => (el.getAttribute('aria-label') ?? '').includes('代码面板')) ??
    findByAria(COLLAPSE_DISABLED_TEXT)
  const props =
    icons.find((el) => (el.getAttribute('aria-label') ?? '').includes('属性面板')) ??
    findByAria(COLLAPSE_DISABLED_TEXT)
  if (code === props) throw new Error('两个折叠按钮必须可以区分（aria-label 不应同时命中）')
  return { code, props }
}

describe('ThreePaneLayout 折叠互斥禁用态（工单 03）', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(async () => {
    window.localStorage?.clear()
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
          <ThreePaneLayout code={<div>code</div>} canvas={<div>canvas</div>} properties={<div>props</div>} />
        </MantineProvider>,
      )
    })
  }

  it('初始状态：两个折叠按钮均可点，点击各自面板折叠', async () => {
    await render()
    let { code, props } = buttons(host)
    expect(code.disabled).toBe(false)
    expect(props.disabled).toBe(false)

    await act(async () => {
      code.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    ;({ code, props } = buttons(host))
    // 代码面板已折叠：代码按钮变展开（»），属性按钮不受影响
    expect(code.textContent).toBe('»')
    expect(props.textContent).toBe('»')
    expect(code.disabled).toBe(false)

    await act(async () => {
      code.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    ;({ code } = buttons(host))
    expect(code.textContent).toBe('«')
  })

  it('属性面板已折叠时，代码面板折叠按钮 disabled 且 aria 说明互斥原因', async () => {
    await render()
    const { props } = buttons(host)
    await act(async () => {
      props.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    const { code } = buttons(host)
    expect(code.disabled).toBe(true)
    expect(code.getAttribute('aria-label')).toBe(COLLAPSE_DISABLED_TEXT)
    // 展开按钮自身不受禁用影响
    const { props: propsExpand } = buttons(host)
    expect(propsExpand.disabled).toBe(false)
    expect(propsExpand.getAttribute('aria-label')).toBe('展开属性面板')
  })

  it('代码面板已折叠时，属性面板折叠按钮 disabled 且 aria 说明互斥原因', async () => {
    await render()
    const { code } = buttons(host)
    await act(async () => {
      code.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    const { props } = buttons(host)
    expect(props.disabled).toBe(true)
    expect(props.getAttribute('aria-label')).toBe(COLLAPSE_DISABLED_TEXT)
  })

  it('禁用态下点击不改变任何折叠状态', async () => {
    await render()
    const { props } = buttons(host)
    await act(async () => {
      props.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    let { code } = buttons(host)
    expect(code.disabled).toBe(true)
    await act(async () => {
      code.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    // 代码面板仍展开（« 仍在，代码面板节点仍渲染）
    ;({ code } = buttons(host))
    expect(code.textContent).toBe('«')
    expect(host.textContent).toContain('code')
  })

  it('互斥解除：展开属性面板后，代码面板折叠按钮恢复可点', async () => {
    await render()
    const { props } = buttons(host)
    await act(async () => {
      props.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    let { code } = buttons(host)
    expect(code.disabled).toBe(true)
    // 属性按钮此时是展开（»）
    await act(async () => {
      const { props: p } = buttons(host)
      p.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    ;({ code } = buttons(host))
    expect(code.disabled).toBe(false)
    expect(code.getAttribute('aria-label')).toBe('折叠代码面板')
  })
})
