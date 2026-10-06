import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditorStore } from '../../store/editor'
import type { AnyProjection } from '../diagram-registry'
import { mindmapDomIdOf } from '../canvas-selection/mindmap-adapter'
import { parseKanbanCardElementId, parseKanbanColumnElementId } from '../pipeline/element-id'
import type { DataIdResolver } from '../canvas-selection/data-id'
import type { ViewState } from '../canvas-view/view-state'
import {
  inlineEditCommitOf,
  inlineEditKindOf,
  inlineEditTargetFromEvent,
  overlayRectInContainer,
  toRect,
  type CanvasInlineEditTarget,
  type Rect,
} from './inline-edit'

/**
 * 内联编辑 Hook（工单 05）：管理「正在编辑哪个节点 + 浮层在哪」的状态机。
 *
 * 进入：双击节点（flowchart/class/sequence 走 data-id，mindmap 按文本匹配）或
 * onNodeCreated（工单 04 占位接线：Tab/Enter 新建节点后立即命名）。
 * 结束：回车/失焦提交（commitIntent 手术式落码，可撤销），Esc 取消。
 *
 * 浮层定位：编辑目标对应的 SVG 元素 getBoundingClientRect 相对画布容器换算
 * （视图变换已反映在包围盒里）；SVG 重渲染或视图变化时重算，新建节点落码后
 * 等下一次 SVG 到位自动补上定位。
 *
 * 焦点归还（工单 02，ADR-0010）：Enter/Esc 结束编辑后把焦点还给画布容器，使
 * Tab/Enter/Delete 立即可用于连续操作；失焦提交（点到画布之外）不归还。
 */

interface EditingState {
  target: CanvasInlineEditTarget
  /** 浮层相对画布容器的位置；null = SVG 中还没找到该元素（等待重渲染） */
  rect: Rect | null
}

/** 关闭编辑的来源（工单 02）：keydown 提交（Enter/Esc）归还焦点，失焦提交不归还 */
export interface InlineEditCloseOptions {
  /** true = 关闭后把焦点归还画布容器；省略 = 不归还（用户已把注意力移出画布） */
  restoreFocus?: boolean
}

/** 编辑目标在投影中的当前文本（预填用；找不到时回落空串）。
 * class 编辑类名（语法名即显示文本）；sequence 空白新建编辑参与者 id，双击既有参与者
 * 编辑 `as` 显示别名（无别名时空串）。导出给画布组件：渲染输入框时取最新投影文本。 */
