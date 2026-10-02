import { describe, expect, it } from 'vitest'
import { wardleyParser } from '../../pipeline/wardley'
import { buildWardleyProjection } from '../../projection/wardley-projection'
import { wardleyCanvasCapabilities } from '../../canvas-selection/wardley-adapter'
import { wardleyDeleteIntent, wardleyKeyPlan } from '../../pipeline/wardley-keyboard'
import { contextMenuItems, contextMenuTargetFromSelection } from '../../editing/context-menu'
import { MENU_ACTIONS, type MenuActionContext } from '../../editing/menu-actions'
import { menuTargetOfCanvas, fromCanvasId, canvasIdOf, selectionOfMenuTarget } from '../../canvas-selection/selection-codec'
import { DIAGRAM_TYPES } from '../../diagram-registry'
import { capabilitiesOf } from '../../canvas-selection/capabilities'
import type { Selection } from '../../projection/selection'

/**
 * wardley 键位 / 删除意图 / 菜单 / 画布寻址测试（more-diagrams 工单 23，ADR-0013）。
 * 画布 DOM 无 data-id（research §4 实测：渲染器只写 class）→ 画布点选不产生选中，
 * 结构树 + 属性表单是完整入口；键位经结构树选中后由画布键盘生效（与 pie/journey/treemap 同口径）。
 */

const SOURCE = `wardley-beta
title 茶铺
anchor "顾客" [0.95, 0.63]
component "茶" [0.63, 0.81]
component "水壶" [0.43, 0.35]
"顾客" -> "茶"
"茶" -> "水壶"
evolve "水壶" 0.62
`

function projectionOf(src: string) {
  const parsed = wardleyParser.parse(src)
  if (!parsed.ok) throw new Error(`解析失败：${parsed.error.message}`)
  return buildWardleyProjection(parsed.doc)
}

const NODE_SEL: Selection = { kind: 'wardley-node', name: '茶' }
const LINK_SEL: Selection = { kind: 'wardley-link', elementId: 'wardley-link:1' }
const EVOLVE_SEL: Selection = { kind: 'wardley-evolve', elementId: 'wardley-evolve:1' }

describe('wardleyKeyPlan（ADR-0013 就近映射）', () => {
  const projection = projectionOf(SOURCE)

  it('选中节点上 Tab = 加 component（名字避重、坐标落图正中、锚点 = 该节点行）', () => {
    const plan = wardleyKeyPlan(projection, { key: 'Tab', selection: NODE_SEL })
    expect(plan).not.toBeNull()
    expect(plan!.intents).toEqual([
      {
        type: 'add-node',
        nodeKind: 'component',
        name: '新组件',
        coords: { visibility: '0.5', evolution: '0.5' },
        afterElementId: 'wardley-node:茶',
      },
    ])
    expect(plan!.newElementTarget).toEqual({ selection: { kind: 'wardley-node', name: '新组件' } })
  })

  it('选中节点上 Enter = 加 anchor', () => {
    const plan = wardleyKeyPlan(projection, { key: 'Enter', selection: NODE_SEL })
    expect(plan!.intents).toEqual([
      expect.objectContaining({ type: 'add-node', nodeKind: 'anchor', name: '新锚点' }),
    ])
  })

  it('Delete = 删除选中元素（节点 / 连线 / evolve 各映射到 delete-*）', () => {
    expect(wardleyKeyPlan(projection, { key: 'Delete', selection: NODE_SEL })).toEqual({
      intents: [{ type: 'delete-node', elementId: 'wardley-node:茶' }],
      clearSelection: true,
    })
    expect(wardleyKeyPlan(projection, { key: 'Delete', selection: LINK_SEL })).toEqual({
      intents: [{ type: 'delete-link', elementId: 'wardley-link:1' }],
      clearSelection: true,
    })
    expect(wardleyKeyPlan(projection, { key: 'Delete', selection: EVOLVE_SEL })).toEqual({
      intents: [{ type: 'delete-evolve', elementId: 'wardley-evolve:1' }],
      clearSelection: true,
    })
  })

  it('wardleyDeleteIntent：存在性校验（已不在投影 / 别种选中 / null → null）', () => {
    expect(wardleyDeleteIntent(projection, NODE_SEL)).toEqual({
      type: 'delete-node',
      elementId: 'wardley-node:茶',
    })
    expect(wardleyDeleteIntent(projection, { kind: 'wardley-node', name: '缺' })).toBeNull()
    expect(wardleyDeleteIntent(projection, { kind: 'wardley-link', elementId: 'wardley-link:9' })).toBeNull()
    expect(wardleyDeleteIntent(projection, { kind: 'diagram' })).toBeNull()
    expect(wardleyDeleteIntent(projection, null)).toBeNull()
  })

  it('连线 / evolve 上无 Tab / Enter 语义；带修饰键 / 无选中 → null', () => {
    expect(wardleyKeyPlan(projection, { key: 'Tab', selection: LINK_SEL })).toBeNull()
    expect(wardleyKeyPlan(projection, { key: 'Enter', selection: EVOLVE_SEL })).toBeNull()
    expect(wardleyKeyPlan(projection, { key: 'Tab', mods: { shift: true }, selection: NODE_SEL })).toBeNull()
    expect(wardleyKeyPlan(projection, { key: 'Tab', selection: null })).toBeNull()
  })
})

