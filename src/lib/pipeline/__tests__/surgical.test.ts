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

// ---------- 完整意图集合（工单 03） ----------

const RICH = `flowchart TD
    %% 注释保留
    A[开始] --> B(处理)
    B -- 通过 --> C{判定}
    D -.-> C
    D ==> E((结束))

    subgraph 分组 [我的子图]
        E[内部] --> F
        direction LR
    end

    classDef 高亮 fill:#f9f,stroke:#333, stroke-width:2px
    class E 高亮
`

describe('完整编辑意图：改名 / 换形状 / 连线类型 / 方向 / subgraph / classDef', () => {
  it('rename-node：文档中该节点 id 的全部出现被改名，其余逐字不变', () => {
    const result = applyEdit(RICH, flowchartParser, { type: 'rename-node', nodeId: 'B', newId: 'proc' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toBe(
      `flowchart TD
    %% 注释保留
    A[开始] --> proc(处理)
    proc -- 通过 --> C{判定}
    D -.-> C
    D ==> E((结束))

    subgraph 分组 [我的子图]
        E[内部] --> F
        direction LR
    end

    classDef 高亮 fill:#f9f,stroke:#333, stroke-width:2px
    class E 高亮
`,
    )
  })

  it('set-node-shape：只改目标节点出现的形状括号', () => {
    const result = applyEdit(RICH, flowchartParser, { type: 'set-node-shape', nodeId: 'B', shape: 'stadium' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('B([处理])')
    expect(result.source).toContain('A[开始] --> B([处理])')
    expect(result.source).toContain('C{判定}')
  })

  it('set-node-shape：id-only 节点获得形状并使用 id 作为文本', () => {
    const result = applyEdit(RICH, flowchartParser, { type: 'set-node-shape', nodeId: 'F', shape: 'circle' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('E[内部] --> F((F))')
  })

  it('set-edge：改线型为虚线（保留 inline 标签写法）', () => {
    const result = applyEdit(RICH, flowchartParser, { type: 'set-edge', from: 'B', to: 'C', lineStyle: 'dotted' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('B -. 通过 .-> C{判定}')
    expect(result.source).toContain('D ==> E((结束))')
  })

  it('set-edge：改长度（加长实线箭头）', () => {
    const result = applyEdit(RICH, flowchartParser, { type: 'set-edge', from: 'A', to: 'B', length: 3 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('A[开始] ----> B(处理)')
  })

  it('set-edge：改为双向 + 管道标签', () => {
    const result = applyEdit(RICH, flowchartParser, {
      type: 'set-edge',
      from: 'D',
      to: 'C',
      bidirectional: true,
      label: '管道',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('D <-.->|管道| C')
  })

  it('set-edge：改为圆形端点', () => {
    const result = applyEdit(RICH, flowchartParser, { type: 'set-edge', from: 'D', to: 'E', head: 'circle', tail: 'circle' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('D o==o E((结束))')
  })

  it('set-direction：只改声明行方向', () => {
    const result = applyEdit(RICH, flowchartParser, { type: 'set-direction', direction: 'LR' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source.startsWith('flowchart LR\n')).toBe(true)
    expect(result.source).toContain('direction LR\n    end')
  })

  it('set-classdef-prop：新增属性追加到末尾', () => {
    const result = applyEdit(RICH, flowchartParser, { type: 'set-classdef-prop', name: '高亮', prop: 'color', value: '#000' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('classDef 高亮 fill:#f9f,stroke:#333, stroke-width:2px,color:#000')
  })

  it('set-classdef-prop：改已有属性值保留分隔符写法', () => {
    const result = applyEdit(RICH, flowchartParser, { type: 'set-classdef-prop', name: '高亮', prop: 'stroke', value: 'red' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('classDef 高亮 fill:#f9f,stroke:red, stroke-width:2px')
  })

  it('set-classdef-prop：空值删除属性', () => {
    const result = applyEdit(RICH, flowchartParser, { type: 'set-classdef-prop', name: '高亮', prop: 'fill', value: '' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('classDef 高亮 stroke:#333, stroke-width:2px')
  })

  it('set-subgraph-title：保留 id 与方括号形式', () => {
    const result = applyEdit(RICH, flowchartParser, { type: 'set-subgraph-title', elementId: 'subgraph:1', title: '新标题' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('subgraph 分组 [新标题]')
  })

  it('add-node：插入在目标元素之后，缩进跟随目标行', () => {
    const result = applyEdit(RICH, flowchartParser, {
      type: 'add-node',
      nodeId: 'G',
      text: '新节点',
      shape: 'rounded',
      afterElementId: 'node:E#2',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('        E[内部] --> F\n        G(新节点)\n        direction LR')
  })

  it('delete-node：删除声明与触及的连线，链中节点删除后两端合并', () => {
    const chain = 'flowchart TD\n    A --> B --> C\n    B[独立]\n'
    const result = applyEdit(chain, flowchartParser, { type: 'delete-node', nodeId: 'B' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toBe('flowchart TD\n    A   --> C\n    \n')
  })

  it('delete-node：单连线行删除后其余节点行保留', () => {
    const result = applyEdit(RICH, flowchartParser, { type: 'delete-node', nodeId: 'F' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('        E[内部]  \n')
  })

  it('delete-edge：链中连线删除后两端经前一条连线合并', () => {
    const chain = 'flowchart TD\n    A --> B --> C --> D\n'
    const result = applyEdit(chain, flowchartParser, { type: 'delete-edge', from: 'B', to: 'C' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('    A -->     D\n')
  })

  it('delete-edge：只删目标连线行', () => {
    const result = applyEdit(RICH, flowchartParser, { type: 'delete-edge', from: 'D', to: 'C' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).not.toContain('D -.-> C')
    expect(result.source).toContain('D ==> E((结束))')
  })

  it('add-edge：插入新连线行（带标签）', () => {
    const result = applyEdit(RICH, flowchartParser, {
      type: 'add-edge',
      from: 'C',
      to: 'A',
      label: '回环',
      afterElementId: 'node:C',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('B -- 通过 --> C{判定}\n    C -->|回环| A\n')
  })

  it('add-subgraph：插入 open/end 结构', () => {
    const result = applyEdit(RICH, flowchartParser, { type: 'add-subgraph', title: '新组', afterElementId: 'node:C' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('B -- 通过 --> C{判定}\n    subgraph 新组\n    end\n')
  })

  it('delete-subgraph：删除 open 到 end 之间的全部元素', () => {
    const result = applyEdit(RICH, flowchartParser, { type: 'delete-subgraph', elementId: 'subgraph:1' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).not.toContain('subgraph 分组')
    expect(result.source).not.toContain('E[内部]')
    expect(result.source).toContain('classDef 高亮')
  })

  it('add-classdef：插入新的 classDef 行', () => {
    const result = applyEdit(RICH, flowchartParser, {
      type: 'add-classdef',
      name: '新样式',
      props: { fill: '#eee', color: '#111' },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('classDef 高亮 fill:#f9f')
    expect(result.source).toContain('classDef 新样式 fill:#eee,color:#111')
  })
})
