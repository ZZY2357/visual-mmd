import { describe, expect, it } from 'vitest'
import { usecaseParser } from '../../pipeline/usecase'
import { buildUsecaseProjection } from '../../projection/usecase-projection'
import {
  usecaseCanvasCapabilities,
  usecaseDataIdMap,
  usecaseDataIdResolver,
  usecaseSelectionOf,
} from '../../canvas-selection/usecase-adapter'
import { usecaseDeleteIntent, usecaseKeyPlan } from '../../pipeline/usecase-keyboard'
import { contextMenuItems, contextMenuTargetFromSelection } from '../../editing/context-menu'
import { MENU_ACTIONS, type MenuActionContext } from '../../editing/menu-actions'
import { menuTargetOfCanvas, fromCanvasId, canvasIdOf } from '../../canvas-selection/selection-codec'
import { DIAGRAM_TYPES } from '../../diagram-registry'
import { capabilitiesOf } from '../../canvas-selection/capabilities'
import { annotateUsecaseDataIds } from '../../canvas-selection/node-data-ids'
import type { Selection } from '../../projection/selection'

/**
 * usecase 键位 / 删除意图 / 菜单 / 画布寻址测试（more-diagrams 工单 26，ADR-0013）：
 * actor / 用例上 Tab = 加用例、Enter = 加 actor、Delete = 删除（节点级联 / 关系）；
 * 画布经渲染器已写的 data-id → 投影 elementId 归一（nodeAnnotator）可寻址（research §4 实测）。
 */

const SOURCE = `usecase-beta
    actor Customer
    actor Admin("Administrator")
    Browse("Browse Products")
    Checkout("Checkout")
    Customer --> Browse
    Customer --> Checkout
    Checkout ..> : include Pay
    Pay("Pay")
    Admin --|> Customer
    systemBoundary shop["Online Shop"] {
      Gateway("Pay Gateway")
    }
`

function projectionOf(source: string) {
  const parsed = usecaseParser.parse(source)
  if (!parsed.ok) throw new Error(`解析失败：${parsed.error.message}`)
  return buildUsecaseProjection(parsed.doc)
}

const ACTOR_SEL: Selection = { kind: 'usecase-actor', elementId: 'actor:Customer' }
const CASE_SEL: Selection = { kind: 'usecase-usecase', elementId: 'usecase:Browse' }
const BOUNDARY_SEL: Selection = { kind: 'usecase-boundary', elementId: 'boundary:shop' }
const RELATION_SEL: Selection = { kind: 'usecase-relation', elementId: 'relation:1' }

