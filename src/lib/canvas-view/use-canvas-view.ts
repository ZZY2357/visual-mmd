import { useCallback, useEffect, useRef, useState } from 'react'
import { fitView, zoomAtPoint, type ViewState } from './view-state'

/**
 * 画布视图 Hook（工单 03）：
 * - SVG 换新（编辑重渲染 / 切换图表）即回到 fit —— 视图不持久化
 * - 纯滚轮以鼠标位置为锚点缩放（0.25–4 倍，不区分 Ctrl），preventDefault 阻止页面滚动
 * - 按住背景（非 SVG 元素）拖拽平移
 *
 * 变换全部通过 SVG 元素上的 CSS transform 表达，不改 SVG 内容 ——
 * 导出（App.tsx）走 preview.svg 原始字符串，天然与视图无关。
 */

/** 读取 SVG 的原始尺寸：优先 width/height 属性，缺失时回落 viewBox（与 file-io 同约定）。
 * 接受 Element 以便单测（happy-dom 下 querySelector 拿到的 svg 不是 SVGSVGElement 实例）。 */
export function svgIntrinsicSize(svg: Element): { width: number; height: number } | null {
  const size = (name: string): number | null => {
    const raw = svg.getAttribute(name)
    if (raw === null || raw === '' || raw.includes('%')) return null
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? n : null
  }
  const width = size('width')
  const height = size('height')
  if (width !== null && height !== null) return { width, height }
  const viewBox = svg.getAttribute('viewBox')
  if (viewBox === null) return null
  const parts = viewBox.trim().split(/[\s,]+/).map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n)) || parts[2] <= 0 || parts[3] <= 0) {
    return null
  }
  return { width: parts[2], height: parts[3] }
}

export function useCanvasView(svg: string | null) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [view, setView] = useState<ViewState | null>(null)
  const viewRef = useRef(view)
  viewRef.current = view
  const dragRef = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null)

  /** 回到 fit：把 SVG 尺寸钉回原始尺寸（去掉 mermaid 的 max-width 自适应），再整图居中 */
  const fit = useCallback(() => {
    const container = containerRef.current
    if (container === null) return
    const svg = container.querySelector('svg')
    if (svg === null) return
    const size = svgIntrinsicSize(svg)
    if (size === null) return
    svg.setAttribute('width', String(size.width))
    svg.setAttribute('height', String(size.height))
    svg.style.maxWidth = 'none'
    setView(fitView(container.clientWidth, container.clientHeight, size.width, size.height))
  }, [])

  // SVG 换新（dangerouslySetInnerHTML 换子树）即重新 fit：初始与切换图表都走这里
  useEffect(() => {
    fit()
  }, [fit, svg])

  // 视图 → DOM：transform 全部落在这个 SVG 元素上
  useEffect(() => {
    const svg = containerRef.current?.querySelector('svg') ?? null
    if (svg === null) return
    if (view === null) {
      svg.style.transform = ''
      return
    }
    svg.style.transformOrigin = '0 0'
    svg.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`
  }, [view])

  // 纯滚轮缩放：以鼠标为锚点；passive: false 才能 preventDefault 阻止页面滚动
  useEffect(() => {
    const container = containerRef.current
    if (container === null) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const current = viewRef.current
      if (current === null) return
      const rect = container.getBoundingClientRect()
      const factor = Math.exp(-e.deltaY * 0.0015)
      setView(zoomAtPoint(current, current.scale * factor, e.clientX - rect.left, e.clientY - rect.top))
    }
    container.addEventListener('wheel', onWheel, { passive: false })
    return () => container.removeEventListener('wheel', onWheel)
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    // 仅背景（非 SVG 元素）拖拽平移；元素上的指针事件留给选中链路
    const container = containerRef.current
    if (container === null || viewRef.current === null) return
    if ((e.target as Element).closest('svg') !== null) return
    dragRef.current = { pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY }
    container.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current
    const current = viewRef.current
    if (drag === null || drag.pointerId !== e.pointerId || current === null) return
    setView({
      scale: current.scale,
      tx: current.tx + (e.clientX - drag.lastX),
      ty: current.ty + (e.clientY - drag.lastY),
    })
    dragRef.current = { ...drag, lastX: e.clientX, lastY: e.clientY }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragRef.current?.pointerId !== e.pointerId) return
    dragRef.current = null
    containerRef.current?.releasePointerCapture(e.pointerId)
  }

  return { containerRef, view, fit, onPointerDown, onPointerMove, onPointerUp }
}
