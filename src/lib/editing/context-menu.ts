import { DIAGRAM_TYPE_LIST, type DiagramTypeId } from '../diagram-registry'
import type { CanvasSelection } from '../canvas-selection/data-id'
import type { Selection } from '../projection/selection'
import { menuTargetOfCanvas } from '../canvas-selection/selection-codec'

/**
 * 右键菜单（工单 07/04/06/03）：单一菜单随右键目标变化。
 *
 * 本模块是纯逻辑，与 DOM/React 解耦：
 * - 画布选中（data-id 解析产物）+ 图种 → 菜单目标（blank / 元素）
 * - 菜单目标 → 菜单项列表：architecture-deepening-3 工单 04 起是**一份通用渲染器**——
 *   各图种「菜单长什么样」（blankItems / nodeItems，文案键随行）定义在
 *   `src/lib/editing/menu/<id>.ts` 并挂进注册表的 `menu` 字段，本模块查 registration
 *   取定义，不再维护按 diagramType / selection.kind 的巨型 switch
 *
 * 空白处四种图种都有添加动作（工单 04）：flowchart 添加节点、class 添加类、
 * sequence 添加参与者、mindmap 添加根节点；空图与错误态（空 classDiagram）同样适用。
 * 节点菜单四种图种齐备（工单 06）：class 节点选中 id 即类名、sequence 节点选中 id 即
 * 参与者 actorId，各给最小可用集（class = 加成员/加关系/删除类；sequence = 加消息/删除参与者）。
 * 连线目标（工单 02 打通寻址 / 工单 03 挂上动作）：flowchart 走 mermaid data-id，
 * class / sequence 走位置序身份（`edgeSelectionOf` 收窄）；无法映射为菜单目标时返回 null：
 * 安静地不弹菜单，不崩溃。
 *
 * 添加入口补全（工单 04）：`add-note` / `add-block` 落进菜单——sequence 空白给「注释 + 逻辑块」、
 * sequence 参与者给「逻辑块」（以该参与者为落点）、class 空白给「浮动注释」、class 类节点给
 * `note for X`。至此 `CONTEXT.md:78` 的「右键菜单是元素添加的唯一入口」才真正成立
 * （原先 sequence 的 note/block、class 的 note 只能手写源码）。结构树仍是纯选中器，不引入第二套添加心智。
 */

export type ContextMenuTarget =
  /** 空白处（无 data-id 命中）：diagramType 决定可做的添加动作 */
  | { kind: 'blank'; diagramType: DiagramTypeId }
  /**
   * 元素目标（工单 architecture-deepening-3 03）：直接复用 Selection 的 kind 命名与载荷
   * （`projection/selection.ts`），不再是 60+ 成员的平行 union——菜单目标本来就是
   * 「画布/树来源的选中」，同一身份只该有一个名字。`composite` 仅对 `state` 选中
   * 有意义：复合状态多一项「添加状态（复合内部）」，由调用方按投影补齐
   * （menuTargetOfCanvas 是纯映射，不查投影）。
   */
  | { kind: 'element'; selection: Selection; composite?: boolean }

