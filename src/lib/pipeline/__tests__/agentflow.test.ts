import { describe, expect, it } from 'vitest'
import {
  agentflowParser,
  isValidNewNodeId,
  withShapeMeta,
  type AgentflowEdgeData,
  type AgentflowNodeData,
  type AgentflowContainerOpenData,
  type AgentflowHeaderData,
} from '../agentflow'
import { reassemble, type SourceDocument } from '../document'

/**
 * agentflow-beta 解析器测试（more-diagrams 工单 27，语法事实以
 * .scratch/more-diagrams/research/agentflow.md（含 §8 补勘察复核）为准）：
 * 解析（verbatim identity）、节点/边/容器归类、意图往返、逐字保留、非法源码边界。
 */

function parseOk(source: string): SourceDocument {
  const result = agentflowParser.parse(source)
  if (!result.ok) throw new Error(`解析失败：${result.error.message}（行 ${result.error.line}）`)
  return result.doc
}

/** 起点模板（research §7）——六形状 / 两 flow / 三边算子 / 链式 / 元数据 */
const SAMPLE = `agentflow-beta TB
  brief["Release brief"]@{ shape: input }
  flow writer["Drafting Agent"]
    draft["Draft the notes"]@{ shape: task }
    lookup["changelog_search"]@{ shape: tool }
    guide["Tone of voice"]@{ shape: refdoc }
    draft --> lookup
    draft -.- guide
  end
  flow reviewer["Review Agent"]
    check["Check the claims"]@{ shape: task }
    ok["Accurate?"]@{ shape: decision }
    check --> ok
  end
  publish["Publish"]@{ shape: action }
  brief --> writer
  writer --> reviewer
  ok --> publish
`

const nodesOf = (doc: SourceDocument): AgentflowNodeData[] =>
  doc.elements.filter((p) => p.element.kind === 'agentflow-node').map((p) => p.element as AgentflowNodeData)
const edgesOf = (doc: SourceDocument): AgentflowEdgeData[] =>
  doc.elements.filter((p) => p.element.kind === 'agentflow-edge').map((p) => p.element as AgentflowEdgeData)
const flowsOf = (doc: SourceDocument): AgentflowContainerOpenData[] =>
  doc.elements
    .filter((p) => p.element.kind === 'agentflow-container-open')
    .map((p) => p.element as AgentflowContainerOpenData)

