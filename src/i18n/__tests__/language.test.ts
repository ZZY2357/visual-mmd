import { describe, expect, it } from 'vitest'
import {
  LANGUAGE_STORAGE_KEY,
  loadSavedLanguage,
  persistLanguage,
  resolveInitialLanguage,
} from '../language'

/**
 * 工单 01（i18n-english）：语言偏好解析。
 * - 已保存偏好优先；无效值视同未保存
 * - 无偏好时跟随浏览器：zh 开头 → 中文，否则英文
 */

function fakeStorage(): Storage & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size
    },
  }
}

describe('resolveInitialLanguage', () => {
  it('已保存偏好优先于浏览器语言', () => {
    expect(resolveInitialLanguage('en', 'zh-CN')).toBe('en')
    expect(resolveInitialLanguage('zh', 'en-US')).toBe('zh')
  })

  it('无偏好时跟随浏览器：zh 前缀 → 中文', () => {
    expect(resolveInitialLanguage(null, 'zh-CN')).toBe('zh')
    expect(resolveInitialLanguage(null, 'zh')).toBe('zh')
  })

  it('无偏好时跟随浏览器：非 zh 前缀 → 英文', () => {
    expect(resolveInitialLanguage(null, 'en-US')).toBe('en')
    expect(resolveInitialLanguage(null, 'ja-JP')).toBe('en')
    expect(resolveInitialLanguage(null, '')).toBe('en')
  })

  it('已保存值非法时视同未保存，回落到浏览器语言', () => {
    expect(resolveInitialLanguage('fr', 'zh-TW')).toBe('zh')
    expect(resolveInitialLanguage('fr', 'en-US')).toBe('en')
  })
})

describe('语言偏好持久化', () => {
  it('persist 后 load 原样读回', () => {
    const storage = fakeStorage()
    persistLanguage('en', storage)
    expect(loadSavedLanguage(storage)).toBe('en')
    expect(storage.map.get(LANGUAGE_STORAGE_KEY)).toBe('en')
  })

  it('未保存时 load 返回 null', () => {
    expect(loadSavedLanguage(fakeStorage())).toBeNull()
  })

  it('存储值损坏时 load 返回 null（不抛错）', () => {
    const storage = fakeStorage()
    storage.map.set(LANGUAGE_STORAGE_KEY, 'not-a-json-value')
    expect(loadSavedLanguage(storage)).toBeNull()
  })
})
