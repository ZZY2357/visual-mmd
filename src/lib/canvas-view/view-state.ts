/**
 * 画布视图换算（工单 03）：缩放/平移只是查看手段（CONTEXT「视图」），
 * 不影响渲染内容与导出产物。本模块只做纯数学换算与纯命中判定，
 * DOM 应用（transform 写入、指针捕获）在 use-canvas-view。
 *
 * 坐标约定：SVG 内容以 transform: translate(tx, ty) scale(scale) 呈现在容器中，
 * 容器坐标 = tx + scale × 内容坐标。
 */

/** 缩放范围（spec 惯例：0.25–4，不持久化） */
export const MIN_SCALE = 0.25
export const MAX_SCALE = 4

export interface ViewState {
  /** 相对 SVG 原始尺寸的缩放倍数 */
  scale: number
  /** 平移量（容器坐标系），作用于 scale 之前 */
  tx: number
  ty: number
}

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

/**
 * 整图自适应居中（fit）：等比缩放到恰好放进容器（四周留 padding），再在容器内居中。
 * 放大小图到超过 1 倍只会放大栅格化瑕疵，fit 上限取 1。
 */
export function fitView(
  containerW: number,
  containerH: number,
  svgW: number,
  svgH: number,
  padding = 24,
): ViewState {
  if (svgW <= 0 || svgH <= 0 || containerW <= 0 || containerH <= 0) {
    return { scale: 1, tx: 0, ty: 0 }
  }
  const scale = clampScale(Math.min(1, (containerW - padding * 2) / svgW, (containerH - padding * 2) / svgH))
  return {
    scale,
    tx: (containerW - svgW * scale) / 2,
    ty: (containerH - svgH * scale) / 2,
  }
}

/**
 * 以容器坐标 (px, py) 为锚点把缩放调到 nextScale（内部先 clamp）：
 * 锚点下的内容点在缩放前后保持在同一屏幕位置（滚轮以鼠标为中心缩放）。
 */
export function zoomAtPoint(view: ViewState, nextScale: number, px: number, py: number): ViewState {
  const scale = clampScale(nextScale)
  const k = scale / view.scale
  return {
    scale,
    tx: px - (px - view.tx) * k,
    ty: py - (py - view.ty) * k,
  }
}

/**
 * 交互控件选择器（与画布键盘的焦点排除表同类）：指针按下落在这些控件上时，
 * 事件属于控件自身的链路（按钮的点击、输入框的文本选择……），不是画布手势。
 */
const INTERACTIVE_TARGET_SELECTOR =
  'button, a[href], input, textarea, select, [contenteditable="true"], [contenteditable=""]'

/**
 * 指针按下的目标是否算「画布背景」（即允许启动背景拖拽平移）：
 * - SVG 内容（节点/连线/标签）：不算背景，指针事件留给选中链路；
 * - 交互控件（按钮/输入框/链接/可编辑区）及其后代：不算背景 ——
 *   背景拖拽会对容器 setPointerCapture，把派生的 click 劫持到容器，
 *   控件自身的 onClick 永不触发（工单 12：常驻的「适应窗口」按钮就是这样失效的）。
 */
export function isBackgroundDragTarget(target: Element): boolean {
  if (target.closest('svg') !== null) return false
  return target.closest(INTERACTIVE_TARGET_SELECTOR) === null
}