export function inlineEditTextOf(projection: AnyProjection | null, target: CanvasInlineEditTarget): string {
  if (projection === null) return ''
  if (projection.type === 'flowchart' && target.kind === 'flowchart') {
    return projection.flowchart.nodes.find((n) => n.nodeId === target.nodeId)?.text ?? target.nodeId
  }
  if (projection.type === 'mindmap' && target.kind === 'mindmap') {
    return projection.mindmap.nodes.find((n) => n.elementId === target.elementId)?.text ?? ''
  }
  if (projection.type === 'class' && target.kind === 'class') {
    return projection.class.classes.find((c) => c.name === target.name)?.name ?? target.name
  }
  if (projection.type === 'sequence' && target.kind === 'sequence') {
    return projection.sequence.participants.find((p) => p.actorId === target.actorId)?.actorId ?? target.actorId
  }
  if (projection.type === 'sequence' && target.kind === 'sequence-alias') {
    return projection.sequence.participants.find((p) => p.actorId === target.actorId)?.alias ?? ''
  }
  if (projection.type === 'state' && target.kind === 'state') {
    // state 双击编辑的是描述段：无描述状态预填空串（输入即新增描述）
    return projection.state.states.find((s) => s.id === target.id)?.desc ?? ''
  }
  if (projection.type === 'er' && target.kind === 'er') {
    // er 双击编辑的是别名：无别名实体预填空串（输入即新增别名）
    return projection.er.entities.find((e) => e.name === target.name)?.alias ?? ''
  }
  if (projection.type === 'kanban' && target.kind === 'kanban-card') {
    return projection.kanban.cards.find((c) => c.elementId === target.elementId)?.description ?? ''
  }
  if (projection.type === 'kanban' && target.kind === 'kanban-column') {
    return projection.kanban.columns.find((c) => c.elementId === target.elementId)?.title ?? ''
  }
  if (projection.type === 'requirement' && target.kind === 'requirement') {
    // requirement 双击编辑的是 text 字段（more-diagrams 工单 07）：无 text 字段预填空串
    //（输入即新增字段行；清空字段 = 删字段行，走右侧属性表单）
    return projection.requirement.requirements.find((r) => r.name === target.name)?.text ?? ''
  }
  if (projection.type === 'block' && target.kind === 'block-node') {
    // block 双击编辑的是标签（more-diagrams 工单 09）：无标签节点预填语法 id
    return projection.block.nodes.find((n) => n.id === target.id)?.label ?? target.id
  }
  if (projection.type === 'gantt' && target.kind === 'gantt-task') {
    // gantt 双击编辑的是任务名（more-diagrams 工单 11）：按位置序 elementId 取投影现名
    return projection.gantt.tasks.find((task) => task.elementId === target.elementId)?.name ?? ''
  }
  if (projection.type === 'quadrant' && target.kind === 'quadrant-point') {
    // quadrant 双击编辑的是点文本（more-diagrams 工单 12）
    return projection.quadrant.points.find((p) => p.elementId === target.elementId)?.text ?? ''
  }
  if (projection.type === 'packet' && target.kind === 'packet-field') {
    // packet 双击编辑的是字段名（more-diagrams 工单 16）
    return projection.packet.fields.find((f) => f.elementId === target.elementId)?.name ?? ''
  }
  if (projection.type === 'xychart' && target.kind === 'xychart-series') {
    // xychart 双击编辑的是系列名（more-diagrams 工单 14）：未命名系列预填空串（输入即命名）
    return projection.xychart.series.find((s) => s.elementId === target.elementId)?.name ?? ''
  }
  if (projection.type === 'radar' && target.kind === 'radar-axis') {
    // radar 双击编辑的是轴 label（more-diagrams 工单 15）：展示文本 = label ?? id
    // （mermaid db 语义 label ?? name）——无 label 轴预填 id，改完即创建 label
    const axis = projection.radar.axes.find((a) => a.elementId === target.elementId)
    return axis !== undefined ? (axis.label ?? axis.id) : ''
  }
  if (projection.type === 'architecture' && target.kind === 'architecture') {
    // architecture 双击编辑的是标题（more-diagrams 工单 17）：无标题预填 id 的回落由
    // findMindmapElement 的回落路径承担不了——这里如实预填语法 id（与新块节点同口径）
    return target.elementKind === 'service'
      ? (projection.architecture.services.find((s) => s.id === target.id)?.title ?? target.id)
      : (projection.architecture.groups.find((g) => g.id === target.id)?.title ?? target.id)
  }
  return ''
}

/** 找文本内容等于给定文本的最深元素（旧版 mindmap 定位方式，保留为回落路径） */
function findMindmapTextElement(root: Element, text: string): Element | null {
  let deepest: Element | null = null
  for (const el of root.querySelectorAll('*')) {
    if ((el.textContent?.trim() ?? '') !== text) continue
    if (deepest === null || deepest.contains(el)) deepest = el
  }
  return deepest
}

/** mindmap：优先按 DOM id 定位（工单 06：节点 g id 含 `node_{N-1}`，与选中一致；
 * 工单 08：mermaid v12 的 id 带 svgId 前缀，按后缀回查），
 * 渲染产物不带该 id 时回落找文本内容等于给定文本的最深元素（其包围盒即标签位置） */
function findMindmapElement(root: Element, elementId: string, text: string): Element | null {
  const domId = mindmapDomIdOf(elementId)
  if (domId !== null) {
    const el =
      root.querySelector(`[id="${CSS.escape(domId)}"]`) ??
      root.querySelector(`[id$="-${CSS.escape(domId)}"]`)
    if (el !== null) return el
  }
  return text === '' ? null : findMindmapTextElement(root, text)
}

/** radar：在轴标签 class（`text.radarAxisLabel`）里按可见文本定位——渲染器不给
 * radar 任何 id / data-id（工单 15），class + 文本是唯一可用锚点 */
function findRadarAxisLabelElement(root: Element, text: string): Element | null {
  if (text === '') return null
  for (const el of root.querySelectorAll('text.radarAxisLabel, .radarAxisLabel')) {
    if ((el.textContent?.trim() ?? '') === text) return el
  }
  return null
}

