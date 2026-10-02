import { describe, expect, it } from 'vitest'
import { architectureParser } from '../../pipeline/architecture'
import { buildArchitectureProjection } from '../../projection/architecture-projection'
import { architectureCanvasCapabilities } from '../../canvas-selection/architecture-adapter'
import { annotateArchitectureDataIds } from '../../canvas-selection/node-data-ids'
import { architectureDeleteIntent, architectureKeyPlan } from '../../pipeline/architecture-keyboard'
import { contextMenuItems, contextMenuTargetFromSelection } from '../context-menu'
import { MENU_ACTIONS, type MenuActionContext } from '../menu-actions'
import { menuTargetOfCanvas, fromCanvasId, selectionOfMenuTarget, canvasIdOf } from '../../canvas-selection/selection-codec'
import { DIAGRAM_TYPES } from '../../diagram-registry'
import { capabilitiesOf } from '../../canvas-selection/capabilities'
import type { EditIntent } from '../../pipeline/parser'
import type { Selection } from '../../projection/selection'

/**
 * architecture 键位 / 删除意图 / 菜单 / 画布寻址测试（more-diagrams 工单 17，ADR-0013）：
 * service 上 Tab = 同组加 service、Enter = 拉边（表单）、Delete = 删除；
 * 三类节点 DOM id 反注可寻址（renderer 源码证据），边不可寻址（降级，结构树 + 表单承接）。
 */

const SOURCE = `architecture-beta
    group platform(cloud)[平台]
    service web(server)[Web 服务]
    service db(database)[数据库] in platform
    junction j1

    web:R -- L:db
    web:B --> T:j1
`

function projectionOf(source: string) {
  const parsed = architectureParser.parse(source)
  if (!parsed.ok) throw new Error(`解析失败：${parsed.error.message}`)
  return buildArchitectureProjection(parsed.doc)
}

const projection = projectionOf(SOURCE)

describe('architectureKeyPlan（ADR-0013 就近映射）', () => {
  it('service 上 Tab = 同组加 service（锚点在选中声明之后），选中并内联编辑标题', () => {
    const plan = architectureKeyPlan(projection, {
      key: 'Tab',
      selection: { kind: 'architecture-service', name: 'db' },
    })
    expect(plan).not.toBeNull()
    expect(plan!.intents).toEqual([
      { type: 'add-service', id: 'service1', title: 'service1', parent: 'platform', afterElementId: 'service:db' },
    ])
    expect(plan!.newElementTarget).toEqual({
      selection: { kind: 'architecture-service', name: 'service1' },
      inlineEdit: { kind: 'architecture', elementKind: 'service', id: 'service1' },
    })
  })

  it('service 上 Enter = 打开加边表单（from 预选该 service）', () => {
    const plan = architectureKeyPlan(projection, {
      key: 'Enter',
      selection: { kind: 'architecture-service', name: 'web' },
    })
    expect(plan).toEqual({ intents: [], form: 'architecture-edge' })
  })

  it('Delete = 删除选中元素（唯一映射）：service / group / junction / 边 / align', () => {
    expect(
      architectureKeyPlan(projection, { key: 'Delete', selection: { kind: 'architecture-service', name: 'web' } }),
    ).toEqual({ intents: [{ type: 'delete-service', id: 'web' }], clearSelection: true })
    expect(
      architectureKeyPlan(projection, { key: 'Delete', selection: { kind: 'architecture-group', name: 'platform' } }),
    ).toEqual({ intents: [{ type: 'delete-group', id: 'platform' }], clearSelection: true })
    expect(
      architectureKeyPlan(projection, { key: 'Delete', selection: { kind: 'architecture-edge', elementId: 'edge:1' } }),
    ).toEqual({ intents: [{ type: 'delete-edge', elementId: 'edge:1' }], clearSelection: true })
  })

  it('无选中 / 别种选中 / group 上 Tab·Enter / Shift 修饰 → null（不 preventDefault）', () => {
    expect(architectureKeyPlan(projection, { key: 'Tab', selection: null })).toBeNull()
    expect(architectureKeyPlan(projection, { key: 'Tab', selection: { kind: 'architecture-group', name: 'platform' } })).toBeNull()
    expect(architectureKeyPlan(projection, { key: 'Enter', selection: { kind: 'node', nodeId: 'A' } })).toBeNull()
    expect(
      architectureKeyPlan(projection, {
        key: 'Tab',
        mods: { shift: true },
        selection: { kind: 'architecture-service', name: 'web' },
      }),
    ).toBeNull()
  })
})

