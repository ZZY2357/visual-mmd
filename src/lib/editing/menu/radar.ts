import type { DiagramMenuDefinition } from '../context-menu'

/**
 * radar 右键菜单定义（architecture-deepening-3 工单 04）：空白 = 加轴 / 加曲线（占位 id 避重，more-diagrams 工单 15）。轴与曲线的编辑不做元素级画布菜单（无 data-id 可命中），由结构树选中 + 属性表单承接。
 *
 * 菜单项 id 的动作实现统一在 `editing/menu-actions.ts` 的 MENU_ACTIONS 穷尽 Record；
 * 跨图种共用 id（link-mode / link-from-here / edit-text / edit-label / add-note /
 * add-section / delete）的文案留在 i18n 的 canvas.menu。
 */

export const radarMenuLabels = {
  'add-radar-axis': '添加轴',
  'add-radar-curve': '添加曲线',
} as const

export const radarMenu: DiagramMenuDefinition = {
  blankItems: ['add-radar-axis', 'add-radar-curve'],
  nodeItems: {
  },
}
