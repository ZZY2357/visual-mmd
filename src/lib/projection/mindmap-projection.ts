import type { SourceDocument } from '../pipeline/document'
import type { MindmapIconData, MindmapNodeData, MindmapShapeType } from '../pipeline/mindmap'
import type { Selection } from './selection'

/**
 * mindmap 投影（ADR-0008）：从解析产物派生的只读结构视图，
 * 驱动结构树（树形缩进编辑界面，工单 08）与属性表单。
 */

export interface ProjectionMindmapNode {
  /** `mindmap-node:N`，编辑意图据此寻址 */
  elementId: string
  text: string
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
  const nodes: ProjectionMindmapNode[] = []
  for (const part of doc.elements) {
    if (part.element.kind === 'mindmap-node') {
      const n = part.element as MindmapNodeData
      // 父节点 = 最近的 depth 更小的前序节点（与解析器缩进栈语义一致）
      let parentId: string | null = null
      for (let i = nodes.length - 1; i >= 0; i--) {
        if (nodes[i].depth < n.depth) {
          parentId = nodes[i].elementId
          break
        }
      }
      nodes.push({ elementId: part.id, text: n.text, shapeType: n.shapeType, icon: null, depth: n.depth, parentId })
    } else if (part.element.kind === 'mindmap-icon') {
      // 图标行归属其前一个节点（必须紧跟，与 mermaid 语义一致）
      const prev = nodes[nodes.length - 1]
      const elementIndex = doc.elements.indexOf(part)
      const prevElement = doc.elements[elementIndex - 1]
      if (prev !== undefined && prevElement !== undefined && prevElement.element.kind === 'mindmap-node') {
        prev.icon = (part.element as MindmapIconData).icon
      }
    }
  }
  return { nodes }
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
