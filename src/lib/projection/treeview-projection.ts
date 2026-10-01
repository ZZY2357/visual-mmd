import type { SourceDocument } from '../pipeline/document'
import { type TreeviewNodeData } from '../pipeline/treeview'
import type { Selection } from './selection'

/**
 * treeView 投影（more-diagrams 工单 24，ADR-0008/0016）：从解析产物派生的只读结构视图。
 *
 * - 每个节点行是**位置序身份** `treeview-node:N`（ADR-0012，文档序）。
 * - 父子由缩进层级（mermaid `level` = 缩进字符数）决定：mermaid `db.addNode` 用
 *   `while (level <= 栈顶.level) pop()` 定父，故组树比较用 `<=`；**虚拟根**（mermaid
 *   `db` 里的 `{ name:'/', level:-1 }`）不在源码中，本投影用 `roots`（level 最小的一批
 *   顶层节点）表达。
 * - 目录（名称去引号后以 `/` 结尾）与文件只是语义标注，父子关系一视同仁（research §3）。
 * - **画布 DOM 无 data-id**（research §4 实测：渲染器 0 处 `data-`、0 处 `.attr('id')`）→
 *   画布寻址整体降级（不伪造，ADR-0007），结构树 + 属性表单是完整编辑入口。
 * - 无源码级连线（research §3）：不产出任何连线元素，ADR-0012 位置序连线**不适用**。
 */

export interface ProjectionTreeviewNode {
  /** `treeview-node:N`，位置序身份（ADR-0012）+ 编辑意图寻址键 */
  elementId: string
  /** 名称（去引号、不含目录尾 `/`） */
  name: string
  /** true = 目录（名称去引号后以 `/` 结尾） */
  isDirectory: boolean
  /** `:::class` 注解原文（不含前导空白）；无 null */
  classRaw: string | null
  /** `icon(...)` 注解原文（不含前导空白）；无 null */
  iconRaw: string | null
  /** `## 描述` 注解原文（不含前导空白）；无 null */
  descRaw: string | null
  /** 缩进层级（= mermaid level = 缩进字符数，tab 记 1） */
  level: number
  /** 子节点（文档序） */
  children: ProjectionTreeviewNode[]
}

export interface TreeviewProjection {
  /** 全部节点（文档序平铺；键盘/表单寻址用） */
  nodes: ProjectionTreeviewNode[]
  /** 顶层节点（虚拟根的子节点，按文档序） */
  roots: ProjectionTreeviewNode[]
  /** 下一个新增节点的预测序号（右键空白/键盘加节点用；= 节点总数 + 1，仅文档末尾追加时准） */
  nextNodeOrdinal: number
}

/** 从解析产物构建 treeView 投影（纯函数，ADR-0016：投影吃解析产物） */
export function buildTreeviewProjection(doc: SourceDocument): TreeviewProjection {
  const flat: ProjectionTreeviewNode[] = []
  // 层级栈：栈底是虚拟根（level -1），与 mermaid db 同构
  const stack: ProjectionTreeviewNode[] = [
    { elementId: '', name: '/', isDirectory: true, classRaw: null, iconRaw: null, descRaw: null, level: -1, children: [] },
  ]
  const roots = stack[0].children

  for (const part of doc.elements) {
    const data = part.element
    if (data.kind !== 'treeview-node') continue
    const node = data as TreeviewNodeData
    const projectionNode: ProjectionTreeviewNode = {
      elementId: part.id,
      name: node.name,
      isDirectory: node.isDirectory,
      classRaw: node.classRaw,
      iconRaw: node.iconRaw,
      descRaw: node.descRaw,
      level: node.level,
      children: [],
    }
    flat.push(projectionNode)
    // 弹出 level >= 当前层级的栈顶（mermaid：while (level <= top.level) pop()）
    while (stack.length > 1 && projectionNode.level <= stack[stack.length - 1].level) stack.pop()
    stack[stack.length - 1].children.push(projectionNode)
    stack.push(projectionNode)
  }

  return {
    nodes: flat,
    roots,
    nextNodeOrdinal: flat.length + 1,
  }
}

// ---------- 选中回落 ----------

/** 选中目标在投影中仍存在则原样返回，否则回落 null（由调用方回落图表级） */
export function resolveTreeviewSelection(
  projection: TreeviewProjection,
  selection: Selection | null,
): Selection | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'diagram':
      return selection
    case 'treeview-node':
      return projection.nodes.some((n) => n.elementId === selection.elementId) ? selection : null
    default:
      return null
  }
}
