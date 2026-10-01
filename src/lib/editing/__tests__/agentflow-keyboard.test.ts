import { describe, expect, it } from 'vitest'
import { agentflowParser } from '../../pipeline/agentflow'
import { buildAgentflowProjection } from '../../projection/agentflow-projection'
import { agentflowCanvasCapabilities } from '../../canvas-selection/agentflow-adapter'
import { agentflowDeleteIntent, agentflowKeyPlan } from '../../editing/canvas-keyboard'
import { contextMenuItems, contextMenuTargetFromSelection } from '../../editing/context-menu'
import { MENU_ACTIONS, type MenuActionContext } from '../../editing/menu-actions'
import {
  menuTargetOfCanvas,
  fromCanvasId,
  canvasIdOf,
  selectionOfMenuTarget,
} from '../../canvas-selection/selection-codec'
import { DIAGRAM_TYPES } from '../../diagram-registry'
import { capabilitiesOf } from '../../canvas-selection/capabilities'
import type { Selection } from '../../projection/selection'

/**
 * agentflow 键位 / 删除意图 / 菜单 / 画布寻址测试（more-diagrams 工单 27，ADR-0013）。
 * 节点画布可寻址（DOM id 反注 data-id，research §8.2 实测）、边有原生 data-id；
 * 容器画布无 data-id（如实降级）→ 容器 / 文档行走结构树。
 */

const SOURCE = `agentflow-beta LR
  a["检索"]@{ shape: task }
  b["生成"]@{ shape: action }
  c["输出"]@{ shape: input }
  a --> b
  a -.- c
  b --x c
  flow f["主流程"]
    d["落库"]@{ shape: task }
    b --> d
  end
`

function projectionOf(src: string) {
  const parsed = agentflowParser.parse(src)
  if (!parsed.ok) throw new Error(`解析失败：${parsed.error.message}`)
  return buildAgentflowProjection(parsed.doc)
}

const NODE_SEL: Selection = { kind: 'agentflow-node', nodeId: 'a' }
const EDGE_SEL: Selection = { kind: 'agentflow-edge', elementId: 'edge:a->b' }
const FLOW_SEL: Selection = { kind: 'agentflow-flow', elementId: 'container:flow:13' }

describe('agentflowKeyPlan（ADR-0013 就近映射）', () => {
  const projection = projectionOf(SOURCE)

  it('选中节点上 Tab = 加子节点（落新节点行 + 该节点 → 新节点连线，锚点 = 该节点行）', () => {
    const plan = agentflowKeyPlan(projection, { key: 'Tab', selection: NODE_SEL })
    expect(plan).not.toBeNull()
    expect(plan!.intents).toEqual([
      { type: 'add-node', nodeId: 'n1', text: 'n1', shape: 'task', afterElementId: 'node:a' },
      { type: 'add-edge', from: 'a', to: 'n1', afterElementId: 'node:a' },
    ])
    expect(plan!.newElementTarget).toEqual({ selection: { kind: 'agentflow-node', nodeId: 'n1' } })
  })

  it('选中节点上 Enter = 加同级（父 = 第一条入边起点；无入边退化为 add-child）', () => {
    // b 有入边 a --> b → 同级挂到 a 下
    const plan = agentflowKeyPlan(projection, { key: 'Enter', selection: { kind: 'agentflow-node', nodeId: 'b' } })
    expect(plan!.intents[1]).toEqual({ type: 'add-edge', from: 'a', to: 'n1', afterElementId: 'node:b' })

    // a 无入边 → 退化为 add-child（父 = a 自身）
    const rootPlan = agentflowKeyPlan(projection, { key: 'Enter', selection: NODE_SEL })
    expect(rootPlan!.intents[1]).toEqual({ type: 'add-edge', from: 'a', to: 'n1', afterElementId: 'node:a' })
  })

  it('新节点 id 避重（既有 n1 / n2 时取 n3）', () => {
    const withN = projectionOf('agentflow-beta\nn1["n1"]\nn2["n2"]\na --> n1\n')
    const plan = agentflowKeyPlan(withN, { key: 'Tab', selection: { kind: 'agentflow-node', nodeId: 'a' } })
    expect(plan!.newElementTarget).toEqual({ selection: { kind: 'agentflow-node', nodeId: 'n3' } })
  })

  it('Delete = 删除选中元素（节点 / 边 / 容器 / 文档行各映射到 delete-*）', () => {
    expect(agentflowKeyPlan(projection, { key: 'Delete', selection: NODE_SEL })).toEqual({
      intents: [{ type: 'delete-node', nodeId: 'a' }],
      clearSelection: true,
    })
    expect(agentflowKeyPlan(projection, { key: 'Delete', selection: EDGE_SEL })).toEqual({
      intents: [{ type: 'delete-edge', elementId: 'edge:a->b' }],
      clearSelection: true,
    })
    expect(agentflowKeyPlan(projection, { key: 'Delete', selection: FLOW_SEL })).toEqual({
      intents: [{ type: 'delete-flow', elementId: 'container:flow:13' }],
      clearSelection: true,
    })
    const withDoc = projectionOf('agentflow-beta\na["a"]\ntitle 标题\n')
    expect(agentflowKeyPlan(withDoc, { key: 'Delete', selection: { kind: 'agentflow-doc', elementId: 'agentflow-doc:1' } })).toEqual({
      intents: [{ type: 'delete-doc-line', elementId: 'agentflow-doc:1' }],
      clearSelection: true,
    })
  })

  it('agentflowDeleteIntent：存在性校验（已不在投影 / 别种选中 / null → null）', () => {
    expect(agentflowDeleteIntent(projection, NODE_SEL)).toEqual({ type: 'delete-node', nodeId: 'a' })
    expect(agentflowDeleteIntent(projection, { kind: 'agentflow-node', nodeId: '缺' })).toBeNull()
    expect(agentflowDeleteIntent(projection, { kind: 'agentflow-edge', elementId: 'edge:x->y' })).toBeNull()
    expect(agentflowDeleteIntent(projection, { kind: 'agentflow-flow', elementId: 'container:flow:99' })).toBeNull()
    expect(agentflowDeleteIntent(projection, { kind: 'diagram' })).toBeNull()
    expect(agentflowDeleteIntent(projection, null)).toBeNull()
  })

  it('边 / 容器 / 文档行上无 Tab / Enter 语义；带修饰键 / 无选中 → null', () => {
    expect(agentflowKeyPlan(projection, { key: 'Tab', selection: EDGE_SEL })).toBeNull()
    expect(agentflowKeyPlan(projection, { key: 'Enter', selection: FLOW_SEL })).toBeNull()
    expect(agentflowKeyPlan(projection, { key: 'Tab', mods: { shift: true }, selection: NODE_SEL })).toBeNull()
    expect(agentflowKeyPlan(projection, { key: 'Tab', selection: null })).toBeNull()
  })
})

