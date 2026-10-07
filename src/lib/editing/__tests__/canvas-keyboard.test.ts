import { describe, expect, it } from 'vitest'
import { applyEdit } from '../../pipeline/pipeline'
import { flowchartParser } from '../../pipeline/flowchart'
import { mindmapParser } from '../../pipeline/mindmap'
import { classParser } from '../../pipeline/class'
import { sequenceParser } from '../../pipeline/sequence'
import {
  applyPlan,
  isNavigationKey,
  keyToNodeAction,
} from '../canvas-keyboard'
import type { KeyPlan } from '../canvas-keyboard'
import { flowchartKeyPlan, nodeActionIntents } from '../../pipeline/flowchart-keyboard'
import { mindmapKeyPlan, mindmapActionIntents } from '../../pipeline/mindmap-keyboard'
import { classKeyPlan, classDeleteIntent } from '../../pipeline/class-keyboard'
import { sequenceKeyPlan, sequenceDeleteIntent } from '../../pipeline/sequence-keyboard'
import type { Selection } from '../../projection/selection'
import { buildFlowchartProjection, type FlowchartProjection } from '../../projection/flowchart-projection'
import { buildMindmapProjection, type MindmapProjection } from '../../projection/mindmap-projection'
import { buildClassProjection, type ClassProjection } from '../../projection/class-projection'
import { buildSequenceProjection, type SequenceProjection } from '../../projection/sequence-projection'

const SAMPLE = `flowchart TD
    A[开始] --> B[处理]
    B --> C[结束]
`

function projectionOf(source: string): FlowchartProjection {
  const parsed = flowchartParser.parse(source)
  if (!parsed.ok) throw new Error(`样例源码必须可解析：${parsed.error.message}`)
  return buildFlowchartProjection(parsed.doc)
}

describe('键位映射（工单 05）', () => {
  it('Del / Backspace → 删除', () => {
    expect(keyToNodeAction('Delete')).toBe('delete')
    expect(keyToNodeAction('Backspace')).toBe('delete')
  })

  it('Tab → 添加子节点；Shift-Tab 不处理', () => {
    expect(keyToNodeAction('Tab')).toBe('add-child')
    expect(keyToNodeAction('Tab', { shift: true })).toBeNull()
  })

  it('Enter → 添加同级节点；Shift-Enter 不处理', () => {
    expect(keyToNodeAction('Enter')).toBe('add-sibling')
    expect(keyToNodeAction('Enter', { shift: true })).toBeNull()
  })

  it('其它键不处理', () => {
    expect(keyToNodeAction('a')).toBeNull()
    expect(keyToNodeAction('Escape')).toBeNull()
  })
})

describe('动作 → 编辑意图序列', () => {
  const projection = projectionOf(SAMPLE)

  it('delete 产出 delete-node 意图', () => {
    const plan = nodeActionIntents(projection, 'B', 'delete')
    expect(plan).toEqual({
      intents: [{ type: 'delete-node', nodeId: 'B' }],
      newNodeId: null,
    })
  })

  it('add-child 产出 add-node + add-edge（选中 → 新节点），锚定在选中节点行后', () => {
    const plan = nodeActionIntents(projection, 'B', 'add-child')
    expect(plan).not.toBeNull()
    expect(plan!.newNodeId).toBe('新节点')
    expect(plan!.intents).toEqual([
      { type: 'add-node', nodeId: '新节点', shape: null, afterElementId: 'node:B' },
      // 连线锚定在新节点行后：定义行在前、连线行在后（投影首次出现才取得到文本）
      { type: 'add-edge', from: 'B', to: '新节点', afterElementId: 'node:新节点' },
    ])
  })

  it('add-sibling 经入边推断父节点：A --> B --> C 中给 B 添加同级 → 新节点挂在 A 下', () => {
    const plan = nodeActionIntents(projection, 'B', 'add-sibling')
    expect(plan!.intents[1]).toEqual({
      type: 'add-edge',
      from: 'A',
      to: '新节点',
      afterElementId: 'node:新节点',
    })
  })

  it('无入边的根节点按 Enter 退化为添加子节点', () => {
    const plan = nodeActionIntents(projection, 'A', 'add-sibling')
    expect(plan!.intents[1]).toEqual({ type: 'add-edge', from: 'A', to: '新节点', afterElementId: 'node:新节点' })
  })

  it('选中的节点不存在于投影 → null（不产出意图）', () => {
    expect(nodeActionIntents(projection, 'X', 'delete')).toBeNull()
    expect(nodeActionIntents(projection, 'X', 'add-child')).toBeNull()
  })
})

