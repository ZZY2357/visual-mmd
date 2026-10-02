import { describe, expect, it } from 'vitest'
import { vennParser } from '../../pipeline/venn'
import { buildVennProjection } from '../../projection/venn-projection'
import {
  vennCanvasCapabilities,
  vennDataIdResolver,
  vennKeyMap,
  vennSelectionOf,
} from '../../canvas-selection/venn-adapter'
import { vennDeleteIntent, vennKeyPlan } from '../../pipeline/venn-keyboard'
import { contextMenuItems, contextMenuTargetFromSelection } from '../../editing/context-menu'
import { MENU_ACTIONS, type MenuActionContext } from '../../editing/menu-actions'
import { menuTargetOfCanvas, fromCanvasId, canvasIdOf } from '../../canvas-selection/selection-codec'
import { DIAGRAM_TYPES } from '../../diagram-registry'
import { capabilitiesOf } from '../../canvas-selection/capabilities'
import { annotateVennDataIds } from '../../canvas-selection/node-data-ids'
import type { Selection } from '../../projection/selection'

/**
 * venn 键位 / 删除意图 / 菜单 / 画布寻址测试（more-diagrams 工单 21，ADR-0013）：
 * 集合上 Tab = 加集合、Enter = 加交集（与下一集合组二元交集）、Delete = 删除；
 * 画布经 `data-venn-sets` → `data-id` 反注（nodeAnnotator）可寻址（research §8 实测）。
 */

const SOURCE = `venn-beta
    title 团队技能
    set frontend["前端"]
    set backend["后端"]
    set devops
    union frontend,backend["全栈"]
`

function projectionOf(source: string) {
  const parsed = vennParser.parse(source)
  if (!parsed.ok) throw new Error(`解析失败：${parsed.error.message}`)
  return buildVennProjection(parsed.doc)
}

const SET_SEL: Selection = { kind: 'venn-set', id: 'frontend' }
const UNION_SEL: Selection = { kind: 'venn-union', elementId: 'venn-union:1' }

describe('vennKeyPlan（ADR-0013 就近映射）', () => {
  const projection = projectionOf(SOURCE)

  it('集合上 Tab = 加集合（id 避重占位，落该集合之后）', () => {
    const plan = vennKeyPlan(projection, { key: 'Tab', selection: SET_SEL })
    expect(plan).not.toBeNull()
    expect(plan!.intents).toEqual([{ type: 'add-set', id: 'set4', afterElementId: 'venn-set:frontend' }])
    expect(plan!.newElementTarget).toEqual({ selection: { kind: 'venn-set', id: 'set4' } })
  })

  it('交集上 Tab 无动作（交集不含「集合的兄弟」语义）', () => {
    expect(vennKeyPlan(projection, { key: 'Tab', selection: UNION_SEL })).toBeNull()
  })

  it('集合上 Enter = 加交集（该集合首 id 与文档序下一集合首 id 组二元交集）', () => {
    const plan = vennKeyPlan(projection, { key: 'Enter', selection: SET_SEL })
    expect(plan).not.toBeNull()
    expect(plan!.intents).toEqual([
      { type: 'add-union', ids: ['frontend', 'backend'], afterElementId: 'venn-set:frontend' },
    ])
    expect(plan!.newElementTarget).toEqual({ selection: { kind: 'venn-union', elementId: 'venn-union:2' } })
  })

  it('最后一个集合上 Enter 无动作（无「下一个集合」）', () => {
    const last: Selection = { kind: 'venn-set', id: 'devops' }
    expect(vennKeyPlan(projection, { key: 'Enter', selection: last })).toBeNull()
  })

  it('Delete = 删除选中区域（集合 / 交集）', () => {
    expect(vennKeyPlan(projection, { key: 'Delete', selection: SET_SEL })).toEqual({
      intents: [{ type: 'delete-area', elementId: 'venn-set:frontend' }],
      clearSelection: true,
    })
    expect(vennDeleteIntent(projection, UNION_SEL)).toEqual({
      type: 'delete-area',
      elementId: 'venn-union:1',
    })
    expect(vennDeleteIntent(projection, { kind: 'venn-set', id: '__不存在__' })).toBeNull()
    expect(vennDeleteIntent(projection, { kind: 'venn-union', elementId: 'venn-union:99' })).toBeNull()
    expect(vennDeleteIntent(projection, null)).toBeNull()
  })

  it('带修饰键（Shift-Tab）/ 别种选中 / 无选中 → null', () => {
    expect(vennKeyPlan(projection, { key: 'Tab', mods: { shift: true }, selection: SET_SEL })).toBeNull()
    expect(vennKeyPlan(projection, { key: 'Tab', selection: { kind: 'diagram' } })).toBeNull()
    expect(vennKeyPlan(projection, { key: 'Tab', selection: null })).toBeNull()
  })
})

