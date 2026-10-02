import type { DiagramMenuDefinition } from '../context-menu'

/**
 * agentflow 右键菜单定义（architecture-deepening-3 工单 04）：空白 = 加节点 / 加 flow 容器（more-diagrams 工单 27）；节点 = 改文本（D5）/ 从这里连线 / 删除；边 = 改标签（D5）/ 删除；容器 = 改标题（D5）/ 删除；文档行 = 删除。
 *
 * 菜单项 id 的动作实现统一在 `editing/menu-actions.ts` 的 MENU_ACTIONS 穷尽 Record；
 * 跨图种共用 id（link-mode / link-from-here / edit-text / edit-label / add-note /
 * add-section / delete）的文案留在 i18n 的 canvas.menu。
 */

export const agentflowMenu: DiagramMenuDefinition = {
  blankItems: ['add-agentflow-node', 'add-agentflow-flow'],
  nodeItems: {
    'agentflow-node': ['edit-agentflow-node', 'link-from-here', 'delete'],
    'agentflow-edge': ['edit-label', 'delete'],
    'agentflow-flow': ['edit-agentflow-flow', 'delete'],
    'agentflow-doc': ['delete'],
  },
}
