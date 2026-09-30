import type { KeyboardEvent } from 'react'
import type { AnyProjection, DiagramTypeId } from '../diagram-registry'
import type { FlowchartProjection } from '../projection/flowchart-projection'
import type { SequenceProjection } from '../projection/sequence-projection'
import type { ClassProjection } from '../projection/class-projection'
import type { MindmapProjection } from '../projection/mindmap-projection'
import type { StateProjection } from '../projection/state-projection'
import type { ErProjection } from '../projection/er-projection'
import type { KanbanProjection } from '../projection/kanban-projection'
import { DIAGRAM_SELECTION, type Selection } from '../projection/selection'
import { applyPlan, mindmapKeyPlan } from '../editing/canvas-keyboard'
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

/** 图种 → 分区描述（注册表 `tree` 字段的实参，registry 只持引用） */
export const treePartitions: Record<DiagramTypeId, TreePartitions> = {
  flowchart: flowchartPartitions,
  sequence: sequencePartitions,
  class: classPartitions,
  mindmap: mindmapPartitions,
  state: statePartitions,
  er: erPartitions,
  kanban: kanbanPartitions,
}
