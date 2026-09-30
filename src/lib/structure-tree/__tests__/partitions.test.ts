import { beforeEach, describe, expect, it } from 'vitest'
import { initI18n } from '../../../i18n'
import { flowchartParser } from '../../pipeline/flowchart'
import { sequenceParser } from '../../pipeline/sequence'
import { classParser } from '../../pipeline/class'
import { mindmapParser } from '../../pipeline/mindmap'
import { buildFlowchartProjection } from '../../projection/flowchart-projection'
import { buildSequenceProjection } from '../../projection/sequence-projection'
import { buildClassProjection } from '../../projection/class-projection'
import { buildMindmapProjection } from '../../projection/mindmap-projection'
import { DIAGRAM_TYPES, type AnyProjection } from '../../diagram-registry'

/**
 * 结构树分区描述（architecture-deepening-2 工单 06）：
 * 四个图种的树由注册表 `tree` 字段的分区描述表驱动——分区集合、标题（计数）、
 * 每个元素的显示 / 选中 / 深度都在描述里声明，渲染 JSX 只有一份。
 */

initI18n()

const t = (key: string, opts?: Record<string, unknown>): string => {
  void opts
  return key
}

function flowchartProjection(source: string): AnyProjection {
  const parsed = flowchartParser.parse(source)
  if (!parsed.ok) throw new Error('解析失败')
  return { type: 'flowchart', flowchart: buildFlowchartProjection(parsed.doc) }
}

function sequenceProjection(source: string): AnyProjection {
  const parsed = sequenceParser.parse(source)
  if (!parsed.ok) throw new Error('解析失败')
  return { type: 'sequence', sequence: buildSequenceProjection(parsed.doc) }
}

function classProjection(source: string): AnyProjection {
  const parsed = classParser.parse(source)
  if (!parsed.ok) throw new Error('解析失败')
  return { type: 'class', class: buildClassProjection(parsed.doc) }
}

function mindmapProjection(source: string): AnyProjection {
  const parsed = mindmapParser.parse(source)
  if (!parsed.ok) throw new Error('解析失败')
  return { type: 'mindmap', mindmap: buildMindmapProjection(parsed.doc) }
}

