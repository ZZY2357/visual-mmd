import type { SourceDocument } from '../pipeline/document'
import {
  decodeSankeyField,
  isValidSankeyName,
  parseSankeyValue,
  type SankeyLinkData,
} from '../pipeline/sankey'
import type { Selection } from './selection'

/**
 * sankey 投影（more-diagrams 工单 13，ADR-0008/0016）：从解析产物派生的只读结构
 * 视图，驱动结构树与属性表单。投影只认解析产物的 *Data（ADR-0016）。
 *
 * - **节点不落码**：节点 = 链路行 source/target 的**首现去重派生**（mermaid DB
 *   findOrCreateNode 按 Map 去重同款语义），节点以名字为身份；名字只存在于链路行。
 * - 链路按**位置序**编 elementId（`link:N`，ADR-0012——CSV 语法无元素 id）。
 * - 手写源码里的非法形态（非 ASCII 名字——mermaid 词法直接失败、空名、非严格数值
 *   value）**原样保留**并标注（不静默改写用户源码）；落码门在 sankey.ts 的
 *   isValidSankeyName / parseSankeyValue。
 */
export interface ProjectionSankeyNode {
  /** 节点名（= 身份，与链路行的 source/target 一致） */
  name: string
  /** 名字是否过落码门（非空可打印 ASCII；false = 手写源码非法名，结构树标注） */
  nameValid: boolean
  /** 该节点作为 source / target 参与的链路 elementId（文档序） */
  linkIds: string[]
}

export interface ProjectionSankeyLink {
  /** `link:N`，位置序身份（ADR-0012）+ 编辑意图寻址键 */
  elementId: string
  source: string
  target: string
  /** value 列原文（手写非法词法原样保留） */
  valueText: string
  /** value 可解析出的数值；非落码词法 null */
  value: number | null
  /** value 是否过落码门（false = 手写源码非法值，表单标注） */
  valueValid: boolean
  /** source/target 是否过落码门（false = 手写源码空串/非法名，表单标注） */
  sourceValid: boolean
  targetValid: boolean
}

export interface SankeyProjection {
  /** 全部节点（首现序；结构树分组 / 表单寻址） */
  nodes: ProjectionSankeyNode[]
  /** 全部链路（文档序；结构树 / 键盘 / 表单寻址） */
  links: ProjectionSankeyLink[]
  /** 下一个新增链路的预测序号（右键空白加链路用；= 链路总数 + 1） */
  nextLinkOrdinal: number
}

/** 从解析产物构建 sankey 投影（纯函数，ADR-0016：投影吃解析产物） */
export function buildSankeyProjection(doc: SourceDocument): SankeyProjection {
  const nodes: ProjectionSankeyNode[] = []
  const nodeByName = new Map<string, ProjectionSankeyNode>()
  const links: ProjectionSankeyLink[] = []

  for (const part of doc.elements) {
    if (part.element.kind !== 'sankey-link') continue
    const data = part.element as SankeyLinkData
    const source = decodeSankeyField(data.sourceRaw)
    const target = decodeSankeyField(data.targetRaw)
    const value = parseSankeyValue(data.valueRaw)
    for (const name of [source, target]) {
      if (!nodeByName.has(name)) {
        const node: ProjectionSankeyNode = { name, nameValid: isValidSankeyName(name), linkIds: [] }
        nodeByName.set(name, node)
        nodes.push(node)
      }
      nodeByName.get(name)!.linkIds.push(part.id)
    }
    links.push({
      elementId: part.id,
      source,
      target,
      valueText: data.valueRaw,
      value,
      valueValid: value !== null,
      sourceValid: isValidSankeyName(source),
      targetValid: isValidSankeyName(target),
    })
  }

  return {
    nodes,
    links,
    nextLinkOrdinal: links.length + 1,
  }
}

// ---------- 选中回落 ----------

/** 选中目标在投影中仍存在则原样返回，否则回落 null（由调用方回落图表级） */
export function resolveSankeySelection(
  projection: SankeyProjection,
  selection: Selection | null,
): Selection | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'diagram':
      return selection
    case 'sankey-node':
      return projection.nodes.some((n) => n.name === selection.name) ? selection : null
    case 'sankey-link':
      return projection.links.some((l) => l.elementId === selection.elementId) ? selection : null
    default:
      return null
  }
}
