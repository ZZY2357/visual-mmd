/**
 * 代码快照单栈（ADR-0008 派生决策）：撤销/重做 = 代码快照栈。
 * 连续代码输入按输入会话合并为一个快照（coalesce 标记 + 会话时间窗）。
 *
 * 载荷是泛型的（工单 12）：store 用 `{ source, selection }`，让撤销/重做把选中
 * 随模型一并还原（ADR-0012 的连线位置序在还原后可能漂移，快照一并解决）。
 * 载荷相等性由 options.equals 决定（默认 Object.is），store 以「源码 + 选中」判等。
 */

export interface SnapshotStackOptions<T> {
  /** 输入会话合并窗口（ms），默认 1000 */
  coalesceMs?: number
  /** 可注入时钟，测试用 */
  now?: () => number
  /** 历史深度上限，超过时丢弃最旧快照 */
  maxDepth?: number
  /** 载荷相等性判定（决定 commit 是否真的产生新快照），默认 Object.is */
  equals?: (a: T, b: T) => boolean
}

export interface CommitOptions {
  /** true 表示连续输入（按会话合并）；false/缺省 表示离散编辑（独立快照） */
  coalesce?: boolean
}

const DEFAULT_COALESCE_MS = 1000
const DEFAULT_MAX_DEPTH = 200

export class SnapshotStack<T = string> {
  private past: T[] = []
  private future: T[] = []
  private currentSnapshot: T
  private readonly coalesceMs: number
  private readonly now: () => number
  private readonly maxDepth: number
  private readonly equals: (a: T, b: T) => boolean
  private lastCommitCoalesced = false
  private lastCommitAt = Number.NEGATIVE_INFINITY

  constructor(initial: T, options: SnapshotStackOptions<T> = {}) {
    this.currentSnapshot = initial
    this.coalesceMs = options.coalesceMs ?? DEFAULT_COALESCE_MS
    this.now = options.now ?? (() => Date.now())
    this.maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH
    this.equals = options.equals ?? Object.is
  }

  /** 丢弃全部历史，以 payload 为新的当前快照（如打开另一张图表时） */
  reset(payload: T): void {
    this.past = []
    this.future = []
    this.currentSnapshot = payload
    this.lastCommitCoalesced = false
    this.lastCommitAt = Number.NEGATIVE_INFINITY
  }

  get current(): T {
    return this.currentSnapshot
  }

  get canUndo(): boolean {
    return this.past.length > 0
  }

  get canRedo(): boolean {
    return this.future.length > 0
  }

  /**
   * 仅替换当前快照的载荷，不产生历史、不清空重做分支。
   * 用于「载荷中有一部分随交互变化但不构成编辑」的场景（如选中变化）：
   * 下一次 commit 压入 past 的仍是变化前的完整载荷，撤销即回到该选中。
   */
  amend(payload: T): void {
    if (this.equals(payload, this.currentSnapshot)) return
    this.currentSnapshot = payload
  }

  /**
   * 提交新状态。coalesce=true 且上一次提交也是 coalesce=true、
   * 且落在会话时间窗内时，与本会话已提交的部分合并为同一撤销步骤
   * （只更新当前快照，不再压入新历史）。
   */
  commit(payload: T, options: CommitOptions = {}): void {
    if (this.equals(payload, this.currentSnapshot)) return
    const coalesce = options.coalesce === true
    const at = this.now()
    const mergeIntoSession = coalesce && this.lastCommitCoalesced && at - this.lastCommitAt <= this.coalesceMs
    if (!mergeIntoSession) {
      this.past.push(this.currentSnapshot)
      if (this.past.length > this.maxDepth) this.past.shift()
    }
    this.currentSnapshot = payload
    this.future = []
    this.lastCommitCoalesced = coalesce
    this.lastCommitAt = at
  }

  undo(): T | null {
    const previous = this.past.pop()
    if (previous === undefined) return null
    this.future.unshift(this.currentSnapshot)
    this.currentSnapshot = previous
    this.lastCommitCoalesced = false
    return previous
  }

  redo(): T | null {
    const next = this.future.shift()
    if (next === undefined) return null
    this.past.push(this.currentSnapshot)
    this.currentSnapshot = next
    this.lastCommitCoalesced = false
    return next
  }
}
