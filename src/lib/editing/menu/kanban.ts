import type { DiagramMenuDefinition } from '../context-menu'

/**
 * kanban 右键菜单定义（architecture-deepening-3 工单 04）：空白加列、列上加卡片、卡片改元数据（D5：选中 + 关菜单，more-diagrams 工单 06）；改标题 / 改描述复用 edit-text（内联编辑），删除复用 delete。
 *
 * 菜单项 id 的动作实现统一在 `editing/menu-actions.ts` 的 MENU_ACTIONS 穷尽 Record；
 * 跨图种共用 id（link-mode / link-from-here / edit-text / edit-label / add-note /
 * add-section / delete）的文案留在 i18n 的 canvas.menu。
 */

export const kanbanMenuLabels = {
  'add-column': '添加列',
  'add-card': '添加卡片',
  'edit-kanban-metadata': '在属性面板中编辑',
} as const

export const kanbanMenuLabelsEn = {
  'add-column': 'Add column',
  'add-card': 'Add card',
  'edit-kanban-metadata': 'Edit in property panel',
} as const

export const kanbanMenu: DiagramMenuDefinition = {
  blankItems: ['add-column'],
  nodeItems: {
    'kanban-column': ['edit-text', 'add-card', 'delete'],
    'kanban-card': ['edit-text', 'edit-kanban-metadata', 'delete'],
  },
}
