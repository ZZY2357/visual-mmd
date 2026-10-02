import type { DiagramMenuDefinition } from '../context-menu'

/**
 * architecture 右键菜单定义（architecture-deepening-3 工单 04）：空白 = 加 service / 加 group / 加 junction（more-diagrams 工单 17）；service = 改标题（内联）/ 图标与分组（D5）/ 从这里连线 / 删除；group = 改标题（内联）/ 删除；边 = 改端口与箭头（D5）/ 删除。
 *
 * 菜单项 id 的动作实现统一在 `editing/menu-actions.ts` 的 MENU_ACTIONS 穷尽 Record；
 * 跨图种共用 id（link-mode / link-from-here / edit-text / edit-label / add-note /
 * add-section / delete）的文案留在 i18n 的 canvas.menu。
 */

export const architectureMenuLabels = {
  'add-architecture-service': '添加服务',
  'add-architecture-group': '添加分组',
  'add-architecture-junction': '添加接合点',
  'edit-architecture-service': '在属性面板中编辑',
  'edit-architecture-edge': '在属性面板中编辑',
} as const

export const architectureMenu: DiagramMenuDefinition = {
  blankItems: ['add-architecture-service', 'add-architecture-group', 'add-architecture-junction'],
  nodeItems: {
    'architecture-service': ['edit-text', 'edit-architecture-service', 'link-from-here', 'delete'],
    'architecture-group': ['edit-text', 'delete'],
    'architecture-junction': ['delete'],
    'architecture-edge': ['edit-architecture-edge', 'delete'],
  },
}