/** 在渲染 SVG 中定位编辑目标的元素：flowchart/class/sequence 按 data-id（四者的
 * data-id 分别是节点 id / 类名 / 参与者 id，见 CanvasPanel 的 resolverOf），
 * mindmap 按 DOM id（回落文本），radar 轴按 class + 文本。 */
function findTargetElement(root: Element, target: CanvasInlineEditTarget, text: string): Element | null {
  if (
    target.kind === 'flowchart' ||
    target.kind === 'class' ||
    target.kind === 'sequence' ||
    target.kind === 'sequence-alias'
  ) {
    // 'sequence' 与 'sequence-alias' 的 data-id 都是参与者 id（actorId 不变，改的是别名）
    const dataId =
      target.kind === 'flowchart' ? target.nodeId : target.kind === 'class' ? target.name : target.actorId
    // sequence（gui-test-2026-10-03 工单 01）：mermaid 序列图渲染器给**两个**元素写
    // `data-id = actorId`——贯穿全程的生命线 `line.actor-line`（data-et="life-line"，
    // 宽 0.5px）与参与者框 `g.actor`（data-et="participant"）。文档序生命线在前，
    // 取首个命中会拿到细长竖条（浮层叠在生命线上、文字被裁剪）。
    // 故 sequence 目标优先取非生命线命中（参与者框），仅生命线可寻址时回落。
    const isSequence = target.kind === 'sequence' || target.kind === 'sequence-alias'
    let lifeline: Element | null = null
    for (const el of root.querySelectorAll('[data-id]')) {
      if (el.getAttribute('data-id') !== dataId) continue
      if (isSequence && el.getAttribute('data-et') === 'life-line') {
        lifeline ??= el
        continue
      }
      return el
    }
    return lifeline
  }
  if (target.kind === 'state') {
    // state 的 data-id 即状态 id（渲染后处理从 DOM id 反注，more-diagrams 工单 02）
    for (const el of root.querySelectorAll('[data-id]')) {
      if (el.getAttribute('data-id') === target.id) return el
    }
    return null
  }
  if (target.kind === 'er') {
    // er 的 data-id 即实体名（渲染后处理从 DOM id `entity-{名}-{n}` 反注，工单 03）
    for (const el of root.querySelectorAll('[data-id]')) {
      if (el.getAttribute('data-id') === target.name) return el
    }
    return null
  }
  if (target.kind === 'kanban-card' || target.kind === 'kanban-column') {
    // kanban 的 data-id 即节点 id（渲染后处理从 `.sections` / `.items` 内的 DOM id 反注，
    // more-diagrams 工单 06）；elementId 形如 `kanban-card:<id>`，取回节点 id 寻址
    const parsed =
      target.kind === 'kanban-card'
        ? parseKanbanCardElementId(target.elementId)
        : parseKanbanColumnElementId(target.elementId)
    if (parsed === null) return null
    for (const el of root.querySelectorAll('[data-id]')) {
      if (el.getAttribute('data-id') === parsed.id) return el
    }
    return null
  }
  if (target.kind === 'requirement') {
    // requirement 的 data-id 即节点名字（渲染后处理从 DOM id `{svgId}-{名}` 反注，工单 07；
    // 同名 element 让位 requirement，与点选消歧同口径）
    for (const el of root.querySelectorAll('[data-id]')) {
      if (el.getAttribute('data-id') === target.name) return el
    }
    return null
  }
  if (target.kind === 'block-node') {
    // block 的 data-id 即语法 id（渲染后处理从 `g.block` 内的 DOM id 反注，工单 09）
    for (const el of root.querySelectorAll('[data-id]')) {
      if (el.getAttribute('data-id') === target.id) return el
    }
    return null
  }
  if (target.kind === 'gantt-task') {
    // gantt 的 data-id = mermaid 渲染 id（taskId，渲染后处理从 DOM id `<svgId>-<taskId>`
    // 反注，more-diagrams 工单 11）；双击目标里已带（closestDataId 取原文），直接等值匹配。
    // 任务条 rect 与任务文本 text 反注后同 data-id，命中任一即可（包围盒取先到者）
    for (const el of root.querySelectorAll('[data-id]')) {
      if (el.getAttribute('data-id') === target.taskId) return el
    }
    return null
  }
  if (target.kind === 'quadrant-point') {
    // quadrant 点的 data-id 即投影 elementId `point:N`（渲染后按位置序反注，工单 12；
    // DOM 序与源码序相反由反注方换算，寻址只认 data-id 值）
    for (const el of root.querySelectorAll('[data-id]')) {
      if (el.getAttribute('data-id') === target.elementId) return el
    }
    return null
  }
  if (target.kind === 'packet-field') {
    // packet 字段的 data-id 即投影 elementId `field:N`（渲染后按 start-bit 映射反注，
    // 工单 16；跨行拆块的多个元素同 data-id，取第一个命中者——浮层定位用）
    for (const el of root.querySelectorAll('[data-id]')) {
      if (el.getAttribute('data-id') === target.elementId) return el
    }
    return null
  }
  if (target.kind === 'xychart-series') {
    // xychart 的系列 data-id 即位置序 elementId（渲染后处理从 `g.plot` 内类名序号反注，工单 14）
    for (const el of root.querySelectorAll('[data-id]')) {
      if (el.getAttribute('data-id') === target.elementId) return el
    }
    return null
  }
  if (target.kind === 'radar-axis') {
    // radar 的轴标签无 data-id：按展示文本在 `radarAxisLabel` class 内匹配（工单 15）
    return findRadarAxisLabelElement(root, text)
  }
  if (target.kind === 'architecture') {
    // architecture 的节点 data-id 即源码 id（渲染后处理从 `-service-` / `-node-` / `-group-`
    // 词元的 DOM id 反注，more-diagrams 工单 17）
    for (const el of root.querySelectorAll('[data-id]')) {
      if (el.getAttribute('data-id') === target.id) return el
    }
    return null
  }
  return findMindmapElement(root, target.elementId, text)
}

