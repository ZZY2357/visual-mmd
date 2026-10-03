import type { DiagramMenuDefinition } from '../context-menu'

/**
 * flowchart 右键菜单定义（architecture-deepening-3 工单 04）：空白 = 添加节点 / 连线模式 / 添加样式 / 添加子图（工单 04/07）；节点 = 从这里连线 / 编辑文本 / 应用样式（子菜单）/ 删除；连线 = 在属性面板中编辑 / 删除。
 *
 * 菜单项 id 的动作实现统一在 `editing/menu-actions.ts` 的 MENU_ACTIONS 穷尽 Record；
 * 跨图种共用 id（link-mode / link-from-here / edit-text / edit-label / add-note /
 * add-section / delete）的文案留在 i18n 的 canvas.menu。
 */

export const flowchartMenuLabels = {
  'add-node': '添加节点',
  'add-style': '添加样式',
  'add-subgraph': '添加子图',
  'apply-style': '应用样式',
} as const

export const flowchartMenuLabelsEn = {
  'add-node': 'Add node',
  'add-style': 'Add style',
  'add-subgraph': 'Add subgraph',
  'apply-style': 'Apply style',
} as const

export const flowchartMenu: DiagramMenuDefinition = {
  blankItems: ['add-node', 'link-mode', 'add-style', 'add-subgraph'],
  nodeItems: {
    'node': ['link-from-here', 'edit-text', 'apply-style', 'delete'],
    'edge': ['edit-label', 'delete'],
  },
}
