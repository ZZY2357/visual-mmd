import type { AnyProjection } from '../diagram-registry'
import type { EditIntent } from '../pipeline/parser'
import type { Selection } from '../projection/selection'
import { selectionOfMenuTarget } from '../canvas-selection/selection-codec'
import type { ContextMenuItemId, ContextMenuTarget } from './context-menu'
import type { CanvasInlineEditTarget } from './inline-edit'
import type { NodeFormKind } from './use-canvas-context-menu'
import { nextNodeId, mindmapActionIntents, type MindmapActionPlan } from './canvas-keyboard'
import { nextFreeName } from '../pipeline/element-id'
import { deleteClassIntent, deleteRelationIntent, setRelationIntent, RELATION_KIND_OPTIONS } from './class-forms'
import {
  deleteBlockIntent,
  deleteMessageIntent,
  deleteNoteIntent,
  deleteParticipantIntent,
  setMessageIntent,
  MESSAGE_ARROW_OPTIONS,
} from './sequence-forms'

/**
 * 菜单项动作表（架构工单 05 → architecture-deepening-2 工单 01）：
 *
 * 右键菜单的调用面不再「Hook 返回的方法」，而是一个窄的 **MenuActionContext** 语境对象——
 * 动作实现只消费它（projection / selection / commitIntent / select / openForm /
 * beginInlineEdit / enterLinkMode / newNodeText / close）+ 分发时传入的菜单目标，
 * `use-canvas-context-menu` 不再为每个菜单项返回一个方法（原约 30 成员的上帝接口消失）。
 * 语境由 Hook 现场组装，测试里用替身注入即可脱离渲染 Hook 测分发。
 *
 * 关键收益仍来自 `Record<…, MenuAction>`：漏一项是编译错误，把「菜单能显示但点了没反应」
 * 的运行期静默失败变成类型层不可构造。`apply-style` 不经分发（CanvasPanel 渲染成子菜单
 * 开关，点样式名直接调 Hook 的 applyStyle），此前的占位条目随语境化一并移除。
 *
 * 五个「创建 + 选中 + 进入内联命名」变体（节点 / class / sequence 参与者 / mindmap 根 /
 * mindmap 子节点）收敛为唯一参数化的 `createElement`；「创建进内联命名」的定案见 ADR-0014。
 *
 * 与 `context-menu.ts` 的分工：那里管「菜单长什么样」（target / items），这里管「点了做什么」。
 * 动作表只做分发接线，不内嵌表单 UI（ADR-0001）；语义与原 Hook 方法逐条等价（用户可见行为零变化）。
 */

/** 右键菜单动作消费的窄语境（architecture-deepening-2 工单 01）。
 * 由 `useCanvasContextMenu` 现场组装；单测中用替身对象注入。 */
export interface MenuActionContext {
  /** 当前投影（null = 图尚未就绪，动作安静地不执行） */
  projection: AnyProjection | null
  /** 当前编辑器选中（动作一般不读它；键盘路径工单 02 的 applyPlan 将复用本语境） */
  selection: Selection | null
  /** 提交编辑意图（可撤销）；false = 被拒绝，动作应中止后续步骤 */
  commitIntent: (intent: EditIntent) => boolean
  /** 更新编辑器选中 */
  select: (selection: Selection | null) => void
  /** 在菜单位置浮出添加型小表单（member / relation / message / note / block），提交才落码 */
  openForm: (kind: NodeFormKind) => void
  /** 在菜单位置浮出「添加样式」小表单 */
  openStyleForm: () => void
  /** 进入内联编辑（新建元素的命名 / 菜单「编辑文本」，工单 05 beginEdit） */
  beginInlineEdit: (target: CanvasInlineEditTarget) => void
  /** 进入连线模式（preselectedFrom = 「从这里连线」的预选起点） */
  enterLinkMode: (preselectedFrom?: string) => void
  /** mindmap 新子节点占位文本（确认前落码用） */
  newNodeText: string
  /** 关闭菜单 */
  close: () => void
}

export type MenuAction = (ctx: MenuActionContext, target: ContextMenuTarget | undefined) => void

/** 循环取值（工单 03）：取 options 中 current 的下一项；current 不在表中时取第一项。
 * 用于连线菜单「直接改」的字段（关系类型 / 消息箭头）——不新增表单浮层就能切换取值。 */
function nextInCycle<V>(options: ReadonlyArray<{ value: V }>, current: V): V {
  const i = options.findIndex((o) => o.value === current)
  return options[(i + 1) % options.length].value
}

