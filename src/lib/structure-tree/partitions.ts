import type { KeyboardEvent } from 'react'
import type { AnyProjection, DiagramTypeId } from '../diagram-registry'
import type { FlowchartProjection } from '../projection/flowchart-projection'
import type { SequenceProjection } from '../projection/sequence-projection'
import type { ClassProjection } from '../projection/class-projection'
import type { MindmapProjection } from '../projection/mindmap-projection'
import type { StateProjection } from '../projection/state-projection'
import type { ErProjection } from '../projection/er-projection'
import type { GitgraphProjection } from '../projection/gitgraph-projection'
import type { RequirementProjection } from '../projection/requirement-projection'
import type {
  ProjectionGitgraphBranch,
  ProjectionGitgraphCherryPick,
  ProjectionGitgraphCommit,
  ProjectionGitgraphMerge,
} from '../projection/gitgraph-projection'
import type { TimelineProjection } from '../projection/timeline-projection'
import type { KanbanProjection } from '../projection/kanban-projection'
import type { JourneyProjection } from '../projection/journey-projection'
import type { PieProjection } from '../projection/pie-projection'
import type { BlockProjection } from '../projection/block-projection'
import type { SankeyProjection } from '../projection/sankey-projection'
import type { GanttProjection } from '../projection/gantt-projection'
import type { QuadrantProjection } from '../projection/quadrant-projection'
import type { PacketProjection } from '../projection/packet-projection'
import type { ProjectionPacketField } from '../projection/packet-projection'
import type { XychartProjection } from '../projection/xychart-projection'
import type { RadarProjection } from '../projection/radar-projection'
import type { ArchitectureProjection } from '../projection/architecture-projection'
import {
  type ProjectionArchitectureGroup,
  type ProjectionArchitectureJunction,
  type ProjectionArchitectureService,
} from '../projection/architecture-projection'
import type { ProjectionTreemapNode, TreemapProjection } from '../projection/treemap-projection'
import type { ProjectionIshikawaNode, IshikawaProjection } from '../projection/ishikawa-projection'
import type { WardleyProjection } from '../projection/wardley-projection'
import type { ProjectionVennArea, VennProjection } from '../projection/venn-projection'
import type { CynefinProjection } from '../projection/cynefin-projection'
import type {
  ProjectionUsecaseNode,
  ProjectionUsecaseRelation,
  UsecaseProjection,
} from '../projection/usecase-projection'
import type { EventModelingProjection } from '../projection/eventmodeling-projection'
import {
  treemapKeyPlan,
  ishikawaKeyPlan,
  wardleyKeyPlan,
  vennKeyPlan,
  cynefinKeyPlan,
  usecaseKeyPlan,
  eventModelingKeyPlan,
} from '../editing/canvas-keyboard'
import { DIAGRAM_SELECTION, type Selection } from '../projection/selection'
import {
  applyPlan,
  ganttKeyPlan,
  journeyKeyPlan,
  mindmapKeyPlan,
  packetKeyPlan,
  pieKeyPlan,
  quadrantKeyPlan,
  radarKeyPlan,
  timelineKeyPlan,
} from '../editing/canvas-keyboard'
import { useEditorStore } from '../../store/editor'

/**
 * 结构树分区描述（architecture-deepening-2 工单 06）：
 * 「一种图的树由哪几个分区组成、每个元素如何显示与选中」按图种声明成数据，
 * 挂在图种注册表的独立字段 `tree` 上——**不进画布能力包**（守 ADR-0015：
 * 能力包只承载画布知识，结构树的展示分区不是画布知识）。
 *
 * StructureTree 的渲染 JSX 因此只有一份：图表级行 + 若干「标题（计数）+ 条目」分区。
 * mindmap 的树形缩进用条目的 `children` 表达（深度即缩进层级），渲染器递归展开。
 */

/** 树分区里的一个条目：显示 + 选中 + （mindmap）树形嵌套与键盘 */
export interface TreeEntry {
  /** React key（elementId / nodeId / 组合键） */
  key: string
  label: string
  detail?: string
  /** 缩进层级（TreeItem 的 paddingLeft 档位） */
  depth: number
  /** 点击后写入编辑器 store 的选中 */
  selection: Selection
  /** 子条目（mindmap 树形；平面分区不带） */
  children?: TreeEntry[]
  /** 键盘处理（mindmap 树节点的 Tab / Enter 增删层级；工单 08） */
  onKeyDown?: (e: KeyboardEvent) => void
}

/** 树的一个分区：可选标题行（带可选计数）+ 条目列表（可选空态文案） */
export interface TreeSection {
  /** React key */
  key: string
  /** 标题行文案；undefined = 无标题行（图表级首分区） */
  heading?: string
  /** 标题行尾的（N）计数；undefined = 不显示计数（mindmap 的提示行） */
  count?: number
  /** entries 为空时显示的占位文案（mindmap 空态） */
  emptyText?: string
  entries: TreeEntry[]
}

/** 分区描述的求值语境：i18n 文案 */
/** i18n 文案函数（用窄签名而非 TFunction 品牌类型，测试可注纯函数） */
type Translate = (key: string, opts?: Record<string, unknown>) => string

export interface TreePartitionsContext {
  t: Translate
}

/** 图种 → 结构树分区描述（注册表 `tree` 字段的类型） */
export type TreePartitions = (projection: AnyProjection, ctx: TreePartitionsContext) => TreeSection[]

/** 图表级首分区：四个图种共用（label = diagram，depth 0，选中 diagram） */
function diagramSection(detail: string | undefined): TreeSection {
  return {
    key: 'diagram',
    entries: [
      {
        key: 'diagram',
        label: '@@DIAGRAM',
        detail,
        depth: 0,
        selection: DIAGRAM_SELECTION,
      },
    ],
  }
}

// label 的真实文案需要 t；图表级 label 在求值时由渲染器补（避免这里引 i18n）
function withDiagramLabel(section: TreeSection, label: string): TreeSection {
  const [entry] = section.entries
  return { ...section, entries: [{ ...entry, label }, ...section.entries.slice(1)] }
}

// ---------- flowchart ----------

function flowchartPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'flowchart') return []
  const p: FlowchartProjection = projection.flowchart
  return [
    withDiagramLabel(diagramSection(p.direction ?? 'TB'), t('app:propertyPanel.diagram')),
    {
      key: 'nodes',
      heading: t('app:propertyPanel.nodes'),
      count: p.nodes.length,
      entries: p.nodes.map((node) => ({
        key: node.nodeId,
        label: node.text ?? node.nodeId,
        detail: node.text !== null ? node.nodeId : undefined,
        depth: 1,
        selection: { kind: 'node', nodeId: node.nodeId },
      })),
    },
    {
      key: 'edges',
      heading: t('app:propertyPanel.edges'),
      count: p.edges.length,
      entries: p.edges.map((edge) => ({
        key: `${edge.from}->${edge.to}#${edge.occurrence}`,
        label: t('app:propertyPanel.edgeLabel', { from: edge.from, to: edge.to }),
        detail: edge.label ?? undefined,
        depth: 1,
        selection: { kind: 'edge', from: edge.from, to: edge.to, occurrence: edge.occurrence },
      })),
    },
    {
      key: 'subgraphs',
      heading: t('app:propertyPanel.subgraphs'),
      count: p.subgraphs.length,
      entries: p.subgraphs.map((sg) => ({
        key: sg.elementId,
        label: sg.title ?? sg.id ?? t('app:propertyPanel.unnamedSubgraph'),
        depth: 1,
        selection: { kind: 'subgraph', elementId: sg.elementId },
      })),
    },
    {
      key: 'classDefs',
      heading: t('app:propertyPanel.classDefs'),
      count: p.classDefs.length,
      entries: p.classDefs.map((cd) => ({
        key: cd.name,
        label: cd.name,
        detail: cd.props.fill,
        depth: 1,
        selection: { kind: 'classdef', name: cd.name },
      })),
    },
  ]
}

// ---------- sequence ----------

function sequencePartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'sequence') return []
  const p: SequenceProjection = projection.sequence
  return [
    withDiagramLabel(diagramSection(p.autonumber ? 'autonumber' : undefined), t('app:propertyPanel.diagram')),
    {
      key: 'participants',
      heading: t('app:propertyPanel.participants'),
      count: p.participants.length,
      entries: p.participants.map((participant) => ({
        key: participant.actorId,
        label: participant.alias ?? participant.actorId,
        detail:
          [
            participant.alias !== null
              ? participant.actorId
              : participant.active
                ? 'activate'
                : undefined,
            participant.created === true ? t('app:propertyPanel.createdByCreate') : undefined,
          ]
            .filter((x) => x !== undefined)
            .join(' · ') || undefined,
        depth: 1,
        selection: { kind: 'participant', actorId: participant.actorId },
      })),
    },
    {
      key: 'messages',
      heading: t('app:propertyPanel.messages'),
      count: p.messages.length,
      entries: p.messages.map((m) => ({
        key: m.elementId,
        label: `${m.from} → ${m.to}`,
        detail: m.text || undefined,
        depth: 1,
        selection: { kind: 'message', elementId: m.elementId },
      })),
    },
    {
      key: 'notes',
      heading: t('app:propertyPanel.notes'),
      count: p.notes.length,
      entries: p.notes.map((n) => ({
        key: n.elementId,
        label: t(`app:notePos.${n.pos}`),
        detail: n.text || undefined,
        depth: 1,
        selection: { kind: 'note', elementId: n.elementId },
      })),
    },
    {
      key: 'blocks',
      heading: t('app:propertyPanel.blocks'),
      count: p.blocks.length,
      entries: p.blocks.map((b) => ({
        key: b.elementId,
        label:
          b.keyword === 'else' || b.keyword === 'and'
            ? t(`app:elseKeywords.${b.keyword}`)
            : t(`app:blockKeywords.${b.keyword}`),
        detail: b.label ?? undefined,
        depth: b.depth,
        selection: { kind: 'block', elementId: b.elementId },
      })),
    },
    {
      key: 'regions',
      heading: t('app:propertyPanel.regions'),
      count: p.regions.length,
      entries: p.regions.map((r) => ({
        key: r.elementId,
        label:
          r.kind === 'box' ? (r.label ?? t('app:propertyPanel.boxRegion')) : t('app:propertyPanel.rectRegion'),
        detail: r.kind === 'box' ? (r.color ?? undefined) : r.color,
        depth: 1,
        selection: { kind: 'seq-region', elementId: r.elementId },
      })),
    },
  ]
}

// ---------- class ----------

function classPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'class') return []
  const p: ClassProjection = projection.class
  return [
    withDiagramLabel(diagramSection('classDiagram'), t('app:propertyPanel.diagram')),
    {
      key: 'classes',
      heading: t('app:propertyPanel.classes'),
      count: p.classes.length,
      entries: p.classes.map((c) => ({
        key: c.elementId,
        label: c.generic !== null ? `${c.name}~${c.generic}~` : c.name,
        detail: c.hasBlock ? '{}' : undefined,
        depth: 1,
        selection: { kind: 'class', name: c.name },
      })),
    },
    {
      key: 'namespaces',
      heading: t('app:propertyPanel.namespaces'),
      count: p.namespaces.length,
      entries: p.namespaces.map((ns) => ({
        key: ns.elementId,
        label: ns.name,
        depth: 1,
        selection: { kind: 'class-namespace', elementId: ns.elementId },
      })),
    },
    {
      key: 'members',
      heading: t('app:propertyPanel.members'),
      count: p.members.length,
      entries: p.members.map((m) => ({
        key: m.elementId,
        label: `${m.vis === '' ? '' : m.vis + ' '}${m.text}`,
        detail: m.owner ?? undefined,
        depth: 2,
        selection: { kind: 'class-member', elementId: m.elementId },
      })),
    },
    {
      key: 'relations',
      heading: t('app:propertyPanel.relations'),
      count: p.relations.length,
      entries: p.relations.map((r) => ({
        key: r.elementId,
        label: `${r.from} ${r.kind} ${r.to}`,
        detail: r.label ?? undefined,
        depth: 1,
        selection: { kind: 'class-relation', elementId: r.elementId },
      })),
    },
    {
      key: 'notes',
      heading: t('app:propertyPanel.notes'),
      count: p.notes.length,
      entries: p.notes.map((n) => ({
        key: n.elementId,
        label:
          n.forClass !== null
            ? t('app:propertyPanel.noteFor', { cls: n.forClass })
            : t('app:propertyPanel.floatingNote'),
        detail: n.text || undefined,
        depth: 1,
        selection: { kind: 'class-note', elementId: n.elementId },
      })),
    },
    {
      key: 'classDefs',
      heading: t('app:propertyPanel.classDefs'),
      count: p.classDefs.length,
      entries: p.classDefs.map((cd) => ({
        key: cd.name,
        label: cd.name,
        detail: cd.props.fill,
        depth: 1,
        selection: { kind: 'classdef', name: cd.name },
      })),
    },
  ]
}

// ---------- mindmap（工单 08：树形缩进即主编辑界面） ----------

/**
 * mindmap 树节点的键盘（工单 08 / architecture-deepening-2 工单 06）：
 * 焦点在树节点上时 Tab 加子节点 / Enter 加同级节点（preventDefault 压掉焦点切换），
 * 落码按 mindmap 缩进层级。键 → plan 走能力包同一份 mindmapKeyPlan（工单 02），
 * plan 的执行交给唯一的 applyPlan；结构树路径经 pendingInlineEdit 请求间接接入内联编辑。
 */
function mindmapEntryKeyDown(
  projection: MindmapProjection,
  elementId: string,
  t: Translate,
): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    // 与树键盘既有口径一致：只接无修饰键的 Tab / Enter（Delete 留给画布键盘，不在这处理）
    if ((e.key !== 'Tab' && e.key !== 'Enter') || e.shiftKey) return
    const plan = mindmapKeyPlan(projection, {
      key: e.key,
      mods: { shift: e.shiftKey },
      selection: { kind: 'mindmap-node', elementId },
      newNodeText: t('app:propertyPanel.mindmapNewNode'),
    })
    if (plan === null) return
    const { commitIntent, select, requestInlineEdit } = useEditorStore.getState()
    applyPlan(plan, {
      commitIntent,
      select,
      // 本图种（mindmap）的 plan 只产 mindmap 目标：经 store 请求，画布侧消费（工单 06）
      beginInlineEdit: (target) => {
        if (target.kind === 'mindmap') requestInlineEdit(target)
      },
      preventDefault: () => e.preventDefault(),
    })
  }
}

function mindmapPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'mindmap') return []
  const p: MindmapProjection = projection.mindmap

  const childrenOf = new Map<string | null, typeof p.nodes>()
  for (const node of p.nodes) {
    const list = childrenOf.get(node.parentId) ?? []
    list.push(node)
    childrenOf.set(node.parentId, list)
  }

  const toEntry = (node: (typeof p.nodes)[number]): TreeEntry => {
    const children = (childrenOf.get(node.elementId) ?? []).map(toEntry)
    const shapeLabel = node.shapeType !== null ? t(`app:mindmapShapes.${node.shapeType}`) : undefined
    return {
      key: node.elementId,
      label: node.text,
      detail:
        [shapeLabel, node.icon !== null ? `::icon(${node.icon})` : undefined]
          .filter((x) => x !== undefined)
          .join(' · ') || undefined,
      depth: node.depth,
      selection: { kind: 'mindmap-node', elementId: node.elementId },
      onKeyDown: mindmapEntryKeyDown(p, node.elementId, t),
      children: children.length > 0 ? children : undefined,
    }
  }

  return [
    withDiagramLabel(diagramSection('mindmap'), t('app:propertyPanel.diagram')),
    {
      key: 'nodes',
      heading: t('app:propertyPanel.mindmapHint'),
      emptyText: t('app:propertyPanel.mindmapEmpty'),
      entries: (childrenOf.get(null) ?? []).map(toEntry),
    },
  ]
}

// ---------- state（more-diagrams 工单 02） ----------

function statePartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'state') return []
  const p: StateProjection = projection.state

  const pseudoLabel = (pseudo: string) => t(`app:statePseudoKinds.${pseudo}`)

  // 复合状态作为分组节点：children 递归展开（与 mindmap 的树形缩进同一渲染器）
  const childrenOf = new Map<string | null, typeof p.states>()
  for (const state of p.states) {
    const list = childrenOf.get(state.parentId) ?? []
    list.push(state)
    childrenOf.set(state.parentId, list)
  }

  const toEntry = (state: (typeof p.states)[number]): TreeEntry => {
    const children = (childrenOf.get(state.id) ?? []).map(toEntry)
    return {
      key: state.id,
      label: state.desc ?? state.id,
      detail:
        [
          state.desc !== null ? state.id : undefined,
          state.pseudo !== null ? pseudoLabel(state.pseudo) : undefined,
          state.composite ? t('app:propertyPanel.stateComposite') : undefined,
        ]
          .filter((x) => x !== undefined)
          .join(' · ') || undefined,
      depth: 1,
      selection: { kind: 'state', id: state.id },
      children: children.length > 0 ? children : undefined,
    }
  }

  return [
    withDiagramLabel(diagramSection(p.direction ?? undefined), t('app:propertyPanel.diagram')),
    {
      key: 'states',
      heading: t('app:propertyPanel.states'),
      count: p.states.length,
      entries: (childrenOf.get(null) ?? []).map(toEntry),
    },
    {
      key: 'transitions',
      heading: t('app:propertyPanel.stateTransitions'),
      count: p.transitions.length,
      entries: p.transitions.map((tr) => ({
        key: tr.elementId,
        label: `${tr.from} → ${tr.to}`,
        detail: tr.label ?? undefined,
        depth: 1,
        selection: { kind: 'state-transition', elementId: tr.elementId },
      })),
    },
    {
      key: 'notes',
      heading: t('app:propertyPanel.notes'),
      count: p.notes.length,
      entries: p.notes.map((n) => ({
        key: n.elementId,
        label: t(`app:notePos.${n.side}`),
        detail: n.text || undefined,
        depth: 1,
        selection: { kind: 'state-note', elementId: n.elementId },
      })),
    },
  ]
}

// ---------- er（more-diagrams 工单 03） ----------

function erPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'er') return []
  const p: ErProjection = projection.er
  return [
    withDiagramLabel(diagramSection(p.direction ?? undefined), t('app:propertyPanel.diagram')),
    {
      key: 'entities',
      heading: t('app:propertyPanel.erEntities'),
      count: p.entities.length,
      entries: p.entities.map((entity) => ({
        key: entity.elementId ?? `implicit:${entity.name}`,
        label: entity.alias ?? entity.name,
        detail: entity.alias !== null ? entity.name : undefined,
        depth: 1,
        selection: { kind: 'er-entity', name: entity.name },
      })),
    },
    {
      key: 'attributes',
      heading: t('app:propertyPanel.erAttributes'),
      count: p.attributes.length,
      entries: p.attributes.map((attr) => ({
        key: attr.elementId,
        label:
          `${attr.keys.length > 0 ? attr.keys.join(', ') + ' ' : ''}${attr.type}${attr.nullable ? '?' : ''} ${attr.name}`,
        detail: attr.entity,
        depth: 2,
        selection: { kind: 'er-attribute', elementId: attr.elementId },
      })),
    },
    {
      key: 'relations',
      heading: t('app:propertyPanel.erRelations'),
      count: p.relations.length,
      entries: p.relations.map((rel) => ({
        key: rel.elementId,
        label: `${rel.from} ${rel.cardLeft}${rel.line}${rel.cardRight} ${rel.to}`,
        detail: rel.label ?? undefined,
        depth: 1,
        selection: { kind: 'er-relation', elementId: rel.elementId },
      })),
    },
  ]
}

// ---------- gitGraph（more-diagrams 工单 04） ----------

/** gitGraph 子语句的树上标签：提交 id 缺省时用「提交 #N」（mermaid 自动生成渲染 id） */
function gitgraphChildEntry(
  child: ProjectionGitgraphCommit | ProjectionGitgraphMerge | ProjectionGitgraphCherryPick,
  index: number,
  t: Translate,
): TreeEntry {
  const detail = (fields: Array<string | null>) =>
    fields.filter((x) => x !== null && x !== '').join(' · ') || undefined
  switch (child.kind) {
    case 'gg-commit':
      return {
        key: child.elementId,
        label: child.id ?? t('app:propertyPanel.gitCommitUnnamed', { index }),
        detail: detail([child.tag, child.type]),
        depth: 2,
        selection: { kind: 'gitgraph-commit', elementId: child.elementId },
      }
    case 'gg-merge':
      return {
        key: child.elementId,
        label: t('app:propertyPanel.gitMergeOf', { branch: child.of }),
        detail: detail([child.tag, child.type]),
        depth: 2,
        selection: { kind: 'gitgraph-merge', elementId: child.elementId },
      }
    case 'gg-cherry-pick':
      return {
        key: child.elementId,
        label: t('app:propertyPanel.gitCherryPick'),
        detail: detail([child.id, child.parent]),
        depth: 2,
        selection: { kind: 'gitgraph-cherry-pick', elementId: child.elementId },
      }
  }
}

function gitgraphPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'gitgraph') return []
  const p: GitgraphProjection = projection.gitgraph
  return [
    withDiagramLabel(diagramSection(p.direction ?? undefined), t('app:propertyPanel.diagram')),
    {
      key: 'branches',
      heading: t('app:propertyPanel.gitBranches'),
      count: p.branches.length,
      entries: p.branches.map((branch: ProjectionGitgraphBranch) => ({
        key: branch.elementId ?? `implicit:${branch.name}`,
        label: branch.name,
        detail: branch.order !== null ? `order: ${branch.order}` : undefined,
        depth: 1,
        selection: { kind: 'gitgraph-branch', name: branch.name },
        children: branch.children.map((child, i) => gitgraphChildEntry(child, i + 1, t)),
      })),
    },
  ]
}

