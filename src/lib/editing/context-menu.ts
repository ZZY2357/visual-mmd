import type { DiagramTypeId } from '../diagram-registry'
import type { CanvasSelection } from '../canvas-selection/data-id'
import { menuTargetOfCanvas } from '../canvas-selection/selection-codec'

/**
 * 右键菜单（工单 07/04/06/03）：单一菜单随右键目标变化。
 *
 * 本模块是纯逻辑，与 DOM/React 解耦：
 * - 画布选中（data-id 解析产物）+ 图种 → 菜单目标（blank / 节点 / 连线）
 * - 菜单目标 → 菜单项列表（空白处按图种给添加类动作，元素上 = 该元素的编辑动作）
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
  | { kind: 'flowchart-node'; nodeId: string }
  | { kind: 'flowchart-edge'; from: string; to: string; occurrence: number }
  | { kind: 'mindmap-node'; elementId: string }
  /** class 节点：选中 id 即类名 */
  | { kind: 'class-node'; name: string }
  /** sequence 参与者：选中 id 即 actorId */
  | { kind: 'sequence-participant'; actorId: string }
  /** class 关系边（工单 02 位置序寻址）：elementId 即投影 elementId（`relation:N`） */
  | { kind: 'class-relation'; elementId: string }
  /** sequence 消息 / 注释 / 块（工单 02 位置序寻址）：elementId 为 `message:N` / `note:N` / `block:N` */
  | { kind: 'sequence-message'; elementId: string }
  | { kind: 'sequence-note'; elementId: string }
  | { kind: 'sequence-block'; elementId: string }
  // state（more-diagrams 工单 02）：状态节点选中 id 即状态 id（composite 由调用方按投影补齐）；
  // 转移边 elementId 即投影 elementId（`transition:N`，位置序身份）
  | { kind: 'state-node'; id: string; composite?: boolean }
  | { kind: 'state-transition'; elementId: string }
  // er（more-diagrams 工单 03）：实体节点选中 id 即实体名；关系边 / 属性 elementId
  // 即投影 elementId（`relation:N` / `attr:N`）
  | { kind: 'er-entity'; name: string }
  | { kind: 'er-relation'; elementId: string }
  | { kind: 'er-attribute'; elementId: string }
// gitGraph（more-diagrams 工单 04）：画布 DOM 无 data-id（实测降级），无元素级菜单目标；
// 空白菜单提供添加入口（语句序即拓扑，追加 = 文档末尾落码）
  // timeline（more-diagrams 工单 05）：时期是节点、事件是归属时期的元素，elementId
  // 即投影 elementId（`period:N` / `event:N`）。**注**：timeline 画布无 data-id 寻址
  // （见 timeline-adapter），这两个目标目前只能由测试/程序构造，画布右键实际只产出 blank。
  | { kind: 'timeline-period'; elementId: string }
  | { kind: 'timeline-event'; elementId: string }
  // kanban（more-diagrams 工单 06）：列 elementId `kanban-column:<id>`、卡片 `kanban-card:<id>`
  | { kind: 'kanban-column'; elementId: string }
  | { kind: 'kanban-card'; elementId: string }
// requirement（more-diagrams 工单 07）：两类节点（requirement / element）选中 id 即名字；
// 关系边 elementId 即投影 elementId（`relation:N`，位置序身份）
  | { kind: 'requirement-node'; name: string }
  | { kind: 'requirement-element'; name: string }
  | { kind: 'requirement-relation'; elementId: string }
// journey（more-diagrams 工单 08）：画布 DOM 无 data-id（实测降级），无元素级菜单目标；
// 空白菜单提供添加入口（任务/section 的编辑由结构树选中 + 属性表单承接）
// pie（more-diagrams 工单 10）：画布 DOM 无 data-id（实测降级，见 pie-adapter），无元素级
// 菜单目标；空白菜单提供添加入口（扇区的编辑由结构树选中 + 属性表单承接）
// block（more-diagrams 工单 09）：节点选中 id 即语法 id；嵌套块 id 即 gid；
// 边 elementId 即投影 elementId（`edge:N`，位置序身份）
  | { kind: 'block-node'; id: string }
  | { kind: 'block-group'; id: string }
  | { kind: 'block-edge'; elementId: string }
