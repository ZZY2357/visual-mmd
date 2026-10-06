import { describe, expect, it } from 'vitest'
import {
  LIBRARY_MIGRATIONS,
  LIBRARY_SCHEMA_VERSION,
  detectSchemaVersion,
  migrateLibraryRecord,
} from '../library-migrations'

/**
 * schema 版本与迁移链（工单 07）：
 * - v1 = 无 `version` 字段的旧形态；v2 = 当前显式版本
 * - 旧记录沿相邻迁移链升级；未来版本 / 迁移步缺失时返回 null（按无存档处理）
 */

describe('detectSchemaVersion', () => {
  it('无 version 字段视为 v1（旧形态）', () => {
    expect(detectSchemaVersion({ diagrams: [], activeId: null })).toBe(1)
  })

  it('合法正整数 version 原样返回', () => {
    expect(detectSchemaVersion({ version: 2 })).toBe(2)
    expect(detectSchemaVersion({ version: 7 })).toBe(7)
  })

  it('非法 version（非整数 / 负数 / 字符串 / null）回退为 v1', () => {
    expect(detectSchemaVersion({ version: 1.5 })).toBe(1)
    expect(detectSchemaVersion({ version: 0 })).toBe(1)
    expect(detectSchemaVersion({ version: -3 })).toBe(1)
    expect(detectSchemaVersion({ version: '2' })).toBe(1)
    expect(detectSchemaVersion({ version: null })).toBe(1)
  })
})

describe('migrateLibraryRecord（相邻版本迁移）', () => {
  it('当前版本（v2）原样返回', () => {
    const record = { version: 2, diagrams: [], activeId: null }
    expect(migrateLibraryRecord(record)).toEqual(record)
  })

  it('v1（无 version 字段）→ v2：补上 version，其余字段逐字保留', () => {
    const v1 = { diagrams: [{ id: 'a', name: 'n', source: 's', savedAt: 1 }], activeId: 'a' }
    const migrated = migrateLibraryRecord(v1)
    expect(migrated).not.toBeNull()
    expect(migrated?.version).toBe(LIBRARY_SCHEMA_VERSION)
    expect(migrated?.diagrams).toEqual(v1.diagrams)
    expect(migrated?.activeId).toBe('a')
    // 不改入参（纯函数）
    expect((v1 as { version?: number }).version).toBeUndefined()
  })

  it('v1 显式标注 version: 1 也走同一条迁移', () => {
    const migrated = migrateLibraryRecord({ version: 1, diagrams: [], activeId: null })
    expect(migrated?.version).toBe(2)
  })

  it('未来版本（降级运行）返回 null，不误改数据', () => {
    expect(migrateLibraryRecord({ version: LIBRARY_SCHEMA_VERSION + 1 })).toBeNull()
  })

  it('迁移步缺失返回 null', () => {
    // 临时删掉 v1→v2 一步，模拟「链断裂」
    const saved = LIBRARY_MIGRATIONS[1]
    delete (LIBRARY_MIGRATIONS as Record<number, unknown>)[1]
    try {
      expect(migrateLibraryRecord({ diagrams: [], activeId: null })).toBeNull()
    } finally {
      ;(LIBRARY_MIGRATIONS as Record<number, unknown>)[1] = saved
    }
  })
})
