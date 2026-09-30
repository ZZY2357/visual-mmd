import { describe, expect, it } from 'vitest'
import mermaid from 'mermaid'
import { DEFAULT_DIAGRAM_SOURCE } from '../storage'

/**
 * 金样合法性（spec Testing Decisions 的雏形）：
 * 默认模板与常见合法源码必须能被 mermaid v12 实际 parse 通过。
 */
describe('金样合法性：默认图表模板能被 mermaid 渲染', () => {
  it('默认 flowchart 模板 parse 通过', async () => {
    await expect(mermaid.parse(DEFAULT_DIAGRAM_SOURCE)).resolves.toBeTruthy()
  })

  it('state 起步模板 parse 通过', async () => {
    const { STATE_TEMPLATE } = await import('../diagram-registry')
    await expect(mermaid.parse(STATE_TEMPLATE)).resolves.toBeTruthy()
  })

  it('kanban 起步模板 parse 通过（more-diagrams 工单 06）', async () => {
    const { KANBAN_TEMPLATE } = await import('../diagram-registry')
    await expect(mermaid.parse(KANBAN_TEMPLATE)).resolves.toBeTruthy()
  })

  it('sequence 源码 parse 通过', async () => {
    const src = `sequenceDiagram
    Alice->>Bob: 你好
    Bob-->>Alice: 你好呀
`
    await expect(mermaid.parse(src)).resolves.toBeTruthy()
  })

  it('非法源码 parse 抛错', async () => {
    await expect(mermaid.parse('flowchart TD\n    A --> {\n')).rejects.toThrow()
  })
})
