import type { DiagramMenuDefinition } from '../context-menu'

/**
 * class 右键菜单定义（architecture-deepening-3 工单 04）：空白 = 添加类 / 浮动注释（工单 04）；类节点 = 加成员 / 加关系 / 加 `note for X` / 删除类；关系边 = 切换关系类型（直接改）/ 编辑 / 删除（工单 03）。
 *
 * 菜单项 id 的动作实现统一在 `editing/menu-actions.ts` 的 MENU_ACTIONS 穷尽 Record；
 * 跨图种共用 id（link-mode / link-from-here / edit-text / edit-label / add-note /
 * add-section / delete）的文案留在 i18n 的 canvas.menu。
 */

export const classMenuLabels = {
  'add-class': '添加类',
  'add-member': '添加成员',
  'add-relation': '添加关系',
  'delete-class': '删除类（含成员与关系）',
  'cycle-relation-kind': '切换关系类型',
  'edit-relation': '在属性面板中编辑',
  'delete-relation': '删除关系',
} as const

export const classMenu: DiagramMenuDefinition = {
  blankItems: ['add-class', 'add-note'],
  nodeItems: {
    'class': ['add-member', 'add-relation', 'add-note', 'delete-class'],
    'class-relation': ['cycle-relation-kind', 'edit-relation', 'delete-relation'],
  },
}
