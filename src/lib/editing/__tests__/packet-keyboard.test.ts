import { describe, expect, it } from 'vitest'
import { packetParser } from '../../pipeline/packet'
import { buildPacketProjection } from '../../projection/packet-projection'
import { DIAGRAM_TYPES } from '../../diagram-registry'
import { packetDeleteIntent, packetKeyPlan } from '../../pipeline/packet-keyboard'
import { contextMenuItems, contextMenuTargetFromSelection } from '../context-menu'
import { annotatePacketDataIds } from '../../canvas-selection/node-data-ids'
import { packetCanvasCapabilities, packetSelectionOf } from '../../canvas-selection/packet-adapter'
import type { AnyProjection } from '../../diagram-registry'
import type { ProjectionOf } from '../../canvas-selection/capabilities'

/**
 * packet 键位 / 删除意图 / 菜单 / data-id 反注测试（more-diagrams 工单 16，ADR-0013）：
 * 选中字段上 Tab = 加字段（+count 形态衔接前序，锚点 = 该字段之后，缺省位宽 8）、
 * Delete = 删除字段；Enter 无自然类比（字段是平铺序列，无「进入/展开」语义，工单定案
 * 不做并记录）。字段是节点元素（无文档级属性元素）——所有键都只作用于 field:N。
 *
 * packet 画布 DOM **有 data-id 寻址**（渲染器不写 id/data-id，但 rect.packetBlock +
 * text.packetByte.start 结构专属且稳定，按 start-bit 映射反注——证据见 packet-adapter
 * 注释与工单 Comments），键操作与画布点选都可用。
 */

const SOURCE = `packet
    0-15: "Source Port"
    16-31: "Destination Port"
    +16: "Flags"
`

function parseProjection(source: string) {
  const r = packetParser.parse(source)
  if (!r.ok) throw new Error('解析失败')
  return buildPacketProjection(r.doc)
}

function projectionOf(source: string): AnyProjection {
  return { type: 'packet', packet: parseProjection(source) }
}

describe('packetKeyPlan（ADR-0013 就近映射）', () => {
  const projection = parseProjection(SOURCE)

  it('Tab = 加字段：+count 形态（count 8）锚点插入在选中字段之后，选中新字段并进入内联命名', () => {
    const plan = packetKeyPlan(projection, { key: 'Tab', selection: { kind: 'packet-field', elementId: 'field:2' } })
    expect(plan).not.toBeNull()
    expect(plan!.intents).toEqual([
      { type: 'add-field', name: '新字段', count: '8', afterElementId: 'field:2' },
    ])
    expect(plan!.newElementTarget).toEqual({
      selection: { kind: 'packet-field', elementId: 'field:3' },
      inlineEdit: { kind: 'packet-field', elementId: 'field:3' },
    })
  })

  it('Tab 占位名称避重：已有「新字段」时落「新字段2」；锚点 = 末字段时预测序号 = 总数 + 1', () => {
    const p = parseProjection('packet\n    0-7: "A"\n    8: "新字段"\n')
    const plan = packetKeyPlan(p, { key: 'Tab', selection: { kind: 'packet-field', elementId: 'field:2' } })
    expect(plan!.intents[0]).toMatchObject({ name: '新字段2', afterElementId: 'field:2' })
    expect(plan!.newElementTarget!.selection).toEqual({ kind: 'packet-field', elementId: 'field:3' })
  })

  it('Delete / Backspace = 删除选中字段，落码后清空选中（结果序列不连续时管线拒绝）', () => {
    expect(packetKeyPlan(projection, { key: 'Delete', selection: { kind: 'packet-field', elementId: 'field:2' } })).toEqual({
      intents: [{ type: 'delete-field', elementId: 'field:2' }],
      clearSelection: true,
    })
    expect(packetKeyPlan(projection, { key: 'Backspace', selection: { kind: 'packet-field', elementId: 'field:1' } })).toEqual({
      intents: [{ type: 'delete-field', elementId: 'field:1' }],
      clearSelection: true,
    })
  })

  it('Enter 无自然类比（工单定案不做）；Shift / 无选中 / 图表级 / 已删字段 → null', () => {
    expect(packetKeyPlan(projection, { key: 'Enter', selection: { kind: 'packet-field', elementId: 'field:1' } })).toBeNull()
    expect(packetKeyPlan(projection, { key: 'Tab', mods: { shift: true }, selection: { kind: 'packet-field', elementId: 'field:1' } })).toBeNull()
    expect(packetKeyPlan(projection, { key: 'Tab', selection: null })).toBeNull()
    expect(packetKeyPlan(projection, { key: 'Tab', selection: { kind: 'diagram' } })).toBeNull()
    expect(packetKeyPlan(projection, { key: 'Tab', selection: { kind: 'packet-field', elementId: 'field:999' } })).toBeNull()
    expect(packetKeyPlan(projection, { key: 'Delete', selection: { kind: 'packet-field', elementId: 'field:999' } })).toBeNull()
  })
})

