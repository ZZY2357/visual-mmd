import { useCallback, useEffect, useRef, useState } from 'react'
import type { AnyProjection } from '../diagram-registry'
import type { DataIdResolver } from '../canvas-selection/data-id'
import { selectionFromEventTarget } from '../canvas-selection/data-id'
import type { CanvasInlineEditTarget } from './inline-edit'
import type { Selection } from '../projection/selection'
import { selectionOfMenuTarget } from '../canvas-selection/selection-codec'
import {
  contextMenuItems,
  contextMenuTargetFromSelection,
  type ContextMenuItemId,
  type ContextMenuTarget,
} from './context-menu'
import { linkModeTransition, type LinkModeState } from './link-mode'
import { addClassDefIntent } from './flowchart-forms'
import { MENU_ACTIONS, type MenuActionContext } from './menu-actions'
import { useEditorStore } from '../../store/editor'

/**
 * 画布右键菜单 Hook（工单 07/04）：右键弹出单一菜单（随目标变化），并托管连线模式
 * 与「添加样式」小表单两个派生状态。
 *
 * - onContextMenu：阻止浏览器默认菜单（只挂在画布容器上，代码面板不受影响），
 *   经 data-id 解析右键目标；无菜单可弹（目标不可映射，或该目标本轮没有动作）安静关闭。
 * - 空白菜单（工单 04）：flowchart 添加节点 / 连线模式 / 添加样式 / 添加子图；
 *   class 添加类 / sequence 添加参与者 / mindmap 添加根节点。空图（含空 classDiagram
 *   的错误态）同样可弹。新建元素落码后选中并进入内联命名（复用工单 05 的 beginEdit）。
 * - 落码位置：空白处没有锚点元素，不传 afterElementId，由各管线回退到文档最后一个
 *   元素（只有表头的文档即表头），新行因此落在图的开头之后。
 * - 连线模式：光标十字，依次单击起点、终点即 add-edge 落码；Esc / 点击空白取消；
 *   节点右键「从这里连线」带预选起点省一步。
 * - 添加样式：菜单位置浮出小表单（名称 + 颜色），提交才经 add-classdef 落码。
 * - class/sequence 节点菜单（工单 06）：class 加成员/加关系、sequence 加消息在菜单位置
 *   浮出表单（Add*member/relation/message*InlineForm），提交才落码（锚点为右键节点的声明，
 *   新元素插到它之后）；删除类/删除参与者直接经 delete-class / delete-participant 落码
 *   （级联删成员/关系/引用该参与者的语句由管线负责）。
 * - 连线菜单（工单 03）：class 关系边与 sequence 消息各给「编辑 + 删除」——能循环的
 *   **直接改**（set-relation 的 kind / set-message 的 arrow，菜单不关可连着点）；其余是
 *   「在属性面板中编辑」——菜单项自己选中该连线并关闭菜单（工单 05 定案 D5），字段在右侧
 *   RelationForm / MessageForm 改；flowchart 连线的 edit-label 由工单 06 一并统一到该语义
 *   （字段在右侧 EdgeForm 改）；删除走 delete-relation / delete-message。
 *   sequence 注释与逻辑块**顺带接上删除**（工单 03），不为其新造编辑动作。
 * - 添加入口补全（工单 04）：add-note / add-block 在菜单位置浮出添加型小表单。
 * - 画布键盘编辑键（工单 05）：class 的 Tab/Enter（加成员/加关系）、sequence 的 Enter
 *   （加消息）经 openFormForSelection 打开**同一份**添加型表单；与右键菜单共用
 *   nodeFormForTarget，不新造浮层。
 *
 * 菜单项动作的分发（architecture-deepening-2 工单 01）：Hook 不再为每个菜单项返回一个
 * 方法，而是现场组装窄的 MenuActionContext 语境对象，`onMenuItem(id)` 查 MENU_ACTIONS 表
 * 分发——动作实现与语义都住在 `menu-actions.ts`，可脱离本 Hook 单测。本 Hook 只保留
 * 覆盖层状态（菜单 / 两个表单 / 连线模式）与两条非菜单入口（applyStyle 子菜单提交、
 * openFormForSelection 键盘编辑键）。
 */

interface MenuState {
  target: ContextMenuTarget
  /** 菜单相对画布容器的位置 */
  x: number
  y: number
}

export interface StyleFormState {
  /** 表单相对画布容器的位置（在菜单打开处浮出） */
  x: number
  y: number
}

/** 菜单上浮出的添加型小表单种类（工单 06 三项 + 工单 04 补三项）：
 * 'note' 同时服务 sequence（注释）与 class（浮动 / note for X），由投影图种决定渲染哪个表单。 */
export type NodeFormKind = 'member' | 'relation' | 'message' | 'note' | 'block'

