import type { DiagramMenuDefinition } from '../context-menu'

/**
 * gitgraph 右键菜单定义（architecture-deepening-3 工单 04）：空白 = 添加提交 / 添加分支（branch 创建并 checkout，more-diagrams 工单 04）。提交/分支的编辑动作不做画布菜单（无 data-id 可命中），由结构树选中 + 属性表单承接。
 *
 * 菜单项 id 的动作实现统一在 `editing/menu-actions.ts` 的 MENU_ACTIONS 穷尽 Record；
 * 跨图种共用 id（link-mode / link-from-here / edit-text / edit-label / add-note /
 * add-section / delete）的文案留在 i18n 的 canvas.menu。
 */

export const gitgraphMenuLabels = {
  'add-commit': '添加提交',
  'add-branch': '添加分支',
} as const

export const gitgraphMenu: DiagramMenuDefinition = {
  blankItems: ['add-commit', 'add-branch'],
  nodeItems: {
  },
}
