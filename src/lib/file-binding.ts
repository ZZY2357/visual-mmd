/**
 * 本地文件绑定状态（self-grill-hardening 工单 18）。
 *
 * 与编辑器 store 分离：文件绑定是「当前这张图表关联到哪个磁盘文件」的会话态，
 * 不是图表模型的一部分，也不进撤销栈。独立的小 store（同 lib/follow/hint-store 的先例），
 * 不动 store/editor.ts，保持本票为纯增量。
 *
 * 磁盘文件与图表库草稿的关系（本票要求 4 的选择）：
 * - 图表库（localStorage）是**工作副本**：每次编辑防抖自动保存，负责崩溃恢复；
 * - 绑定的磁盘文件是**交付物**：只有用户点「保存」才把当前源码逐字写回磁盘，不自动同步。
 *   选「显式保存」而非「自动同步」：写盘是不可撤销的破坏性动作，且 FSA 的写权限请求需要
 *   用户手势——自动写盘既危险又不可靠。`dirty` 由「当前源码 ≠ 上次写盘源码」派生，
 *   在 FileSyncNotice 里明示，让用户清楚何时需要保存。
 */

import { create } from 'zustand'
import type { FsaFileHandle, RestoreOutcome } from './file-system-access'

/** 绑定状态：none=未绑定；ready=已绑定可用；needs-permission=需重新授权；denied=权限被拒；error=读文件失败 */
export type FileBindingStatus = 'none' | 'ready' | 'needs-permission' | 'denied' | 'error'

interface FileBindingState {
  status: FileBindingStatus
  /** 绑定文件名（展示用）；未绑定为 null */
  fileName: string | null
  /** 绑定的文件句柄（可写）；未绑定为 null */
  handle: FsaFileHandle | null
  /** 上次写盘/读回的源码；用于派生「有未保存改动」 */
  lastSavedSource: string | null
  /** 打开或恢复文件：记为已绑定且与磁盘一致 */
  bindFile: (handle: FsaFileHandle, diskText: string) => void
  /** 跨会话恢复结果落位（保留句柄，按结果置状态） */
  noteRestore: (outcome: RestoreOutcome) => void
  /** 写盘成功：更新基准源码（清除 dirty） */
  markSaved: (source: string) => void
  /** 解除绑定（不删磁盘文件） */
  unbind: () => void
}

export const useFileBindingStore = create<FileBindingState>((set) => ({
  status: 'none',
  fileName: null,
  handle: null,
  lastSavedSource: null,
  bindFile: (handle, diskText) =>
    set({ status: 'ready', fileName: handle.name, handle, lastSavedSource: diskText }),
  noteRestore: (outcome) => {
    switch (outcome.kind) {
      case 'none':
        return
      case 'ready':
        set({ status: 'ready', fileName: outcome.handle.name, handle: outcome.handle, lastSavedSource: outcome.text })
        return
      case 'needs-permission':
        set({ status: 'needs-permission', fileName: outcome.handle.name, handle: outcome.handle })
        return
      case 'denied':
        set({ status: 'denied', fileName: outcome.handle.name, handle: outcome.handle })
        return
      case 'error':
        set({ status: 'error', fileName: outcome.handle.name, handle: outcome.handle })
        return
    }
  },
  markSaved: (source) => set({ lastSavedSource: source, status: 'ready' }),
  unbind: () => set({ status: 'none', fileName: null, handle: null, lastSavedSource: null }),
}))

/** 是否有未保存到磁盘的改动：已绑定且当前源码 ≠ 上次写盘源码 */
export function isDirty(state: Pick<FileBindingState, 'handle' | 'lastSavedSource'>, currentSource: string): boolean {
  if (state.handle === null || state.lastSavedSource === null) return false
  return state.lastSavedSource !== currentSource
}
