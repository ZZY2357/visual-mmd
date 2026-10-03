import type { DiagramMenuDefinition } from '../context-menu'

/**
 * pie 右键菜单定义（architecture-deepening-3 工单 04）：空白 = 加扇区（数值落 1，可在右侧表单改，more-diagrams 工单 10）。扇区的编辑不做元素级画布菜单（无 data-id 可命中），由结构树选中 + 属性表单承接。
 *
 * 菜单项 id 的动作实现统一在 `editing/menu-actions.ts` 的 MENU_ACTIONS 穷尽 Record；
 * 跨图种共用 id（link-mode / link-from-here / edit-text / edit-label / add-note /
 * add-section / delete）的文案留在 i18n 的 canvas.menu。
 */

export const pieMenuLabels = {
  'add-pie-sector': '添加扇区',
} as const

export const pieMenuLabelsEn = {
  'add-pie-sector': 'Add sector',
} as const

export const pieMenu: DiagramMenuDefinition = {
  blankItems: ['add-pie-sector'],
  nodeItems: {
  },
}
