import { describe, expect, it } from 'vitest'
import { requirementParser } from '../../pipeline/requirement'
import { buildRequirementProjection } from '../../projection/requirement-projection'
import { DIAGRAM_TYPES } from '../../diagram-registry'
import { requirementDeleteIntent, requirementKeyPlan } from '../../pipeline/requirement-keyboard'
import { contextMenuItems, contextMenuTargetFromSelection } from '../context-menu'
import { requirementDataIdResolver } from '../../canvas-selection/requirement-adapter'
import { annotateRequirementRelationIdentities } from '../../canvas-selection/edge-locate'

/**
 * requirement 键位 / 删除意图 / 菜单 / 连线寻址测试（more-diagrams 工单 07，ADR-0013）：
 * Tab = 加 element（不做内联命名——工单明确）、Enter = 拉关系（表单浮层）、Delete = 删除。
 */

const SOURCE = `requirementDiagram
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
`

function projectionOf(source: string) {
  const parsed = requirementParser.parse(source)
  if (!parsed.ok) throw new Error('解析失败')
  return buildRequirementProjection(parsed.doc)
}

describe('requirementKeyPlan（ADR-0013 就近映射）', () => {
  const projection = projectionOf(SOURCE)

  it('Tab = 加 element：落码 add-element（锚点 = 选中块的闭合行）+ 选中，不进入内联编辑', () => {
    const plan = requirementKeyPlan(projection, { key: 'Tab', selection: { kind: 'requirement', name: 'login' } })
    expect(plan).not.toBeNull()
    expect(plan!.intents).toEqual([
      { type: 'add-element', name: 'e', afterElementId: projection.requirements[0]!.tailElementId },
    ])
    expect(plan!.newElementTarget).toEqual({ selection: { kind: 'requirement-element', name: 'e' } })
    // 名字避让已有节点（requirement / element 共享名字空间）
    const plan2 = requirementKeyPlan(projection, { key: 'Tab', selection: { kind: 'requirement-element', name: 'loginUI' } })
    expect(plan2!.intents[0]).toMatchObject({ name: 'e' })
  })

  it('Enter = 打开添加关系表单（requirement / element 节点皆可）', () => {
    expect(requirementKeyPlan(projection, { key: 'Enter', selection: { kind: 'requirement', name: 'login' } })).toEqual({
      intents: [],
      form: 'requirement-relation',
    })
    expect(requirementKeyPlan(projection, { key: 'Enter', selection: { kind: 'requirement-element', name: 'loginUI' } })).toEqual({
      intents: [],
      form: 'requirement-relation',
    })
  })

  it('Delete = 删除选中元素（唯一映射），落码后清空选中', () => {
    expect(requirementKeyPlan(projection, { key: 'Delete', selection: { kind: 'requirement-relation', elementId: 'relation:1' } })).toEqual({
      intents: [{ type: 'delete-relation', elementId: 'relation:1' }],
      clearSelection: true,
    })
    expect(requirementKeyPlan(projection, { key: 'Backspace', selection: { kind: 'requirement', name: 'login' } })).toEqual({
      intents: [{ type: 'delete-requirement', name: 'login' }],
      clearSelection: true,
    })
  })

  it('关系选中上无 Tab/Enter 语义；Shift 修饰 / 无选中 / 已删元素 → null（不 preventDefault）', () => {
    expect(requirementKeyPlan(projection, { key: 'Tab', selection: { kind: 'requirement-relation', elementId: 'relation:1' } })).toBeNull()
    expect(requirementKeyPlan(projection, { key: 'Tab', mods: { shift: true }, selection: { kind: 'requirement', name: 'login' } })).toBeNull()
    expect(requirementKeyPlan(projection, { key: 'Tab', selection: null })).toBeNull()
    expect(requirementKeyPlan(projection, { key: 'Tab', selection: { kind: 'requirement', name: 'nope' } })).toBeNull()
  })
})