describe('意图经管线落码（手术式、可渲染）', () => {
  it('add-child 落码：新增节点与连线，其余文本逐字保留', () => {
    const projection = projectionOf(SAMPLE)
    const plan = nodeActionIntents(projection, 'B', 'add-child')!
    let source = SAMPLE
    for (const intent of plan.intents) {
      const result = applyEdit(source, flowchartParser, intent)
      expect(result.ok).toBe(true)
      if (result.ok) source = result.source
    }
    // 新增的两行紧跟 B 行之后（缩进跟随锚点行）；新节点默认纯文本（ADR-0009 模型）
    const lines = source.split('\n')
    const idx = lines.findIndex((l) => l.includes('B[处理]'))
    expect(lines[idx + 1]).toBe('    新节点')
    expect(lines[idx + 2]).toBe('    B --> 新节点')
    // 原有行逐字保留（新行插在首个 B 出现行之后）
    expect(lines[0]).toBe('flowchart TD')
    expect(lines[1]).toBe('    A[开始] --> B[处理]')
    expect(lines[4]).toBe('    B --> C[结束]')
    // 新投影包含新节点与两条 B 的出边
    const after = projectionOf(source)
    expect(after.nodes.some((n) => n.nodeId === '新节点')).toBe(true)
    expect(after.edges.filter((e) => e.from === 'B').length).toBe(2)
  })

  it('add-sibling 落码：新节点连到推断出的父节点', () => {
    const projection = projectionOf(SAMPLE)
    const plan = nodeActionIntents(projection, 'C', 'add-sibling')!
    let source = SAMPLE
    for (const intent of plan.intents) {
      const result = applyEdit(source, flowchartParser, intent)
      if (result.ok) source = result.source
    }
    const after = projectionOf(source)
    const newEdge = after.edges.find((e) => e.to === '新节点')
    expect(newEdge?.from).toBe('B') // C 的父节点是 B
  })

  it('delete 落码：节点及其触及连线被删除，结构仍合法', () => {
    const projection = projectionOf(SAMPLE)
    const plan = nodeActionIntents(projection, 'B', 'delete')!
    const result = applyEdit(SAMPLE, flowchartParser, plan.intents[0])
    expect(result.ok).toBe(true)
    const after = projectionOf((result as { ok: true; source: string }).source)
    expect(after.nodes.some((n) => n.nodeId === 'B')).toBe(false)
    expect(after.edges.length).toBe(0)
  })
})

// ---------- flowchart 默认纯文本节点（ADR-0009 对齐：默认不分离、不生成机器 id） ----------

const BARE_SAMPLE = `flowchart TD
    新节点
    新节点 --> B[处理]
`

