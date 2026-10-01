import type { AnyProjection } from '../diagram-registry'
import type { EditIntent } from '../pipeline/parser'
import type { Selection } from '../projection/selection'
import { selectionOfMenuTarget } from '../canvas-selection/selection-codec'
import { capabilitiesOf } from '../canvas-selection/capabilities'
import type { ContextMenuItemId, ContextMenuTarget } from './context-menu'
import type { CanvasInlineEditTarget } from './inline-edit'
import type { NodeFormKind } from './use-canvas-context-menu'
import { nextNodeId, mindmapActionIntents, applyPlan, type MindmapActionPlan, type KeyPlan } from './canvas-keyboard'
import { kanbanCardElementId, kanbanColumnElementId, nextFreeName } from '../pipeline/element-id'
import { isValidStateId } from '../pipeline/state'
import { isValidErName } from '../pipeline/er'
import { REQUIREMENT_RELATION_KINDS } from '../pipeline/requirement'
import { isValidGitgraphBranchName } from '../pipeline/gitgraph'
import { isValidTimelineSectionName, type TimelineIntent } from '../pipeline/timeline'
import { isValidJourneySectionName, isValidJourneyTaskName, type JourneyIntent } from '../pipeline/journey'
import { isValidPieLabel, type PieIntent } from '../pipeline/pie'
import { isValidGanttSectionName, isValidGanttTaskName, type GanttIntent } from '../pipeline/gantt'
import { isValidQuadrantPointText, type QuadrantIntent } from '../pipeline/quadrant'
import { isValidRadarId, nextRadarId, type RadarIntent } from '../pipeline/radar'
import { isValidKanbanId } from '../pipeline/kanban'
import { isValidBlockId } from '../pipeline/block'
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
    if (proj.type === 'timeline') {
      // timeline 的创建动作（加时期 / 加分组 / 加事件）由专用动作实现，不经 createElement
      return null
    }
    if (proj.type === 'kanban') {
      // kanban 空白：新建列 + 内联编辑标题（more-diagrams 工单 06）。
      // id 全局唯一（列 + 卡片一起避重），显示标题与语法 id 分离——用户改的是 [] 内文本。
      const used = [...proj.kanban.columns.map((c) => c.id), ...proj.kanban.cards.map((c) => c.id)]
      const id = nextFreeName('col', used)
      if (!isValidKanbanId(id)) return null
      return {
        intents: [{ type: 'add-column', id, title: '新列' }],
        newElementTarget: {
          selection: { kind: 'kanban-column', elementId: kanbanColumnElementId(id) },
          inlineEdit: { kind: 'kanban-column', elementId: kanbanColumnElementId(id) },
        },
      }
    }
    if (proj.type === 'requirement') {
      // requirement（more-diagrams 工单 07）：添加入口是独立的 add-requirement /
      // add-requirement-element 动作（type 在表单枚举里选，无「创建 + 内联命名」形态），
      // 不走 createElement
      return null
    }
    if (proj.type === 'journey') {
      // journey（more-diagrams 工单 08）：添加入口是独立的 add-journey-task /
      // add-journey-section 动作（不做内联编辑——画布无 data-id，工单降级定案），
      // 不走 createElement
      return null
    }
    if (proj.type === 'pie') {
      // pie（more-diagrams 工单 10）：添加入口是独立的 add-pie-sector 动作
      // （不做内联编辑——画布无 data-id，工单降级定案），不走 createElement
      return null
    }
    if (proj.type === 'sankey') {
      // sankey（more-diagrams 工单 13）：添加入口是独立的 add-sankey-link 动作
      // （三列表单浮出，提交才落码；链路才有落码语法，无「创建节点」形态），不走 createElement
      return null
    }
    if (proj.type === 'xychart') {
      // xychart（more-diagrams 工单 14）：添加入口是独立的 add-xychart-line / add-xychart-bar
      // 动作（表单浮出，提交才落码；系列才有「创建」形态，轴/标题是文档级属性），不走 createElement
      return null
    }
    if (proj.type === 'block') {
      // block（more-diagrams 工单 09）：空白 = 新建顶层块节点 + 内联编辑标签；
      // 嵌套块上 = 新建块节点落进该组（锚点 = 组声明行）。id 全局避重（节点与
      // 嵌套块共享 id 名空间——mermaid 的 blockDatabase 是一张 Map）。
      const used = [...proj.block.nodes.map((n) => n.id), ...proj.block.groups.map((g) => g.id)]
      const id = nextFreeName('b', used)
      if (!isValidBlockId(id)) return null
      const parentGroupId =
        target !== undefined && target.kind === 'block-group' ? target.id : null
      const anchor =
        target !== undefined && target.kind === 'block-group'
          ? (proj.block.groups.find((g) => g.id === target.id)?.elementId ?? undefined)
          : undefined
      return {
        intents: [{ type: 'add-node', id, shape: 'square', label: id, parentGroupId, afterElementId: anchor }],
        newElementTarget: {
          selection: { kind: 'block-node', id },
          inlineEdit: { kind: 'block-node', id },
        },
      }
    }
    if (proj.type === 'gantt') {
      // gantt（more-diagrams 工单 11）：添加入口是独立的 add-gantt-task /
      // add-gantt-section 动作（添加路径不做内联命名；改名走双击内联编辑/表单），不走 createElement
      return null
    }
    if (proj.type === 'quadrant') {
      // quadrant（more-diagrams 工单 12）：添加入口是独立的 add-quadrant-point 动作
      //（坐标落 0.5, 0.5 + 内联命名文本），不走 createElement
      return null
    }
    if (proj.type === 'radar') {
      // radar（more-diagrams 工单 15）：添加入口是独立的 add-radar-axis /
      // add-radar-curve 动作（画布无 data-id，不做内联命名），不走 createElement
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
  // kanban（more-diagrams 工单 06）：列 = 改标题、卡片 = 改描述（都是内联编辑显示文本）
  else if (target.kind === 'kanban-column') ctx.beginInlineEdit({ kind: 'kanban-column', elementId: target.elementId })
  else if (target.kind === 'kanban-card') ctx.beginInlineEdit({ kind: 'kanban-card', elementId: target.elementId })
  // block（more-diagrams 工单 09）：块节点改标签（内联编辑，set-node-label 落码）
  else if (target.kind === 'block-node') ctx.beginInlineEdit({ kind: 'block-node', id: target.id })
  // quadrant（more-diagrams 工单 12）：点 = 改文本（内联编辑显示文本）
  else if (target.kind === 'quadrant-point') ctx.beginInlineEdit({ kind: 'quadrant-point', elementId: target.elementId })
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

// ---------- timeline（more-diagrams 工单 05） ----------

/**
 * 空白处加时期（timeline）：落一行时期 + 选中新时期（不做内联编辑——事件/时期无 inline-edit，
 * 文本在右侧属性表单改）。新时期的 elementId 按 `period:N` 位置序预测（追加在文档末尾 =
 * 时期总数 + 1）。
 */
function addTimelinePeriod(ctx: MenuActionContext): void {
  const proj = ctx.projection
  if (proj === null || proj.type !== 'timeline') return
  const text = nextFreeName('新阶段', proj.timeline.periods.map((p) => p.text))
  const plan: KeyPlan = {
    intents: [{ type: 'add-period', text } satisfies TimelineIntent],
    newElementTarget: {
      selection: { kind: 'timeline-period', elementId: `period:${proj.timeline.nextPeriodOrdinal}` },
    },
  }
  if (applyPlan(plan, { commitIntent: ctx.commitIntent, select: ctx.select })) ctx.close()
}

/** 空白处加分组 section（timeline）：落一行 `section 名称` + 选中新分组 */
function addTimelineSection(ctx: MenuActionContext): void {
  const proj = ctx.projection
  if (proj === null || proj.type !== 'timeline') return
  if (!isValidTimelineSectionName('新分组')) return
  const plan: KeyPlan = {
    intents: [{ type: 'add-section', name: '新分组' } satisfies TimelineIntent],
    newElementTarget: {
      selection: { kind: 'timeline-section', elementId: `section:${proj.timeline.sections.length + 1}` },
    },
  }
  if (applyPlan(plan, { commitIntent: ctx.commitIntent, select: ctx.select })) ctx.close()
}

/** 时期上加事件（timeline）：落续行 `: 文本` + 选中新事件（不做内联编辑） */
function addTimelineEvent(ctx: MenuActionContext, target: ContextMenuTarget | undefined): void {
  const proj = ctx.projection
  if (target === undefined || target.kind !== 'timeline-period' || proj === null || proj.type !== 'timeline') return
  const period = proj.timeline.periods.find((p) => p.elementId === target.elementId)
  if (period === undefined) return
  const text = nextFreeName('新事件', period.events.map((e) => e.text))
  const plan: KeyPlan = {
    intents: [{ type: 'add-event', periodElementId: period.elementId, text } satisfies TimelineIntent],
    newElementTarget: {
      selection: { kind: 'timeline-event', elementId: `event:${period.nextEventOrdinal}` },
    },
  }
  if (applyPlan(plan, { commitIntent: ctx.commitIntent, select: ctx.select })) ctx.close()
}

/**
 * kanban 列上加卡片（more-diagrams 工单 06）：在右键的那一列末尾追加一张卡片，
 * 落码成功后选中它并进入内联编辑描述。id 全局唯一（列 + 卡片一起避重）。
 */
function addKanbanCard(ctx: MenuActionContext, target: ContextMenuTarget | undefined): void {
  const proj = ctx.projection
  if (target === undefined || target.kind !== 'kanban-column' || proj === null || proj.type !== 'kanban') return
  const column = proj.kanban.columns.find((c) => c.elementId === target.elementId)
  if (column === undefined) return
  const used = [...proj.kanban.columns.map((c) => c.id), ...proj.kanban.cards.map((c) => c.id)]
  const id = nextFreeName('t', used)
  if (!isValidKanbanId(id)) return
  const plan: KeyPlan = {
    intents: [{ type: 'add-card', columnElementId: column.elementId, id, description: '新卡片' }],
    newElementTarget: {
      selection: { kind: 'kanban-card', elementId: kanbanCardElementId(id) },
      inlineEdit: { kind: 'kanban-card', elementId: kanbanCardElementId(id) },
    },
  }
  if (applyPlan(plan, { commitIntent: ctx.commitIntent, select: ctx.select, beginInlineEdit: ctx.beginInlineEdit })) {
    ctx.close()
  }
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

// ---------- journey（more-diagrams 工单 08） ----------

/**
 * 空白处加任务（journey）：落一行「新任务: 3」+ 选中新任务（无 actor 段，score 取中位 3）。
 * 锚点 = 最后一个 section 的末尾（其最后一个任务 ?? section 行）——mermaid 按书写位置
 * 归组，锚到「文档最后一个元素」会落进倒数第二个 section（它后面还有空 section 行）；
 * 无 section 时无锚点（回退文档末尾，归属空分组）。不做内联编辑（journey 画布无
 * data-id，工单降级定案）——名字/score/actors 在右侧表单改。
 */
function addJourneyTask(ctx: MenuActionContext): void {
  const proj = ctx.projection
  if (proj === null || proj.type !== 'journey') return
  const name = nextFreeName('新任务', proj.journey.tasks.map((t) => t.name))
  if (!isValidJourneyTaskName(name)) return
  const lastSection = proj.journey.sections[proj.journey.sections.length - 1]
  const plan: KeyPlan = {
    intents: [
      {
        type: 'add-task',
        name,
        score: 3,
        actors: [],
        sectionElementId: lastSection?.elementId,
      } satisfies JourneyIntent,
    ],
    newElementTarget: {
      selection: { kind: 'journey-task', elementId: `task:${proj.journey.nextTaskOrdinal}` },
    },
  }
  if (applyPlan(plan, { commitIntent: ctx.commitIntent, select: ctx.select })) ctx.close()
}

/** 空白处加分组 section（journey）：落一行 `section 名称` + 选中新分组 */
function addJourneySection(ctx: MenuActionContext): void {
  const proj = ctx.projection
  if (proj === null || proj.type !== 'journey') return
  const name = nextFreeName('新分组', proj.journey.sections.map((s) => s.name))
  if (!isValidJourneySectionName(name)) return
  const plan: KeyPlan = {
    intents: [{ type: 'add-section', name } satisfies JourneyIntent],
    newElementTarget: {
      selection: { kind: 'journey-section', elementId: `section:${proj.journey.nextSectionOrdinal}` },
    },
  }
  if (applyPlan(plan, { commitIntent: ctx.commitIntent, select: ctx.select })) ctx.close()
}

// ---------- pie（more-diagrams 工单 10） ----------

/**
 * 空白处加扇区（pie）：落一行 `"新扇区" : 1` + 选中新扇区（标签避重，数值取 1——
 * 可在右侧表单改）。不做内联编辑（pie 画布无 data-id，工单降级定案）——
 * 标签/数值在右侧表单改。
 */
function addPieSector(ctx: MenuActionContext): void {
  const proj = ctx.projection
  if (proj === null || proj.type !== 'pie') return
  const label = nextFreeName('新扇区', proj.pie.sectors.map((s) => s.label))
  if (!isValidPieLabel(label)) return
  const plan: KeyPlan = {
    intents: [{ type: 'add-sector', label, value: '1' } satisfies PieIntent],
    newElementTarget: {
      selection: { kind: 'pie-sector', elementId: `sector:${proj.pie.nextSectorOrdinal}` },
    },
  }
  if (applyPlan(plan, { commitIntent: ctx.commitIntent, select: ctx.select })) ctx.close()
}

// ---------- xychart（more-diagrams 工单 14） ----------

/**
 * 系列：切换类型 line↔bar（set-series-type，直接改关键字，不弹表单）。
 * 菜单保持打开，便于连点来回切；每次切换是一次独立快照（可撤销）。
 */
function toggleXychartSeriesType(ctx: MenuActionContext, target: ContextMenuTarget | undefined): void {
  const proj = ctx.projection
  if (target === undefined || target.kind !== 'xychart-series' || proj === null || proj.type !== 'xychart') return
  const series = proj.xychart.series.find((s) => s.elementId === target.elementId)
  if (series === undefined) return
  ctx.commitIntent({
    type: 'set-series-type',
    elementId: target.elementId,
    seriesType: series.seriesType === 'bar' ? 'line' : 'bar',
  })
}

/** block 空白加嵌套块（more-diagrams 工单 09）：落 `block:gid` + `end` 两行，
 * 选中新组（组无标签，不做内联命名——宽度/列数在右侧属性表单改）。id 全局避重。 */
function addBlockGroup(ctx: MenuActionContext): void {
  const proj = ctx.projection
  if (proj === null || proj.type !== 'block') return
  const used = [...proj.block.nodes.map((n) => n.id), ...proj.block.groups.map((g) => g.id)]
  const id = nextFreeName('g', used)
  if (!isValidBlockId(id)) return
  const plan: KeyPlan = {
    intents: [{ type: 'add-group', id }],
    newElementTarget: { selection: { kind: 'block-group', id } },
  }
  if (applyPlan(plan, { commitIntent: ctx.commitIntent, select: ctx.select })) ctx.close()
}

// ---------- gantt（more-diagrams 工单 11） ----------

/**
 * 空白处加任务（gantt，与 addJourneyTask 同构）：落一行「新任务: 1d」（时长缺省，
 * 起点继承上一任务）+ 选中新任务。锚点 = 最后一个 section 的末尾（其最后一个任务 ??
 * section 行）——mermaid 按书写位置归组，锚到「文档最后一个元素」会落进倒数第二个
 * section；无 section 时无锚点（回退文档末尾，归属空分组）。添加路径不做内联命名——
 * 改名走双击内联编辑 / 右侧表单。
 */
function addGanttTask(ctx: MenuActionContext): void {
  const proj = ctx.projection
  if (proj === null || proj.type !== 'gantt') return
  const name = nextFreeName('新任务', proj.gantt.tasks.map((t) => t.name))
  if (!isValidGanttTaskName(name)) return
  const lastSection = proj.gantt.sections[proj.gantt.sections.length - 1]
  const plan: KeyPlan = {
    intents: [
      {
        type: 'add-task',
        name,
        sectionElementId: lastSection?.elementId,
      } satisfies GanttIntent,
    ],
    newElementTarget: {
      selection: { kind: 'gantt-task', elementId: `task:${proj.gantt.nextTaskOrdinal}` },
    },
  }
  if (applyPlan(plan, { commitIntent: ctx.commitIntent, select: ctx.select })) ctx.close()
}

/** 空白处加分组 section（gantt）：落一行 `section 名称` + 选中新分组 */
function addGanttSection(ctx: MenuActionContext): void {
  const proj = ctx.projection
  if (proj === null || proj.type !== 'gantt') return
  const name = nextFreeName('新分组', proj.gantt.sections.map((s) => s.name))
  if (!isValidGanttSectionName(name)) return
  const plan: KeyPlan = {
    intents: [{ type: 'add-section', name } satisfies GanttIntent],
    newElementTarget: {
      selection: { kind: 'gantt-section', elementId: `section:${proj.gantt.nextSectionOrdinal}` },
    },
  }
  if (applyPlan(plan, { commitIntent: ctx.commitIntent, select: ctx.select })) ctx.close()
}

// ---------- quadrant（more-diagrams 工单 12） ----------

/**
 * 空白处加点（quadrant）：落一行 `新点: [0.5, 0.5]` + 选中新点（文本避重，坐标取图正中
 * 0.5, 0.5——可在右侧表单/画布拖改）。点有 data-id 寻址（工单 12 实测位置序反注可行），
 * 落码成功后进入内联命名（与 kanban 同形态）。
 */
function addQuadrantPoint(ctx: MenuActionContext): void {
  const proj = ctx.projection
  if (proj === null || proj.type !== 'quadrant') return
  const text = nextFreeName('新点', proj.quadrant.points.map((p) => p.text))
  if (!isValidQuadrantPointText(text)) return
  const elementId = `point:${proj.quadrant.nextPointOrdinal}`
  const plan: KeyPlan = {
    intents: [{ type: 'add-point', text, x: '0.5', y: '0.5' } satisfies QuadrantIntent],
    newElementTarget: {
      selection: { kind: 'quadrant-point', elementId },
      inlineEdit: { kind: 'quadrant-point', elementId },
    },
  }
  if (
    applyPlan(plan, {
      commitIntent: ctx.commitIntent,
      select: ctx.select,
      beginInlineEdit: ctx.beginInlineEdit,
    })
  ) {
    ctx.close()
  }
}

// ---------- radar（more-diagrams 工单 15） ----------

/**
 * 空白处加轴（radar）：追加一个新轴段（占位 id 与占位标签「新轴」由管线负责）+
 * 选中新轴。锚点 = 最后一条轴行（多轴行时新轴落在最后，mermaid 按书写顺序收集轴）；
 * 无轴时无锚点（回退文档末尾）。不做内联编辑（画布无 data-id）。
 */
function addRadarAxis(ctx: MenuActionContext): void {
  const proj = ctx.projection
  if (proj === null || proj.type !== 'radar') return
  const id = nextRadarId('axis', proj.radar.axes.map((a) => a.id))
  if (!isValidRadarId(id)) return
  const lastAxis = proj.radar.axes[proj.radar.axes.length - 1]
  const plan: KeyPlan = {
    intents: [
      { type: 'add-axis', id, afterElementId: lastAxis?.elementId } satisfies RadarIntent,
    ],
    newElementTarget: {
      selection: { kind: 'radar-axis', elementId: `axis:${proj.radar.nextAxisOrdinal}` },
    },
  }
  if (applyPlan(plan, { commitIntent: ctx.commitIntent, select: ctx.select })) ctx.close()
}

/**
 * 空白处加曲线（radar）：追加一条键值形态新曲线（占位 id 与标签「新曲线」由管线负责；
 * 对每轴补 `axisId: 0` 条目——mermaid computeCurveEntries 缺条目抛错，新曲线必须
 * 全轴有值）+ 选中新曲线。不做内联编辑（画布无 data-id）。
 */
function addRadarCurve(ctx: MenuActionContext): void {
  const proj = ctx.projection
  if (proj === null || proj.type !== 'radar') return
  const id = nextRadarId('curve', proj.radar.curves.map((c) => c.id))
  if (!isValidRadarId(id)) return
  const lastCurve = proj.radar.curves[proj.radar.curves.length - 1]
  const plan: KeyPlan = {
    intents: [
      { type: 'add-curve', id, afterElementId: lastCurve?.elementId } satisfies RadarIntent,
    ],
    newElementTarget: {
      selection: { kind: 'radar-curve', elementId: `curve:${proj.radar.nextCurveOrdinal}` },
    },
  }
  if (applyPlan(plan, { commitIntent: ctx.commitIntent, select: ctx.select })) ctx.close()
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
  // block（more-diagrams 工单 09）：add-block-node 走 createElement 的 block 分支
  // （空白 = 顶层节点 / 嵌套块上 = 落进组内）；add-block-group = 落 `block:gid` + `end` 两行
  'add-block-node': createElement,
  'add-block-group': addBlockGroup,
  // sankey（more-diagrams 工单 13）：空白 = 加链路（三列表单浮出，提交才落码）；
  // 节点 = 重命名（选中 + 关菜单，在右侧属性表单改）
  'add-sankey-link': openFormOf('sankey-link'),
  'edit-sankey-name': selectMenuTargetAndClose,
  // state（more-diagrams 工单 02）：add-state 走 createElement 的 state 分支（空白入口）
  'add-state-into': addStateIntoComposite,
  // kanban（more-diagrams 工单 06）：add-column 走 createElement 的 kanban 分支（空白入口）；
  // add-card 落在右键的那一列末尾；edit-kanban-metadata = D5「选中 + 关菜单」，字段在右侧属性面板改。
  'add-column': createElement,
  'add-card': addKanbanCard,
  'edit-kanban-metadata': selectMenuTargetAndClose,
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
  // timeline（more-diagrams 工单 05）：空白加时期 / 加分组；时期加事件；改文本走属性表单
  'add-period': addTimelinePeriod,
  'add-section': addTimelineSection,
  'add-event': addTimelineEvent,
  'edit-period-text': selectMenuTargetAndClose,
  'edit-event-text': selectMenuTargetAndClose,
  // journey（more-diagrams 工单 08）：空白加任务 / 加分组；元素级编辑降级到结构树 + 属性表单
  'add-journey-task': addJourneyTask,
  'add-journey-section': addJourneySection,
  // pie（more-diagrams 工单 10）：空白加扇区；元素级编辑降级到结构树 + 属性表单
  'add-pie-sector': addPieSector,
  // gantt（more-diagrams 工单 11）：空白加任务 / 加分组；元素级编辑降级到结构树 + 属性表单
  'add-gantt-task': addGanttTask,
  'add-gantt-section': addGanttSection,
  // quadrant（more-diagrams 工单 12）：空白加点（内联命名）；点 = 改文本 / 改坐标 /
  // 改样式（D5）/ 删除（deleteTarget）；轴/象限 = 改文本（D5：选中 + 关菜单）
  'add-quadrant-point': addQuadrantPoint,
  'edit-quadrant-coords': selectMenuTargetAndClose,
  'edit-quadrant-style': selectMenuTargetAndClose,
  'edit-quadrant-text': selectMenuTargetAndClose,
  // xychart（more-diagrams 工单 14）：空白 = 加 line / 加 bar（表单浮出，提交才落码）；
  // 系列 = 改名（选中 + 关菜单）/ 改类型（直接落码切换）/ 编辑数值（选中 + 关菜单，
  // 数组行编辑在属性表单）/ 删除；轴 = 改形态/字段（选中 + 关菜单，属性表单承接）
  'add-xychart-line': openFormOf('xychart-line'),
  'add-xychart-bar': openFormOf('xychart-bar'),
  'xychart-toggle-type': toggleXychartSeriesType,
  'xychart-edit-values': selectMenuTargetAndClose,
  'edit-xychart-axis': selectMenuTargetAndClose,
  // radar（more-diagrams 工单 15）：空白加轴 / 加曲线；元素级编辑降级到结构树 + 属性表单
  'add-radar-axis': addRadarAxis,
  'add-radar-curve': addRadarCurve,
}