describe('venn 画布寻址（research §8 实测：data-venn-sets → data-id 反注）', () => {
  const projection = { type: 'venn' as const, venn: projectionOf(SOURCE) }
  const caps = capabilitiesOf(projection)

  it('八项能力齐备、有 nodeAnnotator、无 edgeAnnotator（无连线语法）', () => {
    expect(caps).toBe(vennCanvasCapabilities)
    expect(typeof caps.resolveSelection).toBe('function')
    expect(typeof caps.deleteIntent).toBe('function')
    expect(typeof caps.nodeAnnotator).toBe('function')
    expect(caps.edgeAnnotator).toBeUndefined()
    expect(caps.keyboardProjection(projection)).toEqual({ kind: 'venn', projection: projection.venn })
  })

  it('navigationIds 为集合 + 交集的 elementId（文档序）', () => {
    expect(caps.navigationIds(projection)).toEqual([
      'venn-set:frontend',
      'venn-set:backend',
      'venn-set:devops',
      'venn-union:1',
    ])
  })

  it('resolver / toSelection / canvasIdOf 往返一致', () => {
    expect(vennDataIdResolver(projection.venn)('venn-set:frontend')).toEqual({
      kind: 'node',
      id: 'venn-set:frontend',
    })
    expect(vennDataIdResolver(projection.venn)('venn-set:__不存在__')).toBeNull()
    expect(vennSelectionOf({ kind: 'node', id: 'venn-set:frontend' })).toEqual({
      kind: 'venn-set',
      id: 'frontend',
    })
    expect(vennSelectionOf({ kind: 'node', id: 'venn-union:1' })).toEqual({
      kind: 'venn-union',
      elementId: 'venn-union:1',
    })
    expect(vennSelectionOf({ kind: 'node', id: 'nope' })).toBeNull()
    expect(canvasIdOf(SET_SEL)).toBe('venn-set:frontend')
    expect(canvasIdOf(UNION_SEL)).toBe('venn-union:1')
  })

  it('canvasKey → elementId 反注表（content-key，与 mermaid DOM 一致）', () => {
    const map = vennKeyMap(projection.venn)
    expect(map.get('frontend')).toBe('venn-set:frontend')
    expect(map.get('backend_frontend')).toBe('venn-union:1')
  })

  it('fromCanvasId / menuTargetOfCanvas：集合与交集都可产生画布选中与菜单目标', () => {
    expect(fromCanvasId('venn', { kind: 'node', id: 'venn-set:frontend' })).toEqual({
      kind: 'venn-set',
      id: 'frontend',
    })
    expect(fromCanvasId('venn', { kind: 'node', id: 'venn-union:1' })).toEqual({
      kind: 'venn-union',
      elementId: 'venn-union:1',
    })
    expect(menuTargetOfCanvas('venn', { kind: 'node', id: 'venn-set:frontend' })).toEqual({
      kind: 'venn-set',
      id: 'frontend',
    })
    expect(menuTargetOfCanvas('venn', { kind: 'node', id: 'venn-union:1' })).toEqual({
      kind: 'venn-union',
      elementId: 'venn-union:1',
    })
    expect(contextMenuTargetFromSelection({ kind: 'node', id: 'venn-set:frontend' }, 'venn')).toEqual({
      kind: 'venn-set',
      id: 'frontend',
    })
  })

  it('nodeAnnotator：把 data-venn-sets 反注为 data-id（在 g.venn-area 上，幂等）', () => {
    const root = document.createElement('div')
    root.innerHTML =
      '<svg><g class="venn-area" data-venn-sets="frontend"></g>' +
      '<g class="venn-area" data-venn-sets="backend_frontend"></g>' +
      '<g class="venn-area" data-venn-sets="backend_devops" ></g></svg>'
    const annotate = caps.nodeAnnotator!(projection)
    annotate(root)
    const areas = root.querySelectorAll('g.venn-area')
    expect(areas[0].getAttribute('data-id')).toBe('venn-set:frontend')
    expect(areas[1].getAttribute('data-id')).toBe('venn-union:1')
    // 未在投影反注表里的合成区域（venn.js 自动补的）不反注——安静跳过，绝不误归属
    expect(areas[2].hasAttribute('data-id')).toBe(false)
    // 幂等：再跑一次结果不变
    annotate(root)
    expect(areas[0].getAttribute('data-id')).toBe('venn-set:frontend')
  })

  it('annotateVennDataIds 直接调用：无 keys 命中不写 data-id', () => {
    const root = document.createElement('div')
    root.innerHTML = '<svg><g class="venn-area" data-venn-sets="x"></g></svg>'
    annotateVennDataIds(root, new Map())
    expect(root.querySelector('g.venn-area')?.hasAttribute('data-id')).toBe(false)
  })
})