describe('architectureDeleteIntent', () => {
  it('五类元素各映射到 delete-* 意图；已不在投影 / null / 别种选中 → null', () => {
    expect(architectureDeleteIntent(projection, { kind: 'architecture-junction', name: 'j1' })).toEqual({
      type: 'delete-junction',
      id: 'j1',
    })
    expect(architectureDeleteIntent(projection, { kind: 'architecture-service', name: 'GONE' })).toBeNull()
    expect(architectureDeleteIntent(projection, null)).toBeNull()
  })
})

describe('architecture 右键菜单', () => {
  it('空白 = 加 service / 加 group / 加 junction；service / group / junction / 边各有元素级菜单', () => {
    expect(contextMenuItems({ kind: 'blank', diagramType: 'architecture' })).toEqual([
      'add-architecture-service',
      'add-architecture-group',
      'add-architecture-junction',
    ])
    expect(contextMenuItems({ kind: 'architecture-service', name: 'web' })).toEqual([
      'edit-text',
      'edit-architecture-service',
      'link-from-here',
      'delete',
    ])
    expect(contextMenuItems({ kind: 'architecture-group', name: 'platform' })).toEqual(['edit-text', 'delete'])
    expect(contextMenuItems({ kind: 'architecture-junction', name: 'j1' })).toEqual(['delete'])
    expect(contextMenuItems({ kind: 'architecture-edge', elementId: 'edge:1' })).toEqual([
      'edit-architecture-edge',
      'delete',
    ])
  })

  it('画布节点选中（DOM id 反注）→ 菜单目标；边 element 不可命中（降级）', () => {
    expect(menuTargetOfCanvas('architecture', { kind: 'node', id: 'service:web' })).toEqual({
      kind: 'architecture-service',
      name: 'web',
    })
    expect(menuTargetOfCanvas('architecture', { kind: 'node', id: 'group:platform' })).toEqual({
      kind: 'architecture-group',
      name: 'platform',
    })
    expect(menuTargetOfCanvas('architecture', { kind: 'node', id: 'junction:j1' })).toEqual({
      kind: 'architecture-junction',
      name: 'j1',
    })
    expect(menuTargetOfCanvas('architecture', { kind: 'element', elementId: 'edge:1' })).toBeNull()
    expect(contextMenuTargetFromSelection({ kind: 'node', id: 'service:web' }, 'architecture')).toEqual({
      kind: 'architecture-service',
      name: 'web',
    })
  })

  it('fromCanvasId / selectionOfMenuTarget / canvasIdOf 与投影 elementId 互逆', () => {
    expect(fromCanvasId('architecture', { kind: 'node', id: 'service:web' })).toEqual({
      kind: 'architecture-service',
      name: 'web',
    })
    expect(selectionOfMenuTarget({ kind: 'architecture-service', name: 'web' })).toEqual({
      kind: 'architecture-service',
      name: 'web',
    })
    expect(canvasIdOf({ kind: 'architecture-group', name: 'platform' })).toBe('platform')
    expect(canvasIdOf({ kind: 'architecture-edge', elementId: 'edge:1' })).toBeNull()
  })
})

describe('architectureCanvasCapabilities（画布能力包）', () => {
  const wrapped = { type: 'architecture' as const, architecture: projection }
  const caps = architectureCanvasCapabilities

  it('节点可寻址：data-id = 源码 id → node（id = 投影 elementId）；未知 data-id 拒绝', () => {
    const resolver = caps.dataIdResolver(wrapped)
    expect(resolver('web')).toEqual({ kind: 'node', id: 'service:web' })
    expect(resolver('platform')).toEqual({ kind: 'node', id: 'group:platform' })
    expect(resolver('j1')).toEqual({ kind: 'node', id: 'junction:j1' })
    expect(resolver('GONE')).toBeNull()
    expect(caps.toSelection({ kind: 'node', id: 'service:web' })).toEqual({ kind: 'architecture-service', name: 'web' })
    // 导航 ↔ 选中 ↔ data-id 往返
    expect(caps.navigationIds(wrapped)).toEqual(['web', 'db', 'j1', 'platform'])
    expect(caps.canvasIdOf(wrapped, { kind: 'architecture-junction', name: 'j1' })).toBe('j1')
  })

  it('边不可寻址：不实现 edgeAnnotator；toSelection 对 element 恒 null', () => {
    expect(caps.edgeAnnotator).toBeUndefined()
    expect(caps.toSelection({ kind: 'element', elementId: 'edge:1' })).toBeNull()
    expect(caps.canvasIdOf(wrapped, { kind: 'architecture-edge', elementId: 'edge:1' })).toBeNull()
  })

  it('keyboardProjection 字段名与图种 id 同名；resolveSelection / deleteIntent / keyHandler 走投影', () => {
    expect(caps.keyboardProjection(wrapped)).toEqual({ kind: 'architecture', projection })
    expect(caps.resolveSelection(wrapped, { kind: 'architecture-service', name: 'web' })).toEqual({
      kind: 'architecture-service',
      name: 'web',
    })
    expect(caps.resolveSelection(wrapped, { kind: 'architecture-service', name: 'GONE' })).toBeNull()
    expect(caps.deleteIntent(wrapped, { kind: 'architecture-service', name: 'web' })).toEqual({
      type: 'delete-service',
      id: 'web',
    })
    expect(caps.keyHandler(wrapped)({ key: 'Delete', selection: { kind: 'architecture-service', name: 'web' } })).toEqual({
      intents: [{ type: 'delete-service', id: 'web' }],
      clearSelection: true,
    })
  })

  it('capabilitiesOf 查表命中 architecture 注册实例', () => {
    expect(capabilitiesOf(wrapped)).toBe(DIAGRAM_TYPES.architecture.canvas)
  })
})

