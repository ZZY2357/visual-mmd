import { describe, expect, it, vi } from 'vitest'
import { MENU_ACTIONS, createElement, type MenuActionContext } from '../menu-actions'
import { contextMenuItems, type ContextMenuTarget } from '../context-menu'
import { flowchartParser } from '../../pipeline/flowchart'
import { mindmapParser } from '../../pipeline/mindmap'
import { classParser } from '../../pipeline/class'
import { sequenceParser } from '../../pipeline/sequence'
import { buildFlowchartProjection } from '../../projection/flowchart-projection'
import { buildMindmapProjection } from '../../projection/mindmap-projection'
import { buildClassProjection } from '../../projection/class-projection'
import { buildSequenceProjection } from '../../projection/sequence-projection'
import type { AnyProjection } from '../../diagram-registry'
import type { EditIntent } from '../../pipeline/parser'
import type { Selection } from '../../projection/selection'
import type { CanvasInlineEditTarget } from '../inline-edit'

/**
 * 菜单动作接缝（architecture-deepening-2 工单 01）：动作实现消费窄的 MenuActionContext，
 * 语境用测试替身注入，**脱离渲染 Hook 即可单测分发**。语义与原 use-canvas-context-menu
 * 的方法逐条等价（用户可见行为零变化；Hook 侧行为由 use-canvas-context-menu.test.tsx 护栏）。
 */

const FLOW = `flowchart TD
    A[开始] --> B[处理]
`
const MINDMAP = `mindmap
  root((中心))
    分支A
`
const CLASS = `classDiagram
    class Foo
    class Bar
    Foo --> Bar
`
const SEQUENCE = `sequenceDiagram
    participant 甲
    participant 乙
    甲->>乙: hi
    Note over 甲: 备注行
    loop 循环
        甲->>乙: 轮询
    end
`

function flowProjectionOf(source: string): AnyProjection {
  const parsed = flowchartParser.parse(source)
  if (!parsed.ok) throw new Error(parsed.error.message)
  return { type: 'flowchart' as const, flowchart: buildFlowchartProjection(parsed.doc) }
}
function mindProjectionOf(source: string): AnyProjection {
  const parsed = mindmapParser.parse(source)
  if (!parsed.ok) throw new Error(parsed.error.message)
  return { type: 'mindmap' as const, mindmap: buildMindmapProjection(parsed.doc) }
}
function classProjectionOf(source: string): AnyProjection {
  const parsed = classParser.parse(source)
  if (!parsed.ok) throw new Error(parsed.error.message)
  return { type: 'class' as const, class: buildClassProjection(parsed.doc) }
}
function seqProjectionOf(source: string): AnyProjection {
  const parsed = sequenceParser.parse(source)
  if (!parsed.ok) throw new Error(parsed.error.message)
  return { type: 'sequence' as const, sequence: buildSequenceProjection(parsed.doc) }
}

/** 语境替身：记录 commitIntent / select / beginInlineEdit / close 的调用 */
function fakeCtx(overrides: Partial<MenuActionContext> = {}): MenuActionContext & {
  intents: EditIntent[]
  selections: (Selection | null)[]
  inlineEdits: CanvasInlineEditTarget[]
  closed: number
} {
  const intents: EditIntent[] = []
  const selections: (Selection | null)[] = []
  const inlineEdits: CanvasInlineEditTarget[] = []
  let closed = 0
  return {
    intents,
    selections,
    inlineEdits,
    get closed() {
      return closed
    },
    projection: null,
    selection: null,
    commitIntent: (intent) => {
      intents.push(intent)
      return true
    },
    select: (selection) => selections.push(selection),
    openForm: vi.fn(),
    openStyleForm: vi.fn(),
    beginInlineEdit: (target) => inlineEdits.push(target),
    enterLinkMode: vi.fn(),
    newNodeText: '新节点',
    close: () => {
      closed += 1
    },
    ...overrides,
  }
}

