import { describe, expect, it } from 'vitest'
import { applyEdit } from '../pipeline'
import { flowchartParser } from '../flowchart'

describe('管线错误处理：解析失败返回含行号的错误', () => {
  it('形状括号未闭合：错误指向所在行（1 起始）', () => {
    const source = 'flowchart TD\n    A --> B\n    C[坏\n'
    const result = applyEdit(source, flowchartParser, {
      type: 'set-node-text',
      nodeId: 'A',
      text: 'x',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.line).toBe(3)
    expect(result.error.message).not.toBe('')
  })

  it('缺少 graph 声明：错误指向违规行', () => {
    const result = applyEdit('A --> B\n', flowchartParser, {
      type: 'set-node-text',
      nodeId: 'A',
      text: 'x',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.line).toBe(1)
  })

  it('节点声明出现在声明行之前：报错并给出行号', () => {
    const source = '    A --> B\nflowchart TD\n'
    const result = applyEdit(source, flowchartParser, {
      type: 'set-node-text',
      nodeId: 'A',
      text: 'x',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.line).toBe(1)
  })

  it('解析失败时管线不产出新源码（投影停留在最近一次合法状态的前提）', () => {
    const result = applyEdit('flowchart TD\n    A --> {\n', flowchartParser, {
      type: 'set-node-text',
      nodeId: 'A',
      text: 'x',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect('source' in result).toBe(false)
  })
})