export type ContextMenuItemId =
  | 'add-node'
  | 'link-mode'
  | 'add-style'
  | 'add-subgraph'
  | 'add-class'
  | 'add-participant'
  | 'add-root'
  | 'add-member'
  | 'add-relation'
  | 'delete-class'
  | 'add-message'
  | 'delete-participant'
  // 添加入口补全（工单 04）：sequence 的注释与逻辑块、class 的注释。
  // 与既有添加项同构：取值仍是 pipeline 早已存在的 add-note / add-block 意图，本票只接线。
  | 'add-note'
  | 'add-block'
  | 'link-from-here'
  | 'edit-text'
  | 'edit-label'
  | 'apply-style'
  | 'add-child'
  | 'delete'
  // 连线菜单（工单 03）：class 关系边与 sequence 消息各「编辑 + 删除」；
  // 注释 / 逻辑块只补删除（见 contextMenuItems 的说明）。
  // 编辑项的语义（工单 05 定案 D5）= 选中该连线 + 关闭菜单，字段在右侧属性面板里改。
  | 'cycle-relation-kind'
  | 'edit-relation'
  | 'delete-relation'
  | 'cycle-message-arrow'
  | 'edit-message'
  | 'delete-message'
  | 'delete-note'
  | 'delete-block'
  // state（more-diagrams 工单 02）
  | 'add-state'
  | 'add-state-into'
  | 'edit-state-desc'
  // er（more-diagrams 工单 03）：编辑类动作遵守工单 05 定案 D5——线型可循环直接改，
  // 基数与标签（枚举选择）在右侧属性面板改（选中该连线并关闭菜单）。
  | 'add-entity'
  | 'add-attribute'
  | 'edit-er-alias'
  | 'cycle-er-line'
  | 'edit-er-relation'
  | 'edit-er-attribute'
  // gitGraph（more-diagrams 工单 04）：空白 = 加提交 / 加分支（branch 创建并 checkout）。
  // 提交/分支的编辑动作不做画布菜单（无 data-id 可命中），由结构树选中 + 属性表单承接。
  | 'add-commit'
  | 'add-branch'
  // timeline（more-diagrams 工单 05）：空白 = 加时期 / 加分组；时期 = 改文本 / 加事件 / 删除；
  // 事件 = 改文本 / 删除
  | 'add-period'
  | 'add-section'
  | 'add-event'
  | 'edit-period-text'
  | 'edit-event-text'
  // kanban（more-diagrams 工单 06）：空白加列、列上加卡片、卡片改元数据（D5：选中 + 关菜单，
  // 字段在右侧属性面板改）；改标题 / 改描述复用既有 edit-text（进入内联编辑），删除复用 delete。
  | 'add-column'
  | 'add-card'
  | 'edit-kanban-metadata'
  // requirement（more-diagrams 工单 07）：空白 = 加 requirement（type 在添加表单里选）/
  // 加 element；节点 = 改字段（选中该节点在右侧表单编辑）/ 从这里连线 / 删除；
  // 关系 = 切换关系类型（循环直接改）/ 反转方向（直接改）/ 删除
  | 'add-requirement'
  | 'add-requirement-element'
  | 'edit-requirement-field'
  | 'cycle-requirement-kind'
  | 'invert-requirement-relation'
  // journey（more-diagrams 工单 08）：空白 = 加任务 / 加分组。任务与分组的编辑不做
  // 元素级画布菜单（无 data-id 可命中），由结构树选中 + 属性表单承接。
  | 'add-journey-task'
  | 'add-journey-section'
  // pie（more-diagrams 工单 10）：空白 = 加扇区（数值落 1，可在右侧表单改）。
  // 扇区的编辑不做元素级画布菜单（无 data-id 可命中），由结构树选中 + 属性表单承接。
  | 'add-pie-sector'
  // block（more-diagrams 工单 09）：空白 = 加块节点 / 加嵌套块（创建 + 内联命名）；
  // 节点 = 改标签（内联编辑）/ 删除；嵌套块 = 加块节点（落进组内）/ 删除；
  // 边 = 在属性面板中编辑（选中 + 关菜单）/ 删除
  | 'add-block-node'
  | 'add-block-group'
  // sankey（more-diagrams 工单 13）：空白 = 加链路（三列表单浮出，提交才落码）；
  // 节点 = 重命名（选中 + 关菜单，在右侧属性表单改——节点不落码，改名即手术改写全部链路行）
  | 'add-sankey-link'
  | 'edit-sankey-name'
  // gantt（more-diagrams 工单 11）：空白 = 加任务（缺省时长 1d，归属最后一个分组）/
  // 加分组。任务条虽可寻址，但元素级编辑不做画布菜单（与 journey/pie 同口径），
  // 由结构树选中 + 属性表单承接；section 与指令行不可寻址。
  | 'add-gantt-task'
  | 'add-gantt-section'
  // quadrant（more-diagrams 工单 12）：空白 = 加点（坐标落 0.5, 0.5，可在右侧表单改）；
  // 点 = 改文本（内联编辑）/ 改坐标 / 改样式（D5：选中 + 关菜单，右侧表单改）/ 删除；
  // 轴/象限 = 改文本（D5：选中 + 关菜单，右侧表单改）。
  | 'add-quadrant-point'
  | 'edit-quadrant-coords'
  | 'edit-quadrant-style'
  | 'edit-quadrant-text'
  // packet（more-diagrams 工单 16）：空白 = 加字段（+count 形态衔接前序，创建 + 内联命名）；
  // 字段 = 改名（内联编辑）/ 改位区间（D5：选中 + 关菜单，右侧 PacketFieldForm 改）/ 删除
  | 'add-packet-field'
  | 'edit-packet-range'
  // xychart（more-diagrams 工单 14）：空白 = 加 line / 加 bar（表单浮出，提交才落码）；
  // 系列 = 改名（选中 + 关菜单，属性表单）/ 改类型（直接落码切换 line↔bar）/
  // 编辑数值（选中 + 关菜单，数组行编辑在属性表单）/ 删除；轴 = 改形态/字段（选中 + 关菜单）
  | 'add-xychart-line'
  | 'add-xychart-bar'
  | 'xychart-toggle-type'
  | 'xychart-edit-values'
  | 'edit-xychart-axis'
  // radar（more-diagrams 工单 15）：空白 = 加轴 / 加曲线（占位 id 避重，表单可改）。
  // 轴与曲线的编辑不做元素级画布菜单（无 data-id 可命中），由结构树选中 + 属性表单承接。
  | 'add-radar-axis'
  | 'add-radar-curve'
  // architecture（more-diagrams 工单 17）：空白 = 加 service / 加 group / 加 junction；
  // service = 改标题（内联）/ 图标与分组（D5：选中 + 关菜单，右侧表单改）/ 从这里连线 /
  // 删除；group = 改标题（内联）/ 删除；边 = 改端口与箭头（D5，右侧表单改）/ 删除
  | 'add-architecture-service'
  | 'add-architecture-group'
  | 'add-architecture-junction'
  | 'edit-architecture-service'
  | 'edit-architecture-edge'
  // treemap（more-diagrams 工单 20）：空白 = 加分组（Section）/ 加叶子（Leaf，数值落 1）。
  // 节点的编辑不做元素级画布菜单（无 data-id 可命中，research §4 实测降级），
  // 由结构树选中 + 属性表单承接。
  | 'add-treemap-group'
  | 'add-treemap-leaf'
  // ishikawa（more-diagrams 工单 22）：空白 = 加主因（顶层因果节点）。节点的编辑不做
  // 元素级画布菜单（无 data-id 可命中，research §4 实测降级），由结构树选中 + 属性表单承接。
  | 'add-ishikawa-cause'
  // wardley（more-diagrams 工单 23）：空白 = 加 component / 加 anchor（名字避重、坐标落
  // 图正中 [0.5, 0.5]，不做内联命名——画布无 data-id）/ 加连线（两端从既有节点名下拉，
  // 提交才落码）。节点/连线/evolve 的编辑不做元素级画布菜单（无 data-id 可命中，
  // research §4 实测降级），由结构树选中 + 属性表单承接。
  | 'add-wardley-component'
  | 'add-wardley-anchor'
  | 'add-wardley-link'
  // venn（more-diagrams 工单 21）：空白 = 加集合（占位 id 避重）/ 加交集（以两个集合组二元
  // 交集）；集合 / 交集 = 改标签与尺寸（D5「选中 + 关菜单」，右侧 VennAreaForm 改）/
  // 加集合（仅集合上，追加在其后）/ 加交集（以该区域首 id 与下一集合组二元交集）/ 删除
  | 'add-venn-set'
  | 'add-venn-union'
  | 'edit-venn-area'
  | 'add-venn-union-here'
  // cynefin（more-diagrams 工单 25）：空白 = 加条目（归属最后一个声明域；无声明域时落
  // complex，文本避重）/ 加转移（两端从固定五域下拉，提交才落码）。域/条目/转移的编辑
  // 不做元素级画布菜单（无 data-id 可命中，research §4/§8.1 实测降级），
  // 由结构树选中 + 属性表单承接。
  | 'add-cynefin-item'
  | 'add-cynefin-transition'
  // usecase（more-diagrams 工单 26）：空白 = 加 actor / 加用例（占位 id 避重）/ 加系统边界；
  // actor / 用例 = 改标签（D5「选中 + 关菜单」，右侧 UsecaseNodeForm 改）/ 从这里连线 /
  // 删除（级联删引用它的关系与 note）；边界 = 改标题（D5，右侧表单改）/ 删除（级联删 end）；
  // 关系 = 改标签与种类（D5，右侧 UsecaseRelationForm 改）/ 删除
  | 'add-usecase-actor'
  | 'add-usecase-case'
  | 'add-usecase-boundary'
  | 'edit-usecase-element'
  | 'edit-usecase-relation'
  // treeView（more-diagrams 工单 24）：空白 = 加根节点（顶层节点）。节点的编辑不做
  // 元素级画布菜单（无 data-id 可命中，research §4 实测降级），由结构树选中 + 属性表单承接。
  | 'add-treeview-root'
  // eventmodeling（more-diagrams 工单 28）：空白 = 加帧（占位帧号 / 标识避重）/ 加数据块
  // （名字避重，空块体）；帧 / 数据块的字段编辑不做元素级画布菜单（无 data-id 可命中，
  // research §4/§8.3 实测降级），由结构树选中 + 属性表单承接
  | 'add-em-frame'
  | 'add-em-data'
  | 'edit-em-frame'
  | 'edit-em-data'
  // agentflow（more-diagrams 工单 27）：空白 = 加节点（创建 + 落码，不做内联命名——节点
  // 身份即源码 id）/ 加 flow 容器（空标题，右侧表单可改）。节点 = 改文本（D5「选中 + 关菜单」，
  // 右侧 AgentflowNodeForm 改）/ 从这里连线（加边表单，提交才落码）/ 删除；边 = 改标签
  //（D5「选中 + 关菜单」，右侧表单改）/ 删除；容器 = 改标题（D5，右侧表单改）/ 删除；
  // 文档行 = 删除。
  | 'add-agentflow-node'
  | 'add-agentflow-flow'
  | 'edit-agentflow-node'
  | 'edit-agentflow-flow'
  // zenuml（more-diagrams 工单 19）：空白 = 加参与者（占位 id 避重）/ 加消息（表单浮出，
  // 提交才落码）；参与者 = 改别名（D5「选中 + 关菜单」，右侧 ZenumlParticipantForm 改）/
  // 删除声明行；消息 = 改文本（D5，右侧 ZenumlMessageForm 改）/ 删除。
  // 片段（分组）无菜单动作（分组无删除/编辑语义，工单 19 不做）。
  | 'add-zenuml-participant'
  | 'add-zenuml-message'
  | 'edit-zenuml-participant'
  | 'edit-zenuml-message'
  // c4（more-diagrams 工单 18）：空白 = 加元素（类型子菜单：Person / System / Container /
  // Component 各家族，含 _Ext/Db/Queue 变体）/ 加边界（四类 Boundary + Deployment Node）。
  // 元素 = 改字段（alias/label/techn/descr，D5「选中 + 关菜单」，右侧 C4ElementForm 改）/
  // 从这里连线 / 删除；边界 = 改标题（D5，右侧 C4BoundaryForm 改）/ 删除；
  // 关系 = 改字段（label/techn/descr/方向，D5，右侧 C4RelationForm 改）/ 删除。
  // 「改 alias」不是独立菜单项——alias 与 label 分字段同在表单里改（改 alias 会同步改写
  // 引用它的关系，见 menu-actions 的 c4-alias 处理）。
  | 'add-c4-element'
  | 'add-c4-boundary'
  | 'edit-c4-element'
  | 'edit-c4-boundary'
  | 'edit-c4-relation'

