import { nextFreeName } from '../pipeline/element-id'
import type { EditIntent } from '../pipeline/parser'
import type { ClassProjection } from '../projection/class-projection'
import type { ErProjection } from '../projection/er-projection'
import type { FlowchartProjection } from '../projection/flowchart-projection'
import type { MindmapProjection } from '../projection/mindmap-projection'
import type { SequenceProjection } from '../projection/sequence-projection'
import type { StateProjection } from '../projection/state-projection'
import type { GitgraphProjection } from '../projection/gitgraph-projection'
import type { RequirementProjection } from '../projection/requirement-projection'
import type { TimelineProjection } from '../projection/timeline-projection'
import type { KanbanProjection } from '../projection/kanban-projection'
import type { JourneyProjection } from '../projection/journey-projection'
import type { PieProjection } from '../projection/pie-projection'
import type { BlockProjection } from '../projection/block-projection'
import type { SankeyProjection } from '../projection/sankey-projection'
import type { GanttProjection } from '../projection/gantt-projection'
import type { QuadrantProjection } from '../projection/quadrant-projection'
import type { PacketProjection } from '../projection/packet-projection'
import type { XychartProjection } from '../projection/xychart-projection'
import type { RadarProjection } from '../projection/radar-projection'
import type { ArchitectureProjection } from '../projection/architecture-projection'
import type { TreemapProjection } from '../projection/treemap-projection'
import type { IshikawaProjection } from '../projection/ishikawa-projection'
import type { WardleyProjection } from '../projection/wardley-projection'
import type { VennProjection } from '../projection/venn-projection'
import type { CynefinProjection } from '../projection/cynefin-projection'
import type { UsecaseProjection } from '../projection/usecase-projection'
import type { TreeviewProjection } from '../projection/treeview-projection'
import type { EventModelingProjection } from '../projection/eventmodeling-projection'
import type { AgentflowProjection } from '../projection/agentflow-projection'
import type { ZenumlProjection } from '../projection/zenuml-projection'
import type { C4Projection } from '../projection/c4-projection'
import type { Selection } from '../projection/selection'
import type { CanvasInlineEditTarget, Rect } from './inline-edit'

/**
 * 画布键盘的**跨图种通用件**（architecture-deepening-3 工单 01 物理归位后）：
 * 各图种自己的 `<id>KeyPlan` / `<id>DeleteIntent` / validity helper 已迁到
 * `src/lib/pipeline/<id>-keyboard.ts`（与该图种管线同 id 文件旁），本模块只保留：
 * 键事件的语义形状（KeyPlan / KeyInput / KeyHandler / KeyFormKind）、唯一执行器
 * applyPlan、方位导航键位判定与适配对象、以及 flowchart/mindmap 共用的节点树键位表
 * （keyToNodeAction）与节点 id 生成（nextNodeId——也被右键菜单消费）。
 *
 * 方向键 = **方位导航**（ADR-0011 与工单 14）：以选中节点的可视范围中心为锚点，
 * 在该按键所指方向的 45° 锥内取最近节点，**不再承诺源码顺序或树关系**（mermaid 的
 * dagre / cose-bilkent 布局与书写顺序无关）。纯几何选点在 directional-navigation.ts，
 * DOM 测量在 canvas-measure.ts，接线在 use-canvas-keyboard.ts。
 *
 * architecture-deepening-2 工单 02：plan 的执行收敛为唯一的 applyPlan——
 * 键盘、右键菜单、结构树三处的「循环执行 intents」共用同一份编排放策略。
 */

