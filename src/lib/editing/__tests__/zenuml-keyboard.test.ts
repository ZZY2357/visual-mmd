import { describe, expect, it } from 'vitest'
import { zenumlParser } from '../../pipeline/zenuml'
import { buildZenumlProjection } from '../../projection/zenuml-projection'
import { zenumlCanvasCapabilities } from '../../canvas-selection/zenuml-adapter'
import { zenumlDeleteIntent, zenumlKeyPlan } from '../../pipeline/zenuml-keyboard'
import { contextMenuItems } from '../../editing/context-menu'
import { MENU_ACTIONS, type MenuActionContext } from '../../editing/menu-actions'
import { canvasIdOf, fromCanvasId, menuTargetOfCanvas, selectionOfMenuTarget } from '../../canvas-selection/selection-codec'
import { DIAGRAM_TYPES } from '../../diagram-registry'
import { capabilitiesOf } from '../../canvas-selection/capabilities'
import type { Selection } from '../../projection/selection'

/**
 * zenuml 键位 / 删除意图 / 菜单 / 画布寻址测试（more-diagrams 工单 19，ADR-0013）。
 *
 * **画布寻址整体降级**（工单 19 任务 0 实测：zenuml 渲染产物无 `data-id` / 无 `id`，
 * 唯一 data 属性 `data-participant` 不成稳定映射）——`canvasIdOf` / `fromCanvasId` /
 * `menuTargetOfCanvas` / `navigationIds` / 箭头键全部 null/空；编辑入口是**结构树 + 属性面板 +
 * 程序构造的右键菜单目标**（用户可在结构树右键参与者 / 消息）。
 */

const SOURCE = `zenuml
    title 下单流程
    participant Client as "客户端"
    participant Server as "服务端"
    @Database Server
    Client->Server.placeOrder(item)
    Server.checkStock()
    if (item.stock > 0) {
        Server.reserve()
    } else {
        Client.reject()
    }
    new Order(item)
    return ok
`

function projectionOf(source: string) {
  const parsed = zenumlParser.parse(source)
  if (!parsed.ok) throw new Error(`解析失败：${parsed.error.message}`)
  return buildZenumlProjection(parsed.doc)
}

const PART_SEL: Selection = { kind: 'zenuml-participant', elementId: 'participant:Client' }
const MSG_SEL: Selection = { kind: 'zenuml-message', elementId: 'message:1' }
const FRAG_SEL: Selection = { kind: 'zenuml-fragment', elementId: 'fragment:1' }

describe('zenumlKeyPlan（ADR-0013）', () => {
  const projection = projectionOf(SOURCE)

  it('消息上 Tab = 打开「添加消息」表单（无意图，交表单提交）', () => {
    const plan = zenumlKeyPlan(projection, { key: 'Tab', selection: MSG_SEL })
    expect(plan).not.toBeNull()
    expect(plan!.intents).toEqual([])
    expect(plan!.form).toBe('zenuml-message')
  })

  it('参与者 / 片段上 Tab 无动作（片段是分组容器，不就地派生）', () => {
    expect(zenumlKeyPlan(projection, { key: 'Tab', selection: PART_SEL })).toBeNull()
    expect(zenumlKeyPlan(projection, { key: 'Tab', selection: FRAG_SEL })).toBeNull()
  })

  it('Delete = 删除选中（消息 -> delete-zenuml-message；已声明参与者 -> delete-zenuml-participant）', () => {
    expect(zenumlKeyPlan(projection, { key: 'Delete', selection: MSG_SEL })).toEqual({
      intents: [{ type: 'delete-zenuml-message', elementId: 'message:1' }],
      clearSelection: true,
    })
    expect(zenumlKeyPlan(projection, { key: 'Delete', selection: PART_SEL })).toEqual({
      intents: [{ type: 'delete-zenuml-participant', elementId: 'participant:Client' }],
      clearSelection: true,
    })
  })

  it('Backspace 与 Delete 等价', () => {
    expect(zenumlKeyPlan(projection, { key: 'Backspace', selection: MSG_SEL })).toEqual({
      intents: [{ type: 'delete-zenuml-message', elementId: 'message:1' }],
      clearSelection: true,
    })
  })

  it('未声明参与者（仅隐式端点）Delete 无动作（删它等于删消息，归消息入口）', () => {
    // Order 只由 `new Order(item)` 隐式引入，无声明行
    expect(zenumlDeleteIntent(projection, { kind: 'zenuml-participant', elementId: 'participant:Order' })).toBeNull()
  })

  it('片段上 Delete 无动作（分组容器无删除入口）', () => {
    expect(zenumlDeleteIntent(projection, FRAG_SEL)).toBeNull()
  })

  it('zenumlDeleteIntent：不存在 / null / 图表级 / 别种 → null', () => {
    expect(zenumlDeleteIntent(projection, { kind: 'zenuml-message', elementId: 'message:999' })).toBeNull()
    expect(zenumlDeleteIntent(projection, { kind: 'zenuml-participant', elementId: 'participant:Ghost' })).toBeNull()
    expect(zenumlDeleteIntent(projection, null)).toBeNull()
    expect(zenumlDeleteIntent(projection, { kind: 'diagram' })).toBeNull()
    expect(zenumlDeleteIntent(projection, { kind: 'node', nodeId: 'A' })).toBeNull()
  })

  it('带修饰键（Shift-Tab）/ 无选中 → null', () => {
    expect(zenumlKeyPlan(projection, { key: 'Tab', mods: { shift: true }, selection: MSG_SEL })).toBeNull()
    expect(zenumlKeyPlan(projection, { key: 'Tab', selection: null })).toBeNull()
    expect(zenumlKeyPlan(projection, { key: 'Delete', selection: null })).toBeNull()
  })
})

