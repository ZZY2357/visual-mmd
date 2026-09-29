import type { ContextMenuItemId, ContextMenuTarget } from './context-menu'
import type { useCanvasContextMenu } from './use-canvas-context-menu'

/**
 * 菜单项动作表（架构工单 05）：右键菜单的动作分发从 CanvasPanel 里 26 分支的
 * if-else 链（无 default，漏一项 = 点击静默无反应）改成查表。
 *
 * 关键收益来自 `Record<ContextMenuItemId, MenuAction>`：漏一项是编译错误，
 * 把「菜单能显示但点了没反应」的运行期静默失败变成类型层不可构造。
 *
 * 与 `context-menu.ts` 的分工（工单 Decision）：那里管「菜单长什么样」
 * （target / items），这里管「点了做什么」；变化频率不同，不合并。
 *
 * 动作表只做分发接线，不内嵌表单 UI（ADR-0001）；语义与原分支链逐条等价。
 */

/** 动作上下文：`useCanvasContextMenu` 的返回对象（CanvasPanel 现场持有的那个 ctx） */
export type CanvasMenuContext = ReturnType<typeof useCanvasContextMenu>

export type MenuAction = (ctx: CanvasMenuContext, target: ContextMenuTarget | undefined) => void

export const MENU_ACTIONS: Record<ContextMenuItemId, MenuAction> = {
  'add-node': (ctx) => ctx.addNode(),
  'link-mode': (ctx) => ctx.enterLinkMode(),
  'add-style': (ctx) => ctx.openStyleForm(),
  'add-subgraph': (ctx) => ctx.addSubgraph(),
  'add-class': (ctx) => ctx.addClass(),
  'add-participant': (ctx) => ctx.addParticipant(),
  'add-root': (ctx) => ctx.addMindmapRoot(),
  'add-member': (ctx) => ctx.addMember(),
  'add-relation': (ctx) => ctx.addRelation(),
  'add-message': (ctx) => ctx.addMessage(),
  'add-note': (ctx) => ctx.addNote(),
  'add-block': (ctx) => ctx.addBlock(),
  // 删除组 6 项共用 ctx.deleteTarget()——直接写 6 行，不引入二级查表
  'delete-class': (ctx) => ctx.deleteTarget(),
  'delete-participant': (ctx) => ctx.deleteTarget(),
  'delete-relation': (ctx) => ctx.deleteTarget(),
  'delete-message': (ctx) => ctx.deleteTarget(),
  'delete-note': (ctx) => ctx.deleteTarget(),
  'delete-block': (ctx) => ctx.deleteTarget(),
  // 唯一依赖 target 的动作：narrow 到 flowchart 节点才能进入连线模式
  'link-from-here': (ctx, target) => {
    if (target !== undefined && target.kind === 'flowchart-node') ctx.enterLinkMode(target.nodeId)
  },
  'edit-text': (ctx) => ctx.beginEditText(),
  'edit-label': (ctx) => ctx.beginEditLabel(),
  delete: (ctx) => ctx.deleteTarget(),
  'add-child': (ctx) => ctx.addChildToMindmap(),
  // apply-style 不经 onMenuItem 分发：CanvasPanel 把它渲染成子菜单开关，
  // 点具体样式名时直接调 ctx.applyStyle(name)。此键仅为 Record 穷尽性存在，不可达。
  'apply-style': () => undefined,
  'cycle-relation-kind': (ctx) => ctx.cycleRelationKind(),
  'edit-relation': (ctx) => ctx.editRelation(),
  'cycle-message-arrow': (ctx) => ctx.cycleMessageArrow(),
  'edit-message': (ctx) => ctx.editMessage(),
}
