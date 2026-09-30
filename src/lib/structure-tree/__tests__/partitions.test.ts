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
import { timelineParser } from '../../pipeline/timeline'
import { buildTimelineProjection } from '../../projection/timeline-projection'
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

function timelineProjection(source: string): AnyProjection {
  const parsed = timelineParser.parse(source)
  if (!parsed.ok) throw new Error('解析失败')
  return { type: 'timeline', timeline: buildTimelineProjection(parsed.doc) }
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

  it('timeline：图表级 + 分组 + 时期（事件嵌套为子条目）三个分区，时期带键盘', () => {
    const sections = DIAGRAM_TYPES.timeline.tree(
      timelineProjection('timeline\n    title T\n    section S\n        A : a1 : a2\n            : a3\n'),
      { t },
    )
    expect(sections.map((s) => s.key)).toEqual(['diagram', 'sections', 'periods'])
    expect(sections[0].entries[0]).toMatchObject({ depth: 0, selection: { kind: 'diagram' }, detail: 'T' })
    expect(sections[1].entries[0]).toMatchObject({
      depth: 1,
      selection: { kind: 'timeline-section', elementId: 'section:1' },
    })
    const period = sections[2].entries[0]
    expect(period).toMatchObject({ depth: 1, selection: { kind: 'timeline-period', elementId: 'period:1' } })
    expect(period?.onKeyDown).toBeTypeOf('function')
    expect(period?.children?.map((c) => c.selection)).toEqual([
      { kind: 'timeline-event', elementId: 'event:1' },
      { kind: 'timeline-event', elementId: 'event:2' },
      { kind: 'timeline-event', elementId: 'event:3' },
    ])
  })

  it('kanban：列作为分组条目，卡片作为 children；卡片 detail 拼出元数据', () => {
    const source =
      "kanban\n  Todo[待办]\n    t1[写代码]@{ assigned: '张三', ticket: 'VMMD-1', priority: 'High' }\n  Done[已完成]\n"
    const parsed = DIAGRAM_TYPES.kanban.parser.parse(source)
    if (!parsed.ok) throw new Error('解析失败')
    const sections = DIAGRAM_TYPES.kanban.tree(DIAGRAM_TYPES.kanban.buildProjection(parsed.doc), { t })
    expect(sections.map((s) => s.key)).toEqual(['diagram', 'columns'])
    expect(sections[1].heading).toBe('app:propertyPanel.kanbanColumns')
    expect(sections[1].count).toBe(2)
    const [todo, done] = sections[1].entries
    expect(todo).toMatchObject({ depth: 1, selection: { kind: 'kanban-column', elementId: 'kanban-column:Todo' } })
    expect(todo?.children?.[0]).toMatchObject({
      depth: 2,
      selection: { kind: 'kanban-card', elementId: 'kanban-card:t1' },
    })
    // 元数据拼进 detail 用的是 t 透传键
    expect(todo?.children?.[0]?.detail).toContain('#VMMD-1')
    expect(todo?.children?.[0]?.detail).toContain('app:kanbanPriorities.High')
    expect(done?.children).toBeUndefined()
  })

  it('journey：图表级 + 分组（任务嵌套为子条目）+ 未分组任务三个分区，任务带键盘', () => {
    const source =
      'journey\n    title 旅程\n    section 发现\n        访问首页: 5: 用户\n        浏览商品: 3\nsection 决策\n    对比价格: 9: 客服\n'
    const parsed = DIAGRAM_TYPES.journey.parser.parse(source)
    if (!parsed.ok) throw new Error('解析失败')
    const sections = DIAGRAM_TYPES.journey.tree(DIAGRAM_TYPES.journey.buildProjection(parsed.doc), { t })
    expect(sections.map((s) => s.key)).toEqual(['diagram', 'sections', 'tasks'])
    expect(sections[0].entries[0]).toMatchObject({ depth: 0, selection: { kind: 'diagram' }, detail: '旅程' })
    const [found, decide] = sections[1].entries
    expect(found).toMatchObject({ depth: 1, selection: { kind: 'journey-section', elementId: 'section:1' } })
    expect(found?.children?.[0]).toMatchObject({
      depth: 2,
      selection: { kind: 'journey-task', elementId: 'task:1' },
    })
    expect(found?.children?.[0]?.onKeyDown).toBeTypeOf('function')
    // 越界 score 走「越界」标注键（t 替身直返键名；score 原文在 opts 里透传）
    expect(decide?.children?.[0]?.detail).toContain('app:propertyPanel.journeyScoreInvalidShort')
    // 未分组任务分区（本样例为空，仅分区形状）
    expect(sections[2].count).toBe(0)
  })

  it('pie：图表级 + 扇区两个分区，扇区带键盘；非法数值走「无效」标注键', () => {
    const source = 'pie showData\n    title 预算\n    "研发" : 45\n    "异常" : -1\n'
    const parsed = DIAGRAM_TYPES.pie.parser.parse(source)
    if (!parsed.ok) throw new Error('解析失败')
    const sections = DIAGRAM_TYPES.pie.tree(DIAGRAM_TYPES.pie.buildProjection(parsed.doc), { t })
    expect(sections.map((s) => s.key)).toEqual(['diagram', 'sectors'])
    expect(sections[0].entries[0]).toMatchObject({ depth: 0, selection: { kind: 'diagram' }, detail: '预算' })
    const [ok, bad] = sections[1].entries
    expect(ok).toMatchObject({ depth: 1, selection: { kind: 'pie-sector', elementId: 'sector:1' }, detail: '45' })
    expect(ok?.onKeyDown).toBeTypeOf('function')
    // 负数数值走「无效」标注键（t 替身直返键名；原文在 opts 里透传）
    expect(bad?.detail).toContain('app:propertyPanel.pieValueInvalidShort')
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
      timeline: 'timeline\n    section S\n        A : a1 : a2\n            : a3',
      kanban: 'kanban\n  Todo[待办]\n    t1[写代码]',
      requirement:
        'requirementDiagram\n    functionalRequirement login {\n        id: "REQ-1"\n        text: "登录"\n        risk: Medium\n        verifymethod: Test\n    }\n\n    element loginUI {\n        type: "界面"\n    }\n\n    loginUI - satisfies -> login',
      journey:
        'journey\n    title 旅程\n    section 发现\n        访问首页: 5: 用户\n        浏览商品: 3\n    section 决策\n        对比价格: 2: 用户, 客服',
      pie: 'pie showData\n    title 预算\n    "研发" : 45\n    "市场" : 30',
      block: 'block-beta\n    columns 3\n    a["输入"]\n    b{"校验"}\n    a --> b',
      sankey: 'sankey-beta\n\nsrc,dst,3\n"n, ame",dst,1.5',
      gantt:
        'gantt\n    dateFormat YYYY-MM-DD\n    section 调研\n        需求梳理 :done, 2026-01-05, 3d',
      quadrant:
        'quadrantChart\n    title 优先级\n    x-axis 低 --> 高\n    y-axis 低 --> 高\n    quadrant-1 甲\n    quadrant-2 乙\n    quadrant-3 丙\n    quadrant-4 丁\n    A: [0.3, 0.6]',
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
