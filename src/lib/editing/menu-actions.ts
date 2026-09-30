import type { AnyProjection } from '../diagram-registry'
import type { EditIntent } from '../pipeline/parser'
import type { Selection } from '../projection/selection'
import { selectionOfMenuTarget } from '../canvas-selection/selection-codec'
import { capabilitiesOf } from '../canvas-selection/capabilities'
import type { ContextMenuItemId, ContextMenuTarget } from './context-menu'
import type { CanvasInlineEditTarget } from './inline-edit'
import type { NodeFormKind } from './use-canvas-context-menu'
import { nextNodeId, mindmapActionIntents, applyPlan, type MindmapActionPlan, type KeyPlan } from './canvas-keyboard'
import { nextFreeName } from '../pipeline/element-id'
import { isValidStateId } from '../pipeline/state'
import { isValidErName } from '../pipeline/er'
import { REQUIREMENT_RELATION_KINDS } from '../pipeline/requirement'
import { isValidGitgraphBranchName } from '../pipeline/gitgraph'
import { setRelationIntent, RELATION_KIND_OPTIONS } from './class-forms'
import {
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
  // 按图种算出 KeyPlan，执行统一交给 applyPlan（architecture-deepening-2 工单 02）：
  // 「落码 → 选中 → 内联命名」的编排放策略只在执行器一处定义；菜单关闭在 plan 完整执行后。
  const plan: KeyPlan | null = (() => {
    if (proj.type === 'flowchart') {
      const nodeId = nextNodeId(proj.flowchart.nodes.map((n) => n.nodeId))
      return {
        intents: [{ type: 'add-node', nodeId, text: nodeId, shape: 'rectangle' }],
        newElementTarget: {
          selection: { kind: 'node', nodeId },
          inlineEdit: { kind: 'flowchart', nodeId },
        },
      }
    }
    if (proj.type === 'class') {
      // 空 classDiagram（画布停在解析错误态）同样可用：管线在表头后落一行 `class 新类`，源码随之合法
      const name = nextFreeName('新类', proj.class.classes.map((c) => c.name))
      return {
        intents: [{ type: 'add-class', name }],
        newElementTarget: { selection: { kind: 'class', name }, inlineEdit: { kind: 'class', name } },
      }
    }
    if (proj.type === 'sequence') {
      const actorId = nextFreeName('新参与者', proj.sequence.participants.map((p) => p.actorId))
      return {
        intents: [{ type: 'add-participant', actorId }],
        newElementTarget: {
          selection: { kind: 'participant', actorId },
          inlineEdit: { kind: 'sequence', actorId },
        },
      }
    }
    if (proj.type === 'state') {
      // state 空白：新建顶层状态 + 内联编辑描述（more-diagrams 工单 02）
      const id = nextFreeName('s', proj.state.states.map((s) => s.id))
      if (!isValidStateId(id)) return null
      return {
        intents: [{ type: 'add-state', id }],
        newElementTarget: { selection: { kind: 'state', id }, inlineEdit: { kind: 'state', id } },
      }
    }
    if (proj.type === 'er') {
      // er 空白：新建实体 + 内联编辑别名（more-diagrams 工单 03）
      const name = nextFreeName('新实体', proj.er.entities.map((e) => e.name))
      if (!isValidErName(name)) return null
      return {
        intents: [{ type: 'add-entity', name }],
        newElementTarget: { selection: { kind: 'er-entity', name }, inlineEdit: { kind: 'er', name } },
      }
    }
    if (proj.type === 'gitgraph') {
      // gitGraph（more-diagrams 工单 04）：添加入口是独立的 add-commit / add-branch 动作
      // （语句序即拓扑，无「创建 + 内联命名」形态），不走 createElement
      return null
    }
    if (proj.type === 'requirement') {
      // requirement（more-diagrams 工单 07）：添加入口是独立的 add-requirement /
      // add-requirement-element 动作（type 在表单枚举里选，无「创建 + 内联命名」形态），
      // 不走 createElement
      return null
    }
    // mindmap：节点目标 = 挂为其子节点；空白 / 无目标 = 建根（空文档）或挂到根节点下
    const text = ctx.newNodeText
    let mindPlan: MindmapActionPlan | null
    if (target !== undefined && target.kind === 'mindmap-node') {
      mindPlan = mindmapActionIntents(proj.mindmap, target.elementId, 'add-child', text)
    } else {
      const roots = proj.mindmap.nodes
      mindPlan =
        roots.length === 0
          ? { intents: [{ type: 'add-child', text }], newElementId: 'mindmap-node:1' }
          : mindmapActionIntents(proj.mindmap, roots[0].elementId, 'add-child', text)
    }
    if (mindPlan === null) return null
    const keyPlan: KeyPlan = { intents: mindPlan.intents }
    if (mindPlan.newElementId !== null) {
      keyPlan.newElementTarget = {
        selection: { kind: 'mindmap-node', elementId: mindPlan.newElementId },
        inlineEdit: { kind: 'mindmap', elementId: mindPlan.newElementId },
      }
    }
    return keyPlan
  })()
  if (plan === null) return
  if (!applyPlan(plan, { commitIntent: ctx.commitIntent, select: ctx.select, beginInlineEdit: ctx.beginInlineEdit })) return
  ctx.close()
}

