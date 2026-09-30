import { describe, expect, it } from 'vitest'
import { erParser } from '../../pipeline/er'
import { buildErProjection } from '../../projection/er-projection'
import { DIAGRAM_TYPES } from '../../diagram-registry'
import { erDeleteIntent, erKeyPlan } from '../canvas-keyboard'
import { contextMenuItems, contextMenuTargetFromSelection } from '../context-menu'
import { edgeSelectionOf } from '../../canvas-selection/edge-adapter'
import { annotateErRelationIdentities } from '../../canvas-selection/edge-locate'

/**
 * er 键位 / 删除意图 / 菜单 / 连线寻址测试（more-diagrams 工单 03，ADR-0013）：
 * Tab = 加属性（不做内联编辑）、Enter = 拉关系（表单浮层）、Delete = 删除。
 */

const SOURCE = `erDiagram
    CAR {
        string make PK
        string model
    }
    TRUCK

    CAR ||--|{ TRUCK : has
`

function projectionOf(source: string) {
  const parsed = erParser.parse(source)
  if (!parsed.ok) throw new Error('解析失败')
  return buildErProjection(parsed.doc)
}

describe('erKeyPlan（ADR-0013 就近映射）', () => {
  const projection = projectionOf(SOURCE)

  it('Tab = 给实体加属性：落码 add-attribute + 选中新属性（attr 序号预测），不进入内联编辑', () => {
    const plan = erKeyPlan(projection, { key: 'Tab', selection: { kind: 'er-entity', name: 'CAR' } })
    expect(plan).not.toBeNull()
    expect(plan!.intents).toEqual([{ type: 'add-attribute', entity: 'CAR', attrType: 'string', name: 'field' }])
    expect(plan!.newElementTarget).toEqual({ selection: { kind: 'er-attribute', elementId: 'attr:3' } })
  })

  it('Enter = 打开添加关系表单', () => {
    const plan = erKeyPlan(projection, { key: 'Enter', selection: { kind: 'er-entity', name: 'TRUCK' } })
    expect(plan).toEqual({ intents: [], form: 'er-relation' })
  })

  it('Delete = 删除选中元素（唯一映射）', () => {
    const plan = erKeyPlan(projection, { key: 'Delete', selection: { kind: 'er-relation', elementId: 'relation:1' } })
    expect(plan).toEqual({ intents: [{ type: 'delete-relation', elementId: 'relation:1' }], clearSelection: true })
  })

  it('无选中 / 别种选中 / Shift 修饰 → null（不 preventDefault）', () => {
    expect(erKeyPlan(projection, { key: 'Tab', selection: null })).toBeNull()
    expect(erKeyPlan(projection, { key: 'Tab', selection: { kind: 'er-relation', elementId: 'relation:1' } })).toBeNull()
    expect(erKeyPlan(projection, { key: 'Tab', mods: { shift: true }, selection: { kind: 'er-entity', name: 'CAR' } })).toBeNull()
  })
})

describe('erDeleteIntent', () => {
  const projection = projectionOf(SOURCE)
  it('三类元素各映射到 delete-* 意图；级联由管线负责', () => {
    expect(erDeleteIntent(projection, { kind: 'er-entity', name: 'CAR' })).toEqual({ type: 'delete-entity', name: 'CAR' })
    expect(erDeleteIntent(projection, { kind: 'er-attribute', elementId: 'attr:1' })).toEqual({
      type: 'delete-attribute',
      elementId: 'attr:1',
    })
    expect(erDeleteIntent(projection, { kind: 'er-relation', elementId: 'relation:1' })).toEqual({
      type: 'delete-relation',
      elementId: 'relation:1',
    })
    expect(erDeleteIntent(projection, { kind: 'er-entity', name: 'GONE' })).toBeNull()
    expect(erDeleteIntent(projection, null)).toBeNull()
  })
})

describe('er 右键菜单与连线寻址', () => {
  it('空白 / 实体 / 关系 / 属性的菜单项（工单 03 清单）', () => {
    expect(contextMenuItems({ kind: 'blank', diagramType: 'er' })).toEqual(['add-entity'])
    expect(contextMenuItems({ kind: 'er-entity', name: 'CAR' })).toEqual(['add-attribute', 'link-from-here', 'edit-er-alias', 'delete'])
    expect(contextMenuItems({ kind: 'er-relation', elementId: 'relation:1' })).toEqual(['cycle-er-line', 'edit-er-relation', 'delete'])
    expect(contextMenuItems({ kind: 'er-attribute', elementId: 'attr:1' })).toEqual(['edit-er-attribute', 'delete'])
  })

  it('连线位置序身份 → er-relation 选中（ADR-0012）', () => {
    expect(edgeSelectionOf('er', 'relation:1')).toEqual({ kind: 'er-relation', elementId: 'relation:1' })
    expect(edgeSelectionOf('er', 'transition:1')).toBeNull()
    expect(contextMenuTargetFromSelection({ kind: 'element', elementId: 'relation:1' }, 'er')).toEqual({
      kind: 'er-relation',
      elementId: 'relation:1',
    })
  })

  it('edgeAnnotator：条数相符才标注（不误归属）', () => {
    const fakePath = (id: string) => ({
      getAttribute: (key: string) => (key === 'data-id' ? id : null),
      setAttribute: (key: string, value: string) => {
        expect([key, value]).toEqual(['data-id', id])
      },
    })
    const host = {
      querySelectorAll: () => [fakePath('relation:1'), fakePath('relation:2')],
    } as unknown as ParentNode
    annotateErRelationIdentities(host, 2)
    // 条数不符 → 整体放弃（不写入）
    const strictHost = {
      querySelectorAll: () => [fakePath('relation:1')],
    } as unknown as ParentNode
    annotateErRelationIdentities(strictHost, 3)
  })
})

describe('er 注册表挂载', () => {
  it('detect / template / 模板可解析为非空投影', () => {
    expect(DIAGRAM_TYPES.er.detect('erDiagram\n    A\n')).toBe(true)
    expect(DIAGRAM_TYPES.er.detect('flowchart TD\n')).toBe(false)
    const parsed = DIAGRAM_TYPES.er.parser.parse(DIAGRAM_TYPES.er.template)
    if (!parsed.ok) throw new Error('模板必须可解析')
    const projection = DIAGRAM_TYPES.er.buildProjection(parsed.doc)
    if (projection.type !== 'er') throw new Error('图种必须为 er')
    expect(projection.er.entities.length).toBeGreaterThan(0)
    expect(projection.er.relations.length).toBeGreaterThan(0)
  })
})
