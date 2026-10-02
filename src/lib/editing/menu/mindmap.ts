import type { DiagramMenuDefinition } from '../context-menu'

/**
 * mindmap 右键菜单定义（architecture-deepening-3 工单 04）：空白 = 添加根节点（工单 04）；节点 = 添加子节点 / 编辑文本 / 删除。
 *
 * 菜单项 id 的动作实现统一在 `editing/menu-actions.ts` 的 MENU_ACTIONS 穷尽 Record；
 * 跨图种共用 id（link-mode / link-from-here / edit-text / edit-label / add-note /
 * add-section / delete）的文案留在 i18n 的 canvas.menu。
 */

export const mindmapMenuLabels = {
  'add-root': '添加根节点',
  'add-child': '添加子节点',
} as const

export const mindmapMenu: DiagramMenuDefinition = {
  blankItems: ['add-root'],
  nodeItems: {
    'mindmap-node': ['add-child', 'edit-text', 'delete'],
  },
}
