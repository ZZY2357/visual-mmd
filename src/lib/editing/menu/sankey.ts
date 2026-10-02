import type { DiagramMenuDefinition } from '../context-menu'

/**
 * sankey 右键菜单定义（architecture-deepening-3 工单 04）：空白 = 加链路（三列表单浮出，提交才落码，more-diagrams 工单 13）；节点 = 重命名（选中 + 关菜单——节点不落码，改名即手术改写全部链路行）；链路 = 编辑 / 删除。
 *
 * 菜单项 id 的动作实现统一在 `editing/menu-actions.ts` 的 MENU_ACTIONS 穷尽 Record；
 * 跨图种共用 id（link-mode / link-from-here / edit-text / edit-label / add-note /
 * add-section / delete）的文案留在 i18n 的 canvas.menu。
 */

export const sankeyMenuLabels = {
  'add-sankey-link': '添加链路',
  'edit-sankey-name': '重命名',
} as const

export const sankeyMenu: DiagramMenuDefinition = {
  blankItems: ['add-sankey-link'],
  nodeItems: {
    'sankey-node': ['edit-sankey-name'],
    'sankey-link': ['edit-label', 'delete'],
  },
}
