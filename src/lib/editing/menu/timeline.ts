import type { DiagramMenuDefinition } from '../context-menu'

/**
 * timeline 右键菜单定义（architecture-deepening-3 工单 04）：空白 = 加时期 / 加分组（more-diagrams 工单 05）；时期 = 改文本 / 加事件 / 删除；事件 = 改文本 / 删除。
 *
 * 菜单项 id 的动作实现统一在 `editing/menu-actions.ts` 的 MENU_ACTIONS 穷尽 Record；
 * 跨图种共用 id（link-mode / link-from-here / edit-text / edit-label / add-note /
 * add-section / delete）的文案留在 i18n 的 canvas.menu。
 */

export const timelineMenuLabels = {
  'add-period': '添加时期',
  'add-event': '添加事件',
  'edit-period-text': '编辑时期文本',
  'edit-event-text': '在属性面板中编辑',
} as const

export const timelineMenuLabelsEn = {
  'add-period': 'Add period',
  'add-event': 'Add event',
  'edit-period-text': 'Edit period text',
  'edit-event-text': 'Edit in property panel',
} as const

export const timelineMenu: DiagramMenuDefinition = {
  blankItems: ['add-period', 'add-section'],
  nodeItems: {
    'timeline-period': ['edit-period-text', 'add-event', 'delete'],
    'timeline-event': ['edit-event-text', 'delete'],
  },
}
