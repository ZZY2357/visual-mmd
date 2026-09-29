import { useCallback, useEffect, useRef, useState } from 'react'
import type { AnyProjection } from '../diagram-registry'
import type { DataIdResolver } from '../canvas-selection/data-id'
import { selectionFromEventTarget } from '../canvas-selection/data-id'
import { mindmapActionIntents, nextNodeId, type MindmapActionPlan } from './canvas-keyboard'
import { addClassDefIntent } from './flowchart-forms'
import {
  deleteClassIntent,
  deleteRelationIntent,
  setRelationIntent,
  RELATION_KIND_OPTIONS,
} from './class-forms'
import {
  deleteBlockIntent,
  deleteMessageIntent,
  deleteNoteIntent,
  deleteParticipantIntent,
  setMessageIntent,
  MESSAGE_ARROW_OPTIONS,
} from './sequence-forms'
import type { CanvasInlineEditTarget } from './inline-edit'
import type { Selection } from '../projection/selection'
import {
  contextMenuItems,
  contextMenuTargetFromSelection,
  type ContextMenuItemId,
  type ContextMenuTarget,
} from './context-menu'
import { linkModeTransition, type LinkModeState } from './link-mode'
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
 *   （字段在右侧 EdgeForm 改）；
 *   删除走 delete-relation / delete-message。sequence 注释与逻辑块**顺带接上删除**
 *   （delete-note / delete-block 意图早已存在，接线成本≈0），不为其新造编辑动作。
 *   本票不新建任何表单浮层（spec 决策：画布上应是「这元素能做什么」而非又一个表单）。
 * - 添加入口补全（工单 04）：add-note / add-block 在菜单位置浮出添加型小表单——
 *   sequence 空白（注释 / 逻辑块）、sequence 参与者（逻辑块，锚点为该参与者的声明）、
 *   class 空白（浮动 note，无需目标类）、class 类节点（`note for X`，锚点为该类声明）。
 *   落码位置：有右键元素时以其声明为锚点（`afterElementId`），空白处不传锚点由管线回退到
 *   文档最后一个元素——顺序即语义，块插在用户右键的那个位置。
 * - 画布键盘编辑键（工单 05）：class 的 Tab/Enter（加成员/加关系）、sequence 的 Enter
 *   （加消息）经 openFormForSelection 打开**同一份**添加型表单（无右键菜单，浮层在画布内
 *   浮出）；锚点/预选取自当前选中。与右键菜单共用 nodeFormForTarget，不新造浮层。
 * - 所有动作复用编辑意图管线（commitIntent，可撤销）；编辑文本/新建节点经
 *   onNodeCreated 进入内联编辑（工单 05 beginEdit）。
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

/** 生成未冲突的默认名：base、base2、base3……（跳过已占用的名字）。
 * 类名/参与者 id 有引用语义（重名会让后续改名连带影响多份声明），新建时必须避重。 */