/** 参与画布键盘的图种投影（tagged union，keydown 时按图种分支） */
export type CanvasKeyboardProjection =
  | { kind: 'flowchart'; projection: FlowchartProjection }
  | { kind: 'mindmap'; projection: MindmapProjection }
  | { kind: 'class'; projection: ClassProjection }
  | { kind: 'sequence'; projection: SequenceProjection }
  | { kind: 'state'; projection: StateProjection }
  | { kind: 'er'; projection: ErProjection }
  | { kind: 'gitgraph'; projection: GitgraphProjection }
  | { kind: 'timeline'; projection: TimelineProjection }
  | { kind: 'kanban'; projection: KanbanProjection }
  | { kind: 'requirement'; projection: RequirementProjection }
  | { kind: 'journey'; projection: JourneyProjection }
  | { kind: 'pie'; projection: PieProjection }
  | { kind: 'block'; projection: BlockProjection }
  | { kind: 'sankey'; projection: SankeyProjection }
  | { kind: 'gantt'; projection: GanttProjection }
  | { kind: 'quadrant'; projection: QuadrantProjection }
  | { kind: 'packet'; projection: PacketProjection }
  | { kind: 'xychart'; projection: XychartProjection }
  | { kind: 'radar'; projection: RadarProjection }
  | { kind: 'architecture'; projection: ArchitectureProjection }
  | { kind: 'treemap'; projection: TreemapProjection }
  | { kind: 'ishikawa'; projection: IshikawaProjection }
  | { kind: 'wardley'; projection: WardleyProjection }
  | { kind: 'venn'; projection: VennProjection }
  | { kind: 'cynefin'; projection: CynefinProjection }
  | { kind: 'usecase'; projection: UsecaseProjection }
  | { kind: 'treeview'; projection: TreeviewProjection }
  | { kind: 'eventmodeling'; projection: EventModelingProjection }
  | { kind: 'agentflow'; projection: AgentflowProjection }
  | { kind: 'zenuml'; projection: ZenumlProjection }
  | { kind: 'c4'; projection: C4Projection }

export type NodeKeyAction = 'delete' | 'add-child' | 'add-sibling'

/** 键位 → 动作映射；带修饰键（Shift-Tab 等）不处理（交给原有行为）。
 * 节点树图种（flowchart / mindmap）共用的键位表。 */
export function keyToNodeAction(key: string, mods: { shift?: boolean } = {}): NodeKeyAction | null {
  if (key === 'Delete' || key === 'Backspace') return 'delete'
  if (key === 'Tab') return mods.shift === true ? null : 'add-child'
  if (key === 'Enter') return mods.shift === true ? null : 'add-sibling'
  return null
}

/** 生成未冲突的新节点 id：n1、n2……跳过已有 id。
 * 编号口径收在 pipeline 的 nextFreeName（architecture-deepening-2 工单 04）：
 * 生成式 id 无引用语义，referential: false——从 1 起编号，不做 base 本身检查。 */
export function nextNodeId(existingIds: Iterable<string>): string {
  return nextFreeName('n', existingIds, { referential: false })
}

/** 编辑键请求打开的添加表单种类：member / relation / message 落到已有表单浮层
 * （锚点/预选由右键菜单 hook 从选中推出），participant 走既有创建路径（内联命名） */
export type KeyFormKind =
  | 'member'
  | 'relation'
  | 'message'
  | 'participant'
  | 'transition'
  | 'er-relation'
  | 'requirement-relation'
  | 'block-edge'
  | 'sankey-link'
  // xychart（more-diagrams 工单 14）：加系列表单（line / bar 两形态分开，提交才落码）
  | 'xychart-line'
  | 'xychart-bar'
  // architecture（more-diagrams 工单 17）：加边表单（from 预选，提交才落码）
  | 'architecture-edge'
  // agentflow（more-diagrams 工单 27）：加边表单（from 预选，提交才落码）
  | 'agentflow-edge'
  // zenuml（more-diagrams 工单 19）：加消息表单（from 预选该消息的发起方，提交才落码）
  | 'zenuml-message'
  // C4（more-diagrams 工单 18）：从选中元素拉一条关系（from 预选，提交才落码）
  | 'c4-relation'

/** 键事件的语义 plan：执行器（applyPlan）按字段决定提交 / 选中 / 内联编辑 / 表单 */
export interface KeyPlan {
  /** 依次经管线落码的编辑意图序列（表单类 plan 为空——提交才落码） */
  intents: EditIntent[]
  /** 全部意图落码成功后：选中新元素，且（若有）进入内联编辑（删除类 plan 无此字段；
   * 属性类新元素不做内联编辑（er 属性无双击/内联，工单 03），inlineEdit 可省略） */
  newElementTarget?: { selection: Selection; inlineEdit?: CanvasInlineEditTarget }
  /** 编辑键要求打开的添加表单（class/sequence 的 Tab/Enter 落到已有表单，不直接落码） */
  form?: KeyFormKind
  /** 落码成功后清空选中（class/sequence 的删除，与右键菜单/属性面板删除一致；
   * flowchart/mindmap 的键盘删除保留原选中，由属性面板的 resolveSelection 回落） */
  clearSelection?: boolean
}