describe('requirementDeleteIntent', () => {
  const projection = projectionOf(SOURCE)
  it('三类元素各映射到 delete-* 意图；级联由管线负责；已不在投影 → null', () => {
    expect(requirementDeleteIntent(projection, { kind: 'requirement', name: 'login' })).toEqual({ type: 'delete-requirement', name: 'login' })
    expect(requirementDeleteIntent(projection, { kind: 'requirement-element', name: 'loginUI' })).toEqual({ type: 'delete-element', name: 'loginUI' })
    expect(requirementDeleteIntent(projection, { kind: 'requirement-relation', elementId: 'relation:1' })).toEqual({ type: 'delete-relation', elementId: 'relation:1' })
    expect(requirementDeleteIntent(projection, { kind: 'requirement', name: 'nope' })).toBeNull()
    expect(requirementDeleteIntent(projection, { kind: 'diagram' })).toBeNull()
    expect(requirementDeleteIntent(projection, null)).toBeNull()
  })
})

describe('requirement 菜单（工单 07 定案）', () => {
  it('空白 = 加 requirement / 加 element；节点 = 改字段 / 从这里连线 / 删除；关系 = 切类型 / 反转 / 删除', () => {
    expect(contextMenuItems({ kind: 'blank', diagramType: 'requirement' })).toEqual(['add-requirement', 'add-requirement-element'])
    expect(contextMenuItems({ kind: 'requirement-node', name: 'login' })).toEqual(['edit-requirement-field', 'link-from-here', 'delete'])
    expect(contextMenuItems({ kind: 'requirement-element', name: 'ui' })).toEqual(['edit-requirement-field', 'link-from-here', 'delete'])
    expect(contextMenuItems({ kind: 'requirement-relation', elementId: 'relation:1' })).toEqual(['cycle-requirement-kind', 'invert-requirement-relation', 'delete'])
  })

  it('画布选中 → 菜单目标（经 selection-codec 唯一映射）', () => {
    expect(contextMenuTargetFromSelection({ kind: 'node', id: 'requirement:login' }, 'requirement')).toEqual({
      kind: 'requirement-node',
      name: 'login',
    })
    expect(contextMenuTargetFromSelection({ kind: 'node', id: 'requirement-element:loginUI' }, 'requirement')).toEqual({
      kind: 'requirement-element',
      name: 'loginUI',
    })
  })
})

describe('requirement 画布寻址（工单 07：节点 data-id = 名字，关系按位置序）', () => {
  const projection = projectionOf(SOURCE)

  it('data-id resolver：名字 → elementId（重名 requirement 胜出 element）；relation:N 直通', () => {
    const resolve = requirementDataIdResolver(projection)
    expect(resolve('login')).toEqual({ kind: 'node', id: 'requirement:login' })
    expect(resolve('loginUI')).toEqual({ kind: 'node', id: 'requirement-element:loginUI' })
    expect(resolve('relation:1')).toEqual({ kind: 'element', elementId: 'relation:1' })
    expect(resolve('nope')).toBeNull()
  })

  it('连线反注：条数相符时逐条标 relation:N；不符时整体不标（绝不误归属）', () => {
    // 离线口径与 er（工单 03）同款：fake 元素带 getAttribute / setAttribute；
    // mermaid 每条边原始 data-id 互不相同 → 两条 = 2 组 = relation:1 / relation:2
    const fakePath = (id: string, written: string[]) => ({
      getAttribute: (key: string) => (key === 'data-id' ? id : null),
      setAttribute: (_key: string, value: string) => {
        written.push(value)
      },
    })
    const collected: string[] = []
    const host = {
      querySelectorAll: () => [fakePath('a', collected), fakePath('b', collected)],
    } as unknown as ParentNode
    annotateRequirementRelationIdentities(host, 2)
    expect(collected).toEqual(['relation:1', 'relation:2'])
    // 条数不符 → 整体放弃（不写入）
    const strict: string[] = []
    const strictHost = { querySelectorAll: () => [fakePath('a', strict)] } as unknown as ParentNode
    annotateRequirementRelationIdentities(strictHost, 3)
    expect(strict).toEqual([])
    // 能力包吃的是投影包装（AnyProjection 形态），resolver 与 adapter 直调同源
    expect(
      DIAGRAM_TYPES.requirement.canvas.dataIdResolver({ type: 'requirement', requirement: projection })('login'),
    ).toEqual({ kind: 'node', id: 'requirement:login' })
  })
})
