import { describe, expect, it } from 'vitest'
import { cynefinParser } from '../../pipeline/cynefin'
import { buildCynefinProjection } from '../../projection/cynefin-projection'
import { cynefinCanvasCapabilities } from '../../canvas-selection/cynefin-adapter'
import { cynefinDeleteIntent, cynefinKeyPlan } from '../../pipeline/cynefin-keyboard'
import { contextMenuItems, contextMenuTargetFromSelection } from '../../editing/context-menu'
import { MENU_ACTIONS, type MenuActionContext } from '../../editing/menu-actions'
import { menuTargetOfCanvas, fromCanvasId, canvasIdOf, selectionOfMenuTarget } from '../../canvas-selection/selection-codec'
import { DIAGRAM_TYPES } from '../../diagram-registry'
import { capabilitiesOf } from '../../canvas-selection/capabilities'
import type { Selection } from '../../projection/selection'

/**
 * cynefin 键位 / 删除意图 / 菜单 / 画布寻址测试（more-diagrams 工单 25，ADR-0013）。
 * 画布 DOM 无 data-id（research §4/§8.1 实测：渲染器 `data-` 出现 0 次，仅 `<defs>` 箭头
 * marker 有 id）→ 画布点选不产生选中，结构树 + 属性表单是完整入口；键位经结构树选中后
 * 由画布键盘生效（与 ishikawa/wardley/treemap 同口径）。
 */

const SOURCE = `cynefin-beta
title 事件响应分类
complex
  "排查根因"
  "运行混沌实验"
complicated
  "分析性能数据"
clear
  "重启服务"
complex --> complicated : "模式已识别"
`

function projectionOf(src: string) {
  const parsed = cynefinParser.parse(src)
  if (!parsed.ok) throw new Error(`解析失败：${parsed.error.message}`)
  return buildCynefinProjection(parsed.doc)
}

const DOMAIN_SEL: Selection = { kind: 'cynefin-domain', name: 'complex' }
const ITEM_SEL: Selection = { kind: 'cynefin-item', elementId: 'cynefin-item:1' }
const TRANSITION_SEL: Selection = { kind: 'cynefin-transition', elementId: 'cynefin-transition:1' }

describe('cynefinKeyPlan（ADR-0013 就近映射）', () => {
  const projection = projectionOf(SOURCE)

  it('选中域名词行上 Tab = 在该域下加条目（锚点 = 域末条目，位置序 = 域末条目序号 + 1）', () => {
    const plan = cynefinKeyPlan(projection, { key: 'Tab', selection: DOMAIN_SEL })
    expect(plan).not.toBeNull()
    expect(plan!.intents).toEqual([
      { type: 'add-item', domain: 'complex', text: '新条目', afterElementId: 'cynefin-item:2' },
    ])
    expect(plan!.newElementTarget).toEqual({ selection: { kind: 'cynefin-item', elementId: 'cynefin-item:3' } })
  })

  it('选中条目上 Tab = 在该条目之后加条目（同域，锚点 = 该条目行，位置序 = 该条目序号 + 1）', () => {
    const plan = cynefinKeyPlan(projection, { key: 'Tab', selection: ITEM_SEL })
    expect(plan!.intents).toEqual([
      { type: 'add-item', domain: 'complex', text: '新条目', afterElementId: 'cynefin-item:1' },
    ])
    expect(plan!.newElementTarget).toEqual({ selection: { kind: 'cynefin-item', elementId: 'cynefin-item:2' } })
  })

  it('条目文本避重：已有「新条目」时下一个是「新条目2」', () => {
    const withUsed = projectionOf(`${SOURCE}  "新条目"\n`)
    const plan = cynefinKeyPlan(withUsed, { key: 'Tab', selection: DOMAIN_SEL })
    expect(plan!.intents).toEqual([
      { type: 'add-item', domain: 'complex', text: '新条目2', afterElementId: 'cynefin-item:2' },
    ])
  })

  it('Delete = 删除选中元素（条目 / 转移各映射到 delete-*；域名词行不可删）', () => {
    expect(cynefinKeyPlan(projection, { key: 'Delete', selection: ITEM_SEL })).toEqual({
      intents: [{ type: 'delete-item', elementId: 'cynefin-item:1' }],
      clearSelection: true,
    })
    expect(cynefinKeyPlan(projection, { key: 'Delete', selection: TRANSITION_SEL })).toEqual({
      intents: [{ type: 'delete-transition', elementId: 'cynefin-transition:1' }],
      clearSelection: true,
    })
    // 域名词行是固定五域的分组声明语句（删掉会让该域消失）→ 无删除语义（与 ishikawa 鱼头同口径）
    expect(cynefinKeyPlan(projection, { key: 'Delete', selection: DOMAIN_SEL })).toBeNull()
  })

  it('cynefinDeleteIntent：存在性校验（已不在投影 / 别种选中 / null → null）', () => {
    expect(cynefinDeleteIntent(projection, ITEM_SEL)).toEqual({
      type: 'delete-item',
      elementId: 'cynefin-item:1',
    })
    expect(cynefinDeleteIntent(projection, { kind: 'cynefin-item', elementId: 'cynefin-item:99' })).toBeNull()
    expect(cynefinDeleteIntent(projection, { kind: 'cynefin-transition', elementId: 'cynefin-transition:99' })).toBeNull()
    expect(cynefinDeleteIntent(projection, DOMAIN_SEL)).toBeNull()
    expect(cynefinDeleteIntent(projection, { kind: 'diagram' })).toBeNull()
    expect(cynefinDeleteIntent(projection, null)).toBeNull()
  })

  it('转移上无 Tab / Enter 语义；Enter 无自然类比；带修饰键 / 无选中 → null', () => {
    expect(cynefinKeyPlan(projection, { key: 'Tab', selection: TRANSITION_SEL })).toBeNull()
    expect(cynefinKeyPlan(projection, { key: 'Enter', selection: DOMAIN_SEL })).toBeNull()
    expect(cynefinKeyPlan(projection, { key: 'Enter', selection: ITEM_SEL })).toBeNull()
    expect(cynefinKeyPlan(projection, { key: 'Tab', mods: { shift: true }, selection: ITEM_SEL })).toBeNull()
    expect(cynefinKeyPlan(projection, { key: 'Tab', selection: null })).toBeNull()
  })
})

