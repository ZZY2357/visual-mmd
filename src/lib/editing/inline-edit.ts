import type { EditIntent } from '../pipeline/parser'
import type { ProjectionMindmapNode } from '../projection/mindmap-projection'
import type { DataIdResolver } from '../canvas-selection/data-id'
import { diagramInlineEdits, inlineEditCommitOfByKind } from './inline-edit/index'

/**
 * 内联编辑（工单 05/04/05）：双击节点 / 新建节点后，在画布原位浮出输入框编辑文本。
 *
 * 本模块是纯逻辑，与 DOM/React 解耦，只保留**通用件**（architecture-deepening-3
 * 工单 07）：
 * - 编辑目标的类型（`CanvasInlineEditTarget` 全 union 共享，与 ContextMenuItemId /
 *   Selection 同范式：各消费方共用一个词汇，不各造一套）；
 * - 双击目标 → 编辑对象、输入值 → 编辑意图的**委派入口**——「双击哪个文本能编辑
 *   哪个字段」「提交落什么意图、什么校验」是图种知识，按 04 的 menu/<id>.ts 范式
 *   就近 `inline-edit/<id>.ts`（实参表见 inline-edit/index.ts）；
 * - 节点包围盒（屏幕坐标）→ 相对画布容器的浮层定位（视图变换已反映在
 *   getBoundingClientRect 里，这里是最后一层纯几何换算，便于单测）。
 *
 * 各图种的双击都**只改显示文本**（spec 决策：宁可少做，也不让双击不可预测）：
 * flowchart / mindmap 改节点文本，class 改类名（rename-class），sequence 改 `as` 别名
 * （set-participant）。class 的成员正文、class 的关系标签、sequence 的消息文本与 actorId
 * **不做双击**——前两者在节点内部/线上（编辑路径是"点选 → 右侧表单"），actorId 是语法标识。
 *
 * 空白右键新建的 class / sequence 元素（工单 04）复用同一输入框：编辑的是**类名** /
 * **参与者 id**（不是 mindmap 的显示文本），落 rename-class / rename-participant。
 */
export type InlineEditTarget =
  | { kind: 'flowchart'; nodeId: string }
  | { kind: 'mindmap'; elementId: string }

/** 画布内联编辑目标（工单 04/05）：在键盘/双击目标（flowchart / mindmap）之上，
 * 增加 class / sequence：
 * - `class`：空白新建后命名、或双击类名 → rename-class（类名即显示文本，两条入口同目标）
 * - `sequence`：空白新建后命名 → rename-participant（改语法 id，不生成 alias）
 * - `sequence-alias`：双击既有参与者 → set-participant（改 `as` 显示别名；actorId 不变）
 * 后两者分开命名：actorId 是语法标识，本票不做双击改它（走属性面板既有字段）。 */