function nextFreeName(base: string, used: Iterable<string>): string {
  const taken = new Set(used)
  if (!taken.has(base)) return base
  for (let i = 2; i < 10000; i++) {
    const candidate = `${base}${i}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base}${Date.now()}` // 理论不可达的兜底
}

/** 循环取值（工单 03）：取 options 中 current 的下一项；current 不在表中时取第一项。
 * 用于连线菜单「直接改」的字段（关系类型 / 消息箭头）——不新增表单浮层就能切换取值。 */
function nextInCycle<T>(options: readonly T[], current: T): T {
  return options[(options.indexOf(current) + 1) % options.length]
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

  /** 右键目标 → 编辑器选中（属性面板联动：连线的字段编辑依赖该选中） */
  const selectTarget = useCallback((target: ContextMenuTarget): void => {
    const { select } = useEditorStore.getState()
    if (target.kind === 'flowchart-node') select({ kind: 'node', nodeId: target.nodeId })
    else if (target.kind === 'flowchart-edge')
      select({ kind: 'edge', from: target.from, to: target.to, occurrence: target.occurrence })
    else if (target.kind === 'mindmap-node') select({ kind: 'mindmap-node', elementId: target.elementId })
    else if (target.kind === 'class-node') select({ kind: 'class', name: target.name })
    else if (target.kind === 'sequence-participant') select({ kind: 'participant', actorId: target.actorId })
    else if (target.kind === 'class-relation') select({ kind: 'class-relation', elementId: target.elementId })
    else if (target.kind === 'sequence-message') select({ kind: 'message', elementId: target.elementId })
    else if (target.kind === 'sequence-note') select({ kind: 'note', elementId: target.elementId })
    else if (target.kind === 'sequence-block') select({ kind: 'block', elementId: target.elementId })
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

  // ---------- 菜单动作（复用编辑意图管线，落码可撤销） ----------

  /** 添加节点：新 id 落码后选中之并进入内联命名 */
  const addNode = useCallback((): void => {
    const proj = latest.current.projection
    if (proj === null || proj.type !== 'flowchart') return
    const nodeId = nextNodeId(proj.flowchart.nodes.map((n) => n.nodeId))
    if (!useEditorStore.getState().commitIntent({ type: 'add-node', nodeId, text: nodeId, shape: 'rectangle' })) return
    useEditorStore.getState().select({ kind: 'node', nodeId })
    latest.current.onNodeCreated?.({ kind: 'flowchart', nodeId })
    closeMenu()
  }, [closeMenu])

  /** class 空白处：新建类（默认名「新类」）→ 选中并进入内联命名（类名）。
   * 空 classDiagram（画布停在解析错误态）同样可用：管线在表头后落一行 `class 新类`，
   * 源码随之合法。不传 afterElementId → 回退到文档最后一个元素（只有表头时即表头）。 */
  const addClass = useCallback((): void => {
    const proj = latest.current.projection
    if (proj === null || proj.type !== 'class') return
    const name = nextFreeName('新类', proj.class.classes.map((c) => c.name))
    if (!useEditorStore.getState().commitIntent({ type: 'add-class', name })) return
    useEditorStore.getState().select({ kind: 'class', name })
    latest.current.onNodeCreated?.({ kind: 'class', name })
    closeMenu()
  }, [closeMenu])

  /** sequence 空白处：新建参与者（默认名「新参与者」，不生成 alias）→ 选中并进入
   * 内联命名（参与者 id）。不传 afterElementId → 回退到文档最后一个元素。 */
  const addParticipant = useCallback((): void => {
    const proj = latest.current.projection
    if (proj === null || proj.type !== 'sequence') return
    const actorId = nextFreeName('新参与者', proj.sequence.participants.map((p) => p.actorId))
    if (!useEditorStore.getState().commitIntent({ type: 'add-participant', actorId })) return
    useEditorStore.getState().select({ kind: 'participant', actorId })
    latest.current.onNodeCreated?.({ kind: 'sequence', actorId })
    closeMenu()
  }, [closeMenu])

  /** mindmap 空白处：新建根节点（空文档即是第一个根）→ 选中并进入内联命名（显示文本）。
   * 空文档走 add-child（无父）→ 管线在表头后建根，elementId 必为 mindmap-node:1；
   * 非空时挂到根节点下（与「缺省父节点」的管线语义一致），末节点序号 + 2。 */
  const addMindmapRoot = useCallback((): void => {
    const proj = latest.current.projection
    if (proj === null || proj.type !== 'mindmap') return
    const text = latest.current.newNodeText
    const roots = proj.mindmap.nodes
    let plan: MindmapActionPlan | null
    if (roots.length === 0) {
      plan = { intents: [{ type: 'add-child', text }], newElementId: 'mindmap-node:1' }
    } else {
      plan = mindmapActionIntents(proj.mindmap, roots[0].elementId, 'add-child', text)
    }
    if (plan === null) return
    const { commitIntent, select } = useEditorStore.getState()
    for (const intent of plan.intents) {
      if (!commitIntent(intent)) return
    }
    if (plan.newElementId !== null) {
      select({ kind: 'mindmap-node', elementId: plan.newElementId })
      latest.current.onNodeCreated?.({ kind: 'mindmap', elementId: plan.newElementId })
    }
    closeMenu()
  }, [closeMenu])

  /** 进入连线模式（preselectedFrom = 「从这里连线」的预选起点） */
  const enterLinkMode = useCallback(
    (preselectedFrom?: string): void => {
      setMenu(null)
      setStyleForm(null)
      setNodeForm(null)
      setLinkMode(linkModeTransition({ stage: 'idle' }, { type: 'enter', preselectedFrom }).state)
    },
    [],
  )

  /** 添加子图（flowchart）：空标题落码 `subgraph` + `end` 两行 */
  const addSubgraph = useCallback((): void => {
    useEditorStore.getState().commitIntent({ type: 'add-subgraph' })
    closeMenu()
  }, [closeMenu])

  /** 应用样式到右键节点：apply-class 落码为独立 class 语句（工单 02 管线） */
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

  const addMember = useCallback(() => openNodeForm('member'), [openNodeForm])
  const addRelation = useCallback(() => openNodeForm('relation'), [openNodeForm])
  const addMessage = useCallback(() => openNodeForm('message'), [openNodeForm])
  const addNote = useCallback(() => openNodeForm('note'), [openNodeForm])
  const addBlock = useCallback(() => openNodeForm('block'), [openNodeForm])

  /** 删除右键目标（节点/连线/mindmap 节点/类/参与者/位置序连线与块级元素） */
  const deleteTarget = useCallback((): void => {
    const target = menu?.target
    if (target === undefined) return
    const { commitIntent, select } = useEditorStore.getState()
    if (target.kind === 'flowchart-node') commitIntent({ type: 'delete-node', nodeId: target.nodeId })
    else if (target.kind === 'flowchart-edge')
      commitIntent({ type: 'delete-edge', from: target.from, to: target.to, occurrence: target.occurrence })
    else if (target.kind === 'mindmap-node') commitIntent({ type: 'delete-node', elementId: target.elementId })
    else if (target.kind === 'class-node') commitIntent(deleteClassIntent(target.name))
    else if (target.kind === 'sequence-participant') commitIntent(deleteParticipantIntent(target.actorId))
    else if (target.kind === 'class-relation') commitIntent(deleteRelationIntent(target.elementId))
    else if (target.kind === 'sequence-message') commitIntent(deleteMessageIntent(target.elementId))
    else if (target.kind === 'sequence-note') commitIntent(deleteNoteIntent(target.elementId))
    else if (target.kind === 'sequence-block') commitIntent(deleteBlockIntent(target.elementId))
    select(null)
    closeMenu()
  }, [menu, closeMenu])

  /** class 关系边：循环切换关系类型（set-relation 的 kind，直接改，不弹表单）。
   * 菜单保持打开，便于连点切到想要的那种；每次切换是一次独立快照（可撤销）。 */
  const cycleRelationKind = useCallback((): void => {
    const target = menu?.target
    const proj = latest.current.projection
    if (target === undefined || target.kind !== 'class-relation' || proj === null || proj.type !== 'class') return
    const relation = proj.class.relations.find((r) => r.elementId === target.elementId)
    if (relation === undefined) return
    useEditorStore
      .getState()
      .commitIntent(setRelationIntent(target.elementId, { kind: nextInCycle(RELATION_KIND_OPTIONS, relation.kind) }))
  }, [menu])

  /**
   * 编辑类菜单项的语义（工单 05 定案 D5，工单 06 补上 flowchart 连线）：**选中该连线 + 关闭菜单**，
   * 字段编辑在右侧属性面板完成（ADR-0001 表单驱动编辑 + CONTEXT.md：属性面板是选中元素属性
   * 表单的入口）。
   *
   * 改动前 `editRelation` / `editMessage` / `beginEditLabel` 的函数体都只有 `closeMenu()`
   * ——菜单项自身是个空动作，选中靠右键时的联动隐式成立（U1 的 Middle Man 气味，也是
   * 「点了没反应」错觉的来源）。现在选中由菜单项自己确认：属性面板拿到哪条连线不依赖
   * 「右键顺带选中过」这一隐式前提。三个菜单项 id 各自存在是因为目标种类不同
   * （见 `contextMenuItems`），语义则共用这一份。
   */
  const selectMenuTargetAndClose = useCallback((): void => {
    const target = menu?.target
    if (target !== undefined) selectTarget(target)
    closeMenu()
  }, [menu, selectTarget, closeMenu])

  /** sequence 消息：循环切换箭头（set-message 的 arrow，直接改，不弹表单）。菜单保持打开。 */
  const cycleMessageArrow = useCallback((): void => {
    const target = menu?.target
    const proj = latest.current.projection
    if (target === undefined || target.kind !== 'sequence-message' || proj === null || proj.type !== 'sequence') return
    const message = proj.sequence.messages.find((m) => m.elementId === target.elementId)
    if (message === undefined) return
    useEditorStore
      .getState()
      .commitIntent(setMessageIntent(target.elementId, { arrow: nextInCycle(MESSAGE_ARROW_OPTIONS, message.arrow) }))
  }, [menu])

  /** mindmap 添加子节点：落码后选中新节点并进入内联命名 */
  const addChildToMindmap = useCallback((): void => {
    const target = menu?.target
    const proj = latest.current.projection
    if (target === undefined || target.kind !== 'mindmap-node' || proj === null || proj.type !== 'mindmap') return
    const plan = mindmapActionIntents(proj.mindmap, target.elementId, 'add-child', latest.current.newNodeText)
    if (plan === null) return
    const { commitIntent, select } = useEditorStore.getState()
    for (const intent of plan.intents) {
      if (!commitIntent(intent)) return
    }
    if (plan.newElementId !== null) {
      select({ kind: 'mindmap-node', elementId: plan.newElementId })
      latest.current.onNodeCreated?.({ kind: 'mindmap', elementId: plan.newElementId })
    }
    closeMenu()
  }, [menu, closeMenu])

  /** 编辑文本（菜单项）：进入内联编辑（预填当前显示文本） */
  const beginEditText = useCallback((): void => {
    const target = menu?.target
    if (target === undefined) return
    if (target.kind === 'flowchart-node') latest.current.onNodeCreated?.({ kind: 'flowchart', nodeId: target.nodeId })
    else if (target.kind === 'mindmap-node')
      latest.current.onNodeCreated?.({ kind: 'mindmap', elementId: target.elementId })
    closeMenu()
  }, [menu, closeMenu])

  /** 打开「添加样式」小表单（在菜单位置浮出，提交才落码） */
  const openStyleForm = useCallback((): void => {
    if (menu === null) return
    setStyleForm({ x: menu.x, y: menu.y })
    setMenu(null)
  }, [menu])

  /** 提交样式表单：名称非法（空 / 含空白逗号）返回 false 不落码 */
  const submitStyleForm = useCallback((name: string, color: string): boolean => {
    const intent = addClassDefIntent({ name: name.trim(), fill: color, stroke: '', dashStyle: 'solid', color: '' })
    if (intent === null) return false
    if (!useEditorStore.getState().commitIntent(intent)) return false
    setStyleForm(null)
    return true
  }, [])

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
    openFormForSelection,
    submitStyleForm,
    addNode,
    addClass,
    addParticipant,
    addMindmapRoot,
    addMember,
    addRelation,
    addMessage,
    addNote,
    addBlock,
    enterLinkMode,
    addSubgraph,
    applyStyle,
    deleteTarget,
    addChildToMindmap,
    beginEditText,
    openStyleForm,
    cycleRelationKind,
    // D5（工单 05，工单 06 补 flowchart 连线）：三个编辑类菜单项共用「选中该连线 + 关闭菜单」
    // 这一个语义（id 不同是因为目标种类不同：flowchart 连线 / class 关系 / sequence 消息）
    beginEditLabel: selectMenuTargetAndClose,
    editRelation: selectMenuTargetAndClose,
    cycleMessageArrow,
    editMessage: selectMenuTargetAndClose,
  }
}
