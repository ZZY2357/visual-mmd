import type { SourceDocument } from '../pipeline/document'
import { type IshikawaNodeData } from '../pipeline/ishikawa'
import type { Selection } from './selection'

/**
 * ishikawa 投影（more-diagrams 工单 22，ADR-0008/0016）：从解析产物派生的只读结构视图。
 *
 * - 因果树：鱼头（问题/事件）为根（depth 0），主因（depth 1）挂其下，二级因（depth 2）……
 *   按解析产物的 depth 组树（层级语义 = 相对缩进，见 pipeline/ishikawa.ts）。
 * - 每个节点行是**位置序身份** `ishikawa-node:N`（ADR-0012，文档序）。渲染序 ≠ 源码序
 *   （research §4：`flattenTree` 按深度奇偶 pre-order / post-order 重排），故位置序身份
 *   只对源码/结构树有意义，绝不用于画布 DOM 反推。
 * - **画布 DOM 无 data-id**（research §4 实测：渲染器源码 `data-` 出现 0 次，只有 class；
 *   且渲染序 ≠ 源码序）→ 画布寻址整体降级（不伪造，ADR-0007），
 *   结构树 + 属性表单是完整编辑入口。
 */

export interface ProjectionIshikawaNode {
  /** `ishikawa-node:N`，位置序身份（ADR-0012）+ 编辑意图寻址键 */
  elementId: string
  /** 行内文本（= 去缩进的整行；行内 `%%` 属文本） */
  text: string
  /** 0 起始层级：鱼头 0、主因 1、二级因 2…… */
  depth: number
  /** true = 鱼头（问题/事件，每图唯一） */
  isRoot: boolean
  /** 子节点（文档序） */
  children: ProjectionIshikawaNode[]
}

export interface IshikawaProjection {
  /** 鱼头（问题/事件）；无可解析正文行时为 null（mermaid 此时也不渲染，research 坑 7） */
  root: ProjectionIshikawaNode | null
  /** 全部节点（文档序平铺；键盘/表单寻址用；首项即鱼头） */
  nodes: ProjectionIshikawaNode[]
  /** 下一个新增节点的预测序号（右键空白/键盘加节点用；= 节点总数 + 1，仅文档末尾追加时准） */
  nextNodeOrdinal: number
}

/** 从解析产物构建 ishikawa 投影（纯函数，ADR-0016：投影吃解析产物） */
export function buildIshikawaProjection(doc: SourceDocument): IshikawaProjection {
  const flat: ProjectionIshikawaNode[] = []
  // 层级栈（与 mermaid IshikawaDB.addNode 同构）：depth 是 mermaid 原始 level
  // （= rawLevel - baseLevel + 1，不连续：4 空格一档时是 1、5、9……），
  // 组树只依赖 level 的**单调比较**，不能当作数组下标。
  const stack: ProjectionIshikawaNode[] = []

  for (const part of doc.elements) {
    const data = part.element
    if (data.kind !== 'ishikawa-node') continue
    const node = data as IshikawaNodeData
    const projectionNode: ProjectionIshikawaNode = {
      elementId: part.id,
      text: node.text,
      depth: node.depth,
      isRoot: node.isRoot,
      children: [],
    }
    flat.push(projectionNode)
    // 弹出 >= 当前 level 的层级（鱼头 level 0 恒在栈底）
    while (stack.length > 1 && stack[stack.length - 1].depth >= projectionNode.depth) stack.pop()
    const parent = stack[stack.length - 1]
    if (parent !== undefined) parent.children.push(projectionNode)
    stack.push(projectionNode)
  }

  return {
    root: flat.find((n) => n.isRoot) ?? null,
    nodes: flat,
    nextNodeOrdinal: flat.length + 1,
  }
}

// ---------- 选中回落 ----------

/** 选中目标在投影中仍存在则原样返回，否则回落 null（由调用方回落图表级） */
export function resolveIshikawaSelection(
  projection: IshikawaProjection,
  selection: Selection | null,
): Selection | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'diagram':
      return selection
    case 'ishikawa-node':
      return projection.nodes.some((n) => n.elementId === selection.elementId) ? selection : null
    default:
      return null
  }
}
