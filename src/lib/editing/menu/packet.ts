import type { DiagramMenuDefinition } from '../context-menu'

/**
 * packet 右键菜单定义（architecture-deepening-3 工单 04）：空白 = 加字段（+count 形态衔接前序，创建 + 内联命名，more-diagrams 工单 16）；字段 = 改名（内联编辑）/ 改位区间（D5）/ 删除。
 *
 * 菜单项 id 的动作实现统一在 `editing/menu-actions.ts` 的 MENU_ACTIONS 穷尽 Record；
 * 跨图种共用 id（link-mode / link-from-here / edit-text / edit-label / add-note /
 * add-section / delete）的文案留在 i18n 的 canvas.menu。
 */

export const packetMenuLabels = {
  'add-packet-field': '添加字段',
  'edit-packet-range': '在属性面板中编辑',
} as const

export const packetMenu: DiagramMenuDefinition = {
  blankItems: ['add-packet-field'],
  nodeItems: {
    'packet-field': ['edit-text', 'edit-packet-range', 'delete'],
  },
}
