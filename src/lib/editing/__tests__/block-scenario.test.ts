import { beforeEach, describe, expect, it } from 'vitest'
import mermaid from 'mermaid'
import { newDiagramLegacy, useEditorStore } from '../../../store/editor'
import { BLOCK_TEMPLATE, type AnyProjection } from '../../diagram-registry'
import { blockParser, type BlockIntent } from '../../pipeline/block'
import { buildBlockProjection, type BlockProjection } from '../../projection/block-projection'
import type { EditIntent } from '../../pipeline/parser'
import {
  applyPlan,
  type KeyInput,
  type KeyPlan,
} from '../canvas-keyboard'
import { blockDeleteIntent, blockKeyPlan } from '../../pipeline/block-keyboard'
import { inlineEditCommitOf } from '../inline-edit'
import { MENU_ACTIONS, type MenuActionContext } from '../menu-actions'

/**
 * block 键盘 / 内联编辑 / 菜单 / 端到端场景（more-diagrams 工单 09，ADR-0013 就近结构）：
 * - 键位语义：Delete = 删除、Tab = 同父加块（落码 + 选中 + 内联命名）、Enter = 边表单
 * - 双击只改标签（set-node-label；id 是语法标识不在此改）
 * - 菜单：空白加块节点（创建 + 内联命名）/ 空白加嵌套块 / 节点改标签 / 删除
 * - 端到端走真实 store 管线，终态被 mermaid v12 parse 通过
 */

function projectionOf(src = BLOCK_TEMPLATE): BlockProjection {
  const parsed = blockParser.parse(src)
  if (!parsed.ok) throw new Error(`解析失败：${parsed.error.message}`)
  return buildBlockProjection(parsed.doc)
}

const KEY = (over: Partial<KeyInput>): KeyInput => ({
  key: 'Tab',
  mods: {},
  selection: null,
  ...over,
})

describe('blockKeyPlan（ADR-0013 就近结构）', () => {
  const p = projectionOf()

  it('Delete：块节点 / 嵌套块 / 边 → blockDeleteIntent 唯一映射', () => {
    expect(blockKeyPlan(p, KEY({ key: 'Delete', selection: { kind: 'block-node', id: 'a' } }))?.intents).toEqual([
      { type: 'delete-node', id: 'a' },
    ])
    expect(blockKeyPlan(p, KEY({ key: 'Delete', selection: { kind: 'block-group', id: 'group1' } }))?.intents).toEqual([
      { type: 'delete-group', id: 'group1' },
    ])
    expect(blockKeyPlan(p, KEY({ key: 'Delete', selection: { kind: 'block-edge', elementId: 'edge:1' } }))?.intents).toEqual([
      { type: 'delete-edge', elementId: 'edge:1' },
    ])
    // 删除后清空选中（class/sequence 同口径）
    expect(blockKeyPlan(p, KEY({ key: 'Delete', selection: { kind: 'block-node', id: 'a' } }))?.clearSelection).toBe(true)
  })

  it('Tab：同父加块——顶层节点 → 同作用域新节点 + 内联命名；嵌套块 → 落进组内', () => {
    const node = p.nodes.find((n) => n.id === 'a')!
    const plan = blockKeyPlan(p, KEY({ selection: { kind: 'block-node', id: 'a' } }))
    expect(plan).not.toBeNull()
    // 新 id 由 nextFreeName 避重生成：base 'b' 已被占用 → 'b2'（referential 口径）
    expect(plan!.intents).toEqual([
      { type: 'add-node', id: 'b2', shape: 'square', label: 'b2', parentGroupId: null, afterElementId: node.elementId },
    ])
    expect(plan!.newElementTarget).toEqual({
      selection: { kind: 'block-node', id: 'b2' },
      inlineEdit: { kind: 'block-node', id: 'b2' },
    })

    const groupPlan = blockKeyPlan(p, KEY({ selection: { kind: 'block-group', id: 'group1' } }))
    expect(groupPlan).not.toBeNull()
    expect(groupPlan!.intents[0]).toMatchObject({ type: 'add-node', parentGroupId: 'group1' })
  })

  it('Tab：嵌套块内的节点 → 新节点落同一组（同父）', () => {
    const plan = blockKeyPlan(p, KEY({ selection: { kind: 'block-node', id: 'd' } }))
    expect(plan).not.toBeNull()
    expect(plan!.intents[0]).toMatchObject({ type: 'add-node', parentGroupId: 'group1' })
  })

  it('Enter：块节点 → 打开边表单（不直接落码）', () => {
    const plan = blockKeyPlan(p, KEY({ key: 'Enter', selection: { kind: 'block-node', id: 'a' } }))
    expect(plan).toEqual({ intents: [], form: 'block-edge' })
  })

  it('门外安静不处理：Shift 修饰 / 别种选中 / 已不存在的节点 / 边上的 Tab 与 Enter', () => {
    expect(blockKeyPlan(p, KEY({ mods: { shift: true }, selection: { kind: 'block-node', id: 'a' } }))).toBeNull()
    expect(blockKeyPlan(p, KEY({ selection: { kind: 'node', nodeId: 'a' } }))).toBeNull()
    expect(blockKeyPlan(p, KEY({ selection: { kind: 'block-node', id: '__无__' } }))).toBeNull()
    expect(blockKeyPlan(p, KEY({ selection: { kind: 'block-edge', elementId: 'edge:1' } }))).toBeNull()
    expect(blockKeyPlan(p, KEY({ key: 'Enter', selection: { kind: 'block-edge', elementId: 'edge:1' } }))).toBeNull()
    expect(blockKeyPlan(p, KEY({ key: 'ArrowLeft', selection: { kind: 'block-node', id: 'a' } }))).toBeNull()
  })

  it('plan 执行走唯一的 applyPlan（键盘 / 菜单 / 结构树共用编排放策略）', () => {
    const plan = blockKeyPlan(projectionOf(), KEY({ selection: { kind: 'block-node', id: 'a' } })) as KeyPlan
    const committed: EditIntent[] = []
    let selected: unknown = null
    let inline: string | null = null
    const ok = applyPlan(plan, {
      commitIntent: (intent) => {
        committed.push(intent)
        return true
      },
      select: (s) => {
        selected = s
      },
      beginInlineEdit: (t) => {
        inline = t.kind
      },
    })
    expect(ok).toBe(true)
    expect(committed).toHaveLength(1)
    expect(committed[0]).toMatchObject({ type: 'add-node', parentGroupId: null })
    expect(inline).toBe('block-node')
    expect(selected).toMatchObject({ kind: 'block-node' })
  })
})

