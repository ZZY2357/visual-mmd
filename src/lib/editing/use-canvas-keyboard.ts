import { useEffect, useRef } from 'react'
import { useEditorStore } from '../../store/editor'
import type { Selection } from '../projection/selection'
import { pickDirectionalTarget } from './directional-navigation'
import type { InlineEditTarget } from './inline-edit'
import {
  isNavigationKey,
  keyToNodeAction,
  mindmapActionIntents,
  nodeActionIntents,
  type CanvasKeyboardProjection,
  type CanvasNavigation,
  type NodeExtent,
} from './canvas-keyboard'

/**
 * 画布键盘操作 Hook（工单 04 焦点体系，工单 06 扩展 mindmap，工单 14 方向键方位导航）：
 * keydown 挂在画布容器上（而非 window），天然只在画布持有焦点时触发——焦点在代码面板或
 * 任何输入框时事件根本不会到达容器，完全不拦截。容器内若嵌有输入控件（防御性保留），也不触发
 * 画布操作。Del / Tab / Enter 映射为编辑意图，经 commitIntent 手术式落码（可撤销）。
 * 添加动作成功后自动选中新节点并回调 onNodeCreated（工单 05 已接线：内联命名）。
 *
 * 方向键（工单 14 / ADR-0011）覆盖**四个图种**，一律方位导航：按几何方位取邻近节点
 * （pickDirectionalTarget），只 `select()`、**不移动 DOM 焦点**（ADR-0010）；无锚点
 * （无选中 / 图表级 / 别种元素 / 已不在投影）回落到投影首个节点；无候选无操作但仍
 * preventDefault（不回绕、不滚动页面）。任何修饰键按住都不导航，但方向键仍 preventDefault
 * （修掉 Alt/Ctrl/Cmd+方向键触发浏览器前进后退、Shift+方向键静默改选中）。
 * 编辑键（Tab/Enter/Delete）**不扩**：只在 flowchart / mindmap 生效，class / sequence
 * 命中也直接 return（不落码、不 preventDefault）——它们只享受方向键。
 *
 * 图种语义（键位相同，落码各按其语法）：
 * - flowchart（工单 04）：Tab = 选中 --> 新；Enter = 父 --> 新（无入边退化为连出）
 * - mindmap（工单 06）：Tab = 加子节点；Enter = 加同级（根退化为加子）；落码按缩进层级
 */

/** 参与画布键盘的图种投影（tagged union，keydown 时按图种分支） */
export type { CanvasKeyboardProjection }

/** 容器内焦点落在这类控件上时不触发画布键盘操作（button 不可少：否则按钮上的
 * Enter 会冒泡到容器被当作画布动作，既误改源码又压掉按钮自身的 Enter→click，工单 12） */
const FOCUS_EXCLUDE_SELECTOR =
  '.cm-editor, button, input, textarea, select, [contenteditable="true"], [contenteditable=""]'

export interface CanvasKeyboardOptions {
  /** 画布容器（tabindex=0、点击后持有焦点的元素）；keydown 监听就挂在其上 */
  containerRef: React.RefObject<HTMLElement | null>
  /** 新节点落码成功并选中后回调，参数即内联编辑目标（工单 05/06：进入内联命名输入框） */
  onNodeCreated?: (target: InlineEditTarget) => void
  /** mindmap 新节点占位文本（flowchart 用节点 id 作占位，不需要此参数） */
  newNodeText?: string
  /** 方向键方位导航的适配对象（工单 14）；未接线时方向键只 preventDefault、不移动选中 */
  navigation?: CanvasNavigation
}

export function useCanvasKeyboard(
  target: CanvasKeyboardProjection | null,
  { containerRef, onNodeCreated, newNodeText = '新节点', navigation }: CanvasKeyboardOptions,
): void {
  // 事件回调里读最新值：ref 兜住
  const latest = useRef({ onNodeCreated, newNodeText, navigation })
  latest.current = { onNodeCreated, newNodeText, navigation }

  useEffect(() => {
    const container = containerRef.current
    if (target === null || container === null) return

    /** 方位导航（工单 14）：按几何方位移动选中，只 select()、不动 DOM 焦点 */
    const navigate = (key: string, selection: Selection | null, select: (s: Selection | null) => void) => {
      const nav = latest.current.navigation
      if (nav === undefined) return
      const anchorDataId = nav.dataIdOf(selection)
      if (anchorDataId === null) {
        // 无锚点：方位无从谈起，回落选中投影首个节点（与改前既有行为一致）
        const first = nav.firstSelection()
        if (first === null) return
        select(first)
        const firstDataId = nav.dataIdOf(first)
        if (firstDataId !== null) nav.reveal(firstDataId)
        return
      }
      const extents = nav.extents()
      const centerOf = (e: NodeExtent) => ({ cx: e.rect.left + e.rect.width / 2, cy: e.rect.top + e.rect.height / 2 })
      const anchorExtent = extents.find((x) => x.dataId === anchorDataId)
      if (anchorExtent === undefined) return // 锚点未渲染：无操作
      const targetId = pickDirectionalTarget(
        centerOf(anchorExtent),
        extents.map((x) => ({ id: x.dataId, ...centerOf(x) })),
        key,
      )
      if (targetId === null) return // 无候选：无操作（已 preventDefault）
      const next = nav.toSelection(targetId)
      if (next === null) return
      select(next)
      nav.reveal(targetId)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target
      if (el instanceof Element && el.closest(FOCUS_EXCLUDE_SELECTOR)) return

      const { selection, commitIntent, select } = useEditorStore.getState()

      // ① 方向键（工单 14 §5）：修饰键按住时不导航，但**一律** preventDefault
      //    （修掉 Alt/Ctrl/Cmd+方向键触发浏览器前进后退、Shift+方向键静默改选中）
      if (isNavigationKey(e.key)) {
        e.preventDefault()
        if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
        navigate(e.key, selection, select)
        return
      }

      // ② 非方向键：带修饰键不处理（交给原有行为）
      if (e.ctrlKey || e.metaKey || e.altKey) return

      const action = keyToNodeAction(e.key, { shift: e.shiftKey })
      if (action === null) return
      // ③ class / sequence 只享受方向键：编辑键命中也直接 return（不落码、不 preventDefault）
      if (target.kind !== 'flowchart' && target.kind !== 'mindmap') return

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
