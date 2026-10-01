import type { SourceDocument } from '../pipeline/document'
import {
  type WardleyCoords,
  type WardleyDocLineData,
  type WardleyEvolveData,
  type WardleyLinkData,
  type WardleyNodeData,
  type WardleyPipelineData,
} from '../pipeline/wardley'
import type { Selection } from './selection'

/**
 * wardley 投影（more-diagrams 工单 23，ADR-0008/0016）：从解析产物派生的只读结构视图。
 *
 * - **节点**（component / anchor）是**名字即身份**（mermaid 的 `resolveNodeId` 按 id→label
 *   回退解析、连线/evolve 都按名引用，重名会互相覆盖）——所以 elementId 用 `wardley-node:名`，
 *   与 requirement/architecture 同口径。名字是唯一稳定身份，位置序会随文档改动而漂移。
 * - **连线 / evolve** 走**位置序身份**（`wardley-link:N` / `wardley-evolve:N`，ADR-0012）：
 *   from/to 是名字引用，位置序才是稳定的。
 * - **文档级属性行**（title / size / evolution / annotations / note / annotation /
 *   accelerator / deaccelerator）整行可寻址为 `wardley-doc:N`。
 * - **pipeline 块**是整块元素 `pipeline:N`。
 * - **画布 DOM 无 data-id**（research §4 实测：wardleyRenderer 只写 class
 *   `wardley-node` / `wardley-node--anchor|component`，全文仅 3 处 `<defs>` 箭头 marker 有
 *   id，与元素一一对应无关）→ 画布寻址整体降级（不伪造，ADR-0007），
 *   结构树 + 属性表单是完整编辑入口。
 * - 坐标原文逐字保留在 visibilityText / evolutionText；越界/非法手写值原样保留 + coordsValid 标注。
 */

export interface ProjectionWardleyNode {
  /** `wardley-node:名`，名字即身份 + 编辑意图寻址键 */
  elementId: string
  nodeKind: 'component' | 'anchor'
  name: string
  /** 可见度原文（[vis, evo] 第一项 = Y） */
  visibilityText: string
  /** 演化度原文（第二项 = X） */
  evolutionText: string
  /** 两组坐标均可解析为 0–100 非负数 */
  coordsValid: boolean
  /** 是否处于 pipeline 块内（工单 23 不做块内编辑，标注提示） */
  inPipeline: boolean
}

export interface ProjectionWardleyLink {
  /** `wardley-link:N`，位置序身份（ADR-0012） */
  elementId: string
  from: string
  to: string
  /** 箭头原文（`->` / `-->` / `-.->`） */
  arrow: string
  /** 两端名字都存在于节点（否则是悬空引用，标注） */
  endpointsValid: boolean
}

export interface ProjectionWardleyEvolve {
  /** `wardley-evolve:N`，位置序身份 */
  elementId: string
  name: string
  targetText: string
  targetValid: boolean
  /** 名字存在于节点 */
  nameValid: boolean
}

export interface ProjectionWardleyDocLine {
  /** `wardley-doc:N`，位置序身份 */
  elementId: string
  docKind: WardleyDocLineData['docKind']
  /** 原行文本（不含换行） */
  text: string
}

export interface ProjectionWardleyPipeline {
  /** `pipeline:N`，位置序身份 */
  elementId: string
  /** 父组件名（解析不出时空串） */
  parentName: string
  /** 块原文（逐字保留） */
  raw: string
}

export interface WardleyProjection {
  /** 节点（文档序） */
  nodes: ProjectionWardleyNode[]
  /** 连线（文档序位置序） */
  links: ProjectionWardleyLink[]
  /** evolve（文档序位置序） */
  evolves: ProjectionWardleyEvolve[]
  /** 文档级属性行（文档序） */
  docLines: ProjectionWardleyDocLine[]
  /** pipeline 块（文档序） */
  pipelines: ProjectionWardleyPipeline[]
  /** 文档级 title 原文（无色透明传输；无 title 行 null） */
  title: string | null
  /** 下一个新增节点的位置序预测（结构树/键盘落码后选中用；仅文档末尾追加时准） */
  nextNodeOrdinal: number
  /** 下一个新增连线 / evolve 的位置序预测 */
  nextLinkOrdinal: number
  nextEvolveOrdinal: number
}

