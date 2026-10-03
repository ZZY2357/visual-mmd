import type { DiagramMenuDefinition } from '../context-menu'

/**
 * requirement 右键菜单定义（architecture-deepening-3 工单 04）：空白 = 加 requirement（type 在添加表单里选）/ 加 element（more-diagrams 工单 07）；节点 = 改字段（选中该节点在右侧表单编辑）/ 从这里连线 / 删除；关系 = 切换关系类型（直接改）/ 反转方向（直接改）/ 删除。
 *
 * 菜单项 id 的动作实现统一在 `editing/menu-actions.ts` 的 MENU_ACTIONS 穷尽 Record；
 * 跨图种共用 id（link-mode / link-from-here / edit-text / edit-label / add-note /
 * add-section / delete）的文案留在 i18n 的 canvas.menu。
 */

export const requirementMenuLabels = {
  'add-requirement': '添加 requirement',
  'add-requirement-element': '添加元素',
  'edit-requirement-field': '在属性面板中编辑',
  'cycle-requirement-kind': '切换关系类型',
  'invert-requirement-relation': '反转方向',
} as const

export const requirementMenuLabelsEn = {
  'add-requirement': 'Add requirement',
  'add-requirement-element': 'Add element',
  'edit-requirement-field': 'Edit in property panel',
  'cycle-requirement-kind': 'Cycle relation kind',
  'invert-requirement-relation': 'Invert direction',
} as const

export const requirementMenu: DiagramMenuDefinition = {
  blankItems: ['add-requirement', 'add-requirement-element'],
  nodeItems: {
    'requirement': ['edit-requirement-field', 'link-from-here', 'delete'],
    'requirement-element': ['edit-requirement-field', 'link-from-here', 'delete'],
    'requirement-relation': ['cycle-requirement-kind', 'invert-requirement-relation', 'delete'],
  },
}