export type CanvasInlineEditTarget =
  | InlineEditTarget
  /** class 空白新建 / 双击类名：编辑类名（isValidClassName 接受中文） */
  | { kind: 'class'; name: string }
  /** sequence 空白新建：编辑参与者 id（不生成 alias） */
  | { kind: 'sequence'; actorId: string }
  /** sequence 双击既有参与者：编辑 `as` 显示别名（显示文本） */
  | { kind: 'sequence-alias'; actorId: string }
  /** state（more-diagrams 工单 02）：双击 / 键盘新建后编辑状态描述（`id : desc` 的 desc 段，
   * set-state-desc 意图；id 是语法标识，不在此改） */
  | { kind: 'state'; id: string }
  /** er（more-diagrams 工单 03）：双击实体改别名（set-alias 意图；实体名是语法标识，
   * 不在此改。属性不做双击——工单 03 明确） */
  | { kind: 'er'; name: string }
  /** kanban（more-diagrams 工单 06）：双击卡片改描述（set-description）；键盘 / 空白新建后命名同此 */
  | { kind: 'kanban-card'; elementId: string }
  /** kanban：双击列标题改标题（set-column-title）；键盘 / 空白新建后命名同此 */
  | { kind: 'kanban-column'; elementId: string }
  /** requirement（more-diagrams 工单 07）：双击 requirement 节点改 `text` 字段
   * （set-requirement-field 意图；名字是语法标识，不在此改。element 无双击编辑——
   * 工单 07 明确：element 的 type/docref 是元数据，展示与编辑都在右侧表单） */
  | { kind: 'requirement'; name: string }
  /** block（more-diagrams 工单 09）：双击块节点改标签（set-node-label 意图；id 是语法
   * 标识，不在此改。嵌套块无双击——组没有标签，宽度/列数在右侧属性表单改） */
  | { kind: 'block-node'; id: string }
  /** gantt（more-diagrams 工单 11）：双击任务条/任务文本改任务名（set-task-name）。
   * elementId 是位置序身份（`task:N`，提交寻址用）；taskId 是 mermaid 渲染 id
   * （画布 data-id，浮层定位用——DOM 上只有它，无法从位置序 elementId 反解） */
  | { kind: 'gantt-task'; elementId: string; taskId: string }
  /** quadrant（more-diagrams 工单 12）：双击点改文本（set-point-text 意图）。
   * 点有 data-id 寻址（渲染后位置序反注）；轴/象限标题不做双击（右侧表单改） */
  | { kind: 'quadrant-point'; elementId: string }
  /** packet（more-diagrams 工单 16）：双击字段改名（set-field-name 意图）。
   * 字段有 data-id 寻址（渲染后 start-bit 映射反注） */
  | { kind: 'packet-field'; elementId: string }
  /** xychart（more-diagrams 工单 14）：双击系列改名字（set-series-name 意图；位置序
   * elementId 寻址。轴/标题无双击——文档级属性元素，走右侧属性表单） */
  | { kind: 'xychart-series'; elementId: string }
  /** radar（more-diagrams 工单 15）：双击轴标签改 label（set-axis-label）。
   * radar 渲染器无 data-id（全程只有 class），轴标签按 **class 文本匹配** 寻址
   * （`text.radarAxisLabel` 的可见文本 = 轴展示文本，与 mindmap 同范式）；
   * elementId 是位置序身份（`axis:N`）。曲线标签不做双击（多条曲线标签文本可重复，
   * 文本匹配不可消歧——曲线编辑入口 = 结构树 + 属性表单） */
  | { kind: 'radar-axis'; elementId: string }
  /** architecture（more-diagrams 工单 17）：双击 service / group 改标题（set-service-title /
   * set-group-title 意图；id 是语法标识不在此改。junction 无标题、边不可寻址——不接双击） */
  | { kind: 'architecture'; elementKind: 'service' | 'group'; id: string }
  /** zenuml（more-diagrams 工单 19）：改参与者别名（set-zenuml-participant-alias 意图；
   * id 是语法标识不在此改）。画布 DOM 无 data-id（任务 0 实测）——双击不可寻址，
   * 本目标只由右键菜单「改别名」与结构树构造。 */
  | { kind: 'zenuml-participant'; elementId: string }

export type InlineEditCommit =
  | { action: 'commit'; intent: EditIntent }
  /** 文本未变化或为空白：关闭输入框且不落码（新建节点保留默认名） */
  | { action: 'unchanged' }
  /** 文本非法（mindmap 空文本 / class 非法类名 / sequence 非法参与者 id） */
  | { action: 'invalid' }

/** 参与双击寻址的图种（各图种都用 data-id；mindmap / radar 额外回落文本匹配） */
export type InlineEditDiagramKind =
  | 'flowchart'
  | 'mindmap'
  | 'class'
  | 'sequence'
  | 'state'
  | 'er'
  | 'kanban'
  | 'requirement'
  | 'block'
  | 'gantt'
  | 'quadrant'
  | 'packet'
  | 'xychart'
  | 'radar'
  | 'architecture'
  | 'zenuml'

/** radar 双击寻址的轴候选（文本 → elementId；由调用方从投影展开，展示文本 label ?? id） */
export interface RadarAxisCandidate {
  text: string
  elementId: string
}

/** 双击事件上下文：各图种 `targetFromEvent`（inline-edit/<id>.ts）的入参。
 * mindmapNodes / radarAxes 是文本匹配范式图种（mindmap / radar）的投影候选，
 * 由调用方从投影展开；其余图种忽略。 */
export interface InlineEditEventContext {
  target: EventTarget | null
  resolver: DataIdResolver | null
  mindmapNodes: ProjectionMindmapNode[]
  radarAxes: RadarAxisCandidate[]
}

