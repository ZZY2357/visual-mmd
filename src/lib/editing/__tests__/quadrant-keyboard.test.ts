import { describe, expect, it } from 'vitest'
import { quadrantParser } from '../../pipeline/quadrant'
import { buildQuadrantProjection } from '../../projection/quadrant-projection'
import { DIAGRAM_TYPES } from '../../diagram-registry'
import { quadrantDeleteIntent, quadrantKeyPlan } from '../../pipeline/quadrant-keyboard'
import { contextMenuItems, contextMenuTargetFromSelection } from '../context-menu'
import { annotateQuadrantDataIds } from '../../canvas-selection/node-data-ids'
import { quadrantCanvasCapabilities, quadrantSelectionOf } from '../../canvas-selection/quadrant-adapter'
import type { AnyProjection } from '../../diagram-registry'
import type { ProjectionOf } from '../../canvas-selection/capabilities'

/**
 * quadrant 键位 / 删除意图 / 菜单 / data-id 反注测试（more-diagrams 工单 12，ADR-0013）：
 * 选中点上 Tab = 加点（锚点 = 该点之后）、Delete = 删除；Enter 无自然类比（工单定案
 * 不做并记录——点与点之间没有「相邻结构」的添加语义）。轴 / 象限标题是文档级属性
 * 元素：无删除语义、不接键盘增删（工单定案）。
 *
 * quadrant 画布 DOM **有 data-id 寻址**（渲染器不写 id/data-id，但包裹组结构稳定，
 * 按位置序反注——证据见 quadrant-adapter 注释与工单 Comments），键操作与画布点选
 * 都可用。
 */

const SOURCE = `quadrantChart
    title 需求优先级评估
    x-axis 低价值 --> 高价值
    y-axis 低成本 --> 高成本
    quadrant-1 立即去做
    quadrant-2 规划排期
    Campaign A: [0.3, 0.6]
    Campaign B: [0.45, 0.23]
`

function projectionOf(source: string): AnyProjection {
  const parsed = quadrantParser.parse(source)
  if (!parsed.ok) throw new Error('解析失败')
  return { type: 'quadrant', quadrant: buildQuadrantProjection(parsed.doc) }
}

describe('quadrantKeyPlan（ADR-0013 就近映射）', () => {
  const projection = buildQuadrantProjection(
    (() => {
      const r = quadrantParser.parse(SOURCE)
      if (!r.ok) throw new Error('解析失败')
      return r.doc
    })(),
  )

  it('Tab = 加点：锚点 = 选中点，坐标落图正中 0.5, 0.5、文本避重，选中新点并进入内联命名', () => {
    const plan = quadrantKeyPlan(projection, { key: 'Tab', selection: { kind: 'quadrant-point', elementId: 'point:1' } })
    expect(plan).not.toBeNull()
    expect(plan!.intents).toEqual([
      { type: 'add-point', text: '新点', x: '0.5', y: '0.5', afterElementId: 'point:1' },
    ])
    expect(plan!.newElementTarget).toEqual({
      selection: { kind: 'quadrant-point', elementId: 'point:2' },
      inlineEdit: { kind: 'quadrant-point', elementId: 'point:2' },
    })
  })

  it('Tab 占位文本避重：已有「新点」时落「新点2」；预测序号 = 锚点序 + 1', () => {
    const p = buildQuadrantProjection(
      (() => {
        const r = quadrantParser.parse('quadrantChart\n    新点: [0.1, 0.1]\n    其他: [0.9, 0.9]\n')
        if (!r.ok) throw new Error('解析失败')
        return r.doc
      })(),
    )
    const plan = quadrantKeyPlan(p, { key: 'Tab', selection: { kind: 'quadrant-point', elementId: 'point:2' } })
    expect(plan!.intents[0]).toMatchObject({ text: '新点2' })
    expect(plan!.newElementTarget!.selection).toEqual({ kind: 'quadrant-point', elementId: 'point:3' })
  })

  it('Delete / Backspace = 删除选中点，落码后清空选中', () => {
    expect(quadrantKeyPlan(projection, { key: 'Delete', selection: { kind: 'quadrant-point', elementId: 'point:2' } })).toEqual({
      intents: [{ type: 'delete-point', elementId: 'point:2' }],
      clearSelection: true,
    })
    expect(quadrantKeyPlan(projection, { key: 'Backspace', selection: { kind: 'quadrant-point', elementId: 'point:1' } })).toEqual({
      intents: [{ type: 'delete-point', elementId: 'point:1' }],
      clearSelection: true,
    })
  })

  it('Enter 无自然类比（工单定案不做）；Shift / 无选中 / 轴 / 象限 / 已删点 → null', () => {
    expect(quadrantKeyPlan(projection, { key: 'Enter', selection: { kind: 'quadrant-point', elementId: 'point:1' } })).toBeNull()
    expect(quadrantKeyPlan(projection, { key: 'Tab', mods: { shift: true }, selection: { kind: 'quadrant-point', elementId: 'point:1' } })).toBeNull()
    expect(quadrantKeyPlan(projection, { key: 'Tab', selection: null })).toBeNull()
    expect(quadrantKeyPlan(projection, { key: 'Tab', selection: { kind: 'quadrant-point', elementId: 'point:999' } })).toBeNull()
    expect(quadrantKeyPlan(projection, { key: 'Tab', selection: { kind: 'quadrant-axis', elementId: 'x-axis' } })).toBeNull()
    expect(quadrantKeyPlan(projection, { key: 'Delete', selection: { kind: 'quadrant-quadrant', elementId: 'quadrant:1' } })).toBeNull()
  })
})

