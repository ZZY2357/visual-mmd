import type { SourceDocument } from '../pipeline/document'
import { splitOccurrence } from '../pipeline/element-id'
import {
  type ClassDefData,
  type ClassStatementData,
  type HeaderData,
  type LinkOccData,
  type LinkSpec,
  type NodeOccData,
  type NodeShapeType,
  type SubgraphOpenData,
} from '../pipeline/flowchart'
import { type Selection } from './selection'

/**
 * flowchart 投影（ADR-0008）：从解析产物派生的只读结构视图，
 * 驱动结构树与属性表单。投影不持久化、不参与撤销；一切编辑经
 * 编辑意图改写源码，投影随源码重新解析而刷新。
 */

export interface ProjectionNode {
  nodeId: string
  /** 形状内显示文本；全部出现均无形状时为 null（表单改名会给首个出现补形状） */
  text: string | null
  shape: NodeShapeType | null
}

export interface ProjectionEdge {
  from: string
  to: string
  /** 同一对节点的第几条连线（1 起） */
  occurrence: number
  label: string | null
  spec: LinkSpec
}

export interface ProjectionSubgraph {
  /** `subgraph:N`，编辑意图据此寻址 */
  elementId: string
  /** 括号标题（`subgraph id[标题]`）；裸 `subgraph 名称` 形式解析为 id、title 为 null */
  title: string | null
  /** 声明的 id；标题兜底展示用 */
  id: string | null
}

export interface ProjectionClassDef {
  name: string
  props: Record<string, string>
}

export interface FlowchartProjection {
  /** 图方向（flowchart TD 的 TD）；无 header 时为 null */
  direction: string | null
  nodes: ProjectionNode[]
  edges: ProjectionEdge[]
  subgraphs: ProjectionSubgraph[]
  classDefs: ProjectionClassDef[]
  /** 节点 id → 已应用的样式名列表（工单 02，来自 class 语句） */
  appliedStyles: Record<string, string[]>
}

/** 从解析产物构建 flowchart 投影（纯函数） */
export function buildFlowchartProjection(doc: SourceDocument): FlowchartProjection {
  const direction: string | null = (() => {
    const header = doc.elements.find((part) => part.element.kind === 'header')
    return header !== undefined ? (header.element as HeaderData).direction : null
  })()

  const nodes: ProjectionNode[] = []
  const nodeSeen = new Set<string>()
  const edges: ProjectionEdge[] = []
  const subgraphs: ProjectionSubgraph[] = []
  const classDefs: ProjectionClassDef[] = []
  const appliedStyles: Record<string, string[]> = {}

  for (const part of doc.elements) {
    const data = part.element
    if (data.kind === 'node') {
      const node = data as NodeOccData
      if (!nodeSeen.has(node.nodeId)) {
        nodeSeen.add(node.nodeId)
        nodes.push({ nodeId: node.nodeId, text: node.text, shape: node.shapeType })
      } else if (node.shapeType !== null) {
        // 首次出现可能是连线里的裸端点（text/shape 为空）；带形状的出现才是节点的
        // 定义（文本、形状），用它覆盖（browser-findings 2026-10-02 #3）
        const known = nodes.find((n) => n.nodeId === node.nodeId)
        if (known !== undefined) {
          known.text = node.text
          known.shape = node.shapeType
        }
      }
    } else if (data.kind === 'link') {
      const link = data as LinkOccData
      // element id 已编码 occurrence（linkElementId），这里用同一份协议解回序号
      const { occurrence } = splitOccurrence(part.id)
      edges.push({
        from: link.fromNodeId,
        to: link.toNodeId,
        occurrence,
        label: link.spec.label,
        spec: link.spec,
      })
    } else if (data.kind === 'subgraph-open') {
      const sg = data as SubgraphOpenData
      subgraphs.push({ elementId: part.id, title: sg.title, id: sg.id })
    } else if (data.kind === 'classdef') {
      const cd = data as ClassDefData
      const props: Record<string, string> = {}
      for (const item of cd.items) props[item.key] = item.value
      classDefs.push({ name: cd.name, props })
    } else if (data.kind === 'class-statement') {
      const cs = data as ClassStatementData
      for (const nodeId of cs.nodeIds) {
        ;(appliedStyles[nodeId] ??= []).push(cs.className)
      }
    }
  }

  return { direction, nodes, edges, subgraphs, classDefs, appliedStyles }
}

// ---------- 选中状态（类型共享自 ./selection，工单 06 起） ----------

export type { Selection }
export { DIAGRAM_SELECTION, sameSelection, selectionKey } from './selection'

/**
 * 选中目标在投影中仍存在则原样返回，否则回落到图表级（diagram）。
 * 源码被外部修改（代码输入、撤销）后选中元素可能消失，此时表单回落而不是崩溃。
 */
export function resolveSelection(
  projection: FlowchartProjection,
  selection: Selection | null,
): Selection | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'diagram':
      return selection
    case 'node':
      return projection.nodes.some((n) => n.nodeId === selection.nodeId) ? selection : null
    case 'edge':
      return projection.edges.some(
        (e) =>
          e.from === selection.from &&
          e.to === selection.to &&
          e.occurrence === selection.occurrence,
      )
        ? selection
        : null
    case 'subgraph':
      return projection.subgraphs.some((s) => s.elementId === selection.elementId) ? selection : null
    case 'classdef':
      return projection.classDefs.some((c) => c.name === selection.name) ? selection : null
    default:
      // sequence 等其他图种的选中种类不归本投影解析
      return null
  }
}
