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
import type { LinkModeState } from './link-mode'
import {
  IDLE_OPEN,
  overlayTransition,
  type MenuState,
  type NodeFormKind,
  type NodeFormState,
  type OverlayOpen,
  type StyleFormState,
} from './overlay-state'
import { addClassDefIntent } from './flowchart-forms'
import { MENU_ACTIONS, type MenuActionContext } from './menu-actions'
import { useEditorStore } from '../../store/editor'

/**
 * 画布右键菜单 Hook（工单 07/04）：右键弹出单一菜单（随目标变化），并托管连线模式
 * 与「添加样式」小表单两个派生状态。architecture-deepening-2 工单 05 起，menu /
 * styleForm / nodeForm / linkMode 四个互斥浮层收进 overlay-state.ts 的纯状态机
 * （单个 open + 独立的内联编辑位），迁移、点击 / 拖拽裁定与 Escape 全关都在那里定义，
 * 本 Hook 只做 store 接线与事件解析（右键目标、连线单击的节点 / 空白判定）。
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

export type { NodeFormKind, NodeFormState, StyleFormState } from './overlay-state'

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
  if (kind === 'transition') {
    // state 转移表单（more-diagrams 工单 02）：状态节点右键 / Enter 键 → 预选起点该状态
    if (target.kind !== 'state-node' || proj.type !== 'state') return null
    const state = proj.state.states.find((s) => s.id === target.id)
    if (state === undefined) return null
    return { kind, anchorElementId: state.tailElementId ?? undefined, from: target.id, x, y }
  }
  if (kind === 'er-attribute' || kind === 'er-relation') {
    // er 属性 / 关系表单（more-diagrams 工单 03）：实体节点右键 → 锚点为该实体的
    // 属性锚点（块内最后一个属性 ?? 声明行），关系表单预选起点该实体
    if (target.kind !== 'er-entity' || proj.type !== 'er') return null
    const entity = proj.er.entities.find((e) => e.name === target.name)
    if (entity === undefined) return null
    const base = {
      anchorElementId: entity.attrAnchorElementId ?? entity.tailElementId ?? undefined,
      x,
      y,
    }
    return kind === 'er-attribute' ? { kind, ...base, entity: target.name } : { kind, ...base, from: target.name }
  }
  if (kind === 'requirement-node' || kind === 'requirement-element') {
    // requirement / element 添加表单（more-diagrams 工单 07）：空白处右键 → 无锚点
    //（管线回退到文档最后一个元素）；节点右键不给添加入口（contextMenuItems 定案）
    if (proj.type !== 'requirement') return null
    return target.kind === 'blank' ? { kind, x, y } : null
  }
  if (kind === 'requirement-relation') {
    // requirement 关系表单（more-diagrams 工单 07）：requirement / element 节点右键或
    // Enter 键 → 锚点为该块的闭合行（关系行插在它之后），预选起点该节点
    if (proj.type !== 'requirement') return null
    if (target.kind !== 'requirement-node' && target.kind !== 'requirement-element') return null
    const block =
      target.kind === 'requirement-node'
        ? proj.requirement.requirements.find((r) => r.name === target.name)
        : proj.requirement.elements.find((e) => e.name === target.name)
    if (block === undefined) return null
    return { kind, anchorElementId: block.tailElementId, from: target.name, x, y }
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

/** 编辑器选中 → 可打开添加表单的菜单目标形态（类 / 参与者 / 状态 / 实体 / requirement
 * 两类节点；其余选中无该形态） */