// sankey（more-diagrams 工单 13）：节点选中 id 即名字（名字即身份，经位置序反注可寻址）；
// 链路 elementId 即投影 elementId（`link:N`，位置序身份）
  | { kind: 'sankey-node'; name: string }
  | { kind: 'sankey-link'; elementId: string }
// quadrant（more-diagrams 工单 12）：点/轴/象限经位置序反注可寻址（见 quadrant-adapter），
// 三类元素都有画布菜单；轴/象限是文档级属性元素，无添加/删除入口
  | { kind: 'quadrant-point'; elementId: string }
  | { kind: 'quadrant-axis'; elementId: string }
  | { kind: 'quadrant-quadrant'; elementId: string }
// packet（more-diagrams 工单 16）：字段经 start-bit 映射反注可寻址（见 packet-adapter），
// 改名 / 改位区间 / 删除都有画布菜单
  | { kind: 'packet-field'; elementId: string }
// xychart（more-diagrams 工单 14）：系列 elementId 即投影位置序身份 `series:N`（经类名组
// 位置序反注可寻址）；轴与标题是文档级属性元素（固定身份，经类名组反注可寻址）
  | { kind: 'xychart-series'; elementId: string }
  | { kind: 'xychart-axis'; axis: 'x' | 'y' }
  | { kind: 'xychart-title' }
// architecture（more-diagrams 工单 17）：三类节点选中 id 即源码 id（DOM id 反注可寻址）；
// 边 elementId 即投影位置序身份 `edge:N`——但边 DOM 不可寻址（计数器恒 0，见
// architecture-adapter），边目标只由测试/程序构造，画布右键实际只产出三类节点与 blank
  | { kind: 'architecture-service'; name: string }
  | { kind: 'architecture-group'; name: string }
  | { kind: 'architecture-junction'; name: string }
  | { kind: 'architecture-edge'; elementId: string }
// wardley（more-diagrams 工单 23）：画布 DOM 无 data-id（research §4 实测降级，见
// wardley-adapter），无元素级菜单目标——节点/连线/evolve 目标只由测试/程序构造，
// 画布右键实际只产出 blank（空白菜单提供 加 component / 加 anchor / 加连线 入口）。
// 节点选中 id 即名字（名字即身份）；连线 / evolve elementId 即投影位置序身份。
  | { kind: 'wardley-node'; name: string }
  | { kind: 'wardley-link'; elementId: string }
  | { kind: 'wardley-evolve'; elementId: string }

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
  // wardley（more-diagrams 工单 23）：空白 = 加 component / 加 anchor（名字避重、坐标落
  // 图正中 [0.5, 0.5]，不做内联命名——画布无 data-id）/ 加连线（两端从既有节点名下拉，
  // 提交才落码）。节点/连线/evolve 的编辑不做元素级画布菜单（无 data-id 可命中，
  // research §4 实测降级），由结构树选中 + 属性表单承接。
  | 'add-wardley-component'
  | 'add-wardley-anchor'
  | 'add-wardley-link'

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

/** 空白菜单项按图种：flowchart 维持既有四项，其余图种各一个「添加到空图」的入口。
 * 工单 04 起 class / sequence 各补一个添加注释的入口，sequence 另有添加逻辑块。 */