describe('usecaseKeyPlan（ADR-0013 就近映射）', () => {
  const projection = projectionOf(SOURCE)

  it('actor 上 Tab = 加用例（id 避重占位 `Usecase`，标签占位「新用例」）', () => {
    const plan = usecaseKeyPlan(projection, { key: 'Tab', selection: ACTOR_SEL })
    expect(plan).not.toBeNull()
    expect(plan!.intents).toEqual([
      { type: 'add-usecase', id: 'Usecase', label: '新用例', shape: 'ellipse' },
    ])
    expect(plan!.newElementTarget).toEqual({
      selection: { kind: 'usecase-usecase', elementId: 'usecase:Usecase' },
    })
  })

  it('用例上 Enter = 加 actor（id 避重占位 `Actor`）', () => {
    const plan = usecaseKeyPlan(projection, { key: 'Enter', selection: CASE_SEL })
    expect(plan).not.toBeNull()
    expect(plan!.intents).toEqual([{ type: 'add-actor', id: 'Actor' }])
    expect(plan!.newElementTarget).toEqual({
      selection: { kind: 'usecase-actor', elementId: 'actor:Actor' },
    })
  })

  it('命名空间全局避重：已有 Actor / Usecase 时跳到下一个空位', () => {
    const p = projectionOf('usecase-beta\n    actor Actor\n    actor Actor2\n    actor A\n')
    const plan = usecaseKeyPlan(p, { key: 'Enter', selection: { kind: 'usecase-actor', elementId: 'actor:A' } })
    expect(plan!.intents).toEqual([{ type: 'add-actor', id: 'Actor3' }])
  })

  it('边界 / 关系上 Tab / Enter 无动作（不是节点作用域）', () => {
    expect(usecaseKeyPlan(projection, { key: 'Tab', selection: BOUNDARY_SEL })).toBeNull()
    expect(usecaseKeyPlan(projection, { key: 'Enter', selection: RELATION_SEL })).toBeNull()
  })

  it('Delete = 删除选中元素（节点 -> delete-usecase-element；关系 -> delete-usecase-relation）', () => {
    expect(usecaseKeyPlan(projection, { key: 'Delete', selection: ACTOR_SEL })).toEqual({
      intents: [{ type: 'delete-usecase-element', elementId: 'actor:Customer' }],
      clearSelection: true,
    })
    expect(usecaseKeyPlan(projection, { key: 'Delete', selection: CASE_SEL })).toEqual({
      intents: [{ type: 'delete-usecase-element', elementId: 'usecase:Browse' }],
      clearSelection: true,
    })
    expect(usecaseKeyPlan(projection, { key: 'Delete', selection: BOUNDARY_SEL })).toEqual({
      intents: [{ type: 'delete-usecase-element', elementId: 'boundary:shop' }],
      clearSelection: true,
    })
    expect(usecaseKeyPlan(projection, { key: 'Delete', selection: RELATION_SEL })).toEqual({
      intents: [{ type: 'delete-usecase-relation', elementId: 'relation:1' }],
      clearSelection: true,
    })
  })

  it('usecaseDeleteIntent：不存在 / null / 别种 → null', () => {
    expect(usecaseDeleteIntent(projection, { kind: 'usecase-actor', elementId: 'actor:__不存在__' })).toBeNull()
    expect(usecaseDeleteIntent(projection, { kind: 'usecase-relation', elementId: 'relation:99' })).toBeNull()
    expect(usecaseDeleteIntent(projection, null)).toBeNull()
    expect(usecaseDeleteIntent(projection, { kind: 'diagram' })).toBeNull()
  })

  it('带修饰键（Shift-Tab）/ 无选中 / 图表级选中 → null', () => {
    expect(usecaseKeyPlan(projection, { key: 'Tab', mods: { shift: true }, selection: ACTOR_SEL })).toBeNull()
    expect(usecaseKeyPlan(projection, { key: 'Tab', selection: null })).toBeNull()
    expect(usecaseKeyPlan(projection, { key: 'Tab', selection: { kind: 'diagram' } })).toBeNull()
  })
})