describe('blockDeleteIntent（选中种类 → 删除意图的唯一映射）', () => {
  const p = projectionOf()

  it('三类选中各映射到既有 delete-* 意图；级联由管线负责', () => {
    expect(blockDeleteIntent(p, { kind: 'block-node', id: 'a' })).toEqual({ type: 'delete-node', id: 'a' })
    expect(blockDeleteIntent(p, { kind: 'block-group', id: 'group1' })).toEqual({ type: 'delete-group', id: 'group1' })
    expect(blockDeleteIntent(p, { kind: 'block-edge', elementId: 'edge:2' })).toEqual({ type: 'delete-edge', elementId: 'edge:2' })
  })

  it('已不存在 / null / 图表级 / 别种选中 → null', () => {
    expect(blockDeleteIntent(p, null)).toBeNull()
    expect(blockDeleteIntent(p, { kind: 'diagram' })).toBeNull()
    expect(blockDeleteIntent(p, { kind: 'block-node', id: '__无__' })).toBeNull()
    expect(blockDeleteIntent(p, { kind: 'node', nodeId: 'a' })).toBeNull()
  })
})

describe('block 内联编辑（双击只改标签）', () => {
  it('非空改动 → set-node-label；清空 → unchanged（去标签走属性表单）；非法 → invalid', () => {
    expect(inlineEditCommitOf({ kind: 'block-node', id: 'a' }, '  新标签  ', '输入')).toEqual({
      action: 'commit',
      intent: { type: 'set-node-label', id: 'a', label: '新标签' },
    })
    expect(inlineEditCommitOf({ kind: 'block-node', id: 'a' }, '', '输入')).toEqual({ action: 'unchanged' })
    expect(inlineEditCommitOf({ kind: 'block-node', id: 'a' }, '输入', '输入')).toEqual({ action: 'unchanged' })
    expect(inlineEditCommitOf({ kind: 'block-node', id: 'a' }, '含"引号', '输入')).toEqual({ action: 'invalid' })
    expect(inlineEditCommitOf({ kind: 'block-node', id: 'a' }, '含[方括号', '输入')).toEqual({ action: 'invalid' })
  })
})

