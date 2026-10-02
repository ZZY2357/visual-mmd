import type { DiagramMenuDefinition } from '../context-menu'

/**
 * er 右键菜单定义（architecture-deepening-3 工单 04）：空白 = 添加实体（more-diagrams 工单 03）；实体 = 添加属性 / 连线模式（预选起点）/ 改别名 / 删除；关系 = 切换线型（直接改）/ 编辑 / 删除；属性 = 编辑 / 删除。
 *
 * 菜单项 id 的动作实现统一在 `editing/menu-actions.ts` 的 MENU_ACTIONS 穷尽 Record；
 * 跨图种共用 id（link-mode / link-from-here / edit-text / edit-label / add-note /
 * add-section / delete）的文案留在 i18n 的 canvas.menu。
 */

export const erMenuLabels = {
  'add-entity': '添加实体',
  'add-attribute': '添加属性',
  'edit-er-alias': '改别名',
  'cycle-er-line': '切换线型',
  'edit-er-relation': '在属性面板中编辑',
  'edit-er-attribute': '在属性面板中编辑',
} as const

export const erMenu: DiagramMenuDefinition = {
  blankItems: ['add-entity'],
  nodeItems: {
    'er-entity': ['add-attribute', 'link-from-here', 'edit-er-alias', 'delete'],
    'er-relation': ['cycle-er-line', 'edit-er-relation', 'delete'],
    'er-attribute': ['edit-er-attribute', 'delete'],
  },
}
