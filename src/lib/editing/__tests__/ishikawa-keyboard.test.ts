import { describe, expect, it } from 'vitest'
import { ishikawaParser } from '../../pipeline/ishikawa'
import { buildIshikawaProjection } from '../../projection/ishikawa-projection'
import { ishikawaCanvasCapabilities } from '../../canvas-selection/ishikawa-adapter'
import { ishikawaDeleteIntent, ishikawaKeyPlan } from '../../pipeline/ishikawa-keyboard'
import { contextMenuItems, contextMenuTargetFromSelection } from '../../editing/context-menu'
import { MENU_ACTIONS, type MenuActionContext } from '../../editing/menu-actions'
import { menuTargetOfCanvas, fromCanvasId } from '../../canvas-selection/selection-codec'
import { DIAGRAM_TYPES } from '../../diagram-registry'
import { capabilitiesOf } from '../../canvas-selection/capabilities'
import type { Selection } from '../../projection/selection'

/**
 * ishikawa 键位 / 删除意图 / 菜单 / 画布寻址测试（more-diagrams 工单 22，ADR-0013）：
 * 任意节点上 Tab = 加子节点、Enter = 加同级、Delete = 删除（连同子树；鱼头不可删）；
 * 画布 DOM 无 data-id 且渲染序 ≠ 源码序（research §4 实测降级）→ 画布点选不产生选中，
 * 结构树是完整入口。
 */

const SOURCE = `ishikawa-beta
    成片发虚
    人
        手抖
        没按稳
    设备
        镜头脏
`

function projectionOf(source: string) {
  const parsed = ishikawaParser.parse(source)
  if (!parsed.ok) throw new Error(`解析失败：${parsed.error.message}`)
  return buildIshikawaProjection(parsed.doc)
}

const ROOT_SEL: Selection = { kind: 'ishikawa-node', elementId: 'ishikawa-node:1' }
const CAUSE_SEL: Selection = { kind: 'ishikawa-node', elementId: 'ishikawa-node:2' }
const BRANCH_SEL: Selection = { kind: 'ishikawa-node', elementId: 'ishikawa-node:3' }

describe('ishikawaKeyPlan（ADR-0013 就近映射）', () => {
  const projection = projectionOf(SOURCE)

  it('分支上 Tab = 加子节点（落在子树末尾之后，缩进由管线深一档，名字避重）', () => {
    const plan = ishikawaKeyPlan(projection, { key: 'Tab', selection: BRANCH_SEL })
    expect(plan).not.toBeNull()
    expect(plan!.intents).toEqual([
      { type: 'add-child', parentElementId: 'ishikawa-node:3', text: '新原因' },
    ])
    // 新节点位置序 = 手抖子树末尾（自身，平铺下标 2）+ 2
    expect(plan!.newElementTarget).toEqual({
      selection: { kind: 'ishikawa-node', elementId: 'ishikawa-node:4' },
    })
  })

  it('主因上 Tab = 加子节点（落在其子树末尾之后）', () => {
    const plan = ishikawaKeyPlan(projection, { key: 'Tab', selection: CAUSE_SEL })
    expect(plan).not.toBeNull()
    expect(plan!.intents).toEqual([
      { type: 'add-child', parentElementId: 'ishikawa-node:2', text: '新原因' },
    ])
    // 「人」子树 = 手抖/没按稳（下标 2..3），末尾 + 2 = 5
    expect(plan!.newElementTarget).toEqual({
      selection: { kind: 'ishikawa-node', elementId: 'ishikawa-node:5' },
    })
  })

  it('任意节点上 Enter = 加同级（同缩进，落在子树之后）', () => {
    const plan = ishikawaKeyPlan(projection, { key: 'Enter', selection: CAUSE_SEL })
    expect(plan).not.toBeNull()
    expect(plan!.intents).toEqual([
      { type: 'add-sibling', elementId: 'ishikawa-node:2', text: '新原因' },
    ])
    expect(plan!.newElementTarget).toEqual({
      selection: { kind: 'ishikawa-node', elementId: 'ishikawa-node:5' },
    })
  })

  it('名字避重：已有「新原因」时下一个是「新原因2」', () => {
    const withExisting = projectionOf(SOURCE.replace('    设备\n', '    新原因\n'))
    const plan = ishikawaKeyPlan(withExisting, { key: 'Enter', selection: CAUSE_SEL })
    expect(plan!.intents).toEqual([
      { type: 'add-sibling', elementId: 'ishikawa-node:2', text: '新原因2' },
    ])
  })

  it('Delete = 删除选中节点（连同子树由管线负责）', () => {
    expect(ishikawaKeyPlan(projection, { key: 'Delete', selection: CAUSE_SEL })).toEqual({
      intents: [{ type: 'delete-node', elementId: 'ishikawa-node:2' }],
      clearSelection: true,
    })
    expect(ishikawaDeleteIntent(projection, CAUSE_SEL)).toEqual({
      type: 'delete-node',
      elementId: 'ishikawa-node:2',
    })
    expect(ishikawaDeleteIntent(projection, { kind: 'ishikawa-node', elementId: 'ishikawa-node:99' })).toBeNull()
    expect(ishikawaDeleteIntent(projection, null)).toBeNull()
  })

  it('鱼头不可删：Delete 安静无动作（工单定案）', () => {
    expect(ishikawaKeyPlan(projection, { key: 'Delete', selection: ROOT_SEL })).toBeNull()
    expect(ishikawaDeleteIntent(projection, ROOT_SEL)).toBeNull()
  })

  it('带修饰键（Shift-Tab）/ 别种选中 / 无选中 → null', () => {
    expect(ishikawaKeyPlan(projection, { key: 'Tab', mods: { shift: true }, selection: CAUSE_SEL })).toBeNull()
    expect(ishikawaKeyPlan(projection, { key: 'Tab', selection: { kind: 'diagram' } })).toBeNull()
    expect(ishikawaKeyPlan(projection, { key: 'Tab', selection: null })).toBeNull()
  })
})