describe('结构树分区描述（工单 06）', () => {
  beforeEach(() => {
    // i18n 已初始化；t 用作语境
  })

  it('flowchart：图表级 + 节点 / 连线 / 子图 / classDef 五个分区，条目带选中与深度', () => {
    const sections = DIAGRAM_TYPES.flowchart.tree(
      flowchartProjection('flowchart TB\nn1[甲]\nn1 --> n2\nsubgraph S\n  n2\nend\nclassDef hot fill:#f00\n'),
      { t },
    )
    expect(sections.map((s) => s.key)).toEqual(['diagram', 'nodes', 'edges', 'subgraphs', 'classDefs'])
    expect(sections[0].entries[0]).toMatchObject({ depth: 0, selection: { kind: 'diagram' }, detail: 'TB' })
    expect(sections[1].heading).toBe('app:propertyPanel.nodes')
    expect(sections[1].count).toBe(2)
    expect(sections[1].entries[0]).toMatchObject({ depth: 1, selection: { kind: 'node', nodeId: 'n1' } })
    expect(sections[2].entries[0]?.selection).toEqual({ kind: 'edge', from: 'n1', to: 'n2', occurrence: 1 })
    expect(sections[3].entries[0]?.selection.kind).toBe('subgraph')
    expect(sections[4].entries[0]?.selection).toEqual({ kind: 'classdef', name: 'hot' })
  })

  it('sequence：图表级 detail 带 autonumber，六个分区', () => {
    const sections = DIAGRAM_TYPES.sequence.tree(
      sequenceProjection('sequenceDiagram\nautonumber\nA->>B: hi\nNote over A: x\n'), 
      { t },
    )
    expect(sections.map((s) => s.key)).toEqual([
      'diagram',
      'participants',
      'messages',
      'notes',
      'blocks',
      'regions',
    ])
    expect(sections[0].entries[0]?.detail).toBe('autonumber')
    expect(sections[2].entries[0]).toMatchObject({ depth: 1, selection: { kind: 'message' } })
    expect(sections[3].entries[0]?.selection.kind).toBe('note')
  })

  it('class：七个分区，成员深度 2', () => {
    const sections = DIAGRAM_TYPES.class.tree(
      classProjection('classDiagram\nclass A\nA : +x\nA <|-- B\nnote for A "hi"\n'),
      { t },
    )
    expect(sections.map((s) => s.key)).toEqual([
      'diagram',
      'classes',
      'namespaces',
      'members',
      'relations',
      'notes',
      'classDefs',
    ])
    expect(sections[0].entries[0]?.detail).toBe('classDiagram')
    expect(sections[3].entries[0]).toMatchObject({ depth: 2, selection: { kind: 'class-member' } })
    expect(sections[4].entries[0]?.selection).toEqual({ kind: 'class-relation', elementId: 'relation:1' })
  })

  it('mindmap：树形缩进由 children 表达，深度即缩进层级；空态有占位文案', () => {
    const sections = DIAGRAM_TYPES.mindmap.tree(
      mindmapProjection('mindmap\n  root((圆))\n    子\n      孙\n  另一根\n'),
      { t },
    )
    expect(sections.map((s) => s.key)).toEqual(['diagram', 'nodes'])
    expect(sections[1].heading).toBe('app:propertyPanel.mindmapHint')
    expect(sections[1].count).toBeUndefined()
    const roots = sections[1].entries
    expect(roots).toHaveLength(2)
    const [root] = roots
    expect(root?.depth).toBe(0)
    expect(root?.children).toHaveLength(1)
    expect(root?.children?.[0]?.depth).toBe(1)
    expect(root?.children?.[0]?.children?.[0]).toMatchObject({
      depth: 2,
      selection: { kind: 'mindmap-node' },
    })
  })

  it('mindmap 空文档：nodes 分区显示空态文案', () => {
    const sections = DIAGRAM_TYPES.mindmap.tree(mindmapProjection('mindmap\n'), { t })
    expect(sections[1].entries).toHaveLength(0)
    expect(sections[1].emptyText).toBe('app:propertyPanel.mindmapEmpty')
  })

  it('每个图种注册表的 tree 字段都能对自身的投影求值（穷尽性）', () => {
    const sources: Record<keyof typeof DIAGRAM_TYPES, string> = {
      flowchart: 'flowchart TB\nn1[甲]',
      sequence: 'sequenceDiagram\nA->>B: hi',
      class: 'classDiagram\nclass A',
      mindmap: 'mindmap\n  root((圆))',
      state: 'stateDiagram-v2\n[*] --> s1',
      er: 'erDiagram\nCAR ||--o{ DRIVER : uses',
      gitgraph: 'gitGraph\n    commit id: "a"\n    branch dev\n    commit',
      requirement:
        'requirementDiagram\n    functionalRequirement login {\n        id: "REQ-1"\n        text: "登录"\n        risk: Medium\n        verifymethod: Test\n    }\n\n    element loginUI {\n        type: "界面"\n    }\n\n    loginUI - satisfies -> login',
    }
    for (const id of Object.keys(DIAGRAM_TYPES) as (keyof typeof DIAGRAM_TYPES)[]) {
      const registration = DIAGRAM_TYPES[id]
      const parsed = registration.parser.parse(sources[id])
      if (!parsed.ok) throw new Error('解析失败')
      const sections = registration.tree(registration.buildProjection(parsed.doc), { t })
      expect(sections.length).toBeGreaterThan(0)
      expect(sections[0].entries[0]?.selection.kind).toBe('diagram')
    }
  })
})