/** 键事件的纯描述（keydown 的 key / 修饰键 / 当前选中 / mindmap 占位文本） */
export interface KeyInput {
  key: string
  mods?: { shift?: boolean }
  selection: Selection | null
  /** mindmap 新节点占位文本（确认前落码用，内联命名确认后改写） */
  newNodeText?: string
}

/** 能力包上的键位处理器：`keyHandler(projection)` 一次绑定投影，之后每个键事件纯函数求值 */
export type KeyHandler = (input: KeyInput) => KeyPlan | null

/** plan 执行器消费的语境：提交 / 选中 / 内联编辑 / 表单 / preventDefault。
 * 键盘（hook）、右键菜单（menu-actions）、结构树三处共用同一份执行策略。 */
export interface PlanExecutor {
  /** 提交编辑意图（可撤销）；false = 被拒绝，中止后续步骤（含选中与内联编辑） */
  commitIntent: (intent: EditIntent) => boolean
  /** 更新编辑器选中 */
  select: (selection: Selection | null) => void
  /** 进入内联编辑（新建元素的命名）；结构树路径经由 pendingInlineEdit 请求间接接入 */
  beginInlineEdit?: (target: CanvasInlineEditTarget) => void
  /** 打开添加表单（键盘路径 = 画布中位浮出，菜单路径 = 菜单位置浮出） */
  openForm?: (kind: KeyFormKind) => void
  /** preventDefault 的时机由 applyPlan 定义：plan 确定要处理（非 null）即调用一次 */
  preventDefault?: () => void
}

/**
 * plan 的唯一执行器（architecture-deepening-2 工单 02）：preventDefault 时机、
 * 依次提交意图（第一个失败即中止）、更新选中、进入内联编辑、清空选中、打开表单——
 * 这些编排放策略只在这一处定义。返回 false = 某个意图被拒绝（中止且未完成）。
 */
export function applyPlan(plan: KeyPlan, exec: PlanExecutor): boolean {
  exec.preventDefault?.()
  if (plan.form !== undefined) {
    exec.openForm?.(plan.form)
    return true
  }
  for (const intent of plan.intents) {
    if (!exec.commitIntent(intent)) return false
  }
  if (plan.newElementTarget !== undefined) {
    exec.select(plan.newElementTarget.selection)
    if (plan.newElementTarget.inlineEdit !== undefined) exec.beginInlineEdit?.(plan.newElementTarget.inlineEdit)
  } else if (plan.clearSelection === true) {
    exec.select(null)
  }
  return true
}

// ---------- 方向键（工单 14）：方位导航的键位判定与适配对象 ----------

/** 参与方位导航的四个方向键；其余键（含组合键）不参与 */
export function isNavigationKey(key: string): boolean {
  return key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown'
}

/** 某节点在画布容器坐标系下的可视范围（工单 14 §4：= 高亮元素外接矩形的并集） */
export interface NodeExtent {
  dataId: string
  rect: Rect
}

/**
 * 方向键方位导航的适配对象（工单 14）：把 DOM 测量、选中映射、自动平移
 * 打包给 use-canvas-keyboard。各成员由 CanvasPanel 用现成的 resolver /
 * selectedDataIdOf / use-canvas-view 组装；测试注入假实现（不碰 DOM / mermaid）。
 */
export interface CanvasNavigation {
  /** 本图种全部节点的可视范围（容器坐标）；**数组顺序 = 投影顺序**（距离并列取先者用） */
  extents(): NodeExtent[]
  /** 当前选中对应的 data-id；null = 无锚点（无选中 / 图表级 / 别种元素 / 已不在投影） */
  dataIdOf(selection: Selection | null): string | null
  /** data-id → 编辑器选中；无法解析时 null */
  toSelection(dataId: string): Selection | null
  /** 把该节点的可视范围推入可见区（自动平移，瞬时无补间） */
  reveal(dataId: string): void
  /** 无锚点时的回落选中：本图种投影首个节点；投影为空时 null */
  firstSelection(): Selection | null
}