describe('packetDeleteIntent', () => {
  const projection = parseProjection(SOURCE)

  it('字段映射到 delete-field；图表级 / null / 已删字段 → null', () => {
    expect(packetDeleteIntent(projection, { kind: 'packet-field', elementId: 'field:3' })).toEqual({
      type: 'delete-field',
      elementId: 'field:3',
    })
    expect(packetDeleteIntent(projection, { kind: 'diagram' })).toBeNull()
    expect(packetDeleteIntent(projection, null)).toBeNull()
    expect(packetDeleteIntent(projection, { kind: 'packet-field', elementId: 'field:999' })).toBeNull()
  })
})

describe('packet 菜单（工单 16：空白加字段；字段 = 改名/改位区间/删除）', () => {
  it('空白 = 添加字段（+count 衔接前序）；字段的元素级菜单项', () => {
    expect(contextMenuItems({ kind: 'blank', diagramType: 'packet' })).toEqual(['add-packet-field'])
    expect(contextMenuItems({ kind: 'element', selection: { kind: 'packet-field', elementId: 'field:1' } })).toEqual([
      'edit-text',
      'edit-packet-range',
      'delete',
    ])
  })

  it('画布选中（反注 data-id）→ 菜单目标（contextMenuTargetFromSelection）一一对应', () => {
    expect(contextMenuTargetFromSelection({ kind: 'node', id: 'field:2' }, 'packet')).toEqual({
      kind: 'element',
      selection: { kind: 'packet-field', elementId: 'field:2' },
    })
    // 不认识的 data-id 不给菜单
    expect(contextMenuTargetFromSelection({ kind: 'node', id: '别的' }, 'packet')).toBeNull()
    // 别图种的选中不给 packet 菜单
    expect(contextMenuTargetFromSelection({ kind: 'edge', from: 'a', to: 'b', occurrence: 0 }, 'packet')).toBeNull()
  })
})