describe('MENU_ACTIONS 穷尽性（工单 05 → 工单 01）', () => {
  it('MENU_ACTIONS 键集合与 contextMenuItems 能返回的可达 id 并集一致（防止菜单能显示但点了没反应）', () => {
    // 穷举 contextMenuItems 定义里出现过的全部目标形状（blank 按四种图种各来一次）
    const allTargets: ContextMenuTarget[] = [
      { kind: 'blank', diagramType: 'flowchart' },
      { kind: 'blank', diagramType: 'sequence' },
      { kind: 'blank', diagramType: 'class' },
      { kind: 'blank', diagramType: 'mindmap' },
      { kind: 'flowchart-node', nodeId: 'n1' },
      { kind: 'flowchart-edge', from: 'a', to: 'b', occurrence: 0 },
      { kind: 'mindmap-node', elementId: 'm1' },
      { kind: 'class-node', name: 'A' },
      { kind: 'sequence-participant', actorId: 'p1' },
      { kind: 'class-relation', elementId: 'relation:1' },
      { kind: 'sequence-message', elementId: 'message:1' },
      { kind: 'sequence-note', elementId: 'note:1' },
      { kind: 'sequence-block', elementId: 'block:1' },
      { kind: 'blank', diagramType: 'state' },
      { kind: 'state-node', id: 's1', composite: false },
      { kind: 'state-node', id: 'comp', composite: true },
      { kind: 'state-transition', elementId: 'transition:1' },
      { kind: 'blank', diagramType: 'er' },
      { kind: 'er-entity', name: 'E1' },
      { kind: 'er-relation', elementId: 'relation:1' },
      { kind: 'er-attribute', elementId: 'attr:1' },
      // gitGraph（more-diagrams 工单 04）：画布 DOM 无 data-id（实测降级），只有空白添加入口
      { kind: 'blank', diagramType: 'gitgraph' },
      // requirement（more-diagrams 工单 07）：空白添加入口 + 两类节点 + 关系边
      { kind: 'blank', diagramType: 'requirement' },
      { kind: 'requirement-node', name: 'login' },
      { kind: 'requirement-element', name: 'ui' },
      { kind: 'requirement-relation', elementId: 'relation:0' },
    ]
    const reachableIds = new Set(allTargets.flatMap((target) => contextMenuItems(target)))
    // apply-style 不经 onMenuItem 分发（CanvasPanel 渲染成子菜单开关，点样式名直接调
    // Hook 的 applyStyle）——语境化后此不可达条目从动作表中移除（工单 01）
    reachableIds.delete('apply-style')
    const actionIds = new Set(Object.keys(MENU_ACTIONS))

    expect(actionIds).toEqual(reachableIds)
  })

  it('apply-style 不在动作表里（仅为子菜单开关存在，不再是类型穷尽性占位条目）', () => {
    expect(Object.keys(MENU_ACTIONS)).not.toContain('apply-style')
  })
})