describe('usecase 画布寻址（research §4 实测：渲染器 data-id → 投影 elementId 归一）', () => {
  const projection = { type: 'usecase' as const, usecase: projectionOf(SOURCE) }
  const caps = capabilitiesOf(projection)

  it('能力齐备、有 nodeAnnotator、无 edgeAnnotator（连线经 nodeAnnotator 一并归一）', () => {
    expect(caps).toBe(usecaseCanvasCapabilities)
    expect(typeof caps.resolveSelection).toBe('function')
    expect(typeof caps.deleteIntent).toBe('function')
    expect(typeof caps.nodeAnnotator).toBe('function')
    expect(caps.edgeAnnotator).toBeUndefined()
    expect(caps.keyboardProjection(projection)).toEqual({ kind: 'usecase', projection: projection.usecase })
  })

  it('navigationIds 为节点 + 关系的 elementId（文档序）', () => {
    expect(caps.navigationIds(projection)).toEqual([
      'actor:Customer',
      'actor:Admin',
      'usecase:Browse',
      'usecase:Checkout',
      'usecase:Pay',
      'boundary:shop',
      'usecase:Gateway',
      'relation:1',
      'relation:2',
      'relation:3',
      'relation:4',
    ])
  })

  it('resolver / toSelection / canvasIdOf 往返一致', () => {
    expect(usecaseDataIdResolver(projection.usecase)('actor:Customer')).toEqual({
      kind: 'node',
      id: 'actor:Customer',
    })
    expect(usecaseDataIdResolver(projection.usecase)('relation:1')).toEqual({
      kind: 'node',
      id: 'relation:1',
    })
    expect(usecaseDataIdResolver(projection.usecase)('actor:__不存在__')).toBeNull()
    expect(usecaseSelectionOf({ kind: 'node', id: 'actor:Customer' })).toEqual({
      kind: 'usecase-actor',
      elementId: 'actor:Customer',
    })
    expect(usecaseSelectionOf({ kind: 'node', id: 'usecase:Browse' })).toEqual({
      kind: 'usecase-usecase',
      elementId: 'usecase:Browse',
    })
    expect(usecaseSelectionOf({ kind: 'node', id: 'boundary:shop' })).toEqual({
      kind: 'usecase-boundary',
      elementId: 'boundary:shop',
    })
    expect(usecaseSelectionOf({ kind: 'node', id: 'relation:1' })).toEqual({
      kind: 'usecase-relation',
      elementId: 'relation:1',
    })
    expect(usecaseSelectionOf({ kind: 'node', id: 'note:1' })).toEqual({
      kind: 'usecase-note',
      elementId: 'note:1',
    })
    expect(usecaseSelectionOf({ kind: 'node', id: 'nope' })).toBeNull()
    expect(canvasIdOf(ACTOR_SEL)).toBe('actor:Customer')
    expect(canvasIdOf(RELATION_SEL)).toBe('relation:1')
  })

  it('data-id 反注表：渲染器真 data-id（标识符 / `edge-k`）→ 投影 elementId', () => {
    const map = usecaseDataIdMap(projection.usecase)
    expect(map.get('Customer')).toBe('actor:Customer')
    expect(map.get('Browse')).toBe('usecase:Browse')
    expect(map.get('shop')).toBe('boundary:shop')
    expect(map.get('edge-1')).toBe('relation:1')
    expect(map.get('edge-4')).toBe('relation:4')
    expect(map.get('edge-5')).toBeUndefined()
  })

  it('fromCanvasId / menuTargetOfCanvas：节点与关系都可产生画布选中与菜单目标', () => {
    expect(fromCanvasId('usecase', { kind: 'node', id: 'actor:Customer' })).toEqual({
      kind: 'usecase-actor',
      elementId: 'actor:Customer',
    })
    expect(fromCanvasId('usecase', { kind: 'node', id: 'relation:1' })).toEqual({
      kind: 'usecase-relation',
      elementId: 'relation:1',
    })
    expect(menuTargetOfCanvas('usecase', { kind: 'node', id: 'usecase:Browse' })).toEqual({
      kind: 'usecase-usecase',
      elementId: 'usecase:Browse',
    })
    expect(menuTargetOfCanvas('usecase', { kind: 'node', id: 'boundary:shop' })).toEqual({
      kind: 'usecase-boundary',
      elementId: 'boundary:shop',
    })
    expect(contextMenuTargetFromSelection({ kind: 'node', id: 'relation:1' }, 'usecase')).toEqual({
      kind: 'usecase-relation',
      elementId: 'relation:1',
    })
  })

  it('nodeAnnotator：把渲染器 data-id 归一到投影 elementId（幂等，表外值保留）', () => {
    const root = document.createElement('div')
    root.innerHTML =
      '<svg>' +
      '<g class="actor" data-id="Customer"></g>' +
      '<g class="usecase" data-id="Browse"></g>' +
      '<g class="boundary" data-id="shop"></g>' +
      '<path class="edge" data-id="edge-1"></path>' +
      '<g class="synthetic" data-id="Ghost"></g>' +
      '</svg>'
    const annotate = caps.nodeAnnotator!(projection)
    annotate(root)
    expect(root.querySelector('g.actor')!.getAttribute('data-id')).toBe('actor:Customer')
    expect(root.querySelector('g.usecase')!.getAttribute('data-id')).toBe('usecase:Browse')
    expect(root.querySelector('g.boundary')!.getAttribute('data-id')).toBe('boundary:shop')
    expect(root.querySelector('path.edge')!.getAttribute('data-id')).toBe('relation:1')
    // 未在投影反注表里的合成元素（渲染器补的悬空引用端点）不反注——安静跳过，绝不误归属
    expect(root.querySelector('g.synthetic')!.getAttribute('data-id')).toBe('Ghost')
    // 幂等：再跑一次结果不变
    annotate(root)
    expect(root.querySelector('g.actor')!.getAttribute('data-id')).toBe('actor:Customer')
  })

  it('annotateUsecaseDataIds 直接调用：无地图命中不写 data-id', () => {
    const root = document.createElement('div')
    root.innerHTML = '<svg><g data-id="x"></g></svg>'
    annotateUsecaseDataIds(root, new Map())
    expect(root.querySelector('g')!.getAttribute('data-id')).toBe('x')
  })
})