/** 某个编辑目标 kind 的提交规则签名（inline-edit/<id>.ts 就近声明） */
export type InlineEditCommitFn<K extends CanvasInlineEditTarget['kind']> = (
  target: Extract<CanvasInlineEditTarget, { kind: K }>,
  next: string,
  currentText: string,
) => InlineEditCommit

/** 单图种的内联编辑定义（与 DiagramMenuDefinition 同范式的图种知识形状）：
 * `targetFromEvent` = 双击 → 编辑对象的匹配规则；`commitOf` = 本图种产出的各
 * target kind 的提交规则（每个 target kind 全仓库唯一归属一个图种）。 */
export interface DiagramInlineEditDefinition {
  targetFromEvent(ctx: InlineEditEventContext): CanvasInlineEditTarget | null
  commitOf: { [T in CanvasInlineEditTarget['kind']]?: InlineEditCommitFn<T> }
}

/**
 * 双击目标 → 编辑对象；两边都匹配不上时返回 null（如点在空白处/边上），
 * 安静地不进入编辑，不崩溃。
 *
 * kind 指明图种（工单 05 起四图种齐备）：匹配规则按图种就近 inline-edit/<id>.ts，
 * 这里只按 kind 委派（工单 07）。resolver 命中 `element`（连线）时不进入编辑——
 * class 关系标签 / sequence 消息文本不做双击。
 */
export function inlineEditTargetFromEvent(
  target: EventTarget | null,
  resolver: DataIdResolver | null,
  mindmapNodes: ProjectionMindmapNode[] = [],
  kind: InlineEditDiagramKind = 'flowchart',
  radarAxes: RadarAxisCandidate[] = [],
): CanvasInlineEditTarget | null {
  return diagramInlineEdits[kind].targetFromEvent({ target, resolver, mindmapNodes, radarAxes })
}

/** 投影类型 → 双击编辑图种 kind：接了双击的图种按名查表；未接的图种（pie / sankey
 * 等无内联编辑者）按 flowchart 兜底——与既有行为逐字同径（其 resolver 命中不了
 * node 或根本无 resolver，安静地不进入编辑）。 */
export function inlineEditKindOf(diagramType: string): InlineEditDiagramKind {
  return diagramType in diagramInlineEdits ? (diagramType as InlineEditDiagramKind) : 'flowchart'
}

/**
 * 输入值 → 提交动作：去首尾空白后与当前文本相同或为空 → unchanged（不落码）；
 * 各 target kind 的提交规则（校验 + 落什么意图）按图种就近 inline-edit/<id>.ts，
 * 这里只做通用守卫后按 kind 委派（工单 07）。
 */
export function inlineEditCommitOf(target: CanvasInlineEditTarget, text: string, currentText: string): InlineEditCommit {
  const next = text.trim()
  if (next === '' || next === currentText.trim()) return { action: 'unchanged' }
  // 表的键 = target.kind 穷尽且每个 kind 的 handler 只收该 kind 的载荷（类型钉死）；
  // 这里的分发点把 handler 放宽回全 union——kind 已由查表键保证与 target 一致
  const commitOf = inlineEditCommitOfByKind[target.kind] as (
    target: CanvasInlineEditTarget,
    next: string,
    currentText: string,
  ) => InlineEditCommit
  return commitOf(target, next, currentText)
}

// ---------- 浮层定位 ----------

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

/**
 * 节点包围盒（相对页面/容器同一原点的屏幕坐标）→ 相对画布容器的浮层位置。
 * 浮层贴着节点整体（覆盖文本区域），随视图缩放/平移自动对准
 * ——节点的 getBoundingClientRect 已包含 CSS transform（工单 03 视图），此处只做减法。
 */
export function overlayRectInContainer(containerRect: Rect, nodeRect: Rect): Rect {
  return {
    left: nodeRect.left - containerRect.left,
    top: nodeRect.top - containerRect.top,
    width: nodeRect.width,
    height: nodeRect.height,
  }
}

/** DOMRect → 普通矩形（单测/纯换算用；DOMRect 可直接传入，字段同名） */
export function toRect(r: { left: number; top: number; width: number; height: number }): Rect {
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}