describe('createElement（工单 01：五个「创建 + 选中 + 内联命名」变体的唯一实现）', () => {
  it('flowchart 空白：落码矩形节点、选中并进入内联命名、关菜单', () => {
    const ctx = fakeCtx({ projection: flowProjectionOf(FLOW) })

    MENU_ACTIONS['add-node'](ctx, { kind: 'blank', diagramType: 'flowchart' })

    expect(ctx.intents).toEqual([{ type: 'add-node', nodeId: 'n1', text: 'n1', shape: 'rectangle' }])
    expect(ctx.selections).toEqual([{ kind: 'node', nodeId: 'n1' }])
    expect(ctx.inlineEdits).toEqual([{ kind: 'flowchart', nodeId: 'n1' }])
    expect(ctx.closed).toBe(1)
  })

  it('class 空白：默认名「新类」避重（可引用名语义），选中并内联命名类名', () => {
    const ctx = fakeCtx({ projection: classProjectionOf(CLASS) })

    MENU_ACTIONS['add-class'](ctx, { kind: 'blank', diagramType: 'class' })

    expect(ctx.intents).toEqual([{ type: 'add-class', name: '新类' }])
    expect(ctx.selections).toEqual([{ kind: 'class', name: '新类' }])
    expect(ctx.inlineEdits).toEqual([{ kind: 'class', name: '新类' }])
    expect(ctx.closed).toBe(1)
  })

  it('sequence 空白：默认名「新参与者」（不带 alias），选中并内联命名参与者 id', () => {
    const ctx = fakeCtx({ projection: seqProjectionOf(SEQUENCE) })

    MENU_ACTIONS['add-participant'](ctx, { kind: 'blank', diagramType: 'sequence' })

    expect(ctx.intents).toEqual([{ type: 'add-participant', actorId: '新参与者' }])
    expect(ctx.selections).toEqual([{ kind: 'participant', actorId: '新参与者' }])
    expect(ctx.inlineEdits).toEqual([{ kind: 'sequence', actorId: '新参与者' }])
    expect(ctx.closed).toBe(1)
  })

  it('mindmap 空白（空文档）：add-child 无父建根（elementId 必为 mindmap-node:1）', () => {
    const ctx = fakeCtx({ projection: mindProjectionOf('mindmap\n') })

    MENU_ACTIONS['add-root'](ctx, { kind: 'blank', diagramType: 'mindmap' })

    expect(ctx.intents).toEqual([{ type: 'add-child', text: '新节点' }])
    expect(ctx.selections).toEqual([{ kind: 'mindmap-node', elementId: 'mindmap-node:1' }])
    expect(ctx.inlineEdits).toEqual([{ kind: 'mindmap', elementId: 'mindmap-node:1' }])
    expect(ctx.closed).toBe(1)
  })

  it('mindmap 节点目标：add-child 挂为该节点的子节点（与 add-root 同一实现，参数化在目标上）', () => {
    const proj = mindProjectionOf(MINDMAP)
    if (proj.type !== 'mindmap') throw new Error('unreachable')
    const branch = proj.mindmap.nodes.find((n) => n.elementId === 'mindmap-node:2')
    expect(branch).toBeDefined()
    const ctx = fakeCtx({ projection: proj })

    MENU_ACTIONS['add-child'](ctx, { kind: 'mindmap-node', elementId: 'mindmap-node:2' })

    // 意图由 mindmapActionIntents 产出（锚点回退约定在 pipeline 层）；此处只验「三步编排」
    expect(ctx.intents[0]).toMatchObject({ type: 'add-child', text: '新节点' })
    expect(ctx.selections[0]).toMatchObject({ kind: 'mindmap-node' })
    expect(ctx.inlineEdits[0]).toMatchObject({ kind: 'mindmap' })
    expect(ctx.closed).toBe(1)
  })

  it('commitIntent 被拒绝（false）时中止：不选中、不内联命名、不关菜单', () => {
    const ctx = fakeCtx({ projection: flowProjectionOf(FLOW), commitIntent: () => false })

    createElement(ctx, { kind: 'blank', diagramType: 'flowchart' })

    expect(ctx.selections).toEqual([])
    expect(ctx.inlineEdits).toEqual([])
    expect(ctx.closed).toBe(0)
  })

  it('投影未就绪（null）时安静地不执行', () => {
    const ctx = fakeCtx({ projection: null })

    createElement(ctx, { kind: 'blank', diagramType: 'flowchart' })

    expect(ctx.intents).toEqual([])
    expect(ctx.closed).toBe(0)
  })
})

