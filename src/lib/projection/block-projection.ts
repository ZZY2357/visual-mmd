import type { SourceDocument } from '../pipeline/document'
import {
  parseBlockNodeAtom,
  type BlockData,
  type BlockEdgeData,
  type BlockGroupOpenData,
  type BlockNodeAtom,
  type BlockNodeData,
  type BlockShape,
} from '../pipeline/block'
import type { Selection } from './selection'

/**
 * block 投影（more-diagrams 工单 09，ADR-0008/0016）：从解析产物派生的只读结构视图，
 * 驱动结构树与属性表单。投影只认解析产物的 *Data（ADR-0016）。
 *
 * - 块节点按 id 归并（mermaid 的 blockDatabase 以 id 建 Map，同名后写覆盖；
 *   本投影采「首个声明承担编辑入口」与 er 的 ensure* 同口径）。
 * - 边按**位置序**编 elementId（`edge:N`，ADR-0012），与画布连线身份同源。
 * - 嵌套块是分组元素（成员节点经 parentId 挂树）。
 * - **space 也记录在案**（工单决策）：它不是结构树元素（布局空位），但落码稳定性
 *   依赖它被解析/保留——投影里的 `spaces` 让「文档里有哪些空位」可被断言。
 * - 布局语义（如实呈现给用户）：block 没有自动布局，位置 = 书写顺序 + columns，
 *   本图不提供拖拽/移动编辑。
 */

/** 块节点（含连线隐式声明的端点——elementId 为 null，只在结构树可见、画布可点选） */
export interface ProjectionBlockNode {
  /** 语法 id（画布 data-id、编辑意图都用它） */
  id: string
  label: string | null
  shape: BlockShape | 'block_arrow' | null
  /** `:n` 跨列；null = 未写 */
  width: number | null
  /** 所属嵌套块 id（null = 顶层） */
  parentId: string | null
  /** 声明行 elementId（`block-node:<id>`）；连线隐式声明的端点为 null */
  elementId: string | null
  /** 块箭头的方向串（不做方向编辑，工单决策） */
  arrowDirs: string | null
}

/** 边（连线，位置序身份） */
export interface ProjectionBlockEdge {
  /** `edge:N`，位置序身份（ADR-0012）+ 编辑意图寻址键 */
  elementId: string
  from: string
  to: string
  /** 算子原文（`-->` / `x--x` / `-.->`…） */
  line: string
  label: string | null
}

/** 嵌套块（分组） */
export interface ProjectionBlockGroup {
  id: string
  /** `block:gid:n` 跨列；null = 未写 */
  width: number | null
  /** 组内自己的 `columns` 行（null = 无，跟随默认） */
  columns: number | 'auto' | null
  parentId: string | null
  elementId: string
}

/** 布局空位（`space` / `space:N`）——不进结构树，仅记录以保持落码稳定（工单决策） */
export interface ProjectionBlockSpace {
  elementId: string
  width: number | null
  parentId: string | null
}

export interface BlockProjection {
  /** 声明行关键字原文（`block-beta` 或 `block`） */
  keyword: string
  /** `title` 行取值；没有该行时 null */
  title: string | null
  /** 顶层 `columns` 行；没有该行时 null（mermaid 默认 auto） */
  columns: number | 'auto' | null
  nodes: ProjectionBlockNode[]
  edges: ProjectionBlockEdge[]
  groups: ProjectionBlockGroup[]
  spaces: ProjectionBlockSpace[]
}

/** 从解析产物构建 block 投影（纯函数，ADR-0016：投影吃解析产物） */
export function buildBlockProjection(doc: SourceDocument): BlockProjection {
  let keyword = 'block-beta'
  let title: string | null = null
  let columns: number | 'auto' | null = null
  const nodes: ProjectionBlockNode[] = []
  const edges: ProjectionBlockEdge[] = []
  const groups: ProjectionBlockGroup[] = []
  const spaces: ProjectionBlockSpace[] = []
  const byNode = new Map<string, ProjectionBlockNode>()
  const byGroup = new Map<string, ProjectionBlockGroup>()
  // 打开的嵌套块栈：声明/成员行的归属
  const groupStack: ProjectionBlockGroup[] = []

  const ensureNode = (atom: BlockNodeAtom, parentId: string | null): ProjectionBlockNode => {
    const existing = byNode.get(atom.id)
    if (existing !== undefined) return existing
    const node: ProjectionBlockNode = {
      id: atom.id,
      label: atom.label,
      shape: atom.shape,
      width: null,
      parentId,
      elementId: null,
      arrowDirs: atom.arrowDirs,
    }
    byNode.set(atom.id, node)
    nodes.push(node)
    return node
  }

  for (const part of doc.elements) {
    const data = part.element as BlockData
    switch (data.kind) {
      case 'block-header':
        keyword = data.keyword
        break
      case 'block-title':
        title = data.value
        break
      case 'block-columns':
        if (data.owner === null) columns = data.value
        else {
          const group = byGroup.get(data.owner)
          if (group !== undefined && group.columns === null) group.columns = data.value
        }
        break
      case 'block-node': {
        const decl = data as BlockNodeData
        const parent = decl.owner === null ? null : (byGroup.get(decl.owner)?.id ?? null)
        const node = ensureNode(decl.atom, parent)
        // 首个声明承担编辑入口（与 er 的 ensure* 同口径）；宽度取首个声明值
        if (node.elementId === null) {
          node.label = decl.atom.label
          node.shape = decl.atom.shape
          node.arrowDirs = decl.atom.arrowDirs
          node.elementId = part.id
          node.width = decl.width
        }
        break
      }
      case 'block-edge': {
        const edge = data as BlockEdgeData
        const parent = edge.owner === null ? null : (byGroup.get(edge.owner)?.id ?? null)
        // 端点是隐式节点声明（mermaid 语法事实：边语句也把端点放进 blockDatabase）
        const from = parseBlockNodeAtom(edge.left)
        const to = parseBlockNodeAtom(edge.right)
        if (from !== null) ensureNode(from, parent)
        if (to !== null) ensureNode(to, parent)
        edges.push({
          elementId: part.id,
          from: from?.id ?? edge.left,
          to: to?.id ?? edge.right,
          line: edge.line,
          label: edge.label,
        })
        break
      }
      case 'block-group-open': {
        const decl = data as BlockGroupOpenData
        const group: ProjectionBlockGroup = {
          id: decl.id,
          width: decl.width,
          columns: null,
          parentId: groupStack[groupStack.length - 1]?.id ?? null,
          elementId: part.id,
        }
        byGroup.set(decl.id, group)
        groups.push(group)
        groupStack.push(group)
        break
      }
      case 'block-group-close':
        groupStack.pop()
        break
      case 'block-space':
        spaces.push({
          elementId: part.id,
          width: (data as { width: number | null }).width,
          parentId: groupStack[groupStack.length - 1]?.id ?? null,
        })
        break
      default:
        break
    }
  }

  return { keyword, title, columns, nodes, edges, groups, spaces }
}

// ---------- 选中回落 ----------

/** 选中目标在投影中仍存在则原样返回，否则回落 null（由调用方回落图表级） */
export function resolveBlockSelection(
  projection: BlockProjection,
  selection: Selection | null,
): Selection | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'diagram':
      return selection
    case 'block-node':
      return projection.nodes.some((n) => n.id === selection.id) ? selection : null
    case 'block-group':
      return projection.groups.some((g) => g.id === selection.id) ? selection : null
    case 'block-edge':
      return projection.edges.some((e) => e.elementId === selection.elementId) ? selection : null
    default:
      return null
  }
}
