import { describe, expect, it } from 'vitest'
import { agentflowParser } from '../../pipeline/agentflow'
import { buildAgentflowProjection, resolveAgentflowSelection } from '../agentflow-projection'

/**
 * agentflow 投影测试（more-diagrams 工单 27）：节点名字即身份 + 去重、边位置序身份
 * （含重复边 `#n`）、容器配对与归属（flow 分组 / global 豁免）、文档行、方向、
 * 选中回落（ADR-0008/0012/0016）。
 */

const SOURCE = `agentflow-beta LR
  brief["Release brief"]@{ shape: input }
  flow writer["Drafting Agent"]
    draft["Draft the notes"]@{ shape: task }
    lookup["changelog_search"]@{ shape: tool }
    draft --> lookup
    draft -.- guide["Tone of voice"]
  end
  global
    shared["shared ctx"]@{ shape: refdoc }
  end
  title 发布流程
  a --> b
  a --> b
  c --x a
`

function projectionOf(source: string) {
  const parsed = agentflowParser.parse(source)
  if (!parsed.ok) throw new Error(`解析失败：${parsed.error.message}`)
  return buildAgentflowProjection(parsed.doc)
}

describe('buildAgentflowProjection（工单 27）', () => {
  const projection = projectionOf(SOURCE)

  it('方向：声明行原文；未写时为空串（mermaid 默认 TB）', () => {
    expect(projection.direction).toBe('LR')
    expect(projectionOf('agentflow-beta\n').direction).toBe('')
  })

  it('节点名字即身份：同名多次出现只入投影一次（去重，文档序）', () => {
    expect(projection.nodes.map((n) => n.nodeId)).toEqual([
      'brief',
      'draft',
      'lookup',
      'guide',
      'shared',
      'a',
      'b',
      'c',
    ])
  })

  it('节点显示文本 / 形状 / connector 标记', () => {
    const byId = new Map(projection.nodes.map((n) => [n.nodeId, n]))
    expect(byId.get('brief')).toMatchObject({ text: 'Release brief', shape: 'input', isConnector: false })
    expect(byId.get('draft')).toMatchObject({ text: 'Draft the notes', shape: 'task' })
    // guide 只在边链里首现 `guide["Tone of voice"]`（无元数据）→ shape 为 null
    expect(byId.get('guide')).toMatchObject({ text: 'Tone of voice', shape: null })
    // a / b / c 无形状文本（`a --> b` 隐式节点）→ text / shape 皆 null
    expect(byId.get('a')).toMatchObject({ text: null, shape: null })
  })

  it('容器：flow 开行 id 即 elementId、标题去引号；global 无 id 无标题', () => {
    expect(projection.containers).toEqual([
      { elementId: 'container:flow:2', keyword: 'flow', id: 'writer', title: 'Drafting Agent' },
      { elementId: 'container:global:12', keyword: 'global', id: null, title: null },
    ])
  })

  it('容器归属：flow 分组内节点 containerId = 该开行 elementId；顶层与 global 块内节点为 null', () => {
    const byId = new Map(projection.nodes.map((n) => [n.nodeId, n]))
    expect(byId.get('draft')?.containerId).toBe('container:flow:2')
    expect(byId.get('lookup')?.containerId).toBe('container:flow:2')
    expect(byId.get('guide')?.containerId).toBe('container:flow:2')
    expect(byId.get('brief')?.containerId).toBeNull()
    expect(byId.get('a')?.containerId).toBeNull()
  })

  it('global 块内节点保持顶层：containerId 为 null、inGlobal 为 true', () => {
    const shared = projection.nodes.find((n) => n.nodeId === 'shared')
    expect(shared).toMatchObject({ containerId: null, inGlobal: true })
    expect(projection.nodes.find((n) => n.nodeId === 'draft')?.inGlobal).toBe(false)
    expect(projection.nodes.find((n) => n.nodeId === 'brief')?.inGlobal).toBe(false)
  })

  it('边位置序身份 + 三种语义：重复边加 `#n` 后缀（ADR-0012）', () => {
    expect(projection.edges.map((e) => [e.elementId, e.from, e.to, e.edgeKind])).toEqual([
      ['edge:draft->lookup', 'draft', 'lookup', 'sequence'],
      ['edge:draft->guide', 'draft', 'guide', 'reference'],
      ['edge:a->b', 'a', 'b', 'sequence'],
      ['edge:a->b#2', 'a', 'b', 'sequence'],
      ['edge:c->a', 'c', 'a', 'failure'],
    ])
  })

  it('边标签：行内标签写入 label（无标签为空串）', () => {
    const labeled = projectionOf('agentflow-beta\na -- yes --> b\na -. 参考 .- c\na -- 否 --x d\n')
    expect(labeled.edges.map((e) => [e.elementId, e.edgeKind, e.label])).toEqual([
      ['edge:a->b', 'sequence', 'yes'],
      ['edge:a->c', 'reference', '参考'],
      ['edge:a->d', 'failure', '否'],
    ])
  })

  it('文档级属性行整行可寻址（逐字保留的识别不了的行）', () => {
    expect(projection.docLines).toEqual([{ elementId: 'agentflow-doc:1', text: '  title 发布流程' }])
  })

  it('nextEdgeOrdinal = 边总数 + 1', () => {
    expect(projection.nextEdgeOrdinal).toBe(6)
  })

  it('空文档：nodes / edges / containers / docLines 皆空', () => {
    const empty = projectionOf('agentflow-beta\n')
    expect(empty.nodes).toEqual([])
    expect(empty.edges).toEqual([])
    expect(empty.containers).toEqual([])
    expect(empty.docLines).toEqual([])
    expect(empty.nextEdgeOrdinal).toBe(1)
  })

  it('嵌套 flow：内层节点归属最近的开行（外层不含它）', () => {
    const nested = projectionOf(
      'agentflow-beta\nflow outer["外"]\n  a["a"]\n  flow inner["内"]\n    b["b"]\n  end\nend\n',
    )
    const byId = new Map(nested.nodes.map((n) => [n.nodeId, n]))
    expect(byId.get('a')?.containerId).toBe('container:flow:1')
    expect(byId.get('b')?.containerId).toBe('container:flow:3')
  })

  it('connector 声明节点：isConnector 为 true', () => {
    const withConnector = projectionOf('agentflow-beta\nconnector api["API"]@{ shape: connector }\n')
    expect(withConnector.nodes[0]).toMatchObject({ nodeId: 'api', isConnector: true, shape: 'connector' })
  })
})

