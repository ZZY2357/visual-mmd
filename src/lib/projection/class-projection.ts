import type { SourceDocument } from '../pipeline/document'
import {
  type ClassDeclData,
  type ClassDirectionData,
  type MemberData,
  type NamespaceData,
  type NoteData,
  type RelationData,
  type RelationKind,
  type Visibility,
  cardOf,
} from '../pipeline/class'
import type { ClassDefData } from '../pipeline/flowchart'
import { type Selection } from './selection'

/**
 * class 投影（ADR-0008）：从解析产物派生的只读结构视图，
 * 驱动结构树与属性表单。投影不持久化、不参与撤销。
 */

export interface ProjectionClass {
  name: string
  /** 泛型（去 ~ 后）；无泛型时 null */
  generic: string | null
  /** 是否带花括号成员块 */
  hasBlock: boolean
  /** `class:X`，编辑意图据此寻址 */
  elementId: string
}

export interface ProjectionMember {
  /** `member:N`，编辑意图据此寻址 */
  elementId: string
  /** 宿主类名；块内成员为 null（按文档位置归属） */
  owner: string | null
  /** 'line' = 一行式；'block' = 花括号块内 */
  form: 'line' | 'block'
  vis: Visibility
  /** 成员正文（可见性之后的部分） */
  text: string
}

export interface ProjectionRelation {
  /** `relation:N`，编辑意图据此寻址 */
  elementId: string
  from: string
  to: string
  /** 起点类泛型（去 ~ 后）；无泛型时 null */
  fromGeneric: string | null
  /** 终点类泛型（去 ~ 后）；无泛型时 null */
  toGeneric: string | null
  kind: RelationKind
  /** 基数（去引号后）；无基数时 null */
  cardFrom: string | null
  cardTo: string | null
  /** 标签；无标签时 null */
  label: string | null
}

export interface ProjectionNote {
  elementId: string
  /** 目标类名；浮动 note 为 null */
  forClass: string | null
  text: string
}

export interface ProjectionClassDef {
  name: string
  props: Record<string, string>
}

/**
 * namespace（工单 06）：渲染产物无 data-id、且不构成 DOM 包含（`childDataIds: []`），
 * 故只作结构树上的命名分组节点（可见 + 可改名），不做分组编辑。
 */
export interface ProjectionNamespace {
  /** `namespace:<名字>`，编辑意图据此寻址 */
  elementId: string
  name: string
}

export interface ClassProjection {
  /**
   * 图表级方向（工单 07）：源码里 `direction` 行的取值原文；没有该行时为 null
   * （表单据此显示「跟随 Mermaid 默认」，不假装某个值）。非法取值照原样带出。
   */
  direction: string | null
  classes: ProjectionClass[]
  members: ProjectionMember[]
  relations: ProjectionRelation[]
  notes: ProjectionNote[]
  classDefs: ProjectionClassDef[]
  /** namespace 命名分组，按首次出现顺序 */
  namespaces: ProjectionNamespace[]
}

/** 从解析产物构建 class 投影（纯函数） */
export function buildClassProjection(doc: SourceDocument): ClassProjection {
  const classes: ProjectionClass[] = []
  const classSeen = new Set<string>()
  const members: ProjectionMember[] = []
  const relations: ProjectionRelation[] = []
  const notes: ProjectionNote[] = []
  const classDefs: ProjectionClassDef[] = []
  const namespaces: ProjectionNamespace[] = []
  const namespaceSeen = new Set<string>()
  // 图表方向取首个 direction 行（与 set-direction 的改写落地侧同口径）
  let direction: string | null = null
  // 块内成员的宿主：最近一个开块的类声明
  let currentBlockOwner: string | null = null

  for (const part of doc.elements) {
    const data = part.element
    if (data.kind === 'class') {
      const c = data as ClassDeclData
      if (!classSeen.has(c.name)) {
        classSeen.add(c.name)
        classes.push({
          name: c.name,
          generic: c.genericRaw !== null ? c.genericRaw.slice(1, -1) : null,
          hasBlock: c.openBrace,
          elementId: part.id,
        })
      }
      currentBlockOwner = c.openBrace ? c.name : null
    } else if (data.kind === 'member') {
      const m = data as MemberData
      members.push({
        elementId: part.id,
        owner: m.form === 'line' ? m.ownerName : currentBlockOwner,
        form: m.form,
        vis: m.vis,
        text: m.raw,
      })
    } else if (data.kind === 'relation') {
      const r = data as RelationData
      relations.push({
        elementId: part.id,
        from: r.from,
        to: r.to,
        fromGeneric: r.fromGenericRaw !== null ? r.fromGenericRaw.slice(1, -1) : null,
        toGeneric: r.toGenericRaw !== null ? r.toGenericRaw.slice(1, -1) : null,
        kind: r.arrow,
        cardFrom: cardOf(r.preArrowRaw),
        cardTo: cardOf(r.postArrowRaw),
        label: r.colonRaw !== '' ? r.label : null,
      })
    } else if (data.kind === 'note') {
      const n = data as NoteData
      notes.push({ elementId: part.id, forClass: n.forClass, text: n.text })
    } else if (data.kind === 'classdef') {
      const cd = data as ClassDefData
      if (!classDefs.some((x) => x.name === cd.name)) {
        const props: Record<string, string> = {}
        for (const item of cd.items) props[item.key] = item.value
        classDefs.push({ name: cd.name, props })
      }
    } else if (data.kind === 'direction') {
      if (direction === null) direction = (data as ClassDirectionData).value
    } else if (data.kind === 'class-end') {
      currentBlockOwner = null
    } else if (data.kind === 'namespace') {
      const ns = data as NamespaceData
      if (!namespaceSeen.has(ns.name)) {
        namespaceSeen.add(ns.name)
        namespaces.push({ elementId: part.id, name: ns.name })
      }
    }
  }

  return { direction, classes, members, relations, notes, classDefs, namespaces }
}

// ---------- 选中回落 ----------

/**
 * 选中目标在投影中仍存在则原样返回，否则回落到图表级（diagram）。
 */
export function resolveClassSelection(projection: ClassProjection, selection: Selection | null): Selection | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'diagram':
      return selection
    case 'class':
      return projection.classes.some((c) => c.name === selection.name) ? selection : null
    case 'class-member':
      return projection.members.some((m) => m.elementId === selection.elementId) ? selection : null
    case 'class-relation':
      return projection.relations.some((r) => r.elementId === selection.elementId) ? selection : null
    case 'class-note':
      return projection.notes.some((n) => n.elementId === selection.elementId) ? selection : null
    case 'class-namespace':
      return projection.namespaces.some((n) => n.elementId === selection.elementId) ? selection : null
    default:
      return null
  }
}
