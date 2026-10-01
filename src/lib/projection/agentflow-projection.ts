import type { SourceDocument } from '../pipeline/document'
import {
  type AgentflowContainerOpenData,
  type AgentflowDocLineData,
  type AgentflowEdgeData,
  type AgentflowEdgeKind,
  type AgentflowHeaderData,
  type AgentflowNodeData,
} from '../pipeline/agentflow'
import type { Selection } from './selection'

/**
 * agentflow 投影（more-diagrams 工单 27，ADR-0008/0016）：从解析产物派生的只读结构视图。
 *
 * - 节点：**名字即身份** `node:<id>`（mermaid DOM id `{svgId}-agentflow-{id}-{n}` 可前缀剥离
 *   反注 data-id，画布点选可用；research §8.2 实测）。
 * - 边：**位置序身份** `edge:<from>-><to>`（ADR-0012，文档序），三种语义
 *   （sequence / reference / failure）。
 * - 容器：`flow` 分组（开行 elementId `container:flow:N`）——**画布无 data-id、无 data-et**
 *   （research §8.2 实测：`data-et="cluster"` 只出现在边上），容器**不做画布点选**（如实降级
 *   ADR-0007），走结构树。节点归属由容器 nesting 决定（文档序的 flow 开行/end 配对）。
 * - 文档级属性行：整行可寻址（表单 / 删除）。
 */

export interface ProjectionAgentflowNode {
  /** 节点 id（名字即身份；`node:<id>` 的 key 部分） */
  nodeId: string
  /** 显示文本（去引号）；无形状时为 null */
  text: string | null
  /** 形状（取自 `@{ shape: … }`）；无元数据或未声明 shape 时为 null */
  shape: string | null
  /** 是 `connector id[…]` 声明 */
  isConnector: boolean
  /** 该节点所在容器（最近的 flow 开行 elementId）；顶层/global 块内为 null */
  containerId: string | null
  /** 是否被 `global … end` 块直接包裹（作用域豁免，research §2） */
  inGlobal: boolean
}

export interface ProjectionAgentflowEdge {
  /** `edge:<from>-><to>`（含重复后缀），位置序身份 + 编辑意图寻址键 */
  elementId: string
  from: string
  to: string
  edgeKind: AgentflowEdgeKind
  /** 标签（无标签时为空串） */
  label: string
}

export interface ProjectionAgentflowContainer {
  /** 开行 elementId（`container:flow:N` / `container:global:N`） */
  elementId: string
  /** `flow` / `global` */
  keyword: 'flow' | 'global'
  /** 容器 id（`global` 为 null） */
  id: string | null
  /** 标题（去引号）；无标题时为 null */
  title: string | null
}

export interface ProjectionAgentflowDocLine {
  /** `agentflow-doc:N`，文档级属性行元素 id */
  elementId: string
  /** 原行文本（不含 eol） */
  text: string
}

export interface AgentflowProjection {
  nodes: ProjectionAgentflowNode[]
  edges: ProjectionAgentflowEdge[]
  /** 全部容器（文档序；`flow` 与 `global`） */
  containers: ProjectionAgentflowContainer[]
  /** 全部文档级属性行（文档序） */
  docLines: ProjectionAgentflowDocLine[]
  /** 图方向（声明行原文；未写时为空串——mermaid 默认 TB） */
  direction: string
  /** 下一个新增边的预测序号（右键空白/键盘加边用） */
  nextEdgeOrdinal: number
}

/** 从 `@{ shape: x }` 单行元数据里取 shape 值；无则 null */
function shapeOfMeta(metaRaw: string): string | null {
  if (metaRaw === '') return null
  const m = /\bshape\s*:\s*([^,}]*)/.exec(metaRaw)
  if (m === null) return null
  const value = m[1].trim().replace(/^["']|["']$/g, '')
  return value === '' ? null : value
}

/** 从解析产物构建 agentflow 投影（纯函数，ADR-0016：投影吃解析产物） */
export function buildAgentflowProjection(doc: SourceDocument): AgentflowProjection {
  const nodes: ProjectionAgentflowNode[] = []
  const seen = new Set<string>()
  const edges: ProjectionAgentflowEdge[] = []
  const containers: ProjectionAgentflowContainer[] = []
  const docLines: ProjectionAgentflowDocLine[] = []
  let direction = ''

  // 容器栈：记录当前嵌套中的容器（flow 开行 / end 配对）；global 块内的节点「不被吞并」
  const stack: Array<{ elementId: string; keyword: 'flow' | 'global' }> = []

  for (const part of doc.elements) {
    const data = part.element
    switch (data.kind) {
      case 'agentflow-header': {
        direction = (data as AgentflowHeaderData).direction
        break
      }
      case 'agentflow-container-open': {
        const open = data as AgentflowContainerOpenData
        containers.push({ elementId: part.id, keyword: open.keyword, id: open.id, title: open.title })
        stack.push({ elementId: part.id, keyword: open.keyword })
        break
      }
      case 'agentflow-container-end': {
        stack.pop()
        break
      }
      case 'agentflow-node': {
        const node = data as AgentflowNodeData
        if (seen.has(node.nodeId)) break
        seen.add(node.nodeId)
        // 最近的 flow 开行即归属容器（global 不算归属）；global 块直接包裹时标记豁免
        let containerId: string | null = null
        let inGlobal = false
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].keyword === 'flow') {
            containerId = stack[i].elementId
            break
          }
        }
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].keyword === 'global') {
            inGlobal = true
            break
          }
          if (stack[i].keyword === 'flow') break
        }
        nodes.push({
          nodeId: node.nodeId,
          text: node.text,
          shape: shapeOfMeta(node.metaRaw),
          isConnector: node.isConnector,
          containerId,
          inGlobal,
        })
        break
      }
      case 'agentflow-edge': {
        const e = data as AgentflowEdgeData
        edges.push({
          elementId: part.id,
          from: e.fromNodeId,
          to: e.toNodeId,
          edgeKind: e.edgeKind,
          label: e.label ?? '',
        })
        break
      }
      case 'agentflow-doc': {
        const d = data as AgentflowDocLineData
        docLines.push({ elementId: part.id, text: d.text })
        break
      }
      default:
        break
    }
  }

  return {
    nodes,
    edges,
    containers,
    docLines,
    direction,
    nextEdgeOrdinal: edges.length + 1,
  }
}

// ---------- 选中回落 ----------

/** 选中目标在投影中仍存在则原样返回，否则回落 null（由调用方回落图表级） */
export function resolveAgentflowSelection(
  projection: AgentflowProjection,
  selection: Selection | null,
): Selection | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'diagram':
      return selection
    case 'agentflow-node':
      return projection.nodes.some((n) => n.nodeId === selection.nodeId) ? selection : null
    case 'agentflow-edge':
      return projection.edges.some((e) => e.elementId === selection.elementId) ? selection : null
    case 'agentflow-flow':
      return projection.containers.some((c) => c.elementId === selection.elementId) ? selection : null
    case 'agentflow-doc':
      return projection.docLines.some((d) => d.elementId === selection.elementId) ? selection : null
    default:
      return null
  }
}
