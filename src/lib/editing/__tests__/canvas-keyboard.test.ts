import { describe, expect, it } from 'vitest'
import { applyEdit } from '../../pipeline/pipeline'
import { flowchartParser } from '../../pipeline/flowchart'
import { mindmapParser } from '../../pipeline/mindmap'
import { classParser } from '../../pipeline/class'
import { sequenceParser } from '../../pipeline/sequence'
import {
  classDeleteIntent,
  isNavigationKey,
  keyToClassAction,
  keyToNodeAction,
  keyToSequenceAction,
  mindmapActionIntents,
  nextNodeId,
  nodeActionIntents,
  sequenceDeleteIntent,
} from '../canvas-keyboard'
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

describe('新节点 id 推断', () => {
  it('空图 → n1；已有 n1/n2 → n3', () => {
    expect(nextNodeId([])).toBe('n1')
    expect(nextNodeId(['A', 'n1', 'n2'])).toBe('n3')
  })

  it('跳过与用户节点冲突的编号', () => {
    expect(nextNodeId(['n1', 'n3'])).toBe('n2')
    expect(nextNodeId(['n1', 'n2', 'n3'])).toBe('n4')
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
    expect(plan!.newNodeId).toBe('n1')
    expect(plan!.intents).toEqual([
      { type: 'add-node', nodeId: 'n1', text: 'n1', shape: 'rectangle', afterElementId: 'node:B' },
      { type: 'add-edge', from: 'B', to: 'n1', afterElementId: 'node:B' },
    ])
  })

  it('add-sibling 经入边推断父节点：A --> B --> C 中给 B 添加同级 → 新节点挂在 A 下', () => {
    const plan = nodeActionIntents(projection, 'B', 'add-sibling')
    expect(plan!.intents[1]).toEqual({
      type: 'add-edge',
      from: 'A',
      to: 'n1',
      afterElementId: 'node:B',
    })
  })

  it('无入边的根节点按 Enter 退化为添加子节点', () => {
    const plan = nodeActionIntents(projection, 'A', 'add-sibling')
    expect(plan!.intents[1]).toEqual({ type: 'add-edge', from: 'A', to: 'n1', afterElementId: 'node:A' })
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
    // 新增的两行紧跟 B 行之后（缩进跟随锚点行）
    const lines = source.split('\n')
    const idx = lines.findIndex((l) => l.includes('B[处理]'))
    expect(lines[idx + 1]).toBe('    B --> n1')
    expect(lines[idx + 2]).toBe('    n1[n1]')
    // 原有行逐字保留（新行插在首个 B 出现行之后）
    expect(lines[0]).toBe('flowchart TD')
    expect(lines[1]).toBe('    A[开始] --> B[处理]')
    expect(lines[4]).toBe('    B --> C[结束]')
    // 新投影包含新节点与两条 B 的出边
    const after = projectionOf(source)
    expect(after.nodes.some((n) => n.nodeId === 'n1')).toBe(true)
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
    const newEdge = after.edges.find((e) => e.to === 'n1')
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

// ---------- class / sequence 编辑键（工单 05 / ADR-0013） ----------

describe('class / sequence 键位映射（工单 05）', () => {
  it('class：Tab 加成员、Enter 加关系、Del 删除；Shift 组合不处理', () => {
    expect(keyToClassAction('Tab')).toBe('add-member')
    expect(keyToClassAction('Enter')).toBe('add-relation')
    expect(keyToClassAction('Delete')).toBe('delete')
    expect(keyToClassAction('Backspace')).toBe('delete')
    expect(keyToClassAction('Tab', { shift: true })).toBeNull()
    expect(keyToClassAction('Enter', { shift: true })).toBeNull()
    expect(keyToClassAction('ArrowUp')).toBeNull()
    expect(keyToClassAction('a')).toBeNull()
  })

  it('sequence：Tab 加参与者、Enter 加消息、Del 删除；Shift 组合不处理', () => {
    expect(keyToSequenceAction('Tab')).toBe('add-participant')
    expect(keyToSequenceAction('Enter')).toBe('add-message')
    expect(keyToSequenceAction('Delete')).toBe('delete')
    expect(keyToSequenceAction('Backspace')).toBe('delete')
    expect(keyToSequenceAction('Tab', { shift: true })).toBeNull()
    expect(keyToSequenceAction('Enter', { shift: true })).toBeNull()
    expect(keyToSequenceAction('ArrowDown')).toBeNull()
  })
})

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