describe('usecase 菜单（more-diagrams 工单 26）', () => {
  const projection = { type: 'usecase' as const, usecase: projectionOf(SOURCE) }

  it('空白菜单 = 加 actor / 加用例 / 加边界', () => {
    expect(contextMenuItems({ kind: 'blank', diagramType: 'usecase' })).toEqual([
      'add-usecase-actor',
      'add-usecase-case',
      'add-usecase-boundary',
    ])
  })

  it('actor / 用例菜单 = 编辑 / 起点连线 / 删除；边界 = 编辑 / 删除；关系 = 编辑 / 删除；note 只删除', () => {
    expect(contextMenuItems({ kind: 'usecase-actor', elementId: 'actor:Customer' })).toEqual([
      'edit-usecase-element',
      'link-from-here',
      'delete',
    ])
    expect(contextMenuItems({ kind: 'usecase-usecase', elementId: 'usecase:Browse' })).toEqual([
      'edit-usecase-element',
      'link-from-here',
      'delete',
    ])
    expect(contextMenuItems({ kind: 'usecase-boundary', elementId: 'boundary:shop' })).toEqual([
      'edit-usecase-element',
      'delete',
    ])
    expect(contextMenuItems({ kind: 'usecase-relation', elementId: 'relation:1' })).toEqual([
      'edit-usecase-relation',
      'delete',
    ])
    expect(contextMenuItems({ kind: 'usecase-note', elementId: 'note:1' })).toEqual(['delete'])
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

  it('add-usecase-actor：落一行 actor（占位 id）并选中', () => {
    const h = makeCtx()
    MENU_ACTIONS['add-usecase-actor'](h.ctx, { kind: 'blank', diagramType: 'usecase' })
    expect(h.intents).toEqual([{ type: 'add-actor', id: 'Actor' }])
    expect(h.selected()).toEqual({ kind: 'usecase-actor', elementId: 'actor:Actor' })
    expect(h.closed()).toBe(1)
  })

  it('add-usecase-case：落一行用例（占位 id / 标签）并选中', () => {
    const h = makeCtx()
    MENU_ACTIONS['add-usecase-case'](h.ctx, { kind: 'blank', diagramType: 'usecase' })
    expect(h.intents).toEqual([{ type: 'add-usecase', id: 'Usecase', label: '新用例', shape: 'ellipse' }])
    expect(h.selected()).toEqual({ kind: 'usecase-usecase', elementId: 'usecase:Usecase' })
    expect(h.closed()).toBe(1)
  })

  it('add-usecase-boundary：落 systemBoundary…end 两行并选中', () => {
    const h = makeCtx()
    MENU_ACTIONS['add-usecase-boundary'](h.ctx, { kind: 'blank', diagramType: 'usecase' })
    expect(h.intents).toEqual([{ type: 'add-boundary', id: 'Boundary', label: '新系统边界' }])
    expect(h.selected()).toEqual({ kind: 'usecase-boundary', elementId: 'boundary:Boundary' })
    expect(h.closed()).toBe(1)
  })

  it('edit-usecase-element：选中目标后关闭（不改码）', () => {
    const h = makeCtx()
    MENU_ACTIONS['edit-usecase-element'](h.ctx, { kind: 'usecase-usecase', elementId: 'usecase:Browse' })
    expect(h.intents).toEqual([])
    expect(h.selected()).toEqual({ kind: 'usecase-usecase', elementId: 'usecase:Browse' })
    expect(h.closed()).toBe(1)
  })
})

describe('usecase 注册表接线（穷尽性）', () => {
  it('DIAGRAM_TYPES.usecase：模板自识别（只认 usecase-beta）+ 投影包装同名字段', () => {
    const registration = DIAGRAM_TYPES.usecase
    expect(registration.detect('usecase-beta\n    actor A\n')).toBe(true)
    expect(registration.detect('usecase-beta TB\n    actor A\n')).toBe(true)
    // 只有 usecase-beta 关键字；裸 usecase / 大小写变体 / 带尾随内容均不认领
    expect(registration.detect('usecase\n    actor A\n')).toBe(false)
    expect(registration.detect('USECASE-BETA\n')).toBe(false)
    expect(registration.detect('usecase-beta extra\n')).toBe(false)
    const parsed = registration.parser.parse(registration.template)
    if (!parsed.ok) throw new Error('模板必须可解析')
    const projection = registration.buildProjection(parsed.doc)
    expect(projection.type).toBe('usecase')
    expect((projection as { usecase: unknown }).usecase).toBeDefined()
  })
})
