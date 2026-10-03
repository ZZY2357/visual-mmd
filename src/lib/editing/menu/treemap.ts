import type { DiagramMenuDefinition } from '../context-menu'

/**
 * treemap 右键菜单定义（architecture-deepening-3 工单 04）：空白 = 加分组（Section）/ 加叶子（Leaf，数值落 1，more-diagrams 工单 20）。节点的编辑不做元素级画布菜单（无 data-id 可命中），由结构树选中 + 属性表单承接。
 *
 * 菜单项 id 的动作实现统一在 `editing/menu-actions.ts` 的 MENU_ACTIONS 穷尽 Record；
 * 跨图种共用 id（link-mode / link-from-here / edit-text / edit-label / add-note /
 * add-section / delete）的文案留在 i18n 的 canvas.menu。
 */

export const treemapMenuLabels = {
  'add-treemap-group': '添加分组',
  'add-treemap-leaf': '添加叶子',
} as const

export const treemapMenuLabelsEn = {
  'add-treemap-group': 'Add group',
  'add-treemap-leaf': 'Add leaf',
} as const

export const treemapMenu: DiagramMenuDefinition = {
  blankItems: ['add-treemap-group', 'add-treemap-leaf'],
  nodeItems: {
  },
}
