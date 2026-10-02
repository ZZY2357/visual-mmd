import { describe, expect, it } from 'vitest'
import { eventModelingParser } from '../../pipeline/eventmodeling'
import { buildEventModelingProjection } from '../../projection/eventmodeling-projection'
import { eventModelingCanvasCapabilities } from '../../canvas-selection/eventmodeling-adapter'
import { eventModelingDeleteIntent, eventModelingKeyPlan } from '../../pipeline/eventmodeling-keyboard'
import { contextMenuItems, contextMenuTargetFromSelection } from '../../editing/context-menu'
import { MENU_ACTIONS, type MenuActionContext } from '../../editing/menu-actions'
import { menuTargetOfCanvas, fromCanvasId, canvasIdOf } from '../../canvas-selection/selection-codec'
import { DIAGRAM_TYPES } from '../../diagram-registry'
import { capabilitiesOf } from '../../canvas-selection/capabilities'
import type { Selection } from '../../projection/selection'

/**
 * eventmodeling 键位 / 删除意图 / 菜单 / 画布寻址测试（more-diagrams 工单 28，ADR-0013）。
 *
 * **画布 DOM 无 data-id（research §4/§8.3 实测）**：能力包整体降级——resolver 永不命中、
 * toSelection / canvasIdOf 返回 null、navigationIds 为空；不实现 edgeAnnotator / nodeAnnotator。
 * 帧上 Tab = 加同泳道帧、Enter = 加事件帧、Delete = 删除；数据块上 Tab = 加数据块 / Delete = 删除；
 * 派生连线（默认推断关系）无源码语句、只读 → 不可删。
 */

const SOURCE = `eventmodeling

tf 01 ui CartUI
tf 02 cmd AddItem
tf 03 evt ItemAdded [[ItemAdded]]
rf 04 cmd ClearCart
tf 05 evt CartCleared ->> 03 [[ItemAdded]]

data ItemAdded {
  description: string
  price: number
}
`

function projectionOf(source: string) {
  const parsed = eventModelingParser.parse(source)
  if (!parsed.ok) throw new Error(`解析失败：${parsed.error.message}`)
  return buildEventModelingProjection(parsed.doc)
}

const FRAME1_SEL: Selection = { kind: 'em-frame', elementId: 'frame:1' }
const FRAME3_SEL: Selection = { kind: 'em-frame', elementId: 'frame:3' }
const DATA_SEL: Selection = { kind: 'em-data', elementId: 'data:1' }
const RELATION_SEL: Selection = { kind: 'em-relation', elementId: 'relation:1' }

