import { describe, expect, it } from 'vitest'
import { applyEdit } from '../../pipeline/pipeline'
import { flowchartParser } from '../../pipeline/flowchart'
import {
  keyToNodeAction,
  nextNodeId,
  nodeActionIntents,
} from '../canvas-keyboard'
import { buildFlowchartProjection, type FlowchartProjection } from '../../projection/flowchart-projection'

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
