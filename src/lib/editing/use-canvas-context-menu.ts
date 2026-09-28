import { useCallback, useEffect, useRef, useState } from 'react'
import type { AnyProjection } from '../diagram-registry'
import type { DataIdResolver } from '../canvas-selection/data-id'
import { selectionFromEventTarget } from '../canvas-selection/data-id'
import { mindmapActionIntents, nextNodeId, type MindmapActionPlan } from './canvas-keyboard'
import { addClassDefIntent } from './flowchart-forms'
import type { CanvasInlineEditTarget } from './inline-edit'
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
 *   经 data-id 解析右键目标；无菜单可弹（如 sequence 节点）安静关闭。
 * - 空白菜单（工单 04）：flowchart 添加节点 / 连线模式 / 添加样式 / 添加子图；
 *   class 添加类 / sequence 添加参与者 / mindmap 添加根节点。空图（含空 classDiagram
 *   的错误态）同样可弹。新建元素落码后选中并进入内联命名（复用工单 05 的 beginEdit）。
 * - 落码位置：空白处没有锚点元素，不传 afterElementId，由各管线回退到文档最后一个
 *   元素（只有表头的文档即表头），新行因此落在图的开头之后。
 * - 连线模式：光标十字，依次单击起点、终点即 add-edge 落码；Esc / 点击空白取消；
 *   节点右键「从这里连线」带预选起点省一步。
 * - 添加样式：菜单位置浮出小表单（名称 + 颜色），提交才经 add-classdef 落码。
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
  const [linkMode, setLinkMode] = useState<LinkModeState>({ stage: 'idle' })
  // 事件回调里读最新值：ref 兜住
  const latest = useRef({ projection, resolver, onNodeCreated, newNodeText })
  latest.current = { projection, resolver, onNodeCreated, newNodeText }

  const closeMenu = useCallback(() => setMenu(null), [])
  const closeStyleForm = useCallback(() => setStyleForm(null), [])

  /** 右键目标 → 编辑器选中（属性面板联动，编辑标签依赖 EdgeForm） */
  const selectTarget = useCallback((target: ContextMenuTarget): void => {
    const { select } = useEditorStore.getState()
    if (target.kind === 'flowchart-node') select({ kind: 'node', nodeId: target.nodeId })
    else if (target.kind === 'flowchart-edge')
      select({ kind: 'edge', from: target.from, to: target.to, occurrence: target.occurrence })
    else if (target.kind === 'mindmap-node') select({ kind: 'mindmap-node', elementId: target.elementId })
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
      setMenu({ target, x: e.clientX - rect.left, y: e.clientY - rect.top })
    },
    [containerRef, closeMenu, closeStyleForm, selectTarget],
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

  /** 删除右键目标（节点/连线/mindmap 节点） */
  const deleteTarget = useCallback((): void => {
    const target = menu?.target
    if (target === undefined) return
    const { commitIntent, select } = useEditorStore.getState()
    if (target.kind === 'flowchart-node') commitIntent({ type: 'delete-node', nodeId: target.nodeId })
    else if (target.kind === 'flowchart-edge')
      commitIntent({ type: 'delete-edge', from: target.from, to: target.to, occurrence: target.occurrence })
    else if (target.kind === 'mindmap-node') commitIntent({ type: 'delete-node', elementId: target.elementId })
    select(null)
    closeMenu()
  }, [menu, closeMenu])

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

  /** 编辑标签（连线菜单项）：右键时已选中该连线，关闭菜单即可在 EdgeForm 编辑 */
  const beginEditLabel = useCallback((): void => {
    closeMenu()
  }, [closeMenu])

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
    linkMode,
    onContextMenu,
    onCanvasClick,
    closeMenu,
    closeStyleForm,
    submitStyleForm,
    addNode,
    addClass,
    addParticipant,
    addMindmapRoot,
    enterLinkMode,
    addSubgraph,
    applyStyle,
    deleteTarget,
    addChildToMindmap,
    beginEditText,
    beginEditLabel,
    openStyleForm,
  }
}
