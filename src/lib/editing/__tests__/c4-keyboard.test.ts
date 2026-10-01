import { describe, expect, it } from 'vitest'
import { c4Parser } from '../../pipeline/c4'
import { buildC4Projection } from '../../projection/c4-projection'
import { c4CanvasCapabilities } from '../../canvas-selection/c4-adapter'
import { c4DeleteIntent, c4KeyPlan } from '../../editing/canvas-keyboard'
import { contextMenuItems, contextMenuTargetFromSelection, type ContextMenuTarget } from '../../editing/context-menu'
import { MENU_ACTIONS, type MenuActionContext } from '../../editing/menu-actions'
import { menuTargetOfCanvas, fromCanvasId, canvasIdOf, selectionOfMenuTarget } from '../../canvas-selection/selection-codec'
import { DIAGRAM_TYPES } from '../../diagram-registry'
import { capabilitiesOf } from '../../canvas-selection/capabilities'
import type { Selection } from '../../projection/selection'

/**
 * C4 键位 / 删除意图 / 菜单 / 画布寻址测试（more-diagrams 工单 18，ADR-0007/0013）。
 *
 * **画布寻址诚实降级**（research §9 实测）：mermaid 的 c4 渲染器产物里 `data-*` 出现 0 次、
 * `.attr("id", …)` 仅 8 处且全是 `<defs>` 里的 marker（`-database` / `-computer` / `-clock` /
 * `-arrowhead` / `-arrowend` / `-filled-head` / `-crosshead`）。没有可点选的身份锚点，
 * 故 adapter 走 cynefin / treemap 式降级：resolver / toSelection / canvasIdOf 恒 null、
 * navigationIds 空——**结构树 + 属性表单是完整编辑入口**（ADR-0007 不伪造）。
 */

const SOURCE = `C4Context
    Person(customer, "个人客户", "使用网银的客户")
    System(banking, "网银系统", "核心业务系统")
    System_Ext(email, "邮件系统")
    Enterprise_Boundary(b0, "银行边界") {
        SystemDb(db, "客户数据库", "Oracle")
    }
    Rel(customer, banking, "访问", "HTTPS")
    Rel(banking, email, "发送通知", "SMTP")
`

function projectionOf(source: string) {
  const parsed = c4Parser.parse(source)
  if (!parsed.ok) throw new Error(`解析失败：${parsed.error.message}`)
  return buildC4Projection(parsed.doc)
}

const ELEMENT_SEL: Selection = { kind: 'c4-element', elementId: 'c4-element:banking' }
const PERSON_SEL: Selection = { kind: 'c4-element', elementId: 'c4-element:customer' }
const BOUNDARY_SEL: Selection = { kind: 'c4-boundary', elementId: 'c4-boundary:b0' }
const RELATION_SEL: Selection = { kind: 'c4-relation', elementId: 'relation:1' }