describe('agentflow 解析（more-diagrams 工单 27）', () => {
  it('verbatim identity：解析后不做修改再重组装，输出与输入逐字相同', () => {
    expect(reassemble(parseOk(SAMPLE))).toBe(SAMPLE)
  })

  it('声明行：关键字与方向（三形态：有方向 / 无方向 / 多空白）', () => {
    const withDir = parseOk('agentflow-beta TB\n  a["A"]\n')
    const header = withDir.elements[0].element as AgentflowHeaderData
    expect(header).toMatchObject({ kind: 'agentflow-header', keyword: 'agentflow-beta', direction: 'TB' })

    const noDir = parseOk('agentflow-beta\n  a["A"]\n')
    const h2 = noDir.elements[0].element as AgentflowHeaderData
    expect(h2.direction).toBe('')

    // LR 方向（research §8.1 实测支持）
    const lr = parseOk('agentflow-beta LR\n  a["A"]\n')
    expect((lr.elements[0].element as AgentflowHeaderData).direction).toBe('LR')
  })

  it('节点行：id + 形状 + 单行元数据逐字拆解', () => {
    const doc = parseOk(SAMPLE)
    const brief = nodesOf(doc).find((n) => n.nodeId === 'brief')!
    expect(brief).toMatchObject({ text: 'Release brief', openRaw: '[', closeRaw: ']' })
    expect(brief.metaRaw).toBe('@{ shape: input }')
    expect(brief.metaGap).toBe('')
  })

  it('节点行：无形状只有 id（隐式引用）', () => {
    const doc = parseOk('agentflow-beta TB\n  a\n  b["B"]\n  a --> b\n')
    const a = nodesOf(doc).find((n) => n.nodeId === 'a')!
    expect(a.text).toBeNull()
    expect(a.openRaw).toBe('')
  })

  it('connector 声明：connector 前缀节点', () => {
    const src = `agentflow-beta TB
  connector github["GitHub API"]
  github@{ protocol: "https", endpoint: "https://api.github.com" }
`
    const doc = parseOk(src)
    const gh = nodesOf(doc).find((n) => n.nodeId === 'github')!
    expect(gh.isConnector).toBe(true)
    expect(gh.text).toBe('GitHub API')
    expect(reassemble(doc)).toBe(src)
  })

  it('边：三种算子（sequence / reference / failure）与链式', () => {
    const src = `agentflow-beta TB
  a["A"]
  b["B"]
  c["C"]
  a --> b
  b -.- c
  c --x a
  a --> b --> c
`
    const doc = parseOk(src)
    const edges = edgesOf(doc)
    expect(edges.map((e) => e.edgeKind)).toEqual([
      'sequence',
      'reference',
      'failure',
      'sequence',
      'sequence',
    ])
    // 位置序身份 edge:N（ADR-0012）
    const edgeIds = doc.elements.filter((p) => p.element.kind === 'agentflow-edge').map((p) => p.id)
    expect(edgeIds).toEqual([
      'edge:a->b',
      'edge:b->c',
      'edge:c->a',
      'edge:a->b#2',
      'edge:b->c#2',
    ])
    expect(reassemble(doc)).toBe(src)
  })

  it('边：行内标签（`-- yes -->` / `-. 说明 .-` / `-- 否 --x`）', () => {
    const src = `agentflow-beta TB
  check["C"]
  ok["OK"]
  fix["F"]
  check -- yes --> ok
  check -. see docs .- ok
  check -- no --x fix
`
    const doc = parseOk(src)
    const edges = edgesOf(doc)
    expect(edges[0]).toMatchObject({ label: 'yes', edgeKind: 'sequence' })
    expect(edges[1]).toMatchObject({ label: 'see docs', edgeKind: 'reference' })
    expect(edges[2]).toMatchObject({ label: 'no', edgeKind: 'failure' })
    expect(reassemble(doc)).toBe(src)
  })

  it('容器：flow 分组（含嵌套）与 end 配对', () => {
    const doc = parseOk(SAMPLE)
    const flows = flowsOf(doc)
    expect(flows.map((f) => f.id)).toEqual(['writer', 'reviewer'])
    expect(flows[0]).toMatchObject({ keyword: 'flow', title: 'Drafting Agent' })
    const ends = doc.elements.filter((p) => p.element.kind === 'agentflow-container-end')
    expect(ends).toHaveLength(2)
  })

  it('容器：global 块（无 id / 无标题）', () => {
    const src = `agentflow-beta TB
  global
    shared["Shared"]
  end
  flow a["Alpha"]
    x["X"]@{ shape: task }
    x --> shared
  end
`
    const doc = parseOk(src)
    const flows = flowsOf(doc)
    expect(flows.map((f) => f.keyword)).toEqual(['global', 'flow'])
    expect(flows[0].id).toBeNull()
    expect(reassemble(doc)).toBe(src)
  })

  it('容器：折叠容器元数据 `@{ view: "collapsed" }`', () => {
    const src = `agentflow-beta TB
  flow batch["Batch"]@{ view: "collapsed" }
    a["A"]
  end
`
    const doc = parseOk(src)
    const flow = flowsOf(doc)[0]
    expect(flow.metaRaw).toBe('@{ view: "collapsed" }')
    expect(reassemble(doc)).toBe(src)
  })

  it('逐字保留：注释 / 空行 / 文档级属性行原样', () => {
    const src = `agentflow-beta TB
  %% an important comment
  title Release flow

  a["A"]@{ shape: task }
  a --> b
`
    const doc = parseOk(src)
    expect(reassemble(doc)).toBe(src)
    // title 行被记为文档级属性行（整行可寻址）
    const docLines = doc.elements.filter((p) => p.element.kind === 'agentflow-doc')
    expect(docLines).toHaveLength(1)
  })

  it('多行元数据块：整块 verbatim（不参与元素寻址）', () => {
    const src = `agentflow-beta TB
  a["A"]@{ shape: task,
    description: "multi line"
  }
`
    const doc = parseOk(src)
    // 多行元数据块整行 verbatim：只有 header 一个元素
    expect(doc.elements).toHaveLength(1)
    expect(reassemble(doc)).toBe(src)
  })

  it('非法源码：多余 end / 缺少 end / 无声明行', () => {
    expect(agentflowParser.parse('agentflow-beta TB\n  end\n').ok).toBe(false)
    expect(agentflowParser.parse('agentflow-beta TB\n  flow a["A"]\n').ok).toBe(false)
    expect(agentflowParser.parse('flowchart TD\n  a-->b\n').ok).toBe(false)
  })
})

