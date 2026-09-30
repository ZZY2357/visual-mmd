import type { SourceDocument } from '../pipeline/document'
import {
  type ErAttributeData,
  type ErDirectionData,
  type ErEntityData,
  type ErRelationData,
  erLineKindOf,
} from '../pipeline/er'
import type { Selection } from './selection'

/**
 * er 投影（more-diagrams 工单 03，ADR-0008/0016）：从解析产物派生的只读结构视图，
 * 驱动结构树与属性表单。投影只认解析产物的 *Data（ADR-0016）。
 *
 * - 实体按 name 归并：声明行（含属性块）与关系引用落到同一实体；
 *   仅被关系引用的**隐式实体**（elementId null，没有声明行）与 state 的隐式状态同口径。
 * - 关系按**位置序**编 elementId（`relation:N`，ADR-0012），与画布连线身份同源。
 * - 属性是**归属实体的元素**（结构树可选中，表单可改全部字段），elementId `attr:N`
 *   按文档序（含跨实体全局计数，与 parser 计数器一致）。
 * - 每个实体预计算「下一个插入属性的锚点与序号」（attrAnchorElementId / nextAttrOrdinal），
 *   键盘 Tab 加属性据此预测新元素的 elementId（applyPlan 选中新属性）。
 */

export interface ProjectionErAttribute {
  /** `attr:N`，文档序身份 + 编辑意图寻址键 */
  elementId: string
  /** 所属实体名 */
  entity: string
  type: string
  nullable: boolean
  /** 名字（不含 `*` 前缀） */
  name: string
  /** 名字是否带 `*` 前缀（mermaid 的主键标记，原文保留） */
  star: boolean
  /** 键列表（PK/FK/UK） */
  keys: string[]
  /** 行尾注释；无 null */
  comment: string | null
}

export interface ProjectionErEntity {
  /** 实体名（语法标识，画布 data-id 与编辑意图都用它） */
  name: string
  /** 别名（`[alias]`）；无 null */
  alias: string | null
  /** 声明行 elementId（`entity:<name>`，首个声明）；隐式实体 null */
  elementId: string | null
  /** 同级插入 / 拉关系的锚点：属性块的 `}` ?? 声明行；隐式实体 null */
  tailElementId: string | null
  /** 是否有属性块 */
  hasBlock: boolean
  /** 归属属性（文档序） */
  attributes: ProjectionErAttribute[]
  /** 加属性的落码锚点：块内最后一个属性 ?? 声明行；隐式实体 null（回退文档末尾） */
  attrAnchorElementId: string | null
  /** 下一个插入属性的 elementId 序号（预测 `attr:N`，applyPlan 选中新属性用） */
  nextAttrOrdinal: number
}

export interface ProjectionErRelation {
  /** `relation:N`，位置序身份（ADR-0012）+ 编辑意图寻址键 */
  elementId: string
  from: string
  to: string
  /** 左基数符号（`|o` / `||` / `}o` / `}|`） */
  cardLeft: string
  /** 右基数符号（`o|` / `||` / `o{` / `|{`） */
  cardRight: string
  /** 实线 identifying / 虚线 non-identifying */
  line: 'identifying' | 'non-identifying'
  /** 单向标签（第一实体视角）；无标签 null */
  label: string | null
}

export interface ErProjection {
  /** 图表级 direction 行取值；没有该行时 null（表单显示「跟随 Mermaid 默认」） */
  direction: string | null
  /** 按首次出现顺序（声明行在前，关系引用的隐式实体在被引用处出现） */
  entities: ProjectionErEntity[]
  /** 全部属性，按文档序（跨实体全局计数与 parser 一致） */
  attributes: ProjectionErAttribute[]
  relations: ProjectionErRelation[]
}

