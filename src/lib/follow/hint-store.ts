import { create } from 'zustand'
import type { Selection } from '../projection/selection'
import { sameSelection } from '../projection/selection'

/**
 * 光标提示状态（self-grill-hardening 工单 16）。
 *
 * 代码面板的光标停在某元素的源码区间内时，把该元素的选中（**提示**，非真选中）
 * 写进这里；画布读它打一个轻量提示。独立的小 store，不动 store/editor.ts——
 * 提示是纯展示态，不进撤销栈、不参与选中语义（选中仍是 editorStore.selection）。
 *
 * 用 zustand 便于 CanvasPanel 订阅、CodePanel 写入，且无 React 上下文耦合。
 */
interface CursorHintState {
  /** 光标所在源码区间对应的元素选中；无则 null */
  hint: Selection | null
  setHint: (selection: Selection | null) => void
}

export const useCursorHintStore = create<CursorHintState>((set, get) => ({
  hint: null,
  setHint: (selection) => {
    const current = get().hint
    // 值未变则不 set：避免同一元素上的连续光标移动造成无谓重渲染
    if (current === null || selection === null) {
      if (current === selection) return
    } else if (sameSelection(current, selection)) {
      return
    }
    set({ hint: selection })
  },
}))
