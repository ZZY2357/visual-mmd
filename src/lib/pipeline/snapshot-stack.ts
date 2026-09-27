/**
 * 代码快照单栈（ADR-0008 派生决策）：撤销/重做 = 代码快照栈。
 * 连续代码输入按输入会话合并为一个快照（coalesce 标记 + 会话时间窗）。
 */

export interface SnapshotStackOptions {
  /** 输入会话合并窗口（ms），默认 1000 */
  coalesceMs?: number
  /** 可注入时钟，测试用 */
  now?: () => number
  /** 历史深度上限，超过时丢弃最旧快照 */
  maxDepth?: number
}

export interface CommitOptions {
  /** true 表示连续输入（按会话合并）；false/缺省 表示离散编辑（独立快照） */
  coalesce?: boolean
}

const DEFAULT_COALESCE_MS = 1000
const DEFAULT_MAX_DEPTH = 200

export class SnapshotStack {
  private past: string[] = []
  private future: string[] = []
  private currentSnapshot: string
  private readonly coalesceMs: number
  private readonly now: () => number
  private readonly maxDepth: number
  private lastCommitCoalesced = false
  private lastCommitAt = Number.NEGATIVE_INFINITY

  constructor(initial: string, options: SnapshotStackOptions = {}) {
    this.currentSnapshot = initial
    this.coalesceMs = options.coalesceMs ?? DEFAULT_COALESCE_MS
    this.now = options.now ?? (() => Date.now())
    this.maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH
  }

  /** 丢弃全部历史，以 source 为新的当前快照（如打开另一张图表时） */
  reset(source: string): void {
    this.past = []
    this.future = []
    this.currentSnapshot = source
    this.lastCommitCoalesced = false
    this.lastCommitAt = Number.NEGATIVE_INFINITY
  }

  get current(): string {
    return this.currentSnapshot
  }

  get canUndo(): boolean {
    return this.past.length > 0
  }

  get canRedo(): boolean {
    return this.future.length > 0
  }

  /**
   * 提交新状态。coalesce=true 且上一次提交也是 coalesce=true、
   * 且落在会话时间窗内时，与本会话已提交的部分合并为同一撤销步骤
   * （只更新当前快照，不再压入新历史）。
   */
  commit(source: string, options: CommitOptions = {}): void {
    if (source === this.currentSnapshot) return
    const coalesce = options.coalesce === true
    const at = this.now()
    const mergeIntoSession = coalesce && this.lastCommitCoalesced && at - this.lastCommitAt <= this.coalesceMs
    if (!mergeIntoSession) {
      this.past.push(this.currentSnapshot)
      if (this.past.length > this.maxDepth) this.past.shift()
    }
    this.currentSnapshot = source
    this.future = []
    this.lastCommitCoalesced = coalesce
    this.lastCommitAt = at
  }

  undo(): string | null {
    const previous = this.past.pop()
    if (previous === undefined) return null
    this.future.unshift(this.currentSnapshot)
    this.currentSnapshot = previous
    this.lastCommitCoalesced = false
    return previous
  }

  redo(): string | null {
    const next = this.future.shift()
    if (next === undefined) return null
    this.past.push(this.currentSnapshot)
    this.currentSnapshot = next
    this.lastCommitCoalesced = false
    return next
  }
}