function blankMenuItems(diagramType: DiagramTypeId): ContextMenuItemId[] {
  switch (diagramType) {
    case 'flowchart':
      return ['add-node', 'link-mode', 'add-style', 'add-subgraph']
    case 'class':
      return ['add-class', 'add-note']
    case 'sequence':
      return ['add-participant', 'add-note', 'add-block']
    case 'mindmap':
      return ['add-root']
    case 'state':
      return ['add-state', 'link-mode']
    case 'er':
      return ['add-entity']
    case 'gitgraph':
      return ['add-commit', 'add-branch']
    case 'timeline':
      return ['add-period', 'add-section']
    case 'kanban':
      return ['add-column']
    case 'requirement':
      // requirement 的空白入口（工单 07 定案）：加 requirement（type 在添加表单的枚举里选）与加 element。
      // 拉关系不做空白入口——关系两端都是节点，从节点菜单「从这里连线」进入更省一步
      return ['add-requirement', 'add-requirement-element']
    case 'journey':
      // journey 的空白入口（工单 08 定案）：加任务（默认 score 3、归属最后一个分组）与加分组
      return ['add-journey-task', 'add-journey-section']
    case 'pie':
      // pie 的空白入口（工单 10 定案）：加扇区（数值落 1，标签避重，右侧表单可改）
      return ['add-pie-sector']
    case 'block':
      // block 的空白入口（more-diagrams 工单 09）：加块节点（创建 + 内联命名）与加嵌套块
      return ['add-block-node', 'add-block-group']
    case 'sankey':
      // sankey 的空白入口（more-diagrams 工单 13）：加链路（三列表单，提交才落码）
      return ['add-sankey-link']
    case 'gantt':
      // gantt 的空白入口（工单 11 定案）：加任务（缺省时长 1d，归属最后一个分组）与加分组
      return ['add-gantt-task', 'add-gantt-section']
    case 'quadrant':
      // quadrant 的空白入口（工单 12 定案）：加点（坐标落 0.5, 0.5，文本避重，右侧表单可改）
      return ['add-quadrant-point']
    case 'packet':
      // packet 的空白入口（工单 16 定案）：加字段（+count 形态衔接前序，位宽缺省 8，
      // 名称避重，落码后内联命名）
      return ['add-packet-field']
    case 'xychart':
      // xychart 的空白入口（more-diagrams 工单 14）：加 line / 加 bar（表单，提交才落码）
      return ['add-xychart-line', 'add-xychart-bar']
    case 'radar':
      // radar 的空白入口（工单 15 定案）：加轴与加曲线（占位 id 避重，右侧表单可改）
      return ['add-radar-axis', 'add-radar-curve']
    case 'architecture':
      // architecture 的空白入口（more-diagrams 工单 17）：加 service（创建 + 内联命名标题）/
      // 加 group / 加 junction
      return ['add-architecture-service', 'add-architecture-group', 'add-architecture-junction']
    case 'treemap':
      // treemap 的空白入口（工单 20 定案）：加分组（顶格 Section）/ 加叶子（顶格 Leaf，数值落 1）
      return ['add-treemap-group', 'add-treemap-leaf']
    case 'wardley':
      // wardley 的空白入口（工单 23 定案）：加 component / 加 anchor（坐标落图正中，
      // 名字避重）/ 加连线（两端从既有节点名下选，提交才落码）
      return ['add-wardley-component', 'add-wardley-anchor', 'add-wardley-link']
    // DiagramTypeId 是开放类型（more-diagrams 工单 01）：未接入画布能力包的图种
    // 没有空白右键入口（unsupported 态下画布右键整体停用，不会走到这里）
    default:
      return []
  }
}