describe('flowchart 默认纯文本节点（ADR-0009 对齐：默认不分离、不生成机器 id）', () => {
  it('add-child：新节点 = 纯文本占位「新节点」（避重），无形状、无机器 id', () => {
    const plan = nodeActionIntents(projectionOf(SAMPLE), 'B', 'add-child')
    expect(plan!.newNodeId).toBe('新节点')
    expect(plan!.intents[0]).toEqual({
      type: 'add-node',
      nodeId: '新节点',
      shape: null,
      afterElementId: 'node:B',
    })
    expect(plan!.intents[1]).toEqual({
      type: 'add-edge',
      from: 'B',
      to: '新节点',
      afterElementId: 'node:新节点',
    })
  })

  it('占位与既有节点避重：已有「新节点」→「新节点2」', () => {
    const proj = projectionOf(BARE_SAMPLE)
    const plan = nodeActionIntents(proj, 'B', 'add-child')
    expect(plan!.newNodeId).toBe('新节点2')
  })

  it('add-child 落码：裸文本行 + 连线行，无方括号、无机器 id，其余逐字保留', () => {
    const plan = nodeActionIntents(projectionOf(SAMPLE), 'B', 'add-child')!
    let source = SAMPLE
    for (const intent of plan.intents) {
      const result = applyEdit(source, flowchartParser, intent)
      expect(result.ok).toBe(true)
      if (result.ok) source = result.source
    }
    const lines = source.split('\n')
    const idx = lines.findIndex((l) => l.includes('B[处理]'))
    expect(lines[idx + 1]).toBe('    新节点')
    expect(lines[idx + 2]).toBe('    B --> 新节点')
    expect(source).not.toMatch(/n\d/)
    const after = projectionOf(source)
    expect(after.nodes.some((n) => n.nodeId === '新节点')).toBe(true)
  })

  it('内联编辑裸节点（新文本是合法裸词）→ 所有出现处重写为同一裸词，纯文本形式保持', () => {
    const result = applyEdit(BARE_SAMPLE, flowchartParser, {
      type: 'set-node-text',
      nodeId: '新节点',
      text: '用户登录',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const lines = result.source.split('\n')
    expect(lines[1]).toBe('    用户登录')
    expect(lines[2]).toBe('    用户登录 --> B[处理]')
  })

  it('内联编辑裸节点（新文本含空格，裸词形式不可能）→ 旧词保留为 id，方框承接文本', () => {
    const result = applyEdit(BARE_SAMPLE, flowchartParser, {
      type: 'set-node-text',
      nodeId: '新节点',
      text: '用户 登录',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const lines = result.source.split('\n')
    expect(lines[1]).toBe('    新节点[用户 登录]')
    expect(lines[2]).toBe('    新节点 --> B[处理]')
  })

  it('属性面板改 ID（裸节点）= 显式分离：MyId[新节点]，其余出现处跟随新 id', () => {
    const result = applyEdit(BARE_SAMPLE, flowchartParser, {
      type: 'rename-node',
      nodeId: '新节点',
      newId: 'MyId',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const lines = result.source.split('\n')
    expect(lines[1]).toBe('    MyId[新节点]')
    expect(lines[2]).toBe('    MyId --> B[处理]')
  })
})

// ---------- mindmap（工单 06） ----------

const MINDMAP_SAMPLE = `mindmap
  root((中心))
    分支A
      叶子
    分支B
`

function mindmapProjectionOf(source: string): MindmapProjection {
  const parsed = mindmapParser.parse(source)
  if (!parsed.ok) throw new Error(`样例源码必须可解析：${parsed.error.message}`)
  return buildMindmapProjection(parsed.doc)
}

describe('mindmap 动作 → 编辑意图序列（工单 06）', () => {
  const projection = mindmapProjectionOf(MINDMAP_SAMPLE)
  // 节点序：root=1，分支A=2，叶子=3，分支B=4

  it('delete 产出 delete-node 意图（子树删除由管线处理）', () => {
    expect(mindmapActionIntents(projection, 'mindmap-node:2', 'delete', '新节点')).toEqual({
      intents: [{ type: 'delete-node', elementId: 'mindmap-node:2' }],
      newElementId: null,
    })
  })

  it('add-child：意图挂在选中节点下，新节点序号 = 子树末节点 + 1', () => {
    const plan = mindmapActionIntents(projection, 'mindmap-node:2', 'add-child', '新节点')
    // 分支A 的子树末节点是叶子（3），新节点序号 4
    expect(plan).toEqual({
      intents: [{ type: 'add-child', parentElementId: 'mindmap-node:2', text: '新节点' }],
      newElementId: 'mindmap-node:4',
    })
  })

  it('add-sibling：同级插入，新节点序号同样在子树之后', () => {
    const plan = mindmapActionIntents(projection, 'mindmap-node:2', 'add-sibling', '新节点')
    expect(plan!.intents[0]).toEqual({ type: 'add-sibling', elementId: 'mindmap-node:2', text: '新节点' })
    expect(plan!.newElementId).toBe('mindmap-node:4')
  })

  it('根节点（无父）按 Enter 退化为加子节点', () => {
    const plan = mindmapActionIntents(projection, 'mindmap-node:1', 'add-sibling', '新节点')
    expect(plan!.intents[0]).toEqual({ type: 'add-child', parentElementId: 'mindmap-node:1', text: '新节点' })
  })

  it('选中的节点不存在于投影 → null（不产出意图）', () => {
    expect(mindmapActionIntents(projection, 'mindmap-node:99', 'add-child', '新节点')).toBeNull()
  })
})

describe('mindmap 意图经管线落码（缩进层级，工单 06）', () => {
  it('add-child 落码：缩进跟随既有子节点，插在子树之后，既有节点编号后移', () => {
    const projection = mindmapProjectionOf(MINDMAP_SAMPLE)
    const plan = mindmapActionIntents(projection, 'mindmap-node:2', 'add-child', '新节点')!
    const result = applyEdit(MINDMAP_SAMPLE, mindmapParser, plan.intents[0])
    expect(result.ok).toBe(true)
    const source = (result as { ok: true; source: string }).source
    const lines = source.split('\n')
    // 新节点按叶子的缩进（6 空格）插在叶子之后、分支B 之前
    expect(lines[4]).toBe('      新节点')
    expect(lines[5]).toBe('    分支B')
    // 新节点在文档序第 4 个节点位置 → elementId mindmap-node:4，与预计算一致
    const after = mindmapProjectionOf(source)
    expect(after.nodes[3]).toMatchObject({ elementId: 'mindmap-node:4', text: '新节点', depth: 2 })
  })

  it('add-sibling 落码：缩进与选中节点一致', () => {
    const projection = mindmapProjectionOf(MINDMAP_SAMPLE)
    const plan = mindmapActionIntents(projection, 'mindmap-node:4', 'add-sibling', '新节点')!
    const result = applyEdit(MINDMAP_SAMPLE, mindmapParser, plan.intents[0])
    expect(result.ok).toBe(true)
    const after = mindmapProjectionOf((result as { ok: true; source: string }).source)
    const created = after.nodes.find((n) => n.text === '新节点')
    expect(created).toMatchObject({ depth: 1, parentId: 'mindmap-node:1' })
  })

  it('delete 落码：连同子树一起删除', () => {
    const projection = mindmapProjectionOf(MINDMAP_SAMPLE)
    const plan = mindmapActionIntents(projection, 'mindmap-node:2', 'delete', '新节点')!
    const result = applyEdit(MINDMAP_SAMPLE, mindmapParser, plan.intents[0])
    expect(result.ok).toBe(true)
    const after = mindmapProjectionOf((result as { ok: true; source: string }).source)
    expect(after.nodes.map((n) => n.text)).toEqual(['中心', '分支B'])
  })
})

// ---------- 方向键（工单 14）：方位导航的键位判定 ----------

describe('方向键键位判定（工单 14）', () => {
  it('四个方向键参与导航，其它键不参与', () => {
    expect(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].every(isNavigationKey)).toBe(true)
    expect(isNavigationKey('Tab')).toBe(false)
    expect(isNavigationKey('a')).toBe(false)
  })
})

// ---------- class / sequence 编辑键（工单 05 / ADR-0013）：键 → KeyPlan 见文末全图种覆盖 ----------

const CLASS_EDIT_SAMPLE = `classDiagram
    class Foo {
        +String name
    }
    class Bar
    Foo --> Bar
    note for Foo "说明"
`

const SEQ_EDIT_SAMPLE = `sequenceDiagram
    participant 甲
    participant 乙
    甲->>乙: hi
    note over 甲: 备注
    alt 条件
        乙->>甲: 回
    end
`

function classProjectionOf(source: string): ClassProjection {
  const parsed = classParser.parse(source)
  if (!parsed.ok) throw new Error(`样例源码必须可解析：${parsed.error.message}`)
  return buildClassProjection(parsed.doc)
}

function sequenceProjectionOf(source: string): SequenceProjection {
  const parsed = sequenceParser.parse(source)
  if (!parsed.ok) throw new Error(`样例源码必须可解析：${parsed.error.message}`)
  return buildSequenceProjection(parsed.doc)
}

describe('选中元素 → 删除意图（工单 05）', () => {
  it('class：类/成员/关系/注释各映射到既有 delete-* 意图', () => {
    const p = classProjectionOf(CLASS_EDIT_SAMPLE)
    const cls = p.classes.find((c) => c.name === 'Foo')!
    const member = p.members[0]
    const relation = p.relations[0]
    const note = p.notes[0]

    expect(classDeleteIntent(p, { kind: 'class', name: cls.name })).toEqual({ type: 'delete-class', name: 'Foo' })
    expect(classDeleteIntent(p, { kind: 'class-member', elementId: member.elementId })).toEqual({
      type: 'delete-member',
      elementId: member.elementId,
    })
    expect(classDeleteIntent(p, { kind: 'class-relation', elementId: relation.elementId })).toEqual({
      type: 'delete-relation',
      elementId: relation.elementId,
    })
    expect(classDeleteIntent(p, { kind: 'class-note', elementId: note.elementId })).toEqual({
      type: 'delete-note',
      elementId: note.elementId,
    })
  })

  it('class：未选中 / 别图种选中 / 已不在投影 → null（不落码、不 preventDefault）', () => {
    const p = classProjectionOf(CLASS_EDIT_SAMPLE)
    expect(classDeleteIntent(p, null)).toBeNull()
    expect(classDeleteIntent(p, { kind: 'diagram' })).toBeNull()
    expect(classDeleteIntent(p, { kind: 'node', nodeId: 'Foo' })).toBeNull()
    expect(classDeleteIntent(p, { kind: 'class', name: '不存在' })).toBeNull()
    expect(classDeleteIntent(p, { kind: 'class-member', elementId: 'member:99' })).toBeNull()
  })

  it('sequence：参与者/消息/注释/逻辑块各映射到既有 delete-* 意图', () => {
    const p = sequenceProjectionOf(SEQ_EDIT_SAMPLE)
    expect(sequenceDeleteIntent(p, { kind: 'participant', actorId: '甲' })).toEqual({
      type: 'delete-participant',
      actorId: '甲',
    })
    expect(sequenceDeleteIntent(p, { kind: 'message', elementId: p.messages[0].elementId })).toEqual({
      type: 'delete-message',
      elementId: p.messages[0].elementId,
    })
    expect(sequenceDeleteIntent(p, { kind: 'note', elementId: p.notes[0].elementId })).toEqual({
      type: 'delete-note',
      elementId: p.notes[0].elementId,
    })
    const block = p.blocks.find((b) => b.elementId.startsWith('block:'))!
    expect(sequenceDeleteIntent(p, { kind: 'block', elementId: block.elementId })).toEqual({
      type: 'delete-block',
      elementId: block.elementId,
    })
  })

  it('sequence：未选中 / 别图种选中 / 已不在投影 → null', () => {
    const p = sequenceProjectionOf(SEQ_EDIT_SAMPLE)
    expect(sequenceDeleteIntent(p, null)).toBeNull()
    expect(sequenceDeleteIntent(p, { kind: 'diagram' })).toBeNull()
    expect(sequenceDeleteIntent(p, { kind: 'participant', actorId: '不存在' })).toBeNull()
    expect(sequenceDeleteIntent(p, { kind: 'message', elementId: 'message:99' })).toBeNull()
  })

  it('删除意图经管线落码：级联行为与属性面板一致（可撤销、源文本其余部分逐字保留）', () => {
    const p = classProjectionOf(CLASS_EDIT_SAMPLE)
    const intent = classDeleteIntent(p, { kind: 'class', name: 'Foo' })!
    const result = applyEdit(CLASS_EDIT_SAMPLE, classParser, intent)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 类声明、块内成员、引用该类的 relation、note for 目标全部消失（管线级联）
    expect(result.source).not.toContain('Foo')
    expect(result.source).not.toContain('String name')
    expect(result.source).not.toContain('-->')
    // 未触及的类保留
    expect(result.source).toContain('class Bar')
  })
})

// ---------- 键 → KeyPlan（architecture-deepening-2 工单 02）：全图种覆盖 ----------
// 现有 keyToClassAction / keyToSequenceAction 键位映射测试迁移至此：映射收敛为
// *KeyPlan 纯函数（能力包 keyHandler 委托它们）后，按「键 → 完整 plan」断言。

const FLOW_SELECTION = { kind: 'node' as const, nodeId: 'B' }
const MIND_SELECTION = { kind: 'mindmap-node' as const, elementId: 'mindmap-node:2' }
const CLASS_SELECTION = { kind: 'class' as const, name: 'Foo' }
const SEQ_SELECTION = { kind: 'participant' as const, actorId: '甲' }

describe('键 → KeyPlan：flowchart（工单 04 键位表 + 意图映射）', () => {
  const projection = projectionOf(SAMPLE)

  it('Tab → add-node + add-edge，newElementTarget 指向新节点（选中 + 内联编辑）', () => {
    expect(flowchartKeyPlan(projection, { key: 'Tab', selection: FLOW_SELECTION })).toEqual({
      intents: [
        { type: 'add-node', nodeId: '新节点', shape: null, afterElementId: 'node:B' },
        { type: 'add-edge', from: 'B', to: '新节点', afterElementId: 'node:新节点' },
      ],
      newElementTarget: {
        selection: { kind: 'node', nodeId: '新节点' },
        inlineEdit: { kind: 'flowchart', nodeId: '新节点' },
      },
    })
  })

  it('Enter → 加同级（经入边推断父节点）；Delete → delete-node（无 newElementTarget、不清选中）', () => {
    const enterPlan = flowchartKeyPlan(projection, { key: 'Enter', selection: FLOW_SELECTION })
    expect(enterPlan!.intents[1]).toMatchObject({ type: 'add-edge', from: 'A', to: '新节点' })
    expect(flowchartKeyPlan(projection, { key: 'Delete', selection: FLOW_SELECTION })).toEqual({
      intents: [{ type: 'delete-node', nodeId: 'B' }],
    })
    expect(flowchartKeyPlan(projection, { key: 'Backspace', selection: FLOW_SELECTION })).toEqual({
      intents: [{ type: 'delete-node', nodeId: 'B' }],
    })
  })

  it('Shift 组合与其它键不处理；无选中 / 选中别种元素 / 已不在投影 → null', () => {
    for (const key of ['Tab', 'Enter']) {
      expect(flowchartKeyPlan(projection, { key, mods: { shift: true }, selection: FLOW_SELECTION })).toBeNull()
      expect(flowchartKeyPlan(projection, { key, selection: null })).toBeNull()
      expect(flowchartKeyPlan(projection, { key, selection: { kind: 'class', name: 'Foo' } })).toBeNull()
    }
    expect(flowchartKeyPlan(projection, { key: 'a', selection: FLOW_SELECTION })).toBeNull()
    expect(flowchartKeyPlan(projection, { key: 'Escape', selection: FLOW_SELECTION })).toBeNull()
    expect(flowchartKeyPlan(projection, { key: 'Tab', selection: { kind: 'node', nodeId: 'X' } })).toBeNull()
  })
})

describe('键 → KeyPlan：mindmap（工单 06 键位表 + 缩进层级意图）', () => {
  const projection = mindmapProjectionOf(MINDMAP_SAMPLE)

  it('Tab → add-child，newElementTarget 指向预计算的新节点（选中 + 内联编辑）', () => {
    expect(
      mindmapKeyPlan(projection, { key: 'Tab', selection: MIND_SELECTION, newNodeText: '新节点' }),
    ).toEqual({
      intents: [{ type: 'add-child', parentElementId: 'mindmap-node:2', text: '新节点' }],
      newElementTarget: {
        selection: { kind: 'mindmap-node', elementId: 'mindmap-node:4' },
        inlineEdit: { kind: 'mindmap', elementId: 'mindmap-node:4' },
      },
    })
  })

  it('Enter → add-sibling；Delete/Backspace → delete-node（不清选中）', () => {
    expect(
      mindmapKeyPlan(projection, { key: 'Enter', selection: MIND_SELECTION, newNodeText: '新节点' })!.intents[0],
    ).toMatchObject({ type: 'add-sibling', elementId: 'mindmap-node:2' })
    for (const key of ['Delete', 'Backspace']) {
      expect(mindmapKeyPlan(projection, { key, selection: MIND_SELECTION })).toEqual({
        intents: [{ type: 'delete-node', elementId: 'mindmap-node:2' }],
      })
    }
  })

  it('Shift 组合不处理；无选中 / 已不在投影 → null', () => {
    expect(mindmapKeyPlan(projection, { key: 'Tab', mods: { shift: true }, selection: MIND_SELECTION })).toBeNull()
    expect(mindmapKeyPlan(projection, { key: 'Tab', selection: null })).toBeNull()
    expect(
      mindmapKeyPlan(projection, {
        key: 'Tab',
        selection: { kind: 'mindmap-node', elementId: 'mindmap-node:99' },
      }),
    ).toBeNull()
  })
})

describe('键 → KeyPlan：class（工单 05 / ADR-0013，迁移自 keyToClassAction）', () => {
  const projection = classProjectionOf(CLASS_EDIT_SAMPLE)

  it('Tab → form「member」、Enter → form「relation」（落到已有表单，不直接落码）', () => {
    expect(classKeyPlan(projection, { key: 'Tab', selection: CLASS_SELECTION })).toEqual({
      intents: [],
      form: 'member',
    })
    expect(classKeyPlan(projection, { key: 'Enter', selection: CLASS_SELECTION })).toEqual({
      intents: [],
      form: 'relation',
    })
  })

  it('Delete/Backspace → delete-class（能力包唯一映射），并清空选中', () => {
    for (const key of ['Delete', 'Backspace']) {
      expect(classKeyPlan(projection, { key, selection: CLASS_SELECTION })).toEqual({
        intents: [{ type: 'delete-class', name: 'Foo' }],
        clearSelection: true,
      })
    }
  })

  it('Shift 组合与其它键不处理；无选中 / 选中别种 / 类已不在投影 → null（不 preventDefault）', () => {
    for (const key of ['Tab', 'Enter']) {
      expect(classKeyPlan(projection, { key, mods: { shift: true }, selection: CLASS_SELECTION })).toBeNull()
      expect(classKeyPlan(projection, { key, selection: null })).toBeNull()
      expect(classKeyPlan(projection, { key, selection: { kind: 'node', nodeId: 'Foo' } })).toBeNull()
    }
    expect(classKeyPlan(projection, { key: 'ArrowUp', selection: CLASS_SELECTION })).toBeNull()
    expect(classKeyPlan(projection, { key: 'a', selection: CLASS_SELECTION })).toBeNull()
    expect(classKeyPlan(projection, { key: 'Tab', selection: { kind: 'class', name: '不存在' } })).toBeNull()
  })
})

describe('键 → KeyPlan：sequence（工单 05 / ADR-0013，迁移自 keyToSequenceAction）', () => {
  const projection = sequenceProjectionOf(SEQ_EDIT_SAMPLE)

  it('Tab → form「participant」（不依赖选中——参与者是列、没有锚点）', () => {
    expect(sequenceKeyPlan(projection, { key: 'Tab', selection: SEQ_SELECTION })).toEqual({
      intents: [],
      form: 'participant',
    })
    expect(sequenceKeyPlan(projection, { key: 'Tab', selection: null })).toEqual({
      intents: [],
      form: 'participant',
    })
  })

  it('选中参与者时 Enter → form「message」；Delete/Backspace → delete-participant 并清空选中', () => {
    expect(sequenceKeyPlan(projection, { key: 'Enter', selection: SEQ_SELECTION })).toEqual({
      intents: [],
      form: 'message',
    })
    for (const key of ['Delete', 'Backspace']) {
      expect(sequenceKeyPlan(projection, { key, selection: SEQ_SELECTION })).toEqual({
        intents: [{ type: 'delete-participant', actorId: '甲' }],
        clearSelection: true,
      })
    }
  })

  it('Shift 组合不处理；未选中参与者时 Enter → null；参与者已不在投影 → null', () => {
    expect(sequenceKeyPlan(projection, { key: 'Enter', mods: { shift: true }, selection: SEQ_SELECTION })).toBeNull()
    expect(sequenceKeyPlan(projection, { key: 'Tab', mods: { shift: true }, selection: SEQ_SELECTION })).toBeNull()
    expect(sequenceKeyPlan(projection, { key: 'ArrowDown', selection: SEQ_SELECTION })).toBeNull()
    expect(sequenceKeyPlan(projection, { key: 'Enter', selection: null })).toBeNull()
    expect(sequenceKeyPlan(projection, { key: 'Enter', selection: { kind: 'class', name: 'Foo' } })).toBeNull()
    expect(sequenceKeyPlan(projection, { key: 'Enter', selection: { kind: 'participant', actorId: '不存在' } })).toBeNull()
  })
})

// ---------- applyPlan（architecture-deepening-2 工单 02）：plan 的唯一执行器 ----------

/** 执行器替身：记录调用序（preventDefault / intents / select / inlineEdit） */
function fakeExec(overrides: { commitResult?: boolean } = {}) {
  const calls: string[] = []
  const intents: unknown[] = []
  const selections: (Selection | null)[] = []
  const inlineEdits: unknown[] = []
  const forms: string[] = []
  return {
    calls,
    intents,
    selections,
    inlineEdits,
    forms,
    exec: {
      commitIntent: (intent: Parameters<typeof applyPlan>[0]['intents'][number]) => {
        intents.push(intent)
        calls.push(`commit:${intent.type}`)
        return overrides.commitResult ?? true
      },
      select: (selection: Selection | null) => {
        selections.push(selection)
        calls.push('select')
      },
      beginInlineEdit: (target: unknown) => {
        inlineEdits.push(target)
        calls.push('inline')
      },
      openForm: (kind: string) => {
        forms.push(kind)
        calls.push(`form:${kind}`)
      },
      preventDefault: () => {
        calls.push('preventDefault')
      },
    },
  }
}

describe('applyPlan（工单 02：preventDefault / 提交 / 选中 / 内联编辑 / 表单的编排放策略只此一处）', () => {
  it('意图类 plan：先 preventDefault，再依次提交，全部成功后选中新元素并进入内联编辑', () => {
    const { exec, calls } = fakeExec()
    const plan: KeyPlan = {
      intents: [{ type: 'add-node', nodeId: 'n1' }, { type: 'add-edge', from: 'A', to: 'n1' }],
      newElementTarget: {
        selection: { kind: 'node', nodeId: 'n1' },
        inlineEdit: { kind: 'flowchart', nodeId: 'n1' },
      },
    }

    expect(applyPlan(plan, exec)).toBe(true)
    // 编排顺序固定：preventDefault → 两个意图 → 选中 → 内联编辑
    expect(calls).toEqual(['preventDefault', 'commit:add-node', 'commit:add-edge', 'select', 'inline'])
  })

  it('第一个意图被拒绝即中止：后续意图不提交、不选中、不内联编辑（返回 false）', () => {
    const { exec, calls, selections, inlineEdits } = fakeExec({ commitResult: false })
    const plan: KeyPlan = {
      intents: [{ type: 'add-node', nodeId: 'n1' }, { type: 'add-edge', from: 'A', to: 'n1' }],
      newElementTarget: {
        selection: { kind: 'node', nodeId: 'n1' },
        inlineEdit: { kind: 'flowchart', nodeId: 'n1' },
      },
    }

    expect(applyPlan(plan, exec)).toBe(false)
    expect(calls).toEqual(['preventDefault', 'commit:add-node'])
    expect(selections).toEqual([])
    expect(inlineEdits).toEqual([])
  })

  it('clearSelection plan（class/sequence 删除）：提交成功后清空选中；无 newElementTarget 不误内联', () => {
    const { exec, calls, selections } = fakeExec()

    expect(applyPlan({ intents: [{ type: 'delete-class', name: 'Foo' }], clearSelection: true }, exec)).toBe(true)
    expect(calls).toEqual(['preventDefault', 'commit:delete-class', 'select'])
    expect(selections).toEqual([null])
  })

  it('表单类 plan（class/sequence 的 Tab/Enter）：preventDefault + openForm，不提交任何意图', () => {
    const { exec, calls, intents } = fakeExec()

    expect(applyPlan({ intents: [], form: 'member' }, exec)).toBe(true)
    expect(calls).toEqual(['preventDefault', 'form:member'])
    expect(intents).toEqual([])
  })

  it('无 beginInlineEdit / openForm / preventDefault（结构树等间接路径）也不抛错', () => {
    expect(
      applyPlan(
        { intents: [{ type: 'add-child', text: '新节点' }] },
        { commitIntent: () => true, select: () => {} },
      ),
    ).toBe(true)
  })
})
