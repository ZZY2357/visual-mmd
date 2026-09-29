import type { SourceDocument } from './document'
import type { Span } from './span'
import type { MindmapShapeType } from './mindmap'

/**
 * mindmap 投影 IR（工单 06 spike）：parser 内部表示（*Data）与投影之间的
 * 图种内稳定形状。目标（见 .scratch/architecture-deepening/issues/06）：
 * 投影不再 import pipeline/mindmap 的 *Data，parser 内部表示的改动
 * 只被本文件的转换吸收。
 *
 * 与 *Data 的差异（这层背的复杂度，不是逐字段搬运）：
 * - icon 行折叠进节点：::icon() 归属其前一个节点（mermaid 语义），
 *   投影不再见到独立的 mindmap-icon 元素；
 * - parentId 就地解析：父节点 = 最近的 depth 更小的前序节点，
 *   投影不再持有缩进栈语义；
 * - 丢弃渲染用原文（indent / openRaw / closeRaw / trailing / eol / gapAfterId）：
 *   这些是逐字重组装（ADR-0008）的租金，读侧不需要。
 *
 * shapeType 复用 pipeline/mindmap 的 MindmapShapeType：六值形状词表
 * 同时被编辑意图（MindmapIntent）消费，属共享内核，不是 parser 私有表示。
 */

export type { MindmapShapeType } from './mindmap'

/** IR 转换读取的 parser 字段（仅本文件可见；投影不得依赖） */
interface ParsedNodeFields {
  id: string | null
  text: string
  shapeType: MindmapShapeType | null
  depth: number
}

export interface MindmapNodeIR {
  kind: 'mindmap-node'
  /** `mindmap-node:N`（位置序，ADR-0009：与语法 id 无关） */
  elementId: string
  /** 元素 span（行首含缩进，到下一行行首） */
  span: Span
  /** 语法 id（不显示）；无 id 时 null */
  id: string | null
  text: string
  /** null = 默认无形状 */
  shapeType: MindmapShapeType | null
  /** ::icon() 图标类名，已归属到节点；无图标时 null */
  icon: string | null
  /** 0 起始的层级深度（首个节点为根，depth 0） */
  depth: number
  /** 父节点 elementId；根为 null */
  parentId: string | null
}

export interface MindmapDocumentIR {
  /** 按文档顺序（父先于子）；icon 行已折叠，不单独出现 */
  nodes: MindmapNodeIR[]
}

/** 从解析产物构建 mindmap IR（纯函数；只读 doc，不改写） */
export function toMindmapIR(doc: SourceDocument): MindmapDocumentIR {
  const nodes: MindmapNodeIR[] = []
  for (let i = 0; i < doc.elements.length; i++) {
    const part = doc.elements[i]
    const e = part.element
    if (e.kind === 'mindmap-node') {
      // IR 层允许依赖 parser 表示（投影不允许）；此处一次结构性读取
      const n = e as unknown as ParsedNodeFields
      // 父节点 = 最近的 depth 更小的前序节点（与解析器缩进栈语义一致）
      let parentId: string | null = null
      for (let j = nodes.length - 1; j >= 0; j--) {
        if (nodes[j].depth < n.depth) {
          parentId = nodes[j].elementId
          break
        }
      }
      nodes.push({
        kind: 'mindmap-node',
        elementId: part.id,
        span: part.span,
        id: n.id,
        text: n.text,
        shapeType: n.shapeType,
        icon: null,
        depth: n.depth,
        parentId,
      })
    } else if (e.kind === 'mindmap-icon') {
      // 图标行归属其前一个节点（必须紧跟，与 mermaid 语义一致）
      const prevElement = doc.elements[i - 1]
      const prev = nodes[nodes.length - 1]
      if (prev !== undefined && prevElement !== undefined && prevElement.element.kind === 'mindmap-node') {
        prev.icon = (e as unknown as { icon: string }).icon
      }
    }
  }
  return { nodes }
}
