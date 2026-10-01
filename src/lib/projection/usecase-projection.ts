import type { SourceDocument } from '../pipeline/document'
import {
  deriveUsecaseId,
  type UsecaseBoundaryData,
  type UsecaseNodeData,
  type UsecaseNoteData,
  type UsecaseRelationData,
} from '../pipeline/usecase'
import type { Selection } from './selection'

/**
 * usecase-beta 投影（more-diagrams 工单 26，ADR-0008/0016）：从解析产物派生的只读结构视图。
 *
 * - actor / 用例 / 系统边界 / note 是**名字即身份**（ADR-0012 例外：mermaid 内部用一张
 *   共享命名空间的 DB，`actor:X` 与 `usecase:X` 在源码里就是同一个实体，故 elementId 直接
 *   用源码标识符 `actor:<id>` / `usecase:<id>` / `boundary:<id>` / `note:<n>`）。
 * - 关系是**位置序身份**（`relation:N`，ADR-0012；显式边 id 可省略/可重复，位置序唯一稳定）。
 * - 关系端点若未声明，投影**不**凭空造节点（如实反映源码——research 坑 11：mermaid 会静默
 *   创建椭圆用例，但那是渲染期行为；投影只反映源码声明，未声明端点用 `resolved: false` 标注）。
 * - 画布 DOM **可寻址**（research §4 实测：节点 `data-id` = 源码标识符、关系 `data-id` =
 *   `edge-${匿名序号}`）——见 usecase-adapter；投影提供 `dataId` 字段供反注对齐。
 */

export interface ProjectionUsecaseNode {
  /** 元素 id：`actor:<id>` / `usecase:<id>`（名字即身份）+ 编辑意图寻址键 */
  elementId: string
  /** actor / usecase / boundary / note / json */
  nodeKind: 'actor' | 'usecase' | 'boundary' | 'note' | 'json'
  /** 源码标识符（引号声明的推导串，如 `Reset_password`） */
  id: string
  /** 画布 data-id（= 源码标识符；research §4 实测渲染器写 `data-id=node.id`） */
  dataId: string
  /** 显示标签（引号内原文；无标签时为 id） */
  label: string
  /** 用例形状（actor / boundary / note 恒 ellipse） */
  shape: 'ellipse' | 'rect'
  /** 所属系统边界标识符（无归属为 null；嵌套只有一层，research 坑 4） */
  boundaryId: string | null
  /** 关系端点引用时是否已声明（false = 源码悬空引用，渲染期才被补成用例） */
  declared: boolean
}

export interface ProjectionUsecaseRelation {
  /** `relation:N`，位置序身份（ADR-0012）+ 编辑意图寻址键 */
  elementId: string
  /** 1 基文档序（= mermaid 内部匿名 id `edge-${k}` 的 k，research §4） */
  ordinal: number
  /** 源端标识符 */
  source: string
  /** 目标端标识符 */
  target: string
  /** 算子原文（`-->` / `..>` / `--|>` …） */
  operator: string
  /** 关系种类（表单分层：assoc = 7 种实心关联；include / extend / generalization 语义） */
  relationKind: 'assoc' | 'include' | 'extend' | 'generalization'
  /** 标签（引号剥离后的原文；无标签为 null） */
  label: string | null
  /** 画布 data-id（= `edge-${ordinal}`，research §4 实测） */
  dataId: string
}

export interface UsecaseProjection {
  /** 图内全部节点（文档序：actor / 用例 / 边界 / note；关系端点未声明的**不**在此） */
  nodes: ProjectionUsecaseNode[]
  /** 全部关系（文档序，`relation:N`） */
  relations: ProjectionUsecaseRelation[]
  /** 系统边界（文档序，嵌套只有一层） */
  boundaries: ProjectionUsecaseNode[]
  /** 下一个关系序号（= 关系总数 + 1，仅文档末尾追加时准） */
  nextRelationOrdinal: number
}

const SEMANTIC_RE = /^(\.\.>|--\|>)/

/**
 * 关系种类（表单分层，research §43）：`--|>` → generalization；`..>` 虚线语义边按标签区分
 * include / extend（`: extend X` / `: include X`）；其余（7 种实心关联 + 未知）→ assoc。
 */
