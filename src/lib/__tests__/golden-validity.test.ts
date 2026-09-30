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

  it('gitGraph 起步模板 parse 通过（more-diagrams 工单 04）', async () => {
    const { GITGRAPH_TEMPLATE } = await import('../diagram-registry')
    await expect(mermaid.parse(GITGRAPH_TEMPLATE)).resolves.toBeTruthy()
  })

  it('timeline 起步模板 parse 通过', async () => {
    const { TIMELINE_TEMPLATE } = await import('../diagram-registry')
    await expect(mermaid.parse(TIMELINE_TEMPLATE)).resolves.toBeTruthy()
  })

  it('kanban 起步模板 parse 通过（more-diagrams 工单 06）', async () => {
    const { KANBAN_TEMPLATE } = await import('../diagram-registry')
    await expect(mermaid.parse(KANBAN_TEMPLATE)).resolves.toBeTruthy()
  })

  it('block 起步模板 parse 通过（more-diagrams 工单 09）', async () => {
    const { BLOCK_TEMPLATE } = await import('../diagram-registry')
    await expect(mermaid.parse(BLOCK_TEMPLATE)).resolves.toBeTruthy()
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

  it('gitGraph 端到端编辑场景（工单 04）落在合法 mermaid 源码上', async () => {
    const { GITGRAPH_TEMPLATE } = await import('../diagram-registry')
    const { gitgraphParser } = await import('../pipeline/gitgraph')
    const { reassemble } = await import('../pipeline/document')
    const parse = (src: string) => {
      const r = gitgraphParser.parse(src)
      if (!r.ok) throw new Error(`解析失败：${r.error.message}`)
      return r.doc
    }
    const apply = (doc: ReturnType<typeof parse>, intent: Parameters<typeof gitgraphParser.resolveRewrites>[1]) => {
      const rewrites = gitgraphParser.resolveRewrites(doc, intent)
      if (rewrites === null) throw new Error(`意图被拒绝：${intent.type}`)
      return parse(reassemble(doc, rewrites))
    }

    let doc = parse(GITGRAPH_TEMPLATE)
    doc = apply(doc, { type: 'add-commit', id: 'extra' }) // 加提交
    doc = apply(doc, { type: 'add-branch', name: 'dev' }) // 加分支（创建并 checkout）
    doc = apply(doc, { type: 'add-commit', id: 'dev-1' }) // 分支上加提交
    doc = apply(doc, { type: 'add-checkout', branch: 'main' }) // 切回 main
    doc = apply(doc, { type: 'add-merge', branch: 'dev' }) // merge 回 main
    doc = apply(doc, { type: 'set-commit-params', elementId: 'commit:1', changes: { tag: 'v2' } }) // 加 tag
    doc = apply(doc, { type: 'delete-commit', elementId: 'commit:2' }) // 删提交

    await expect(mermaid.parse(doc.source)).resolves.toBeTruthy()
  })

  it('block 端到端编辑场景（工单 09）落在合法 mermaid 源码上', async () => {
    const { BLOCK_TEMPLATE } = await import('../diagram-registry')
    const { blockParser } = await import('../pipeline/block')
    const { reassemble } = await import('../pipeline/document')
    const parse = (src: string) => {
      const r = blockParser.parse(src)
      if (!r.ok) throw new Error(`解析失败：${r.error.message}`)
      return r.doc
    }
    const apply = (doc: ReturnType<typeof parse>, intent: Parameters<typeof blockParser.resolveRewrites>[1]) => {
      const rewrites = blockParser.resolveRewrites(doc, intent)
      if (rewrites === null) throw new Error(`意图被拒绝：${JSON.stringify(intent)}`)
      return parse(reassemble(doc, rewrites))
    }

    let doc = parse(BLOCK_TEMPLATE)
    doc = apply(doc, { type: 'add-node', id: 'f', shape: 'round', label: '重试' }) // 加块节点
    doc = apply(doc, { type: 'add-edge', from: 'c', to: 'f', line: 'x--x' }) // 拉一条异或边
    doc = apply(doc, { type: 'set-edge', elementId: 'edge:3', changes: { label: '失败' } }) // 边加标签
    doc = apply(doc, { type: 'set-node-shape', id: 'f', shape: 'diamond' }) // 改形状
    doc = apply(doc, { type: 'set-node-width', id: 'a', width: 2 }) // 跨列 :n
    doc = apply(doc, { type: 'add-group', id: 'g2' }) // 加嵌套块
    doc = apply(doc, { type: 'add-node', id: 'h', shape: 'square', label: '归档', parentGroupId: 'g2' }) // 落进组内
    doc = apply(doc, { type: 'set-columns', groupId: 'g2', value: 2 }) // 组内列数
    doc = apply(doc, { type: 'add-space', width: 2 }) // 布局空位
    doc = apply(doc, { type: 'set-title', value: '处理流水线' }) // 标题
    doc = apply(doc, { type: 'set-node-label', id: 'b', label: '数据校验' }) // 改标签
    doc = apply(doc, { type: 'delete-node', id: 'c' }) // 删块（级联删触及边）
    doc = apply(doc, { type: 'delete-group', id: 'group1' }) // 删嵌套块

    await expect(mermaid.parse(doc.source)).resolves.toBeTruthy()
  })
})