describe('resolveAgentflowSelection（工单 27）', () => {
  const projection = projectionOf(SOURCE)

  it('存在的节点 / 边 / 容器 / 文档行原样返回；diagram 原样返回', () => {
    expect(resolveAgentflowSelection(projection, { kind: 'agentflow-node', nodeId: 'draft' })).toEqual({
      kind: 'agentflow-node',
      nodeId: 'draft',
    })
    expect(resolveAgentflowSelection(projection, { kind: 'agentflow-edge', elementId: 'edge:a->b#2' })).toEqual({
      kind: 'agentflow-edge',
      elementId: 'edge:a->b#2',
    })
    expect(resolveAgentflowSelection(projection, { kind: 'agentflow-flow', elementId: 'container:flow:2' })).toEqual({
      kind: 'agentflow-flow',
      elementId: 'container:flow:2',
    })
    expect(resolveAgentflowSelection(projection, { kind: 'agentflow-doc', elementId: 'agentflow-doc:1' })).toEqual({
      kind: 'agentflow-doc',
      elementId: 'agentflow-doc:1',
    })
    expect(resolveAgentflowSelection(projection, { kind: 'diagram' })).toEqual({ kind: 'diagram' })
  })

  it('已不存在的节点 / 边 / 容器 / 文档行 / null / 别种选中 → null', () => {
    expect(resolveAgentflowSelection(projection, { kind: 'agentflow-node', nodeId: '__无__' })).toBeNull()
    expect(resolveAgentflowSelection(projection, { kind: 'agentflow-edge', elementId: 'edge:x->y' })).toBeNull()
    expect(resolveAgentflowSelection(projection, { kind: 'agentflow-flow', elementId: 'container:flow:99' })).toBeNull()
    expect(resolveAgentflowSelection(projection, { kind: 'agentflow-doc', elementId: 'agentflow-doc:99' })).toBeNull()
    expect(resolveAgentflowSelection(projection, null)).toBeNull()
    expect(resolveAgentflowSelection(projection, { kind: 'node', nodeId: 'A' })).toBeNull()
  })
})
