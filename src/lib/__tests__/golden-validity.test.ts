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

  it('packet 起步模板 parse 通过（more-diagrams 工单 16）', async () => {
    const { PACKET_TEMPLATE } = await import('../diagram-registry')
    await expect(mermaid.parse(PACKET_TEMPLATE)).resolves.toBeTruthy()
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

  it('xychart 起步模板 parse 通过（more-diagrams 工单 14）', async () => {
    const { XYCHART_TEMPLATE } = await import('../diagram-registry')
    await expect(mermaid.parse(XYCHART_TEMPLATE)).resolves.toBeTruthy()
  })

  it('architecture 起步模板 parse 通过（more-diagrams 工单 17）', async () => {
    const { ARCHITECTURE_TEMPLATE } = await import('../diagram-registry')
    await expect(mermaid.parse(ARCHITECTURE_TEMPLATE)).resolves.toBeTruthy()
  })

  it('treemap 起步模板 parse 通过（more-diagrams 工单 20）', async () => {
    const { TREEMAP_TEMPLATE } = await import('../diagram-registry')
    await expect(mermaid.parse(TREEMAP_TEMPLATE)).resolves.toBeTruthy()
  })

  it('venn 起步模板 parse 通过（more-diagrams 工单 21）', async () => {
    const { VENN_TEMPLATE } = await import('../diagram-registry')
    await expect(mermaid.parse(VENN_TEMPLATE)).resolves.toBeTruthy()
  })

  it('usecase 起步模板 parse 通过（more-diagrams 工单 26）', async () => {
    const { USECASE_TEMPLATE } = await import('../diagram-registry')
    await expect(mermaid.parse(USECASE_TEMPLATE)).resolves.toBeTruthy()
  })

  it('usecase 端到端编辑场景（工单 26 验收：加 actor → 加用例 → 改标签 → 改名 → 加边界 → 删用例）落在合法 mermaid 源码上', async () => {
    const { USECASE_TEMPLATE } = await import('../diagram-registry')
    const { usecaseParser } = await import('../pipeline/usecase')
    const { reassemble } = await import('../pipeline/document')
    const parse = (src: string) => {
      const r = usecaseParser.parse(src)
      if (!r.ok) throw new Error(`解析失败：${r.error.message}`)
      return r.doc
    }
    const apply = (doc: ReturnType<typeof parse>, intent: Parameters<typeof usecaseParser.resolveRewrites>[1]) => {
      const rewrites = usecaseParser.resolveRewrites(doc, intent)
      if (rewrites === null) throw new Error(`意图被拒绝：${JSON.stringify(intent)}`)
      return parse(reassemble(doc, rewrites))
    }

    let doc = parse(USECASE_TEMPLATE)
    doc = apply(doc, { type: 'add-actor', id: 'Guest', label: '访客' }) // 加参与者
    doc = apply(doc, { type: 'add-usecase', id: 'Browse', label: '浏览商品' }) // 加用例
    doc = apply(doc, { type: 'set-usecase-label', elementId: 'usecase:Browse', label: '浏览' }) // 改标签
    doc = apply(doc, { type: 'rename-usecase-id', elementId: 'usecase:Browse', id: 'Browsing' }) // 改名（连带重写引用）
    doc = apply(doc, { type: 'set-usecase-title', text: '商城用例' }) // 加标题
    doc = apply(doc, { type: 'delete-usecase-element', elementId: 'actor:Admin' }) // 删参与者（级联删引用）

    const source = doc.source
    expect(source).toContain('actor Guest("访客")')
    expect(source).toContain('Browsing("浏览")')
    expect(source).toContain('accTitle: 商城用例')
    expect(source).not.toContain('actor Admin')
    await expect(mermaid.parse(source)).resolves.toBeTruthy()
  })

  it('venn 端到端编辑场景（工单 21 验收：加集合 → 改标签 → 加交集 → 改尺寸 → 删集合）落在合法 mermaid 源码上', async () => {
    const { VENN_TEMPLATE } = await import('../diagram-registry')
    const { vennParser } = await import('../pipeline/venn')
    const { reassemble } = await import('../pipeline/document')
    const parse = (src: string) => {
      const r = vennParser.parse(src)
      if (!r.ok) throw new Error(`解析失败：${r.error.message}`)
      return r.doc
    }
    const apply = (doc: ReturnType<typeof parse>, intent: Parameters<typeof vennParser.resolveRewrites>[1]) => {
      const rewrites = vennParser.resolveRewrites(doc, intent)
      if (rewrites === null) throw new Error(`意图被拒绝：${JSON.stringify(intent)}`)
      return parse(reassemble(doc, rewrites))
    }

    let doc = parse(VENN_TEMPLATE)
    doc = apply(doc, { type: 'add-set', id: 'design' }) // 加集合（追加文档末尾）
    doc = apply(doc, { type: 'set-label', elementId: 'venn-set:design', label: '设计' }) // 改标签
    doc = apply(doc, { type: 'add-union', ids: ['design', 'frontend'], label: '交互' }) // 加交集
    doc = apply(doc, { type: 'set-size', elementId: 'venn-set:design', size: '20' }) // 改尺寸
    doc = apply(doc, { type: 'set-title', text: '能力矩阵' }) // 改标题（原地改既有 title 行）
    doc = apply(doc, { type: 'delete-area', elementId: 'venn-set:devops' }) // 删集合（级联删引用它的交集由管线负责）

    const source = doc.source
    expect(source).toContain('set design["设计"]: 20')
    expect(source).toContain('union design,frontend["交互"]')
    expect(source).toContain('title 能力矩阵')
    expect(source).not.toContain('set devops')
    await expect(mermaid.parse(source)).resolves.toBeTruthy()
  })

  it('treemap 端到端编辑场景（工单 20 验收：加分组 → 组内加叶子 → 改叶子数值 → 改名 → 删子树）落在合法 mermaid 源码上', async () => {
    const { TREEMAP_TEMPLATE } = await import('../diagram-registry')
    const { treemapParser } = await import('../pipeline/treemap')
    const { reassemble } = await import('../pipeline/document')
    const parse = (src: string) => {
      const r = treemapParser.parse(src)
      if (!r.ok) throw new Error(`解析失败：${r.error.message}`)
      return r.doc
    }
    const apply = (doc: ReturnType<typeof parse>, intent: Parameters<typeof treemapParser.resolveRewrites>[1]) => {
      const rewrites = treemapParser.resolveRewrites(doc, intent)
      if (rewrites === null) throw new Error(`意图被拒绝：${JSON.stringify(intent)}`)
      return parse(reassemble(doc, rewrites))
    }

    let doc = parse(TREEMAP_TEMPLATE)
    doc = apply(doc, { type: 'add-root', name: '售后' }) // 加顶层分组（treemap-node:9，锚点回退文档末元素）
    doc = apply(doc, { type: 'add-child', parentElementId: 'treemap-node:9', name: '回访', value: '3' }) // 组内加叶子（treemap-node:10）
    doc = apply(doc, { type: 'set-node-value', elementId: 'treemap-node:10', value: '42' }) // 改叶子数值
    doc = apply(doc, { type: 'set-node-name', elementId: 'treemap-node:10', name: '客户回访' }) // 改名
    doc = apply(doc, { type: 'add-sibling', elementId: 'treemap-node:10', name: '补偿', value: '7' }) // 加同级叶子（treemap-node:11）
    doc = apply(doc, { type: 'delete-node', elementId: 'treemap-node:2' }) // 删「运营」子树

    const source = doc.source
    expect(source).toContain('    "客户回访": 42')
    expect(source).toContain('    "补偿": 7')
    expect(source).toContain('"售后"')
    expect(source).not.toContain('"人力"')
    await expect(mermaid.parse(source)).resolves.toBeTruthy()
  })

  it('ishikawa 起步模板 parse 通过（more-diagrams 工单 22）', async () => {
    const { ISHIKAWA_TEMPLATE } = await import('../diagram-registry')
    await expect(mermaid.parse(ISHIKAWA_TEMPLATE)).resolves.toBeTruthy()
  })

  it('ishikawa 端到端编辑场景（工单 22 验收：改鱼头问题 → 加主因 → 主因下加分支 → 改分支文本 → 删主因子树）落在合法 mermaid 源码上', async () => {
    const { ISHIKAWA_TEMPLATE } = await import('../diagram-registry')
    const { ishikawaParser } = await import('../pipeline/ishikawa')
    const { reassemble } = await import('../pipeline/document')
    const parse = (src: string) => {
      const r = ishikawaParser.parse(src)
      if (!r.ok) throw new Error(`解析失败：${r.error.message}`)
      return r.doc
    }
    const apply = (doc: ReturnType<typeof parse>, intent: Parameters<typeof ishikawaParser.resolveRewrites>[1]) => {
      const rewrites = ishikawaParser.resolveRewrites(doc, intent)
      if (rewrites === null) throw new Error(`意图被拒绝：${JSON.stringify(intent)}`)
      return parse(reassemble(doc, rewrites))
    }

    let doc = parse(ISHIKAWA_TEMPLATE)
    // ishikawa-node:1 = 鱼头，2 = 人（主因），3/4 = 手抖/没按稳，5 = 设备……
    doc = apply(doc, { type: 'set-node-text', elementId: 'ishikawa-node:1', text: '成片发虚' }) // 改鱼头（连带图标题）
    doc = apply(doc, { type: 'add-sibling', elementId: 'ishikawa-node:5', text: '流程' }) // 加主因（文档序末位 = ishikawa-node:9）
    doc = apply(doc, { type: 'add-child', parentElementId: 'ishikawa-node:9', text: '未校准' }) // 主因下加分支（ishikawa-node:10）
    doc = apply(doc, { type: 'set-node-text', elementId: 'ishikawa-node:10', text: '未预对焦' }) // 改分支文本
    doc = apply(doc, { type: 'delete-node', elementId: 'ishikawa-node:2' }) // 删「人」子树（含手抖/没按稳）

    const source = doc.source
    expect(source).toContain('    成片发虚')
    expect(source).toContain('    流程')
    expect(source).toContain('        未预对焦')
    expect(source).not.toContain('手抖')
    await expect(mermaid.parse(source)).resolves.toBeTruthy()
  })

  it('architecture 端到端编辑场景（工单 17 验收：加 service → 连到另一 service 并带箭头 → 改标题 → 移入 group → 删除一条边）落在合法 mermaid 源码上', async () => {
    const { ARCHITECTURE_TEMPLATE } = await import('../diagram-registry')
    const { architectureParser } = await import('../pipeline/architecture')
    const { reassemble } = await import('../pipeline/document')
    const parse = (src: string) => {
      const r = architectureParser.parse(src)
      if (!r.ok) throw new Error(`解析失败：${r.error.message}`)
      return r.doc
    }
    const apply = (doc: ReturnType<typeof parse>, intent: Parameters<typeof architectureParser.resolveRewrites>[1]) => {
      const rewrites = architectureParser.resolveRewrites(doc, intent)
      if (rewrites === null) throw new Error(`意图被拒绝：${JSON.stringify(intent)}`)
      return parse(reassemble(doc, rewrites))
    }

    let doc = parse(ARCHITECTURE_TEMPLATE)
    doc = apply(doc, { type: 'add-service', id: 'api', title: 'api' }) // 加 service
    doc = apply(doc, { type: 'add-edge', from: 'api', to: 'db', arrow: 'target', fromPort: 'R', toPort: 'L' }) // 带箭头连线
    doc = apply(doc, { type: 'set-service-title', id: 'api', title: 'API 网关' }) // 改标题（双击内联同意图）
    doc = apply(doc, { type: 'set-service-parent', id: 'cache', parent: 'private' }) // 移入分组（改 in 字段）
    doc = apply(doc, { type: 'delete-edge', elementId: 'edge:3' }) // 删除一条边

    const source = doc.source
    expect(source).toContain('service api[API 网关]')
    expect(source).toContain('api:R --> L:db')
    expect(source).toContain('service cache(disk)[缓存] in private')
    expect(source).not.toContain('j1:R -- L:cache')
    await expect(mermaid.parse(source)).resolves.toBeTruthy()
  })

  it('wardley 起步模板 parse 通过（more-diagrams 工单 23）', async () => {
    const { WARDLEY_TEMPLATE } = await import('../diagram-registry')
    await expect(mermaid.parse(WARDLEY_TEMPLATE)).resolves.toBeTruthy()
  })

  it('wardley 端到端编辑场景（工单 23 验收：加组件 → 加锚点 → 改名 → 改坐标 → 加连线 → 删节点级联删连线/演化 → 删一条文档行）落在合法 mermaid 源码上', async () => {
    const { WARDLEY_TEMPLATE } = await import('../diagram-registry')
    const { wardleyParser } = await import('../pipeline/wardley')
    const { reassemble } = await import('../pipeline/document')
    const parse = (src: string) => {
      const r = wardleyParser.parse(src)
      if (!r.ok) throw new Error(`解析失败：${r.error.message}`)
      return r.doc
    }
    const apply = (doc: ReturnType<typeof parse>, intent: Parameters<typeof wardleyParser.resolveRewrites>[1]) => {
      const rewrites = wardleyParser.resolveRewrites(doc, intent)
      if (rewrites === null) throw new Error(`意图被拒绝：${JSON.stringify(intent)}`)
      return parse(reassemble(doc, rewrites))
    }

    let doc = parse(WARDLEY_TEMPLATE)
    doc = apply(doc, {
      type: 'add-node',
      nodeKind: 'component',
      name: '配送',
      coords: { visibility: '0.4', evolution: '0.2' },
    }) // 加组件（坐标默认或指定）
    doc = apply(doc, { type: 'add-node', nodeKind: 'anchor', name: '监管' }) // 加锚点（坐标落默认 [0.5, 0.5]）
    doc = apply(doc, { type: 'set-node-name', elementId: 'wardley-node:配送', name: '物流' }) // 改名（中文自动加引号）
    doc = apply(doc, {
      type: 'set-node-coords',
      elementId: 'wardley-node:物流',
      visibility: '0.3',
      evolution: '0.15',
    }) // 改坐标
    doc = apply(doc, { type: 'add-link', from: '茶', to: '物流' }) // 加连线
    doc = apply(doc, { type: 'delete-node', elementId: 'wardley-node:水壶' }) // 删节点（连带删触及连线与 evolve）
    doc = apply(doc, { type: 'delete-doc-line', elementId: 'wardley-doc:2' }) // 删 size 行

    const source = doc.source
    expect(source).toContain('component "物流" [0.3, 0.15]')
    expect(source).toContain('anchor "监管"')
    expect(source).toContain('"茶" -> "物流"')
    expect(source).not.toContain('"水壶"')
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

  it('packet 端到端编辑场景（工单 16 验收：加字段 → 改字段名 → 改位区间 → 删字段）落在合法 mermaid 源码上', async () => {
    const { PACKET_TEMPLATE } = await import('../diagram-registry')
    const { packetParser } = await import('../pipeline/packet')
    const { reassemble } = await import('../pipeline/document')
    const parse = (src: string) => {
      const r = packetParser.parse(src)
      if (!r.ok) throw new Error(`解析失败：${r.error.message}`)
      return r.doc
    }
    const apply = (doc: ReturnType<typeof parse>, intent: Parameters<typeof packetParser.resolveRewrites>[1]) => {
      const rewrites = packetParser.resolveRewrites(doc, intent)
      if (rewrites === null) throw new Error(`意图被拒绝：${JSON.stringify(intent)}`)
      return parse(reassemble(doc, rewrites))
    }

    let doc = parse(PACKET_TEMPLATE)
    doc = apply(doc, { type: 'add-field', name: '新字段', count: '8' }) // 加字段（+count 衔接前序）
    expect(doc.source).toContain('+8: "新字段"')
    doc = apply(doc, { type: 'set-field-name', elementId: 'field:4', name: '重点项' }) // 改名（原形态保留）
    expect(doc.source).toContain('+8: "重点项"')
    doc = apply(doc, { type: 'set-field-range', elementId: 'field:4', start: '48', end: '62' }) // 改位区间（绝对形态落码）
    expect(doc.source).toContain('48-62: "重点项"')
    doc = apply(doc, { type: 'delete-field', elementId: 'field:4' }) // 删末字段
    doc = apply(doc, { type: 'delete-field', elementId: 'field:2' }) // 删中间字段（后续 +count 自动衔接）

    const packetSource = doc.source
    expect(packetSource).not.toContain('Destination Port')
    expect(packetSource).toContain('+16: "Flags"')
    await expect(mermaid.parse(packetSource)).resolves.toBeTruthy()
  })

  it('xychart 端到端编辑场景（工单 14 验收：加 bar 系列 → 加数值 → 改系列名 → y 轴 range 改 0-->100 → 删除一条系列）落在合法 mermaid 源码上', async () => {
    const { XYCHART_TEMPLATE } = await import('../diagram-registry')
    const { xychartParser } = await import('../pipeline/xychart')
    const { reassemble } = await import('../pipeline/document')
    const parse = (src: string) => {
      const r = xychartParser.parse(src)
      if (!r.ok) throw new Error(`解析失败：${r.error.message}`)
      return r.doc
    }
    const apply = (doc: ReturnType<typeof parse>, intent: Parameters<typeof xychartParser.resolveRewrites>[1]) => {
      const rewrites = xychartParser.resolveRewrites(doc, intent)
      if (rewrites === null) throw new Error(`意图被拒绝：${JSON.stringify(intent)}`)
      return parse(reassemble(doc, rewrites))
    }

    let doc = parse(XYCHART_TEMPLATE)
    doc = apply(doc, { type: 'add-series', seriesType: 'bar', name: '预测', values: ['120', '180'] }) // 加 bar 系列
    doc = apply(doc, { type: 'add-series-value', elementId: 'series:3', value: '300' }) // 给系列加一个数值
    doc = apply(doc, { type: 'set-series-name', elementId: 'series:3', name: '预估' }) // 改系列名
    doc = apply(doc, { type: 'set-axis-range', axis: 'y', min: '0', max: '100' }) // y 轴 range 改 0-->100
    doc = apply(doc, { type: 'delete-series', elementId: 'series:1' }) // 删除一条系列

    const xychartSource = doc.source
    expect(xychartSource).toContain('bar "预估" [120, 180, 300]')
    expect(xychartSource).toContain('y-axis "销售额" 0 --> 100')
    expect(xychartSource).not.toContain('bar [200, 350, 150]')
    await expect(mermaid.parse(xychartSource)).resolves.toBeTruthy()
  })
})