/**
 * 「创建 + 选中 + 进入内联命名」的唯一参数化实现（architecture-deepening-2 工单 01）。
 * 五个原变体（addNode / addClass / addParticipant / addMindmapRoot / addChildToMindmap）
 * 只是「按图种 + 目标算新元素 → 落码 → 选中 → 内联命名 → 关菜单」的同一编排放了不同参数：
 * - flowchart 空白：新节点 id（nextNodeId），矩形；
 * - class 空白：默认名「新类」避重（nextFreeName，可引用名语义）；
 * - sequence 空白：默认名「新参与者」避重，不生成 alias；
 * - mindmap 空白：空文档建根（elementId 必为 mindmap-node:1），非空挂到根节点下；
 * - mindmap 节点：挂为该节点子节点。
 * 落码位置：空白处不传 afterElementId，由各管线回退到文档最后一个元素。
 */
export function createElement(ctx: MenuActionContext, target: ContextMenuTarget | undefined): void {
  const proj = ctx.projection
  if (proj === null) return
  if (proj.type === 'flowchart') {
    const nodeId = nextNodeId(proj.flowchart.nodes.map((n) => n.nodeId))
    if (!ctx.commitIntent({ type: 'add-node', nodeId, text: nodeId, shape: 'rectangle' })) return
    ctx.select({ kind: 'node', nodeId })
    ctx.beginInlineEdit({ kind: 'flowchart', nodeId })
    ctx.close()
    return
  }
  if (proj.type === 'class') {
    // 空 classDiagram（画布停在解析错误态）同样可用：管线在表头后落一行 `class 新类`，源码随之合法
    const name = nextFreeName('新类', proj.class.classes.map((c) => c.name))
    if (!ctx.commitIntent({ type: 'add-class', name })) return
    ctx.select({ kind: 'class', name })
    ctx.beginInlineEdit({ kind: 'class', name })
    ctx.close()
    return
  }
  if (proj.type === 'sequence') {
    const actorId = nextFreeName('新参与者', proj.sequence.participants.map((p) => p.actorId))
    if (!ctx.commitIntent({ type: 'add-participant', actorId })) return
    ctx.select({ kind: 'participant', actorId })
    ctx.beginInlineEdit({ kind: 'sequence', actorId })
    ctx.close()
    return
  }
  // mindmap：节点目标 = 挂为其子节点；空白 / 无目标 = 建根（空文档）或挂到根节点下
  const text = ctx.newNodeText
  let plan: MindmapActionPlan | null
  if (target !== undefined && target.kind === 'mindmap-node') {
    plan = mindmapActionIntents(proj.mindmap, target.elementId, 'add-child', text)
  } else {
    const roots = proj.mindmap.nodes
    plan =
      roots.length === 0
        ? { intents: [{ type: 'add-child', text }], newElementId: 'mindmap-node:1' }
        : mindmapActionIntents(proj.mindmap, roots[0].elementId, 'add-child', text)
  }
  if (plan === null) return
  for (const intent of plan.intents) {
    if (!ctx.commitIntent(intent)) return
  }
  if (plan.newElementId !== null) {
    ctx.select({ kind: 'mindmap-node', elementId: plan.newElementId })
    ctx.beginInlineEdit({ kind: 'mindmap', elementId: plan.newElementId })
  }
  ctx.close()
}

/** 添加子图（flowchart）：空标题落码 `subgraph` + `end` 两行 */
function addSubgraph(ctx: MenuActionContext): void {
  ctx.commitIntent({ type: 'add-subgraph' })
  ctx.close()
}

/** 删除右键目标（节点/连线/mindmap 节点/类/参与者/位置序连线与块级元素） */
function deleteTarget(ctx: MenuActionContext, target: ContextMenuTarget | undefined): void {
  if (target === undefined) return
  if (target.kind === 'flowchart-node') ctx.commitIntent({ type: 'delete-node', nodeId: target.nodeId })
  else if (target.kind === 'flowchart-edge')
    ctx.commitIntent({ type: 'delete-edge', from: target.from, to: target.to, occurrence: target.occurrence })
  else if (target.kind === 'mindmap-node') ctx.commitIntent({ type: 'delete-node', elementId: target.elementId })
  else if (target.kind === 'class-node') ctx.commitIntent(deleteClassIntent(target.name))
  else if (target.kind === 'sequence-participant') ctx.commitIntent(deleteParticipantIntent(target.actorId))
  else if (target.kind === 'class-relation') ctx.commitIntent(deleteRelationIntent(target.elementId))
  else if (target.kind === 'sequence-message') ctx.commitIntent(deleteMessageIntent(target.elementId))
  else if (target.kind === 'sequence-note') ctx.commitIntent(deleteNoteIntent(target.elementId))
  else if (target.kind === 'sequence-block') ctx.commitIntent(deleteBlockIntent(target.elementId))
  ctx.select(null)
  ctx.close()
}

