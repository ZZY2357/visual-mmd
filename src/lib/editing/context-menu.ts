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
  }
}