/** 添加子图（flowchart）：空标题落码 `subgraph` + `end` 两行 */
function addSubgraph(ctx: MenuActionContext): void {
  ctx.commitIntent({ type: 'add-subgraph' })
  ctx.close()
}

/**
 * 删除右键目标（architecture-deepening-2 工单 03）：目标先经 selectionOfMenuTarget
 * 转成选中（与「选中该目标」同一份映射），再查能力包的 deleteIntent——
 * 「选中种类 → 删除意图」的唯一映射，与键盘删除 / 属性面板删除共用；
 * 存在性校验（目标已被外部改掉 → null）也在能力包里做，这里不再各写一遍。
 * 原先按 target.kind 分支的 if 链（9 分支 × 手写 delete-* 意图）随之消失。
 */
function deleteTarget(ctx: MenuActionContext, target: ContextMenuTarget | undefined): void {
  if (target === undefined) return
  const proj = ctx.projection
  const selection = selectionOfMenuTarget(target)
  if (proj !== null && selection !== null) {
    const intent = capabilitiesOf(proj).deleteIntent(proj, selection)
    if (intent !== null) ctx.commitIntent(intent)
  }
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
  else if (target.kind === 'state-node') ctx.beginInlineEdit({ kind: 'state', id: target.id })
  else if (target.kind === 'er-entity') ctx.beginInlineEdit({ kind: 'er', name: target.name })
  ctx.close()
}

/**
 * state 复合状态：添加状态进复合内部（more-diagrams 工单 02）。
 * 新状态 id 避重，落码锚点 = 该复合状态的声明（parentElementId 语义，插到匹配 } 之前），
 * 落码成功后选中新状态并进入内联编辑描述。
 */
function addStateIntoComposite(ctx: MenuActionContext, target: ContextMenuTarget | undefined): void {
  const proj = ctx.projection
  if (target === undefined || target.kind !== 'state-node' || proj === null || proj.type !== 'state') return
  const composite = proj.state.states.find((s) => s.id === target.id)
  if (composite === undefined || composite.elementId === null) return
  const id = nextFreeName('s', proj.state.states.map((s) => s.id))
  const plan: KeyPlan = {
    intents: [{ type: 'add-state', id, parentElementId: composite.elementId }],
    newElementTarget: { selection: { kind: 'state', id }, inlineEdit: { kind: 'state', id } },
  }
  if (applyPlan(plan, { commitIntent: ctx.commitIntent, select: ctx.select, beginInlineEdit: ctx.beginInlineEdit })) ctx.close()
}

/** er 关系边：循环切换线型（set-relation 的 line：实线 ↔ 虚线，直接改，不弹表单）。
 * 菜单保持打开，便于连点切换；每次切换是一次独立快照（可撤销）。
 * 基数与标签走「在属性面板中编辑」（枚举选择 + 文本输入，工单 03 定案）。 */
function cycleErLine(ctx: MenuActionContext, target: ContextMenuTarget | undefined): void {
  const proj = ctx.projection
  if (target === undefined || target.kind !== 'er-relation' || proj === null || proj.type !== 'er') return
  const relation = proj.er.relations.find((r) => r.elementId === target.elementId)
  if (relation === undefined) return
  const next = relation.line === 'identifying' ? '..' : '--'
  ctx.commitIntent({ type: 'set-relation', elementId: target.elementId, changes: { line: next } })
}

/** 添加型表单项共用：在菜单位置浮出对应小表单（锚点 / 预选值由 Hook 的 openForm 按目标算出） */
function openFormOf(kind: NodeFormKind): MenuAction {
  return (ctx) => ctx.openForm(kind)
}

/** requirement 关系边：循环切换关系类型（set-relation 的 relationKind，直接改，不弹表单）。
 * 菜单保持打开，便于连点切到想要的那种；每次切换是一次独立快照（可撤销）。 */
function cycleRequirementKind(ctx: MenuActionContext, target: ContextMenuTarget | undefined): void {
  const proj = ctx.projection
  if (target === undefined || target.kind !== 'requirement-relation' || proj === null || proj.type !== 'requirement') return
  const relation = proj.requirement.relations.find((r) => r.elementId === target.elementId)
  if (relation === undefined) return
  const options = REQUIREMENT_RELATION_KINDS.map((value) => ({ value }))
  ctx.commitIntent({
    type: 'set-relation',
    elementId: target.elementId,
    changes: { relationKind: nextInCycle(options, relation.relationKind) },
  })
}

/** requirement 关系边：反转方向（set-relation 的 reversed 取反，直接改）。
 * 语义随之反转（from/to 交换），源码保留原书写方向以外的另一种写法。 */