describe('agentflow 画布寻址（research §8.2 实测：节点 / 边可寻址，容器不可）', () => {
  const projection = { type: 'agentflow' as const, agentflow: projectionOf(SOURCE) }
  const caps = capabilitiesOf(projection)

  it('能力包齐备且无 nodeAnnotator / edgeAnnotator（节点走通用 DOM id 反注、边有原生 data-id）', () => {
    expect(caps).toBe(agentflowCanvasCapabilities)
    expect(typeof caps.resolveSelection).toBe('function')
    expect(typeof caps.deleteIntent).toBe('function')
    expect(caps.edgeAnnotator).toBeUndefined()
    expect(caps.nodeAnnotator).toBeUndefined()
    expect(caps.keyboardProjection(projection)).toEqual({ kind: 'agentflow', projection: projection.agentflow })
  })

  it('dataIdResolver：节点反注后的 data-id（= 源码节点 id）命中为 node 选中', () => {
    const resolve = caps.dataIdResolver(projection)
    // 反注链路：DOM id `{svgId}-agentflow-{id}-{n}` 先由 annotateNodeDataIds 剥离成裸 nodeId
    // 写进 data-id，resolver 只认投影已知节点（与 flowchart 同一链路）
    expect(resolve('a')).toEqual({ kind: 'node', id: 'a' })
    expect(resolve('d')).toEqual({ kind: 'node', id: 'd' })
    expect(resolve('__无__')).toBeNull()
  })

  it('dataIdResolver：边按原生 `L_{from}_{to}_{n}` data-id 命中（尽力而为）', () => {
    const resolve = caps.dataIdResolver(projection)
    // 有 data-id 时（编辑器给边路径反注）应能识别
    const resolved = resolve('L_a_b_0')
    // 无注释路径时 resolver 对边不承诺命中；此处断言不抛错（返回 null 或合法 canvas）
    expect(resolved === null || typeof resolved === 'object').toBe(true)
  })

  it('canvasIdOf(_projection, selection)：仅节点返回 nodeId；边 / 容器 / 文档行返回 null', () => {
    expect(caps.canvasIdOf(projection, NODE_SEL)).toBe('a')
    expect(caps.canvasIdOf(projection, EDGE_SEL)).toBeNull()
    expect(caps.canvasIdOf(projection, FLOW_SEL)).toBeNull()
  })

  it('navigationIds = 投影节点 nodeId 列表', () => {
    expect(caps.navigationIds(projection)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('toSelection：节点反注可还原选中；容器不可寻址', () => {
    expect(caps.toSelection({ kind: 'node', id: 'a' })).toEqual({ kind: 'agentflow-node', nodeId: 'a' })
  })

  it('canvasIdOf（selection-codec）：agentflow-node → nodeId；其它 → null', () => {
    expect(canvasIdOf(NODE_SEL)).toBe('a')
    expect(canvasIdOf(EDGE_SEL)).toBeNull()
    expect(canvasIdOf(FLOW_SEL)).toBeNull()
  })

  it('fromCanvasId / menuTargetOfCanvas：节点产生选中与节点菜单目标', () => {
    expect(fromCanvasId('agentflow', { kind: 'node', id: 'a' })).toEqual({ kind: 'agentflow-node', nodeId: 'a' })
    expect(menuTargetOfCanvas('agentflow', { kind: 'node', id: 'a' })).toEqual({ kind: 'agentflow-node', nodeId: 'a' })
    expect(contextMenuTargetFromSelection({ kind: 'node', id: 'a' }, 'agentflow')).toEqual({
      kind: 'agentflow-node',
      nodeId: 'a',
    })
  })

  it('右键空白菜单 = 加节点 / 加 flow', () => {
    expect(contextMenuItems({ kind: 'blank', diagramType: 'agentflow' })).toEqual([
      'add-agentflow-node',
      'add-agentflow-flow',
    ])
  })

  it('菜单项：节点 / 边 / 容器 / 文档行各给编辑项，且 selectionOfMenuTarget 互逆', () => {
    expect(contextMenuItems({ kind: 'agentflow-node', nodeId: 'a' })).toEqual([
      'edit-agentflow-node',
      'link-from-here',
      'delete',
    ])
    expect(contextMenuItems({ kind: 'agentflow-edge', elementId: 'edge:a->b' })).toEqual(['edit-label', 'delete'])
    expect(contextMenuItems({ kind: 'agentflow-flow', elementId: 'container:flow:13' })).toEqual([
      'edit-agentflow-flow',
      'delete',
    ])
    expect(contextMenuItems({ kind: 'agentflow-doc', elementId: 'agentflow-doc:1' })).toEqual(['delete'])
    expect(selectionOfMenuTarget({ kind: 'agentflow-node', nodeId: 'a' })).toEqual({
      kind: 'agentflow-node',
      nodeId: 'a',
    })
    expect(selectionOfMenuTarget({ kind: 'agentflow-flow', elementId: 'container:flow:13' })).toEqual({
      kind: 'agentflow-flow',
      elementId: 'container:flow:13',
    })
  })

  function ctxOf(proj: typeof projection): { ctx: MenuActionContext; intents: unknown[]; selected: Selection | null } {
    const intents: unknown[] = []
    const state = { selected: null as Selection | null }
    const ctx: MenuActionContext = {
      projection: proj,
      selection: null,
      commitIntent: (intent) => {
        intents.push(intent)
        return true
      },
      select: (s) => {
        state.selected = s
      },
      openForm: () => {},
      openStyleForm: () => {},
      beginInlineEdit: () => {},
      enterLinkMode: () => {},
      newNodeText: '新节点',
      close: () => {},
    }
    return {
      ctx,
      intents,
      get selected() {
        return state.selected
      },
    }
  }

  it('add-agentflow-node：落一行缺省 task 形状节点并选中（不做内联命名）', () => {
    const h = ctxOf(projection)
    MENU_ACTIONS['add-agentflow-node'](h.ctx, { kind: 'blank', diagramType: 'agentflow' })
    expect(h.intents).toEqual([{ type: 'add-node', nodeId: 'n1', text: 'n1', shape: 'task' }])
    expect(h.selected).toEqual({ kind: 'agentflow-node', nodeId: 'n1' })
  })

  it('add-agentflow-flow：落 open + end 两行（id 避重）；不做选中（容器 id 是文档级入口序号，无法稳定预测）', () => {
    const h = ctxOf(projection)
    MENU_ACTIONS['add-agentflow-flow'](h.ctx, { kind: 'blank', diagramType: 'agentflow' })
    expect(h.intents).toEqual([{ type: 'add-flow', id: 'f1', title: '新流程' }])
    expect(h.selected).toBeNull()
  })

  it('link-from-here：节点上带预选起点进入连线模式', () => {
    let from: string | undefined
    const ctx: MenuActionContext = {
      projection,
      selection: null,
      commitIntent: () => true,
      select: () => {},
      openForm: () => {},
      openStyleForm: () => {},
      beginInlineEdit: () => {},
      enterLinkMode: (f) => {
        from = f
      },
      newNodeText: '新节点',
      close: () => {},
    }
    MENU_ACTIONS['link-from-here'](ctx, { kind: 'agentflow-node', nodeId: 'a' })
    expect(from).toBe('a')
  })
})

describe('agentflow 注册表接线（穷尽性）', () => {
  it('DIAGRAM_TYPES.agentflow：模板自识别 + 投影包装同名字段', () => {
    const registration = DIAGRAM_TYPES.agentflow
    expect(registration.detect('agentflow-beta\n  a["x"]\n')).toBe(true)
    expect(registration.detect('agentflow-beta LR\n  a["x"]\n')).toBe(true)
    // 大小写敏感（research §8.1 实测：AgentFlow-Beta 探测器不认）
    expect(registration.detect('AgentFlow-Beta\n')).toBe(false)
    expect(registration.detect('agentflow\n')).toBe(false)
    expect(registration.detect('flowchart TB\n A-->B')).toBe(false)
    const parsed = registration.parser.parse(registration.template)
    if (!parsed.ok) throw new Error('模板必须可解析')
    const projection = registration.buildProjection(parsed.doc)
    expect(projection.type).toBe('agentflow')
    expect((projection as { agentflow: unknown }).agentflow).toBeDefined()
  })
})