function relationKindOf(operator: string, label: string | null): ProjectionUsecaseRelation['relationKind'] {
  if (operator === '--|>') return 'generalization'
  if (SEMANTIC_RE.test(operator)) {
    return label !== null && /^extend$/i.test(label) ? 'extend' : 'include'
  }
  return 'assoc'
}

/** 引号 / 反引号剥离（裸词原样返回） */
function stripQuote(raw: string | null): string | null {
  if (raw === null) return null
  const trimmed = raw.replace(/^[([]\s*/, '').replace(/\s*[)\]]$/, '')
  const m = /^[`"]([\s\S]*)[`"]$/.exec(trimmed)
  return m !== null ? m[1] : trimmed
}

/** 从解析产物构建 usecase 投影（纯函数，ADR-0016） */
export function buildUsecaseProjection(doc: SourceDocument): UsecaseProjection {
  const nodes: ProjectionUsecaseNode[] = []
  const relations: ProjectionUsecaseRelation[] = []
  const declared = new Set<string>()
  let openBoundary: string | null = null

  // 首遍：收集声明节点（需要先知道"哪些 id 已声明"以标注关系端点 declared）
  for (const part of doc.elements) {
    const data = part.element
    if (data.kind === 'usecase-actor' || data.kind === 'usecase-usecase') {
      const node = data as UsecaseNodeData
      const id = node.id
      const label = stripQuote(node.labelRaw) ?? id
      nodes.push({
        elementId: part.id,
        nodeKind: data.kind === 'usecase-actor' ? 'actor' : 'usecase',
        id,
        dataId: id,
        label,
        shape: node.shape,
        boundaryId: openBoundary,
        declared: true,
      })
      declared.add(id)
    } else if (data.kind === 'usecase-boundary') {
      const boundary = data as UsecaseBoundaryData
      nodes.push({
        elementId: part.id,
        nodeKind: 'boundary',
        id: boundary.id,
        dataId: boundary.id,
        label: stripQuote(boundary.labelRaw) ?? boundary.id,
        shape: 'ellipse',
        boundaryId: null,
        declared: true,
      })
      openBoundary = boundary.id
    } else if (data.kind === 'usecase-boundary-end') {
      openBoundary = null
    } else if (data.kind === 'usecase-note') {
      const note = data as UsecaseNoteData
      nodes.push({
        elementId: part.id,
        nodeKind: 'note',
        id: part.id.slice('note:'.length),
        dataId: part.id.slice('note:'.length),
        label: stripQuote(note.textRaw) ?? '',
        shape: 'ellipse',
        boundaryId: null,
        declared: true,
      })
    }
  }

  // 次遍：关系（位置序身份）
  let ordinal = 0
  for (const part of doc.elements) {
    if (part.element.kind !== 'usecase-relation') continue
    const rel = part.element as UsecaseRelationData
    const label = stripQuote(rel.labelRaw)
    ordinal++
    relations.push({
      elementId: `relation:${ordinal}`,
      ordinal,
      source: rel.source,
      target: rel.target,
      operator: rel.operator,
      relationKind: relationKindOf(rel.operator, label),
      label,
      dataId: `edge-${ordinal}`,
    })
  }

  return {
    nodes,
    relations,
    boundaries: nodes.filter((n) => n.nodeKind === 'boundary'),
    nextRelationOrdinal: relations.length + 1,
  }
}

/** 关系端点是否已声明（供投影标注 / 表单提示；`deriveUsecaseId` 复用同一推导口径） */
export function usecaseNodeIds(projection: UsecaseProjection): string[] {
  return projection.nodes.filter((n) => n.nodeKind !== 'boundary').map((n) => n.id)
}

/** 导出供表单/结构树复用的推导口径（与渲染器一致） */
export { deriveUsecaseId }

// ---------- 选中回落 ----------

/** 选中目标在投影中仍存在则原样返回，否则回落 null（由调用方回落图表级） */
export function resolveUsecaseSelection(
  projection: UsecaseProjection,
  selection: Selection | null,
): Selection | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'diagram':
      return selection
    case 'usecase-actor':
    case 'usecase-usecase':
    case 'usecase-boundary':
    case 'usecase-note':
      return projection.nodes.some((n) => n.elementId === selection.elementId) ? selection : null
    case 'usecase-relation':
      return projection.relations.some((r) => r.elementId === selection.elementId) ? selection : null
    default:
      return null
  }
}
