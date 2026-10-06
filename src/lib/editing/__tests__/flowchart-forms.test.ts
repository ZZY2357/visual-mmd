import { describe, expect, it } from 'vitest'
import { applyEdit } from '../../pipeline/pipeline'
import { flowchartParser } from '../../pipeline/flowchart'
import {
  addClassDefIntent,
  addEdgeIntent,
  addNodeIntent,
  classDefStyleIntents,
  deleteNodeIntent,
  renameNodeIntent,
  setDirectionIntent,
  setEdgeIntent,
  setNodeShapeIntent,
  setNodeTextIntent,
  setSubgraphTitleIntent,
} from '../flowchart-forms'

const SOURCE = `flowchart TD
    A[开始] --> B{判断}
    B -- 是 --> C[通过]
    subgraph 分组
        D --> E
    end
    classDef highlight fill:#fff3bf
`

function apply(source: string, intent: Parameters<typeof applyEdit>[2]): string {
  const result = applyEdit(source, flowchartParser, intent)
  if (!result.ok) throw new Error(`意图无法应用：${result.error.message}`)
  return result.source
}

describe('表单 → 意图映射：节点', () => {
  it('改显示文本：其余行逐字不变', () => {
    const next = apply(SOURCE, setNodeTextIntent('A', '启动'))
    expect(next).toContain('A[启动]')
    expect(next.split('\n')[2]).toBe('    B -- 是 --> C[通过]')
  })

  it('换形状', () => {
    const next = apply(SOURCE, setNodeShapeIntent('A', 'stadium'))
    expect(next).toContain('A([开始])')
  })

  it('改名：全部出现更新', () => {
    const intent = renameNodeIntent('B', 'cond')
    expect(intent).not.toBeNull()
    const next = apply(SOURCE, intent!)
    expect(next).toContain('cond{判断}')
    expect(next).toContain('cond -- 是 -->')
    expect(next).not.toContain('B{')
  })

  it('改名到非法 id 返回 null（表单层提示而非落码）', () => {
    expect(renameNodeIntent('B', 'a b')).toBeNull()
    expect(renameNodeIntent('B', 'end')).toBeNull()
  })

  it('新增节点（文本缺省用 id）', () => {
    const intent = addNodeIntent({ nodeId: 'X1', text: '', shape: 'circle' })
    expect(intent).not.toBeNull()
    const next = apply(SOURCE, intent!)
    expect(next.trimEnd().endsWith('X1((X1))')).toBe(true)
  })

  it('新增节点 id 非法返回 null', () => {
    expect(addNodeIntent({ nodeId: 'has space', text: 'x', shape: 'rectangle' })).toBeNull()
  })

  it('删除节点：触及的连线一并消失', () => {
    const next = apply(SOURCE, deleteNodeIntent('A'))
    expect(next).not.toContain('A[')
    expect(next).not.toContain('--> B')
    expect(next).toContain('B{判断}')
  })
})

describe('表单 → 意图映射：连线', () => {
  it('换线型与双向（未给出字段保持不变）', () => {
    const next = apply(SOURCE, setEdgeIntent('A', 'B', 1, { lineStyle: 'thick', bidirectional: true }))
    expect(next).toContain('A[开始] <==> B{判断}')
  })

  it('改标签', () => {
    const next = apply(SOURCE, setEdgeIntent('A', 'B', 1, { label: '开始流' }))
    expect(next).toContain('A[开始] -- 开始流 --> B{判断}')
  })

  it('去掉标签', () => {
    const next = apply(SOURCE, setEdgeIntent('B', 'C', 1, { label: null }))
    expect(next).toContain('B --> C[通过]')
  })

  it('新加连线（带标签走管道写法）', () => {
    const intent = addEdgeIntent({ from: 'C', to: 'A', label: '闭环' })
    expect(intent).not.toBeNull()
    const next = apply(SOURCE, intent!)
    expect(next).toContain('C -->|闭环| A')
  })

  it('端点 id 非法返回 null', () => {
    expect(addEdgeIntent({ from: 'C', to: 'not ok', label: '' })).toBeNull()
  })
})

describe('表单 → 意图映射：方向 / subgraph / classDef', () => {
  it('改方向', () => {
    const next = apply(SOURCE, setDirectionIntent('LR'))
    expect(next.startsWith('flowchart LR')).toBe(true)
  })

  it('改 subgraph 标题', () => {
    const next = apply(SOURCE, setSubgraphTitleIntent('subgraph:1', '新分组'))
    expect(next).toContain('subgraph 分组["新分组"]')
  })

  it('classDef 常用样式：每个属性一个意图，solid 删除 dasharray', () => {
    const intents = classDefStyleIntents('highlight', {
      fill: '#ffec99',
      dashStyle: 'solid',
    })
    expect(intents).toEqual([
      { type: 'set-classdef-prop', name: 'highlight', prop: 'fill', value: '#ffec99' },
      { type: 'set-classdef-prop', name: 'highlight', prop: 'stroke-dasharray', value: '' },
    ])
    let src = SOURCE
    for (const intent of intents) src = apply(src, intent)
    expect(src).toContain('classDef highlight fill:#ffec99')
    expect(src).not.toContain('stroke-dasharray')
  })

  it('classDef：dashed 映射为 5 5', () => {
    const intents = classDefStyleIntents('plain', { dashStyle: 'dashed', color: '#1e1e1e' })
    expect(intents.some((i) => i.type === 'set-classdef-prop' && i.value === '5 5')).toBe(true)
  })

  it('新增 classDef 带样式初值', () => {
    const intent = addClassDefIntent({
      name: 'mystyle',
      fill: '#d3f9d8',
      stroke: '#2f9e44',
      dashStyle: 'dotted',
      color: '#2b8a3e',
    })
    expect(intent).not.toBeNull()
    const next = apply(SOURCE, intent!)
    expect(next).toContain(
      'classDef mystyle fill:#d3f9d8,stroke:#2f9e44,stroke-dasharray:2 2,color:#2b8a3e',
    )
  })

  it('新增 classDef 名字非法返回 null', () => {
    expect(addClassDefIntent({ name: 'a,b', fill: '', stroke: '', dashStyle: 'solid', color: '' })).toBeNull()
  })

  it('端到端：一次表单操作后源码仍可被解析（投影可刷新）', () => {
    let src = SOURCE
    for (const intent of [
      setNodeTextIntent('A', '重新开始'),
      setEdgeIntent('B', 'C', 1, { lineStyle: 'dotted' }),
      setDirectionIntent('RL'),
      setSubgraphTitleIntent('subgraph:1', '嵌套组'),
    ]) {
      const result = applyEdit(src, flowchartParser, intent)
      if (!result.ok) throw new Error(result.error.message)
      src = result.source
    }
    const parsed = flowchartParser.parse(src)
    expect(parsed.ok).toBe(true)
    expect(src.startsWith('flowchart RL')).toBe(true)
    expect(src).toContain('A[重新开始]')
  })
})
