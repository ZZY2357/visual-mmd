import type { DiagramMenuDefinition } from '../context-menu'

/**
 * c4 右键菜单定义（architecture-deepening-3 工单 04）：空白 = 加元素（类型子菜单）/ 加边界（more-diagrams 工单 18）；元素 = 改字段（D5）/ 从这里连线 / 删除；边界 = 改标题（D5）/ 删除；关系 = 改字段（D5）/ 删除。
 *
 * 菜单项 id 的动作实现统一在 `editing/menu-actions.ts` 的 MENU_ACTIONS 穷尽 Record；
 * 跨图种共用 id（link-mode / link-from-here / edit-text / edit-label / add-note /
 * add-section / delete）的文案留在 i18n 的 canvas.menu。
 */

export const c4MenuLabels = {
  'add-c4-element': '添加元素',
  'add-c4-boundary': '添加边界',
  'edit-c4-element': '在属性面板中编辑',
  'edit-c4-boundary': '在属性面板中编辑',
  'edit-c4-relation': '在属性面板中编辑',
} as const

export const c4Menu: DiagramMenuDefinition = {
  blankItems: ['add-c4-element', 'add-c4-boundary'],
  nodeItems: {
    'c4-element': ['edit-c4-element', 'link-from-here', 'delete'],
    'c4-boundary': ['edit-c4-boundary', 'delete'],
    'c4-relation': ['edit-c4-relation', 'delete'],
  },
}