export interface NodeFormState {
  kind: NodeFormKind
  /** 落码锚点：右键元素的声明 elementId（新元素插到它之后）。
   * 缺省 = 空白处右键，由各管线回退到文档最后一个元素。 */
  anchorElementId?: string
  /** class 表单：预选类名（右键的那个类）；class 的 note 表单用它预选 `note for` 目标 */
  className?: string
  /** sequence 消息表单：预选起点参与者（右键的那个参与者） */
  from?: string
  /** 表单相对画布容器的位置（在菜单打开处浮出） */
  x: number
  y: number
}

/**
 * 菜单目标 + 表单种类 + 投影 → 添加型表单状态（工单 06/04/05）：算出锚点、预选值与位置；
 * 该组合无意义（目标种类与图种不匹配、投影里找不到该元素）时返回 null。
 * 右键菜单路径与画布键盘编辑键路径（工单 05）**共用这一个纯函数**，保证两条入口产出同一份表单。
 */
function nodeFormForTarget(
  target: ContextMenuTarget,
  kind: NodeFormKind,
  proj: AnyProjection,
  x: number,
  y: number,
): NodeFormState | null {
  if (kind === 'member' || kind === 'relation') {
    if (target.kind !== 'class-node' || proj.type !== 'class') return null
    const cls = proj.class.classes.find((c) => c.name === target.name)
    if (cls === undefined) return null
    return { kind, anchorElementId: cls.elementId, className: target.name, x, y }
  }
  if (kind === 'message') {
    if (target.kind !== 'sequence-participant' || proj.type !== 'sequence') return null
    const p = proj.sequence.participants.find((x2) => x2.actorId === target.actorId)
    if (p === undefined) return null
    return { kind, anchorElementId: p.elementId, from: target.actorId, x, y }
  }
  if (kind === 'block') {
    // sequence 独有的添加逻辑块：参与者上右键 → 锚点为该参与者的声明；
    // 空白处右键 → 无锚点（管线回退到文档最后一个元素）
    if (proj.type !== 'sequence') return null
    if (target.kind === 'sequence-participant') {
      const p = proj.sequence.participants.find((x2) => x2.actorId === target.actorId)
      if (p === undefined) return null
      return { kind, anchorElementId: p.elementId, x, y }
    }
    return target.kind === 'blank' ? { kind, x, y } : null
  }
  // note：class 类节点 = note for X（锚点即该类声明）；class 空白 = 浮动 note；
  // sequence 空白 = note over/left/right（参与者由表单自行选择）
  if (proj.type === 'class') {
    if (target.kind === 'class-node') {
      const cls = proj.class.classes.find((c) => c.name === target.name)
      if (cls === undefined) return null
      return { kind, anchorElementId: cls.elementId, className: target.name, x, y }
    }
    return target.kind === 'blank' ? { kind, x, y } : null
  }
  if (proj.type === 'sequence') {
    return target.kind === 'blank' ? { kind, x, y } : null
  }
  return null
}

/** 编辑器选中 → 可打开添加表单的菜单目标形态（仅类与参与者两种；其余选中无该形态） */
function formTargetOfSelection(selection: Selection): ContextMenuTarget | null {
  if (selection.kind === 'class') return { kind: 'class-node', name: selection.name }
  if (selection.kind === 'participant') return { kind: 'sequence-participant', actorId: selection.actorId }
  return null
}

export interface CanvasContextMenuOptions {
  projection: AnyProjection | null
  /** 图种 data-id resolver（右键目标解析，与选中/内联编辑同一套事实约定） */
  resolver: DataIdResolver | null
  /** 画布容器（contextmenu / Escape 监听宿主；浮层定位基准） */
  containerRef: React.RefObject<HTMLElement | null>
  /** 菜单「编辑文本」与新建节点后的内联编辑入口（工单 05 beginEdit） */
  onNodeCreated?: (target: CanvasInlineEditTarget) => void
  /** mindmap 新子节点占位文本（确认前落码用） */
  newNodeText?: string
}

