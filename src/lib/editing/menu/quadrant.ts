import type { DiagramMenuDefinition } from '../context-menu'

/**
 * quadrant 右键菜单定义（architecture-deepening-3 工单 04）：空白 = 加点（坐标落 0.5, 0.5，more-diagrams 工单 12）；点 = 改文本（内联编辑）/ 改坐标 / 改样式（D5）/ 删除；轴/象限 = 改文本（D5）。
 *
 * 菜单项 id 的动作实现统一在 `editing/menu-actions.ts` 的 MENU_ACTIONS 穷尽 Record；
 * 跨图种共用 id（link-mode / link-from-here / edit-text / edit-label / add-note /
 * add-section / delete）的文案留在 i18n 的 canvas.menu。
 */

export const quadrantMenuLabels = {
  'add-quadrant-point': '添加点',
  'edit-quadrant-coords': '在属性面板中编辑',
  'edit-quadrant-style': '在属性面板中编辑',
  'edit-quadrant-text': '在属性面板中编辑',
} as const

export const quadrantMenu: DiagramMenuDefinition = {
  blankItems: ['add-quadrant-point'],
  nodeItems: {
    'quadrant-point': ['edit-text', 'edit-quadrant-coords', 'edit-quadrant-style', 'delete'],
    'quadrant-axis': ['edit-quadrant-text'],
    'quadrant-quadrant': ['edit-quadrant-text'],
  },
}
