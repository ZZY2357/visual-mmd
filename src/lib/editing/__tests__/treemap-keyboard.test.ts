import { describe, expect, it } from 'vitest'
import { treemapParser } from '../../pipeline/treemap'
import { buildTreemapProjection } from '../../projection/treemap-projection'
import { treemapCanvasCapabilities } from '../../canvas-selection/treemap-adapter'
import { treemapDeleteIntent, treemapKeyPlan } from '../../editing/canvas-keyboard'
import { contextMenuItems, contextMenuTargetFromSelection } from '../../editing/context-menu'
import { MENU_ACTIONS, type MenuActionContext } from '../../editing/menu-actions'
import { menuTargetOfCanvas, fromCanvasId } from '../../canvas-selection/selection-codec'
import { DIAGRAM_TYPES } from '../../diagram-registry'
import { capabilitiesOf } from '../../canvas-selection/capabilities'
import type { Selection } from '../../projection/selection'

/**
 * treemap 键位 / 删除意图 / 菜单 / 画布寻址测试（more-diagrams 工单 20，ADR-0013）：
 * Section 上 Tab = 加叶子子节点、Enter = 加同级叶子、Delete = 删除（连同子树）；
 * 画布 DOM 无 data-id（research §4 实测降级）→ 画布点选不产生选中，结构树是完整入口。
 */

const SOURCE = `treemap
"根"
    "甲"
        "叶1": 3
        "叶2": 2
    "乙": 5
`

function projectionOf(source: string) {
  const parsed = treemapParser.parse(source)
  if (!parsed.ok) throw new Error(`解析失败：${parsed.error.message}`)
  return buildTreemapProjection(parsed.doc)
}

const SECTION_SEL: Selection = { kind: 'treemap-node', elementId: 'treemap-node:2' }
const LEAF_SEL: Selection = { kind: 'treemap-node', elementId: 'treemap-node:3' }

describe('treemapKeyPlan（ADR-0013 就近映射）', () => {
  const projection = projectionOf(SOURCE)

  it('Section 上 Tab = 加叶子子节点（落在子树末尾之后，数值落 1，名字避重）', () => {
    const plan = treemapKeyPlan(projection, { key: 'Tab', selection: SECTION_SEL })
    expect(plan).not.toBeNull()
    expect(plan!.intents).toEqual([
      { type: 'add-child', parentElementId: 'treemap-node:2', name: '新节点', value: '1' },
    ])
    // 新节点位置序 = 甲的子树末尾（叶2 = 平铺下标 3）+ 2
    expect(plan!.newElementTarget).toEqual({
      selection: { kind: 'treemap-node', elementId: 'treemap-node:5' },
    })
  })

  it('Leaf 上 Tab 无动作（叶子有值即叶子，research §3）', () => {
    expect(treemapKeyPlan(projection, { key: 'Tab', selection: LEAF_SEL })).toBeNull()
  })

  it('任意节点上 Enter = 加同级叶子（同缩进，落在子树之后）', () => {
    const plan = treemapKeyPlan(projection, { key: 'Enter', selection: LEAF_SEL })
    expect(plan).not.toBeNull()
    expect(plan!.intents).toEqual([
      { type: 'add-sibling', elementId: 'treemap-node:3', name: '新节点', value: '1' },
    ])
    expect(plan!.newElementTarget).toEqual({
      selection: { kind: 'treemap-node', elementId: 'treemap-node:4' },
    })
  })

  it('Delete = 删除选中节点（连同子树由管线负责）', () => {
    expect(treemapKeyPlan(projection, { key: 'Delete', selection: SECTION_SEL })).toEqual({
      intents: [{ type: 'delete-node', elementId: 'treemap-node:2' }],
      clearSelection: true,
    })
    expect(treemapDeleteIntent(projection, SECTION_SEL)).toEqual({
      type: 'delete-node',
      elementId: 'treemap-node:2',
    })
    expect(treemapDeleteIntent(projection, { kind: 'treemap-node', elementId: 'treemap-node:99' })).toBeNull()
    expect(treemapDeleteIntent(projection, null)).toBeNull()
  })

  it('带修饰键（Shift-Tab）/ 别种选中 / 无选中 → null', () => {
    expect(treemapKeyPlan(projection, { key: 'Tab', mods: { shift: true }, selection: SECTION_SEL })).toBeNull()
    expect(treemapKeyPlan(projection, { key: 'Tab', selection: { kind: 'diagram' } })).toBeNull()
    expect(treemapKeyPlan(projection, { key: 'Tab', selection: null })).toBeNull()
  })
})

