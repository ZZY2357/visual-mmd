/**
 * 图表库存储记录的 schema 版本与迁移链（self-grill-hardening 工单 07）。
 *
 * 存储结构会随功能演进；没有版本号时，旧记录很容易被当成「无存档」丢弃 =
 * 静默吃掉用户已有图表。这里把版本写进记录，并在读取时沿迁移链把旧版本升级到当前版本。
 *
 * - v1：本模块引入前的形态——`{ diagrams, activeId }`，**没有** `version` 字段。
 *   现存的旧存档全部是 v1，必须迁移而非丢弃。
 * - v2：显式带 `version: 2` 的形态（当前版本）。
 *
 * 迁移链按「源版本 → 下一版本」逐级推进（相邻迁移）。新增结构变更时，把当前版本号 +1
 * 并在 LIBRARY_MIGRATIONS 里补一步即可，读取路径无需改动。
 */

/** 当前存储 schema 版本 */
export const LIBRARY_SCHEMA_VERSION = 2

/** 单步迁移：把某个版本的记录升级到下一版本（返回新对象，不改入参） */
export type LibraryMigration = (record: Record<string, unknown>) => Record<string, unknown>

/**
 * 迁移链：键为**源版本**，值把该版本升级到 version + 1。
 * 只登记相邻步；读取时逐级应用，缺失步即无法升级（返回 null）。
 */
export const LIBRARY_MIGRATIONS: Readonly<Record<number, LibraryMigration>> = {
  // v1 → v2：补上显式版本号（结构本身不变；v1 即「无 version 字段」的旧形态）
  1: (record) => ({ ...record, version: 2 }),
}

/**
 * 探测记录的 schema 版本：`version` 是合法正整数时用它；
 * 否则（缺字段 / 非法值）按 v1 处理——v1 就是无版本字段的旧形态。
 */
export function detectSchemaVersion(record: Record<string, unknown>): number {
  const version = record.version
  return typeof version === 'number' && Number.isInteger(version) && version >= 1 ? version : 1
}

/**
 * 沿迁移链把记录升级到当前版本。
 * - 旧版本：逐级迁移到 LIBRARY_SCHEMA_VERSION
 * - 已是当前版本：原样返回
 * - 未来版本（降级运行）或迁移步缺失：返回 null，调用方按「无存档」处理而不误改数据
 */
export function migrateLibraryRecord(
  record: Record<string, unknown>,
): Record<string, unknown> | null {
  let version = detectSchemaVersion(record)
  if (version > LIBRARY_SCHEMA_VERSION) return null
  let current = record
  while (version < LIBRARY_SCHEMA_VERSION) {
    const step = LIBRARY_MIGRATIONS[version]
    if (step === undefined) return null
    current = step(current)
    version += 1
  }
  return current
}
