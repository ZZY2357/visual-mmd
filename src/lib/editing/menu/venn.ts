import type { DiagramMenuDefinition } from '../context-menu'

/**
 * venn 右键菜单定义（architecture-deepening-3 工单 04）：空白 = 加集合 / 加交集（more-diagrams 工单 21）；集合 = 改标签与尺寸 / 加集合（追加在其后）/ 加交集（以该集合与下一集合组二元交集）/ 删除；交集 = 改标签与尺寸 / 删除。
 *
 * 菜单项 id 的动作实现统一在 `editing/menu-actions.ts` 的 MENU_ACTIONS 穷尽 Record；
 * 跨图种共用 id（link-mode / link-from-here / edit-text / edit-label / add-note /
 * add-section / delete）的文案留在 i18n 的 canvas.menu。
 */

export const vennMenuLabels = {
  'add-venn-set': '添加集合',
  'add-venn-union': '添加交集',
  'add-venn-union-here': '添加交集',
  'edit-venn-area': '在属性面板中编辑',
} as const

export const vennMenuLabelsEn = {
  'add-venn-set': 'Add set',
  'add-venn-union': 'Add intersection',
  'add-venn-union-here': 'Add intersection',
  'edit-venn-area': 'Edit in property panel',
} as const

export const vennMenu: DiagramMenuDefinition = {
  blankItems: ['add-venn-set', 'add-venn-union'],
  nodeItems: {
    'venn-set': ['edit-venn-area', 'add-venn-set', 'add-venn-union-here', 'delete'],
    'venn-union': ['edit-venn-area', 'delete'],
  },
}