// ---------- timeline（more-diagrams 工单 05） ----------

/**
 * timeline 时期条目的键盘（工单 05 / ADR-0013）：焦点在时期条目上时
 * Tab 加事件 / Enter 加下一时期 / Delete 删除该时期（preventDefault 压掉默认行为）。
 * 键 → plan 走能力包同一份 timelineKeyPlan，执行交给唯一的 applyPlan。
 *
 * 与 mindmap 树只接 Tab/Enter 不同，这里**同时接 Delete**：timeline 画布无 data-id 寻址
 * （见 timeline-adapter 注释），画布键盘拿不到时期选中，结构树是唯一的键盘入口。
 */
function timelinePeriodKeyDown(
  projection: TimelineProjection,
  elementId: string,
): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.shiftKey) return
    if (e.key !== 'Tab' && e.key !== 'Enter' && e.key !== 'Delete' && e.key !== 'Backspace') return
    const selection: Selection = { kind: 'timeline-period', elementId }
    const plan = timelineKeyPlan(projection, { key: e.key, mods: { shift: e.shiftKey }, selection })
    if (plan === null) return
    const { commitIntent, select } = useEditorStore.getState()
    applyPlan(plan, { commitIntent, select, preventDefault: () => e.preventDefault() })
  }
}

function timelinePartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'timeline') return []
  const p: TimelineProjection = projection.timeline

  const periodEntry = (period: (typeof p.periods)[number]): TreeEntry => {
    const events = period.events.map<TreeEntry>((ev) => ({
      key: ev.elementId,
      label: ev.text,
      detail: ev.form === 'continuation' ? t('app:propertyPanel.timelineContinuationEvent') : undefined,
      depth: 2,
      selection: { kind: 'timeline-event', elementId: ev.elementId },
    }))
    return {
      key: period.elementId,
      label: period.text,
      detail:
        [period.sectionName ?? undefined, `${period.events.length}`]
          .filter((x) => x !== undefined)
          .join(' · ') || undefined,
      depth: 1,
      selection: { kind: 'timeline-period', elementId: period.elementId },
      onKeyDown: timelinePeriodKeyDown(p, period.elementId),
      children: events.length > 0 ? events : undefined,
    }
  }

  return [
    withDiagramLabel(
      diagramSection(p.title ?? p.direction ?? undefined),
      t('app:propertyPanel.diagram'),
    ),
    {
      key: 'sections',
      heading: t('app:propertyPanel.timelineSections'),
      count: p.sections.length,
      entries: p.sections.map((s) => ({
        key: s.elementId,
        label: s.name,
        detail: `${s.periods.length}`,
        depth: 1,
        selection: { kind: 'timeline-section', elementId: s.elementId },
      })),
    },
    {
      key: 'periods',
      heading: t('app:propertyPanel.timelinePeriods'),
      count: p.periods.length,
      entries: p.periods.map(periodEntry),
    },
  ]
}

// ---------- kanban（more-diagrams 工单 06） ----------

/**
 * kanban 结构树：列作为分组条目，其卡片作为 children（复用与 state 复合状态
 * 同一套树形渲染器）。卡片显示描述，携带元数据的卡片把 assigned / ticket /
 * priority 拼进 detail——结构树是画布未寻址内容（元数据）的完整编辑入口。
 */
function kanbanPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'kanban') return []
  const p: KanbanProjection = projection.kanban
  return [
    withDiagramLabel(diagramSection('kanban'), t('app:propertyPanel.diagram')),
    {
      key: 'columns',
      heading: t('app:propertyPanel.kanbanColumns'),
      count: p.columns.length,
      entries: p.columns.map((column) => ({
        key: column.elementId,
        label: column.title,
        detail: column.title !== column.id ? column.id : undefined,
        depth: 1,
        selection: { kind: 'kanban-column', elementId: column.elementId },
        children:
          column.cards.length > 0
            ? column.cards.map((card) => ({
                key: card.elementId,
                label: card.description,
                detail:
                  [
                    card.assigned !== null ? `@${card.assigned}` : undefined,
                    card.ticket !== null ? `#${card.ticket}` : undefined,
                    card.priority !== null ? t(`app:kanbanPriorities.${card.priority}`) : undefined,
                  ]
                    .filter((x) => x !== undefined)
                    .join(' · ') || undefined,
                depth: 2,
                selection: { kind: 'kanban-card', elementId: card.elementId },
              }))
            : undefined,
      })),
    },
  ]
}

// ---------- requirementDiagram（more-diagrams 工单 07） ----------

/** requirement / element 块的字段子条目：字段按「所属块 + 字段名」寻址（无独立
 * elementId），不可独立选中——点击回落到所属块，编辑入口在右侧属性表单 */
function requirementFieldEntry(
  field: { field: string; value: string },
  ownerSelection: Selection,
): TreeEntry {
  return {
    key: `${field.field}:${field.value}`,
    label: `${field.field}: ${field.value}`,
    depth: 2,
    selection: ownerSelection,
  }
}

function requirementPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'requirement') return []
  const p: RequirementProjection = projection.requirement
  return [
    withDiagramLabel(diagramSection(p.direction ?? undefined), t('app:propertyPanel.diagram')),
    {
      key: 'requirements',
      heading: t('app:propertyPanel.requirementTreeReqs'),
      count: p.requirements.length,
      entries: p.requirements.map((r) => ({
        key: r.elementId ?? `implicit:${r.name}`,
        label: r.name,
        detail: r.type !== '' ? r.type : undefined,
        depth: 1,
        selection: { kind: 'requirement', name: r.name },
        children: r.fields.map((f) => requirementFieldEntry(f, { kind: 'requirement', name: r.name })),
      })),
    },
    {
      key: 'elements',
      heading: t('app:propertyPanel.requirementTreeEls'),
      count: p.elements.length,
      entries: p.elements.map((e) => ({
        key: e.elementId ?? `implicit:${e.name}`,
        label: e.name,
        detail: e.type ?? undefined,
        depth: 1,
        selection: { kind: 'requirement-element', name: e.name },
        children: e.fields.map((f) => requirementFieldEntry(f, { kind: 'requirement-element', name: e.name })),
      })),
    },
    {
      key: 'relations',
      heading: t('app:propertyPanel.requirementTreeRels'),
      count: p.relations.length,
      entries: p.relations.map((rel) => ({
        key: rel.elementId,
        // 归一后的语义方向展示（from/to 已按箭头方向归一；reversed 只是源码书写形态）
        label: `${rel.from} - ${rel.relationKind} -> ${rel.to}`,
        depth: 1,
        selection: { kind: 'requirement-relation', elementId: rel.elementId },
      })),
    },
  ]
}

// ---------- journey（more-diagrams 工单 08） ----------

/**
 * journey 任务条目的键盘（工单 08 / ADR-0013）：焦点在任务条目上时
 * Tab = 同 section 加任务 / Enter = 加 section / Delete = 删除（preventDefault 压掉默认行为）。
 * 键 → plan 走能力包同一份 journeyKeyPlan，执行交给唯一的 applyPlan。
 * 与 timeline 同理接 Delete：journey 画布无 data-id 寻址（见 journey-adapter），
 * 画布键盘拿不到任务选中，结构树是唯一的键盘入口。
 */
function journeyTaskKeyDown(projection: JourneyProjection, elementId: string): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.shiftKey) return
    if (e.key !== 'Tab' && e.key !== 'Enter' && e.key !== 'Delete' && e.key !== 'Backspace') return
    const selection: Selection = { kind: 'journey-task', elementId }
    const plan = journeyKeyPlan(projection, { key: e.key, mods: { shift: e.shiftKey }, selection })
    if (plan === null) return
    const { commitIntent, select } = useEditorStore.getState()
    applyPlan(plan, { commitIntent, select, preventDefault: () => e.preventDefault() })
  }
}

/**
 * journey 结构树（工单 08）：section 作为分组条目、其任务作为 children（复用树形渲染器）；
 * 首个 section 之前的任务（mermaid 空分组）平铺在「任务」分区。任务 detail 携带
 * score 与 actor 列表；**越界/非数字 score 原样展示并标注**（不静默改写，工单定案）。
 * journey 画布无 data-id（见 journey-adapter），结构树 + 属性表单是完整编辑入口。
 */
function journeyPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'journey') return []
  const p: JourneyProjection = projection.journey

  const scoreLabel = (task: (typeof p.tasks)[number]): string =>
    task.scoreInRange
      ? t('app:propertyPanel.journeyScoreShort', { score: task.scoreText })
      : t('app:propertyPanel.journeyScoreInvalidShort', { score: task.scoreText })

  const taskEntry = (task: (typeof p.tasks)[number]): TreeEntry => ({
    key: task.elementId,
    label: task.name,
    detail:
      [scoreLabel(task), task.actors.length > 0 ? task.actors.join(', ') : undefined]
        .filter((x) => x !== undefined)
        .join(' · ') || undefined,
    depth: 2,
    selection: { kind: 'journey-task', elementId: task.elementId },
    onKeyDown: journeyTaskKeyDown(p, task.elementId),
  })

  return [
    withDiagramLabel(diagramSection(p.title ?? undefined), t('app:propertyPanel.diagram')),
    {
      key: 'sections',
      heading: t('app:propertyPanel.journeySections'),
      count: p.sections.length,
      entries: p.sections.map((s) => ({
        key: s.elementId,
        label: s.name,
        detail: `${s.tasks.length}`,
        depth: 1,
        selection: { kind: 'journey-section', elementId: s.elementId },
        children: s.tasks.length > 0 ? s.tasks.map(taskEntry) : undefined,
      })),
    },
    {
      key: 'tasks',
      heading: t('app:propertyPanel.journeyTasks'),
      count: p.rootTasks.length,
      entries: p.rootTasks.map(taskEntry),
    },
  ]
}

// ---------- gantt（more-diagrams 工单 11） ----------

/**
 * gantt 任务条目的键盘（工单 11 / ADR-0013，与 journey 同构）：焦点在任务条目上时
 * Tab = 同 section 加任务 / Enter = 加 section / Delete = 删除（preventDefault 压掉默认行为）。
 * 键 → plan 走能力包同一份 ganttKeyPlan，执行交给唯一的 applyPlan。
 * gantt 画布只有任务条可寻址（见 gantt-adapter），section 与指令行不可寻址——
 * 结构树是这两者的唯一键盘 / 选中入口；任务条目接 Delete 与 timeline/journey 同理。
 */