describe('quadrantDeleteIntent', () => {
  const projection = buildQuadrantProjection(
    (() => {
      const r = quadrantParser.parse(SOURCE)
      if (!r.ok) throw new Error('解析失败')
      return r.doc
    })(),
  )

  it('点映射到 delete-point；轴 / 象限是文档级属性元素无删除语义（→ null）', () => {
    expect(quadrantDeleteIntent(projection, { kind: 'quadrant-point', elementId: 'point:1' })).toEqual({
      type: 'delete-point',
      elementId: 'point:1',
    })
    expect(quadrantDeleteIntent(projection, { kind: 'quadrant-axis', elementId: 'x-axis' })).toBeNull()
    expect(quadrantDeleteIntent(projection, { kind: 'quadrant-quadrant', elementId: 'quadrant:1' })).toBeNull()
    expect(quadrantDeleteIntent(projection, { kind: 'quadrant-point', elementId: 'point:999' })).toBeNull()
    expect(quadrantDeleteIntent(projection, { kind: 'diagram' })).toBeNull()
    expect(quadrantDeleteIntent(projection, null)).toBeNull()
  })
})

describe('quadrant 菜单（工单 12：空白加点；点 = 改文本/坐标/样式/删除；轴/象限 = 改文本）', () => {
  it('空白 = 添加点；点 / 轴 / 象限的元素级菜单项', () => {
    expect(contextMenuItems({ kind: 'blank', diagramType: 'quadrant' })).toEqual(['add-quadrant-point'])
    expect(contextMenuItems({ kind: 'quadrant-point', elementId: 'point:1' })).toEqual([
      'edit-text',
      'edit-quadrant-coords',
      'edit-quadrant-style',
      'delete',
    ])
    expect(contextMenuItems({ kind: 'quadrant-axis', elementId: 'x-axis' })).toEqual(['edit-quadrant-text'])
    expect(contextMenuItems({ kind: 'quadrant-quadrant', elementId: 'quadrant:2' })).toEqual(['edit-quadrant-text'])
  })

  it('画布选中（反注 data-id）→ 菜单目标（contextMenuTargetFromSelection）一一对应', () => {
    expect(contextMenuTargetFromSelection({ kind: 'node', id: 'point:1' }, 'quadrant')).toEqual({
      kind: 'quadrant-point',
      elementId: 'point:1',
    })
    expect(contextMenuTargetFromSelection({ kind: 'node', id: 'y-axis' }, 'quadrant')).toEqual({
      kind: 'quadrant-axis',
      elementId: 'y-axis',
    })
    expect(contextMenuTargetFromSelection({ kind: 'node', id: 'quadrant:4' }, 'quadrant')).toEqual({
      kind: 'quadrant-quadrant',
      elementId: 'quadrant:4',
    })
    // 不认识的 data-id 不给菜单
    expect(contextMenuTargetFromSelection({ kind: 'node', id: '别的' }, 'quadrant')).toBeNull()
    // 别图种的选中不给 quadrant 菜单
    expect(contextMenuTargetFromSelection({ kind: 'edge', from: 'a', to: 'b', occurrence: 0 }, 'quadrant')).toBeNull()
  })
})

