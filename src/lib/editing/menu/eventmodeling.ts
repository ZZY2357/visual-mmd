import type { DiagramMenuDefinition } from '../context-menu'

/**
 * eventmodeling 右键菜单定义（architecture-deepening-3 工单 04）：空白 = 加帧 / 加数据块（more-diagrams 工单 28）；帧 = 编辑（D5）/ 删除；数据块 = 编辑（D5）/ 删除。元素级目标只由结构树选中构造（画布无 data-id）。
 *
 * 菜单项 id 的动作实现统一在 `editing/menu-actions.ts` 的 MENU_ACTIONS 穷尽 Record；
 * 跨图种共用 id（link-mode / link-from-here / edit-text / edit-label / add-note /
 * add-section / delete）的文案留在 i18n 的 canvas.menu。
 */

export const eventmodelingMenuLabels = {
  'add-em-frame': '添加帧',
  'add-em-data': '添加数据块',
  'edit-em-frame': '在属性面板中编辑',
  'edit-em-data': '在属性面板中编辑',
} as const

export const eventmodelingMenuLabelsEn = {
  'add-em-frame': 'Add frame',
  'add-em-data': 'Add data block',
  'edit-em-frame': 'Edit in property panel',
  'edit-em-data': 'Edit in property panel',
} as const

export const eventmodelingMenu: DiagramMenuDefinition = {
  blankItems: ['add-em-frame', 'add-em-data'],
  nodeItems: {
    'em-frame': ['edit-em-frame', 'delete'],
    'em-data': ['edit-em-data', 'delete'],
  },
}
