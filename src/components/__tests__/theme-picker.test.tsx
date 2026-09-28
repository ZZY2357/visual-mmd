import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MantineProvider } from '@mantine/core'
import { ThemePicker } from '../ThemePicker'
import { resetEditorHistory, useEditorStore } from '../../store/editor'
import { DEFAULT_DIAGRAM_SOURCE } from '../../lib/storage'
import { MERMAID_THEMES, readTheme } from '../../lib/pipeline/frontmatter'
import { initI18n } from '../../i18n'

/**
 * 工单 01：选择器选项清单与回显。
 * - 置顶「跟随 Mermaid 默认（不设置主题）」+ 11 个主题 = 12 项
 * - 如实回显源码里的原始主题值；非法值回显原文 + 提示
 */

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const FOLLOW_LABEL = '跟随 Mermaid 默认（不设置主题）'
const INVALID_HINT = '无效主题，已按 Mermaid 默认渲染'

let root: ReturnType<typeof createRoot> | null = null

async function renderPicker(source: string): Promise<HTMLInputElement> {
  resetEditorHistory(source)
  const host = document.createElement('div')
  document.body.appendChild(host)
  await act(async () => {
    root = createRoot(host)
    root.render(
      <MantineProvider>
        <ThemePicker disabled={false} />
      </MantineProvider>,
    )
  })
  const input = host.querySelector('input')
  if (input === null) throw new Error('未找到主题选择器输入框')
  return input
}

/** 打开下拉并返回选项文本（Mantine 把选项渲染到 body 的 portal 里） */
async function openOptions(input: HTMLInputElement): Promise<string[]> {
  await act(async () => {
    input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  })
  // Mantine Combobox 打开后还有一批异步状态更新，再刷一轮避免 act 警告
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  return [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent ?? '')
}

describe('ThemePicker（工单 01）', () => {
  beforeEach(() => {
    initI18n()
    window.localStorage?.clear()
  })

  afterEach(async () => {
    await act(async () => {
      root?.unmount()
    })
    root = null
    document.body.innerHTML = ''
  })

  it('无 frontmatter：回显「跟随」，下拉含 12 项（跟随 + 11 主题）', async () => {
    const input = await renderPicker(DEFAULT_DIAGRAM_SOURCE)
    expect(input.value).toBe(FOLLOW_LABEL)

    const options = await openOptions(input)
    expect(options).toHaveLength(1 + MERMAID_THEMES.length)
    expect(options).toHaveLength(12)
    expect(options[0]).toBe(FOLLOW_LABEL)
    expect(options.slice(1)).toContain('Redux 彩色（redux-color）')
    expect(options.slice(1)).toContain('新派（neo）')
    // default 与「跟随」文案必须可区分
    expect(options[1]).toBe('经典（default）')
  })

  it('手写合法主题值：回显其选项原文（不再显示「默认」）', async () => {
    const input = await renderPicker(
      '---\nconfig:\n  theme: redux-color\n---\nflowchart TD\n    A --> B\n',
    )
    expect(input.value).toBe('Redux 彩色（redux-color）')
    expect(input.value).not.toBe(FOLLOW_LABEL)
  })

  it('手写非法主题值：回显原文 + 无效提示，并作为额外选项出现', async () => {
    const input = await renderPicker('---\nconfig:\n  theme: solarized\n---\nflowchart TD\n    A --> B\n')
    expect(input.value).toBe('solarized')
    expect(document.body.textContent).toContain(INVALID_HINT)

    const options = await openOptions(input)
    expect(options).toHaveLength(13)
    expect(options).toContain('solarized')
  })

  it('选「跟随」清除源码里的主题键', async () => {
    const input = await renderPicker(
      '---\nconfig:\n  theme: redux-color\n  fontFamily: monospace\n---\nflowchart TD\n    A --> B\n',
    )
    await openOptions(input)
    const followOption = [...document.querySelectorAll('[role="option"]')].find(
      (o) => o.textContent === FOLLOW_LABEL,
    )
    if (followOption === undefined) throw new Error('未找到「跟随」选项')
    await act(async () => {
      followOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      followOption.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const source = useEditorStore.getState().source
    expect(readTheme(source)).toBe(null)
    expect(source).toBe('---\nconfig:\n  fontFamily: monospace\n---\nflowchart TD\n    A --> B\n')
  })
})