describe('wardley 画布寻址降级（research §4 实测：渲染器无 data-id）', () => {
  const projection = { type: 'wardley' as const, wardley: projectionOf(SOURCE) }
  const caps = capabilitiesOf(projection)

  it('八项能力齐备且无 edgeAnnotator / nodeAnnotator（工单定案：整体降级）', () => {
    expect(caps).toBe(wardleyCanvasCapabilities)
    expect(typeof caps.resolveSelection).toBe('function')
    expect(typeof caps.deleteIntent).toBe('function')
    expect(caps.edgeAnnotator).toBeUndefined()
    expect(caps.nodeAnnotator).toBeUndefined()
    expect(caps.keyboardProjection(projection)).toEqual({ kind: 'wardley', projection: projection.wardley })
  })

  it('resolver / toSelection / canvasIdOf / navigationIds 全部安静返回空', () => {
    expect(caps.dataIdResolver(projection)('anything')).toBeNull()
    expect(caps.toSelection({ kind: 'node', id: 'x' })).toBeNull()
    expect(caps.canvasIdOf(projection, NODE_SEL)).toBeNull()
    expect(caps.navigationIds(projection)).toEqual([])
    expect(canvasIdOf(NODE_SEL)).toBeNull()
    expect(canvasIdOf(LINK_SEL)).toBeNull()
  })

  it('fromCanvasId / menuTargetOfCanvas：画布选中与节点菜单目标均不产生', () => {
    expect(fromCanvasId('wardley', { kind: 'node', id: 'x' })).toBeNull()
    expect(menuTargetOfCanvas('wardley', { kind: 'node', id: 'x' })).toBeNull()
    expect(contextMenuTargetFromSelection({ kind: 'node', id: 'x' }, 'wardley')).toBeNull()
  })

  it('右键空白菜单 = 加组件 / 加锚点 / 加连线', () => {
    expect(contextMenuItems({ kind: 'blank', diagramType: 'wardley' })).toEqual([
      'add-wardley-component',
      'add-wardley-anchor',
      'add-wardley-link',
    ])
  })

  it('程序构造的节点 / 连线 / evolve 菜单目标各给编辑项，且 selectionOfMenuTarget 互逆', () => {
    expect(contextMenuItems({ kind: 'wardley-node', name: '茶' })).toEqual(['edit-text', 'link-from-here', 'delete'])
    expect(contextMenuItems({ kind: 'wardley-link', elementId: 'wardley-link:1' })).toEqual([
      'add-wardley-link',
      'edit-label',
      'delete',
    ])
    expect(contextMenuItems({ kind: 'wardley-evolve', elementId: 'wardley-evolve:1' })).toEqual([
      'edit-label',
      'delete',
    ])
    expect(selectionOfMenuTarget({ kind: 'wardley-node', name: '茶' })).toEqual({ kind: 'wardley-node', name: '茶' })
    expect(selectionOfMenuTarget({ kind: 'wardley-link', elementId: 'wardley-link:1' })).toEqual({
      kind: 'wardley-link',
      elementId: 'wardley-link:1',
    })
  })

  it('add-wardley-component：落一行组件并选中新节点', () => {
    let selected: Selection | null = null
    const intents: unknown[] = []
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
      close: () => {},
    }
    MENU_ACTIONS['add-wardley-component'](ctx, { kind: 'blank', diagramType: 'wardley' })
    expect(intents).toEqual([
      {
        type: 'add-node',
        nodeKind: 'component',
        name: '新组件',
        coords: { visibility: '0.5', evolution: '0.5' },
      },
    ])
    expect(selected).toEqual({ kind: 'wardley-node', name: '新组件' })
  })

  it('add-wardley-anchor：落一行锚点并选中新节点', () => {
    let selected: Selection | null = null
    const intents: unknown[] = []
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
      close: () => {},
    }
    MENU_ACTIONS['add-wardley-anchor'](ctx, { kind: 'blank', diagramType: 'wardley' })
    expect(intents).toEqual([
      expect.objectContaining({ type: 'add-node', nodeKind: 'anchor', name: '新锚点' }),
    ])
    expect(selected).toEqual({ kind: 'wardley-node', name: '新锚点' })
  })
})

describe('wardley 注册表接线（穷尽性）', () => {
  it('DIAGRAM_TYPES.wardley：模板自识别 + 投影包装同名字段', () => {
    const registration = DIAGRAM_TYPES.wardley
    expect(registration.detect('wardley-beta\ncomponent "茶" [0.5, 0.5]\n')).toBe(true)
    // `\b` 防止 wardleyXxx 被误认
    expect(registration.detect('wardley-betaX\n')).toBe(false)
    expect(registration.detect('flowchart TB\n A-->B')).toBe(false)
    const parsed = registration.parser.parse(registration.template)
    if (!parsed.ok) throw new Error('模板必须可解析')
    const projection = registration.buildProjection(parsed.doc)
    expect(projection.type).toBe('wardley')
    expect((projection as { wardley: unknown }).wardley).toBeDefined()
  })
})
