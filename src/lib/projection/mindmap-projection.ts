import type { SourceDocument } from '../pipeline/document'
import { toMindmapIR, type MindmapShapeType } from '../pipeline/mindmap-ir'
import type { Selection } from './selection'

/**
 * mindmap 投影（ADR-0008）：从解析产物派生的只读结构视图，
 * 驱动结构树（树形缩进编辑界面，工单 08）与属性表单。
 *
 * 工单 06 spike：投影只认 IR（pipeline/mindmap-ir），不再 import
 * pipeline/mindmap 的 *Data；icon 归属与父子解析在 IR 转换层完成。
 */

/** 投影节点公开形状（IR 节点结构兼容；span/kind 为 IR 内部字段，不透出） */
export interface ProjectionMindmapNode {
  /** `mindmap-node:N`，编辑意图据此寻址 */
  elementId: string
  text: string
  /** 语法 id（不显示）；节点没有 id 时 null */
  id: string | null
  shapeType: MindmapShapeType | null
  /** ::icon() 图标类名；无图标时 null */
  icon: string | null
  depth: number
  /** 父节点 elementId；根为 null */
  parentId: string | null
}

export interface MindmapProjection {
  /** 按文档顺序（父先于子） */
  nodes: ProjectionMindmapNode[]
}

/** 从解析产物构建 mindmap 投影（纯函数） */
export function buildMindmapProjection(doc: SourceDocument): MindmapProjection {
  return toMindmapIR(doc)
}

// ---------- 选中回落 ----------

/** 选中目标在投影中仍存在则原样返回，否则回落到图表级（diagram） */
export function resolveMindmapSelection(
  projection: MindmapProjection,
  selection: Selection | null,
): Selection | null {
  if (selection === null) return null
  if (selection.kind === 'diagram') return selection
  if (selection.kind === 'mindmap-node') {
    return projection.nodes.some((n) => n.elementId === selection.elementId) ? selection : null
  }
  return null
}
