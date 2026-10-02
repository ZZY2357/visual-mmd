import type { DiagramMenuDefinition } from '../context-menu'

/**
 * zenuml 右键菜单定义（architecture-deepening-3 工单 04）：空白 = 加参与者 / 加消息（more-diagrams 工单 19）；参与者 = 改别名（内联编辑）/ 删除声明行；消息 = 改文本（D5）/ 删除；片段（分组）无菜单动作。
 *
 * 菜单项 id 的动作实现统一在 `editing/menu-actions.ts` 的 MENU_ACTIONS 穷尽 Record；
 * 跨图种共用 id（link-mode / link-from-here / edit-text / edit-label / add-note /
 * add-section / delete）的文案留在 i18n 的 canvas.menu。
 */

export const zenumlMenuLabels = {
  'add-zenuml-participant': '添加参与者',
  'add-zenuml-message': '添加消息',
  'edit-zenuml-participant': '改别名',
  'edit-zenuml-message': '在属性面板中编辑',
} as const

export const zenumlMenu: DiagramMenuDefinition = {
  blankItems: ['add-zenuml-participant', 'add-zenuml-message'],
  nodeItems: {
    'zenuml-participant': ['edit-zenuml-participant', 'delete'],
    'zenuml-message': ['edit-zenuml-message', 'delete'],
    'zenuml-fragment': [],
  },
}