export function useCanvasContextMenu(
  { projection, resolver, containerRef, onNodeCreated, newNodeText = '新节点' }: CanvasContextMenuOptions,
) {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [styleForm, setStyleForm] = useState<StyleFormState | null>(null)
  const [nodeForm, setNodeForm] = useState<NodeFormState | null>(null)
  const [linkMode, setLinkMode] = useState<LinkModeState>({ stage: 'idle' })
  // 事件回调里读最新值：ref 兜住
  const latest = useRef({ projection, resolver, onNodeCreated, newNodeText })
  latest.current = { projection, resolver, onNodeCreated, newNodeText }

  const closeMenu = useCallback(() => setMenu(null), [])
  const closeStyleForm = useCallback(() => setStyleForm(null), [])
  const closeNodeForm = useCallback(() => setNodeForm(null), [])

  /** 右键目标 → 编辑器选中（属性面板联动：连线的字段编辑依赖该选中）。
   * 映射本体在 canvas-selection/selection-codec.ts（工单 03）；blank 目标不 select。 */
  const selectTarget = useCallback((target: ContextMenuTarget): void => {
    const { select } = useEditorStore.getState()
    const selection = selectionOfMenuTarget(target)
    if (selection !== null) select(selection)
  }, [])

  /** 右键：阻止默认菜单；解析目标 → 选中联动 → 弹出菜单（无可弹项安静关闭） */
  const onContextMenu = useCallback(
    (e: React.MouseEvent): void => {
      e.preventDefault()
      const container = containerRef.current
      const { projection: proj, resolver: r } = latest.current
      if (container === null || proj === null) return
      const selection = selectionFromEventTarget(e.target, r)
      const target = contextMenuTargetFromSelection(selection, proj.type)
      if (target === null || contextMenuItems(target).length === 0) {
        closeMenu()
        return
      }
      selectTarget(target)
      const rect = container.getBoundingClientRect()
      closeStyleForm()
      closeNodeForm()
      setMenu({ target, x: e.clientX - rect.left, y: e.clientY - rect.top })
    },
    [containerRef, closeMenu, closeStyleForm, closeNodeForm, selectTarget],
  )

  /** 画布单击：连线模式下消费（节点 = 推进状态机，其它 = 取消）。
   * 返回 true = 事件已被连线模式吃掉，使用方应跳过选中链路 */
  const onCanvasClick = useCallback(
    (e: React.MouseEvent): boolean => {
      if (linkMode.stage === 'idle') return false
      const { projection: proj, resolver: r } = latest.current
      const selection = proj !== null ? selectionFromEventTarget(e.target, r) : null
      if (selection !== null && selection.kind === 'node') {
        const { commitIntent, select } = useEditorStore.getState()
        const { state, completed } = linkModeTransition(linkMode, { type: 'click-node', nodeId: selection.id })
        setLinkMode(state)
        if (completed !== null) {
          // 两步完成：落码默认实线箭头连线并选中它
          if (
            commitIntent({
              type: 'add-edge',
              from: completed.from,
              to: completed.to,
              lineStyle: 'solid',
              head: 'arrow',
            })
          ) {
            select({ kind: 'edge', from: completed.from, to: completed.to, occurrence: 1 })
          }
        }
        return true
      }
      // 点击空白/其它元素：取消连线模式
      setLinkMode(linkModeTransition(linkMode, { type: 'click-blank' }).state)
      return true
    },
    [linkMode],
  )

  // Esc：取消连线模式 / 关闭菜单与样式表单（监听挂容器上，画布聚焦时才触发）
  useEffect(() => {
    const container = containerRef.current
    if (container === null) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setMenu(null)
      setStyleForm(null)
      setNodeForm(null)
      setLinkMode((cur) => (cur.stage !== 'idle' ? linkModeTransition(cur, { type: 'cancel' }).state : cur))
    }
    container.addEventListener('keydown', onKeyDown)
    return () => container.removeEventListener('keydown', onKeyDown)
  }, [containerRef])

  /** 进入连线模式（preselectedFrom = 「从这里连线」的预选起点）。
   * 收起菜单与两个表单浮层；动作表经 MenuActionContext.enterLinkMode 调到这里。 */
  const enterLinkMode = useCallback(
    (preselectedFrom?: string): void => {
      setMenu(null)
      setStyleForm(null)
      setNodeForm(null)
      setLinkMode(linkModeTransition({ stage: 'idle' }, { type: 'enter', preselectedFrom }).state)
    },
    [],
  )

  /** 应用样式到右键节点：apply-class 落码为独立 class 语句（工单 02 管线）。
   * 不经 MENU_ACTIONS 分发：CanvasPanel 把 apply-style 渲染成子菜单开关，点样式名直接调这里。 */
  const applyStyle = useCallback(
    (className: string): void => {
      const target = menu?.target
      if (target === undefined || target.kind !== 'flowchart-node') return
      useEditorStore.getState().commitIntent({ type: 'apply-class', nodeId: target.nodeId, className })
      closeMenu()
    },
    [menu, closeMenu],
  )

  /** 添加型表单浮层（工单 06/04）：在菜单位置浮出小表单，表单提交才落码。
   * 锚点与预选值取自右键目标：
   * - member / relation：class 类节点 → 锚点 = 该类声明，预选类名；
   * - message：sequence 参与者 → 锚点 = 该参与者声明，预选起点；
   * - block（工单 04）：sequence 空白（无锚点，回退文档末尾）或参与者（锚点 = 该参与者声明）；
   * - note（工单 04）：class 类节点（锚点 = 该类声明 + 预选 `note for` 目标）/ class 空白
   *   （无锚点、无目标类 = 浮动 note）/ sequence 空白（无锚点）。 */
  const openNodeForm = useCallback(
    (kind: NodeFormKind): void => {
      const target = menu?.target
      const proj = latest.current.projection
      if (target === undefined || menu === null || proj === null) return
      const form = nodeFormForTarget(target, kind, proj, menu.x, menu.y)
      if (form === null) return
      setNodeForm(form)
      setMenu(null)
    },
    [menu],
  )

  /** 打开「添加样式」小表单（在菜单位置浮出，提交才落码） */
  const openStyleForm = useCallback((): void => {
    if (menu === null) return
    setStyleForm({ x: menu.x, y: menu.y })
    setMenu(null)
  }, [menu])

  /**
   * 画布键盘编辑键（工单 05）：对**当前选中**元素打开添加表单（无右键菜单，浮层在画布内浮出）。
   * Tab/Enter 的「就近结构」在此落成具体表单——class 的加成员/加关系、sequence 的加消息，
   * 与右键菜单共用 nodeFormForTarget，**不新造浮层**。选中不是类/参与者时安静地不打开。
   */
  const openFormForSelection = useCallback(
    (kind: 'member' | 'relation' | 'message'): void => {
      const proj = latest.current.projection
      const { selection } = useEditorStore.getState()
      if (proj === null || selection === null) return
      const target = formTargetOfSelection(selection)
      if (target === null) return
      const rect = containerRef.current?.getBoundingClientRect()
      // 键盘没有鼠标位置：浮层落在画布内左上偏中处（宽度留出表单 240px 的余量）
      const x = rect !== undefined ? Math.max(8, rect.width / 2 - 120) : 8
      const y = rect !== undefined ? Math.max(8, rect.height / 3) : 8
      const form = nodeFormForTarget(target, kind, proj, x, y)
      if (form === null) return
      setMenu(null)
      setStyleForm(null)
      setNodeForm(form)
    },
    [containerRef],
  )

  /** 提交样式表单：名称非法（空 / 含空白逗号）返回 false 不落码 */
  const submitStyleForm = useCallback((name: string, color: string): boolean => {
    const intent = addClassDefIntent({ name: name.trim(), fill: color, stroke: '', dashStyle: 'solid', color: '' })
    if (intent === null) return false
    if (!useEditorStore.getState().commitIntent(intent)) return false
    setStyleForm(null)
    return true
  }, [])

  /**
   * 菜单项 → 动作分发（architecture-deepening-2 工单 01）：现场组装 MenuActionContext，
   * 查 MENU_ACTIONS 表分发（Record 穷尽性在类型层保证——漏一项是编译错误）。
   * 动作实现与语义住在 menu-actions.ts，本 Hook 只供给覆盖层状态与 store 接线。
   */
  const onMenuItem = useCallback(
    (id: ContextMenuItemId): void => {
      // apply-style 不经分发：CanvasPanel 把它渲染成子菜单开关，点具体样式名直接调 applyStyle(name)
      if (id === 'apply-style') return
      const actionCtx: MenuActionContext = {
        projection: latest.current.projection,
        selection: useEditorStore.getState().selection,
        commitIntent: (intent) => useEditorStore.getState().commitIntent(intent),
        select: (selection) => useEditorStore.getState().select(selection),
        openForm: openNodeForm,
        openStyleForm,
        beginInlineEdit: (target) => latest.current.onNodeCreated?.(target),
        enterLinkMode,
        newNodeText: latest.current.newNodeText,
        close: closeMenu,
      }
      MENU_ACTIONS[id](actionCtx, menu?.target)
    },
    [menu, openNodeForm, openStyleForm, enterLinkMode, closeMenu],
  )

  // 可用菜单项（空白菜单按图种给添加动作；其余图种未定义的目标不弹）
  const items: ContextMenuItemId[] = menu !== null ? contextMenuItems(menu.target) : []

  return {
    menu: menu !== null ? { ...menu, items } : null,
    styleForm,
    nodeForm,
    linkMode,
    onContextMenu,
    onCanvasClick,
    closeMenu,
    closeStyleForm,
    closeNodeForm,
    /** 菜单项动作分发（MenuActionContext 语境 + MENU_ACTIONS 查表） */
    onMenuItem,
    openFormForSelection,
    submitStyleForm,
    enterLinkMode,
    /** apply-style 子菜单的提交入口（不经 MENU_ACTIONS，见 applyStyle 注释） */
    applyStyle,
  }
}
