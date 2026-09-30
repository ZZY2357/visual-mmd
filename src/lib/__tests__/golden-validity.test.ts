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

  it('journey 起步模板 parse 通过（more-diagrams 工单 08）', async () => {
    const { JOURNEY_TEMPLATE } = await import('../diagram-registry')
    await expect(mermaid.parse(JOURNEY_TEMPLATE)).resolves.toBeTruthy()
  })

  it('pie 起步模板 parse 通过（more-diagrams 工单 10）', async () => {
    const { PIE_TEMPLATE } = await import('../diagram-registry')
    await expect(mermaid.parse(PIE_TEMPLATE)).resolves.toBeTruthy()
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

  it('journey 端到端编辑场景（工单 08）落在合法 mermaid 源码上', async () => {
    const { JOURNEY_TEMPLATE } = await import('../diagram-registry')
    const { journeyParser } = await import('../pipeline/journey')
    const { reassemble } = await import('../pipeline/document')
    const parse = (src: string) => {
      const r = journeyParser.parse(src)
      if (!r.ok) throw new Error(`解析失败：${r.error.message}`)
      return r.doc
    }
    const apply = (doc: ReturnType<typeof parse>, intent: Parameters<typeof journeyParser.resolveRewrites>[1]) => {
      const rewrites = journeyParser.resolveRewrites(doc, intent)
      if (rewrites === null) throw new Error(`意图被拒绝：${JSON.stringify(intent)}`)
      return parse(reassemble(doc, rewrites))
    }

    let doc = parse(JOURNEY_TEMPLATE)
    doc = apply(doc, { type: 'add-section', name: '售后' }) // 加分组（落文档末尾）
    doc = apply(doc, { type: 'add-task', name: '申请退款', score: 2, actors: ['用户', '客服'], sectionElementId: 'section:3' }) // 加任务
    doc = apply(doc, { type: 'set-task-name', elementId: 'task:5', name: '发起退单' }) // 改任务名
    doc = apply(doc, { type: 'set-task-score', elementId: 'task:5', score: 5 }) // score 2 → 5
    doc = apply(doc, { type: 'set-task-actors', elementId: 'task:5', actors: ['用户', '平台', '客服'] }) // 改 actors
    doc = apply(doc, { type: 'delete-section', elementId: 'section:1' }) // 删分组（级联删任务）

    const source = doc.source
    expect(source).toContain('发起退单: 5: 用户, 平台, 客服')
    expect(source).not.toContain('访问首页')
    await expect(mermaid.parse(source)).resolves.toBeTruthy()
  })
})