/**
 * 菜单目标 → 菜单项列表（顺序即展示顺序）：
 * - 空白：按图种（flowchart 添加节点 / 连线模式 / 添加样式 / 添加子图；class 添加类 + 添加注释；
 *   sequence 添加参与者 + 添加注释 + 添加逻辑块；mindmap 添加根节点）
 * - flowchart 节点：从这里连线 / 编辑文本 / 应用样式 / 删除
 * - flowchart 连线：在属性面板中编辑（工单 06：与 class 关系 / sequence 消息同语义）/ 删除
 * - mindmap 节点：添加子节点 / 编辑文本 / 删除
 * - class 节点：添加成员 / 添加关系 / 添加注释（`note for X`）/ 删除类（级联删成员与相关关系）
 * - sequence 参与者：添加消息 / 添加逻辑块（以该参与者为落点）/ 删除参与者（级联删引用它的语句）
 * - class 关系边（工单 03/05）：切换关系类型（循环，直接改 kind）/ 在属性面板中编辑
 *   （选中该关系并关闭菜单，基数与标签由右侧 RelationForm 承接）/ 删除
 * - sequence 消息（工单 03/05）：切换箭头（循环，直接改 arrow）/ 在属性面板中编辑
 *   （选中该消息并关闭菜单，激活与文本由右侧 MessageForm 承接）/ 删除
 * - sequence 注释 / 逻辑块（工单 03）：**只放删除**——本票把这两类目标顺带接上（删除意图
 *   早已存在，接线成本≈0），但不再为它们补编辑动作（不扩大改造面；字段仍可在右侧表单改）
 *
 * 编辑类动作遵守 spec 决策「不新增表单浮层」：能循环的直接改（关系类型 / 箭头），
 * 其余是明确的「编辑属性」入口（工单 05 定案 D5）——菜单项自己选中该连线并关闭菜单，
 * 随后右侧表单可编（ADR-0001：表单驱动编辑，不引入第二个编辑入口）。
 * 添加类动作（工单 04）：空白与节点上的 add-note / add-block 在菜单位置浮出添加型小表单
 * （复用 `Add*InlineForm` 形态），提交才落码。
 */
