import { useEffect } from 'react'
import type { FlowchartProjection } from '../projection/flowchart-projection'
import { useEditorStore } from '../../store/editor'
import { keyToNodeAction, nodeActionIntents } from './canvas-keyboard'

/**
 * 画布键盘操作 Hook（工单 05）：window 级 keydown，仅当
 * - 焦点不在代码面板（CodeMirror）或任何文本输入控件上（不干扰打字）
 * - 当前选中是节点
 * 时把 Del / Tab / Enter 映射为编辑意图，经 commitIntent 手术式落码（可撤销）。
 * 添加动作成功后自动选中新节点，支持连续键入搭建结构。
 */

/** 焦点在这些控件内时不触发画布键盘操作 */
const FOCUS_EXCLUDE_SELECTOR =
  '.cm-editor, input, textarea, select, [contenteditable="true"], [contenteditable=""]'

export function useCanvasKeyboard(projection: FlowchartProjection | null): void {
  useEffect(() => {
    if (projection === null) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target
      if (target instanceof Element && target.closest(FOCUS_EXCLUDE_SELECTOR)) return

      const { selection, commitIntent, select } = useEditorStore.getState()
      if (selection === null || selection.kind !== 'node') return
      const action = keyToNodeAction(e.key, { shift: e.shiftKey })
      if (action === null) return

      const plan = nodeActionIntents(projection, selection.nodeId, action)
      if (plan === null) return

      e.preventDefault() // 已确定要处理：压掉 Tab 焦点切换 / 页面滚动等默认行为
      for (const intent of plan.intents) {
        if (!commitIntent(intent)) return // 第一个意图失败（选中已过期等）：放弃本次操作
      }
      if (plan.newNodeId !== null) {
        select({ kind: 'node', nodeId: plan.newNodeId })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [projection])
}