describe('quadrant data-id 反注（渲染器不写 id/data-id → 位置序反注，见 quadrant-adapter 注释）', () => {
  /** mermaid 12 渲染产物形态：g.main > g.quadrants/.data-points/.labels（渲染器 1374-1401 行）；
   * 点 DOM 序 = 源码逆序（addPoints 头插，渲染器 848-850 行）；轴标签 DOM 序 =
   * x左 → x右 → y下 → y上（getAxisLabels push 序，渲染器 898 行起） */
  function quadrantSvg(pointCount: number): ParentNode {
    const points = Array.from({ length: pointCount }, () => `<g class="data-point"><circle/></g>`).join('')
    const labels = '<g class="label"><text>x左</text></g><g class="label"><text>x右</text></g>' +
      '<g class="label"><text>y下</text></g><g class="label"><text>y上</text></g>'
    const root = document.createElement('div')
    root.innerHTML =
      '<svg><g class="main">' +
      '<g class="quadrants"><g class="quadrant"/><g class="quadrant"/><g class="quadrant"/><g class="quadrant"/></g>' +
      `<g class="data-points">${points}</g>` +
      `<g class="labels">${labels}</g>` +
      '</g></svg>'
    return root
  }

  it('象限恒 4 个按 DOM 序反注 quadrant:1..4；点按源码逆序反注 point:N', () => {
    const root = quadrantSvg(3)
    annotateQuadrantDataIds(root, {
      pointCount: 3,
      axisLabels: ['x-axis', 'x-axis', 'y-axis', 'y-axis'],
    })
    const quadrants = root.querySelectorAll('g.quadrants > g.quadrant')
    expect([...quadrants].map((g) => g.getAttribute('data-id'))).toEqual([
      'quadrant:1',
      'quadrant:2',
      'quadrant:3',
      'quadrant:4',
    ])
    // DOM 序逆序：data-point[0] = point:3（源码最后一个点）
    const points = root.querySelectorAll('g.data-points > g.data-point')
    expect([...points].map((g) => g.getAttribute('data-id'))).toEqual(['point:3', 'point:2', 'point:1'])
    const labels = root.querySelectorAll('g.labels > g.label')
    expect([...labels].map((g) => g.getAttribute('data-id'))).toEqual(['x-axis', 'x-axis', 'y-axis', 'y-axis'])
  })

  it('条数与投影不符整体不标（绝不误归属）：点数不符 / 轴标签条数不符', () => {
    const mismatched = quadrantSvg(3)
    annotateQuadrantDataIds(mismatched, { pointCount: 2, axisLabels: ['x-axis', 'x-axis', 'y-axis', 'y-axis'] })
    expect(mismatched.querySelectorAll('[data-id="point:1"]').length).toBe(0)
    const labelMismatch = quadrantSvg(3)
    annotateQuadrantDataIds(labelMismatch, { pointCount: 3, axisLabels: ['x-axis', 'y-axis'] })
    expect(labelMismatch.querySelectorAll('g.labels [data-id]').length).toBe(0)
  })

  it('非 quadrant 渲染产物（无 g.quadrants 包裹）安静跳过（作用域限定，工单 06 约定）', () => {
    const other = document.createElement('div')
    other.innerHTML = '<svg><g class="data-points"><g class="data-point"/></g></svg>'
    annotateQuadrantDataIds(other, { pointCount: 1, axisLabels: [] })
    expect(other.querySelector('[data-id]')).toBeNull()
  })

  it('反注后 quadrantSelectionOf 把画布选中解回编辑器选中；画布点/轴/象限均有 data-id', () => {
    expect(quadrantSelectionOf({ kind: 'node', id: 'point:2' })).toEqual({ kind: 'quadrant-point', elementId: 'point:2' })
    expect(quadrantSelectionOf({ kind: 'node', id: 'x-axis' })).toEqual({ kind: 'quadrant-axis', elementId: 'x-axis' })
    expect(quadrantSelectionOf({ kind: 'node', id: 'quadrant:3' })).toEqual({ kind: 'quadrant-quadrant', elementId: 'quadrant:3' })
    expect(quadrantSelectionOf({ kind: 'node', id: '别的' })).toBeNull()
    expect(quadrantSelectionOf({ kind: 'edge', from: 'a', to: 'b', occurrence: 0 })).toBeNull()
  })
})

describe('能力包查表（ADR-0015）', () => {
  it('键盘投影 kind 同名；无 edgeAnnotator（无连线语法）；有 nodeAnnotator（位置序反注）', () => {
    const caps = DIAGRAM_TYPES.quadrant.canvas as typeof quadrantCanvasCapabilities
    expect(caps.keyboardProjection(projectionOf(SOURCE) as ProjectionOf<'quadrant'>).kind).toBe('quadrant')
    expect(caps.edgeAnnotator).toBeUndefined()
    expect(caps.nodeAnnotator).toBeDefined()
  })
})