describe('删除组与连线菜单（分发语义）', () => {
  it('delete 组 6 项 + delete 共用 deleteTarget：按目标种类映射意图、清空选中、关菜单', () => {
    const cases: Array<{
      id: keyof typeof MENU_ACTIONS
      target: ContextMenuTarget
      intent: Record<string, unknown>
      projection: AnyProjection
    }> = [
      {
        id: 'delete',
        target: { kind: 'flowchart-node', nodeId: 'A' },
        intent: { type: 'delete-node', nodeId: 'A' },
        projection: flowProjectionOf(FLOW),
      },
      {
        id: 'delete',
        target: { kind: 'flowchart-edge', from: 'A', to: 'B', occurrence: 1 },
        intent: { type: 'delete-edge', from: 'A', to: 'B', occurrence: 1 },
        projection: flowProjectionOf(FLOW),
      },
      {
        id: 'delete',
        target: { kind: 'mindmap-node', elementId: 'mindmap-node:2' },
        intent: { type: 'delete-node', elementId: 'mindmap-node:2' },
        projection: mindProjectionOf(MINDMAP),
      },
      {
        id: 'delete-class',
        target: { kind: 'class-node', name: 'Foo' },
        intent: { type: 'delete-class', name: 'Foo' },
        projection: classProjectionOf(CLASS),
      },
      {
        id: 'delete-participant',
        target: { kind: 'sequence-participant', actorId: '甲' },
        intent: { type: 'delete-participant', actorId: '甲' },
        projection: seqProjectionOf(SEQUENCE),
      },
      {
        id: 'delete-relation',
        target: { kind: 'class-relation', elementId: 'relation:1' },
        intent: { type: 'delete-relation', elementId: 'relation:1' },
        projection: classProjectionOf(CLASS),
      },
      {
        id: 'delete-message',
        target: { kind: 'sequence-message', elementId: 'message:1' },
        intent: { type: 'delete-message', elementId: 'message:1' },
        projection: seqProjectionOf(SEQUENCE),
      },
      {
        id: 'delete-note',
        target: { kind: 'sequence-note', elementId: 'note:1' },
        intent: { type: 'delete-note', elementId: 'note:1' },
        projection: seqProjectionOf(SEQUENCE),
      },
      {
        id: 'delete-block',
        target: { kind: 'sequence-block', elementId: 'block:1' },
        intent: { type: 'delete-block', elementId: 'block:1' },
        projection: seqProjectionOf(SEQUENCE),
      },
    ]
    for (const { id, target, intent, projection } of cases) {
      // deleteTarget 经能力包 deleteIntent（architecture-deepening-2 工单 03）：需要投影做存在性校验
      const ctx = fakeCtx({ projection })
      MENU_ACTIONS[id](ctx, target)
      expect(ctx.intents).toHaveLength(1)
      expect(ctx.intents[0]).toMatchObject(intent)
      expect(ctx.selections).toEqual([null])
      expect(ctx.closed).toBe(1)
    }
  })

  it('目标已不在投影（能力包 deleteIntent → null）时安静地不落码，仍清空选中并关菜单', () => {
    const ctx = fakeCtx({ projection: classProjectionOf(CLASS) })
    MENU_ACTIONS['delete-class'](ctx, { kind: 'class-node', name: '__不存在__' })
    expect(ctx.intents).toEqual([])
    expect(ctx.selections).toEqual([null])
    expect(ctx.closed).toBe(1)
  })

  it('无菜单目标（undefined）时 delete 安静地不执行', () => {
    const ctx = fakeCtx()
    MENU_ACTIONS.delete(ctx, undefined)
    expect(ctx.intents).toEqual([])
    expect(ctx.closed).toBe(0)
  })

  it('cycle-relation-kind：取 RELATION_KIND_OPTIONS 中当前的下一项直接落码，菜单保持打开', () => {
    const ctx = fakeCtx({ projection: classProjectionOf(CLASS) })

    MENU_ACTIONS['cycle-relation-kind'](ctx, { kind: 'class-relation', elementId: 'relation:1' })

    expect(ctx.intents).toEqual([{ type: 'set-relation', elementId: 'relation:1', kind: '..>' }])
    expect(ctx.closed).toBe(0)
  })

  it('cycle-message-arrow：取 MESSAGE_ARROW_OPTIONS 中当前的下一项直接落码，菜单保持打开', () => {
    const ctx = fakeCtx({ projection: seqProjectionOf(SEQUENCE) })

    MENU_ACTIONS['cycle-message-arrow'](ctx, { kind: 'sequence-message', elementId: 'message:1' })

    expect(ctx.intents).toEqual([{ type: 'set-message', elementId: 'message:1', arrow: '-->' }])
    expect(ctx.closed).toBe(0)
  })
})