describe('c4KeyPlan（ADR-0013 就近映射）', () => {
  const projection = projectionOf(SOURCE)

  it('元素上 Tab = 加同类元素（沿用该元素的声明宏，alias 避重占位）', () => {
    const plan = c4KeyPlan(projection, { key: 'Tab', selection: ELEMENT_SEL })
    expect(plan).not.toBeNull()
    expect(plan!.intents).toEqual([
      { type: 'add-c4-element', macro: 'System', alias: 'System', afterElementId: 'c4-element:banking' },
    ])
    expect(plan!.newElementTarget).toEqual({ selection: { kind: 'c4-element', elementId: 'c4-element:System' } })
  })

  it('Tab 沿用宏原文（Person_Ext → Person_Ext；Person → Person 且避开已用 alias）', () => {
    const p = projectionOf('C4Context\n    Person_Ext(ext, "外部")\n')
    expect(c4KeyPlan(p, { key: 'Tab', selection: { kind: 'c4-element', elementId: 'c4-element:ext' } })!.intents).toEqual([
      { type: 'add-c4-element', macro: 'Person_Ext', alias: 'Person', afterElementId: 'c4-element:ext' },
    ])
    // `Person` 与 `customer` 都不冲突时按前缀命名
    const q = projectionOf('C4Context\n    Person(a, "A")\n')
    expect(c4KeyPlan(q, { key: 'Tab', selection: { kind: 'c4-element', elementId: 'c4-element:a' } })!.intents).toEqual([
      { type: 'add-c4-element', macro: 'Person', alias: 'Person', afterElementId: 'c4-element:a' },
    ])
  })

  it('Tab 的 alias 避重：命名空间已被占用时跳到下一个空位', () => {
    const p = projectionOf('C4Context\n    Person(Person, "P")\n    Person(a, "A")\n')
    const plan = c4KeyPlan(p, { key: 'Tab', selection: { kind: 'c4-element', elementId: 'c4-element:a' } })
    expect(plan!.intents).toEqual([
      { type: 'add-c4-element', macro: 'Person', alias: 'Person2', afterElementId: 'c4-element:a' },
    ])
  })

  it('元素上 Enter = 从该元素拉关系（落连线表单浮层，不新造浮层）', () => {
    const plan = c4KeyPlan(projection, { key: 'Enter', selection: PERSON_SEL })
    expect(plan).toEqual({ intents: [], form: 'c4-relation' })
  })

  it('边界 / 关系上 Tab / Enter 无动作（工单定案：边界「同类」语义含糊，添加走空白右键菜单）', () => {
    expect(c4KeyPlan(projection, { key: 'Tab', selection: BOUNDARY_SEL })).toBeNull()
    expect(c4KeyPlan(projection, { key: 'Enter', selection: BOUNDARY_SEL })).toBeNull()
    expect(c4KeyPlan(projection, { key: 'Tab', selection: RELATION_SEL })).toBeNull()
    expect(c4KeyPlan(projection, { key: 'Enter', selection: RELATION_SEL })).toBeNull()
  })

  it('Delete / Backspace = 删除选中（元素→delete-c4-element；边界→delete-c4-boundary；关系→delete-rel）', () => {
    expect(c4KeyPlan(projection, { key: 'Delete', selection: PERSON_SEL })).toEqual({
      intents: [{ type: 'delete-c4-element', elementId: 'c4-element:customer' }],
      clearSelection: true,
    })
    expect(c4KeyPlan(projection, { key: 'Delete', selection: BOUNDARY_SEL })).toEqual({
      intents: [{ type: 'delete-c4-boundary', elementId: 'c4-boundary:b0' }],
      clearSelection: true,
    })
    expect(c4KeyPlan(projection, { key: 'Delete', selection: RELATION_SEL })).toEqual({
      intents: [{ type: 'delete-rel', elementId: 'relation:1' }],
      clearSelection: true,
    })
    expect(c4KeyPlan(projection, { key: 'Backspace', selection: PERSON_SEL })).toEqual({
      intents: [{ type: 'delete-c4-element', elementId: 'c4-element:customer' }],
      clearSelection: true,
    })
  })

  it('c4DeleteIntent：不存在 / null / 图表级 / 别种 → null', () => {
    expect(c4DeleteIntent(projection, { kind: 'c4-element', elementId: 'c4-element:__不存在__' })).toBeNull()
    expect(c4DeleteIntent(projection, { kind: 'c4-boundary', elementId: 'c4-boundary:__不存在__' })).toBeNull()
    expect(c4DeleteIntent(projection, { kind: 'c4-relation', elementId: 'relation:99' })).toBeNull()
    // 跨 kind 误配
    expect(c4DeleteIntent(projection, { kind: 'c4-boundary', elementId: 'c4-element:banking' })).toBeNull()
    expect(c4DeleteIntent(projection, null)).toBeNull()
    expect(c4DeleteIntent(projection, { kind: 'diagram' })).toBeNull()
    expect(c4DeleteIntent(projection, { kind: 'node', nodeId: 'x' })).toBeNull()
  })

  it('带修饰键（Shift-Tab）/ 无选中 / 图表级选中 → null', () => {
    expect(c4KeyPlan(projection, { key: 'Tab', mods: { shift: true }, selection: ELEMENT_SEL })).toBeNull()
    expect(c4KeyPlan(projection, { key: 'Tab', selection: null })).toBeNull()
    expect(c4KeyPlan(projection, { key: 'Tab', selection: { kind: 'diagram' } })).toBeNull()
    expect(c4KeyPlan(projection, { key: 'Enter', selection: { kind: 'diagram' } })).toBeNull()
  })

  it('不参与编辑的键 → null（C4 不走内联编辑，F2 / 字母键无动作）', () => {
    expect(c4KeyPlan(projection, { key: 'F2', selection: ELEMENT_SEL })).toBeNull()
    expect(c4KeyPlan(projection, { key: 'a', selection: ELEMENT_SEL })).toBeNull()
  })
})

