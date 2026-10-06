import { describe, expect, it, beforeEach } from 'vitest'
import { STORAGE_KEY, DEFAULT_DIAGRAM_SOURCE } from '../storage'
import {
  LIBRARY_STORAGE_KEY,
  bootstrapLibrary,
  createDiagramId,
  isStorageAvailable,
  loadLibrary,
  removeLegacyDiagram,
  saveLibrary,
  type StoredLibrary,
} from '../library-storage'
import { LIBRARY_SCHEMA_VERSION } from '../library-migrations'
import { SAMPLE_DIAGRAMS } from '../sample-library'

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

/** 写入必抛异常的存储：模拟 quota 满 / 隐私模式下 setItem 失败 */
class QuotaExceededStorage extends MemoryStorage {
  override setItem(): void {
    throw new DOMException('QuotaExceededError', 'QuotaExceededError')
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

describe('schema 版本与迁移（工单 07）', () => {
  let storage: MemoryStorage
  beforeEach(() => {
    storage = new MemoryStorage()
  })

  it('saveLibrary 落盘记录带当前 schema 版本', () => {
    saveLibrary(sampleLibrary(), storage)
    const raw = JSON.parse(storage.getItem(LIBRARY_STORAGE_KEY)!) as { version?: number }
    expect(raw.version).toBe(LIBRARY_SCHEMA_VERSION)
  })

  it('旧版 v1 记录（无 version 字段）被迁移而非丢弃', () => {
    const v1 = { diagrams: sampleLibrary().diagrams, activeId: 'd2' }
    storage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(v1))
    const loaded = loadLibrary(storage)
    expect(loaded).not.toBeNull()
    expect(loaded?.diagrams).toHaveLength(2)
    expect(loaded?.activeId).toBe('d2')
  })

  it('未来版本记录返回 null（降级运行不误读）', () => {
    storage.setItem(
      LIBRARY_STORAGE_KEY,
      JSON.stringify({ version: LIBRARY_SCHEMA_VERSION + 1, diagrams: sampleLibrary().diagrams, activeId: 'd1' }),
    )
    expect(loadLibrary(storage)).toBeNull()
  })
})

describe('存储失败降级（工单 07）', () => {
  it('setItem 抛异常时 saveLibrary 返回 quota 失败而非抛出', () => {
    const storage = new QuotaExceededStorage()
    const result = saveLibrary(sampleLibrary(), storage)
    expect(result).toEqual({ ok: false, reason: 'quota' })
  })

  it('存储不可用（null）时 saveLibrary 返回 unavailable，loadLibrary 返回 null', () => {
    expect(saveLibrary(sampleLibrary(), null)).toEqual({ ok: false, reason: 'unavailable' })
    expect(loadLibrary(null)).toBeNull()
  })

  it('正常存储时 saveLibrary 返回 ok', () => {
    expect(saveLibrary(sampleLibrary(), new MemoryStorage())).toEqual({ ok: true })
  })

  it('isStorageAvailable：可写为 true；null 或 setItem 抛异常为 false', () => {
    expect(isStorageAvailable(new MemoryStorage())).toBe(true)
    expect(isStorageAvailable(null)).toBe(false)
    expect(isStorageAvailable(new QuotaExceededStorage())).toBe(false)
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

  it('两者皆无（真·首次启动）时预置示例图表库（工单 17）', () => {
    const lib = bootstrapLibrary(storage)
    expect(lib.diagrams).toHaveLength(SAMPLE_DIAGRAMS.length)
    expect(lib.diagrams.map((d) => d.id)).toEqual(SAMPLE_DIAGRAMS.map((s) => s.id))
    expect(lib.activeId).toBe(SAMPLE_DIAGRAMS[0]?.id ?? null)
  })

  it('用户删空图表库后不再重新播种（删除示例不复活）', () => {
    // 存储里存在图表库 key（哪怕空数组）即视为「已有数据」，原样返回
    saveLibrary({ diagrams: [], activeId: null }, storage)
    expect(bootstrapLibrary(storage)).toEqual({ diagrams: [], activeId: null })
  })
})