function invertRequirementRelation(ctx: MenuActionContext, target: ContextMenuTarget | undefined): void {
  const proj = ctx.projection
  if (target === undefined || target.kind !== 'requirement-relation' || proj === null || proj.type !== 'requirement') return
  const relation = proj.requirement.relations.find((r) => r.elementId === target.elementId)
  if (relation === undefined) return
  ctx.commitIntent({
    type: 'set-relation',
    elementId: target.elementId,
    changes: { reversed: !relation.reversed },
  })
}

export const MENU_ACTIONS: Record<Exclude<ContextMenuItemId, 'apply-style'>, MenuAction> = {
  // 「创建 + 选中 + 内联命名」五个入口共用 createElement（工单 01 收敛）
  'add-node': createElement,
  'add-class': createElement,
  'add-participant': createElement,
  'add-root': createElement,
  'add-child': createElement,
  // state（more-diagrams 工单 02）：空白处添加状态，同样走 createElement 的 state 分支
  'add-state': createElement,
  'link-mode': (ctx) => ctx.enterLinkMode(),
  // add-style（空白菜单项）= 打开「添加样式」小表单；apply-style（节点子菜单）才不经分发
  'add-style': (ctx) => ctx.openStyleForm(),
  'link-from-here': (ctx, target) => {
    // narrow 到 flowchart / state / er 节点才能带预选起点进入连线模式
    if (target !== undefined && target.kind === 'flowchart-node') ctx.enterLinkMode(target.nodeId)
    else if (target !== undefined && target.kind === 'state-node') ctx.enterLinkMode(target.id)
    else if (target !== undefined && target.kind === 'er-entity') ctx.enterLinkMode(target.name)
  },
  'add-subgraph': addSubgraph,
  'add-member': openFormOf('member'),
  'add-relation': openFormOf('relation'),
  'add-message': openFormOf('message'),
  'add-note': openFormOf('note'),
  'add-block': openFormOf('block'),
  // er（more-diagrams 工单 03）：add-entity 走 createElement 的 er 分支（空白入口）
  'add-entity': createElement,
  // gitGraph（more-diagrams 工单 04）：空白 = 追加提交 / 新建分支（创建并 checkout）。
  // 语句序即拓扑：追加落码在文档末尾（insertAfter 回退），新元素按位置序/名选中。
  // 分支名自动避重（'branch' 前缀），改名不做（牵动 checkout 语义，工单明确），
  // 故不进内联编辑——选中即可在属性表单看 order。
  'add-commit': (ctx) => {
    const proj = ctx.projection
    if (proj === null || proj.type !== 'gitgraph') return
    const elementId = `commit:${proj.gitgraph.commits.length + 1}`
    if (!ctx.commitIntent({ type: 'add-commit' })) return
    ctx.select({ kind: 'gitgraph-commit', elementId })
    ctx.close()
  },
  'add-branch': (ctx) => {
    const proj = ctx.projection
    if (proj === null || proj.type !== 'gitgraph') return
    const name = nextFreeName('dev', proj.gitgraph.branches.map((b) => b.name))
    if (!isValidGitgraphBranchName(name)) return
    if (!ctx.commitIntent({ type: 'add-branch', name })) return
    ctx.select({ kind: 'gitgraph-branch', name })
    ctx.close()
  },
  'add-attribute': openFormOf('er-attribute'),
  'edit-er-alias': beginEditText,
  'cycle-er-line': cycleErLine,
  'edit-er-relation': selectMenuTargetAndClose,
  'edit-er-attribute': selectMenuTargetAndClose,
  // requirement（more-diagrams 工单 07）：空白 = 加 requirement（type 在添加表单里选）/
  // 加 element；节点 = 改字段（选中该节点在右侧 RequirementForm 里改）/ 从这里连线；
  // 关系 = 循环切换关系类型（直接改，菜单保持打开）/ 反转方向（直接改）
  'add-requirement': openFormOf('requirement-node'),
  'add-requirement-element': openFormOf('requirement-element'),
  'edit-requirement-field': selectMenuTargetAndClose,
  'cycle-requirement-kind': cycleRequirementKind,
  'invert-requirement-relation': invertRequirementRelation,
  // state（more-diagrams 工单 02）：add-state 走 createElement 的 state 分支（空白入口）
  'add-state-into': addStateIntoComposite,
  // 删除组 6 项共用 deleteTarget——直接写 6 行，不引入二级查表
  'delete-class': deleteTarget,
  'delete-participant': deleteTarget,
  'delete-relation': deleteTarget,
  'delete-message': deleteTarget,
  'delete-note': deleteTarget,
  'delete-block': deleteTarget,
  delete: deleteTarget,
  'edit-text': beginEditText,
  // state 状态节点的「编辑描述」与 edit-text 同语义（进入内联编辑）
  'edit-state-desc': beginEditText,
  'edit-label': selectMenuTargetAndClose,
  'edit-relation': selectMenuTargetAndClose,
  'edit-message': selectMenuTargetAndClose,
  'cycle-relation-kind': cycleRelationKind,
  'cycle-message-arrow': cycleMessageArrow,
}
