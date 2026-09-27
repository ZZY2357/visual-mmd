import { describe, expect, it } from 'vitest'
import { applyEdit } from '../pipeline'
import { reassemble } from '../document'
import { flowchartParser } from '../flowchart'
import { buildFlowchartProjection } from '../../projection/flowchart-projection'

const SOURCE = `flowchart TD
    A[开始] --> B(处理)
    B --> C

    classDef 高亮 fill:#f9f,stroke:#333
    classDef 描边 stroke:#0f0
`

/** 解析 → 投影：节点 → 已应用样式 */
function appliedOf(source: string): Record<string, string[]> {
  const parsed = flowchartParser.parse(source)
  if (!parsed.ok) throw new Error(parsed.error.message)
  return buildFlowchartProjection(parsed.doc).appliedStyles
}

describe('class 语句解析（工单 02）', () => {
  it('verbatim identity：class 语句行原样往返', () => {
    const src = 'flowchart TD\n    A --> B\n    class A 高亮\n'
    const parsed = flowchartParser.parse(src)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(reassemble(parsed.doc)).toBe(src)
  })

  it('投影：节点 → 已应用样式（多节点共享语句展开到各节点）', () => {
    const src = 'flowchart TD\n    A --> B\n    class A 高亮\n    class A, B 描边\n'
    expect(appliedOf(src)).toEqual({
      A: ['高亮', '描边'],
      B: ['描边'],
    })
  })
})

describe('apply-class：勾选样式落码为 class 语句', () => {
  it('无同样式语句时在 classDef 行后新增独立行', () => {
    const result = applyEdit(SOURCE, flowchartParser, { type: 'apply-class', nodeId: 'B', className: '高亮' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toBe(
      `flowchart TD
    A[开始] --> B(处理)
    B --> C

    classDef 高亮 fill:#f9f,stroke:#333
    class B 高亮
    classDef 描边 stroke:#0f0
`,
    )
  })

  it('已有共享语句时追加节点 id，原分隔写法逐字保留', () => {
    const src = 'flowchart TD\n    A --> B\n    class A 高亮\n    classDef 高亮 fill:#f9f\n'
    const result = applyEdit(src, flowchartParser, { type: 'apply-class', nodeId: 'B', className: '高亮' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toBe('flowchart TD\n    A --> B\n    class A, B 高亮\n    classDef 高亮 fill:#f9f\n')
  })

  it('重复勾选幂等：源码不变', () => {
    const src = 'flowchart TD\n    A --> B\n    class A 高亮\n'
    const result = applyEdit(src, flowchartParser, { type: 'apply-class', nodeId: 'A', className: '高亮' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toBe(src)
  })

  it('一个节点可挂多个样式（两条语句）', () => {
    let src = SOURCE
    for (const name of ['高亮', '描边']) {
      const result = applyEdit(src, flowchartParser, { type: 'apply-class', nodeId: 'A', className: name })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      src = result.source
    }
    expect(src).toContain('class A 高亮')
    expect(src).toContain('class A 描边')
    expect(appliedOf(src)).toEqual({ A: ['高亮', '描边'] })
  })
})

describe('新节点落码位置（工单 08 补充）', () => {
  it('节点行位于 classDef 之后时，class 语句仍插在该 classDef 行后', () => {
    const src = 'flowchart TD\n    A --> B\n    classDef 高亮 fill:#f9f\n    C(新)\n'
    const result = applyEdit(src, flowchartParser, { type: 'apply-class', nodeId: 'C', className: '高亮' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toBe(
      'flowchart TD\n    A --> B\n    classDef 高亮 fill:#f9f\n    class C 高亮\n    C(新)\n',
    )
  })

  it('已存在 class 语句时，add-node 落在节点区（目标行后），class 语句区不动', () => {
    const src = 'flowchart TD\n    A --> B\n    class A 高亮\n    classDef 高亮 fill:#f9f\n'
    const withNode = applyEdit(src, flowchartParser, { type: 'add-node', nodeId: 'n1', text: '新节点', afterElementId: 'node:B' })
    expect(withNode.ok).toBe(true)
    if (!withNode.ok) return
    expect(withNode.source).toBe(
      'flowchart TD\n    A --> B\n    n1[新节点]\n    class A 高亮\n    classDef 高亮 fill:#f9f\n',
    )
    // 新节点随后应用样式：语句仍落到 classDef 行后，而非新节点行后
    const applied = applyEdit(withNode.source, flowchartParser, { type: 'apply-class', nodeId: 'n1', className: '高亮' })
    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    expect(applied.source).toBe(
      'flowchart TD\n    A --> B\n    n1[新节点]\n    class A, n1 高亮\n    classDef 高亮 fill:#f9f\n',
    )
  })

  it('键盘/菜单新增节点（连线意图）落在目标行后，与既有 class 语句互不干扰', () => {
    const src = 'flowchart TD\n    A --> B\n    class A 高亮\n    classDef 高亮 fill:#f9f\n'
    const result = applyEdit(src, flowchartParser, { type: 'add-node', nodeId: 'n1', text: 'n1', afterElementId: 'node:A' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('    A --> B\n    n1[n1]\n    class A 高亮')
    expect(appliedOf(result.source)).toEqual({ A: ['高亮'] })
  })
})

describe('unapply-class：取消勾选摘除节点 id 或整行删除', () => {
  it('语句只服务这一对时整行删除', () => {
    const result = applyEdit(SOURCE + '    class B 高亮\n', flowchartParser, {
      type: 'unapply-class',
      nodeId: 'B',
      className: '高亮',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 整行删除后残留缩进空行，与 delete-node 等既有删除意图的落码约定一致
    expect(result.source).toBe(SOURCE + '    \n')
  })

  it('多节点共享语句时只摘除该节点 id', () => {
    const src = 'flowchart TD\n    A --> B\n    class A, B 高亮\n    classDef 高亮 fill:#f9f\n'
    const result = applyEdit(src, flowchartParser, { type: 'unapply-class', nodeId: 'A', className: '高亮' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toBe('flowchart TD\n    A --> B\n    class B 高亮\n    classDef 高亮 fill:#f9f\n')
  })

  it('摘除首位节点后首个剩余项继承缩进、其余分隔原文不动', () => {
    const src = 'flowchart TD\n    A --> B\n    class A , B , C 高亮\n'
    const result = applyEdit(src, flowchartParser, { type: 'unapply-class', nodeId: 'A', className: '高亮' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('class B , C 高亮')
  })

  it('未应用时幂等：源码不变', () => {
    const result = applyEdit(SOURCE, flowchartParser, { type: 'unapply-class', nodeId: 'A', className: '高亮' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toBe(SOURCE)
  })
})

describe('delete-classdef：删除样式同步清理 class 语句', () => {
  it('classDef 行与引用它的全部 class 语句一起删除', () => {
    const src = SOURCE + '    class A 高亮\n    class A, B 描边\n'
    const result = applyEdit(src, flowchartParser, { type: 'delete-classdef', name: '高亮' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).not.toContain('classDef 高亮')
    expect(result.source).toContain('classDef 描边')
    expect(result.source).not.toContain('class A 高亮')
    expect(result.source).toContain('class A, B 描边')
    expect(appliedOf(result.source)).toEqual({ A: ['描边'], B: ['描边'] })
  })

  it('目标样式不存在时返回失败', () => {
    const result = applyEdit(SOURCE, flowchartParser, { type: 'delete-classdef', name: '不存在' })
    expect(result.ok).toBe(false)
  })
})