/**
 * 画布选中 → 菜单目标（工单 03 起为 `canvas-selection/selection-codec.ts` 的
 * `menuTargetOfCanvas` 的转调别名）：节点/连线按图种改写 kind（四种图种的节点都有菜单）；
 * 连线 flowchart 走 mermaid data-id，class / sequence 走**位置序身份**（工单 02，
 * 经 edgeSelectionOf 收窄到本图种可寻址的种类）；空白处一律返回 blank（图种随目标携带）。
 */
export function contextMenuTargetFromSelection(
  selection: CanvasSelection | null,
  diagramType: DiagramTypeId,
): ContextMenuTarget | null {
  return menuTargetOfCanvas(diagramType, selection)
}

/**
 * 图种右键菜单定义（architecture-deepening-3 工单 04）：registry  字段的载荷。
 * 各图种「菜单长什么样」（blankItems / nodeItems，文案键随行）定义在
 * ；本模块只保留菜单目标词汇（Target）、菜单项 id 的
 * 共享 union（MENU_ACTIONS 穷尽 Record、CanvasPanel 渲染与 i18n 文案键共用同一份）
 * 与一份通用渲染器——不再有按 diagramType / selection.kind 的巨型 switch。
 */
export type MenuNodeItemSpec<K extends Selection['kind']> =
  | readonly ContextMenuItemId[]
  | ((selection: Extract<Selection, { kind: K }>, composite: boolean) => readonly ContextMenuItemId[])