describe('编辑类与添加表单类菜单项（分发语义）', () => {
  it('edit-label / edit-relation / edit-message（D5）：选中该连线 + 关菜单，自身不落码', () => {
    for (const id of ['edit-label', 'edit-relation', 'edit-message'] as const) {
      const ctx = fakeCtx()
      const target: ContextMenuTarget =
        id === 'edit-label'
          ? { kind: 'flowchart-edge', from: 'A', to: 'B', occurrence: 1 }
          : id === 'edit-relation'
            ? { kind: 'class-relation', elementId: 'relation:1' }
            : { kind: 'sequence-message', elementId: 'message:1' }

      MENU_ACTIONS[id](ctx, target)

      expect(ctx.intents).toEqual([])
      expect(ctx.selections).toHaveLength(1)
      expect(ctx.selections[0]).not.toBeNull()
      expect(ctx.closed).toBe(1)
    }
  })

  it('edit-text：flowchart 节点 / mindmap 节点进入内联编辑并关菜单；其余目标只关菜单', () => {
    const flowCtx = fakeCtx()
    MENU_ACTIONS['edit-text'](flowCtx, { kind: 'flowchart-node', nodeId: 'A' })
    expect(flowCtx.inlineEdits).toEqual([{ kind: 'flowchart', nodeId: 'A' }])
    expect(flowCtx.intents).toEqual([])
    expect(flowCtx.closed).toBe(1)

    const mindCtx = fakeCtx()
    MENU_ACTIONS['edit-text'](mindCtx, { kind: 'mindmap-node', elementId: 'mindmap-node:2' })
    expect(mindCtx.inlineEdits).toEqual([{ kind: 'mindmap', elementId: 'mindmap-node:2' }])

    const otherCtx = fakeCtx()
    MENU_ACTIONS['edit-text'](otherCtx, { kind: 'class-node', name: 'Foo' })
    expect(otherCtx.inlineEdits).toEqual([])
    expect(otherCtx.closed).toBe(1)
  })

  it('add-member / add-relation / add-message / add-note / add-block：转 openForm 对应表单种类', () => {
    for (const [id, kind] of [
      ['add-member', 'member'],
      ['add-relation', 'relation'],
      ['add-message', 'message'],
      ['add-note', 'note'],
      ['add-block', 'block'],
    ] as const) {
      const openForm = vi.fn()
      const ctx = fakeCtx({ openForm })

      MENU_ACTIONS[id](ctx, { kind: 'class-node', name: 'Foo' })

      expect(openForm).toHaveBeenCalledWith(kind)
      expect(ctx.intents).toEqual([])
    }
  })

  it('add-subgraph：落码 add-subgraph 意图并关菜单', () => {
    const ctx = fakeCtx()
    MENU_ACTIONS['add-subgraph'](ctx, { kind: 'blank', diagramType: 'flowchart' })
    expect(ctx.intents).toEqual([{ type: 'add-subgraph' }])
    expect(ctx.closed).toBe(1)
  })

  it('link-mode：进入连线模式并收起浮层；link-from-here 仅在 flowchart 节点目标上带预选起点', () => {
    const blankCtx = fakeCtx()
    MENU_ACTIONS['link-mode'](blankCtx, { kind: 'blank', diagramType: 'flowchart' })
    expect(blankCtx.enterLinkMode).toHaveBeenCalled()

    const nodeCtx = fakeCtx()
    MENU_ACTIONS['link-from-here'](nodeCtx, { kind: 'flowchart-node', nodeId: 'A' })
    expect(nodeCtx.enterLinkMode).toHaveBeenCalledWith('A')

    const edgeCtx = fakeCtx()
    MENU_ACTIONS['link-from-here'](edgeCtx, { kind: 'flowchart-edge', from: 'A', to: 'B', occurrence: 1 })
    expect(edgeCtx.enterLinkMode).not.toHaveBeenCalled()
  })
})