describe('eventModelingKeyPlan（ADR-0013 就近映射）', () => {
  const projection = projectionOf(SOURCE)

  it('帧上 Tab = 加同泳道帧（同类型 / 同命名空间，帧号避重）', () => {
    const plan = eventModelingKeyPlan(projection, { key: 'Tab', selection: FRAME3_SEL })
    expect(plan).not.toBeNull()
    expect(plan!.intents).toEqual([
      {
        type: 'add-em-frame',
        frameId: '1',
        entityType: 'evt',
        entityIdentifier: 'NewFrame',
        afterElementId: 'frame:3',
      },
    ])
    expect(plan!.newElementTarget).toEqual({ selection: { kind: 'em-frame', elementId: 'frame:6' } })
  })

  it('帧上 Enter = 加事件帧（evt，跨泳道落 Events）', () => {
    const plan = eventModelingKeyPlan(projection, { key: 'Enter', selection: FRAME1_SEL })
    expect(plan).not.toBeNull()
    expect(plan!.intents).toEqual([
      {
        type: 'add-em-frame',
        frameId: '1',
        entityType: 'evt',
        entityIdentifier: 'NewEvent',
        afterElementId: 'frame:1',
      },
    ])
    expect(plan!.newElementTarget).toEqual({ selection: { kind: 'em-frame', elementId: 'frame:6' } })
  })

  it('命名空间避重：同命名空间下标识递推', () => {
    const p = projectionOf('eventmodeling\n\ntf 1 ui Shop.NewFrame\ntf 2 cmd Shop.AddItem\n')
    const plan = eventModelingKeyPlan(p, { key: 'Tab', selection: { kind: 'em-frame', elementId: 'frame:2' } })
    expect(plan!.intents).toEqual([
      {
        type: 'add-em-frame',
        frameId: '3',
        entityType: 'cmd',
        entityIdentifier: 'Shop.NewFrame2',
        afterElementId: 'frame:2',
      },
    ])
  })

  it('数据块上 Tab = 加数据块（名字避重），无 Enter 语义', () => {
    const plan = eventModelingKeyPlan(projection, { key: 'Tab', selection: DATA_SEL })
    expect(plan).not.toBeNull()
    expect(plan!.intents).toEqual([{ type: 'add-em-data', name: 'Data' }])
    expect(plan!.newElementTarget).toEqual({ selection: { kind: 'em-data', elementId: 'data:2' } })
    expect(eventModelingKeyPlan(projection, { key: 'Enter', selection: DATA_SEL })).toBeNull()
  })

  it('Delete = 删除选中元素（帧 / 数据块；派生连线只读 → null）', () => {
    expect(eventModelingKeyPlan(projection, { key: 'Delete', selection: FRAME1_SEL })).toEqual({
      intents: [{ type: 'delete-em-frame', elementId: 'frame:1' }],
      clearSelection: true,
    })
    expect(eventModelingKeyPlan(projection, { key: 'Backspace', selection: DATA_SEL })).toEqual({
      intents: [{ type: 'delete-em-data', elementId: 'data:1' }],
      clearSelection: true,
    })
    // 派生连线无源码语句、只读——不可删
    expect(eventModelingKeyPlan(projection, { key: 'Delete', selection: RELATION_SEL })).toBeNull()
  })

  it('eventModelingDeleteIntent：派生连线 / 不存在 / null / 别种 → null', () => {
    expect(eventModelingDeleteIntent(projection, RELATION_SEL)).toBeNull()
    expect(eventModelingDeleteIntent(projection, { kind: 'em-frame', elementId: 'frame:99' })).toBeNull()
    expect(eventModelingDeleteIntent(projection, { kind: 'em-data', elementId: 'data:99' })).toBeNull()
    expect(eventModelingDeleteIntent(projection, null)).toBeNull()
    expect(eventModelingDeleteIntent(projection, { kind: 'diagram' })).toBeNull()
  })

  it('带修饰键（Shift-Tab）/ 无选中 / 图表级选中 → null', () => {
    expect(eventModelingKeyPlan(projection, { key: 'Tab', mods: { shift: true }, selection: FRAME1_SEL })).toBeNull()
    expect(eventModelingKeyPlan(projection, { key: 'Tab', selection: null })).toBeNull()
    expect(eventModelingKeyPlan(projection, { key: 'Tab', selection: { kind: 'diagram' } })).toBeNull()
  })
})

describe('eventmodeling 画布寻址（research §4/§8.3 实测：无 data-id → 整体降级）', () => {
  const projection = { type: 'eventmodeling' as const, eventmodeling: projectionOf(SOURCE) }
  const caps = capabilitiesOf(projection)

  it('能力齐备但画布寻址整体降级：resolver 永不命中、无 edgeAnnotator / nodeAnnotator', () => {
    expect(caps).toBe(eventModelingCanvasCapabilities)
    expect(typeof caps.resolveSelection).toBe('function')
    expect(typeof caps.deleteIntent).toBe('function')
    // 无 DOM 可寻址元素 → 不实现两个 annotator（不伪造 id）
    expect(caps.edgeAnnotator).toBeUndefined()
    expect(caps.nodeAnnotator).toBeUndefined()
    expect(caps.keyboardProjection(projection)).toEqual({
      kind: 'eventmodeling',
      projection: projection.eventmodeling,
    })
  })

  it('dataIdResolver 永不命中 / toSelection 返回 null / canvasIdOf 返回 null / navigationIds 为空', () => {
    const resolve = caps.dataIdResolver(projection)
    expect(resolve('frame:1')).toBeNull()
    expect(resolve('data:1')).toBeNull()
    expect(caps.toSelection({ kind: 'node', id: 'frame:1' })).toBeNull()
    expect(caps.canvasIdOf(projection, FRAME1_SEL)).toBeNull()
    expect(caps.canvasIdOf(projection, DATA_SEL)).toBeNull()
    expect(caps.navigationIds(projection)).toEqual([])
  })

  it('resolveSelection：存在的帧 / 数据块 / 连线原样返回，不存在 / 别种落 null', () => {
    expect(caps.resolveSelection(projection, FRAME1_SEL)).toEqual(FRAME1_SEL)
    expect(caps.resolveSelection(projection, DATA_SEL)).toEqual(DATA_SEL)
    expect(caps.resolveSelection(projection, RELATION_SEL)).toEqual(RELATION_SEL)
    expect(caps.resolveSelection(projection, { kind: 'em-frame', elementId: 'frame:99' })).toBeNull()
    expect(caps.resolveSelection(projection, { kind: 'node', nodeId: 'x' })).toBeNull()
    expect(caps.resolveSelection(projection, null)).toBeNull()
  })

  it('canvasIdOf 对 em 选中返回 null（画布不提供高亮目标）；fromCanvasId / menuTargetOfCanvas 不产生 em 选中', () => {
    expect(canvasIdOf(FRAME1_SEL)).toBeNull()
    expect(canvasIdOf(DATA_SEL)).toBeNull()
    expect(fromCanvasId('eventmodeling', { kind: 'node', id: 'frame:1' })).toBeNull()
    expect(menuTargetOfCanvas('eventmodeling', { kind: 'node', id: 'frame:1' })).toBeNull()
    // 空白处仍产生 blank（图种随目标携带）
    expect(contextMenuTargetFromSelection(null, 'eventmodeling')).toEqual({
      kind: 'blank',
      diagramType: 'eventmodeling',
    })
  })
})

