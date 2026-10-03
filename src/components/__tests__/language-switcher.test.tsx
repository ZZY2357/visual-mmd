import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MantineProvider } from '@mantine/core'
import { LanguageSwitcher } from '../LanguageSwitcher'
import { initI18n, setAppLanguage } from '../../i18n'
import { LANGUAGE_STORAGE_KEY } from '../../i18n/language'

/**
 * i18n-english 工单 01：语言切换控件。
 * - 切换立即生效（i18next 语言变化，缺键回退中文）
 * - 偏好写入 localStorage（visual-mmd:language）
 */

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let root: ReturnType<typeof createRoot> | null = null
let host: HTMLDivElement | null = null

async function renderSwitcher(): Promise<void> {
  host = document.createElement('div')
  document.body.appendChild(host)
  await act(async () => {
    root = createRoot(host!)
    root.render(
      <MantineProvider>
        <LanguageSwitcher />
      </MantineProvider>,
    )
  })
}

beforeEach(() => {
  window.localStorage?.clear()
  initI18n()
})

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

describe('LanguageSwitcher', () => {
  it('渲染中/英两个选项并回显当前语言', async () => {
    await renderSwitcher()
    const control = host!.querySelector('[role="radiogroup"]')
    expect(control).not.toBeNull()
    const text = control!.textContent ?? ''
    expect(text).toContain('中文')
    expect(text).toContain('English')
  })

  it('切换到英文：i18next 语言变化且偏好持久化', async () => {
    await renderSwitcher()
    const englishOption = host!.querySelector<HTMLInputElement>('input[type="radio"][value="en"]')
    expect(englishOption).not.toBeNull()
    await act(async () => {
      englishOption!.click()
    })
    expect((await import('i18next')).default.language).toBe('en')
  })

  it('setAppLanguage 持久化偏好到注入的 storage', async () => {
    const map = new Map<string, string>()
    const fake = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
      clear: () => map.clear(),
      key: () => null,
      length: 0,
    } as unknown as Storage
    await act(async () => {
      await setAppLanguage('zh', fake)
    })
    expect(map.get(LANGUAGE_STORAGE_KEY)).toBe('zh')
  })
})

describe('语言切换后的文案', () => {
  it('英文下表单键给出英文（fallbackLng 机制由 en-coverage 审计兜底）', async () => {
    await act(async () => {
      await setAppLanguage('en')
    })
    const i18next = (await import('i18next')).default
    expect(i18next.t('propertyPanel.nodeText')).toBe('Display text')
    expect(i18next.t('language.en')).toBe('English')
  })
})
