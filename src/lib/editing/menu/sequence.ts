import type { DiagramMenuDefinition } from '../context-menu'

/**
 * sequence 右键菜单定义（architecture-deepening-3 工单 04）：空白 = 添加参与者 / 注释 / 逻辑块（工单 04）；参与者 = 加消息 / 加逻辑块（以该参与者为落点）/ 删除；消息 = 切换箭头（直接改）/ 编辑 / 删除；注释与逻辑块只补删除（工单 03）。
 *
 * 菜单项 id 的动作实现统一在 `editing/menu-actions.ts` 的 MENU_ACTIONS 穷尽 Record；
 * 跨图种共用 id（link-mode / link-from-here / edit-text / edit-label / add-note /
 * add-section / delete）的文案留在 i18n 的 canvas.menu。
 */

export const sequenceMenuLabels = {
  'add-participant': '添加参与者',
  'delete-participant': '删除参与者',
  'add-message': '添加消息',
  'add-block': '添加逻辑块',
  'cycle-message-arrow': '切换箭头',
  'edit-message': '在属性面板中编辑',
  'delete-message': '删除消息',
  'delete-note': '删除注释',
  'delete-block': '删除逻辑块',
} as const

export const sequenceMenuLabelsEn = {
  'add-participant': 'Add participant',
  'delete-participant': 'Delete participant',
  'add-message': 'Add message',
  'add-block': 'Add logic block',
  'cycle-message-arrow': 'Cycle arrow',
  'edit-message': 'Edit in property panel',
  'delete-message': 'Delete message',
  'delete-note': 'Delete note',
  'delete-block': 'Delete logic block',
} as const

export const sequenceMenu: DiagramMenuDefinition = {
  blankItems: ['add-participant', 'add-note', 'add-block'],
  nodeItems: {
    'participant': ['add-message', 'add-block', 'delete-participant'],
    'message': ['cycle-message-arrow', 'edit-message', 'delete-message'],
    'note': ['delete-note'],
    'block': ['delete-block'],
  },
}
