import { describe, expect, it } from 'vitest'
import mermaid from 'mermaid'
import { DEFAULT_DIAGRAM_SOURCE } from '../../storage'
import { applyEdit, type EditIntent } from '../pipeline'
import { flowchartParser } from '../flowchart'

/**
 * 金样合法性：管线产出的源码必须能被 mermaid v12 实际 parse 通过。
 * 连续编辑的链式用例：每次编辑的产物既逐字保留历史文本，又仍是合法 mermaid。
 */
describe('金样合法性', () => {
  it('set-node-text 产物 parse 通过', async () => {
    const result = applyEdit(DEFAULT_DIAGRAM_SOURCE, flowchartParser, {
      type: 'set-node-text',
      nodeId: 'B',
      text: '学会了吗',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    await expect(mermaid.parse(result.source)).resolves.toBeTruthy()
  })

  it('set-edge-label 产物 parse 通过（含给无标签连线加标签）', async () => {
    const step1 = applyEdit(DEFAULT_DIAGRAM_SOURCE, flowchartParser, {
      type: 'set-edge-label',
      from: 'D',
      to: 'C',
      label: '回环',
    })
    expect(step1.ok).toBe(true)
    if (!step1.ok) return
    await expect(mermaid.parse(step1.source)).resolves.toBeTruthy()

    const step2 = applyEdit(step1.source, flowchartParser, {
      type: 'set-edge-label',
      from: 'B',
      to: 'C',
      label: '当然',
    })
    expect(step2.ok).toBe(true)
    if (!step2.ok) return
    expect(step2.source).toContain('B -- 当然 --> C[享受画图]')
    await expect(mermaid.parse(step2.source)).resolves.toBeTruthy()
  })

  it('端到端：默认模板 → 改节点文本 → 改连线标签 → 全程 parse 通过', async () => {
    const step1 = applyEdit(DEFAULT_DIAGRAM_SOURCE, flowchartParser, {
      type: 'set-node-text',
      nodeId: 'C',
      text: '开心画图',
    })
    expect(step1.ok).toBe(true)
    if (!step1.ok) return
    const step2 = applyEdit(step1.source, flowchartParser, {
      type: 'set-edge-label',
      from: 'B',
      to: 'D',
      label: '继续学',
    })
    expect(step2.ok).toBe(true)
    if (!step2.ok) return
    await expect(mermaid.parse(step2.source)).resolves.toBeTruthy()
    expect(step2.source).toContain('B -- 继续学 --> D[用 Visual MMD]')
    expect(step2.source).toContain('C[开心画图]')
  })
})

/** 覆盖全部意图的金样：每种编辑意图的产物都要能被 mermaid parse 通过 */
describe('金样合法性：全部编辑意图', () => {
  const BASE = `flowchart TD
    A[开始] --> B(处理)
    B -- 通过 --> C{判定}
    C -.-> D[归档]
    D ==> E((结束))

    subgraph 输入 [组一]
        S1[输入] --> S2
    end

    classDef hl fill:#f9f,stroke:#333
    class S1 hl
`

  async function expectGolden(source: string, intents: EditIntent[]): Promise<string> {
    let current = source
    for (const intent of intents) {
      const result = applyEdit(current, flowchartParser, intent)
      expect(result.ok, `意图 ${intent.type} 应用失败`).toBe(true)
      if (!result.ok) return ''
      await expect(mermaid.parse(result.source), `意图 ${intent.type} 产物不合法`).resolves.toBeTruthy()
      current = result.source
    }
    return current
  }

  it('改名 / 换形状 / 方向 / classDef', async () => {
    const final = await expectGolden(BASE, [
      { type: 'rename-node', nodeId: 'B', newId: 'proc' },
      { type: 'set-node-shape', nodeId: 'proc', shape: 'hexagon' },
      { type: 'set-node-text', nodeId: 'C', text: '最终判定' },
      { type: 'set-direction', direction: 'LR' },
      { type: 'set-classdef-prop', name: 'hl', prop: 'stroke-dasharray', value: '5 5' },
      { type: 'set-classdef-prop', name: 'hl', prop: 'fill', value: '' },
    ])
    expect(final).toContain('proc{{处理}}')
    expect(final).toContain('C{最终判定}')
    expect(final).toContain('classDef hl stroke:#333,stroke-dasharray:5 5')
  })

  it('连线类型 / 标签 / 长度 / 删除连线', async () => {
    await expectGolden(BASE, [
      { type: 'set-edge', from: 'B', to: 'C', lineStyle: 'thick' },
      { type: 'set-edge', from: 'C', to: 'D', bidirectional: true, label: '双向' },
      { type: 'set-edge', from: 'D', to: 'E', length: 2, head: 'circle' },
      { type: 'set-edge-label', from: 'B', to: 'C', label: '复核' },
      { type: 'delete-edge', from: 'C', to: 'D' },
    ])
  })

  it('增删节点（含链中删除）', async () => {
    await expectGolden(BASE, [
      { type: 'add-node', nodeId: 'N', text: '新节点', shape: 'rhombus' },
      { type: 'add-edge', from: 'N', to: 'A', label: '回流' },
      { type: 'delete-node', nodeId: 'S2' },
    ])
  })

  it('subgraph：改标题 / 新增 / 删除', async () => {
    const final = await expectGolden(BASE, [
      { type: 'set-subgraph-title', elementId: 'subgraph:1', title: '重命名组' },
      { type: 'add-subgraph', title: '新组' },
      { type: 'delete-subgraph', elementId: 'subgraph:1' },
    ])
    expect(final).not.toContain('subgraph 输入')
  })

  it('覆盖全部语法的大图：逐意图编辑全部 parse 通过', async () => {
    const big = `flowchart LR
    A[矩形] --> B(圆角)
    B --> C{菱形}
    C --> D[(圆柱)]
    D --> E((圆))
    subgraph 外层
        direction TB
        S1 --> S2
        subgraph 内层
            T1
        end
    end
    classDef 样式 fill:#ffe,stroke:#333,stroke-width:2px,color:#111
`
    await expectGolden(big, [
      { type: 'set-node-shape', nodeId: 'A', shape: 'double-circle' },
      { type: 'set-edge', from: 'B', to: 'C', lineStyle: 'dotted', label: '虚线' },
      { type: 'set-subgraph-title', elementId: 'subgraph:1', title: '改名外层' },
      { type: 'set-classdef-prop', name: '样式', prop: 'stroke-dasharray', value: '3 3' },
      { type: 'add-subgraph', title: '追加组', afterElementId: 'node:T1' },
      { type: 'rename-node', nodeId: 'S2', newId: 'S2renamed' },
    ])
  })
})