function formTargetOfSelection(selection: Selection): ContextMenuTarget | null {
  if (selection.kind === 'class') return { kind: 'class-node', name: selection.name }
  if (selection.kind === 'participant') return { kind: 'sequence-participant', actorId: selection.actorId }
  if (selection.kind === 'state') return { kind: 'state-node', id: selection.id }
  if (selection.kind === 'er-entity') return { kind: 'er-entity', name: selection.name }
  if (selection.kind === 'requirement') return { kind: 'requirement-node', name: selection.name }
  if (selection.kind === 'requirement-element') return { kind: 'requirement-element', name: selection.name }
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
  // 覆盖层状态机（architecture-deepening-2 工单 05）：menu / styleForm / nodeForm /
  // linkMode 四个互斥浮层收进单个 open（负载随行），迁移与点击 / 拖拽 / Escape 的裁定
  // 全在 overlay-state.ts 的纯函数里，本 Hook 只做 store 接线与事件解析。
  const [open, setOpen] = useState<OverlayOpen>(IDLE_OPEN)
  // 事件回调里读最新值：ref 兜住
  const latest = useRef({ projection, resolver, onNodeCreated, newNodeText })
  latest.current = { projection, resolver, onNodeCreated, newNodeText }

  const menu: MenuState | null = open.kind === 'menu' ? { target: open.target, x: open.x, y: open.y } : null
  const styleForm: StyleFormState | null = open.kind === 'styleForm' ? { x: open.x, y: open.y } : null
  const nodeForm: NodeFormState | null = open.kind === 'nodeForm' ? open.form : null
  const linkMode: LinkModeState = open.kind === 'linkMode' ? open.link : { stage: 'idle' }

  const closeMenu = useCallback(() => setOpen(IDLE_OPEN), [])
  const closeStyleForm = closeMenu
  const closeNodeForm = closeMenu

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
      // state 状态节点的 composite 标志由投影补齐（menuTargetOfCanvas 是纯映射，不查投影）
      if (target !== null && target.kind === 'state-node' && proj.type === 'state') {
        target.composite = proj.state.states.find((s) => s.id === target.id)?.composite ?? false
      }
      if (target === null || contextMenuItems(target).length === 0) {
        // 无可弹项只收菜单（现状：不动已打开的表单浮层）
        setOpen((cur) => (cur.kind === 'menu' ? IDLE_OPEN : cur))
        return
      }
      selectTarget(target)
      const rect = container.getBoundingClientRect()
      // 开菜单即收起两个表单浮层（互斥浮层的 open-menu 迁移，overlay-state 裁定）
      setOpen({ kind: 'menu', target, x: e.clientX - rect.left, y: e.clientY - rect.top })
    },
    [containerRef, selectTarget],
  )

  /** 画布单击：连线模式下消费（节点 = 推进状态机，其它 = 取消）。
   * 返回 true = 事件已被连线模式吃掉，使用方应跳过选中链路。
   * 谁消费点击由 overlay-state 的 canvasClickRuling 裁定（工单 05），这里只做连线分支的事件解析。 */
  const onCanvasClick = useCallback(
    (e: React.MouseEvent): boolean => {
      if (open.kind !== 'linkMode') return false
      const { projection: proj, resolver: r } = latest.current
      const selection = proj !== null ? selectionFromEventTarget(e.target, r) : null
      const t = overlayTransition(
        { open, inlineEdit: false },
        selection !== null && selection.kind === 'node'
          ? { type: 'link-click-node', nodeId: selection.id }
          : { type: 'link-click-blank' },
      )
      setOpen(t.state.open)
      if (t.completedLink !== null) {
        // 两步完成：落码一条连线并选中它（state 落 add-transition、er 落 add-relation，
        // 其余落 flowchart add-edge）
        const { commitIntent, select } = useEditorStore.getState()
        const { from, to } = t.completedLink
        const proj = latest.current.projection
        if (proj !== null && proj.type === 'state') {
          if (commitIntent({ type: 'add-transition', from, to })) {
            select({ kind: 'state-transition', elementId: `transition:${proj.state.transitions.length + 1}` })
          }
        } else if (proj !== null && proj.type === 'er') {
          // er 关系默认 identifying `||--|{`（验收场景的基数），落码后按位置序选中
          if (commitIntent({ type: 'add-relation', from, to, cardLeft: '||', line: '--', cardRight: '|{' })) {
            select({ kind: 'er-relation', elementId: `relation:${proj.er.relations.length + 1}` })
          }
        } else if (commitIntent({ type: 'add-edge', from, to, lineStyle: 'solid', head: 'arrow' })) {
          select({ kind: 'edge', from, to, occurrence: 1 })
        }
      }
      return true
    },
    [open],
  )

  // Esc：全关（唯一一份定义在 overlay-state 的 escape 迁移：四个互斥浮层清空，
  // 内联编辑不动——它的 Esc 是输入框自己的取消路径）。监听挂容器上，画布聚焦时才触发。
  useEffect(() => {
    const container = containerRef.current
    if (container === null) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen((cur) => overlayTransition({ open: cur, inlineEdit: false }, { type: 'escape' }).state.open)
    }
    container.addEventListener('keydown', onKeyDown)
    return () => container.removeEventListener('keydown', onKeyDown)
  }, [containerRef])

  /** 进入连线模式（preselectedFrom = 「从这里连线」的预选起点）。
   * 收起菜单与两个表单浮层；动作表经 MenuActionContext.enterLinkMode 调到这里。 */
  const enterLinkMode = useCallback(
    (preselectedFrom?: string): void => {
      setOpen(overlayTransition({ open: IDLE_OPEN, inlineEdit: false }, { type: 'enter-link-mode', preselectedFrom }).state.open)
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
      // 打开表单并收起菜单（互斥浮层的 open-node-form 迁移）
      setOpen({ kind: 'nodeForm', form })
    },
    [menu],
  )

  /** 打开「添加样式」小表单（在菜单位置浮出，提交才落码） */
  const openStyleForm = useCallback((): void => {
    if (menu === null) return
    setOpen({ kind: 'styleForm', x: menu.x, y: menu.y })
  }, [menu])

  /**
   * 画布键盘编辑键（工单 05）：对**当前选中**元素打开添加表单（无右键菜单，浮层在画布内浮出）。
   * Tab/Enter 的「就近结构」在此落成具体表单——class 的加成员/加关系、sequence 的加消息，
   * 与右键菜单共用 nodeFormForTarget，**不新造浮层**。选中不是类/参与者时安静地不打开。
   */
  const openFormForSelection = useCallback(
    (kind: 'member' | 'relation' | 'message' | 'transition' | 'er-relation' | 'requirement-relation'): void => {
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
      setOpen({ kind: 'nodeForm', form })
    },
    [containerRef],
  )

  /** 提交样式表单：名称非法（空 / 含空白逗号）返回 false 不落码 */
  const submitStyleForm = useCallback((name: string, color: string): boolean => {
    const intent = addClassDefIntent({ name: name.trim(), fill: color, stroke: '', dashStyle: 'solid', color: '' })
    if (intent === null) return false
    if (!useEditorStore.getState().commitIntent(intent)) return false
    // commit 迁移：提交成功收起表单
    setOpen(IDLE_OPEN)
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
    /** 覆盖层状态机的互斥浮层（工单 05）：CanvasPanel 的点击 / 拖拽裁定表消费它 */
    open,
    menu: menu !== null ? { ...menu, items } : null,
    styleForm,
    nodeForm,
    linkMode,
    onContextMenu,
    onCanvasClick,
    closeMenu,
    /** 关闭当前互斥浮层（画布点击裁定的 close-float 落点） */
    closeFloat: closeMenu,
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
