import type { DiagramTypeId } from '../diagram-registry'
import type { CanvasSelection } from '../canvas-selection/data-id'

/**
 * 右键菜单（工单 07）：单一菜单随右键目标变化。
 *
 * 本模块是纯逻辑，与 DOM/React 解耦：
 * - 画布选中（data-id 解析产物）+ 图种 → 菜单目标（blank / 节点 / 连线）
 * - 菜单目标 → 菜单项列表（空白处 = 添加类动作，元素上 = 该元素的编辑动作）
 *
 * 右键目标无法映射为菜单目标（如 sequence/class 的节点，本轮未定义其菜单）
 * 时返回 null：安静地不弹菜单，不崩溃。
 */

export type ContextMenuTarget =
  | { kind: 'blank' }
  | { kind: 'flowchart-node'; nodeId: string }
  | { kind: 'flowchart-edge'; from: string; to: string; occurrence: number }
  | { kind: 'mindmap-node'; elementId: string }

export type ContextMenuItemId =
  | 'add-node'
  | 'link-mode'
  | 'add-style'
  | 'add-subgraph'
  | 'link-from-here'
  | 'edit-text'
  | 'edit-label'
  | 'apply-style'
  | 'add-child'
  | 'delete'

/**
 * 画布选中 → 菜单目标：节点/连线按图种改写 kind；sequence/class 的节点本轮
 * 未定义菜单语义，返回 null（右键不弹菜单）。空白处只在 flowchart 有添加类动作。
 */
export function contextMenuTargetFromSelection(
  selection: CanvasSelection | null,
  diagramType: DiagramTypeId,
): ContextMenuTarget | null {
  if (selection === null) return diagramType === 'flowchart' ? { kind: 'blank' } : null
  if (selection.kind === 'node') {
    if (diagramType === 'flowchart') return { kind: 'flowchart-node', nodeId: selection.id }
    if (diagramType === 'mindmap') return { kind: 'mindmap-node', elementId: selection.id }
    return null
  }
  return diagramType === 'flowchart'
    ? { kind: 'flowchart-edge', from: selection.from, to: selection.to, occurrence: selection.occurrence }
    : null
}

/**
 * 菜单目标 → 菜单项列表（顺序即展示顺序）：
 * - 空白（flowchart）：添加节点 / 添加连线（进入连线模式）/ 添加样式 / 添加子图
 * - flowchart 节点：从这里连线 / 编辑文本 / 应用样式 / 删除
 * - flowchart 连线：编辑标签 / 删除
 * - mindmap 节点：添加子节点 / 编辑文本 / 删除
 * 无动作可做（其它图种的空白处等）返回空列表：菜单不弹出。
 */
export function contextMenuItems(target: ContextMenuTarget): ContextMenuItemId[] {
  switch (target.kind) {
    case 'blank':
      return ['add-node', 'link-mode', 'add-style', 'add-subgraph']
    case 'flowchart-node':
      return ['link-from-here', 'edit-text', 'apply-style', 'delete']
    case 'flowchart-edge':
      return ['edit-label', 'delete']
    case 'mindmap-node':
      return ['add-child', 'edit-text', 'delete']
  }
}
