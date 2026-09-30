import { useEffect, useRef } from 'react'
import { useEditorStore } from '../../store/editor'
import type { Selection } from '../projection/selection'
import { capabilitiesOf, projectionOfKeyboardTarget } from '../canvas-selection/capabilities'
import { pickDirectionalTarget } from './directional-navigation'
import type { InlineEditTarget } from './inline-edit'
import {
  isNavigationKey,
  keyToClassAction,
  keyToNodeAction,
  keyToSequenceAction,
  mindmapActionIntents,
  nodeActionIntents,
  type CanvasKeyboardProjection,
  type CanvasNavigation,
  type NodeExtent,
} from './canvas-keyboard'

/**
 * 画布键盘操作 Hook（工单 04 焦点体系，工单 06 扩展 mindmap，工单 14 方向键方位导航，
 * 工单 05 class/sequence 编辑键）：
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
 *
 * 编辑键（工单 05 / ADR-0013）覆盖四个图种：
 * - flowchart（工单 04）：Tab = 选中 --> 新；Enter = 父 --> 新（无入边退化为连出）
 * - mindmap（工单 06）：Tab = 加子节点；Enter = 加同级（根退化为加子）；落码按缩进层级
 * - class（工单 05）：Tab = 加成员、Enter = 加关系——两者**落到已有表单浮层**
 *   （AddMemberInlineForm / AddRelationInlineForm，经 onEditKey 请求），不新造浮层
 * - sequence（工单 05）：Tab = 加参与者（复用空白菜单的创建 + 内联命名路径）、
 *   Enter = 加消息（落到已有 AddMessageInlineForm）
 * - 四图种 Delete = 删除选中元素（class/sequence 的删除经能力包 deleteIntent——
 *   「选中种类 → 删除意图」的唯一映射，与右键菜单 / 属性面板共用，architecture-deepening-2
 *   工单 03；级联与属性面板一致。flowchart / mindmap 的删除仍走 nodeActionIntents /
 *   mindmapActionIntents 的 plan——删除后还要按 plan 决定不选中，意图本身与能力包等价，
 *   等价性由 canvas-selection/__tests__/delete-intent.test.ts 钉住）
 *
 * **可达性代价（ADR-0013 已记录）**：class / sequence 上 Tab 被用作编辑动作并
 * preventDefault，因此在这两类图的画布上**无法用 Tab 跳出画布**——焦点离开仍可点击或
 * Escape。无选中（无可编辑锚点）时 Tab/Enter 不 preventDefault，交给浏览器默认行为。
 */

/** 参与画布键盘的图种投影（tagged union，keydown 时按图种分支） */
export type { CanvasKeyboardProjection }

/**
 * class / sequence 编辑键（Tab/Enter）的浮层请求（工单 05 / ADR-0013）：
 * 一律落到已有表单或既有创建路径，不新造浮层；锚点与预选值由右键菜单 hook 从
 * 当前选中推出（与右键菜单共用同一份 NodeFormState）。
 */
export interface EditKeyRequest {
  /** member / relation（class）、message（sequence）：打开对应添加表单 */
  form: 'member' | 'relation' | 'message' | 'participant'
}

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
  /** class / sequence 编辑键（Tab/Enter）的浮层请求（工单 05）：落到已有表单/创建路径 */
  onEditKey?: (request: EditKeyRequest) => void
}

export function useCanvasKeyboard(
  target: CanvasKeyboardProjection | null,
  { containerRef, onNodeCreated, newNodeText = '新节点', navigation, onEditKey }: CanvasKeyboardOptions,
): void {
  // 事件回调里读最新值：ref 兜住
  const latest = useRef({ onNodeCreated, newNodeText, navigation, onEditKey })
  latest.current = { onNodeCreated, newNodeText, navigation, onEditKey }

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

      // ③ class（工单 05 / ADR-0013）：Tab = 加成员、Enter = 加关系（落到已有表单浮层）、
      //    Delete = 删除选中元素。无选中（无可编辑锚点）时不处理、不 preventDefault。
      if (target.kind === 'class') {
        const classAction = keyToClassAction(e.key, { shift: e.shiftKey })
        if (classAction === null) return
        if (classAction === 'delete') {
          // 删除意图（architecture-deepening-2 工单 03）：查能力包的唯一映射，
          // 与右键菜单 / 属性面板删除共用；存在性校验（→ null）也在能力包里
          const wrapper = projectionOfKeyboardTarget(target)
          const intent = capabilitiesOf(wrapper).deleteIntent(wrapper, selection)
          if (intent === null) return
          e.preventDefault()
          if (commitIntent(intent)) select(null)
          return
        }
        if (selection === null || selection.kind !== 'class') return
        if (!target.projection.classes.some((c) => c.name === selection.name)) return
        e.preventDefault() // 已确定要处理：压掉 Tab 焦点切换 / 页面滚动等默认行为
        latest.current.onEditKey?.({ form: classAction === 'add-member' ? 'member' : 'relation' })
        return
      }

      // ④ sequence（工单 05 / ADR-0013）：Tab = 加参与者（既有创建路径）、
      //    Enter = 加消息（落到已有表单浮层）、Delete = 删除选中元素。
      if (target.kind === 'sequence') {
        const seqAction = keyToSequenceAction(e.key, { shift: e.shiftKey })
        if (seqAction === null) return
        if (seqAction === 'delete') {
          // 同 ③：删除意图查能力包的唯一映射（工单 03）
          const wrapper = projectionOfKeyboardTarget(target)
          const intent = capabilitiesOf(wrapper).deleteIntent(wrapper, selection)
          if (intent === null) return
          e.preventDefault()
          if (commitIntent(intent)) select(null)
          return
        }
        if (seqAction === 'add-participant') {
          // 参与者是列、没有锚点：直接走空白菜单的创建路径（默认名 + 内联命名）
          e.preventDefault()
          latest.current.onEditKey?.({ form: 'participant' })
          return
        }
        // 加消息需要选中一个参与者作为起点与锚点
        if (selection === null || selection.kind !== 'participant') return
        if (!target.projection.participants.some((p) => p.actorId === selection.actorId)) return
        e.preventDefault()
        latest.current.onEditKey?.({ form: 'message' })
        return
      }

      // ⑤ flowchart / mindmap（工单 04/06）：Tab 加子/同级、Delete 删除，落码后进入内联命名
      const action = keyToNodeAction(e.key, { shift: e.shiftKey })
      if (action === null) return

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
