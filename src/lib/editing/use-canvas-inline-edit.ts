import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditorStore } from '../../store/editor'
import type { AnyProjection } from '../diagram-registry'
import type { DataIdResolver } from '../canvas-selection/data-id'
import type { ViewState } from '../canvas-view/view-state'
import {
  inlineEditCommitOf,
  inlineEditTargetFromEvent,
  overlayRectInContainer,
  toRect,
  type InlineEditTarget,
  type Rect,
} from './inline-edit'

/**
 * 内联编辑 Hook（工单 05）：管理「正在编辑哪个节点 + 浮层在哪」的状态机。
 *
 * 进入：双击节点（flowchart 走 data-id，mindmap 按文本匹配）或 onNodeCreated
 * （工单 04 占位接线：Tab/Enter 新建节点后立即命名）。
 * 结束：回车/失焦提交（commitIntent 手术式落码，可撤销），Esc 取消。
 *
 * 浮层定位：编辑目标对应的 SVG 元素 getBoundingClientRect 相对画布容器换算
 * （视图变换已反映在包围盒里）；SVG 重渲染或视图变化时重算，新建节点落码后
 * 等下一次 SVG 到位自动补上定位。
 */

interface EditingState {
  target: InlineEditTarget
  /** 浮层相对画布容器的位置；null = SVG 中还没找到该节点（等待重渲染） */
  rect: Rect | null
}

/** 编辑目标在投影中的当前显示文本（预填用；找不到时回落空串）。
 * 导出给画布组件：渲染输入框时取最新投影文本（新建节点的文本落码后才可见）。 */
export function inlineEditTextOf(projection: AnyProjection | null, target: InlineEditTarget): string {
  if (projection === null) return ''
  if (projection.type === 'flowchart' && target.kind === 'flowchart') {
    return projection.flowchart.nodes.find((n) => n.nodeId === target.nodeId)?.text ?? target.nodeId
  }
  if (projection.type === 'mindmap' && target.kind === 'mindmap') {
    return projection.mindmap.nodes.find((n) => n.elementId === target.elementId)?.text ?? ''
  }
  return ''
}

/** mindmap 节点没有 data-id：找文本内容等于给定文本的最深元素（其包围盒即标签位置） */
function findMindmapTextElement(root: Element, text: string): Element | null {
  let deepest: Element | null = null
  for (const el of root.querySelectorAll('*')) {
    if ((el.textContent?.trim() ?? '') !== text) continue
    if (deepest === null || deepest.contains(el)) deepest = el
  }
  return deepest
}

/** 在渲染 SVG 中定位编辑目标的元素：flowchart 按 data-id，mindmap 按可见文本 */
function findTargetElement(root: Element, target: InlineEditTarget, text: string): Element | null {
  if (target.kind === 'flowchart') {
    for (const el of root.querySelectorAll('[data-id]')) {
      if (el.getAttribute('data-id') === target.nodeId) return el
    }
    return null
  }
  return text === '' ? null : findMindmapTextElement(root, text)
}

export interface CanvasInlineEditOptions {
  projection: AnyProjection | null
  /** 图种提供的 data-id resolver；null = 该图种不做双击寻址（sequence/class 本轮不动，
   * mindmap 传 () => null 走文本匹配） */
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

  /** 进入编辑：预填文本在渲染时从投影取（新建节点落码后投影才到位） */
  const beginEdit = useCallback((target: InlineEditTarget) => {
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

  /** 双击进入编辑（挂到画布容器 onDoubleClick） */
  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const mindmapNodes = projection?.type === 'mindmap' ? projection.mindmap.nodes : []
      const target = inlineEditTargetFromEvent(e.target, resolver, mindmapNodes)
      if (target === null) return
      e.preventDefault()
      beginEdit(target)
    },
    [projection, resolver, beginEdit],
  )

  /** 回车/失焦：提交（落码改文本）并关闭；未改动/清空只关闭不落码 */
  const commit = useCallback((text: string): void => {
    const { editing: cur, projection: proj } = latestRef.current
    if (cur === null) return
    const result = inlineEditCommitOf(cur.target, text, inlineEditTextOf(proj, cur.target))
    if (result.action === 'commit') useEditorStore.getState().commitIntent(result.intent)
    setEditing(null)
  }, [])

  /** Esc：取消（不落码） */
  const cancel = useCallback((): void => {
    setEditing(null)
  }, [])

  // 双击定位要等浏览器原生 dblclick；编辑期间屏蔽背景拖拽由使用方按 editing 判断
  return { editing, onDoubleClick, beginEdit, commit, cancel }
}