describe('cynefin 画布寻址降级（research §4/§8.1 实测：渲染器无 data-id）', () => {
  const projection = { type: 'cynefin' as const, cynefin: projectionOf(SOURCE) }
  const caps = capabilitiesOf(projection)

  it('八项能力齐备且无 edgeAnnotator / nodeAnnotator（工单定案：整体降级）', () => {
    expect(caps).toBe(cynefinCanvasCapabilities)
    expect(typeof caps.resolveSelection).toBe('function')
    expect(typeof caps.deleteIntent).toBe('function')
    expect(caps.edgeAnnotator).toBeUndefined()
    expect(caps.nodeAnnotator).toBeUndefined()
    expect(caps.keyboardProjection(projection)).toEqual({ kind: 'cynefin', projection: projection.cynefin })
  })

  it('resolver / toSelection / canvasIdOf / navigationIds 全部安静返回空', () => {
    expect(caps.dataIdResolver(projection)('anything')).toBeNull()
    expect(caps.toSelection({ kind: 'node', id: 'x' })).toBeNull()
    expect(caps.canvasIdOf(projection, DOMAIN_SEL)).toBeNull()
    expect(caps.canvasIdOf(projection, ITEM_SEL)).toBeNull()
    expect(caps.navigationIds(projection)).toEqual([])
    expect(canvasIdOf(DOMAIN_SEL)).toBeNull()
    expect(canvasIdOf(ITEM_SEL)).toBeNull()
    expect(canvasIdOf(TRANSITION_SEL)).toBeNull()
  })

  it('fromCanvasId / menuTargetOfCanvas：画布选中与节点菜单目标均不产生', () => {
    expect(fromCanvasId('cynefin', { kind: 'node', id: 'x' })).toBeNull()
    expect(menuTargetOfCanvas('cynefin', { kind: 'node', id: 'x' })).toBeNull()
    expect(contextMenuTargetFromSelection({ kind: 'node', id: 'x' }, 'cynefin')).toBeNull()
  })

  it('右键空白菜单 = 加条目 / 加转移', () => {
    expect(contextMenuItems({ kind: 'blank', diagramType: 'cynefin' })).toEqual([
      'add-cynefin-item',
      'add-cynefin-transition',
    ])
  })

  it('程序构造的域 / 条目 / 转移菜单目标各给编辑项，且 selectionOfMenuTarget 互逆', () => {
    expect(contextMenuItems({ kind: 'element', selection: { kind: 'cynefin-domain', name: 'complex' } })).toEqual(['add-cynefin-item'])
    expect(contextMenuItems({ kind: 'element', selection: { kind: 'cynefin-item', elementId: 'cynefin-item:1' } })).toEqual([
      'add-cynefin-item',
      'edit-text',
      'delete',
    ])
    expect(contextMenuItems({ kind: 'element', selection: { kind: 'cynefin-transition', elementId: 'cynefin-transition:1' } })).toEqual([
      'edit-label',
      'delete',
    ])
    expect(selectionOfMenuTarget({ kind: 'element', selection: { kind: 'cynefin-domain', name: 'complex' } })).toEqual({
      kind: 'cynefin-domain',
      name: 'complex',
    })
    expect(selectionOfMenuTarget({ kind: 'element', selection: { kind: 'cynefin-item', elementId: 'cynefin-item:1' } })).toEqual({
      kind: 'cynefin-item',
      elementId: 'cynefin-item:1',
    })
    expect(selectionOfMenuTarget({ kind: 'element', selection: { kind: 'cynefin-transition', elementId: 'cynefin-transition:1' } })).toEqual({
      kind: 'cynefin-transition',
      elementId: 'cynefin-transition:1',
    })
  })

  it('add-cynefin-item：归属最后一个声明域，落一行条目并选中新条目', () => {
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
    MENU_ACTIONS['add-cynefin-item'](ctx, { kind: 'blank', diagramType: 'cynefin' })
    // 文档序最后一个条目在 clear（SOURCE「重启服务」）→ 归属 clear，锚点为该域末条目行
    expect(intents).toEqual([
      { type: 'add-item', domain: 'clear', text: '新条目', afterElementId: 'cynefin-item:4' },
    ])
    expect(selected).toEqual({ kind: 'cynefin-item', elementId: 'cynefin-item:5' })
  })

  it('add-cynefin-item：无任何已声明域时安静不落码（条目必须紧随域名词行，research §8.3）', () => {
    const emptyProjection = { type: 'cynefin' as const, cynefin: projectionOf('cynefin-beta\n') }
    let selected: Selection | null = null
    const intents: unknown[] = []
    const ctx: MenuActionContext = {
      projection: emptyProjection,
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
    MENU_ACTIONS['add-cynefin-item'](ctx, { kind: 'blank', diagramType: 'cynefin' })
    expect(intents).toEqual([])
    expect(selected).toBeNull()
  })

  it('add-cynefin-item：无条目的已声明域（complex 域行在、无条目）锚到域名词行', () => {
    const domainOnly = { type: 'cynefin' as const, cynefin: projectionOf('cynefin-beta\ncomplex\n') }
    let selected: Selection | null = null
    const intents: unknown[] = []
    const ctx: MenuActionContext = {
      projection: domainOnly,
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
    MENU_ACTIONS['add-cynefin-item'](ctx, { kind: 'blank', diagramType: 'cynefin' })
    expect(intents).toEqual([
      { type: 'add-item', domain: 'complex', text: '新条目', afterElementId: 'cynefin-domain:complex' },
    ])
    expect(selected).toEqual({ kind: 'cynefin-item', elementId: 'cynefin-item:1' })
  })

  it('add-cynefin-transition：打开加转移浮层表单（两端从固定五域下拉）', () => {
    const opened: string[] = []
    const ctx: MenuActionContext = {
      projection,
      selection: null,
      commitIntent: () => true,
      select: () => {},
      openForm: (kind) => {
        opened.push(kind)
      },
      openStyleForm: () => {},
      beginInlineEdit: () => {},
      enterLinkMode: () => {},
      newNodeText: '新节点',
      close: () => {},
    }
    MENU_ACTIONS['add-cynefin-transition'](ctx, { kind: 'blank', diagramType: 'cynefin' })
    expect(opened).toEqual(['cynefin-transition'])
  })
})

describe('cynefin 注册表接线（穷尽性）', () => {
  it('DIAGRAM_TYPES.cynefin：模板自识别 + 投影包装同名字段', () => {
    const registration = DIAGRAM_TYPES.cynefin
    expect(registration.detect('cynefin-beta\ncomplex\n')).toBe(true)
    expect(registration.detect('cynefin-beta:\ncomplex\n')).toBe(true)
    // 大小写敏感（research §1：mermaid 词法无 /i）
    expect(registration.detect('Cynefin-Beta\ncomplex\n')).toBe(false)
    // 声明行必须是裸关键字（首行即关键字），带尾随内容不认领
    expect(registration.detect('cynefin-beta extra\ncomplex\n')).toBe(false)
    const parsed = registration.parser.parse(registration.template)
    if (!parsed.ok) throw new Error('模板必须可解析')
    const projection = registration.buildProjection(parsed.doc)
    expect(projection.type).toBe('cynefin')
    expect((projection as { cynefin: unknown }).cynefin).toBeDefined()
  })
})