describe('venn 菜单（more-diagrams 工单 21）', () => {
  const projection = { type: 'venn' as const, venn: projectionOf(SOURCE) }

  it('空白菜单 = 加集合 / 加交集', () => {
    expect(contextMenuItems({ kind: 'blank', diagramType: 'venn' })).toEqual(['add-venn-set', 'add-venn-union'])
  })

  it('集合菜单 = 改标签尺寸 / 加集合 / 加交集 / 删除；交集菜单 = 改标签尺寸 / 删除', () => {
    expect(contextMenuItems({ kind: 'venn-set', id: 'frontend' })).toEqual([
      'edit-venn-area',
      'add-venn-set',
      'add-venn-union-here',
      'delete',
    ])
    expect(contextMenuItems({ kind: 'venn-union', elementId: 'venn-union:1' })).toEqual([
      'edit-venn-area',
      'delete',
    ])
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

  it('add-venn-set：落一行 set（占位 id）并选中', () => {
    const h = makeCtx()
    MENU_ACTIONS['add-venn-set'](h.ctx, { kind: 'blank', diagramType: 'venn' })
    expect(h.intents).toEqual([{ type: 'add-set', id: 'set4' }])
    expect(h.selected()).toEqual({ kind: 'venn-set', id: 'set4' })
    expect(h.closed()).toBe(1)
  })

  it('add-venn-union（空白）：取前两个集合组二元交集并选中', () => {
    const h = makeCtx()
    MENU_ACTIONS['add-venn-union'](h.ctx, { kind: 'blank', diagramType: 'venn' })
    expect(h.intents).toEqual([{ type: 'add-union', ids: ['frontend', 'backend'] }])
    expect(h.selected()).toEqual({ kind: 'venn-union', elementId: 'venn-union:2' })
    expect(h.closed()).toBe(1)
  })

  it('add-venn-union（集合上）：以该集合与下一集合组交集', () => {
    const h = makeCtx()
    MENU_ACTIONS['add-venn-union-here'](h.ctx, { kind: 'venn-set', id: 'backend' })
    expect(h.intents).toEqual([{ type: 'add-union', ids: ['backend', 'devops'] }])
  })

  it('add-venn-union（最后一个集合上）：回退与前一个集合组交集', () => {
    const h = makeCtx()
    MENU_ACTIONS['add-venn-union-here'](h.ctx, { kind: 'venn-set', id: 'devops' })
    expect(h.intents).toEqual([{ type: 'add-union', ids: ['devops', 'backend'] }])
  })

  it('add-venn-set / add-venn-union 在不合法投影上安静返回（不足两个集合 → 无交集）', () => {
    const single = { type: 'venn' as const, venn: projectionOf('venn-beta\n    set a\n') }
    const intents: unknown[] = []
    const ctx: MenuActionContext = {
      projection: single,
      selection: null,
      commitIntent: (intent) => {
        intents.push(intent)
        return true
      },
      select: () => {},
      openForm: () => {},
      openStyleForm: () => {},
      beginInlineEdit: () => {},
      enterLinkMode: () => {},
      newNodeText: 'x',
      close: () => {},
    }
    MENU_ACTIONS['add-venn-union'](ctx, { kind: 'blank', diagramType: 'venn' })
    expect(intents).toEqual([])
  })
})

describe('venn 注册表接线（穷尽性）', () => {
  it('DIAGRAM_TYPES.venn：模板自识别 + 投影包装同名字段', () => {
    const registration = DIAGRAM_TYPES.venn
    expect(registration.detect('venn-beta\n    set a\n')).toBe(true)
    // 只有小写关键字；裸 venn / 大小写变体 / 带尾随内容均不认领
    expect(registration.detect('venn\n    set a\n')).toBe(false)
    expect(registration.detect('VENN-BETA\n')).toBe(false)
    expect(registration.detect('venn-beta extra\n')).toBe(false)
    const parsed = registration.parser.parse(registration.template)
    if (!parsed.ok) throw new Error('模板必须可解析')
    const projection = registration.buildProjection(parsed.doc)
    expect(projection.type).toBe('venn')
    expect((projection as { venn: unknown }).venn).toBeDefined()
  })
})
