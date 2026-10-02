import { nextFreeName } from '../pipeline/element-id'
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
import type { Rect } from './inline-edit'

/**
 * 画布键盘的**跨图种通用件**（architecture-deepening-3 工单 01 物理归位后）：
 * 各图种自己的 `<id>KeyPlan` / `<id>DeleteIntent` / validity helper 已迁到
 * `src/lib/pipeline/<id>-keyboard.ts`（与该图种管线同 id 文件旁），本模块只保留：
 * 方位导航键位判定与适配对象、以及 flowchart/mindmap 共用的节点树键位表
 * （keyToNodeAction）与节点 id 生成（nextNodeId——也被右键菜单消费）。
 * 键事件的语义形状（KeyPlan / KeyInput / KeyFormKind / KeyHandler / PlanExecutor）
 * 与唯一执行器 applyPlan 已迁 `src/lib/pipeline/key-plan.ts`（architecture-deepening-3
 * 工单 02，editing 与 structure-tree 两个消费方共用；本模块 re-export 保持路径不变）。
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


// 键事件的语义形状（KeyPlan / KeyInput / KeyFormKind / KeyHandler / PlanExecutor）与唯一执行器
// applyPlan 已迁 pipeline/key-plan.ts（architecture-deepening-3 工单 02，结构树层不再依赖本层）；
// 这里同名 re-export，editing 内既有消费方与测试的 import 路径不变。
export { applyPlan } from '../pipeline/key-plan'
export type { KeyFormKind, KeyHandler, KeyInput, KeyPlan, PlanExecutor } from '../pipeline/key-plan'

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
