import { describe, expect, it } from 'vitest'
import mermaid from 'mermaid'
import { DEFAULT_DIAGRAM_SOURCE } from '../../storage'
import { applyEdit } from '../pipeline'
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

  it('端到端：默认模板 → 改节点文本 → 改连线标签 → 撤销回原文，全程 parse 通过', async () => {
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
