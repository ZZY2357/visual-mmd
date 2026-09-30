import { describe, expect, it } from 'vitest'
import { requirementParser } from '../../pipeline/requirement'
import { buildRequirementProjection, resolveRequirementSelection } from '../requirement-projection'
import { REQUIREMENT_TEMPLATE } from '../../diagram-registry'

/**
 * requirement 投影测试（more-diagrams 工单 07，ADR-0016/0012）：
 * 元素 id（`requirement:<名>` / `requirement-element:<名>`）、关系位置序身份（`relation:N`）、
 * 字段归并到所属块、resolveSelection 存在性校验。
 */

const SOURCE = `requirementDiagram
    direction LR

    functionalRequirement login {
        id: "REQ-1"
        text: "登录"
        risk: Medium
        verifymethod: Test
    }

    element loginUI {
        type: "界面"
    }

    loginUI - satisfies -> login
    auth <- traces - loginUI
`

function projectionOf(source: string) {
  const parsed = requirementParser.parse(source)
  if (!parsed.ok) throw new Error(`解析失败：${parsed.error.message}`)
  return buildRequirementProjection(parsed.doc)
}

describe('buildRequirementProjection', () => {
  const projection = projectionOf(SOURCE)

  it('requirement 块：名字 / type / 字段语义字段齐全，elementId 带 kind 前缀', () => {
    expect(projection.requirements).toHaveLength(1)
    const r = projection.requirements[0]!
    expect(r).toMatchObject({
      name: 'login',
      type: 'functionalRequirement',
      elementId: 'requirement:login',
      id: 'REQ-1',
      text: '登录',
      risk: 'Medium',
      verifymethod: 'Test',
    })
    expect(r.fields.map((f) => f.field)).toEqual(['id', 'text', 'risk', 'verifymethod'])
    // tailElementId = 块闭合行（加字段的落码锚点）
    expect(r.tailElementId).toMatch(/^requirement-end:\d+$/)
  })

  it('element 块：type / docref 语义字段（缺省 null）', () => {
    expect(projection.elements).toHaveLength(1)
    expect(projection.elements[0]).toMatchObject({
      name: 'loginUI',
      elementId: 'requirement-element:loginUI',
      type: '界面',
      docref: null,
    })
  })

  it('关系：位置序身份 relation:N，from/to 归一为箭头方向，reversed 如实保留', () => {
    expect(projection.relations).toHaveLength(2)
    expect(projection.relations[0]).toMatchObject({
      elementId: 'relation:1',
      from: 'loginUI',
      to: 'login',
      relationKind: 'satisfies',
      reversed: false,
    })
    expect(projection.relations[1]).toMatchObject({
      elementId: 'relation:2',
      from: 'loginUI',
      to: 'auth',
      relationKind: 'traces',
      reversed: true,
    })
  })

  it('direction：有行时取值，无行时 null（表单显示「跟随 Mermaid 默认」）', () => {
    expect(projectionOf(SOURCE).direction).toBe('LR')
    expect(projectionOf(REQUIREMENT_TEMPLATE).direction).toBe('LR')
    expect(projectionOf('requirementDiagram\n').direction).toBeNull()
  })
})

describe('resolveRequirementSelection（能力包 resolveSelection 委托）', () => {
  const projection = projectionOf(SOURCE)

  it('存在的三类选中原样返回；diagram 直通', () => {
    expect(resolveRequirementSelection(projection, { kind: 'diagram' })).toEqual({ kind: 'diagram' })
    expect(resolveRequirementSelection(projection, { kind: 'requirement', name: 'login' })).toEqual({
      kind: 'requirement',
      name: 'login',
    })
    expect(
      resolveRequirementSelection(projection, { kind: 'requirement-relation', elementId: 'relation:1' }),
    ).toEqual({ kind: 'requirement-relation', elementId: 'relation:1' })
  })

  it('已不存在的元素 / 别种选中 → null（回落图表级由调用方处理）', () => {
    expect(resolveRequirementSelection(projection, { kind: 'requirement', name: 'nope' })).toBeNull()
    expect(resolveRequirementSelection(projection, { kind: 'requirement-relation', elementId: 'relation:99' })).toBeNull()
    expect(resolveRequirementSelection(projection, { kind: 'class', name: 'A' })).toBeNull()
    expect(resolveRequirementSelection(projection, null)).toBeNull()
  })
})