export interface CanvasInlineEditOptions {
  projection: AnyProjection | null
  /** 图种提供的 data-id resolver；null = 该图种不做双击寻址（mindmap 传 () => null 走文本匹配）。
   * 四图种都传真实 resolver：class 的 data-id 由渲染后处理反注（工单 09），sequence 参与者
   * 的 data-id 即 actorId。 */
  resolver: DataIdResolver | null
  /** 最近一次合法渲染的 SVG 字符串：换新即尝试重算浮层定位 */
  svg: string | null
  /** 画布容器（浮层定位与双击监听的宿主） */
  containerRef: React.RefObject<HTMLElement | null>
  /** 视图状态：缩放/平移变化时重算浮层定位 */
  view: ViewState | null
}

export function useCanvasInlineEdit({ projection, resolver, svg, containerRef, view }: CanvasInlineEditOptions) {
  const [editing, setEditing] = useState<EditingState | null>(null)
  // 提交/定位要读最新的 projection，事件回调里用 ref 兜住
  const latestRef = useRef({ projection, editing })
  latestRef.current = { projection, editing }
  // 编辑是否仍在进行（与渲染解耦的同步标记）：Enter 提交会卸载输入框，若卸载前
  // 焦点被移走而触发 onBlur，会拿着同一份旧状态二次提交，这里把它挡掉
  const editingActiveRef = useRef(false)
  // IME 组合状态（工单 06）：输入框的 keydown/blur 由渲染方转成 commit/cancel 调用，
  // 事件本身到不了本 hook，故在画布容器上跟踪 compositionstart/end（组合事件会从
  // 输入框冒泡到容器）。组合期间收到的提交/取消一律忽略——Enter 只是确认候选词、
  // Esc 只是打断 IME，都不是「结束内联编辑」。
  const composingRef = useRef(false)

  // 组合状态跟踪（工单 06）：挂在画布容器上，与输入框同宿主
  useEffect(() => {
    const container = containerRef.current
    if (container === null) return
    const onCompositionStart = () => {
      composingRef.current = true
    }
    const onCompositionEnd = () => {
      composingRef.current = false
    }
    container.addEventListener('compositionstart', onCompositionStart)
    container.addEventListener('compositionend', onCompositionEnd)
    return () => {
      container.removeEventListener('compositionstart', onCompositionStart)
      container.removeEventListener('compositionend', onCompositionEnd)
    }
  }, [containerRef])

  /** 进入编辑：预填文本在渲染时从投影取（新建元素落码后投影才到位） */
  const beginEdit = useCallback((target: CanvasInlineEditTarget) => {
    editingActiveRef.current = true
    setEditing({ target, rect: null })
  }, [])

  // 浮层定位：目标/SVG/视图变化时重算；找不到元素保持 null（输入框暂居默认位置）
  const editingTarget = editing?.target ?? null
  useEffect(() => {
    if (editingTarget === null) return
    const container = containerRef.current
    if (container === null) return
    const text = inlineEditTextOf(projection, editingTarget)
    const el = svg === null ? null : findTargetElement(container, editingTarget, text)
    if (el === null) {
      setEditing((cur) => (cur !== null ? { ...cur, rect: null } : cur))
      return
    }
    const rect = overlayRectInContainer(
      toRect(container.getBoundingClientRect()),
      toRect(el.getBoundingClientRect()),
    )
    setEditing((cur) => (cur !== null ? { ...cur, rect } : cur))
  }, [editingTarget, svg, view, projection, containerRef])

  /** 双击进入编辑（挂到画布容器 onDoubleClick）：kind 随图种（四图种）——
   * mindmap 画布点选启用后节点命中走 resolver（DOM id 精确匹配），文本匹配保留为回落；
   * class 命中类名文本 → 改类名；sequence 命中参与者 → 改 `as` 别名（都是"只改显示文本"）。 */
  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const mindmapNodes = projection?.type === 'mindmap' ? projection.mindmap.nodes : []
      const radarAxes =
        projection?.type === 'radar'
          ? projection.radar.axes.map((a) => ({ text: a.label ?? a.id, elementId: a.elementId }))
          : []
      // kind 随图种查表（工单 07：未接双击的图种按 flowchart 兜底，安静地不进入编辑）
      const kind = inlineEditKindOf(projection?.type ?? '')
      const target = inlineEditTargetFromEvent(e.target, resolver, mindmapNodes, kind, radarAxes)
      if (target === null) return
      e.preventDefault()
      beginEdit(target)
    },
    [projection, resolver, beginEdit],
  )

  /** 关闭编辑状态，并按需把焦点归还画布容器（工单 02，ADR-0010）。
   *
   * 归还放微任务：本次提交会让输入框卸载，React 19 不会把焦点还给已移除的元素
   * （焦点落到 `<body>`，而 keydown 挂在容器上，事件从此到不了容器）；等这次提交
   * 引发的重渲染落定后再聚焦容器，才不会被随后的卸载动作冲掉。 */
  const closeEditing = useCallback(
    (restoreFocus: boolean): void => {
      editingActiveRef.current = false
      setEditing(null)
      if (!restoreFocus) return
      queueMicrotask(() => containerRef.current?.focus())
    },
    [containerRef],
  )

  /** 回车：提交（落码改文本）并关闭；未改动/清空只关闭不落码。
   * options.restoreFocus = true（Enter 路径）→ 焦点归还容器，Tab/Enter 可连续用；
   * 失焦提交（onBlur 路径）不传 → 不归还，否则会把用户从代码面板拽回画布。
   *
   * IME 组合期间（工单 06）直接忽略：确认候选词的 Enter 与打断 IME 的 Esc 会经
   * 输入框的 keydown/blur 走到这里，此时提交会把半截拼音写进源码。 */
  const commit = useCallback(
    (text: string, options?: InlineEditCloseOptions): void => {
      if (!editingActiveRef.current) return
      if (composingRef.current) return
      const { editing: cur, projection: proj } = latestRef.current
      if (cur !== null) {
        const result = inlineEditCommitOf(cur.target, text, inlineEditTextOf(proj, cur.target))
        if (result.action === 'commit') useEditorStore.getState().commitIntent(result.intent, 'canvas')
      }
      closeEditing(options?.restoreFocus === true)
    },
    [closeEditing],
  )

  /** Esc：取消（不落码），同样归还焦点（取消后仍要继续在画布上操作）。
   * IME 组合期间（工单 06）忽略：Esc 只是打断 IME（compositionend 携带丢弃的缓冲），
   * 不应连内联编辑一起关掉。 */
  const cancel = useCallback((): void => {
    if (!editingActiveRef.current) return
    if (composingRef.current) return
    closeEditing(true)
  }, [closeEditing])

  // 双击定位要等浏览器原生 dblclick；编辑期间屏蔽背景拖拽由使用方按 editing 判断
  return { editing, onDoubleClick, beginEdit, commit, cancel }
}