describe('block 菜单动作（MenuActionContext 替身分发）', () => {
  function fakeCtx(projection: AnyProjection, intents: EditIntent[], inline: string[]) {
    return {
      projection,
      selection: null,
      commitIntent: (intent: EditIntent) => {
        intents.push(intent)
        return true
      },
      select: () => {},
      openForm: () => {},
      openStyleForm: () => {},
      beginInlineEdit: (t: { kind: string }) => inline.push(t.kind),
      enterLinkMode: () => {},
      newNodeText: '新节点',
      close: () => {},
    } satisfies MenuActionContext & { commitIntent: (i: EditIntent) => boolean }
  }

  it('空白「加块节点」= createElement：add-node + 选中 + 内联命名 + 关菜单', () => {
    const proj = { type: 'block', block: projectionOf() } as AnyProjection
    const intents: EditIntent[] = []
    const inline: string[] = []
    let closed = 0
    const ctx = fakeCtx(proj, intents, inline)
    ctx.close = () => {
      closed += 1
    }
    MENU_ACTIONS['add-block-node'](ctx, { kind: 'blank', diagramType: 'block' })
    expect(intents).toHaveLength(1)
    expect(intents[0]).toMatchObject({ type: 'add-node', shape: 'square', parentGroupId: null })
    expect(inline).toEqual(['block-node'])
    expect(closed).toBe(1)
  })

  it('嵌套块上「加块节点」：parentGroupId 指向该组（锚点 = 组声明行）', () => {
    const proj = { type: 'block', block: projectionOf() } as AnyProjection
    const intents: EditIntent[] = []
    MENU_ACTIONS['add-block-node'](fakeCtx(proj, intents, []), { kind: 'block-group', id: 'group1' })
    expect(intents[0]).toMatchObject({ type: 'add-node', parentGroupId: 'group1' })
  })

  it('空白「加嵌套块」= add-group 两行落码 + 选中（组无标签，不进内联命名）', () => {
    const proj = { type: 'block', block: projectionOf() } as AnyProjection
    const intents: EditIntent[] = []
    const selections: unknown[] = []
    const ctx = { ...fakeCtx(proj, intents, []), select: (s: unknown) => selections.push(s) }
    MENU_ACTIONS['add-block-group'](ctx, { kind: 'blank', diagramType: 'block' })
    // 新组 id 由 nextFreeName 避重生成：base 'g' 未被占用（占用的是 'group1'）
    expect(intents).toEqual([{ type: 'add-group', id: 'g' }])
    expect(selections).toEqual([{ kind: 'block-group', id: 'g' }])
  })

  it('节点「编辑文本」= 进入内联编辑（不改形状表单）', () => {
    const proj = { type: 'block', block: projectionOf() } as AnyProjection
    const inline: string[] = []
    MENU_ACTIONS['edit-text'](fakeCtx(proj, [], inline), { kind: 'block-node', id: 'a' })
    expect(inline).toEqual(['block-node'])
  })
})

describe('block 端到端验收场景（走真实 store 管线）', () => {
  beforeEach(() => {
    window.localStorage?.clear()
    newDiagramLegacy('block')
    expect(useEditorStore.getState().source).toContain('block-beta')
  })

  function commit(intent: BlockIntent | EditIntent): void {
    const ok = useEditorStore.getState().commitIntent(intent)
    expect(ok, `意图应落码：${JSON.stringify(intent)}`).toBe(true)
  }

  function currentProjection(): BlockProjection {
    const parsed = blockParser.parse(useEditorStore.getState().source)
    if (!parsed.ok) throw new Error(`源码必须可解析：${parsed.error.message}`)
    return buildBlockProjection(parsed.doc)
  }

  it('新建 → 加块 → 拉边 → 改标签 → 加组落子 → 删块（级联删边）', async () => {
    // ① 空白菜单「加块节点」路径
    commit({ type: 'add-node', id: 'f', shape: 'round', label: '重试' })
    expect(currentProjection().nodes.map((n) => n.id)).toContain('f')

    // ② 从已有块拉一条边（Enter 边表单路径）
    commit({ type: 'add-edge', from: 'c', to: 'f', line: 'x--x' })
    expect(currentProjection().edges.map((e) => `${e.from}${e.line}${e.to}`)).toContain('cx--xf')

    // ③ 属性表单给边加标签（裸算子换算 + 标签在 set-edge 一并落）
    commit({ type: 'set-edge', elementId: 'edge:3', changes: { label: '失败' } })
    expect(currentProjection().edges.find((e) => e.elementId === 'edge:3')?.label).toBe('失败')

    // ④ 双击改标签（set-node-label 等价入口）
    commit({ type: 'set-node-label', id: 'b', label: '数据校验' })
    expect(currentProjection().nodes.find((n) => n.id === 'b')?.label).toBe('数据校验')

    // ⑤ 加嵌套块并落入一个子块
    commit({ type: 'add-group', id: 'g2' })
    commit({ type: 'add-node', id: 'h', shape: 'square', label: '归档', parentGroupId: 'g2' })
    expect(currentProjection().nodes.find((n) => n.id === 'h')?.parentId).toBe('g2')

    // ⑥ 删除块：触及边（a --> b）级联清理（位置序 elementId 随之重排，按端点断言）
    commit({ type: 'delete-node', id: 'a' })
    expect(currentProjection().nodes.map((n) => n.id)).not.toContain('a')
    expect(currentProjection().edges.map((e) => e.from)).not.toContain('a')
    expect(currentProjection().edges.map((e) => `${e.from}-->${e.to}`)).not.toContain('a-->b')

    // 终态：源码合法（mermaid v12 实际 parse 通过）
    await expect(mermaid.parse(useEditorStore.getState().source)).resolves.toBeTruthy()
  })

  it('每一步编辑都是独立的可撤销快照', () => {
    const before = useEditorStore.getState().source
    commit({ type: 'add-node', id: 'f', shape: 'square' })
    expect(useEditorStore.getState().source).not.toBe(before)
    useEditorStore.getState().undo()
    expect(useEditorStore.getState().source).toBe(before)
  })
})
