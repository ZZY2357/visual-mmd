import { describe, expect, it } from 'vitest'
import { radarParser } from '../../pipeline/radar'
import { buildRadarProjection } from '../../projection/radar-projection'
import { DIAGRAM_TYPES } from '../../diagram-registry'
import { radarDeleteIntent, radarKeyPlan } from '../canvas-keyboard'
import { contextMenuItems, contextMenuTargetFromSelection } from '../context-menu'

/**
 * radar 键位 / 删除意图 / 菜单测试（more-diagrams 工单 15，ADR-0013）：
 * 选中轴上 Tab = 加轴（管线语义：追加到最后一条轴行行尾 → 新轴 = axis:轴总数+1）、
 * 选中曲线上 Tab = 加曲线（锚点 = 该曲线之后）、Delete = 删除；Enter 无自然类比
 * （工单定案不做并记录）。radar 画布无 data-id（实测降级，见 radar-adapter），
 * 键操作从结构树选中生效。
 */

const SOURCE = `radar-beta
    title 技能评估
    axis math["数学"], science["科学"]
    curve alice["Alice"]{ 1, 2 }
    curve bob["Bob"]{ math: 4, science: 3 }
    max 5
`

function projectionOf(source: string) {
  const parsed = radarParser.parse(source)
  if (!parsed.ok) throw new Error('解析失败')
  return buildRadarProjection(parsed.doc)
}

describe('radarKeyPlan（ADR-0013 就近映射）', () => {
  const projection = projectionOf(SOURCE)

  it('轴上 Tab = 加轴：新轴必落最后一条轴行行尾（新选中 = axis:轴总数+1），不做内联编辑', () => {
    const plan = radarKeyPlan(projection, { key: 'Tab', selection: { kind: 'radar-axis', elementId: 'axis:1' } })
    expect(plan).not.toBeNull()
    expect(plan!.intents).toEqual([
      { type: 'add-axis', id: 'axis1', afterElementId: 'axis:1' },
    ])
    expect(plan!.newElementTarget).toEqual({ selection: { kind: 'radar-axis', elementId: 'axis:3' } })
    expect(plan!.newElementTarget!.inlineEdit).toBeUndefined()
  })

  it('曲线上 Tab = 加曲线：锚点 = 选中曲线（新曲线插在其后 → 新选中 = 选中序+1）', () => {
    const plan = radarKeyPlan(projection, { key: 'Tab', selection: { kind: 'radar-curve', elementId: 'curve:1' } })
    expect(plan).not.toBeNull()
    expect(plan!.intents).toEqual([
      { type: 'add-curve', id: 'curve1', afterElementId: 'curve:1' },
    ])
    expect(plan!.newElementTarget).toEqual({ selection: { kind: 'radar-curve', elementId: 'curve:2' } })
  })

  it('Delete / Backspace = 删除选中元素，落码后清空选中', () => {
    expect(radarKeyPlan(projection, { key: 'Delete', selection: { kind: 'radar-curve', elementId: 'curve:2' } })).toEqual({
      intents: [{ type: 'delete-curve', elementId: 'curve:2' }],
      clearSelection: true,
    })
    expect(radarKeyPlan(projection, { key: 'Backspace', selection: { kind: 'radar-axis', elementId: 'axis:2' } })).toEqual({
      intents: [{ type: 'delete-axis', elementId: 'axis:2' }],
      clearSelection: true,
    })
  })

  it('Enter 无自然类比（工单定案不做）；Shift / 无选中 / 已删元素 → null（不 preventDefault）', () => {
    expect(radarKeyPlan(projection, { key: 'Enter', selection: { kind: 'radar-axis', elementId: 'axis:1' } })).toBeNull()
    expect(radarKeyPlan(projection, { key: 'Tab', mods: { shift: true }, selection: { kind: 'radar-axis', elementId: 'axis:1' } })).toBeNull()
    expect(radarKeyPlan(projection, { key: 'Tab', selection: null })).toBeNull()
    expect(radarKeyPlan(projection, { key: 'Tab', selection: { kind: 'radar-axis', elementId: 'axis:999' } })).toBeNull()
  })
})

describe('radarDeleteIntent', () => {
  const projection = projectionOf(SOURCE)

  it('轴 / 曲线映射到 delete-* 意图；已不在投影 / 图表级 / null → null', () => {
    expect(radarDeleteIntent(projection, { kind: 'radar-axis', elementId: 'axis:1' })).toEqual({
      type: 'delete-axis',
      elementId: 'axis:1',
    })
    expect(radarDeleteIntent(projection, { kind: 'radar-curve', elementId: 'curve:1' })).toEqual({
      type: 'delete-curve',
      elementId: 'curve:1',
    })
    expect(radarDeleteIntent(projection, { kind: 'radar-axis', elementId: 'axis:999' })).toBeNull()
    expect(radarDeleteIntent(projection, { kind: 'diagram' })).toBeNull()
    expect(radarDeleteIntent(projection, null)).toBeNull()
  })
})

describe('radar 菜单（工单 15 定案：画布无 data-id，只有空白菜单）', () => {
  it('空白 = 加轴 / 加曲线；元素级画布菜单目标不存在', () => {
    expect(contextMenuItems({ kind: 'blank', diagramType: 'radar' })).toEqual(['add-radar-axis', 'add-radar-curve'])
    // 画布节点目标被 codec 拒绝（实测降级）：menuTargetOfCanvas 不产出 radar 元素目标
    expect(contextMenuTargetFromSelection({ kind: 'node', id: '随便什么' }, 'radar')).toBeNull()
  })

  it('能力包查表：radar 键盘投影 kind 同名、无 edgeAnnotator（无连线语法）', () => {
    const projection = projectionOf(SOURCE)
    const caps = DIAGRAM_TYPES.radar.canvas
    expect(caps.keyboardProjection({ type: 'radar', radar: projection }).kind).toBe('radar')
    expect(caps.edgeAnnotator).toBeUndefined()
  })
})
