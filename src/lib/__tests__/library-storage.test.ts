import { describe, expect, it, beforeEach } from 'vitest'
import { STORAGE_KEY, DEFAULT_DIAGRAM_SOURCE } from '../storage'
import {
  LIBRARY_STORAGE_KEY,
  bootstrapLibrary,
  createDiagramId,
  loadLibrary,
  removeLegacyDiagram,
  saveLibrary,
  type StoredLibrary,
} from '../library-storage'

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

function sampleLibrary(): StoredLibrary {
  return {
    diagrams: [
      { id: 'd1', name: '流程图', source: 'flowchart TD\n    A --> B\n', savedAt: 100 },
      { id: 'd2', name: '时序图', source: 'sequenceDiagram\n    A->>B: hi\n', savedAt: 200 },
    ],
    activeId: 'd2',
  }
}

describe('createDiagramId', () => {
  it('生成的 id 非空且互不相同', () => {
    const a = createDiagramId()
    const b = createDiagramId()
    expect(a).not.toBe('')
    expect(a).not.toBe(b)
  })

  it('可注入随机源与时钟（确定性）', () => {
    expect(createDiagramId(() => 0.5, () => 1000)).toBe(createDiagramId(() => 0.5, () => 1000))
  })
})

describe('loadLibrary / saveLibrary（图表库存取接缝）', () => {
  let storage: MemoryStorage
  beforeEach(() => {
    storage = new MemoryStorage()
  })

  it('空存储返回 null', () => {
    expect(loadLibrary(storage)).toBeNull()
  })

  it('saveLibrary 后 loadLibrary 能完整还原多张图表与活跃 id', () => {
    const lib = sampleLibrary()
    saveLibrary(lib, storage)
    expect(loadLibrary(storage)).toEqual(lib)
  })

  it('损坏的 JSON 返回 null 而不抛出', () => {
    storage.setItem(LIBRARY_STORAGE_KEY, '{not json')
    expect(loadLibrary(storage)).toBeNull()
  })

  it('结构不对（diagrams 缺失 / 非数组 / 条目缺 source）返回 null', () => {
    storage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify({ activeId: 'd1' }))
    expect(loadLibrary(storage)).toBeNull()
    storage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify({ diagrams: 'no', activeId: null }))
    expect(loadLibrary(storage)).toBeNull()
    storage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify({ diagrams: [{ id: 'd1', name: 'x' }], activeId: 'd1' }))
    expect(loadLibrary(storage)).toBeNull()
  })

  it('activeId 指向不存在的图表时回退到第一张', () => {
    saveLibrary({ diagrams: sampleLibrary().diagrams, activeId: 'ghost' }, storage)
    expect(loadLibrary(storage)?.activeId).toBe('d1')
  })

  it('activeId 缺失但库非空时回退到第一张；空库时 activeId 为 null', () => {
    storage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify({ diagrams: sampleLibrary().diagrams }))
    expect(loadLibrary(storage)?.activeId).toBe('d1')
    saveLibrary({ diagrams: [], activeId: null }, storage)
    expect(loadLibrary(storage)).toEqual({ diagrams: [], activeId: null })
  })

  it('savedAt 缺失时容忍为 0', () => {
    storage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify({ diagrams: [{ id: 'd1', name: 'x', source: 'y' }] }))
    expect(loadLibrary(storage)?.diagrams[0]?.savedAt).toBe(0)
  })
})

describe('bootstrapLibrary（启动引导与旧版迁移）', () => {
  let storage: MemoryStorage
  beforeEach(() => {
    storage = new MemoryStorage()
  })

  it('已有图表库时原样返回', () => {
    const lib = sampleLibrary()
    saveLibrary(lib, storage)
    expect(bootstrapLibrary(storage)).toEqual(lib)
  })

  it('无图表库但有旧版单图存档时迁移为一张图表的库', () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ source: DEFAULT_DIAGRAM_SOURCE, savedAt: 42 }))
    const lib = bootstrapLibrary(storage)
    expect(lib.diagrams).toHaveLength(1)
    expect(lib.diagrams[0]?.source).toBe(DEFAULT_DIAGRAM_SOURCE)
    expect(lib.diagrams[0]?.name).toBe('未命名图表')
    removeLegacyDiagram(storage)
    expect(storage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('两者皆无时返回空库（由 store 决定起步图表）', () => {
    expect(bootstrapLibrary(storage)).toEqual({ diagrams: [], activeId: null })
  })
})