describe('agentflow 编辑意图（resolveRewrites）', () => {
  const apply = (src: string, intent: unknown): string | null => {
    const doc = parseOk(src)
    const rewrites = agentflowParser.resolveRewrites(doc, intent as never)
    return rewrites === null ? null : reassemble(doc, rewrites)
  }

  it('set-node-text：改全部带形状的出现', () => {
    expect(apply(SAMPLE, { type: 'set-node-text', nodeId: 'draft', text: 'Writing' })).toContain(
      'draft["Writing"]@{ shape: task }',
    )
  })

  it('set-node-text：无形状节点不落码（不伪造形状）', () => {
    expect(apply('agentflow-beta TB\n  a\n  a --> b\n', { type: 'set-node-text', nodeId: 'a', text: 'X' })).toBeNull()
  })

  it('rename-node：改全部出现', () => {
    const out = apply('agentflow-beta TB\n  a["A"]\n  a --> b\n', {
      type: 'rename-node',
      nodeId: 'a',
      newId: 'alpha',
    })!
    expect(out).toBe('agentflow-beta TB\n  alpha["A"]\n  alpha --> b\n')
  })

  it('set-node-shape：改首现元数据（保留其余键原文）', () => {
    const out = apply('agentflow-beta TB\n  a["A"]@{ shape: task, description: "d" }\n', {
      type: 'set-node-shape',
      nodeId: 'a',
      shape: 'decision',
    })!
    expect(out).toBe('agentflow-beta TB\n  a["A"]@{ shape: decision, description: "d" }\n')
  })

  it('add-node：落码规范行（含形状）', () => {
    const out = apply('agentflow-beta TB\n  a["A"]\n', {
      type: 'add-node',
      nodeId: 'n1',
      text: 'New',
      shape: 'tool',
    })!
    expect(out).toBe('agentflow-beta TB\n  a["A"]\n  n1["New"]@{ shape: tool }\n')
  })

  it('delete-node：删节点与触及的边', () => {
    const out = apply('agentflow-beta TB\n  a["A"]\n  b["B"]\n  a --> b\n', {
      type: 'delete-node',
      nodeId: 'b',
    })!
    // 单行语句：a 与边同删（整行删除口径）——或按 flowchart 语义保留 a
    expect(out).not.toContain('b["B"]')
  })

  it('set-edge-label：加/改/去标签', () => {
    const src = 'agentflow-beta TB\n  a["A"]\n  b["B"]\n  a --> b\n'
    const add = apply(src, { type: 'set-edge-label', elementId: 'edge:a->b', label: 'yes' })!
    expect(add).toContain('a -- yes --> b')
    const rm = apply(add, { type: 'set-edge-label', elementId: 'edge:a->b', label: null })!
    expect(rm).toContain('a --> b')
  })

  it('add-edge：三种算子 + 标签', () => {
    expect(
      apply('agentflow-beta TB\n  a["A"]\n', { type: 'add-edge', from: 'a', to: 'b', edgeKind: 'reference' }),
    ).toContain('a -.- b')
    expect(
      apply('agentflow-beta TB\n  a["A"]\n', {
        type: 'add-edge',
        from: 'a',
        to: 'b',
        edgeKind: 'failure',
        label: 'err',
      }),
    ).toContain('a -- err --x b')
  })

  it('set-direction：改声明行方向', () => {
    expect(apply(SAMPLE, { type: 'set-direction', direction: 'LR' })!.split('\n')[0]).toBe('agentflow-beta LR')
  })
  it('set-flow-title：改 flow 标题', () => {
    const out = apply(SAMPLE, {
      type: 'set-flow-title',
      elementId: findFlowId(SAMPLE, 'writer'),
      title: '写作 Agent',
    })!
    expect(out).toContain('flow writer["写作 Agent"]')
  })

  it('set-flow-title：空 flow 块（开行紧邻 end）改标题不吞行尾换行（回归：曾把 end 并入开行）', () => {
    // 容器开行的 span 覆盖整行含 EOL，渲染必须原样带回 eol——否则 `end` 会落到同一行，
    // 解析报「flow / global 缺少匹配的 end」
    const src = 'agentflow-beta TB\n  flow g1["Group"]\n  end\n'
    const out = apply(src, { type: 'set-flow-title', elementId: findFlowId(src, 'g1'), title: '新标题' })!
    expect(out).toBe('agentflow-beta TB\n  flow g1["新标题"]\n  end\n')
    expect(parseOk(out)).toBeTruthy()
  })

  it('add-flow / delete-flow：加块与删块（含内容）', () => {
    const added = apply('agentflow-beta TB\n  a["A"]\n', {
      type: 'add-flow',
      id: 'g1',
      title: 'Group',
    })!
    expect(added).toContain('flow g1["Group"]')
    expect(added).toContain('end')

    const deleted = apply(SAMPLE, { type: 'delete-flow', elementId: findFlowId(SAMPLE, 'writer') })!
    expect(deleted).not.toContain('Drafting Agent')
    expect(deleted).toContain('Review Agent')
  })

  it('delete-doc-line：删文档级属性行', () => {
    const src = 'agentflow-beta TB\n  title X\n  a["A"]\n'
    const doc = parseOk(src)
    const docLine = doc.elements.find((p) => p.element.kind === 'agentflow-doc')!
    const out = reassemble(doc, agentflowParser.resolveRewrites(doc, { type: 'delete-doc-line', elementId: docLine.id })!)
    expect(out).toBe('agentflow-beta TB\n  a["A"]\n')
  })
})

describe('agentflow 工具函数', () => {
  it('isValidNewNodeId：保留关键字 / 非法字符拒绝', () => {
    expect(isValidNewNodeId('a1')).toBe(true)
    expect(isValidNewNodeId('')).toBe(false)
    expect(isValidNewNodeId('end')).toBe(false)
    expect(isValidNewNodeId('flow')).toBe(false)
    expect(isValidNewNodeId('a b')).toBe(false)
  })

  it('withShapeMeta：新建 / 替换 / 追加键', () => {
    expect(withShapeMeta('', 'task')).toBe('@{ shape: task }')
    expect(withShapeMeta('@{ shape: task }', 'tool')).toBe('@{ shape: tool }')
    expect(withShapeMeta('@{ description: "d" }', 'decision')).toBe('@{ description: "d", shape: decision }')
  })
})

/** 测试助手：按 flow id 找容器开行 elementId */
function findFlowId(source: string, flowId: string): string {
  const doc = parseOk(source)
  return doc.elements.find(
    (p) => p.element.kind === 'agentflow-container-open' && (p.element as AgentflowContainerOpenData).id === flowId,
  )!.id
}