function coordTextValid(value: string): boolean {
  if (!/^[0-9]+(\.[0-9]+)?$/.test(value)) return false
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 && n <= 100
}

function coordsValid(coords: WardleyCoords): boolean {
  return coordTextValid(coords.visibility) && coordTextValid(coords.evolution)
}

/** 从解析产物构建 wardley 投影（纯函数，ADR-0016：投影吃解析产物） */
export function buildWardleyProjection(doc: SourceDocument): WardleyProjection {
  const nodes: ProjectionWardleyNode[] = []
  const links: ProjectionWardleyLink[] = []
  const evolves: ProjectionWardleyEvolve[] = []
  const docLines: ProjectionWardleyDocLine[] = []
  const pipelines: ProjectionWardleyPipeline[] = []
  let title: string | null = null
  let pipelineDepth = 0

  for (const part of doc.elements) {
    const data = part.element
    switch (data.kind) {
      case 'wardley-node': {
        const node = data as WardleyNodeData
        nodes.push({
          elementId: `wardley-node:${node.name.name}`,
          nodeKind: node.nodeKind,
          name: node.name.name,
          visibilityText: node.coords.visibility,
          evolutionText: node.coords.evolution,
          coordsValid: coordsValid(node.coords),
          inPipeline: pipelineDepth > 0,
        })
        break
      }
      case 'wardley-pipeline': {
        const pipe = data as WardleyPipelineData
        pipelines.push({ elementId: part.id, parentName: pipe.parent.name, raw: pipe.raw })
        break
      }
      case 'wardley-link': {
        const link = data as WardleyLinkData
        links.push({ elementId: part.id, from: link.from.name, to: link.to.name, arrow: link.arrow, endpointsValid: false })
        break
      }
      case 'wardley-evolve': {
        const evolve = data as WardleyEvolveData
        evolves.push({
          elementId: part.id,
          name: evolve.name.name,
          targetText: evolve.target,
          targetValid: coordTextValid(evolve.target),
          nameValid: false,
        })
        break
      }
      case 'wardley-doc': {
        const line = data as WardleyDocLineData
        docLines.push({ elementId: part.id, docKind: line.docKind, text: line.text })
        if (line.docKind === 'title' && title === null) {
          title = line.text.replace(/^[ \t]*title[ \t]*/, '').trim()
        }
        break
      }
      default:
        break
    }
  }

  // 端点 / 名字引用校验（name set 建好后统一回填）
  const names = new Set(nodes.map((n) => n.name))
  for (const link of links) link.endpointsValid = names.has(link.from) && names.has(link.to)
  for (const evolve of evolves) evolve.nameValid = names.has(evolve.name)

  return {
    nodes,
    links,
    evolves,
    docLines,
    pipelines,
    title,
    nextNodeOrdinal: nodes.length + 1,
    nextLinkOrdinal: links.length + 1,
    nextEvolveOrdinal: evolves.length + 1,
  }
}

// ---------- 选中回落 ----------

/** 选中目标在投影中仍存在则原样返回，否则回落 null（由调用方回落图表级） */
export function resolveWardleySelection(
  projection: WardleyProjection,
  selection: Selection | null,
): Selection | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'diagram':
      return selection
    case 'wardley-node':
      return projection.nodes.some((n) => n.name === selection.name) ? selection : null
    case 'wardley-link':
      return projection.links.some((l) => l.elementId === selection.elementId) ? selection : null
    case 'wardley-evolve':
      return projection.evolves.some((e) => e.elementId === selection.elementId) ? selection : null
    default:
      return null
  }
}