describe('eventmodeling 菜单（more-diagrams 工单 28）', () => {
  const projection = { type: 'eventmodeling' as const, eventmodeling: projectionOf(SOURCE) }

  it('空白菜单 = 加帧 / 加数据块', () => {
    expect(contextMenuItems({ kind: 'blank', diagramType: 'eventmodeling' })).toEqual([
      'add-em-frame',
      'add-em-data',
    ])
  })

  it('帧 = 编辑 / 删除；数据块 = 编辑 / 删除（元素级目标只由结构树构造）', () => {
    expect(contextMenuItems({ kind: 'element', selection: { kind: 'em-frame', elementId: 'frame:1' } })).toEqual(['edit-em-frame', 'delete'])
    expect(contextMenuItems({ kind: 'element', selection: { kind: 'em-data', elementId: 'data:1' } })).toEqual(['edit-em-data', 'delete'])
  })

  function makeCtx() {
    const intents: unknown[] = []
    let selected: Selection | null = null
    let closed = 0
    const ctx: MenuActionContext = {
      projection,
      selection: null,
      commitIntent: (intent) => {
        intents.push(intent)
        return true
      },
      select: (s) => {
        selected = s
      },
      openForm: () => {},
      openStyleForm: () => {},
      beginInlineEdit: () => {},
      enterLinkMode: () => {},
      newNodeText: '新节点',
      close: () => {
        closed++
      },
    }
    return { ctx, intents, selected: () => selected, closed: () => closed }
  }

  it('add-em-frame：落 evt 帧（帧号 / 标识避重）并选中', () => {
    const h = makeCtx()
    MENU_ACTIONS['add-em-frame'](h.ctx, { kind: 'blank', diagramType: 'eventmodeling' })
    expect(h.intents).toEqual([
      { type: 'add-em-frame', frameId: '1', entityType: 'evt', entityIdentifier: 'NewEvent' },
    ])
    expect(h.selected()).toEqual({ kind: 'em-frame', elementId: 'frame:6' })
    expect(h.closed()).toBe(1)
  })

  it('add-em-data：落数据块（名字避重）并选中', () => {
    const h = makeCtx()
    MENU_ACTIONS['add-em-data'](h.ctx, { kind: 'blank', diagramType: 'eventmodeling' })
    expect(h.intents).toEqual([{ type: 'add-em-data', name: 'Data' }])
    expect(h.selected()).toEqual({ kind: 'em-data', elementId: 'data:2' })
    expect(h.closed()).toBe(1)
  })

  it('edit-em-frame：选中目标后关闭（不改码）', () => {
    const h = makeCtx()
    MENU_ACTIONS['edit-em-frame'](h.ctx, { kind: 'element', selection: { kind: 'em-frame', elementId: 'frame:1' } })
    expect(h.intents).toEqual([])
    expect(h.selected()).toEqual({ kind: 'em-frame', elementId: 'frame:1' })
    expect(h.closed()).toBe(1)
  })
})

describe('eventmodeling 注册表接线（穷尽性）', () => {
  it('DIAGRAM_TYPES.eventmodeling：模板自识别（只认裸关键字）+ 投影包装同名字段', () => {
    const registration = DIAGRAM_TYPES.eventmodeling
    expect(registration.detect('eventmodeling\n\ntf 01 ui CartUI\n')).toBe(true)
    // 无 -beta 后缀（research §1/§8.1 实测）；带尾随内容不认领
    expect(registration.detect('eventmodeling-beta\n')).toBe(false)
    expect(registration.detect('eventmodeling extra\n')).toBe(false)
    // frontmatter 之后的声明行也认（firstStatementLine 跳过 frontmatter）
    expect(registration.detect('---\ntitle: x\n---\neventmodeling\n')).toBe(true)
    const parsed = registration.parser.parse(registration.template)
    if (!parsed.ok) throw new Error('模板必须可解析')
    const projection = registration.buildProjection(parsed.doc)
    expect(projection.type).toBe('eventmodeling')
    expect((projection as { eventmodeling: unknown }).eventmodeling).toBeDefined()
  })
})
