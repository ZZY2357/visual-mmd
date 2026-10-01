import { describe, expect, it } from 'vitest'
import { treeviewParser } from '../../pipeline/treeview'
import { buildTreeviewProjection } from '../../projection/treeview-projection'
import { treeviewCanvasCapabilities } from '../../canvas-selection/treeview-adapter'
import { treeviewDeleteIntent, treeviewKeyPlan } from '../../editing/canvas-keyboard'
import { contextMenuItems, contextMenuTargetFromSelection } from '../../editing/context-menu'
import { MENU_ACTIONS, type MenuActionContext } from '../../editing/menu-actions'
import { menuTargetOfCanvas, fromCanvasId } from '../../canvas-selection/selection-codec'
import { DIAGRAM_TYPES } from '../../diagram-registry'
import { capabilitiesOf } from '../../canvas-selection/capabilities'
import type { Selection } from '../../projection/selection'

/**
 * treeView 键位 / 删除意图 / 菜单 / 画布寻址测试（more-diagrams 工单 24，ADR-0013）：
 * 目录上 Tab = 加子节点、任意节点上 Enter = 加同级、Delete = 删除（连同子树）；
 * 画布 DOM 无 data-id（research §4 实测降级）→ 画布点选不产生选中，结构树是完整入口。
 */

const SOURCE = `treeView-beta
/
    src/
        main.ts
        utils.ts
    docs/
        README.md
`

function projectionOf(source: string) {
  const parsed = treeviewParser.parse(source)
  if (!parsed.ok) throw new Error(`解析失败：${parsed.error.message}`)
  return buildTreeviewProjection(parsed.doc)
}

// treeview-node:1 = `/`（目录），2 = src/（目录），3 = main.ts（文件），4 = utils.ts（文件），5 = docs/，6 = README.md
const DIR_SEL: Selection = { kind: 'treeview-node', elementId: 'treeview-node:2' }
const FILE_SEL: Selection = { kind: 'treeview-node', elementId: 'treeview-node:3' }

describe('treeviewKeyPlan（ADR-0013 就近映射）', () => {
  const projection = projectionOf(SOURCE)

  it('目录上 Tab = 加子节点（落在子树末尾之后，缩进由管线深一档，名字避重）', () => {
    const plan = treeviewKeyPlan(projection, { key: 'Tab', selection: DIR_SEL })
    expect(plan).not.toBeNull()
    expect(plan!.intents).toEqual([
      { type: 'add-child', parentElementId: 'treeview-node:2', name: '新文件' },
    ])
    // src/ 子树 = src/、main.ts、utils.ts（平铺下标 1..3），末尾 + 2 = 5
    expect(plan!.newElementTarget).toEqual({
      selection: { kind: 'treeview-node', elementId: 'treeview-node:5' },
    })
  })

  it('文件上 Tab = null（文件叶子无子，语义底线）', () => {
    expect(treeviewKeyPlan(projection, { key: 'Tab', selection: FILE_SEL })).toBeNull()
  })

  it('任意节点上 Enter = 加同级（同缩进，落在子树之后）', () => {
    const plan = treeviewKeyPlan(projection, { key: 'Enter', selection: FILE_SEL })
    expect(plan).not.toBeNull()
    expect(plan!.intents).toEqual([
      { type: 'add-sibling', elementId: 'treeview-node:3', name: '新文件' },
    ])
    // main.ts 无子：子树末尾 = 自身（下标 2），+ 2 = 4
    expect(plan!.newElementTarget).toEqual({
      selection: { kind: 'treeview-node', elementId: 'treeview-node:4' },
    })
  })

  it('名字避重：已有「新文件」时下一个是「新文件2」', () => {
    const withExisting = projectionOf(SOURCE.replace('        main.ts\n', '        新文件\n'))
    const plan = treeviewKeyPlan(withExisting, { key: 'Enter', selection: FILE_SEL })
    expect(plan!.intents).toEqual([
      { type: 'add-sibling', elementId: 'treeview-node:3', name: '新文件2' },
    ])
  })

  it('Delete = 删除选中节点（连同子树由管线负责）', () => {
    expect(treeviewKeyPlan(projection, { key: 'Delete', selection: DIR_SEL })).toEqual({
      intents: [{ type: 'delete-node', elementId: 'treeview-node:2' }],
      clearSelection: true,
    })
    expect(treeviewDeleteIntent(projection, DIR_SEL)).toEqual({
      type: 'delete-node',
      elementId: 'treeview-node:2',
    })
    expect(treeviewDeleteIntent(projection, { kind: 'treeview-node', elementId: 'treeview-node:99' })).toBeNull()
    expect(treeviewDeleteIntent(projection, null)).toBeNull()
  })

  it('带修饰键（Shift-Tab）/ 别种选中 / 无选中 → null', () => {
    expect(treeviewKeyPlan(projection, { key: 'Tab', mods: { shift: true }, selection: DIR_SEL })).toBeNull()
    expect(treeviewKeyPlan(projection, { key: 'Tab', selection: { kind: 'diagram' } })).toBeNull()
    expect(treeviewKeyPlan(projection, { key: 'Tab', selection: null })).toBeNull()
  })
})

