import type { SourceDocument } from '../pipeline/document'
import {
  CYNEFIN_DOMAINS,
  type CynefinDocLineData,
  type CynefinDomainData,
  type CynefinDomainName,
  type CynefinItemData,
  type CynefinTransitionData,
} from '../pipeline/cynefin'
import type { Selection } from './selection'

/**
 * cynefin 投影（more-diagrams 工单 25，ADR-0008/0016）：从解析产物派生的只读结构视图。
 *
 * - 域（五个固定：complex / complicated / chaotic / clear / confusion）：**分组声明语句**
 *   的稳定身份 `cynefin-domain:名`（五域硬编码，无重名问题）。声明顺序任意，但每个域
 *   在投影里恒存在（未声明的域投影为 items 空数组，便于结构树/表单固定展示五域）。
 * - 条目：**位置序身份** `cynefin-item:N`（ADR-0012，文档序），归属纯由「最近前序域名词行」
 *   决定（research §8.2——**没有 `in domain` 类锚点**）。
 * - 转移：**位置序身份** `cynefin-transition:N`（文档序）；from/to 为域名词。
 * - 文档级属性行（title / accTitle / accDescr）：整行可寻址（表单 / 删除）。
 * - **画布 DOM 无 data-id**（research §4/§8.1 实测：渲染器 `data-` 出现 0 次，仅 `<defs>`
 *   箭头 marker 有 id）→ 画布寻址整体降级（不伪造，ADR-0007），
 *   结构树 + 属性表单是完整编辑入口。
 */

export interface ProjectionCynefinItem {
  /** `cynefin-item:N`，位置序身份（ADR-0012）+ 编辑意图寻址键 */
  elementId: string
  /** 去引号后的条目文本 */
  text: string
  /** 归属域（最近前序域名词行，research §8.2） */
  domain: CynefinDomainName
}

export interface ProjectionCynefinTransition {
  /** `cynefin-transition:N`，位置序身份 + 编辑意图寻址键 */
  elementId: string
  /** 起点域 */
  from: CynefinDomainName
  /** 终点域 */
  to: CynefinDomainName
  /** 标签（无标签时为空串） */
  label: string
}

export interface ProjectionCynefinDomain {
  /** `cynefin-domain:名`，域名词行元素 id（分组声明语句） */
  elementId: string
  /** 域名词（五个之一） */
  name: CynefinDomainName
  /** 该域下有无域名词行（未声明的域仅在投影里占位，不可作为加条目的落点——
   * 条目必须紧随域名词行，无域名词行时 mermaid 拒绝，research §8.3） */
  declared: boolean
  /** 该域下的条目（文档序；归属由位置决定） */
  items: ProjectionCynefinItem[]
}

export interface ProjectionCynefinDocLine {
  /** `cynefin-doc:N`，文档级属性行元素 id */
  elementId: string
  /** 属性种类（title / accTitle / accDescr） */
  docKind: 'title' | 'accTitle' | 'accDescr'
  /** 原行文本（不含 eol） */
  text: string
}

export interface CynefinProjection {
  /** 五个固定域（恒定存在，声明顺序无关；未声明的域 items 为空数组） */
  domains: ProjectionCynefinDomain[]
  /** 全部条目（文档序平铺；键盘/表单寻址用） */
  items: ProjectionCynefinItem[]
  /** 全部转移（文档序平铺） */
  transitions: ProjectionCynefinTransition[]
  /** 文档级属性行（文档序） */
  docLines: ProjectionCynefinDocLine[]
  /** 下一个新增条目的预测序号（右键空白/键盘加条目用；仅文档末尾追加时准） */
  nextItemOrdinal: number
  /** 下一个新增转移的预测序号 */
  nextTransitionOrdinal: number
}

/** 从解析产物构建 cynefin 投影（纯函数，ADR-0016：投影吃解析产物） */
export function buildCynefinProjection(doc: SourceDocument): CynefinProjection {
  // 五个固定域恒定存在（未声明的域也投影空 items，供结构树固定展示）
  const domainMap = new Map<CynefinDomainName, ProjectionCynefinDomain>()
  for (const name of CYNEFIN_DOMAINS) {
    domainMap.set(name, { elementId: `cynefin-domain:${name}`, name, declared: false, items: [] })
  }
  const items: ProjectionCynefinItem[] = []
  const transitions: ProjectionCynefinTransition[] = []
  const docLines: ProjectionCynefinDocLine[] = []

  for (const part of doc.elements) {
    const data = part.element
    switch (data.kind) {
      case 'cynefin-domain': {
        const domain = data as CynefinDomainData
        const node = domainMap.get(domain.domain)
        if (node !== undefined) node.declared = true
        break
      }
      case 'cynefin-item': {
        const item = data as CynefinItemData
        const node: ProjectionCynefinItem = { elementId: part.id, text: item.text, domain: item.domain }
        items.push(node)
        domainMap.get(item.domain)?.items.push(node)
        break
      }
      case 'cynefin-transition': {
        const t = data as CynefinTransitionData
        transitions.push({ elementId: part.id, from: t.from, to: t.to, label: t.label })
        break
      }
      case 'cynefin-doc': {
        const docLine = data as CynefinDocLineData
        docLines.push({ elementId: part.id, docKind: docLine.docKind, text: docLine.text })
        break
      }
      default:
        break
    }
  }

  return {
    domains: CYNEFIN_DOMAINS.map((name) => domainMap.get(name)!),
    items,
    transitions,
    docLines,
    nextItemOrdinal: items.length + 1,
    nextTransitionOrdinal: transitions.length + 1,
  }
}

// ---------- 选中回落 ----------

/** 选中目标在投影中仍存在则原样返回，否则回落 null（由调用方回落图表级） */
export function resolveCynefinSelection(
  projection: CynefinProjection,
  selection: Selection | null,
): Selection | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'diagram':
      return selection
    case 'cynefin-domain':
      return projection.domains.some((d) => d.name === selection.name) ? selection : null
    case 'cynefin-item':
      return projection.items.some((i) => i.elementId === selection.elementId) ? selection : null
    case 'cynefin-transition':
      return projection.transitions.some((t) => t.elementId === selection.elementId) ? selection : null
    default:
      return null
  }
}
