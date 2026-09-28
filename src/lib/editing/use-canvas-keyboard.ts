import { useEffect, useRef } from 'react'
import { useEditorStore } from '../../store/editor'
import type { InlineEditTarget } from './inline-edit'
import {
  isNavigationKey,
  keyToNodeAction,
  mindmapActionIntents,
  navigationTarget,
  nodeActionIntents,
  type CanvasKeyboardProjection,
} from './canvas-keyboard'

/**
 * 画布键盘操作 Hook（工单 04 焦点体系，工单 06 扩展 mindmap，工单 03 方向键导航）：
 * keydown 挂在画布容器上（而非 window），天然只在画布持有焦点时触发——焦点在代码面板或
 * 任何输入框时事件根本不会到达容器，完全不拦截。容器内若嵌有输入控件（防御性保留），也不触发
 * 画布操作。Del / Tab / Enter 映射为编辑意图，经 commitIntent 手术式落码（可撤销）。
 * 添加动作成功后自动选中新节点并回调 onNodeCreated（工单 05 已接线：内联命名）。
 * 方向键（Tab/Enter/Del 未命中时）移动「选中」本身（ADR-0010：不动 DOM 焦点），
 * 到边界无操作但仍 preventDefault（否则页面滚动）。
 *
 * 图种语义（键位相同，落码各按其语法）：
 * - flowchart（工单 04）：Tab = 选中 --> 新；Enter = 父 --> 新（无入边退化为连出）
 * - mindmap（工单 06）：Tab = 加子节点；Enter = 加同级（根退化为加子）；落码按缩进层级
 */

/** 参与画布键盘的图种投影（tagged union，keydown 时按图种分支） */
export type { CanvasKeyboardProjection }

/** 容器内焦点落在这类控件上时不触发画布键盘操作 */
const FOCUS_EXCLUDE_SELECTOR =
  '.cm-editor, input, textarea, select, [contenteditable="true"], [contenteditable=""]'

export interface CanvasKeyboardOptions {
  /** 画布容器（tabindex=0、点击后持有焦点的元素）；keydown 监听就挂在其上 */
  containerRef: React.RefObject<HTMLElement | null>
  /** 新节点落码成功并选中后回调，参数即内联编辑目标（工单 05/06：进入内联命名输入框） */
  onNodeCreated?: (target: InlineEditTarget) => void
  /** mindmap 新节点占位文本（flowchart 用节点 id 作占位，不需要此参数） */
  newNodeText?: string
}

export function useCanvasKeyboard(
  target: CanvasKeyboardProjection | null,
  { containerRef, onNodeCreated, newNodeText = '新节点' }: CanvasKeyboardOptions,
): void {
  // 事件回调里读最新值：ref 兜住
  const latest = useRef({ onNodeCreated, newNodeText })
  latest.current = { onNodeCreated, newNodeText }

  useEffect(() => {
    const container = containerRef.current
    if (target === null || container === null) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const el = e.target
      if (el instanceof Element && el.closest(FOCUS_EXCLUDE_SELECTOR)) return

      const { selection, commitIntent, select } = useEditorStore.getState()
      const action = keyToNodeAction(e.key, { shift: e.shiftKey })
      if (action === null) {
        // 方向键导航（工单 03）：只改选中，不动 DOM 焦点；到边界无操作也要 preventDefault
        if (!isNavigationKey(e.key)) return
        e.preventDefault()
        const next = navigationTarget(target, selection, e.key)
        if (next !== null) select(next)
        return
      }

      // 落码成功后：选中 + 进入内联命名的目标（两类图种各按其选中种类）
      let newTarget: InlineEditTarget | null = null
      if (target.kind === 'flowchart') {
        if (selection === null || selection.kind !== 'node') return
        const plan = nodeActionIntents(target.projection, selection.nodeId, action)
        if (plan === null) return
        e.preventDefault() // 已确定要处理：压掉 Tab 焦点切换 / 页面滚动等默认行为
        for (const intent of plan.intents) {
          if (!commitIntent(intent)) return // 第一个意图失败（选中已过期等）：放弃本次操作
        }
        if (plan.newNodeId !== null) {
          select({ kind: 'node', nodeId: plan.newNodeId })
          newTarget = { kind: 'flowchart', nodeId: plan.newNodeId }
        }
      } else {
        if (selection === null || selection.kind !== 'mindmap-node') return
        const plan = mindmapActionIntents(
          target.projection,
          selection.elementId,
          action,
          latest.current.newNodeText,
        )
        if (plan === null) return
        e.preventDefault()
        for (const intent of plan.intents) {
          if (!commitIntent(intent)) return
        }
        if (plan.newElementId !== null) {
          select({ kind: 'mindmap-node', elementId: plan.newElementId })
          newTarget = { kind: 'mindmap', elementId: plan.newElementId }
        }
      }
      if (newTarget !== null) latest.current.onNodeCreated?.(newTarget)
    }

    container.addEventListener('keydown', onKeyDown)
    return () => container.removeEventListener('keydown', onKeyDown)
  }, [target, containerRef])
}