describe('annotateArchitectureDataIds（DOM id 反注）', () => {
  const SVG = `<svg id="mmd-preview-1">
    <g class="architecture-service" id="mmd-preview-1-service-web"><path class="node-bkg" id="mmd-preview-1-node-web"></path><text>Web</text></g>
    <rect id="mmd-preview-1-node-j1"></rect>
    <path class="node-bkg" id="mmd-preview-1-group-platform"></path>
    <path class="edge" id="mmd-preview-1-L_web_db_0"></path>
  </svg>`

  function rootOf(svg: string): ParentNode {
    const host = document.createElement('div')
    host.innerHTML = svg
    return host
  }

  it('`-service-` / `-node-` / `-group-` 词元的 DOM id 反注成 data-id = 源码 id；边 path 不动', () => {
    const root = rootOf(SVG)
    annotateArchitectureDataIds(root)
    expect(root.querySelector('#mmd-preview-1-service-web')?.getAttribute('data-id')).toBe('web')
    expect(root.querySelector('#mmd-preview-1-node-web')?.getAttribute('data-id')).toBe('web')
    expect(root.querySelector('#mmd-preview-1-node-j1')?.getAttribute('data-id')).toBe('j1')
    expect(root.querySelector('#mmd-preview-1-group-platform')?.getAttribute('data-id')).toBe('platform')
    expect(root.querySelector('#mmd-preview-1-L_web_db_0')?.getAttribute('data-id')).toBeNull()
  })

  it('幂等：已有 data-id 不动；门卫不命中（无 .architecture-service）整体不反注', () => {
    const root = rootOf(SVG)
    annotateArchitectureDataIds(root)
    annotateArchitectureDataIds(root)
    expect(root.querySelectorAll('[data-id]')).toHaveLength(4)
    const plain = rootOf('<svg id="s"><rect id="s-node-x"></rect></svg>')
    annotateArchitectureDataIds(plain)
    expect(plain.querySelector('[data-id]')).toBeNull()
  })
})

describe('architecture 空白菜单动作', () => {
  function fakeCtx() {
    const intents: EditIntent[] = []
    const selections: (Selection | null)[] = []
    const inlineEdits: unknown[] = []
    let closed = 0
    const ctx: MenuActionContext = {
      projection: { type: 'architecture', architecture: projection },
      selection: null,
      commitIntent: (intent) => {
        intents.push(intent)
        return true
      },
      select: (s) => selections.push(s),
      openForm: () => {},
      openStyleForm: () => {},
      beginInlineEdit: (t) => inlineEdits.push(t),
      enterLinkMode: () => {},
      newNodeText: '新节点',
      close: () => {
        closed += 1
      },
    }
    return { ctx, intents, selections, inlineEdits, get closed() { return closed } }
  }

  it('add-architecture-service：自动避重命名 + 缺省标题（= id）+ 选中 + 内联命名 + 关菜单', () => {
    const f = fakeCtx()
    MENU_ACTIONS['add-architecture-service'](f.ctx, { kind: 'blank', diagramType: 'architecture' })
    expect(f.intents).toEqual([{ type: 'add-service', id: 'service1', title: 'service1' }])
    expect(f.selections).toEqual([{ kind: 'architecture-service', name: 'service1' }])
    expect(f.inlineEdits).toEqual([{ kind: 'architecture', elementKind: 'service', id: 'service1' }])
    expect(f.closed).toBe(1)
  })

  it('add-architecture-junction：只落码 + 选中（无标题，不进内联命名）', () => {
    const f = fakeCtx()
    MENU_ACTIONS['add-architecture-junction'](f.ctx, { kind: 'blank', diagramType: 'architecture' })
    expect(f.intents).toEqual([{ type: 'add-junction', id: 'junction1' }])
    expect(f.selections).toEqual([{ kind: 'architecture-junction', name: 'junction1' }])
    expect(f.inlineEdits).toEqual([])
    expect(f.closed).toBe(1)
  })
})
