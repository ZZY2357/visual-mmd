import type { DiagramTypeId } from '../diagram-registry'
import type { CanvasSelection } from '../canvas-selection/data-id'
import { edgeSelectionOf } from '../canvas-selection/edge-adapter'

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
  | 'link-from-here'
  | 'edit-text'
  | 'edit-label'
  | 'apply-style'
  | 'add-child'
  | 'delete'
  // 连线菜单（工单 03）：class 关系边与 sequence 消息线各「编辑 + 删除」；
  // 注释 / 逻辑块只补删除（见 contextMenuItems 的说明）
  | 'cycle-relation-kind'
  | 'edit-relation'
  | 'delete-relation'
  | 'cycle-message-arrow'
  | 'edit-message'
  | 'delete-message'
  | 'delete-note'
  | 'delete-block'

/**
 * 画布选中 → 菜单目标：节点/连线按图种改写 kind（四种图种的节点都有菜单）；
 * 连线 flowchart 走 mermaid data-id，class / sequence 走**位置序身份**（工单 02，
 * 经 edgeSelectionOf 收窄到本图种可寻址的种类）；空白处一律返回 blank（图种随目标携带）。
 */
export function contextMenuTargetFromSelection(
  selection: CanvasSelection | null,
  diagramType: DiagramTypeId,
): ContextMenuTarget | null {
  if (selection === null) return { kind: 'blank', diagramType }
  if (selection.kind === 'node') {
    if (diagramType === 'flowchart') return { kind: 'flowchart-node', nodeId: selection.id }
    if (diagramType === 'mindmap') return { kind: 'mindmap-node', elementId: selection.id }
    if (diagramType === 'class') return { kind: 'class-node', name: selection.id }
    return { kind: 'sequence-participant', actorId: selection.id }
  }
  if (selection.kind === 'element') {
    // 复用「身份 → 编辑器选中」的收窄逻辑，保证路由与选中永远认同一批种类
    const editorSelection = edgeSelectionOf(diagramType, selection.elementId)
    if (editorSelection === null) return null
    switch (editorSelection.kind) {
      case 'class-relation':
        return { kind: 'class-relation', elementId: editorSelection.elementId }
      case 'message':
        return { kind: 'sequence-message', elementId: editorSelection.elementId }
      case 'note':
        return { kind: 'sequence-note', elementId: editorSelection.elementId }
      case 'block':
        return { kind: 'sequence-block', elementId: editorSelection.elementId }
      default:
        return null
    }
  }
  return diagramType === 'flowchart'
    ? { kind: 'flowchart-edge', from: selection.from, to: selection.to, occurrence: selection.occurrence }
    : null
}

/** 空白菜单项按图种：flowchart 维持既有四项，其余图种各一个「添加到空图」的入口 */
function blankMenuItems(diagramType: DiagramTypeId): ContextMenuItemId[] {
  switch (diagramType) {
    case 'flowchart':
      return ['add-node', 'link-mode', 'add-style', 'add-subgraph']
    case 'class':
      return ['add-class']
    case 'sequence':
      return ['add-participant']
    case 'mindmap':
      return ['add-root']
  }
}

/**
 * 菜单目标 → 菜单项列表（顺序即展示顺序）：
 * - 空白：按图种（flowchart 添加节点 / 连线模式 / 添加样式 / 添加子图；
 *   class 添加类；sequence 添加参与者；mindmap 添加根节点）
 * - flowchart 节点：从这里连线 / 编辑文本 / 应用样式 / 删除
 * - flowchart 连线：编辑标签 / 删除
 * - mindmap 节点：添加子节点 / 编辑文本 / 删除
 * - class 节点：添加成员 / 添加关系 / 删除类（级联删成员与相关关系）
 * - sequence 参与者：添加消息 / 删除参与者（级联删引用它的语句）
 * - class 关系边（工单 03）：切换关系类型（循环，直接改 kind）/ 编辑基数与标签（关闭菜单，
 *   由右侧 RelationForm 承接）/ 删除
 * - sequence 消息线（工单 03）：切换箭头（循环，直接改 arrow）/ 编辑激活与文本（关闭菜单，
 *   由右侧 MessageForm 承接）/ 删除
 * - sequence 注释 / 逻辑块（工单 03）：**只放删除**——本票把这两类目标顺带接上（删除意图
 *   早已存在，接线成本≈0），但不再为它们补编辑动作（不扩大改造面；字段仍可在右侧表单改）
 *
 * 编辑类动作遵守 spec 决策「不新增表单浮层」：能循环的直接改（关系类型 / 箭头），
 * 其余沿用 flowchart 的既定链路（右键已联动选中 → 关掉菜单后右侧表单可编）。
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
      return ['add-member', 'add-relation', 'delete-class']
    case 'sequence-participant':
      return ['add-message', 'delete-participant']
    case 'class-relation':
      return ['cycle-relation-kind', 'edit-relation', 'delete-relation']
    case 'sequence-message':
      return ['cycle-message-arrow', 'edit-message', 'delete-message']
    case 'sequence-note':
      return ['delete-note']
    case 'sequence-block':
      return ['delete-block']
  }
}
