import { useCallback, useEffect, useRef } from 'react'

/**
 * 触屏长按（工单 15）：手机没有右键，长按是打开画布上下文菜单的入口。
 *
 * 语义与桌面右键对齐：
 * - 只认**触摸**指针（`pointerType === 'touch'`）；鼠标 / 触控笔按下不启动计时，
 *   桌面右键行为完全不受影响（CanvasPanel 仍走 onContextMenu）。
 * - 长按约 500ms 触发；移动超过容差（默认 10px）、抬起、取消都撤销——
 *   画布背景拖拽平移与长按因此可以共存（拖一下就撤销长按）。
 * - 触发后回调收到触点坐标（相对视口的 clientX/clientY，与右键事件同口径），
 *   使用方据此在触点弹出菜单。
 * - 触发后紧随的 click 被抑制一次：真实触屏长按后通常还会派发 click，
 *   不抑制会把刚打开的菜单立刻关掉（画布点击裁定 menu → close-float）。
 *
 * 纯事件解析，与菜单内容无关——菜单本身复用 use-canvas-context-menu，
 * 保证长按与右键产出**同一份**菜单项（ADR-0017 分层覆盖）。
 */

export const LONG_PRESS_DELAY_MS = 500
export const LONG_PRESS_MOVE_TOLERANCE_PX = 10

export interface LongPressPoint {
  /** 触点相对视口的坐标（与 MouseEvent.clientX/clientY 同口径） */
  x: number
  y: number
  /** 触发时的 DOM 事件目标（使用方据此解析 data-id / 目标元素） */
  target: EventTarget | null
}

export interface LongPressHandlers {
  onPointerDown: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent) => void
  onPointerCancel: (e: React.PointerEvent) => void
}

export interface LongPressApi {
  handlers: LongPressHandlers
  /** 长按已触发、本次 click 应被抑制（消费一次后复位）。返回 true = 跳过这次点击。 */
  consumeSuppressedClick: () => boolean
}

export function useLongPress(
  onLongPress: (point: LongPressPoint) => void,
  options: { delay?: number; moveTolerance?: number } = {},
): LongPressApi {
  const delay = options.delay ?? LONG_PRESS_DELAY_MS
  const tolerance = options.moveTolerance ?? LONG_PRESS_MOVE_TOLERANCE_PX

  const callbackRef = useRef(onLongPress)
  callbackRef.current = onLongPress
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startRef = useRef<{ x: number; y: number; target: EventTarget | null } | null>(null)
  // 长按已触发：抑制随后的 click，直到被消费或下一次按下
  const firedRef = useRef(false)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    startRef.current = null
  }, [])

  useEffect(() => clearTimer, [clearTimer])

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      firedRef.current = false
      // 只认触摸主指针：鼠标 / 触控笔走既有桌面链路
      if (e.pointerType !== 'touch' || !e.isPrimary) return
      const target = e.target
      const x = e.clientX
      const y = e.clientY
      startRef.current = { x, y, target }
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        const start = startRef.current
        startRef.current = null
        if (start === null) return
        firedRef.current = true
        callbackRef.current({ x: start.x, y: start.y, target: start.target })
      }, delay)
    },
    [delay],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const start = startRef.current
      if (start === null) return
      // 移动超过容差 = 不是长按（背景拖拽 / 滚动手势），撤销
      if (Math.abs(e.clientX - start.x) > tolerance || Math.abs(e.clientY - start.y) > tolerance) {
        clearTimer()
      }
    },
    [clearTimer, tolerance],
  )

  const onPointerUp = useCallback(() => clearTimer(), [clearTimer])
  const onPointerCancel = useCallback(() => clearTimer(), [clearTimer])

  const consumeSuppressedClick = useCallback((): boolean => {
    if (!firedRef.current) return false
    firedRef.current = false
    return true
  }, [])

  return { handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel }, consumeSuppressedClick }
}