/** 从解析产物构建 er 投影（纯函数，ADR-0016：投影吃 IR/解析产物） */
export function buildErProjection(doc: SourceDocument): ErProjection {
  const directionValues: string[] = []
  const entities: ProjectionErEntity[] = []
  const attributes: ProjectionErAttribute[] = []
  const relations: ProjectionErRelation[] = []
  const byName = new Map<string, ProjectionErEntity>()
  // 属性块栈：栈顶 = 当前属性行的归属实体
  const blockStack: ProjectionErEntity[] = []
  // 已见属性行计数（attr:N 全局计数，跨实体）
  let attrCount = 0
  // 各实体声明时已存在的属性数（块空时新属性从 attrsBefore+1 起编）
  const attrsBeforeOf = new Map<ProjectionErEntity, number>()

  const ensureEntity = (name: string): ProjectionErEntity => {
    const existing = byName.get(name)
    if (existing !== undefined) return existing
    const entity: ProjectionErEntity = {
      name,
      alias: null,
      elementId: null,
      tailElementId: null,
      hasBlock: false,
      attributes: [],
      attrAnchorElementId: null,
      nextAttrOrdinal: attrCount + 1,
    }
    byName.set(name, entity)
    entities.push(entity)
    return entity
  }

  for (const part of doc.elements) {
    const data = part.element
    if (data.kind === 'er-entity') {
      const decl = data as ErEntityData
      const entity = ensureEntity(decl.name)
      entity.elementId = part.id
      entity.tailElementId = part.id
      if (decl.alias !== null) entity.alias = decl.alias
      if (decl.openBrace) {
        entity.hasBlock = true
        attrsBeforeOf.set(entity, attrCount)
        blockStack.push(entity)
      } else {
        // 无块实体：属性锚点即声明行（加属性时原地建块），序号 = 已见属性数 + 1
        entity.attrAnchorElementId = part.id
        entity.nextAttrOrdinal = attrCount + 1
      }
    } else if (data.kind === 'er-end') {
      const entity = blockStack.pop()
      if (entity !== undefined) {
        entity.tailElementId = part.id
        const last = entity.attributes[entity.attributes.length - 1]
        entity.attrAnchorElementId = last !== undefined ? last.elementId : entity.elementId
        entity.nextAttrOrdinal =
          last !== undefined ? Number(last.elementId.slice('attr:'.length)) + 1 : (attrsBeforeOf.get(entity) ?? 0) + 1
      }
    } else if (data.kind === 'er-attribute') {
      const attr = data as ErAttributeData
      const owner = blockStack[blockStack.length - 1]
      attrCount++
      const projected: ProjectionErAttribute = {
        elementId: part.id,
        entity: owner?.name ?? '',
        type: attr.type,
        nullable: attr.nullable,
        name: attr.name,
        star: attr.star,
        keys: attr.keysRaw === '' ? [] : attr.keysRaw.split(',').map((k) => k.trim()).filter((k) => k !== ''),
        comment: attr.comment,
      }
      attributes.push(projected)
      if (owner !== undefined) owner.attributes.push(projected)
    } else if (data.kind === 'er-relation') {
      const rel = data as ErRelationData
      // 关系引用自动创建实体（mermaid 语义）；声明行先见的实体不受影响
      ensureEntity(rel.from)
      ensureEntity(rel.to)
      const lineKind = erLineKindOf(rel.line)
      if (lineKind === null) continue
      relations.push({
        elementId: part.id,
        from: rel.from,
        to: rel.to,
        cardLeft: rel.cardLeft,
        cardRight: rel.cardRight,
        line: lineKind,
        label: rel.label !== '' ? rel.label : null,
      })
    } else if (data.kind === 'er-direction') {
      directionValues.push((data as ErDirectionData).value)
    }
  }

  // 未闭合块在 parser 已拒绝；隐式实体（追加在文档末尾的落码路径）在文档末插入，
  // 新属性序号 = 已见属性数 + 1（ensureEntity 初始化即此口径）
  return { direction: directionValues[0] ?? null, entities, attributes, relations }
}

// ---------- 选中回落 ----------

/** 选中目标在投影中仍存在则原样返回，否则回落 null（由调用方回落图表级） */
export function resolveErSelection(projection: ErProjection, selection: Selection | null): Selection | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'diagram':
      return selection
    case 'er-entity':
      return projection.entities.some((e) => e.name === selection.name) ? selection : null
    case 'er-attribute':
      return projection.attributes.some((a) => a.elementId === selection.elementId) ? selection : null
    case 'er-relation':
      return projection.relations.some((r) => r.elementId === selection.elementId) ? selection : null
    default:
      return null
  }
}