describe('ishikawa 画布寻址降级（research §4 实测：渲染器无 data-id，且渲染序 ≠ 源码序）', () => {
  const projection = { type: 'ishikawa' as const, ishikawa: projectionOf(SOURCE) }
  const caps = capabilitiesOf(projection)

  it('八项能力齐备且无 edgeAnnotator / nodeAnnotator（无连线的图种不实现，工单定案）', () => {
    expect(caps).toBe(ishikawaCanvasCapabilities)
    expect(typeof caps.resolveSelection).toBe('function')
    expect(typeof caps.deleteIntent).toBe('function')
    expect(caps.edgeAnnotator).toBeUndefined()
    expect(caps.nodeAnnotator).toBeUndefined()
    expect(caps.keyboardProjection(projection)).toEqual({ kind: 'ishikawa', projection: projection.ishikawa })
  })

  it('resolver / toSelection / canvasIdOf / navigationIds 全部安静返回空', () => {
    expect(caps.dataIdResolver(projection)('anything')).toBeNull()
    expect(caps.toSelection({ kind: 'node', id: 'x' })).toBeNull()
    expect(caps.canvasIdOf(projection, CAUSE_SEL)).toBeNull()
    expect(caps.navigationIds(projection)).toEqual([])
  })

  it('fromCanvasId / menuTargetOfCanvas：画布选中与节点菜单目标均不产生', () => {
    expect(fromCanvasId('ishikawa', { kind: 'node', id: 'x' })).toBeNull()
    expect(menuTargetOfCanvas('ishikawa', { kind: 'node', id: 'x' })).toBeNull()
    expect(contextMenuTargetFromSelection({ kind: 'node', id: 'x' }, 'ishikawa')).toBeNull()
  })

  it('右键空白菜单 = 加主因', () => {
    expect(contextMenuItems({ kind: 'blank', diagramType: 'ishikawa' })).toEqual(['add-ishikawa-cause'])
  })

  it('add-ishikawa-cause：插在末条主因之后并选中新节点', () => {
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
    MENU_ACTIONS['add-ishikawa-cause'](ctx, { kind: 'blank', diagramType: 'ishikawa' })
    // 末条主因 = 设备（ishikawa-node:5），其子树末尾 = 镜头脏（平铺下标 5）→ 新节点序号 7
    expect(intents).toEqual([{ type: 'add-sibling', elementId: 'ishikawa-node:5', text: '新原因' }])
    expect(selected).toEqual({ kind: 'ishikawa-node', elementId: 'ishikawa-node:7' })
    expect(closed).toBe(1)
  })

  it('add-ishikawa-cause：无主因时挂鱼头下', () => {
    const bare = { type: 'ishikawa' as const, ishikawa: projectionOf('ishikawa-beta\n    成片发虚\n') }
    const intents: unknown[] = []
    const ctx: MenuActionContext = {
      projection: bare,
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
      newNodeText: '新节点',
      close: () => {},
    }
    MENU_ACTIONS['add-ishikawa-cause'](ctx, { kind: 'blank', diagramType: 'ishikawa' })
    expect(intents).toEqual([{ type: 'add-child', parentElementId: 'ishikawa-node:1', text: '新原因' }])
  })
})

describe('ishikawa 注册表接线（穷尽性）', () => {
  it('DIAGRAM_TYPES.ishikawa：模板自识别 + 投影包装同名字段 + 大小写不敏感', () => {
    const registration = DIAGRAM_TYPES.ishikawa
    expect(registration.detect('ishikawa\n    甲\n')).toBe(true)
    expect(registration.detect('ishikawa-beta\n    甲\n')).toBe(true)
    expect(registration.detect('ISHIKAWA-BETA\n    甲\n')).toBe(true)
    // 声明行必须是裸关键字（research §1）
    expect(registration.detect('ishikawa extra\n    甲\n')).toBe(false)
    expect(registration.detect('ishikawaX\n    甲\n')).toBe(false)
    const parsed = registration.parser.parse(registration.template)
    if (!parsed.ok) throw new Error('模板必须可解析')
    const projection = registration.buildProjection(parsed.doc)
    expect(projection.type).toBe('ishikawa')
    expect((projection as { ishikawa: unknown }).ishikawa).toBeDefined()
  })
})
