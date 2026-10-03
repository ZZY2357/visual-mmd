import type { DiagramMenuDefinition } from '../context-menu'

/**
 * state 右键菜单定义（architecture-deepening-3 工单 04）：空白 = 添加状态 / 连线模式（more-diagrams 工单 02）；状态 = 复合状态多一项「添加状态（复合内部）」，普通状态 = 编辑描述 / 连线模式 / 删除；转移 = 编辑 / 删除。
 *
 * 菜单项 id 的动作实现统一在 `editing/menu-actions.ts` 的 MENU_ACTIONS 穷尽 Record；
 * 跨图种共用 id（link-mode / link-from-here / edit-text / edit-label / add-note /
 * add-section / delete）的文案留在 i18n 的 canvas.menu。
 */

export const stateMenuLabels = {
  'add-state': '添加状态',
  'add-state-into': '添加状态（复合内部）',
  'edit-state-desc': '编辑描述',
} as const

export const stateMenuLabelsEn = {
  'add-state': 'Add state',
  'add-state-into': 'Add state (inside composite)',
  'edit-state-desc': 'Edit description',
} as const

export const stateMenu: DiagramMenuDefinition = {
  blankItems: ['add-state', 'link-mode'],
  nodeItems: {
    // 复合状态多一项「添加状态（复合内部）」；普通状态 = 编辑描述 / 连线模式 / 删除
    'state': (_selection, composite) =>
      composite === true
        ? ['add-state-into', 'edit-state-desc', 'link-from-here', 'delete']
        : ['edit-state-desc', 'link-from-here', 'delete'],
    'state-transition': ['edit-label', 'delete'],
  },
}
