import type { DiagramMenuDefinition } from '../context-menu'

/**
 * xychart 右键菜单定义（architecture-deepening-3 工单 04）：空白 = 加 line / 加 bar（表单浮出，提交才落码，more-diagrams 工单 14）；系列 = 改名 / 改类型（直接落码切换 line↔bar）/ 编辑数值 / 删除；轴 = 编辑；标题 = 改标题。
 *
 * 菜单项 id 的动作实现统一在 `editing/menu-actions.ts` 的 MENU_ACTIONS 穷尽 Record；
 * 跨图种共用 id（link-mode / link-from-here / edit-text / edit-label / add-note /
 * add-section / delete）的文案留在 i18n 的 canvas.menu。
 */

export const xychartMenuLabels = {
  'add-xychart-line': '添加折线（line）',
  'add-xychart-bar': '添加柱形（bar）',
  'xychart-toggle-type': '切换 line / bar',
  'xychart-edit-values': '编辑数值',
  'edit-xychart-axis': '编辑轴',
} as const

export const xychartMenu: DiagramMenuDefinition = {
  blankItems: ['add-xychart-line', 'add-xychart-bar'],
  nodeItems: {
    'xychart-series': ['edit-label', 'xychart-toggle-type', 'xychart-edit-values', 'delete'],
    'xychart-axis': ['edit-xychart-axis'],
    'xychart-title': ['edit-label'],
  },
}