export function contextMenuItems(target: ContextMenuTarget): ContextMenuItemId[] {
  switch (target.kind) {
    case 'blank':
      return blankMenuItems(target.diagramType)
    case 'flowchart-node':
      return ['link-from-here', 'edit-text', 'apply-style', 'delete']
    case 'flowchart-edge':
      return ['edit-label', 'delete']
    case 'mindmap-node':
      return ['add-child', 'edit-text', 'delete']
    case 'class-node':
      return ['add-member', 'add-relation', 'add-note', 'delete-class']
    case 'sequence-participant':
      return ['add-message', 'add-block', 'delete-participant']
    case 'class-relation':
      return ['cycle-relation-kind', 'edit-relation', 'delete-relation']
    case 'sequence-message':
      return ['cycle-message-arrow', 'edit-message', 'delete-message']
    case 'sequence-note':
      return ['delete-note']
    case 'sequence-block':
      return ['delete-block']
    case 'state-node':
      // 复合状态多一项「添加状态（复合内部）」；普通状态 = 改描述 / 连线模式 / 删除
      return target.composite === true
        ? ['add-state-into', 'edit-state-desc', 'link-from-here', 'delete']
        : ['edit-state-desc', 'link-from-here', 'delete']
    case 'state-transition':
      return ['edit-label', 'delete']
    // er（more-diagrams 工单 03）：实体 = 添加属性 / 连线模式（预选起点）/ 改别名 / 删除；
    // 关系 = 切换线型（循环直接改）/ 在属性面板中编辑（基数与标签，枚举选择）/ 删除；
    // 属性 = 在属性面板中编辑 / 删除
    case 'er-entity':
      return ['add-attribute', 'link-from-here', 'edit-er-alias', 'delete']
    case 'er-relation':
      return ['cycle-er-line', 'edit-er-relation', 'delete']
    case 'er-attribute':
      return ['edit-er-attribute', 'delete']
    // timeline（more-diagrams 工单 05）：时期 = 改文本 / 加事件 / 删除；事件 = 改文本 / 删除
    case 'timeline-period':
      return ['edit-period-text', 'add-event', 'delete']
    case 'timeline-event':
      return ['edit-event-text', 'delete']
    // kanban（more-diagrams 工单 06）：列 = 改标题 / 加卡片 / 删除；卡片 = 改描述 / 改元数据 / 删除。
    // 改标题与改描述复用 edit-text（内联编辑，见 menu-actions.beginEditText）。
    case 'kanban-column':
      return ['edit-text', 'add-card', 'delete']
    case 'kanban-card':
      return ['edit-text', 'edit-kanban-metadata', 'delete']
    // requirement（more-diagrams 工单 07）：节点（两类同构）= 改字段（选中它，字段在右侧
    // RequirementForm 里改）/ 从这里连线 / 删除；关系 = 切换关系类型（循环直接改）/
    // 反转方向（直接改）/ 删除
    case 'requirement-node':
    case 'requirement-element':
      return ['edit-requirement-field', 'link-from-here', 'delete']
    case 'requirement-relation':
      return ['cycle-requirement-kind', 'invert-requirement-relation', 'delete']
    // block（more-diagrams 工单 09）：节点 = 改标签（内联编辑）/ 删除；
    // 嵌套块 = 加块节点（落进组内）/ 删除；边 = 在属性面板中编辑 / 删除
    case 'block-node':
      return ['edit-text', 'delete']
    case 'block-group':
      return ['add-block-node', 'delete']
    case 'block-edge':
      return ['edit-label', 'delete']
    // sankey（more-diagrams 工单 13）：节点 = 重命名（选中 + 关菜单，在右侧属性表单改）；
    // 链路 = 在属性面板中编辑（改三列，选中 + 关菜单）/ 删除
    case 'sankey-node':
      return ['edit-sankey-name']
    case 'sankey-link':
      return ['edit-label', 'delete']
    // quadrant（more-diagrams 工单 12）：点 = 改文本（内联编辑）/ 改坐标 / 改样式（都是
    // D5「选中 + 关菜单」，字段在右侧 QuadrantPointForm 改）/ 删除；
    // 轴 / 象限标题 = 改文本（D5「选中 + 关菜单」，右侧表单改——文档级属性元素无删除）
    case 'quadrant-point':
      return ['edit-text', 'edit-quadrant-coords', 'edit-quadrant-style', 'delete']
    case 'quadrant-axis':
    case 'quadrant-quadrant':
      return ['edit-quadrant-text']
    // packet（more-diagrams 工单 16）：字段 = 改名（内联编辑）/ 改位区间（D5「选中 +
    // 关菜单」，start/end 在右侧 PacketFieldForm 改，绝对形态落码）/ 删除
    case 'packet-field':
      return ['edit-text', 'edit-packet-range', 'delete']
    // xychart（more-diagrams 工单 14）：系列 = 改名（选中 + 关菜单，属性表单）/
    // 改类型（直接落码切换 line↔bar）/ 编辑数值（选中 + 关菜单，数组行编辑在属性表单）/
    // 删除；轴 = 改形态/字段（选中 + 关菜单，属性表单承接）；标题 = 改标题（选中 + 关菜单）
    case 'xychart-series':
      return ['edit-label', 'xychart-toggle-type', 'xychart-edit-values', 'delete']
    case 'xychart-axis':
      return ['edit-xychart-axis']
    case 'xychart-title':
      return ['edit-label']
    // architecture（more-diagrams 工单 17）：service = 改标题（内联编辑）/ 图标与分组
    // （D5「选中 + 关菜单」，右侧 ArchitectureServiceForm 改）/ 从这里连线 / 删除；
    // group = 改标题（内联编辑）/ 删除；junction = 删除；边 = 改端口与箭头（D5）/ 删除
    case 'architecture-service':
      return ['edit-text', 'edit-architecture-service', 'link-from-here', 'delete']
    case 'architecture-group':
      return ['edit-text', 'delete']
    case 'architecture-junction':
      return ['delete']
    case 'architecture-edge':
      return ['edit-architecture-edge', 'delete']
    // wardley（more-diagrams 工单 23）：节点 = 从这里拉连线（D5：选中 + 关菜单，字段在右侧
    // WardleyNodeForm 改——画布无 data-id，这几个目标只由结构树选中经键路径构造）/ 删除；
    // 连线 = 加连线（同源预填）/ 编辑（选中 + 关菜单，右侧 WardleyLinkForm 改端点）/ 删除；
    // evolve = 编辑（选中 + 关菜单，右侧 WardleyEvolveForm 改目标）/ 删除
    case 'wardley-node':
      return ['edit-text', 'link-from-here', 'delete']
    case 'wardley-link':
      return ['add-wardley-link', 'edit-label', 'delete']
    case 'wardley-evolve':
      return ['edit-label', 'delete']
  }
}
