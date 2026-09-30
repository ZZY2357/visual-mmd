import type { SourceDocument } from '../pipeline/document'
import {
  normalizeRelation,
  type RequirementBlockData,
  type RequirementDirectionData,
  type RequirementElementBlockData,
  type RequirementFieldData,
  type RequirementFieldKind,
  type RequirementRelationData,
} from '../pipeline/requirement'
import type { Selection } from './selection'

/**
 * requirement 投影（more-diagrams 工单 07，ADR-0008/0016）：从解析产物派生的只读结构视图，
 * 驱动结构树与属性表单。投影只认解析产物的 *Data（ADR-0016）。
 *
 * - requirement / element 块按 name 归并：声明行、块内字段、关系引用落到同一节点
 *   （mermaid 的 requirements / elements 都是按 name 建的 Map；同名多块在 mermaid 里
 *   后写覆盖，本投影采「首个声明承担编辑入口」与 er 的 ensure* 同口径）。
 * - 关系按**位置序**编 elementId（`relation:N`，ADR-0012），与画布连线身份同源；
 *   from/to 是**归一后**的语义（反向写法 `{to} <- kind - {from}` 也归一到 from→to），
 *   `reversed` 如实保留书写方向供落码沿用。
 * - 字段无独立 elementId（按「所属块 + 字段名」寻址），故投影不带字段身份。
 */

/** 投影里的一个字段（值已去引号；`quoted` 记录源码形态供表单保持） */
export interface ProjectionRequirementField {
  field: RequirementFieldKind
  value: string
  /** 源码里该值是否带引号 */
  quoted: boolean
}

/** requirement 块（节点） */
export interface ProjectionRequirement {
  /** 名字（语法标识：画布 data-id、关系端点、编辑意图都用它） */
  name: string
  /** 原文 type 字面（6 种枚举之一） */
  type: string
  /** 声明行 elementId（`requirement:<name>`） */
  elementId: string
  /** 加字段的落码锚点：块闭合行（`}`）；未闭合时回落声明行 */
  tailElementId: string
  /** 块内字段（文档序） */
  fields: ProjectionRequirementField[]
  id: string | null
  text: string | null
  risk: string | null
  verifymethod: string | null
}

/** element 块（节点） */
export interface ProjectionRequirementElement {
  name: string
  /** 声明行 elementId（`requirement-element:<name>`） */
  elementId: string
  tailElementId: string
  fields: ProjectionRequirementField[]
  type: string | null
  docref: string | null
}

/** 关系（连线，位置序身份；from/to 已归一为箭头方向） */
export interface ProjectionRequirementRelation {
  /** `relation:N`，位置序身份（ADR-0012）+ 编辑意图寻址键 */
  elementId: string
  from: string
  to: string
  relationKind: string
  /** 源码书写方向：true = `{to} <- {kind} - {from}` */
  reversed: boolean
}

export interface RequirementProjection {
  /** 图表级 direction 行取值；没有该行时 null（表单显示「跟随 Mermaid 默认」） */
  direction: string | null
  requirements: ProjectionRequirement[]
  elements: ProjectionRequirementElement[]
  relations: ProjectionRequirementRelation[]
}

/** 从解析产物构建 requirement 投影（纯函数，ADR-0016：投影吃 IR/解析产物） */
export function buildRequirementProjection(doc: SourceDocument): RequirementProjection {
  const directionValues: string[] = []
  const requirements: ProjectionRequirement[] = []
  const elements: ProjectionRequirementElement[] = []
  const relations: ProjectionRequirementRelation[] = []
  const byRequirement = new Map<string, ProjectionRequirement>()
  const byElement = new Map<string, ProjectionRequirementElement>()
  // 打开的块栈：栈顶 = 当前字段行的归属节点
  const blockStack: Array<
    | { kind: 'requirement'; target: ProjectionRequirement }
    | { kind: 'element'; target: ProjectionRequirementElement }
  > = []

  const ensureRequirement = (name: string): ProjectionRequirement => {
    const existing = byRequirement.get(name)
    if (existing !== undefined) return existing
    const requirement: ProjectionRequirement = {
      name,
      type: '',
      elementId: '',
      tailElementId: '',
      fields: [],
      id: null,
      text: null,
      risk: null,
      verifymethod: null,
    }
    byRequirement.set(name, requirement)
    requirements.push(requirement)
    return requirement
  }

  const ensureElement = (name: string): ProjectionRequirementElement => {
    const existing = byElement.get(name)
    if (existing !== undefined) return existing
    const element: ProjectionRequirementElement = {
      name,
      elementId: '',
      tailElementId: '',
      fields: [],
      type: null,
      docref: null,
    }
    byElement.set(name, element)
    elements.push(element)
    return element
  }

  const applyField = (
    owner: { fields: ProjectionRequirementField[] },
    field: RequirementFieldData,
    assign: (value: string) => void,
  ): void => {
    owner.fields.push({ field: field.field, value: field.value, quoted: field.quoted })
    assign(field.value)
  }

  for (const part of doc.elements) {
    const data = part.element
    if (data.kind === 'requirement') {
      const decl = data as RequirementBlockData
      const requirement = ensureRequirement(decl.name)
      requirement.type = decl.type
      requirement.elementId = part.id
      requirement.tailElementId = part.id
      blockStack.push({ kind: 'requirement', target: requirement })
    } else if (data.kind === 'requirement-element') {
      const decl = data as RequirementElementBlockData
      const element = ensureElement(decl.name)
      element.elementId = part.id
      element.tailElementId = part.id
      blockStack.push({ kind: 'element', target: element })
    } else if (data.kind === 'requirement-end') {
      const top = blockStack.pop()
      if (top !== undefined) top.target.tailElementId = part.id
    } else if (data.kind === 'requirement-field') {
      const field = data as RequirementFieldData
      const owner = blockStack[blockStack.length - 1]
      if (owner === undefined) continue
      if (owner.kind === 'requirement') {
        applyField(owner.target, field, (value) => {
          if (field.field === 'id') owner.target.id = value
          else if (field.field === 'text') owner.target.text = value
          else if (field.field === 'risk') owner.target.risk = value
          else if (field.field === 'verifymethod') owner.target.verifymethod = value
        })
      } else {
        applyField(owner.target, field, (value) => {
          if (field.field === 'type') owner.target.type = value
          else if (field.field === 'docref') owner.target.docref = value
        })
      }
    } else if (data.kind === 'requirement-relation') {
      const relation = normalizeRelation(data as RequirementRelationData)
      relations.push({
        elementId: part.id,
        from: relation.from,
        to: relation.to,
        relationKind: relation.relationKind,
        reversed: relation.reversed,
      })
    } else if (data.kind === 'requirement-direction') {
      directionValues.push((data as RequirementDirectionData).value)
    }
  }

  return { direction: directionValues[0] ?? null, requirements, elements, relations }
}

// ---------- 选中回落 ----------

/** 选中目标在投影中仍存在则原样返回，否则回落 null（由调用方回落图表级） */
export function resolveRequirementSelection(
  projection: RequirementProjection,
  selection: Selection | null,
): Selection | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'diagram':
      return selection
    case 'requirement':
      return projection.requirements.some((r) => r.name === selection.name) ? selection : null
    case 'requirement-element':
      return projection.elements.some((e) => e.name === selection.name) ? selection : null
    case 'requirement-relation':
      return projection.relations.some((r) => r.elementId === selection.elementId) ? selection : null
    default:
      return null
  }
}
