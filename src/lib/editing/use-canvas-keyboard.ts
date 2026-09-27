import { useEffect, useRef } from 'react'
import type { FlowchartProjection } from '../projection/flowchart-projection'
import { useEditorStore } from '../../store/editor'
import { keyToNodeAction, nodeActionIntents } from './canvas-keyboard'

/**
 * 画布键盘操作 Hook（工单 04 焦点体系）：keydown 挂在画布容器上（而非 window），
 * 天然只在画布持有焦点时触发——焦点在代码面板或任何输入框时事件根本不会到达
 * 容器，完全不拦截。容器内若嵌有输入控件（防御性保留），也不触发画布操作。
 * Del / Tab / Enter 映射为编辑意图，经 commitIntent 手术式落码（可撤销）。
 * 添加动作成功后自动选中新节点并回调 onNodeCreated（工单 05 已接线：内联命名）。
 */

/** 容器内焦点落在这类控件上时不触发画布键盘操作 */
const FOCUS_EXCLUDE_SELECTOR =
  '.cm-editor, input, textarea, select, [contenteditable="true"], [contenteditable=""]'

export interface CanvasKeyboardOptions {
  /** 画布容器（tabindex=0、点击后持有焦点的元素）；keydown 监听就挂在其上 */
  containerRef: React.RefObject<HTMLElement | null>
  /** 新节点落码成功并选中后回调（工单 05：进入内联命名输入框） */
  onNodeCreated?: (nodeId: string) => void
}

export function useCanvasKeyboard(
  projection: FlowchartProjection | null,
  { containerRef, onNodeCreated }: CanvasKeyboardOptions,
): void {
  const onNodeCreatedRef = useRef(onNodeCreated)
  onNodeCreatedRef.current = onNodeCreated

  useEffect(() => {
    const container = containerRef.current
    if (projection === null || container === null) return

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
        onNodeCreatedRef.current?.(plan.newNodeId)
      }
    }

    container.addEventListener('keydown', onKeyDown)
    return () => container.removeEventListener('keydown', onKeyDown)
  }, [projection, containerRef])
}
