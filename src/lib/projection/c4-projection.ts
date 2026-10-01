import type { SourceDocument } from '../pipeline/document'
import {
  type C4BoundaryData,
  type C4ElementData,
  type C4ElementKind,
  type C4BoundaryKind,
  type C4HeaderData,
  type C4RelationData,
  type C4Direction,
} from '../pipeline/c4'
import type { Selection } from './selection'

/**
 * C4 投影（more-diagrams 工单 18，ADR-0008/0016）：从解析产物派生的只读结构视图，
 * 驱动结构树与属性表单。投影只认解析产物的 *Data（ADR-0016）。
 *
 * - 元素 / 边界按 alias **名字即身份**（ADR-0012）：`c4-element:<alias>` /
 *   `c4-boundary:<alias>`（重复声明按出现序编号，与 parser 一致）。元素在边界内的归属
 *   由解析时的块栈顺序推导（`boundaryId`）。
 * - 关系按**位置序**编 elementId（`relation:N`，ADR-0012），与画布连线身份同源。
 * - 边界（含 Deployment Node 四类）是**容器**：投影给 `children` 树用，但结构树按扁平
 *   分区展示（元素分区带 `boundaryId` detail），避免深层嵌套。
 */

/** 投影元素的分类：C4 元素（叶子）/ 边界（容器）/ 关系 */
export interface ProjectionC4Element {
  /** `c4-element:<alias>`，名字即身份 + 编辑意图寻址键 */
  elementId: string
  /** 声明宏原文（Person / System_Ext / ContainerDb …），表单据此显示「种类」 */
  macro: string
  elementKind: C4ElementKind
  /** 变体原文（`_Ext` / `Db_Ext` / `Queue` …）；无 '' */
  variant: string
  /** 语法标识（关系引用它） */
  alias: string
  /** 显示文本；无 label 回落 alias */
  label: string
  /** 是否显式写了 label */
  hasLabel: boolean
  /** 技术栈 / 类型描述（Container / Component 的 techn；Person / System 无 → null） */
  techn: string | null
  descr: string | null
  /** sprite / tags / $link 只读展示（工单 18 白名单外，不做编辑） */
  sprite: string | null
  tags: string | null
  link: string | null
  /** 所属边界的 alias；顶层元素 null */
  boundaryAlias: string | null
  /** 是否外部（`_Ext` 变体，含 `Db_Ext` / `Queue_Ext`）——用于结构树展示 */
  external: boolean
}

export interface ProjectionC4Boundary {
  /** `c4-boundary:<alias>` */
  elementId: string
  macro: string
  boundaryKind: C4BoundaryKind
  alias: string
  label: string
  hasLabel: boolean
  /** 「类型」位（Deployment Node 的 type / Boundary 的 type）；无 null */
  techn: string | null
  tags: string | null
  link: string | null
  /** 外层边界的 alias；顶层 null */
  parentAlias: string | null
  /** 直接归属的元素（含子边界内的由 children 承担） */
  memberCount: number
}

export interface ProjectionC4Relation {
  /** `relation:N`，位置序身份（ADR-0012）+ 编辑意图寻址键 */
  elementId: string
  /** 声明宏原文（Rel / Rel_U / BiRel / RelIndex …） */
  macro: string
  from: string
  to: string
  direction: C4Direction
  bidirectional: boolean
  reversed: boolean
  indexed: boolean
  /** RelIndex 的 index 原文；非 RelIndex null */
  indexRaw: string | null
  label: string | null
  techn: string | null
  descr: string | null
  sprite: string | null
  tags: string | null
  link: string | null
}

export interface C4Projection {
  /** 声明关键字原文（C4Context …） */
  keyword: string | null
  /** 元素（文档序） */
  elements: ProjectionC4Element[]
  /** 边界（文档序，含 Deployment Node） */
  boundaries: ProjectionC4Boundary[]
  /** 关系（文档序） */
  relations: ProjectionC4Relation[]
  /** 下一个新关系的序号（预测 `relation:N`，applyPlan 选中新关系用） */
  nextRelationOrdinal: number
}

/** 从解析产物构建 C4 投影（纯函数，ADR-0016：投影只吃解析产物） */
export function buildC4Projection(doc: SourceDocument): C4Projection {
  const elements: ProjectionC4Element[] = []
  const boundaries: ProjectionC4Boundary[] = []
  const relations: ProjectionC4Relation[] = []
  let keyword: string | null = null

  for (const part of doc.elements) {
    const data = part.element
    if (data.kind === 'c4-header') {
      keyword = (data as C4HeaderData).keyword
    } else if (data.kind === 'c4-boundary') {
      const bd = data as C4BoundaryData
      const alias = bd.fields.alias ?? ''
      const label = bd.fields.label
      boundaries.push({
        elementId: part.id,
        macro: bd.macro,
        boundaryKind: bd.boundaryKind,
        alias,
        label: label ?? alias,
        hasLabel: label !== null,
        techn: bd.fields.techn,
        tags: bd.fields.tags,
        link: bd.fields.link,
        parentAlias: bd.parentAlias,
        memberCount: 0,
      })
    } else if (data.kind === 'c4-element') {
      const el = data as C4ElementData
      const alias = el.fields.alias ?? ''
      const label = el.fields.label
      elements.push({
        elementId: part.id,
        macro: el.macro,
        elementKind: el.elementKind,
        variant: el.variant,
        alias,
        label: label ?? alias,
        hasLabel: label !== null,
        techn: el.fields.techn,
        descr: el.fields.descr,
        sprite: el.fields.sprite,
        tags: el.fields.tags,
        link: el.fields.link,
        boundaryAlias: el.parentAlias,
        external: /_Ext$/.test(el.variant),
      })
      const owner = boundaries.find((b) => b.alias === el.parentAlias)
      if (owner !== undefined) owner.memberCount++
    } else if (data.kind === 'c4-relation') {
      const rel = data as C4RelationData
      relations.push({
        elementId: part.id,
        macro: rel.macro,
        from: rel.from,
        to: rel.to,
        direction: rel.direction,
        bidirectional: rel.bidirectional,
        reversed: rel.reversed,
        indexed: rel.indexed,
        indexRaw: rel.indexRaw,
        label: rel.label,
        techn: rel.techn,
        descr: rel.descr,
        sprite: rel.sprite,
        tags: rel.tags,
        link: rel.link,
      })
    }
  }

  return { keyword, elements, boundaries, relations, nextRelationOrdinal: relations.length + 1 }
}

// ---------- 元素 id 编解码（供键盘 / 菜单预测新元素 id） ----------

/** 投影里全部元素的 alias（结构树 / 菜单避重） */
export function c4KnownAliases(projection: C4Projection): string[] {
  return [...projection.boundaries.map((b) => b.alias), ...projection.elements.map((e) => e.alias)]
}

// ---------- 选中回落 ----------

/** 选中目标在投影中仍存在则原样返回，否则回落 null（由调用方回落图表级） */
export function resolveC4Selection(projection: C4Projection, selection: Selection | null): Selection | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'diagram':
      return selection
    case 'c4-element':
      return projection.elements.some((e) => e.elementId === selection.elementId) ? selection : null
    case 'c4-boundary':
      return projection.boundaries.some((b) => b.elementId === selection.elementId) ? selection : null
    case 'c4-relation':
      return projection.relations.some((r) => r.elementId === selection.elementId) ? selection : null
    default:
      return null
  }
}