function ganttTaskKeyDown(projection: GanttProjection, elementId: string): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.shiftKey) return
    if (e.key !== 'Tab' && e.key !== 'Enter' && e.key !== 'Delete' && e.key !== 'Backspace') return
    const selection: Selection = { kind: 'gantt-task', elementId }
    const plan = ganttKeyPlan(projection, { key: e.key, mods: { shift: e.shiftKey }, selection })
    if (plan === null) return
    const { commitIntent, select } = useEditorStore.getState()
    applyPlan(plan, { commitIntent, select, preventDefault: () => e.preventDefault() })
  }
}

/**
 * gantt 结构树（工单 11）：section 作为分组条目、其任务作为 children（复用树形渲染器）；
 * 首个 section 之前的任务（mermaid 空分组）平铺在「任务」分区。指令行是**文档级属性
 * 元素**（工单定案），单列一个分区、逐行可选中编辑。任务 detail 携带标签与元数据字段
 * 原文（清单外形态 shape = null 时原样展示，不静默改写，工单定案）。
 */
function ganttPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'gantt') return []
  const p: GanttProjection = projection.gantt

  const taskEntry = (task: (typeof p.tasks)[number]): TreeEntry => ({
    key: task.elementId,
    label: task.name,
    detail:
      [task.tags.join(', ') || undefined, task.fields.join(', ') || undefined]
        .filter((x) => x !== undefined)
        .join(' · ') || undefined,
    depth: 2,
    selection: { kind: 'gantt-task', elementId: task.elementId },
    onKeyDown: ganttTaskKeyDown(p, task.elementId),
  })

  return [
    withDiagramLabel(diagramSection(p.title ?? undefined), t('app:propertyPanel.diagram')),
    {
      key: 'directives',
      heading: t('app:propertyPanel.ganttDirectives'),
      count: p.directives.length,
      entries: p.directives.map((d) => ({
        key: d.elementId,
        label: d.keyword,
        detail: d.value,
        depth: 1,
        selection: { kind: 'gantt-directive', elementId: d.elementId },
      })),
    },
    {
      key: 'sections',
      heading: t('app:propertyPanel.ganttSections'),
      count: p.sections.length,
      entries: p.sections.map((s) => ({
        key: s.elementId,
        label: s.name,
        detail: `${s.tasks.length}`,
        depth: 1,
        selection: { kind: 'gantt-section', elementId: s.elementId },
        children: s.tasks.length > 0 ? s.tasks.map(taskEntry) : undefined,
      })),
    },
    {
      key: 'tasks',
      heading: t('app:propertyPanel.ganttTasks'),
      count: p.rootTasks.length,
      entries: p.rootTasks.map(taskEntry),
    },
  ]
}

// ---------- pie（more-diagrams 工单 10） ----------

/**
 * pie 扇区条目的键盘（工单 10 / ADR-0013）：焦点在扇区条目上时
 * Tab = 加扇区 / Delete = 删除（preventDefault 压掉默认行为）；Enter 无自然类比，
 * 工单定案不接。键 → plan 走能力包同一份 pieKeyPlan，执行交给唯一的 applyPlan。
 * 与 timeline/journey 同理接 Delete：pie 画布无 data-id 寻址（见 pie-adapter），
 * 画布键盘拿不到扇区选中，结构树是唯一的键盘入口。
 */
function pieSectorKeyDown(projection: PieProjection, elementId: string): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.shiftKey) return
    if (e.key !== 'Tab' && e.key !== 'Delete' && e.key !== 'Backspace') return
    const selection: Selection = { kind: 'pie-sector', elementId }
    const plan = pieKeyPlan(projection, { key: e.key, mods: { shift: e.shiftKey }, selection })
    if (plan === null) return
    const { commitIntent, select } = useEditorStore.getState()
    applyPlan(plan, { commitIntent, select, preventDefault: () => e.preventDefault() })
  }
}

/**
 * pie 结构树（工单 10）：单一「扇区」分区。扇区 detail 携带数值原文；
 * **负数/零等非法数值原样展示并标注**（不静默改写，工单定案——负数是 mermaid
 * 落码错误、零被渲染层静默过滤）。pie 画布无 data-id（见 pie-adapter），
 * 结构树 + 属性表单是完整编辑入口。
 */
function piePartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'pie') return []
  const p: PieProjection = projection.pie

  return [
    withDiagramLabel(diagramSection(p.title ?? undefined), t('app:propertyPanel.diagram')),
    {
      key: 'sectors',
      heading: t('app:propertyPanel.pieSectors'),
      count: p.sectors.length,
      entries: p.sectors.map((s) => ({
        key: s.elementId,
        label: s.label,
        detail: s.valuePositive
          ? s.valueText
          : t('app:propertyPanel.pieValueInvalidShort', { value: s.valueText }),
        depth: 1,
        selection: { kind: 'pie-sector', elementId: s.elementId },
        onKeyDown: pieSectorKeyDown(p, s.elementId),
      })),
    },
  ]
}

// ---------- radar（more-diagrams 工单 15） ----------

/**
 * radar 结构树条目的键盘（工单 15 / ADR-0013）：焦点在轴 / 曲线条目上时
 * Tab = 加轴 / 加曲线、Delete = 删除（preventDefault 压掉默认行为）；Enter 无自然
 * 类比，工单定案不接。键 → plan 走能力包同一份 radarKeyPlan，执行交给唯一的
 * applyPlan。radar 画布无 data-id 寻址（见 radar-adapter），结构树是唯一的键盘入口。
 */
function radarEntryKeyDown(
  projection: RadarProjection,
  kind: 'radar-axis' | 'radar-curve',
  elementId: string,
): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.shiftKey) return
    if (e.key !== 'Tab' && e.key !== 'Delete' && e.key !== 'Backspace') return
    const selection: Selection = { kind, elementId }
    const plan = radarKeyPlan(projection, { key: e.key, mods: { shift: e.shiftKey }, selection })
    if (plan === null) return
    const { commitIntent, select } = useEditorStore.getState()
    applyPlan(plan, { commitIntent, select, preventDefault: () => e.preventDefault() })
  }
}

/**
 * radar 结构树（工单 15）：轴 / 曲线 / 选项三分区。轴与曲线 label 缺省回退语法 id
 * （mermaid db 语义 label ?? name）；曲线 detail 是**双形态归一后**的值映射摘要
 * （键值 / 值列表都归一为 axisId=value——原形态保留在源码，投影不做区分展示），
 * raw 形态（清单外条目）只标注不可编辑。选项条目点击回落图表级（编辑入口 = 图表级
 * 表单的图表级字段）。radar 画布无 data-id（见 radar-adapter），结构树 + 属性表单
 * 是完整编辑入口。
 */
function radarPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'radar') return []
  const p: RadarProjection = projection.radar

  return [
    withDiagramLabel(diagramSection(p.title ?? undefined), t('app:propertyPanel.diagram')),
    {
      key: 'axes',
      heading: t('app:propertyPanel.radarAxes'),
      count: p.axes.length,
      entries: p.axes.map((a) => ({
        key: a.elementId,
        label: a.label ?? a.id,
        detail: a.label !== null ? a.id : undefined,
        depth: 1,
        selection: { kind: 'radar-axis', elementId: a.elementId },
        onKeyDown: radarEntryKeyDown(p, 'radar-axis', a.elementId),
      })),
    },
    {
      key: 'curves',
      heading: t('app:propertyPanel.radarCurves'),
      count: p.curves.length,
      entries: p.curves.map((c) => {
        const summary = Object.entries(c.values)
          .map(([axisId, value]) => `${axisId}=${value}`)
          .join(' · ')
        return {
          key: c.elementId,
          label: c.label ?? c.id,
          detail:
            c.form === 'raw'
              ? t('app:propertyPanel.radarCurveRaw')
              : summary !== ''
                ? summary
                : undefined,
          depth: 1,
          selection: { kind: 'radar-curve', elementId: c.elementId },
          onKeyDown: radarEntryKeyDown(p, 'radar-curve', c.elementId),
        }
      }),
    },
    {
      key: 'options',
      heading: t('app:propertyPanel.radarOptions'),
      count: p.options.length,
      entries: p.options.map((o) => ({
        key: o.elementId,
        label: o.name,
        detail: o.value,
        depth: 1,
        // 选项无独立选中种类（编辑入口 = 图表级表单），点击回落图表级
        selection: DIAGRAM_SELECTION,
      })),
    },
  ]
}

// ---------- block（more-diagrams 工单 09） ----------

/**
 * block 结构树：嵌套块作为分组条目，成员节点作为 children（与 kanban 列/卡片、
 * state 复合状态同一套树形渲染器）。space 不进结构树（布局空位，工单决策）；
 * 边单独一个分区（位置序身份）。节点/嵌套块共享 id 名空间，React key 加种类前缀。
 */
function blockPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'block') return []
  const p: BlockProjection = projection.block

  const nodeEntry = (node: (typeof p.nodes)[number], depth: number): TreeEntry => {
    const shapeLabel =
      node.shape !== null ? t(`app:blockShapes.${node.shape}`) : undefined
    return {
      key: `node:${node.id}`,
      label: node.label ?? node.id,
      detail:
        [
          node.label !== null ? node.id : undefined,
          shapeLabel,
          node.arrowDirs !== null ? `(${node.arrowDirs})` : undefined,
          node.width !== null ? `x${node.width}` : undefined,
        ]
          .filter((x) => x !== undefined)
          .join(' · ') || undefined,
      depth,
      selection: { kind: 'block-node', id: node.id },
    }
  }

  // 嵌套块递归展开：组内直属节点作 children，嵌套组继续下钻
  const groupEntry = (group: (typeof p.groups)[number], depth: number): TreeEntry => {
    const memberNodes = p.nodes.filter((n) => n.parentId === group.id)
    const childGroups = p.groups.filter((g) => g.parentId === group.id)
    const children = [
      ...memberNodes.map((n) => nodeEntry(n, depth + 1)),
      ...childGroups.map((g) => groupEntry(g, depth + 1)),
    ]
    return {
      key: `group:${group.id}`,
      label: group.id,
      detail:
        [
          group.columns !== null ? `columns ${group.columns === 'auto' ? 'auto' : group.columns}` : undefined,
          group.width !== null ? `x${group.width}` : undefined,
        ]
          .filter((x) => x !== undefined)
          .join(' · ') || undefined,
      depth,
      selection: { kind: 'block-group', id: group.id },
      children: children.length > 0 ? children : undefined,
    }
  }

  return [
    withDiagramLabel(diagramSection(p.title ?? p.keyword), t('app:propertyPanel.diagram')),
    {
      key: 'nodes',
      heading: t('app:propertyPanel.blockNodes'),
      count: p.nodes.length + p.groups.length,
      entries: [
        ...p.nodes.filter((n) => n.parentId === null).map((n) => nodeEntry(n, 1)),
        ...p.groups.filter((g) => g.parentId === null).map((g) => groupEntry(g, 1)),
      ],
    },
    {
      key: 'edges',
      heading: t('app:propertyPanel.blockEdges'),
      count: p.edges.length,
      entries: p.edges.map((edge) => ({
        key: edge.elementId,
        label: `${edge.from} ${edge.line} ${edge.to}`,
        detail: edge.label ?? undefined,
        depth: 1,
        selection: { kind: 'block-edge', elementId: edge.elementId },
      })),
    },
  ]
}