describe('packet data-id 反注（渲染器不写 id/data-id → start-bit 映射反注，见 packet-adapter 注释）', () => {
  /** mermaid 12 渲染产物形态：每行 append 一个 g（无类名），行内每块依次
   * rect.packetBlock + text.packetLabel + text.packetByte.start（渲染器 draw/drawWord）；
   * 字段跨行拆块时同一字段有多个块（起始位仍升序） */
  function packetSvg(blockStarts: number[], withStartTexts = true): ParentNode {
    const rows = blockStarts
      .map(
        (start) =>
          '<g><rect class="packetBlock"/><text class="packetLabel">块标签</text>' +
          (withStartTexts ? `<text class="packetByte start">${start}</text>` : '') +
          '</g>',
      )
      .join('')
    const root = document.createElement('div')
    root.innerHTML = `<svg><g>${rows}</g></svg>`
    return root
  }

  const FIELDS = [
    { elementId: 'field:1', absStart: 0, absEnd: 15 },
    { elementId: 'field:2', absStart: 16, absEnd: 31 },
    { elementId: 'field:3', absStart: 32, absEnd: 47 },
  ]

  it('每块按其起始位落在哪个字段区间反注 field:N；矩形与标签同 data-id（同亮）', () => {
    const root = packetSvg([0, 16, 32])
    annotatePacketDataIds(root, FIELDS)
    const rects = root.querySelectorAll('rect.packetBlock')
    expect([...rects].map((r) => r.getAttribute('data-id'))).toEqual(['field:1', 'field:2', 'field:3'])
    expect([...root.querySelectorAll('text.packetLabel')].map((t) => t.getAttribute('data-id'))).toEqual([
      'field:1',
      'field:2',
      'field:3',
    ])
  })

  it('字段跨行拆块（bitsPerRow 切分）：多个块共享同一 data-id（同属一个源码字段）', () => {
    const root = packetSvg([0, 8, 16, 24])
    annotatePacketDataIds(root, [FIELDS[0], FIELDS[1]])
    expect([...root.querySelectorAll('rect.packetBlock')].map((r) => r.getAttribute('data-id'))).toEqual([
      'field:1',
      'field:1',
      'field:2',
      'field:2',
    ])
  })

  it('showBits 关闭（start 位号文本缺失）整体不标（诚实降级，绝不误归属）', () => {
    const root = packetSvg([0, 16], false)
    annotatePacketDataIds(root, FIELDS.slice(0, 2))
    expect(root.querySelectorAll('[data-id]').length).toBe(0)
  })

  it('块起始位落不进任何字段区间（手写非法源码）→ 整体不标（不留部分标注）', () => {
    const root = packetSvg([0, 20]) // 20 落在 16-31 与 32-47 之间的间隙
    annotatePacketDataIds(root, [FIELDS[0], FIELDS[2]])
    expect(root.querySelectorAll('[data-id]').length).toBe(0)
  })

  it('start 位号文本非十进制整数（空文本 / 负号）→ 整体不标（Number("") = 0 不得误归 bit 0）', () => {
    const empty = packetSvg([0, 16])
    ;(empty.querySelectorAll('text.packetByte.start')[1] as Element).textContent = ''
    annotatePacketDataIds(empty, FIELDS.slice(0, 2))
    expect(empty.querySelectorAll('[data-id]').length).toBe(0)
  })

  it('非 packet 渲染产物（无 rect.packetBlock）安静跳过（作用域限定，工单 06 约定）', () => {
    const other = document.createElement('div')
    other.innerHTML = '<svg><rect/></svg>'
    annotatePacketDataIds(other, FIELDS)
    expect(other.querySelector('[data-id]')).toBeNull()
  })

  it('反注后 packetSelectionOf 把画布选中解回编辑器选中', () => {
    expect(packetSelectionOf({ kind: 'node', id: 'field:2' })).toEqual({
      kind: 'packet-field',
      elementId: 'field:2',
    })
    expect(packetSelectionOf({ kind: 'node', id: '别的' })).toBeNull()
    expect(packetSelectionOf({ kind: 'edge', from: 'a', to: 'b', occurrence: 0 })).toBeNull()
  })
})

describe('能力包查表（ADR-0015）', () => {
  it('键盘投影 kind 同名；无 edgeAnnotator（packet 无连线语法）；有 nodeAnnotator（start-bit 映射反注）', () => {
    const caps = DIAGRAM_TYPES.packet.canvas as typeof packetCanvasCapabilities
    expect(caps.keyboardProjection(projectionOf(SOURCE) as ProjectionOf<'packet'>).kind).toBe('packet')
    expect(caps.edgeAnnotator).toBeUndefined()
    expect(caps.nodeAnnotator).toBeDefined()
  })
})
