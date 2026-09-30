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

  it('block 起步模板 parse 通过（more-diagrams 工单 09）', async () => {
    const { BLOCK_TEMPLATE } = await import('../diagram-registry')
    await expect(mermaid.parse(BLOCK_TEMPLATE)).resolves.toBeTruthy()
  })

  it('sankey 起步模板 parse 通过（more-diagrams 工单 13）', async () => {
    const { SANKEY_TEMPLATE } = await import('../diagram-registry')
    await expect(mermaid.parse(SANKEY_TEMPLATE)).resolves.toBeTruthy()
  })

  it('gantt 起步模板 parse 通过（more-diagrams 工单 11）', async () => {
    const { GANTT_TEMPLATE } = await import('../diagram-registry')
    await expect(mermaid.parse(GANTT_TEMPLATE)).resolves.toBeTruthy()
  })

  it('quadrant 起步模板 parse 通过（more-diagrams 工单 12）', async () => {
    const { QUADRANT_TEMPLATE } = await import('../diagram-registry')
    await expect(mermaid.parse(QUADRANT_TEMPLATE)).resolves.toBeTruthy()
  })

  it('quadrant 端到端编辑场景（工单 12）落在合法 mermaid 源码上', async () => {
    const { QUADRANT_TEMPLATE } = await import('../diagram-registry')
    const { quadrantParser } = await import('../pipeline/quadrant')
    const { reassemble } = await import('../pipeline/document')
    const parse = (src: string) => {
      const r = quadrantParser.parse(src)
      if (!r.ok) throw new Error(`解析失败：${r.error.message}`)
      return r.doc
    }
    const apply = (doc: ReturnType<typeof parse>, intent: Parameters<typeof quadrantParser.resolveRewrites>[1]) => {
      const rewrites = quadrantParser.resolveRewrites(doc, intent)
      if (rewrites === null) throw new Error(`意图被拒绝：${JSON.stringify(intent)}`)
      return parse(reassemble(doc, rewrites))
    }

    // 工单端到端验收场景：加点 → 改点坐标 → 加 radius 样式 → 改点文本 →
    // 改 quadrant-2 标题 → 删除一个点
    let doc = parse(QUADRANT_TEMPLATE)
    doc = apply(doc, { type: 'add-point', text: '新点', x: '0.5', y: '0.5' }) // 加点
    doc = apply(doc, { type: 'set-point-coords', elementId: 'point:4', x: '0.8', y: '0.2' }) // 改坐标
    doc = apply(doc, { type: 'set-point-style', elementId: 'point:4', field: 'radius', value: '12' }) // 加样式
    doc = apply(doc, { type: 'set-point-text', elementId: 'point:4', text: '重点项' }) // 改文本
    doc = apply(doc, { type: 'set-quadrant-text', elementId: 'quadrant:2', text: '排期跟进' }) // 改象限标题
    doc = apply(doc, { type: 'delete-point', elementId: 'point:1' }) // 删除点

    const source = doc.source
    expect(source).toContain('重点项: [0.8, 0.2] radius: 12')
    expect(source).toContain('quadrant-2 排期跟进')
    expect(source).not.toContain('Campaign A:')
    await expect(mermaid.parse(source)).resolves.toBeTruthy()
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

  it('sankey 端到端编辑场景（工单 13 验收：加链路 → 改 value → 重命名节点 → 删链路）落在合法 mermaid 源码上', async () => {
    const { SANKEY_TEMPLATE } = await import('../diagram-registry')
    const { sankeyParser } = await import('../pipeline/sankey')
    const { reassemble } = await import('../pipeline/document')
    const parse = (src: string) => {
      const r = sankeyParser.parse(src)
      if (!r.ok) throw new Error(`解析失败：${r.error.message}`)
      return r.doc
    }
    const apply = (doc: ReturnType<typeof parse>, intent: Parameters<typeof sankeyParser.resolveRewrites>[1]) => {
      const rewrites = sankeyParser.resolveRewrites(doc, intent)
      if (rewrites === null) throw new Error(`意图被拒绝：${JSON.stringify(intent)}`)
      return parse(reassemble(doc, rewrites))
    }

    let doc = parse(SANKEY_TEMPLATE)
    doc = apply(doc, { type: 'add-link', source: 'grid', target: 'factory', value: '5' }) // 加链路
    doc = apply(doc, { type: 'set-link', elementId: 'link:1', changes: { value: '12.5' } }) // 改 value
    // 重命名节点：全部链路行同步改写（含带引号含逗号的 source 列）
    doc = apply(doc, { type: 'rename-node', name: 'electricity', newName: 'power' })
    expect(doc.source).toContain('power,grid,12.5')
    expect(doc.source).toContain('power,"gas, natural",6')
    expect(doc.source).not.toContain('electricity')
    doc = apply(doc, { type: 'delete-link', elementId: 'link:2' }) // 删链路

    const source = doc.source
    expect(source).not.toContain('power,"gas, natural"')
    await expect(mermaid.parse(source)).resolves.toBeTruthy()
  })
})
