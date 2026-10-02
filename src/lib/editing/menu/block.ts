import type { DiagramMenuDefinition } from '../context-menu'

/**
 * block 右键菜单定义（architecture-deepening-3 工单 04）：空白 = 加块节点 / 加嵌套块（创建 + 内联命名，more-diagrams 工单 09）；节点 = 改标签（内联编辑）/ 删除；嵌套块 = 加块节点（落进组内）/ 删除；边 = 编辑 / 删除。
 *
 * 菜单项 id 的动作实现统一在 `editing/menu-actions.ts` 的 MENU_ACTIONS 穷尽 Record；
 * 跨图种共用 id（link-mode / link-from-here / edit-text / edit-label / add-note /
 * add-section / delete）的文案留在 i18n 的 canvas.menu。
 */

export const blockMenu: DiagramMenuDefinition = {
  blankItems: ['add-block-node', 'add-block-group'],
  nodeItems: {
    'block-node': ['edit-text', 'delete'],
    'block-group': ['add-block-node', 'delete'],
    'block-edge': ['edit-label', 'delete'],
  },
}
