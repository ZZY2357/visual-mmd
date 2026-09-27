/**
 * 三栏布局的纯逻辑（工单 12 收尾验收）：
 * 窄屏只显示画布、面板宽度的最小/最大保护、折叠互斥。
 *
 * ThreePaneLayout 组件消费这些纯函数；单元测试直接覆盖数值边界，
 * UI 组件本身不进单测（spec 的测试决策）。
 */

/** 窄屏断点：视口宽度低于此值时只显示画布（spec 用户故事 37）。
 *  取值保证"全模式"下三栏最小宽度之和 + 分隔条必然放得下：
 *  代码面板 240 + 属性面板 260 + 画布 320 + 分隔条/按钮 ≈ 850 < 960。 */
export const NARROW_BREAKPOINT = 960

/** 画布最小宽度：任何面板调宽都不得把画布挤到这条线以下 */
export const CANVAS_MIN = 320

/** 视口是否处于"窄屏只显示画布"模式 */
export function isNarrowViewport(windowWidth: number): boolean {
  return windowWidth < NARROW_BREAKPOINT
}

/** 宽度夹取到 [min, max]；max 低于 min 时以 min 为准（不破版优先保最小宽度） */
export function clampWidth(width: number, min: number, max: number): number {
  const upper = Math.max(max, min)
  return Math.min(Math.max(width, min), upper)
}

/**
 * 代码面板的最大宽度：视口宽度 − 画布最小宽度 − 属性面板当前占用。
 * 属性面板折叠时传入 null（不占用宽度）。
 */
export function maxCodePanelWidth(
  windowWidth: number,
  propsOpenWidth: number | null,
): number {
  const propsOccupied = propsOpenWidth ?? 0
  return windowWidth - CANVAS_MIN - propsOccupied
}

/**
 * 属性面板的最大宽度：视口宽度 − 画布最小宽度 − 代码面板当前占用。
 * 代码面板折叠时传入 null（不占用宽度）。
 */
export function maxPropsPanelWidth(
  windowWidth: number,
  codeOpenWidth: number | null,
): number {
  const codeOccupied = codeOpenWidth ?? 0
  return windowWidth - CANVAS_MIN - codeOccupied
}

/**
 * 折叠互斥：同一时刻至多一个面板处于折叠态。
 * 返回给定"另一面板是否已折叠"时本面板允许折叠到的状态——
 * 另一面板已折叠则不允许再折叠（false），否则取期望值。
 */
export function resolveCollapse(desired: boolean, otherCollapsed: boolean): boolean {
  return otherCollapsed ? false : desired
}
