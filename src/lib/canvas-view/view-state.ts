/**
 * 画布视图换算（工单 03）：缩放/平移只是查看手段（CONTEXT「视图」），
 * 不影响渲染内容与导出产物。本模块只做纯数学换算，DOM 应用在 use-canvas-view。
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
