import { describe, expect, it } from 'vitest'
import { applyEdit } from '../pipeline'
import { flowchartParser } from '../flowchart'

const SOURCE = `flowchart TD
    %% 这条注释必须逐字保留
    A[开始] --> B{是否学会 Mermaid?}

    B -- 是 --> C[享受画图]
    B -- 否 --> D[用 Visual MMD]
    D --> C
`

describe('手术式改写：只重写目标元素 span，其余逐字不变', () => {
  it('set-node-text：只改目标节点的行', () => {
    const result = applyEdit(SOURCE, flowchartParser, {
      type: 'set-node-text',
      nodeId: 'C',
      text: '开心画图',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toBe(
      `flowchart TD
    %% 这条注释必须逐字保留
    A[开始] --> B{是否学会 Mermaid?}

    B -- 是 --> C[开心画图]
    B -- 否 --> D[用 Visual MMD]
    D --> C
`,
    )
  })

  it('set-node-text：目标节点只出现在连线中时改首个出现', () => {
    const result = applyEdit(SOURCE, flowchartParser, {
      type: 'set-node-text',
      nodeId: 'A',
      text: '起点',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('A[起点] -->')
    expect(result.source).toContain('%% 这条注释必须逐字保留')
  })

  it('set-edge-label：带标签连线只改标签文本（保留箭头与间距写法）', () => {
    const result = applyEdit(SOURCE, flowchartParser, {
      type: 'set-edge-label',
      from: 'B',
      to: 'D',
      label: '才不',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('B -- 才不 --> D[用 Visual MMD]')
    // 同 from/to 的其他连线不受影响
    expect(result.source).toContain('B -- 是 --> C[享受画图]')
  })

  it('set-edge-label：无标签连线加上标签（其余文本不变）', () => {
    const result = applyEdit(SOURCE, flowchartParser, {
      type: 'set-edge-label',
      from: 'D',
      to: 'C',
      label: '随后',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('D -- 随后 --> C')
    expect(result.source).toContain('%% 这条注释必须逐字保留')
  })

  it('目标元素不存在时返回错误', () => {
    const result = applyEdit(SOURCE, flowchartParser, {
      type: 'set-node-text',
      nodeId: '不存在',
      text: 'x',
    })
    expect(result.ok).toBe(false)
  })

  it('set-node-text 到空白文本清空形状内容', () => {
    const result = applyEdit(SOURCE, flowchartParser, {
      type: 'set-node-text',
      nodeId: 'B',
      text: '',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('B{}')
  })
})