// ---------- sankey（more-diagrams 工单 13） ----------

/**
 * sankey 结构树（工单 13）：**节点作为分组条目、链路作为其子元素呈现**（工单定案——
 * 节点不落码，名字只存在于链路行，故树以节点为组织轴；与 kanban 的「列分组 + 卡片
 * children」同款嵌套范式）。节点 = 链路行 source/target 首现去重派生，名字即身份；
 * 其 children = 该节点作为 source/target 参与的全部链路（`linkIds`，同一条链路会同时
 * 挂在两端节点下——参与语义，每条仍各自选中）。链路 detail 携带数值原文，**非法数值/
 * 非法名字原样展示并标注**（不静默改写，工单定案——非 ASCII 名字是 mermaid 词法错误、
 * value 走宽松 parseFloat）。sankey 画布经位置序反注可寻址（见 sankey-adapter），
 * 画布键盘直接生效，树条目不再挂 onKeyDown（与 flowchart 同口径，区别于 pie/journey
 * 的「画布无寻址」降级）。
 */
function sankeyPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'sankey') return []
  const p: SankeyProjection = projection.sankey
  const linkById = new Map(p.links.map((l) => [l.elementId, l]))

  return [
    withDiagramLabel(diagramSection('sankey-beta'), t('app:propertyPanel.diagram')),
    {
      key: 'nodes',
      heading: t('app:propertyPanel.sankeyNodes'),
      count: p.nodes.length,
      entries: p.nodes.map((n) => ({
        key: `node:${n.name}`,
        label: n.name,
        detail:
          [
            t('app:propertyPanel.sankeyNodeDegree', { count: n.linkIds.length }),
            n.nameValid ? undefined : t('app:propertyPanel.sankeyNameInvalidShort', { name: n.name }),
          ]
            .filter((x) => x !== undefined)
            .join(' · ') || undefined,
        depth: 1,
        selection: { kind: 'sankey-node', name: n.name },
        children: n.linkIds
          .map((elementId) => {
            const l = linkById.get(elementId)
            if (l === undefined) return null
            return {
              key: elementId,
              label: `${l.source} → ${l.target}`,
              detail:
                [
                  l.valueValid ? l.valueText : t('app:propertyPanel.sankeyValueInvalidShort', { value: l.valueText }),
                  !l.sourceValid || !l.targetValid ? t('app:propertyPanel.sankeyEndpointInvalid') : undefined,
                ]
                  .filter((x) => x !== undefined)
                  .join(' · ') || undefined,
              depth: 2,
              selection: { kind: 'sankey-link', elementId: l.elementId } as Selection,
            }
          })
          .filter((x) => x !== null),
      })),
    },
  ]
}

// ---------- quadrant（more-diagrams 工单 12） ----------

/**
 * quadrant 点条目的键盘（工单 12 / ADR-0013）：焦点在点条目上时
 * Tab = 加点 / Delete = 删除（preventDefault 压掉默认行为）；Enter 无自然类比，
 * 工单定案不接。键 → plan 走能力包同一份 quadrantKeyPlan，执行交给唯一的 applyPlan。
 * quadrant 点有 data-id 寻址（位置序反注，见 quadrant-adapter），画布键盘与结构树
 * 键盘都可用；轴/象限标题是文档级属性元素，不接键盘增删（工单定案）。
 */
function quadrantPointKeyDown(projection: QuadrantProjection, elementId: string): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.shiftKey) return
    if (e.key !== 'Tab' && e.key !== 'Delete' && e.key !== 'Backspace') return
    const selection: Selection = { kind: 'quadrant-point', elementId }
    const plan = quadrantKeyPlan(projection, { key: e.key, mods: { shift: e.shiftKey }, selection })
    if (plan === null) return
    const { commitIntent, select } = useEditorStore.getState()
    applyPlan(plan, { commitIntent, select, preventDefault: () => e.preventDefault() })
  }
}

/**
 * quadrant 结构树（工单 12）：轴 / 象限标题 / 点三个分区。轴是文档级属性元素
 * （detail = 左 → 右段文本）；象限标题 detail 携带 quadrant-N 编号；点 detail 携带
 * 坐标原文，**越界/畸形坐标原样展示并标注**（不静默改写，工单定案——坐标越界
 * mermaid 词法直接报错）。缺失的 quadrant-N 行不产生条目（工单不做加象限行）。
 */
function quadrantPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'quadrant') return []
  const p: QuadrantProjection = projection.quadrant

  const axisDetail = (a: { first: string; second: string | null }): string =>
    a.second !== null ? `${a.first} → ${a.second}` : a.first

  const axes: TreeEntry[] = []
  if (p.xAxis !== null) {
    axes.push({
      key: p.xAxis.elementId,
      label: t('app:propertyPanel.quadrantXAxis'),
      detail: axisDetail(p.xAxis),
      depth: 1,
      selection: { kind: 'quadrant-axis', elementId: p.xAxis.elementId },
    })
  }
  if (p.yAxis !== null) {
    axes.push({
      key: p.yAxis.elementId,
      label: t('app:propertyPanel.quadrantYAxis'),
      detail: axisDetail(p.yAxis),
      depth: 1,
      selection: { kind: 'quadrant-axis', elementId: p.yAxis.elementId },
    })
  }

  return [
    withDiagramLabel(diagramSection(p.title ?? undefined), t('app:propertyPanel.diagram')),
    { key: 'axes', heading: t('app:propertyPanel.quadrantAxes'), count: axes.length, entries: axes },
    {
      key: 'quadrants',
      heading: t('app:propertyPanel.quadrantSlots'),
      count: p.quadrants.length,
      entries: p.quadrants.map((q) => ({
        key: q.elementId,
        label: q.text,
        detail: `quadrant-${q.index}`,
        depth: 1,
        selection: { kind: 'quadrant-quadrant', elementId: q.elementId },
      })),
    },
    {
      key: 'points',
      heading: t('app:propertyPanel.quadrantPoints'),
      count: p.points.length,
      entries: p.points.map((pt) => ({
        key: pt.elementId,
        label: pt.text,
        detail: pt.coordsValid
          ? `[${pt.xText}, ${pt.yText}]`
          : t('app:propertyPanel.quadrantCoordInvalidShort', {
              value: `[${pt.xText}, ${pt.yText}]`,
            }),
        depth: 1,
        selection: { kind: 'quadrant-point', elementId: pt.elementId },
        onKeyDown: quadrantPointKeyDown(p, pt.elementId),
      })),
    },
  ]
}

// ---------- packet（more-diagrams 工单 16） ----------

/**
 * packet 字段条目的键盘（工单 16 / ADR-0013）：焦点在字段条目上时
 * Tab = 加字段（+count 形态衔接前序）/ Delete = 删除（preventDefault 压掉默认行为）；
 * Enter 无自然类比，工单定案不接。键 → plan 走能力包同一份 packetKeyPlan，执行交给
 * 唯一的 applyPlan。packet 字段有 data-id 寻址（start-bit 映射反注，见 packet-adapter），
 * 画布键盘与结构树键盘都可用。
 */
function packetFieldKeyDown(projection: PacketProjection, elementId: string): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.shiftKey) return
    if (e.key !== 'Tab' && e.key !== 'Delete' && e.key !== 'Backspace') return
    const selection: Selection = { kind: 'packet-field', elementId }
    const plan = packetKeyPlan(projection, { key: e.key, mods: { shift: e.shiftKey }, selection })
    if (plan === null) return
    const { commitIntent, select } = useEditorStore.getState()
    applyPlan(plan, { commitIntent, select, preventDefault: () => e.preventDefault() })
  }
}

/**
 * packet 结构树（工单 16）：单一「字段」分区。字段 detail 携带归一后的绝对位区间
 * （工单定案：+count / single 形态归一展示 + 原形态标注）；`contiguous = false`
 * （手写源码的间隙/重叠——mermaid 12 整图渲染失败）时追加不衔接标注
 * （pie valuePositive 同口径：原文保留，交由结构树标注）。
 */
function packetPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'packet') return []
  const p: PacketProjection = projection.packet

  const rangeDetail = (f: ProjectionPacketField): string => {
    const abs = `${f.absStart}-${f.absEnd}`
    const form =
      f.form.kind === 'range'
        ? abs
        : f.form.kind === 'single'
          ? `${f.form.start}（1 位）`
          : `+${f.form.count}（${abs}）`
    return f.contiguous ? form : `${form} · ${t('app:propertyPanel.packetNotContiguous')}`
  }

  return [
    withDiagramLabel(diagramSection(undefined), t('app:propertyPanel.diagram')),
    {
      key: 'fields',
      heading: t('app:propertyPanel.packetFields'),
      count: p.fields.length,
      entries: p.fields.map((f) => ({
        key: f.elementId,
        label: f.name,
        detail: rangeDetail(f),
        depth: 1,
        selection: { kind: 'packet-field', elementId: f.elementId },
        onKeyDown: packetFieldKeyDown(p, f.elementId),
      })),
    },
  ]
}

// ---------- xychart（more-diagrams 工单 14） ----------

/**
 * xychart 结构树（工单 14）：三个分区——标题与轴（文档级属性元素，固定身份）、
 * 系列（位置序身份 `series:N`）。系列 label = 名字 ?? 「未命名系列」，detail 携带
 * 类型与数值个数；**手写源码的非法名字 / 非法数值 / 点标签系列原样展示并标注**
 * （不静默改写，工单定案）。xychart 画布经类名组反注可寻址（见 xychart-adapter），
 * 画布键盘直接生效，树条目不挂 onKeyDown（与 flowchart 同口径）。
 */
function xychartPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'xychart') return []
  const p: XychartProjection = projection.xychart

  const docEntries: TreeEntry[] = []
  if (p.title !== null) {
    docEntries.push({
      key: 'xychart-title',
      label: p.title.text,
      detail: p.title.textValid ? undefined : t('app:propertyPanel.xychartTextInvalidShort', { text: p.title.text }),
      depth: 1,
      selection: { kind: 'xychart-title' },
    })
  }
  for (const axis of [p.xAxis, p.yAxis]) {
    const formLabel =
      axis.form === 'categories'
        ? t('app:propertyPanel.xychartUseCategories')
        : axis.form === 'range'
          ? `${axis.range?.min ?? ''} --> ${axis.range?.max ?? ''}`
          : t('app:propertyPanel.xychartAxisNoRest')
    docEntries.push({
      key: `xychart-${axis.axis}-axis`,
      label: t('app:propertyPanel.xychartAxisLabel', { axis: axis.axis.toUpperCase() }),
      detail:
        [
          axis.title ?? t('app:propertyPanel.xychartAxisNoTitle'),
          formLabel,
          axis.titleValid ? undefined : t('app:propertyPanel.xychartTextInvalidShort', { text: axis.title ?? '' }),
        ]
          .filter((x) => x !== undefined)
          .join(' · '),
      depth: 1,
      selection: { kind: 'xychart-axis', axis: axis.axis },
    })
  }

  return [
    withDiagramLabel(diagramSection('xychart-beta'), t('app:propertyPanel.diagram')),
    {
      key: 'doc-elements',
      heading: t('app:propertyPanel.xychartDocElements'),
      entries: docEntries,
    },
    {
      key: 'series',
      heading: t('app:propertyPanel.xychartSeries'),
      count: p.series.length,
      entries: p.series.map((s) => ({
        key: s.elementId,
        label: s.name ?? t('app:propertyPanel.xychartUnnamedSeries'),
        detail:
          [
            s.seriesType,
            t('app:propertyPanel.xychartValueCount', { count: s.values.length }),
            s.nameValid ? undefined : t('app:propertyPanel.xychartTextInvalidShort', { text: s.name ?? '' }),
            s.editable ? undefined : t('app:propertyPanel.xychartLabelsHint'),
          ]
            .filter((x) => x !== undefined)
            .join(' · ') || undefined,
        depth: 1,
        selection: { kind: 'xychart-series', elementId: s.elementId },
      })),
    },
  ]
}

// ---------- architecture（more-diagrams 工单 17） ----------

/**
 * architecture 结构树：分组（group）作为分组条目、其 service / junction / 嵌套组作为
 * children（复用与 block 嵌套块同一套树形渲染器）。三类节点共享 id 命名空间，React key
 * 加种类前缀。边走位置序分区（label `from → to`，detail 携带箭头形态）；align 单独一个
 * 分区（位置序身份）。边不可寻址（见 architecture-adapter），结构树 + 属性表单是完整编辑入口。
 */
function architecturePartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'architecture') return []
  const p: ArchitectureProjection = projection.architecture

  const arrowLabel = (arrow: 'none' | 'source' | 'target' | 'both'): string =>
    t(`app:architectureArrows.${arrow}`)

  const serviceEntry = (service: ProjectionArchitectureService, depth: number): TreeEntry => ({
    key: `service:${service.id}`,
    label: service.title ?? service.id,
    detail:
      [
        service.title !== null ? service.id : undefined,
        service.icon,
        service.parent !== null ? t('app:propertyPanel.archInGroupShort', { group: service.parent }) : undefined,
      ]
        .filter((x) => x !== undefined)
        .join(' · ') || undefined,
    depth,
    selection: { kind: 'architecture-service', name: service.id },
  })

  const junctionEntry = (junction: ProjectionArchitectureJunction, depth: number): TreeEntry => ({
    key: `junction:${junction.id}`,
    label: junction.id,
    detail: junction.parent !== null ? t('app:propertyPanel.archInGroupShort', { group: junction.parent }) : undefined,
    depth,
    selection: { kind: 'architecture-junction', name: junction.id },
  })

  const groupEntry = (group: ProjectionArchitectureGroup, depth: number): TreeEntry => {
    const childServices = p.services.filter((s) => s.parent === group.id)
    const childJunctions = p.junctions.filter((j) => j.parent === group.id)
    const childGroups = p.groups.filter((g) => g.parent === group.id)
    const children = [
      ...childServices.map((s) => serviceEntry(s, depth + 1)),
      ...childJunctions.map((j) => junctionEntry(j, depth + 1)),
      ...childGroups.map((g) => groupEntry(g, depth + 1)),
    ]
    return {
      key: `group:${group.id}`,
      label: group.title ?? group.id,
      detail:
        [
          group.title !== null ? group.id : undefined,
          group.icon,
          group.parent !== null ? t('app:propertyPanel.archInGroupShort', { group: group.parent }) : undefined,
        ]
          .filter((x) => x !== undefined)
          .join(' · ') || undefined,
      depth,
      selection: { kind: 'architecture-group', name: group.id },
      children: children.length > 0 ? children : undefined,
    }
  }

  return [
    withDiagramLabel(diagramSection(p.keyword), t('app:propertyPanel.diagram')),
    {
      key: 'nodes',
      heading: t('app:propertyPanel.architectureNodes'),
      count: p.services.length + p.groups.length + p.junctions.length,
      entries: [
        ...p.services.filter((s) => s.parent === null).map((s) => serviceEntry(s, 1)),
        ...p.junctions.filter((j) => j.parent === null).map((j) => junctionEntry(j, 1)),
        ...p.groups.filter((g) => g.parent === null).map((g) => groupEntry(g, 1)),
      ],
    },
    {
      key: 'edges',
      heading: t('app:propertyPanel.architectureEdges'),
      count: p.edges.length,
      entries: p.edges.map((edge) => ({
        key: edge.elementId,
        label: `${edge.from} → ${edge.to}`,
        detail:
          [
            arrowLabel(edge.arrow),
            edge.fromPort !== null || edge.toPort !== null
              ? `${edge.fromPort ?? '-'}·${edge.toPort ?? '-'}`
              : undefined,
            edge.endpointValid ? undefined : t('app:propertyPanel.archEndpointInvalidShort'),
          ]
            .filter((x) => x !== undefined)
            .join(' · ') || undefined,
        depth: 1,
        selection: { kind: 'architecture-edge', elementId: edge.elementId },
      })),
    },
    {
      key: 'aligns',
      heading: t('app:propertyPanel.architectureAligns'),
      count: p.aligns.length,
      entries: p.aligns.map((align) => ({
        key: align.elementId,
        label: `align ${align.direction}`,
        detail: align.members.join(', '),
        depth: 1,
        selection: { kind: 'architecture-align', elementId: align.elementId },
      })),
    },
  ]
}

// ---------- treemap（more-diagrams 工单 20） ----------

/**
 * treemap 结构树条目的键盘（工单 20 / ADR-0013）：焦点在节点条目上时
 * Tab = 加叶子子节点（仅 Section；叶子有值即叶子）/ Enter = 加同级叶子 /
 * Delete = 删除该节点（连同子树，preventDefault 压掉默认行为）。
 * 键 → plan 走能力包同一份 treemapKeyPlan，执行交给唯一的 applyPlan。
 * treemap 画布无 data-id（research §4 实测，见 treemap-adapter），
 * 结构树是唯一的键盘入口（与 timeline/journey 同口径）。
 */
function treemapEntryKeyDown(
  projection: TreemapProjection,
  elementId: string,
): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.shiftKey) return
    if (e.key !== 'Tab' && e.key !== 'Enter' && e.key !== 'Delete' && e.key !== 'Backspace') return
    const selection: Selection = { kind: 'treemap-node', elementId }
    const plan = treemapKeyPlan(projection, { key: e.key, mods: { shift: e.shiftKey }, selection })
    if (plan === null) return
    const { commitIntent, select } = useEditorStore.getState()
    applyPlan(plan, { commitIntent, select, preventDefault: () => e.preventDefault() })
  }
}

/**
 * treemap 结构树（工单 20）：单一「节点」分区，层级节点递归展开（与 mindmap/state
 * 复合状态同一套树形渲染器）。Section 是分组、Leaf 是叶子；叶子 detail 携带数值原文，
 * **非法数值（手写源码的清单外形态）原样展示并标注**（不静默改写，工单定案）。
 * treemap 画布无 data-id（research §4：渲染器只有 class + d3 值降序索引），
 * 结构树 + 属性表单是完整编辑入口。
 */
function treemapPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'treemap') return []
  const p: TreemapProjection = projection.treemap

  const nodeEntry = (node: ProjectionTreemapNode): TreeEntry => {
    const children = node.children.map(nodeEntry)
    return {
      key: node.elementId,
      label: node.name,
      detail:
        [
          node.nodeKind === 'leaf'
            ? node.valueValid
              ? node.valueText ?? ''
              : t('app:propertyPanel.treemapValueInvalidShort', { value: node.valueText ?? '' })
            : undefined,
        ]
          .filter((x) => x !== undefined)
          .join(' · ') || undefined,
      depth: node.depth + 1,
      selection: { kind: 'treemap-node', elementId: node.elementId },
      onKeyDown: treemapEntryKeyDown(p, node.elementId),
      children: children.length > 0 ? children : undefined,
    }
  }

  return [
    withDiagramLabel(diagramSection(p.roots.length > 0 ? 'treemap' : undefined), t('app:propertyPanel.diagram')),
    {
      key: 'nodes',
      heading: t('app:propertyPanel.treemapNodes'),
      count: p.nodes.length,
      entries: p.roots.map(nodeEntry),
    },
  ]
}

// ---------- ishikawa（more-diagrams 工单 22） ----------

/**
 * ishikawa 结构树条目的键盘（工单 22 / ADR-0013）：焦点在节点条目上时
 * Tab = 加子节点 / Enter = 加同级节点 / Delete = 删除该节点（连同子树；
 * 鱼头不可删，preventDefault 压掉默认行为）。
 * 键 → plan 走能力包同一份 ishikawaKeyPlan，执行交给唯一的 applyPlan。
 * ishikawa 画布无 data-id（research §4 实测，见 ishikawa-adapter），
 * 结构树是唯一的键盘入口（与 treemap/timeline/journey 同口径）。
 */
function ishikawaEntryKeyDown(
  projection: IshikawaProjection,
  elementId: string,
): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.shiftKey) return
    if (e.key !== 'Tab' && e.key !== 'Enter' && e.key !== 'Delete' && e.key !== 'Backspace') return
    const selection: Selection = { kind: 'ishikawa-node', elementId }
    const plan = ishikawaKeyPlan(projection, { key: e.key, mods: { shift: e.shiftKey }, selection })
    if (plan === null) return
    const { commitIntent, select } = useEditorStore.getState()
    applyPlan(plan, { commitIntent, select, preventDefault: () => e.preventDefault() })
  }
}

/**
 * ishikawa 结构树（工单 22）：单一「因果树」分区，鱼头（问题）为根、主因（一级）挂其下、
 * 分支（二级及更深）递归展开（与 mindmap/state 复合状态同一套树形渲染器）。
 * 主因条目 detail 标注层级（主因）；鱼头不可删。
 * ishikawa 画布无 data-id 且渲染序 ≠ 源码序（research §4），结构树 + 属性表单是
 * 完整编辑入口。
 */
function ishikawaPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'ishikawa') return []
  const p: IshikawaProjection = projection.ishikawa

  const nodeEntry = (node: ProjectionIshikawaNode): TreeEntry => {
    const children = node.children.map(nodeEntry)
    return {
      key: node.elementId,
      label: node.text,
      detail: node.isRoot
        ? t('app:propertyPanel.ishikawaRootShort')
        : node.depth === 1
          ? t('app:propertyPanel.ishikawaCauseShort')
          : undefined,
      depth: node.depth + 1,
      selection: { kind: 'ishikawa-node', elementId: node.elementId },
      onKeyDown: ishikawaEntryKeyDown(p, node.elementId),
      children: children.length > 0 ? children : undefined,
    }
  }

  return [
    withDiagramLabel(diagramSection(p.root !== null ? 'ishikawa' : undefined), t('app:propertyPanel.diagram')),
    {
      key: 'causes',
      heading: t('app:propertyPanel.ishikawaCauses'),
      count: p.nodes.length,
      entries: p.root !== null ? [nodeEntry(p.root)] : [],
    },
  ]
}