describe('zenuml 画布寻址降级（工单 19 任务 0 实测：无 data-id → 不可寻址）', () => {
  const projection = { type: 'zenuml' as const, zenuml: projectionOf(SOURCE) }
  const caps = capabilitiesOf(projection)

  it('能力包齐备但箭头键 / 画布寻址全部降级（null / 空）', () => {
    expect(caps).toBe(zenumlCanvasCapabilities)
    expect(caps.canvasIdOf(projection, PART_SEL)).toBeNull()
    expect(caps.canvasIdOf(projection, MSG_SEL)).toBeNull()
    expect(caps.canvasIdOf(projection, { kind: 'diagram' })).toBeNull()
    expect(caps.toSelection({ kind: 'node', id: 'x' })).toBeNull()
    expect(caps.navigationIds(projection)).toEqual([])
    expect(caps.dataIdResolver(projection)('x')).toBeNull()
  })

  it('keyboardProjection 仍暴露投影（结构树键位可用）', () => {
    expect(caps.keyboardProjection(projection)).toEqual({ kind: 'zenuml', projection: projection.zenuml })
  })

  it('resolveSelection / deleteIntent 仍可用（结构树选中走能力包）', () => {
    expect(caps.resolveSelection(projection, MSG_SEL)).toEqual(MSG_SEL)
    expect(caps.deleteIntent(projection, MSG_SEL)).toEqual({
      type: 'delete-zenuml-message',
      elementId: 'message:1',
    })
  })

  it('selection-codec：canvasIdOf / fromCanvasId / menuTargetOfCanvas 对 zenuml 一律 null', () => {
    expect(canvasIdOf(MSG_SEL)).toBeNull()
    expect(canvasIdOf(PART_SEL)).toBeNull()
    expect(fromCanvasId('zenuml', { kind: 'node', id: 'x' })).toBeNull()
    expect(menuTargetOfCanvas('zenuml', { kind: 'node', id: 'x' })).toBeNull()
  })

  it('selectionOfMenuTarget：程序构造的 zenuml 目标 → 同形 selection（结构树右键入口）', () => {
    expect(selectionOfMenuTarget({ kind: 'element', selection: { kind: 'zenuml-participant', elementId: 'participant:Client' } })).toEqual(PART_SEL)
    expect(selectionOfMenuTarget({ kind: 'element', selection: { kind: 'zenuml-message', elementId: 'message:1' } })).toEqual(MSG_SEL)
    expect(selectionOfMenuTarget({ kind: 'element', selection: { kind: 'zenuml-fragment', elementId: 'fragment:1' } })).toEqual(FRAG_SEL)
  })
})