export interface DiagramMenuDefinition {
  /** 空白处右键项（顺序即展示顺序） */
  blankItems: readonly ContextMenuItemId[]
  /**
   * 选中元素右键项：selection.kind → 菜单项规格。未收录的 kind = 该图种不响应此选中
   * （渲染器安静返回 []，与「无可弹项安静关闭」同口径）。函数形态目前仅 state 的
   * 复合特例使用（composite 由调用方按投影补齐，见 use-canvas-context-menu）。
   */
  nodeItems: { [K in Selection['kind']]?: MenuNodeItemSpec<K> }
}

/** diagramType（开放类型）→ 菜单定义；未注册图种返回 null（渲染器安静给空菜单） */
function menuOf(diagramType: DiagramTypeId): DiagramMenuDefinition | null {
  return DIAGRAM_TYPE_LIST.find((registration) => registration.id === diagramType)?.menu ?? null
}

/**
 * 菜单目标 → 菜单项列表（通用渲染器，architecture-deepening-3 工单 04）：
 * - 空白：查该图种 registration.menu 的 blankItems（顺序即展示顺序）；
 *   未注册图种（开放 DiagramTypeId）返回 []——unsupported 态画布右键整体停用，不会走到这里
 * - 元素：按 selection.kind 查各 registration.menu.nodeItems（Selection 的 kind 与图种
 *   一一对应，按注册顺序取第一个声明者；穷举守卫见 menu-actions.test 的可达 id 并集测试）；
 *   函数形态规格传入选中与 composite（state 复合特例）
 * 不是可弹菜单目标的选中种类（subgraph / classdef / 区域块等）返回 []——
 * 与「无可弹项安静关闭」的兜底同口径
 */
export function contextMenuItems(target: ContextMenuTarget): ContextMenuItemId[] {
  if (target.kind === 'blank') return [...(menuOf(target.diagramType)?.blankItems ?? [])]
  const selection = target.selection
  for (const registration of DIAGRAM_TYPE_LIST) {
    const spec = registration.menu.nodeItems[selection.kind]
    if (spec === undefined) continue
    const items =
      typeof spec === 'function'
        ? (spec as (s: never, composite: boolean) => readonly ContextMenuItemId[])(
            selection as never,
            target.composite ?? false,
          )
        : spec
    return [...items]
  }
  return []
}