// ---------- wardley（more-diagrams 工单 23） ----------

/**
 * wardley 节点条目的键盘（工单 23 / ADR-0013）：焦点在节点条目上时
 * Tab = 加 component / Enter = 加 anchor / Delete = 删除该节点（连带触及的连线与 evolve，
 * preventDefault 压掉默认行为）。键 → plan 走能力包同一份 wardleyKeyPlan，执行交给唯一的
 * applyPlan。wardley 画布无 data-id（research §4 实测，见 wardley-adapter），
 * 结构树是唯一的键盘入口（与 treemap/timeline/journey 同口径）。
 */
function wardleyNodeKeyDown(
  projection: WardleyProjection,
  name: string,
): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.shiftKey) return
    if (e.key !== 'Tab' && e.key !== 'Enter' && e.key !== 'Delete' && e.key !== 'Backspace') return
    const selection: Selection = { kind: 'wardley-node', name }
    const plan = wardleyKeyPlan(projection, { key: e.key, mods: { shift: e.shiftKey }, selection })
    if (plan === null) return
    const { commitIntent, select } = useEditorStore.getState()
    applyPlan(plan, { commitIntent, select, preventDefault: () => e.preventDefault() })
  }
}

/**
 * wardley 结构树（工单 23）：节点 / 连线 / evolve 三分区（另有文档级属性行并入节点分区
 * 之后的「文档行」分区）。节点是名字即身份（mermaid 按名引用连线/evolve），detail 携带
 * 节点种类与坐标原文——**越界/畸形坐标原样展示并标注**（不静默改写，工单定案）；
 * pipeline 内节点加标注（工单不做块内编辑）。连线 detail 携带箭头形态，**悬空引用标注**；
 * evolve detail 携带目标原文，**非法目标 / 悬空名字标注**。wardley 画布无 data-id
 * （research §4），结构树 + 属性表单是完整编辑入口。
 */
function wardleyPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'wardley') return []
  const p: WardleyProjection = projection.wardley

  const nodeDetail = (node: (typeof p.nodes)[number]): string | undefined =>
    [
      node.nodeKind === 'anchor' ? t('app:propertyPanel.wardleyAnchor') : t('app:propertyPanel.wardleyComponent'),
      node.coordsValid
        ? `[${node.visibilityText}, ${node.evolutionText}]`
        : t('app:propertyPanel.wardleyCoordInvalidShort', {
            value: `[${node.visibilityText}, ${node.evolutionText}]`,
          }),
      node.inPipeline ? t('app:propertyPanel.wardleyInPipelineShort') : undefined,
    ]
      .filter((x) => x !== undefined)
      .join(' · ') || undefined

  return [
    withDiagramLabel(diagramSection(p.title ?? undefined), t('app:propertyPanel.diagram')),
    {
      key: 'nodes',
      heading: t('app:propertyPanel.wardleyNodes'),
      count: p.nodes.length,
      entries: p.nodes.map((node) => ({
        key: node.elementId,
        label: node.name,
        detail: nodeDetail(node),
        depth: 1,
        selection: { kind: 'wardley-node', name: node.name },
        onKeyDown: wardleyNodeKeyDown(p, node.name),
      })),
    },
    {
      key: 'links',
      heading: t('app:propertyPanel.wardleyLinks'),
      count: p.links.length,
      entries: p.links.map((link) => ({
        key: link.elementId,
        label: `${link.from} ${link.arrow} ${link.to}`,
        detail: link.endpointsValid ? undefined : t('app:propertyPanel.wardleyDanglingShort'),
        depth: 1,
        selection: { kind: 'wardley-link', elementId: link.elementId },
      })),
    },
    {
      key: 'evolves',
      heading: t('app:propertyPanel.wardleyEvolves'),
      count: p.evolves.length,
      entries: p.evolves.map((evolve) => ({
        key: evolve.elementId,
        label: `${evolve.name} → ${evolve.targetText}`,
        detail:
          [
            evolve.nameValid ? undefined : t('app:propertyPanel.wardleyDanglingShort'),
            evolve.targetValid ? undefined : t('app:propertyPanel.wardleyTargetInvalidShort'),
          ]
            .filter((x) => x !== undefined)
            .join(' · ') || undefined,
        depth: 1,
        selection: { kind: 'wardley-evolve', elementId: evolve.elementId },
      })),
    },
    {
      key: 'docLines',
      heading: t('app:propertyPanel.wardleyDocLines'),
      count: p.docLines.length,
      entries: p.docLines.map((line) => ({
        key: line.elementId,
        label: line.text,
        detail: t(`app:propertyPanel.wardleyDocKinds.${line.docKind}`),
        depth: 1,
        // 文档级属性行无独立选中种类（编辑入口 = 图表级表单），点击回落图表级
        selection: DIAGRAM_SELECTION,
      })),
    },
  ]
}

// ---------- venn（more-diagrams 工单 21） ----------

/**
 * venn 结构树条目的键盘（工单 21 / ADR-0013）：焦点在集合 / 交集条目上时
 * Tab = 加集合（仅集合） / Enter = 加交集（以该区域首 id 与下一集合组二元交集） /
 * Delete = 删除该区域（删集合连带删引用它的交集，preventDefault 压掉默认行为）。
 * 键 → plan 走能力包同一份 vennKeyPlan，执行交给唯一的 applyPlan。
 * venn 画布已由 nodeAnnotator 反注 `data-id`（research §8 实测 `data-venn-sets` 可映射），
 * 画布可点选；结构树是键盘/键盘命名的稳定入口（与 pie/treemap 同口径）。
 */
function vennEntryKeyDown(
  projection: VennProjection,
  kind: 'venn-set' | 'venn-union',
  elementId: string,
  id: string,
): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.shiftKey) return
    if (e.key !== 'Tab' && e.key !== 'Enter' && e.key !== 'Delete' && e.key !== 'Backspace') return
    const selection: Selection =
      kind === 'venn-set' ? { kind: 'venn-set', id } : { kind: 'venn-union', elementId }
    const plan = vennKeyPlan(projection, { key: e.key, mods: { shift: e.shiftKey }, selection })
    if (plan === null) return
    const { commitIntent, select } = useEditorStore.getState()
    applyPlan(plan, { commitIntent, select, preventDefault: () => e.preventDefault() })
  }
}

/**
 * venn 结构树（工单 21）：集合 / 交集两分区（文档序）。集合 detail 携带 id（名字即身份），
 * 交集 detail 携带 id 列表（书写序）；两者 label 缺省回退「（无标签）」由渲染层处理。
 * 集合与交集的渲染键用各自的 elementId（`venn-set:<id>` / `venn-union:N`）。
 * 画布可点选（nodeAnnotator 反注 data-id），结构树 + 属性表单是完整编辑入口。
 */
function vennPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'venn') return []
  const p: VennProjection = projection.venn

  const areaDetail = (area: ProjectionVennArea): string =>
    [area.ids.join(' ∩ '), area.sizeText ?? undefined].filter((x) => x !== undefined).join(' · ')

  return [
    withDiagramLabel(diagramSection(p.title ?? 'venn-beta'), t('app:propertyPanel.diagram')),
    {
      key: 'sets',
      heading: t('app:propertyPanel.vennSets'),
      count: p.sets.length,
      entries: p.sets.map((s) => ({
        key: s.elementId,
        label: s.label ?? s.ids[0],
        detail: areaDetail(s),
        depth: 1,
        selection: { kind: 'venn-set', id: s.ids[0] },
        onKeyDown: vennEntryKeyDown(p, 'venn-set', s.elementId, s.ids[0]),
      })),
    },
    {
      key: 'unions',
      heading: t('app:propertyPanel.vennUnions'),
      count: p.unions.length,
      entries: p.unions.map((u) => ({
        key: u.elementId,
        label: u.label ?? u.ids.join(' ∩ '),
        detail: areaDetail(u),
        depth: 1,
        selection: { kind: 'venn-union', elementId: u.elementId },
        onKeyDown: vennEntryKeyDown(p, 'venn-union', u.elementId, u.ids[0]),
      })),
    },
  ]
}

// ---------- cynefin（more-diagrams 工单 25） ----------

/**
 * cynefin 结构树条目的键盘（工单 25 / ADR-0013）：焦点在条目 / 域名词行条目上时
 * Tab = 加条目（条目上 = 同域内该条目之后；域上 = 该域下；落到键语义唯一映射
 * cynefinKeyPlan），Delete/Backspace = 删除条目 / 转移（域名词行不可删）。
 * 执行交给唯一的 applyPlan。cynefin 画布无 data-id（research §4/§8.1 实测，
 * 见 cynefin-adapter），结构树是唯一的键盘入口（与 ishikawa/treemap 同口径）。
 */
function cynefinEntryKeyDown(
  projection: CynefinProjection,
  selection: Selection,
): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.shiftKey) return
    if (e.key !== 'Tab' && e.key !== 'Enter' && e.key !== 'Delete' && e.key !== 'Backspace') return
    const plan = cynefinKeyPlan(projection, { key: e.key, mods: { shift: e.shiftKey }, selection })
    if (plan === null) return
    const { commitIntent, select } = useEditorStore.getState()
    applyPlan(plan, { commitIntent, select, preventDefault: () => e.preventDefault() })
  }
}

/**
 * cynefin 结构树（工单 25）：五个固定域各一分区（域即分组，条目挂其下——
 * 归属纯由位置决定，research §8.2），另有「转移」分区（顶层单行）与「文档行」分区
 * （title / accTitle / accDescr）。五个域恒定展示（未声明的域为空分区），
 * 便于用户在任意域下加条目。cynefin 画布 DOM 无 data-id（research §4/§8.1：
 * 渲染器 `data-` 出现 0 次，仅 <defs> marker 有 id），结构树 + 属性表单是完整编辑入口。
 */
function cynefinPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'cynefin') return []
  const p: CynefinProjection = projection.cynefin

  const domainSection = (domain: (typeof p.domains)[number]): TreeSection => ({
    key: `domain-${domain.name}`,
    heading: t(`app:propertyPanel.cynefinDomains.${domain.name}`),
    count: domain.items.length,
    entries: [
      {
        key: domain.elementId,
        label: t(`app:propertyPanel.cynefinDomains.${domain.name}`),
        detail: t('app:propertyPanel.cynefinDomainShort'),
        depth: 1,
        selection: { kind: 'cynefin-domain', name: domain.name },
        onKeyDown: cynefinEntryKeyDown(p, { kind: 'cynefin-domain', name: domain.name }),
        children: domain.items.map((item) => ({
          key: item.elementId,
          label: item.text,
          depth: 2,
          selection: { kind: 'cynefin-item', elementId: item.elementId },
          onKeyDown: cynefinEntryKeyDown(p, { kind: 'cynefin-item', elementId: item.elementId }),
        })),
      },
    ],
  })

  return [
    withDiagramLabel(
      diagramSection(p.docLines.find((dl) => dl.docKind === 'title')?.text ?? undefined),
      t('app:propertyPanel.diagram'),
    ),
    ...p.domains.map(domainSection),
    {
      key: 'transitions',
      heading: t('app:propertyPanel.cynefinTransitions'),
      count: p.transitions.length,
      entries: p.transitions.map((transition) => ({
        key: transition.elementId,
        label:
          transition.label === ''
            ? `${transition.from} --> ${transition.to}`
            : `${transition.from} --> ${transition.to} : ${transition.label}`,
        depth: 1,
        selection: { kind: 'cynefin-transition', elementId: transition.elementId },
        onKeyDown: cynefinEntryKeyDown(p, { kind: 'cynefin-transition', elementId: transition.elementId }),
      })),
    },
    {
      key: 'docLines',
      heading: t('app:propertyPanel.cynefinDocLines'),
      count: p.docLines.length,
      entries: p.docLines.map((line) => ({
        key: line.elementId,
        label: line.text,
        detail: t(`app:propertyPanel.cynefinDocKinds.${line.docKind}`),
        depth: 1,
        // 文档级属性行无独立选中种类（编辑入口 = 图表级表单），点击回落图表级
        selection: DIAGRAM_SELECTION,
      })),
    },
  ]
}

/** 图种 → 分区描述（注册表 `tree` 字段的实参，registry 只持引用） */
/** usecase 结构树行内键（Tab 加用例 / Enter 加 actor / Delete 删元素）：
 * 与画布键盘共用同一份 usecaseKeyPlan（ADR-0013），执行交给 applyPlan。 */
function usecaseEntryKeyDown(
  projection: UsecaseProjection,
  selection: Selection,
): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.shiftKey) return
    if (e.key !== 'Tab' && e.key !== 'Enter' && e.key !== 'Delete' && e.key !== 'Backspace') return
    const plan = usecaseKeyPlan(projection, { key: e.key, mods: { shift: e.shiftKey }, selection })
    if (plan === null) return
    const { commitIntent, select } = useEditorStore.getState()
    applyPlan(plan, { commitIntent, select, preventDefault: () => e.preventDefault() })
  }
}

/**
 * usecase 结构树（工单 26）：actor / 系统边界 / 用例 / 关系四个分区（文档序）。
 * actor 与用例 detail 携带源码标识符（名字即身份，引号声明为推导串）；边界 detail 携带
 * 归属用例数；关系 detail 携带算子（`-->` / `..>` / `--|>`）。画布可点选（渲染器 data-id
 * 经 nodeAnnotator 归一），结构树 + 属性表单是完整编辑入口。
 */
function usecasePartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'usecase') return []
  const p: UsecaseProjection = projection.usecase

  const nodeEntry = (node: ProjectionUsecaseNode, depth: number) => {
    const selection: Selection =
      node.nodeKind === 'actor'
        ? { kind: 'usecase-actor', elementId: node.elementId }
        : { kind: 'usecase-usecase', elementId: node.elementId }
    return {
      key: node.elementId,
      label: node.label,
      detail: node.label !== node.id ? node.id : undefined,
      depth,
      selection,
      onKeyDown: usecaseEntryKeyDown(p, selection),
    }
  }

  const actors = p.nodes.filter((n) => n.nodeKind === 'actor')
  const cases = p.nodes.filter((n) => n.nodeKind === 'usecase')
  const boundaryOf = (b: ProjectionUsecaseNode) => ({
    key: b.elementId,
    label: b.label,
    detail: t('app:propertyPanel.usecaseBoundaryDetail', {
      count: p.nodes.filter((n) => n.boundaryId === b.id && n.nodeKind === 'usecase').length,
    }),
    depth: 1,
    selection: { kind: 'usecase-boundary', elementId: b.elementId } as Selection,
    onKeyDown: usecaseEntryKeyDown(p, { kind: 'usecase-boundary', elementId: b.elementId }),
  })

  return [
    withDiagramLabel(diagramSection('usecase-beta'), t('app:propertyPanel.diagram')),
    {
      key: 'actors',
      heading: t('app:propertyPanel.usecaseActors'),
      count: actors.length,
      entries: actors.map((n) => nodeEntry(n, 1)),
    },
    {
      key: 'boundaries',
      heading: t('app:propertyPanel.usecaseBoundaries'),
      count: p.boundaries.length,
      entries: p.boundaries.map((b) => boundaryOf(b)),
    },
    {
      key: 'cases',
      heading: t('app:propertyPanel.usecaseCases'),
      count: cases.length,
      entries: cases.map((n) => nodeEntry(n, n.boundaryId !== null ? 2 : 1)),
    },
    {
      key: 'relations',
      heading: t('app:propertyPanel.usecaseRelations'),
      count: p.relations.length,
      entries: p.relations.map((r: ProjectionUsecaseRelation) => {
        const selection: Selection = { kind: 'usecase-relation', elementId: r.elementId }
        return {
          key: r.elementId,
          label: `${r.source} ${r.operator} ${r.target}`,
          detail: r.label ?? r.relationKind,
          depth: 1,
          selection,
          onKeyDown: usecaseEntryKeyDown(p, selection),
        }
      }),
    },
  ]
}

/** eventmodeling 结构树行内键（Tab 加同泳道帧 / Enter 加事件帧 / Delete 删帧 / 删数据块）：
 * 与画布键盘共用同一份 eventModelingKeyPlan（ADR-0013），执行交给 applyPlan。 */
function eventModelingEntryKeyDown(
  projection: EventModelingProjection,
  selection: Selection,
): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.shiftKey) return
    if (e.key !== 'Tab' && e.key !== 'Enter' && e.key !== 'Delete' && e.key !== 'Backspace') return
    const plan = eventModelingKeyPlan(projection, {
      key: e.key,
      mods: { shift: e.shiftKey },
      selection,
    })
    if (plan === null) return
    const { commitIntent, select } = useEditorStore.getState()
    applyPlan(plan, { commitIntent, select, preventDefault: () => e.preventDefault() })
  }
}

/**
 * eventmodeling 结构树（工单 28）：帧（按泳道分组）/ 数据块 / 连线（含派生与显式）/ 文档行
 * 四个分区。**画布无 data-id**（research §4/§8.3）→ 结构树是唯一完整编辑入口：选中帧 / 数据块
 * 后在属性表单编辑，或行内 Tab / Enter / Delete 增删。派生连线（默认推断，无源码语句）只读
 * （无 onKeyDown）；文档行不进选中面（点击回落图表级）。
 */
function eventModelingPartitions(
  projection: AnyProjection,
  { t }: TreePartitionsContext,
): TreeSection[] {
  if (projection.type !== 'eventmodeling') return []
  const p: EventModelingProjection = projection.eventmodeling

  const frameEntry = (frame: (typeof p.frames)[number], depth: number) => {
    const selection: Selection = { kind: 'em-frame', elementId: frame.elementId }
    return {
      key: frame.elementId,
      label: `${frame.frameId} ${frame.entityIdentifier}`,
      detail: t(`app:propertyPanel.emEntityTypes.${frame.group}`),
      depth,
      selection,
      onKeyDown: eventModelingEntryKeyDown(p, selection),
    }
  }

  // 泳道分组 → 分区（泳道带 + 命名空间各成一组，文档序）
  const swimlaneSections: TreeSection[] = p.swimlanes.map((lane) => ({
    key: `lane-${lane.swimlane}-${lane.label}`,
    heading: lane.label,
    count: lane.frames.length,
    entries: lane.frames.map((f) => frameEntry(f, 1)),
  }))

  return [
    withDiagramLabel(
      diagramSection(p.docLines.find((dl) => dl.docKind === 'entity')?.text),
      t('app:propertyPanel.diagram'),
    ),
    ...swimlaneSections,
    {
      key: 'dataBlocks',
      heading: t('app:propertyPanel.emDataBlocks'),
      count: p.dataBlocks.length,
      entries: p.dataBlocks.map((block) => {
        const selection: Selection = { kind: 'em-data', elementId: block.elementId }
        return {
          key: block.elementId,
          label: block.name,
          detail:
            block.referencedBy.length > 0
              ? t('app:propertyPanel.emDataDetail', { count: block.referencedBy.length })
              : undefined,
          depth: 1,
          selection,
          onKeyDown: eventModelingEntryKeyDown(p, selection),
        }
      }),
    },
    {
      key: 'relations',
      heading: t('app:propertyPanel.emRelations'),
      count: p.relations.length,
      entries: p.relations.map((relation) => {
        const source = p.frames.find((f) => f.elementId === relation.source)
        const target = p.frames.find((f) => f.elementId === relation.target)
        return {
          key: relation.elementId,
          label: `${source?.frameId ?? '—'} → ${target?.frameId ?? '—'}`,
          detail: t(`app:propertyPanel.emRelationOrigins.${relation.origin}`),
          depth: 1,
          selection: { kind: 'em-relation', elementId: relation.elementId } as Selection,
          // 派生连线只读（无源码语句，不可手术编辑）→ 不挂 onKeyDown
        }
      }),
    },
    ...(p.docLines.length > 0
      ? [
          {
            key: 'docLines',
            heading: t('app:propertyPanel.emDocLines'),
            count: p.docLines.length,
            entries: p.docLines.map((line) => ({
              key: line.elementId,
              label: line.text,
              detail: line.docKind,
              depth: 1,
              // 文档级声明行无独立选中种类（编辑入口 = 图表级表单），点击回落图表级
              selection: DIAGRAM_SELECTION,
            })),
          },
        ]
      : []),
  ]
}

export const treePartitions: Record<DiagramTypeId, TreePartitions> = {
  flowchart: flowchartPartitions,
  sequence: sequencePartitions,
  class: classPartitions,
  mindmap: mindmapPartitions,
  state: statePartitions,
  er: erPartitions,
  gitgraph: gitgraphPartitions,
  timeline: timelinePartitions,
  kanban: kanbanPartitions,
  requirement: requirementPartitions,
  journey: journeyPartitions,
  pie: piePartitions,
  block: blockPartitions,
  sankey: sankeyPartitions,
  gantt: ganttPartitions,
  quadrant: quadrantPartitions,
  packet: packetPartitions,
  xychart: xychartPartitions,
  radar: radarPartitions,
  architecture: architecturePartitions,
  treemap: treemapPartitions,
  ishikawa: ishikawaPartitions,
  wardley: wardleyPartitions,
  venn: vennPartitions,
  cynefin: cynefinPartitions,
  usecase: usecasePartitions,
  eventmodeling: eventModelingPartitions,
}
