import { describe, expect, it } from 'vitest'
import { pieParser } from '../../pipeline/pie'
import { buildPieProjection } from '../../projection/pie-projection'
import { DIAGRAM_TYPES } from '../../diagram-registry'
import { pieDeleteIntent, pieKeyPlan } from '../canvas-keyboard'
import { contextMenuItems, contextMenuTargetFromSelection } from '../context-menu'

/**
 * pie 键位 / 删除意图 / 菜单测试（more-diagrams 工单 10，ADR-0013）：
 * 选中扇区上 Tab = 加扇区（锚点 = 该扇区之后）、Delete = 删除；Enter 无自然类比
 * （工单定案不做并记录）。pie 画布无 data-id（实测降级，见 pie-adapter），
 * 键操作从结构树选中生效。
 */

const SOURCE = `pie showData
    title 预算分配
    "研发" : 45
    "市场" : 30.5
    "运营" : 25
`

function projectionOf(source: string) {
  const parsed = pieParser.parse(source)
  if (!parsed.ok) throw new Error('解析失败')
  return buildPieProjection(parsed.doc)
}

describe('pieKeyPlan（ADR-0013 就近映射）', () => {
  const projection = projectionOf(SOURCE)

  it('Tab = 加扇区：锚点 = 选中扇区，落码 + 选中（预测序号），不做内联编辑', () => {
    const plan = pieKeyPlan(projection, { key: 'Tab', selection: { kind: 'pie-sector', elementId: 'sector:1' } })
    expect(plan).not.toBeNull()
    expect(plan!.intents).toEqual([
      { type: 'add-sector', label: '新扇区', value: '1', afterElementId: 'sector:1' },
    ])
    expect(plan!.newElementTarget).toEqual({ selection: { kind: 'pie-sector', elementId: 'sector:2' } })
    expect(plan!.newElementTarget!.inlineEdit).toBeUndefined()
  })

  it('Tab 占位标签避重：已有「新扇区」时落「新扇区2」', () => {
    const p = projectionOf('pie\n  "新扇区" : 1\n  "其他" : 2\n')
    const plan = pieKeyPlan(p, { key: 'Tab', selection: { kind: 'pie-sector', elementId: 'sector:1' } })
    expect(plan!.intents[0]).toMatchObject({ label: '新扇区2' })
  })

  it('Delete = 删除选中扇区（唯一映射），落码后清空选中', () => {
    expect(pieKeyPlan(projection, { key: 'Delete', selection: { kind: 'pie-sector', elementId: 'sector:2' } })).toEqual({
      intents: [{ type: 'delete-sector', elementId: 'sector:2' }],
      clearSelection: true,
    })
    expect(pieKeyPlan(projection, { key: 'Backspace', selection: { kind: 'pie-sector', elementId: 'sector:3' } })).toEqual({
      intents: [{ type: 'delete-sector', elementId: 'sector:3' }],
      clearSelection: true,
    })
  })

  it('Enter 无自然类比（工单定案不做）；Shift / 无选中 / 已删扇区 → null（不 preventDefault）', () => {
    expect(pieKeyPlan(projection, { key: 'Enter', selection: { kind: 'pie-sector', elementId: 'sector:1' } })).toBeNull()
    expect(pieKeyPlan(projection, { key: 'Tab', mods: { shift: true }, selection: { kind: 'pie-sector', elementId: 'sector:1' } })).toBeNull()
    expect(pieKeyPlan(projection, { key: 'Tab', selection: null })).toBeNull()
    expect(pieKeyPlan(projection, { key: 'Tab', selection: { kind: 'pie-sector', elementId: 'sector:999' } })).toBeNull()
  })
})

describe('pieDeleteIntent', () => {
  const projection = projectionOf(SOURCE)

  it('扇区映射到 delete-sector 意图；已不在投影 / 图表级 / null → null', () => {
    expect(pieDeleteIntent(projection, { kind: 'pie-sector', elementId: 'sector:1' })).toEqual({
      type: 'delete-sector',
      elementId: 'sector:1',
    })
    expect(pieDeleteIntent(projection, { kind: 'pie-sector', elementId: 'sector:999' })).toBeNull()
    expect(pieDeleteIntent(projection, { kind: 'diagram' })).toBeNull()
    expect(pieDeleteIntent(projection, null)).toBeNull()
  })
})

describe('pie 菜单（工单 10 定案：画布无 data-id，只有空白菜单）', () => {
  it('空白 = 加扇区；元素级画布菜单目标不存在', () => {
    expect(contextMenuItems({ kind: 'blank', diagramType: 'pie' })).toEqual(['add-pie-sector'])
    // 画布节点目标被 codec 拒绝（实测降级）：menuTargetOfCanvas 不产出 pie 元素目标
    expect(contextMenuTargetFromSelection({ kind: 'node', id: '随便什么' }, 'pie')).toBeNull()
  })

  it('能力包查表：pie 键盘投影 kind 同名、无 edgeAnnotator（无连线语法）', () => {
    const projection = projectionOf(SOURCE)
    const caps = DIAGRAM_TYPES.pie.canvas
    expect(caps.keyboardProjection({ type: 'pie', pie: projection }).kind).toBe('pie')
    expect(caps.edgeAnnotator).toBeUndefined()
  })
})
