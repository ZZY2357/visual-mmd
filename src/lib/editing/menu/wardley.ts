import type { DiagramMenuDefinition } from '../context-menu'

/**
 * wardley 右键菜单定义（architecture-deepening-3 工单 04）：空白 = 加 component / 加 anchor / 加连线（more-diagrams 工单 23）；节点 = 从这里拉连线 / 编辑 / 删除；连线 = 加连线（同源预填）/ 编辑 / 删除；evolve = 编辑 / 删除。
 *
 * 菜单项 id 的动作实现统一在 `editing/menu-actions.ts` 的 MENU_ACTIONS 穷尽 Record；
 * 跨图种共用 id（link-mode / link-from-here / edit-text / edit-label / add-note /
 * add-section / delete）的文案留在 i18n 的 canvas.menu。
 */

export const wardleyMenuLabels = {
  'add-wardley-component': '添加组件',
  'add-wardley-anchor': '添加锚点',
  'add-wardley-link': '添加连线',
} as const

export const wardleyMenuLabelsEn = {
  'add-wardley-component': 'Add component',
  'add-wardley-anchor': 'Add anchor',
  'add-wardley-link': 'Add link',
} as const

export const wardleyMenu: DiagramMenuDefinition = {
  blankItems: ['add-wardley-component', 'add-wardley-anchor', 'add-wardley-link'],
  nodeItems: {
    'wardley-node': ['edit-text', 'link-from-here', 'delete'],
    'wardley-link': ['add-wardley-link', 'edit-label', 'delete'],
    'wardley-evolve': ['edit-label', 'delete'],
  },
}
