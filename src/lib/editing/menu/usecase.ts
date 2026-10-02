import type { DiagramMenuDefinition } from '../context-menu'

/**
 * usecase 右键菜单定义（architecture-deepening-3 工单 04）：空白 = 加 actor / 加用例 / 加系统边界（more-diagrams 工单 26）；actor / 用例 = 改标签与形状（D5）/ 从这里连线 / 删除（级联删）；边界 = 改标题（D5）/ 删除（级联删 end）；关系 = 改标签与种类（D5）/ 删除；注释 = 删除。
 *
 * 菜单项 id 的动作实现统一在 `editing/menu-actions.ts` 的 MENU_ACTIONS 穷尽 Record；
 * 跨图种共用 id（link-mode / link-from-here / edit-text / edit-label / add-note /
 * add-section / delete）的文案留在 i18n 的 canvas.menu。
 */

export const usecaseMenuLabels = {
  'add-usecase-actor': '添加参与者',
  'add-usecase-case': '添加用例',
  'add-usecase-boundary': '添加系统边界',
  'edit-usecase-element': '在属性面板中编辑',
  'edit-usecase-relation': '在属性面板中编辑',
} as const

export const usecaseMenu: DiagramMenuDefinition = {
  blankItems: ['add-usecase-actor', 'add-usecase-case', 'add-usecase-boundary'],
  nodeItems: {
    'usecase-actor': ['edit-usecase-element', 'link-from-here', 'delete'],
    'usecase-usecase': ['edit-usecase-element', 'link-from-here', 'delete'],
    'usecase-boundary': ['edit-usecase-element', 'delete'],
    'usecase-relation': ['edit-usecase-relation', 'delete'],
    'usecase-note': ['delete'],
  },
}