describe('treeView 画布寻址降级（research §4 实测：渲染器无 data-id 且 0 处 .attr(id)）', () => {
  const projection = { type: 'treeview' as const, treeview: projectionOf(SOURCE) }
  const caps = capabilitiesOf(projection)

  it('八项能力齐备且无 edgeAnnotator / nodeAnnotator（无连线的图种不实现）', () => {
    expect(caps).toBe(treeviewCanvasCapabilities)
    expect(typeof caps.resolveSelection).toBe('function')
    expect(typeof caps.deleteIntent).toBe('function')
    expect(caps.edgeAnnotator).toBeUndefined()
    expect(caps.nodeAnnotator).toBeUndefined()
    expect(caps.keyboardProjection(projection)).toEqual({ kind: 'treeview', projection: projection.treeview })
  })

  it('resolver / toSelection / canvasIdOf / navigationIds 全部安静返回空', () => {
    expect(caps.dataIdResolver(projection)('anything')).toBeNull()
    expect(caps.toSelection({ kind: 'node', id: 'x' })).toBeNull()
    expect(caps.canvasIdOf(projection, DIR_SEL)).toBeNull()
    expect(caps.navigationIds(projection)).toEqual([])
  })

  it('fromCanvasId / menuTargetOfCanvas：画布选中与节点菜单目标均不产生', () => {
    expect(fromCanvasId('treeview', { kind: 'node', id: 'x' })).toBeNull()
    expect(menuTargetOfCanvas('treeview', { kind: 'node', id: 'x' })).toBeNull()
    expect(contextMenuTargetFromSelection({ kind: 'node', id: 'x' }, 'treeview')).toBeNull()
  })

  it('右键空白菜单 = 加根节点', () => {
    expect(contextMenuItems({ kind: 'blank', diagramType: 'treeview' })).toEqual(['add-treeview-root'])
  })

  it('add-treeview-root：追加到末个顶层节点之后并选中新节点', () => {
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
    MENU_ACTIONS['add-treeview-root'](ctx, { kind: 'blank', diagramType: 'treeview' })
    // 末个顶层节点 = `/`（treeview-node:1），其子树末尾 = README.md（平铺下标 5）→ 新节点序号 7
    expect(intents).toEqual([
      { type: 'add-sibling', elementId: 'treeview-node:1', name: '新目录', isDirectory: true },
    ])
    expect(selected).toEqual({ kind: 'treeview-node', elementId: 'treeview-node:7' })
    expect(closed).toBe(1)
  })

  it('add-treeview-root：空树时落在 header 之后（父为空串占位）', () => {
    const bare = { type: 'treeview' as const, treeview: projectionOf('treeView-beta\n') }
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
    MENU_ACTIONS['add-treeview-root'](ctx, { kind: 'blank', diagramType: 'treeview' })
    expect(intents).toEqual([
      { type: 'add-child', parentElementId: '', name: '新目录', isDirectory: true },
    ])
  })
})

describe('treeView 注册表接线（穷尽性）', () => {
  it('DIAGRAM_TYPES.treeview：模板自识别 + 投影包装同名字段 + 大小写敏感', () => {
    const registration = DIAGRAM_TYPES.treeview
    expect(registration.detect('treeView-beta\n/\n')).toBe(true)
    // Langium 关键字大小写敏感（research §1）——错误大小写不认领
    expect(registration.detect('TREEVIEW-BETA\n/\n')).toBe(false)
    expect(registration.detect('treeview-beta\n/\n')).toBe(false)
    const parsed = registration.parser.parse(registration.template)
    if (!parsed.ok) throw new Error('模板必须可解析')
    const projection = registration.buildProjection(parsed.doc)
    expect(projection.type).toBe('treeview')
    expect((projection as { treeview: unknown }).treeview).toBeDefined()
  })
})