describe('C4 画布寻址（research §9 实测：无 data-id → ADR-0007 诚实降级）', () => {
  const projection = { type: 'c4' as const, c4: projectionOf(SOURCE) }
  const caps = capabilitiesOf(projection)

  it('能力包齐备但画布身份不可寻址：resolver / toSelection / canvasIdOf 恒 null，navigationIds 空', () => {
    expect(caps).toBe(c4CanvasCapabilities)
    expect(typeof caps.resolveSelection).toBe('function')
    expect(typeof caps.deleteIntent).toBe('function')
    expect(typeof caps.keyHandler).toBe('function')
    // 无 nodeAnnotator / edgeAnnotator（没有可归一的数据源）
    expect(caps.nodeAnnotator).toBeUndefined()
    expect(caps.edgeAnnotator).toBeUndefined()
    expect(caps.navigationIds(projection)).toEqual([])
    expect(caps.dataIdResolver(projection)('anything')).toBeNull()
    expect(caps.dataIdResolver(projection)('c4-element:banking')).toBeNull()
    expect(caps.toSelection({ kind: 'node', id: 'c4-element:banking' })).toBeNull()
    // canvasIdOf 走约定签名 `(_projection, selection)`
    expect(caps.canvasIdOf(projection, ELEMENT_SEL)).toBeNull()
    expect(caps.canvasIdOf(projection, BOUNDARY_SEL)).toBeNull()
    expect(caps.canvasIdOf(projection, RELATION_SEL)).toBeNull()
  })

  it('keyboardProjection 包出 c4 投影（键语义的唯一入口）', () => {
    expect(caps.keyboardProjection(projection)).toEqual({ kind: 'c4', projection: projection.c4 })
  })

  it('resolveSelection / deleteIntent / keyHandler 仍全量可用（编辑入口走结构树 / 表单）', () => {
    expect(caps.resolveSelection(projection, ELEMENT_SEL)).toEqual(ELEMENT_SEL)
    expect(caps.resolveSelection(projection, { kind: 'c4-element', elementId: 'c4-element:__不存在__' })).toBeNull()
    expect(caps.deleteIntent(projection, RELATION_SEL)).toEqual({ type: 'delete-rel', elementId: 'relation:1' })
    expect(caps.keyHandler(projection)({ key: 'Enter', selection: PERSON_SEL })).toEqual({
      intents: [],
      form: 'c4-relation',
    })
  })

  it('selection-codec：画布 → 选中 / 菜单目标全为 null，选中 → 画布 id 也 null（无伪造锚点）', () => {
    // canvasIdOf(selection) 是单参函数（选中 → 画布 data-id）：c4 三类都恒 null
    expect(canvasIdOf(ELEMENT_SEL)).toBeNull()
    expect(canvasIdOf(BOUNDARY_SEL)).toBeNull()
    expect(canvasIdOf(RELATION_SEL)).toBeNull()
    expect(fromCanvasId('c4', { kind: 'node', id: 'c4-element:banking' })).toBeNull()
    expect(fromCanvasId('c4', { kind: 'node', id: 'relation:1' })).toBeNull()
    expect(fromCanvasId('c4', { kind: 'element', elementId: 'relation:1' })).toBeNull()
    expect(menuTargetOfCanvas('c4', { kind: 'node', id: 'c4-element:banking' })).toBeNull()
    expect(menuTargetOfCanvas('c4', { kind: 'node', id: 'c4-boundary:b0' })).toBeNull()
  })

  it('selection-codec：菜单目标 ↔ 选中互逆（结构树 / 面板入口可用）', () => {
    // 画布侧（无 data-id）恒 null：选中不可能来自画布点选
    expect(contextMenuTargetFromSelection({ kind: 'node', id: 'c4-element:banking' }, 'c4')).toBeNull()
    expect(contextMenuTargetFromSelection({ kind: 'element', elementId: 'relation:1' }, 'c4')).toBeNull()
    // 菜单目标 → 选中（menu-actions 的 edit-c4-* / delete 都经这一份映射）
    expect(selectionOfMenuTarget({ kind: 'c4-element', elementId: 'c4-element:banking' })).toEqual(ELEMENT_SEL)
    expect(selectionOfMenuTarget({ kind: 'c4-boundary', elementId: 'c4-boundary:b0' })).toEqual(BOUNDARY_SEL)
    expect(selectionOfMenuTarget({ kind: 'c4-relation', elementId: 'relation:1' })).toEqual(RELATION_SEL)
  })
})