describe('zenuml 菜单（more-diagrams 工单 19）', () => {
  const projection = { type: 'zenuml' as const, zenuml: projectionOf(SOURCE) }

  it('空白菜单 = 加参与者 / 加消息', () => {
    expect(contextMenuItems({ kind: 'blank', diagramType: 'zenuml' })).toEqual([
      'add-zenuml-participant',
      'add-zenuml-message',
    ])
  })

  it('参与者 = 改别名 / 删除；消息 = 编辑 / 删除；片段无菜单项', () => {
    expect(contextMenuItems({ kind: 'element', selection: { kind: 'zenuml-participant', elementId: 'participant:Client' } })).toEqual([
      'edit-zenuml-participant',
      'delete',
    ])
    expect(contextMenuItems({ kind: 'element', selection: { kind: 'zenuml-message', elementId: 'message:1' } })).toEqual([
      'edit-zenuml-message',
      'delete',
    ])
    expect(contextMenuItems({ kind: 'element', selection: { kind: 'zenuml-fragment', elementId: 'fragment:1' } })).toEqual([])
  })

  function makeCtx() {
    const intents: unknown[] = []
    const forms: string[] = []
    let selected: Selection | null = null
    let inline: unknown = null
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
      openForm: (kind) => {
        forms.push(kind)
      },
      openStyleForm: () => {},
      beginInlineEdit: (target) => {
        inline = target
      },
      enterLinkMode: () => {},
      newNodeText: '新节点',
      close: () => {
        closed++
      },
    }
    return { ctx, intents, forms, selected: () => selected, inline: () => inline, closed: () => closed }
  }

  it('add-zenuml-participant：落一行 participant（占位 id P1）并选中', () => {
    const h = makeCtx()
    MENU_ACTIONS['add-zenuml-participant'](h.ctx, { kind: 'blank', diagramType: 'zenuml' })
    expect(h.intents).toEqual([{ type: 'add-zenuml-participant', id: 'P1' }])
    expect(h.selected()).toEqual({ kind: 'zenuml-participant', elementId: 'participant:P1' })
    expect(h.closed()).toBe(1)
  })

  it('add-zenuml-message：打开「添加消息」表单（提交才落码，菜单不关闭）', () => {
    const h = makeCtx()
    MENU_ACTIONS['add-zenuml-message'](h.ctx, { kind: 'blank', diagramType: 'zenuml' })
    expect(h.forms).toEqual(['zenuml-message'])
    expect(h.intents).toEqual([])
    expect(h.closed()).toBe(0)
  })

  it('edit-zenuml-participant：进入别名内联编辑', () => {
    const h = makeCtx()
    MENU_ACTIONS['edit-zenuml-participant'](h.ctx, { kind: 'element', selection: { kind: 'zenuml-participant', elementId: 'participant:Client' } })
    expect(h.inline()).toEqual({ kind: 'zenuml-participant', elementId: 'participant:Client' })
    expect(h.closed()).toBe(1)
  })

  it('delete 目标：参与者 / 消息各自产出删除意图并清选中', () => {
    const h1 = makeCtx()
    MENU_ACTIONS['delete'](h1.ctx, { kind: 'element', selection: { kind: 'zenuml-message', elementId: 'message:1' } })
    expect(h1.intents).toEqual([{ type: 'delete-zenuml-message', elementId: 'message:1' }])
    expect(h1.selected()).toBeNull()
    expect(h1.closed()).toBe(1)

    const h2 = makeCtx()
    MENU_ACTIONS['delete'](h2.ctx, { kind: 'element', selection: { kind: 'zenuml-participant', elementId: 'participant:Client' } })
    expect(h2.intents).toEqual([{ type: 'delete-zenuml-participant', elementId: 'participant:Client' }])
  })
})

describe('zenuml 注册表接线（穷尽性）', () => {
  it('DIAGRAM_TYPES.zenuml：模板自识别（表头首非空行恰为 zenuml）+ 投影包装同名字段', () => {
    const registration = DIAGRAM_TYPES.zenuml
    expect(registration.detect('zenuml\n    A.b()\n')).toBe(true)
    expect(registration.detect('  zenuml  \n')).toBe(true)
    // 大小写变体 / 带尾随内容 / 首行非 zenuml 均不认领
    expect(registration.detect('Zenuml\n')).toBe(false)
    expect(registration.detect('zenuml extra\n')).toBe(false)
    expect(registration.detect('title x\nzenuml\n')).toBe(false)
    const parsed = registration.parser.parse(registration.template)
    if (!parsed.ok) throw new Error('模板必须可解析')
    const wrapped = registration.buildProjection(parsed.doc)
    expect(wrapped.type).toBe('zenuml')
    expect((wrapped as { zenuml: unknown }).zenuml).toBeDefined()
  })
})
