/**
 * 移动端布局的纯逻辑（工单 15）：手机断点与单栏切换器的面板词汇。
 *
 * 三档视口：
 * - 桌面（>= NARROW_BREAKPOINT 960）：三栏可拖拽布局，行为完全不变；
 * - 平板（MOBILE_BREAKPOINT < w < NARROW_BREAKPOINT，即 769–959）：现状「只显示画布」；
 * - 手机（<= MOBILE_BREAKPOINT 768）：三栏折叠为单栏 + 面板切换器（SegmentedControl），
 *   代码面板 / 画布 / 属性面板逐一可达。768 取 Mantine `sm` 断点（48em）边界，
 *   与项目已有的 CSS 断点语义对齐。
 *
 * ThreePaneLayout 组件消费这些纯函数；断点边界直接单测（与 pane-layout.ts 同约定）。
 */

/** 手机断点：视口宽度 <= 此值时启用单栏 + 切换器（Mantine sm = 48em = 768px） */
export const MOBILE_BREAKPOINT = 768

/** 视口是否处于「手机单栏」模式 */
export function isMobileViewport(windowWidth: number): boolean {
  return windowWidth <= MOBILE_BREAKPOINT
}

/** 单栏模式下可切换的面板（顺序即切换器展示顺序：代码 | 画布 | 属性） */
export type MobilePane = 'code' | 'canvas' | 'properties'

export const MOBILE_PANES: readonly MobilePane[] = ['code', 'canvas', 'properties']

/** 单栏模式默认显示画布（与「窄屏只显示画布」的现状一致，画布是主工作面） */
export const MOBILE_DEFAULT_PANE: MobilePane = 'canvas'