describe('C4 菜单（more-diagrams 工单 18）', () => {
  const projection = { type: 'c4' as const, c4: projectionOf(SOURCE) }

  it('空白菜单 = 加元素 / 加边界', () => {
    expect(contextMenuItems({ kind: 'blank', diagramType: 'c4' })).toEqual(['add-c4-element', 'add-c4-boundary'])
  })

  it('元素 = 编辑 / 起点连线 / 删除；边界 = 编辑 / 删除；关系 = 编辑 / 删除', () => {
    expect(contextMenuItems({ kind: 'c4-element', elementId: 'c4-element:banking' })).toEqual([
      'edit-c4-element',
      'link-from-here',
      'delete',
    ])
    expect(contextMenuItems({ kind: 'c4-boundary', elementId: 'c4-boundary:b0' })).toEqual([
      'edit-c4-boundary',
      'delete',
    ])
    expect(contextMenuItems({ kind: 'c4-relation', elementId: 'relation:1' })).toEqual([
      'edit-c4-relation',
      'delete',
    ])
  })

  function makeCtx() {
    const intents: unknown[] = []
    const forms: string[] = []
    let selected: Selection | null = null
    let closed = 0
    let linked: string | null = null
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
      openForm: (kind) => {
        forms.push(String(kind))
      },
      openStyleForm: () => {},
      beginInlineEdit: () => {},
      enterLinkMode: (from) => {
        linked = from ?? null
      },
      newNodeText: '新节点',
      close: () => {
        closed++
      },
    }
    return { ctx, intents, forms, selected: () => selected, closed: () => closed, linked: () => linked }
  }

  it('add-c4-element：落一行 System 占位元素并选中（alias 小写前缀避重）', () => {
    const h = makeCtx()
    MENU_ACTIONS['add-c4-element'](h.ctx, { kind: 'blank', diagramType: 'c4' } satisfies ContextMenuTarget)
    expect(h.intents).toEqual([{ type: 'add-c4-element', macro: 'System', alias: 'system', label: '新元素' }])
    expect(h.selected()).toEqual({ kind: 'c4-element', elementId: 'c4-element:system' })
    expect(h.closed()).toBe(1)
  })

  it('add-c4-element：alias 与已有元素避重', () => {
    const h = makeCtx()
    const occupied = { type: 'c4' as const, c4: projectionOf('C4Context\n    System(system, "S")\n') }
    MENU_ACTIONS['add-c4-element']({ ...h.ctx, projection: occupied }, { kind: 'blank', diagramType: 'c4' })
    expect(h.intents).toEqual([{ type: 'add-c4-element', macro: 'System', alias: 'system2', label: '新元素' }])
  })

  it('add-c4-boundary：落 Enterprise_Boundary 空块并选中（alias 小写 `boundary`）', () => {
    const h = makeCtx()
    MENU_ACTIONS['add-c4-boundary'](h.ctx, { kind: 'blank', diagramType: 'c4' } satisfies ContextMenuTarget)
    expect(h.intents).toEqual([{ type: 'add-c4-boundary', macro: 'Enterprise_Boundary', alias: 'boundary', label: '新边界' }])
    expect(h.selected()).toEqual({ kind: 'c4-boundary', elementId: 'c4-boundary:boundary' })
    expect(h.closed()).toBe(1)
  })

  it('edit-c4-element / edit-c4-boundary / edit-c4-relation：选中目标后关闭（不改码）', () => {
    const h = makeCtx()
    MENU_ACTIONS['edit-c4-element'](h.ctx, { kind: 'c4-element', elementId: 'c4-element:banking' })
    expect(h.intents).toEqual([])
    expect(h.selected()).toEqual({ kind: 'c4-element', elementId: 'c4-element:banking' })
    MENU_ACTIONS['edit-c4-boundary'](h.ctx, { kind: 'c4-boundary', elementId: 'c4-boundary:b0' })
    expect(h.selected()).toEqual({ kind: 'c4-boundary', elementId: 'c4-boundary:b0' })
    MENU_ACTIONS['edit-c4-relation'](h.ctx, { kind: 'c4-relation', elementId: 'relation:1' })
    expect(h.selected()).toEqual({ kind: 'c4-relation', elementId: 'relation:1' })
    expect(h.closed()).toBe(3)
  })

  it('link-from-here：以该元素的 alias 进入连线模式（关系引用语法标识）', () => {
    const h = makeCtx()
    MENU_ACTIONS['link-from-here'](h.ctx, { kind: 'c4-element', elementId: 'c4-element:banking' })
    expect(h.linked()).toBe('banking')
    expect(h.intents).toEqual([])
  })
})

describe('C4 注册表接线（穷尽性）', () => {
  it('DIAGRAM_TYPES.c4：模板自识别（五关键字）+ 投影包装同名字段', () => {
    const registration = DIAGRAM_TYPES.c4
    for (const line of ['C4Context', 'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment']) {
      expect(registration.detect(`${line}\n    Person(a, "A")\n`)).toBe(true)
      expect(registration.detect(`${line}  \n`)).toBe(true)
    }
    // 只有五个关键字；大小写变体 / 带尾随内容均不认领
    expect(registration.detect('c4context\n')).toBe(false)
    expect(registration.detect('C4Context extra\n')).toBe(false)
    expect(registration.detect('flowchart TD\n')).toBe(false)
    const parsed = registration.parser.parse(registration.template)
    if (!parsed.ok) throw new Error('模板必须可解析')
    const built = registration.buildProjection(parsed.doc)
    expect(built.type).toBe('c4')
    expect((built as { c4: unknown }).c4).toBeDefined()
  })
})