/** class 关系边：循环切换关系类型（set-relation 的 kind，直接改，不弹表单）。
 * 菜单保持打开，便于连点切到想要的那种；每次切换是一次独立快照（可撤销）。 */
function cycleRelationKind(ctx: MenuActionContext, target: ContextMenuTarget | undefined): void {
  const proj = ctx.projection
  if (target === undefined || target.kind !== 'class-relation' || proj === null || proj.type !== 'class') return
  const relation = proj.class.relations.find((r) => r.elementId === target.elementId)
  if (relation === undefined) return
  ctx.commitIntent(setRelationIntent(target.elementId, { kind: nextInCycle(RELATION_KIND_OPTIONS, relation.kind) }))
}

/** sequence 消息：循环切换箭头（set-message 的 arrow，直接改，不弹表单）。菜单保持打开。 */
function cycleMessageArrow(ctx: MenuActionContext, target: ContextMenuTarget | undefined): void {
  const proj = ctx.projection
  if (target === undefined || target.kind !== 'sequence-message' || proj === null || proj.type !== 'sequence') return
  const message = proj.sequence.messages.find((m) => m.elementId === target.elementId)
  if (message === undefined) return
  ctx.commitIntent(setMessageIntent(target.elementId, { arrow: nextInCycle(MESSAGE_ARROW_OPTIONS, message.arrow) }))
}

/**
 * 编辑类菜单项的语义（工单 05 定案 D5，工单 06 补上 flowchart 连线）：**选中该连线 + 关闭菜单**，
 * 字段编辑在右侧属性面板完成（ADR-0001 表单驱动编辑）。三个菜单项 id 各自存在是因为目标种类不同
 * （见 `contextMenuItems`），语义则共用这一份。
 */
function selectMenuTargetAndClose(ctx: MenuActionContext, target: ContextMenuTarget | undefined): void {
  if (target !== undefined) {
    const selection = selectionOfMenuTarget(target)
    if (selection !== null) ctx.select(selection)
  }
  ctx.close()
}

/** 编辑文本（菜单项）：进入内联编辑（预填当前显示文本） */
function beginEditText(ctx: MenuActionContext, target: ContextMenuTarget | undefined): void {
  if (target === undefined) return
  if (target.kind === 'flowchart-node') ctx.beginInlineEdit({ kind: 'flowchart', nodeId: target.nodeId })
  else if (target.kind === 'mindmap-node') ctx.beginInlineEdit({ kind: 'mindmap', elementId: target.elementId })
  ctx.close()
}

/** 添加型表单项共用：在菜单位置浮出对应小表单（锚点 / 预选值由 Hook 的 openForm 按目标算出） */
function openFormOf(kind: NodeFormKind): MenuAction {
  return (ctx) => ctx.openForm(kind)
}

export const MENU_ACTIONS: Record<Exclude<ContextMenuItemId, 'apply-style'>, MenuAction> = {
  // 「创建 + 选中 + 内联命名」五个入口共用 createElement（工单 01 收敛）
  'add-node': createElement,
  'add-class': createElement,
  'add-participant': createElement,
  'add-root': createElement,
  'add-child': createElement,
  'link-mode': (ctx) => ctx.enterLinkMode(),
  // add-style（空白菜单项）= 打开「添加样式」小表单；apply-style（节点子菜单）才不经分发
  'add-style': (ctx) => ctx.openStyleForm(),
  'link-from-here': (ctx, target) => {
    // narrow 到 flowchart 节点才能带预选起点进入连线模式
    if (target !== undefined && target.kind === 'flowchart-node') ctx.enterLinkMode(target.nodeId)
  },
  'add-subgraph': addSubgraph,
  'add-member': openFormOf('member'),
  'add-relation': openFormOf('relation'),
  'add-message': openFormOf('message'),
  'add-note': openFormOf('note'),
  'add-block': openFormOf('block'),
  // 删除组 6 项共用 deleteTarget——直接写 6 行，不引入二级查表
  'delete-class': deleteTarget,
  'delete-participant': deleteTarget,
  'delete-relation': deleteTarget,
  'delete-message': deleteTarget,
  'delete-note': deleteTarget,
  'delete-block': deleteTarget,
  delete: deleteTarget,
  'edit-text': beginEditText,
  'edit-label': selectMenuTargetAndClose,
  'edit-relation': selectMenuTargetAndClose,
  'edit-message': selectMenuTargetAndClose,
  'cycle-relation-kind': cycleRelationKind,
  'cycle-message-arrow': cycleMessageArrow,
}
