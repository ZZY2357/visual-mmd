import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  STORAGE_KEY,
  DEFAULT_DIAGRAM_SOURCE,
  loadDiagram,
  saveDiagram,
  type StoredDiagram,
} from '../storage'

class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  clear() {
    this.map.clear()
  }
  getItem(key: string) {
    return this.map.get(key) ?? null
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null
  }
  removeItem(key: string) {
    this.map.delete(key)
  }
  setItem(key: string, value: string) {
    this.map.set(key, value)
  }
}

describe('loadDiagram / saveDiagram（localStorage 存取接缝）', () => {
  let storage: MemoryStorage
  beforeEach(() => {
    storage = new MemoryStorage()
  })

  it('空存储返回 null', () => {
    expect(loadDiagram(storage)).toBeNull()
  })

  it('saveDiagram 后 loadDiagram 能还原源码', () => {
    saveDiagram('flowchart TD\n    A --> B\n', storage)
    const loaded = loadDiagram(storage)
    expect(loaded).not.toBeNull()
    expect(loaded?.source).toBe('flowchart TD\n    A --> B\n')
    expect(loaded?.savedAt).toBeGreaterThan(0)
  })

  it('损坏的 JSON 返回 null 而不抛出', () => {
    storage.setItem(STORAGE_KEY, '{not json')
    expect(loadDiagram(storage)).toBeNull()
  })

  it('结构不对（source 缺失）返回 null', () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ savedAt: 1 }))
    expect(loadDiagram(storage)).toBeNull()
  })

  it('savedAt 缺失时容忍为 0', () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ source: 'graph TD' }))
    const loaded: StoredDiagram | null = loadDiagram(storage)
    expect(loaded?.savedAt).toBe(0)
  })

  it('默认模板是合法的 flowchart 起步源码（含 flowchart 声明）', () => {
    expect(DEFAULT_DIAGRAM_SOURCE.trim().startsWith('flowchart')).toBe(true)
  })

  it('默认使用全局 localStorage（冒烟：不抛出）', () => {
    expect(() => loadDiagram()).not.toThrow()
  })
})

describe('防抖合并（自动保存共用接缝）', () => {
  it('等待期内多次调用只执行一次，且带最后一组参数', async () => {
    vi.useFakeTimers()
    const { debounce } = await import('../debounce')
    const fn = vi.fn()
    const debounced = debounce(fn, 100)
    debounced('a')
    debounced('b')
    debounced('c')
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(99)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('c')
    vi.useRealTimers()
  })

  it('cancel 取消未决调用', async () => {
    vi.useFakeTimers()
    const { debounce } = await import('../debounce')
    const fn = vi.fn()
    const debounced = debounce(fn, 100)
    debounced('a')
    debounced.cancel()
    vi.advanceTimersByTime(500)
    expect(fn).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('flush 立即执行未决调用并只执行一次', async () => {
    vi.useFakeTimers()
    const { debounce } = await import('../debounce')
    const fn = vi.fn()
    const debounced = debounce(fn, 1000)
    debounced('x')
    debounced.flush()
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('x')
    debounced.flush()
    expect(fn).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
