import type { DiagramMenuDefinition } from '../context-menu'

/**
 * cynefin 右键菜单定义（architecture-deepening-3 工单 04）：空白 = 加条目 / 加转移（more-diagrams 工单 25）；域名词行 = 加条目（该域下，域不可改名/删除）；条目 = 加条目（同域内该条目之后）/ 编辑 / 删除；转移 = 编辑 / 删除。
 *
 * 菜单项 id 的动作实现统一在 `editing/menu-actions.ts` 的 MENU_ACTIONS 穷尽 Record；
 * 跨图种共用 id（link-mode / link-from-here / edit-text / edit-label / add-note /
 * add-section / delete）的文案留在 i18n 的 canvas.menu。
 */

export const cynefinMenuLabels = {
  'add-cynefin-item': '添加条目',
  'add-cynefin-transition': '添加转移',
} as const

export const cynefinMenu: DiagramMenuDefinition = {
  blankItems: ['add-cynefin-item', 'add-cynefin-transition'],
  nodeItems: {
    'cynefin-domain': ['add-cynefin-item'],
    'cynefin-item': ['add-cynefin-item', 'edit-text', 'delete'],
    'cynefin-transition': ['edit-label', 'delete'],
  },
}
