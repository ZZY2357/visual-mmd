import type { SourceDocument } from '../pipeline/document'
import { type TreemapNodeData } from '../pipeline/treemap'
import type { Selection } from './selection'

/**
 * treemap 投影（more-diagrams 工单 20，ADR-0008/0016）：从解析产物派生的只读结构视图。
 *
 * - 层级节点（Section 分组 + Leaf 叶子）按解析产物的 depth 组树；每个节点行是
 *   **位置序身份** `treemap-node:N`（ADR-0012，文档序——与渲染序无关：treemap 渲染器
 *   按值降序布局，索引序 ≠ 源码序，research §4）。
 * - **画布 DOM 无 data-id**（research §4：渲染器源码 `data-` 出现 0 次，元素只带
 *   class + d3 布局索引）→ 画布寻址整体降级（不伪造，ADR-0007），
 *   结构树 + 属性表单是完整编辑入口。
 * - 数值非法（只能来自手写源码）原样保留在 valueText，valueValid = false 供标注。
 */

export interface ProjectionTreemapNode {
  /** `treemap-node:N`，位置序身份（ADR-0012）+ 编辑意图寻址键 */
  elementId: string
  /** section（无值，分组）/ leaf（有值） */
  nodeKind: 'section' | 'leaf'
  /** 引号内名字 */
  name: string
  /** 数值段原文；Section null */
  valueText: string | null
  /** 数值段可解析出的数值；非数字词法 null */
  value: number | null
  /** 数值是否合法（非负有限数；false = 手写源码的清单外形态，结构树标注） */
  valueValid: boolean
  /** 0 起始层级深度（顶格 Section 为 0） */
  depth: number
  /** 子节点（文档序） */
  children: ProjectionTreemapNode[]
}

export interface TreemapProjection {
  /** 全部节点（文档序平铺；键盘/表单寻址用） */
  nodes: ProjectionTreemapNode[]
  /** 顶层节点（树形结构树的根） */
  roots: ProjectionTreemapNode[]
  /** 下一个新增节点的预测序号（右键空白/键盘加节点用；= 节点总数 + 1，仅文档末尾追加时准） */
  nextNodeOrdinal: number
}

/** 从解析产物构建 treemap 投影（纯函数，ADR-0016：投影吃解析产物） */
export function buildTreemapProjection(doc: SourceDocument): TreemapProjection {
  const flat: ProjectionTreemapNode[] = []
  const stack: ProjectionTreemapNode[] = [] // 上一层级链（depth 单调时成立）

  for (const part of doc.elements) {
    const data = part.element
    if (data.kind !== 'treemap-node') continue
    const node = data as TreemapNodeData
    const value = node.value !== null ? Number(node.value.replace(/,/g, '')) : null
    const projectionNode: ProjectionTreemapNode = {
      elementId: part.id,
      nodeKind: node.value !== null ? 'leaf' : 'section',
      name: node.name,
      valueText: node.value,
      value: value !== null && Number.isFinite(value) ? value : null,
      valueValid: value !== null && value >= 0,
      depth: node.depth,
      children: [],
    }
    flat.push(projectionNode)
    while (stack.length > projectionNode.depth) stack.pop()
    const parent = stack[projectionNode.depth - 1]
    if (parent !== undefined) parent.children.push(projectionNode)
    stack[projectionNode.depth] = projectionNode
    stack.length = projectionNode.depth + 1
  }

  return {
    nodes: flat,
    roots: flat.filter((n) => n.depth === 0),
    nextNodeOrdinal: flat.length + 1,
  }
}

// ---------- 选中回落 ----------

/** 选中目标在投影中仍存在则原样返回，否则回落 null（由调用方回落图表级） */
export function resolveTreemapSelection(
  projection: TreemapProjection,
  selection: Selection | null,
): Selection | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'diagram':
      return selection
    case 'treemap-node':
      return projection.nodes.some((n) => n.elementId === selection.elementId) ? selection : null
    default:
      return null
  }
}
