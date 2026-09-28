import type { DiagramTypeId } from '../diagram-registry'
import type { CanvasSelection } from '../canvas-selection/data-id'

/**
 * 右键菜单（工单 07/04）：单一菜单随右键目标变化。
 *
 * 本模块是纯逻辑，与 DOM/React 解耦：
 * - 画布选中（data-id 解析产物）+ 图种 → 菜单目标（blank / 节点 / 连线）
 * - 菜单目标 → 菜单项列表（空白处按图种给添加类动作，元素上 = 该元素的编辑动作）
 *
 * 空白处四种图种都有添加动作（工单 04）：flowchart 添加节点、class 添加类、
 * sequence 添加参与者、mindmap 添加根节点；空图与错误态（空 classDiagram）同样适用。
 * 右键目标无法映射为菜单目标（如 sequence/class 的节点，见工单 06）时返回 null：
 * 安静地不弹菜单，不崩溃。
 */

export type ContextMenuTarget =
  /** 空白处（无 data-id 命中）：diagramType 决定可做的添加动作 */
  | { kind: 'blank'; diagramType: DiagramTypeId }
  | { kind: 'flowchart-node'; nodeId: string }
  | { kind: 'flowchart-edge'; from: string; to: string; occurrence: number }
  | { kind: 'mindmap-node'; elementId: string }

export type ContextMenuItemId =
  | 'add-node'
  | 'link-mode'
  | 'add-style'
  | 'add-subgraph'
  | 'add-class'
  | 'add-participant'
  | 'add-root'
  | 'link-from-here'
  | 'edit-text'
  | 'edit-label'
  | 'apply-style'
  | 'add-child'
  | 'delete'

/**
 * 画布选中 → 菜单目标：节点/连线按图种改写 kind；sequence/class 的节点菜单见工单 06
 * （本轮仍返回 null）。空白处一律返回 blank（图种随目标携带，决定菜单项）。
 */
export function contextMenuTargetFromSelection(
  selection: CanvasSelection | null,
  diagramType: DiagramTypeId,
): ContextMenuTarget | null {
  if (selection === null) return { kind: 'blank', diagramType }
  if (selection.kind === 'node') {
    if (diagramType === 'flowchart') return { kind: 'flowchart-node', nodeId: selection.id }
    if (diagramType === 'mindmap') return { kind: 'mindmap-node', elementId: selection.id }
    return null
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
  }
}