describe('treemap 画布寻址降级（research §4 实测：渲染器无 data-id）', () => {
  const projection = { type: 'treemap' as const, treemap: projectionOf(SOURCE) }
  const caps = capabilitiesOf(projection)

  it('八项能力齐备且无 edgeAnnotator（无连线语法的图种不实现，工单定案）', () => {
    expect(caps).toBe(treemapCanvasCapabilities)
    expect(typeof caps.resolveSelection).toBe('function')
    expect(typeof caps.deleteIntent).toBe('function')
    expect(caps.edgeAnnotator).toBeUndefined()
    expect(caps.nodeAnnotator).toBeUndefined()
    expect(caps.keyboardProjection(projection)).toEqual({ kind: 'treemap', projection: projection.treemap })
  })

  it('resolver / toSelection / canvasIdOf / navigationIds 全部安静返回空', () => {
    expect(caps.dataIdResolver(projection)('anything')).toBeNull()
    expect(caps.toSelection({ kind: 'node', id: 'x' })).toBeNull()
    expect(caps.canvasIdOf(projection, SECTION_SEL)).toBeNull()
    expect(caps.navigationIds(projection)).toEqual([])
  })

  it('fromCanvasId / menuTargetOfCanvas：画布选中与节点菜单目标均不产生', () => {
    expect(fromCanvasId('treemap', { kind: 'node', id: 'x' })).toBeNull()
    expect(menuTargetOfCanvas('treemap', { kind: 'node', id: 'x' })).toBeNull()
    expect(contextMenuTargetFromSelection({ kind: 'node', id: 'x' }, 'treemap')).toBeNull()
  })

  it('右键空白菜单 = 加分组 / 加叶子', () => {
    expect(contextMenuItems({ kind: 'blank', diagramType: 'treemap' })).toEqual([
      'add-treemap-group',
      'add-treemap-leaf',
    ])
  })

  it('add-treemap-group：落一行顶格分组并选中', () => {
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
    MENU_ACTIONS['add-treemap-group'](ctx, { kind: 'blank', diagramType: 'treemap' })
    expect(intents).toEqual([{ type: 'add-root', name: '新分组' }])
    expect(selected).toEqual({ kind: 'treemap-node', elementId: 'treemap-node:6' })
  })

  it('add-treemap-leaf：落一行顶格叶子并选中（位置序预测）', () => {
    let selected: Selection | null = null
    let closed = 0
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
      close: () => {
        closed++
      },
    }
    MENU_ACTIONS['add-treemap-leaf'](ctx, { kind: 'blank', diagramType: 'treemap' })
    expect(intents).toEqual([{ type: 'add-root', name: '新叶子', value: '1' }])
    expect(selected).toEqual({ kind: 'treemap-node', elementId: 'treemap-node:6' })
    expect(closed).toBe(1)
  })
})

describe('treemap 注册表接线（穷尽性）', () => {
  it('DIAGRAM_TYPES.treemap：模板自识别 + 投影包装同名字段', () => {
    const registration = DIAGRAM_TYPES.treemap
    expect(registration.detect('treemap\n"甲": 1\n')).toBe(true)
    expect(registration.detect('treemap-beta\n"甲": 1\n')).toBe(true)
    // Langium 关键字大小写敏感（mermaid 探测器无 i 位）
    expect(registration.detect('TREEMAP\n"甲": 1\n')).toBe(false)
    // 声明行必须是裸关键字（research §1：首行必须是关键字本身）
    expect(registration.detect('treemap extra\n"甲": 1\n')).toBe(false)
    expect(registration.detect('treemapX\n"甲": 1\n')).toBe(false)
    const parsed = registration.parser.parse(registration.template)
    if (!parsed.ok) throw new Error('模板必须可解析')
    const projection = registration.buildProjection(parsed.doc)
    expect(projection.type).toBe('treemap')
    expect((projection as { treemap: unknown }).treemap).toBeDefined()
  })
})
