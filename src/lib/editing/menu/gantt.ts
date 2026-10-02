import type { DiagramMenuDefinition } from '../context-menu'

/**
 * gantt 右键菜单定义（architecture-deepening-3 工单 04）：空白 = 加任务（缺省时长 1d，归属最后一个分组）/ 加分组（more-diagrams 工单 11）。任务条虽可寻址，但元素级编辑不做画布菜单（与 journey/pie 同口径），由结构树选中 + 属性表单承接。
 *
 * 菜单项 id 的动作实现统一在 `editing/menu-actions.ts` 的 MENU_ACTIONS 穷尽 Record；
 * 跨图种共用 id（link-mode / link-from-here / edit-text / edit-label / add-note /
 * add-section / delete）的文案留在 i18n 的 canvas.menu。
 */

export const ganttMenuLabels = {
  'add-gantt-task': '添加任务',
  'add-gantt-section': '添加分组',
} as const

export const ganttMenu: DiagramMenuDefinition = {
  blankItems: ['add-gantt-task', 'add-gantt-section'],
  nodeItems: {
  },
}
