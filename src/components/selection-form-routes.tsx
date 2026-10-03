import { Select } from '@mantine/core'
import { Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { ComponentType, ReactNode } from 'react'
import type {
  AnyProjection,
  DiagramSelectionForms,
  DiagramTypeId,
  SelectionFormTable,
} from '../lib/diagram-registry'
import { DIAGRAM_TYPE_LIST } from '../lib/diagram-registry'
import type { Selection } from '../lib/projection/selection'
import type {
  ProjectionBlock,
  ProjectionElse,
  SequenceProjection,
} from '../lib/projection/sequence-projection'
import type { FlowchartProjection } from '../lib/projection/flowchart-projection'
import type { ClassProjection } from '../lib/projection/class-projection'
import type { MindmapProjection } from '../lib/projection/mindmap-projection'
import type { StateProjection } from '../lib/projection/state-projection'
import type { ErProjection } from '../lib/projection/er-projection'
import type { RequirementProjection } from '../lib/projection/requirement-projection'
import type { GitgraphProjection } from '../lib/projection/gitgraph-projection'
import type { TimelineProjection } from '../lib/projection/timeline-projection'
import type { KanbanProjection } from '../lib/projection/kanban-projection'
import type { JourneyProjection } from '../lib/projection/journey-projection'
import type { PieProjection } from '../lib/projection/pie-projection'
import type { RadarProjection } from '../lib/projection/radar-projection'
import type { BlockProjection } from '../lib/projection/block-projection'
import type { SankeyProjection } from '../lib/projection/sankey-projection'
import type { GanttProjection } from '../lib/projection/gantt-projection'
import type { QuadrantProjection } from '../lib/projection/quadrant-projection'
import type { PacketProjection } from '../lib/projection/packet-projection'
import type { XychartProjection } from '../lib/projection/xychart-projection'
import type { ArchitectureProjection } from '../lib/projection/architecture-projection'
import type { TreemapProjection } from '../lib/projection/treemap-projection'
import type { IshikawaProjection } from '../lib/projection/ishikawa-projection'
import type { WardleyProjection } from '../lib/projection/wardley-projection'
import type { VennProjection } from '../lib/projection/venn-projection'
import type { CynefinProjection } from '../lib/projection/cynefin-projection'
import type { UsecaseProjection } from '../lib/projection/usecase-projection'
import type { TreeviewProjection } from '../lib/projection/treeview-projection'
import type { EventModelingProjection } from '../lib/projection/eventmodeling-projection'
import type { AgentflowProjection } from '../lib/projection/agentflow-projection'
import type { ZenumlProjection } from '../lib/projection/zenuml-projection'
import type { C4Projection } from '../lib/projection/c4-projection'
import { DIRECTIONS } from '../lib/pipeline/flowchart'
import { setDirectionIntent } from '../lib/editing/flowchart-forms'
import { setClassDirectionIntent } from '../lib/editing/class-forms'
import { GITGRAPH_DIRECTIONS, type GitgraphIntent } from '../lib/pipeline/gitgraph'
import { useEditorStore } from '../store/editor'
import { DiagramForm, EdgeForm, ClassDefForm, NodeForm, SubgraphForm } from './property-forms'
import { BlockForm, MessageForm, NoteForm, ParticipantForm, SequenceDiagramForm, SequenceRegionForm } from './sequence-forms'
import { ClassForm, ClassNoteForm, MemberForm, NamespaceForm, RelationForm } from './class-forms'
import { MindmapNodeForm } from './mindmap-forms'
import { StateForm, StateNoteForm, StateTransitionForm } from './state-forms'
import { ErAttributeForm, ErEntityForm, ErRelationForm } from './er-forms'
import {
  RequirementElementForm,
  RequirementNodeForm,
  RequirementRelationForm,
} from './requirement-forms'
import {
  GitgraphBranchForm,
  GitgraphCherryPickForm,
  GitgraphCommitForm,
  GitgraphMergeForm,
} from './gitgraph-forms'
import {
  TimelineDiagramForm,
  TimelineEventForm,
  TimelinePeriodForm,
  TimelineSectionForm,
} from './timeline-forms'
import { KanbanCardForm, KanbanColumnForm } from './kanban-forms'
import { JourneyDiagramForm, JourneySectionForm, JourneyTaskForm } from './journey-forms'
import { PieDiagramForm, PieSectorForm } from './pie-forms'
import { RadarAxisForm, RadarCurveForm, RadarDiagramForm } from './radar-forms'
import { BlockDiagramForm, BlockEdgeForm, BlockGroupForm, BlockNodeForm } from './block-forms'
import { SankeyLinkForm, SankeyNodeForm } from './sankey-forms'
import {
  GanttDiagramForm,
  GanttDirectiveForm,
  GanttSectionForm,
  GanttTaskForm,
} from './gantt-forms'
import {
  QuadrantAxisForm,
  QuadrantDiagramForm,
  QuadrantPointForm,
  QuadrantQuadrantForm,
} from './quadrant-forms'
import { PacketDiagramForm, PacketFieldForm } from './packet-forms'
import { XychartAxisForm, XychartSeriesForm, XychartTitleForm } from './xychart-forms'
import {
  ArchitectureAlignForm,
  ArchitectureEdgeForm,
  ArchitectureGroupForm,
  ArchitectureJunctionForm,
  ArchitectureServiceForm,
} from './architecture-forms'
import { TreemapNodeForm } from './treemap-forms'
import { IshikawaNodeForm } from './ishikawa-forms'
import { WardleyEvolveForm, WardleyLinkForm, WardleyNodeForm } from './wardley-forms'
import { VennAreaForm, VennDiagramForm } from './venn-forms'
import {
  UsecaseDiagramForm,
  UsecaseNodeForm,
  UsecaseRelationForm,
} from './usecase-forms'
import { CynefinDiagramForm, CynefinDomainForm, CynefinItemForm, CynefinTransitionForm } from './cynefin-forms'
import { TreeviewNodeForm } from './treeview-forms'
import {
  EventModelingDataForm,
  EventModelingDiagramForm,
  EventModelingFrameForm,
} from './eventmodeling-forms'
import {
  AgentflowContainerForm,
  AgentflowDiagramForm,
  AgentflowDocLineForm,
  AgentflowEdgeForm,
  AgentflowNodeForm,
} from './agentflow-forms'
import {
  ZenumlDiagramForm,
  ZenumlFragmentForm,
  ZenumlMessageForm,
  ZenumlParticipantForm,
} from './zenuml-forms'
import { C4BoundaryForm, C4DiagramForm, C4ElementForm, C4RelationForm } from './c4-forms'

/**
 * 表单路由表（architecture-deepening-3 工单 05）：原 selection-forms.tsx 里 117 个同构
 * case（按 selection.kind 在投影中 find 元素 → `el !== undefined ? <XxxForm/> : null`）
 * 收成每图种一张声明式路由表；表单组件本体（各 xxx-forms.tsx）不动。
 *
 * 注册表在 lib 层不能反向 import 组件层（会成 store → registry → 路由表 → store 的环），
 * 故本模块在加载时把各表挂到 DIAGRAM_TYPE_LIST 对应注册项的 forms 槽位（见文件尾）；
 * selection-forms.tsx（壳）引用本模块，挂载先于任何渲染。
 *
 * 新图种接入（WIRING-GUIDE 第 8 步）：写 `<id>-forms.tsx` + 在本文件加一张表并挂进
 * SELECTION_FORMS，selection-forms 壳无需再改。
 */

/** 单点类型擦除：每张表在定义侧已按图种钉死投影类型，这里按 kind 取条目后作为组件渲染 */
function bindSelectionForms<P>(table: SelectionFormTable<P>): DiagramSelectionForms {
  return {
    render: (projection, selection) => {
      const Entry = (
        table as Record<string, ComponentType<{ projection: P; selection: Selection }>>
      )[selection.kind]
      if (Entry === undefined) return null
      return <Entry projection={projection as P} selection={selection} />
    },
  }
}

function isBlockOpen(b: ProjectionBlock | ProjectionElse): b is ProjectionBlock {
  return b.keyword !== 'else' && b.keyword !== 'and'
}

/** 收集某逻辑块直属的 else/and 分支：blocks 中该块之后、遇到下一个 open 之前的所有分支行 */
function elseBranchesOf(projection: SequenceProjection, blockId: string): ProjectionElse[] {
  const index = projection.blocks.findIndex((b) => b.elementId === blockId)
  if (index === -1) return []
  const branches: ProjectionElse[] = []
  for (const b of projection.blocks.slice(index + 1)) {
    if (!('keyword' in b)) continue
    if (b.keyword === 'else' || b.keyword === 'and') branches.push(b)
    else break
  }
  return branches
}

/** state 图表方向的表单值 → set-direction 意图（与 class 同口径：null = 删除 direction 行） */
function commitStateDirection(direction: string | null): void {
  useEditorStore.getState().commitIntent({ type: 'set-direction', direction })
}

const flowchartSelectionForms: SelectionFormTable<FlowchartProjection> = {
  diagram: ({ projection }) => {
    // 方向来自表头 token（`flowchart TD`）：没有「不设置」的形态，故不提供「跟随默认」。
    // TD 是 TB 的合法别名，下拉按 TB 归一化显示，否则 `flowchart TD` 打开时无选中项
    // （browser-findings 2026-10-02 #4）
    const commitIntent = useEditorStore((s) => s.commitIntent)
    return (
      <DiagramForm
        direction={projection.direction === 'TD' ? 'TB' : projection.direction}
        knownDirections={DIRECTIONS}
        onSelect={(next) => {
          if (next !== null) commitIntent(setDirectionIntent(next))
        }}
      />
    )
  },
  node: ({ projection, selection }) => {
    const node = projection.nodes.find((n) => n.nodeId === selection.nodeId)
    return node !== undefined ? (
      <NodeForm node={node} classDefs={projection.classDefs} appliedStyles={projection.appliedStyles} />
    ) : null
  },
  edge: ({ projection, selection }) => {
    const edge = projection.edges.find(
      (e) => e.from === selection.from && e.to === selection.to && e.occurrence === selection.occurrence,
    )
    return edge !== undefined ? <EdgeForm edge={edge} /> : null
  },
  subgraph: ({ projection, selection }) => {
    const sg = projection.subgraphs.find((s) => s.elementId === selection.elementId)
    return sg !== undefined ? <SubgraphForm subgraph={sg} /> : null
  },
  classdef: ({ projection, selection }) => {
    const cd = projection.classDefs.find((c) => c.name === selection.name)
    return cd !== undefined ? <ClassDefForm classDef={cd} /> : null
  },
}

const sequenceSelectionForms: SelectionFormTable<SequenceProjection> = {
  diagram: ({ projection }) => <SequenceDiagramForm projection={projection} />,
  participant: ({ projection, selection }) => {
    const p = projection.participants.find((x) => x.actorId === selection.actorId)
    return p !== undefined ? <ParticipantForm participant={p} /> : null
  },
  message: ({ projection, selection }) => {
    const m = projection.messages.find((x) => x.elementId === selection.elementId)
    return m !== undefined ? <MessageForm message={m} /> : null
  },
  note: ({ projection, selection }) => {
    const n = projection.notes.find((x) => x.elementId === selection.elementId)
    return n !== undefined ? <NoteForm note={n} /> : null
  },
  block: ({ projection, selection }) => {
    const b = projection.blocks.find((x) => x.elementId === selection.elementId)
    if (b === undefined || !isBlockOpen(b)) return null
    return <BlockForm block={b} elseBranches={elseBranchesOf(projection, b.elementId)} />
  },
  'seq-region': ({ projection, selection }) => {
    const r = projection.regions.find((x) => x.elementId === selection.elementId)
    return r !== undefined ? <SequenceRegionForm region={r} /> : null
  },
}

const classSelectionForms: SelectionFormTable<ClassProjection> = {
  diagram: ({ projection }) => {
    // classDiagram 的方向是独立语句行：没有该行时如实显示「跟随 Mermaid 默认」（工单 07）
    const commitIntent = useEditorStore((s) => s.commitIntent)
    return (
      <DiagramForm
        direction={projection.direction}
        allowFollowDefault
        onSelect={(next) => commitIntent(setClassDirectionIntent(next))}
      />
    )
  },
  class: ({ projection, selection }) => {
    const c = projection.classes.find((x) => x.name === selection.name)
    return c !== undefined ? <ClassForm cls={c} /> : null
  },
  'class-member': ({ projection, selection }) => {
    const m = projection.members.find((x) => x.elementId === selection.elementId)
    return m !== undefined ? <MemberForm member={m} /> : null
  },
  'class-relation': ({ projection, selection }) => {
    const r = projection.relations.find((x) => x.elementId === selection.elementId)
    return r !== undefined ? <RelationForm relation={r} /> : null
  },
  'class-note': ({ projection, selection }) => {
    const n = projection.notes.find((x) => x.elementId === selection.elementId)
    return n !== undefined ? <ClassNoteForm note={n} /> : null
  },
  'class-namespace': ({ projection, selection }) => {
    const ns = projection.namespaces.find((x) => x.elementId === selection.elementId)
    return ns !== undefined ? <NamespaceForm namespace={ns} /> : null
  },
  classdef: ({ projection, selection }) => {
    const cd = projection.classDefs.find((x) => x.name === selection.name)
    return cd !== undefined ? <ClassDefForm classDef={cd} /> : null
  },
}

const mindmapSelectionForms: SelectionFormTable<MindmapProjection> = {
  diagram: () => {
    const { t } = useTranslation()
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.mindmapHint')}
      </Text>
    )
  },
  'mindmap-node': ({ projection, selection }) => {
    const node = projection.nodes.find((n) => n.elementId === selection.elementId)
    return node !== undefined ? <MindmapNodeForm node={node} /> : null
  },
}

const stateSelectionForms: SelectionFormTable<StateProjection> = {
  diagram: ({ projection }) => {
    // stateDiagram 的 direction 是独立语句行：没有该行时如实显示「跟随 Mermaid 默认」
    return (
      <DiagramForm
        direction={projection.direction}
        allowFollowDefault
        onSelect={(next) => commitStateDirection(next)}
      />
    )
  },
  state: ({ projection, selection }) => {
    const state = projection.states.find((s) => s.id === selection.id)
    return state !== undefined ? <StateForm state={state} /> : null
  },
  'state-transition': ({ projection, selection }) => {
    const tr = projection.transitions.find((x) => x.elementId === selection.elementId)
    return tr !== undefined ? <StateTransitionForm transition={tr} /> : null
  },
  'state-note': ({ projection, selection }) => {
    const n = projection.notes.find((x) => x.elementId === selection.elementId)
    return n !== undefined ? <StateNoteForm note={n} /> : null
  },
}

const erSelectionForms: SelectionFormTable<ErProjection> = {
  diagram: ({ projection }) => {
    // erDiagram 的 direction 是独立语句行：没有该行时如实显示「跟随 Mermaid 默认」
    const commitIntent = useEditorStore((s) => s.commitIntent)
    return (
      <DiagramForm
        direction={projection.direction}
        allowFollowDefault
        onSelect={(next) => commitIntent({ type: 'set-direction', direction: next })}
      />
    )
  },
  'er-entity': ({ projection, selection }) => {
    const entity = projection.entities.find((e) => e.name === selection.name)
    return entity !== undefined ? <ErEntityForm entity={entity} /> : null
  },
  'er-attribute': ({ projection, selection }) => {
    const attr = projection.attributes.find((a) => a.elementId === selection.elementId)
    return attr !== undefined ? <ErAttributeForm attribute={attr} /> : null
  },
  'er-relation': ({ projection, selection }) => {
    const rel = projection.relations.find((r) => r.elementId === selection.elementId)
    return rel !== undefined ? <ErRelationForm relation={rel} /> : null
  },
}

const gitgraphSelectionForms: SelectionFormTable<GitgraphProjection> = {
  diagram: ({ projection }) => {
    // gitGraph 的方向在表头 token 上（gitGraph LR:）：没有「不设置」之外的独立语句；
    // 缺省即 mermaid 默认 LR（表头可写回方向 token，无「跟随」哨兵的必要——默认就是 LR）
    const { t } = useTranslation()
    const commitIntent = useEditorStore((s) => s.commitIntent)
    return (
      <Select
        label={t('app:propertyPanel.direction')}
        data={GITGRAPH_DIRECTIONS.map((d) => ({ value: d, label: d }))}
        value={projection.direction ?? 'LR'}
        onChange={(value) => {
          if (value === null) return
          commitIntent({ type: 'set-direction', direction: value } satisfies GitgraphIntent)
        }}
        allowDeselect={false}
      />
    )
  },
  'gitgraph-commit': ({ projection, selection }) => {
    const commit = projection.commits.find((c) => c.elementId === selection.elementId)
    return commit !== undefined ? <GitgraphCommitForm commit={commit} /> : null
  },
  'gitgraph-branch': ({ projection, selection }) => {
    const branch = projection.branches.find((b) => b.name === selection.name)
    return branch !== undefined ? <GitgraphBranchForm branch={branch} /> : null
  },
  'gitgraph-merge': ({ projection, selection }) => {
    const merge = projection.merges.find((m) => m.elementId === selection.elementId)
    return merge !== undefined ? <GitgraphMergeForm merge={merge} /> : null
  },
  'gitgraph-cherry-pick': ({ projection, selection }) => {
    const pick = projection.cherryPicks.find((p) => p.elementId === selection.elementId)
    return pick !== undefined ? <GitgraphCherryPickForm pick={pick} /> : null
  },
}

const timelineSelectionForms: SelectionFormTable<TimelineProjection> = {
  diagram: ({ projection }) => <TimelineDiagramForm projection={projection} />,
  'timeline-section': ({ projection, selection }) => {
    const section = projection.sections.find((s) => s.elementId === selection.elementId)
    return section !== undefined ? <TimelineSectionForm section={section} /> : null
  },
  'timeline-period': ({ projection, selection }) => {
    const period = projection.periods.find((p) => p.elementId === selection.elementId)
    return period !== undefined ? <TimelinePeriodForm period={period} /> : null
  },
  'timeline-event': ({ projection, selection }) => {
    const event = projection.events.find((e) => e.elementId === selection.elementId)
    return event !== undefined ? <TimelineEventForm event={event} /> : null
  },
}

/** kanban（more-diagrams 工单 06）：选中列 / 卡片时渲染对应表单；图表级（无方向概念）
 * 显示看板操作提示。卡片表单需要归属列标题，按 `columnElementId` 反查。 */
const kanbanSelectionForms: SelectionFormTable<KanbanProjection> = {
  diagram: () => {
    const { t } = useTranslation()
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.kanbanHint')}
      </Text>
    )
  },
  'kanban-column': ({ projection, selection }) => {
    const column = projection.columns.find((c) => c.elementId === selection.elementId)
    return column !== undefined ? <KanbanColumnForm column={column} /> : null
  },
  'kanban-card': ({ projection, selection }) => {
    const card = projection.cards.find((c) => c.elementId === selection.elementId)
    if (card === undefined) return null
    const column = projection.columns.find((c) => c.elementId === card.columnElementId)
    return <KanbanCardForm card={card} columnTitle={column?.title ?? card.columnElementId} />
  },
}

/** requirement 属性表单（more-diagrams 工单 07）：图表级 direction（独立语句行，
 * 没有「跟随 Mermaid 默认」形态）+ requirement / element / relation 三类元素 */
const requirementSelectionForms: SelectionFormTable<RequirementProjection> = {
  diagram: ({ projection }) => {
    const commitIntent = useEditorStore((s) => s.commitIntent)
    return (
      <DiagramForm
        direction={projection.direction}
        allowFollowDefault
        onSelect={(next) => commitIntent({ type: 'set-direction', direction: next })}
      />
    )
  },
  requirement: ({ projection, selection }) => {
    const requirement = projection.requirements.find((r) => r.name === selection.name)
    return requirement !== undefined ? <RequirementNodeForm requirement={requirement} /> : null
  },
  'requirement-element': ({ projection, selection }) => {
    const element = projection.elements.find((e) => e.name === selection.name)
    return element !== undefined ? <RequirementElementForm element={element} /> : null
  },
  'requirement-relation': ({ projection, selection }) => {
    const relation = projection.relations.find((r) => r.elementId === selection.elementId)
    return relation !== undefined ? <RequirementRelationForm relation={relation} /> : null
  },
}

/**
 * journey（more-diagrams 工单 08）：选中任务 / section 时渲染对应表单；图表级 = 标题。
 * journey 画布无 data-id 寻址（见 journey-adapter），这三张表单是唯一文本编辑入口。
 */
const journeySelectionForms: SelectionFormTable<JourneyProjection> = {
  diagram: ({ projection }) => <JourneyDiagramForm projection={projection} />,
  'journey-section': ({ projection, selection }) => {
    const section = projection.sections.find((s) => s.elementId === selection.elementId)
    return section !== undefined ? <JourneySectionForm section={section} /> : null
  },
  'journey-task': ({ projection, selection }) => {
    const task = projection.tasks.find((task) => task.elementId === selection.elementId)
    return task !== undefined ? <JourneyTaskForm task={task} /> : null
  },
}

/**
 * pie（more-diagrams 工单 10）：选中扇区时渲染对应表单；图表级 = 标题。
 * pie 画布无 data-id 寻址（见 pie-adapter），这两张表单是唯一文本编辑入口。
 */
const pieSelectionForms: SelectionFormTable<PieProjection> = {
  diagram: ({ projection }) => <PieDiagramForm projection={projection} />,
  'pie-sector': ({ projection, selection }) => {
    const sector = projection.sectors.find((s) => s.elementId === selection.elementId)
    return sector !== undefined ? <PieSectorForm sector={sector} /> : null
  },
}

/**
 * radar（more-diagrams 工单 15）：选中轴 / 曲线时渲染对应表单；图表级 = 标题 + 选项。
 * radar 画布无 data-id 寻址（见 radar-adapter），这些表单是主要文本编辑入口
 * （轴 label 另有双击内联编辑，按 class 文本匹配）。
 */
const radarSelectionForms: SelectionFormTable<RadarProjection> = {
  diagram: ({ projection }) => <RadarDiagramForm projection={projection} />,
  'radar-axis': ({ projection, selection }) => {
    const axis = projection.axes.find((a) => a.elementId === selection.elementId)
    return axis !== undefined ? <RadarAxisForm axis={axis} /> : null
  },
  'radar-curve': ({ projection, selection }) => {
    const curve = projection.curves.find((c) => c.elementId === selection.elementId)
    return curve !== undefined ? <RadarCurveForm curve={curve} projection={projection} /> : null
  },
}

/**
 * block 属性表单（more-diagrams 工单 09）：图表级 title/columns + 节点 / 嵌套块 /
 * 边三类元素。space 不进投影选中面（布局空位，无表单）。
 */
const blockSelectionForms: SelectionFormTable<BlockProjection> = {
  diagram: ({ projection }) => <BlockDiagramForm title={projection.title} columns={projection.columns} />,
  'block-node': ({ projection, selection }) => {
    const node = projection.nodes.find((n) => n.id === selection.id)
    return node !== undefined ? <BlockNodeForm node={node} /> : null
  },
  'block-group': ({ projection, selection }) => {
    const group = projection.groups.find((g) => g.id === selection.id)
    return group !== undefined ? <BlockGroupForm group={group} /> : null
  },
  'block-edge': ({ projection, selection }) => {
    const edge = projection.edges.find((e) => e.elementId === selection.elementId)
    return edge !== undefined ? <BlockEdgeForm edge={edge} /> : null
  },
}

/**
 * sankey 属性表单（more-diagrams 工单 13）：图表级 = 提示文案（无标题/direction 等图表级
 * 可编辑项，config 不做编辑——工单定案）；节点 = 重命名（名字即身份）；链路 = 三列编辑。
 */
const sankeySelectionForms: SelectionFormTable<SankeyProjection> = {
  diagram: () => {
    const { t } = useTranslation()
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.sankeyDiagramHint')}
      </Text>
    )
  },
  'sankey-node': ({ projection, selection }) => {
    const node = projection.nodes.find((n) => n.name === selection.name)
    return node !== undefined ? <SankeyNodeForm node={node} /> : null
  },
  'sankey-link': ({ projection, selection }) => {
    const link = projection.links.find((l) => l.elementId === selection.elementId)
    return link !== undefined ? <SankeyLinkForm link={link} /> : null
  },
}

/**
 * gantt（more-diagrams 工单 11）：选中任务 / section / 指令行时渲染对应表单；
 * 图表级 = 标题 + dateFormat。任务条画布可寻址但文本编辑入口统一在表单（与 journey/pie
 * 同口径）；section 与指令行不可寻址，这三张表单是其唯一编辑入口。
 */
const ganttSelectionForms: SelectionFormTable<GanttProjection> = {
  diagram: ({ projection }) => <GanttDiagramForm projection={projection} />,
  'gantt-task': ({ projection, selection }) => {
    const task = projection.tasks.find((task) => task.elementId === selection.elementId)
    return task !== undefined ? <GanttTaskForm task={task} /> : null
  },
  'gantt-section': ({ projection, selection }) => {
    const section = projection.sections.find((s) => s.elementId === selection.elementId)
    return section !== undefined ? <GanttSectionForm section={section} /> : null
  },
  'gantt-directive': ({ projection, selection }) => {
    const directive = projection.directives.find((d) => d.elementId === selection.elementId)
    return directive !== undefined ? <GanttDirectiveForm directive={directive} /> : null
  },
}

/** quadrant（more-diagrams 工单 12）：选中点 / 轴 / 象限时渲染对应表单；图表级 = 标题。 */
const quadrantSelectionForms: SelectionFormTable<QuadrantProjection> = {
  diagram: ({ projection }) => <QuadrantDiagramForm projection={projection} />,
  'quadrant-point': ({ projection, selection }) => {
    const point = projection.points.find((p) => p.elementId === selection.elementId)
    return point !== undefined ? <QuadrantPointForm point={point} /> : null
  },
  'quadrant-axis': ({ projection, selection }) => {
    const axis = selection.elementId === 'x-axis' ? projection.xAxis : projection.yAxis
    return axis !== null ? <QuadrantAxisForm axis={axis} /> : null
  },
  'quadrant-quadrant': ({ projection, selection }) => {
    const quadrant = projection.quadrants.find((q) => q.elementId === selection.elementId)
    return quadrant !== undefined ? <QuadrantQuadrantForm quadrant={quadrant} /> : null
  },
}

/** packet（more-diagrams 工单 16）：选中字段时渲染字段表单；图表级 = 只读提示。 */
const packetSelectionForms: SelectionFormTable<PacketProjection> = {
  diagram: ({ projection }) => <PacketDiagramForm projection={projection} />,
  'packet-field': ({ projection, selection }) => {
    const field = projection.fields.find((f) => f.elementId === selection.elementId)
    return field !== undefined ? <PacketFieldForm field={field} /> : null
  },
}

/**
 * xychart 属性表单（more-diagrams 工单 14）：图表级 = 提示文案（frontmatter config
 * 不做编辑——工单定案）；标题 / 轴 = 文档级属性表单；系列 = 名字/类型/数值行编辑。
 */
const xychartSelectionForms: SelectionFormTable<XychartProjection> = {
  diagram: () => {
    const { t } = useTranslation()
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.xychartDiagramHint')}
      </Text>
    )
  },
  'xychart-title': ({ projection }) => <XychartTitleForm title={projection.title} />,
  'xychart-axis': ({ projection, selection }) => (
    <XychartAxisForm axis={selection.axis === 'x' ? projection.xAxis : projection.yAxis} />
  ),
  'xychart-series': ({ projection, selection }) => {
    const series = projection.series.find((s) => s.elementId === selection.elementId)
    return series !== undefined ? <XychartSeriesForm series={series} /> : null
  },
}

/**
 * architecture 属性表单（more-diagrams 工单 17）：图表级 = 提示文案（config 不做编辑
 * ——工单定案）；service / group / junction / 边 / align 五类元素。边不可寻址（见
 * architecture-adapter），ArchitectureEdgeForm 只从结构树选中进入。
 */
const architectureSelectionForms: SelectionFormTable<ArchitectureProjection> = {
  diagram: () => {
    const { t } = useTranslation()
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.architectureDiagramHint')}
      </Text>
    )
  },
  'architecture-service': ({ projection, selection }) => {
    const service = projection.services.find((s) => s.id === selection.name)
    return service !== undefined ? <ArchitectureServiceForm service={service} groups={projection.groups} /> : null
  },
  'architecture-group': ({ projection, selection }) => {
    const group = projection.groups.find((g) => g.id === selection.name)
    return group !== undefined ? <ArchitectureGroupForm group={group} groups={projection.groups} /> : null
  },
  'architecture-junction': ({ projection, selection }) => {
    const junction = projection.junctions.find((j) => j.id === selection.name)
    return junction !== undefined ? <ArchitectureJunctionForm junction={junction} groups={projection.groups} /> : null
  },
  'architecture-edge': ({ projection, selection }) => {
    const edge = projection.edges.find((e) => e.elementId === selection.elementId)
    return edge !== undefined ? <ArchitectureEdgeForm edge={edge} /> : null
  },
  'architecture-align': ({ projection, selection }) => {
    const align = projection.aligns.find((a) => a.elementId === selection.elementId)
    return align !== undefined ? <ArchitectureAlignForm align={align} /> : null
  },
}

/**
 * treemap 属性表单（more-diagrams 工单 20）：图表级 = 提示文案（title/classDef 等文档级
 * 行逐字保留，不做表单化编辑——工单定案）；节点 = 改名 / 改叶子数值 / 删除。
 * treemap 画布无 data-id 寻址（见 treemap-adapter），这两张表单是唯一文本编辑入口。
 */
const treemapSelectionForms: SelectionFormTable<TreemapProjection> = {
  diagram: () => {
    const { t } = useTranslation()
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.treemapDiagramHint')}
      </Text>
    )
  },
  'treemap-node': ({ projection, selection }) => {
    const node = projection.nodes.find((n) => n.elementId === selection.elementId)
    return node !== undefined ? <TreemapNodeForm node={node} /> : null
  },
}

/**
 * ishikawa 属性表单（more-diagrams 工单 22）：图表级 = 提示文案（无 title/样式语句，
 * 外观只能靠主题，research 坑 6——不做表单化编辑）；节点 = 改文本 / 删除（鱼头不可删）。
 * ishikawa 画布无 data-id 寻址（见 ishikawa-adapter），这两张表单是唯一文本编辑入口。
 */
const ishikawaSelectionForms: SelectionFormTable<IshikawaProjection> = {
  diagram: () => {
    const { t } = useTranslation()
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.ishikawaDiagramHint')}
      </Text>
    )
  },
  'ishikawa-node': ({ projection, selection }) => {
    const node = projection.nodes.find((n) => n.elementId === selection.elementId)
    return node !== undefined ? <IshikawaNodeForm node={node} /> : null
  },
}

/**
 * wardley 属性表单（more-diagrams 工单 23）：图表级 = 提示文案（title/size/evolution
 * 等文档级行逐字保留，不做表单化编辑——工单定案）；节点 = 改名/改坐标/删除；
 * 连线 = 改两端（下拉既有节点名）/删除；evolve = 改目标/删除。
 * wardley 画布无 data-id 寻址（见 wardley-adapter），这些表单是唯一文本编辑入口。
 */
const wardleySelectionForms: SelectionFormTable<WardleyProjection> = {
  diagram: () => {
    const { t } = useTranslation()
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.wardleyDiagramHint')}
      </Text>
    )
  },
  'wardley-node': ({ projection, selection }) => {
    const node = projection.nodes.find((n) => n.name === selection.name)
    return node !== undefined ? <WardleyNodeForm node={node} projection={projection} /> : null
  },
  'wardley-link': ({ projection, selection }) => {
    const link = projection.links.find((l) => l.elementId === selection.elementId)
    return link !== undefined ? <WardleyLinkForm link={link} projection={projection} /> : null
  },
  'wardley-evolve': ({ projection, selection }) => {
    const evolve = projection.evolves.find((e) => e.elementId === selection.elementId)
    return evolve !== undefined ? <WardleyEvolveForm evolve={evolve} /> : null
  },
}

/**
 * venn 选中表单（more-diagrams 工单 21）：图表级显示提示，集合 / 交集都落到同一张
 * VennAreaForm（按 elementId 在投影中寻回区域）。集合选中用名字（id）寻回、
 * 交集选中用 elementId 寻回。
 */
const vennSelectionForms: SelectionFormTable<VennProjection> = {
  diagram: ({ projection }) => <VennDiagramForm projection={projection} />,
  'venn-set': ({ projection, selection }) => {
    const area = projection.sets.find((s) => s.ids[0] === selection.id)
    return area !== undefined ? <VennAreaForm area={area} /> : null
  },
  'venn-union': ({ projection, selection }) => {
    const area = projection.unions.find((u) => u.elementId === selection.elementId)
    return area !== undefined ? <VennAreaForm area={area} /> : null
  },
}

/**
 * cynefin 属性表单（more-diagrams 工单 25）：图表级 = 提示文案 + 加转移（空白也可用）；
 * 域名词行 = 展示条目数 + 加条目（域不可改名/删除，工单定案）；条目 = 改文本 / 删除；
 * 转移 = 改 from/to（固定五域下拉）/ 改标签 / 删除（自环被管线拒绝，research 坑 5）。
 * cynefin 画布无 data-id 寻址（见 cynefin-adapter），这些表单是唯一文本编辑入口。
 */
const cynefinSelectionForms: SelectionFormTable<CynefinProjection> = {
  diagram: ({ projection }) => <CynefinDiagramForm projection={projection} />,
  'cynefin-domain': ({ projection, selection }) => {
    const domain = projection.domains.find((d) => d.name === selection.name)
    return domain !== undefined ? <CynefinDomainForm domain={domain} /> : null
  },
  'cynefin-item': ({ projection, selection }) => {
    const item = projection.items.find((i) => i.elementId === selection.elementId)
    return item !== undefined ? <CynefinItemForm item={item} /> : null
  },
  'cynefin-transition': ({ projection, selection }) => {
    const transition = projection.transitions.find((tr) => tr.elementId === selection.elementId)
    return transition !== undefined ? <CynefinTransitionForm transition={transition} /> : null
  },
}

/**
 * usecase 选中表单（more-diagrams 工单 26）：图表级显示提示；actor / 用例 / 边界都落到
 * 同一张 UsecaseNodeForm（按 elementId 在投影中寻回节点），关系落到 UsecaseRelationForm。
 */
function renderUsecaseNode(projection: UsecaseProjection, elementId: string): ReactNode {
  const node = projection.nodes.find((n) => n.elementId === elementId)
  return node !== undefined ? <UsecaseNodeForm node={node} /> : null
}

const usecaseSelectionForms: SelectionFormTable<UsecaseProjection> = {
  diagram: ({ projection }) => <UsecaseDiagramForm projection={projection} />,
  'usecase-actor': ({ projection, selection }) => renderUsecaseNode(projection, selection.elementId),
  'usecase-usecase': ({ projection, selection }) => renderUsecaseNode(projection, selection.elementId),
  'usecase-boundary': ({ projection, selection }) => renderUsecaseNode(projection, selection.elementId),
  'usecase-note': ({ projection, selection }) => renderUsecaseNode(projection, selection.elementId),
  'usecase-relation': ({ projection, selection }) => {
    const relation = projection.relations.find((r) => r.elementId === selection.elementId)
    return relation !== undefined ? <UsecaseRelationForm relation={relation} /> : null
  },
}

/**
 * treeView 属性表单（more-diagrams 工单 24）：图表级 = 提示文案（无 title/方向语句，
 * 外观靠主题，research §3——不做表单化编辑）；节点 = 改名 / 目录开关 / 删除。
 * treeView 画布无 data-id 寻址（见 treeview-adapter），这两张表单是唯一文本编辑入口。
 */
const treeviewSelectionForms: SelectionFormTable<TreeviewProjection> = {
  diagram: () => {
    const { t } = useTranslation()
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.treeviewDiagramHint')}
      </Text>
    )
  },
  'treeview-node': ({ projection, selection }) => {
    const node = projection.nodes.find((n) => n.elementId === selection.elementId)
    return node !== undefined ? <TreeviewNodeForm node={node} /> : null
  },
}

/**
 * eventmodeling 选中表单（more-diagrams 工单 28）：图表级显示概览；帧落到
 * EventModelingFrameForm、数据块落到 EventModelingDataForm。派生连线（默认推断关系）
 * 无源码语句、只读 → 无表单（返回 null）。
 */
const eventmodelingSelectionForms: SelectionFormTable<EventModelingProjection> = {
  diagram: ({ projection }) => <EventModelingDiagramForm projection={projection} />,
  'em-frame': ({ projection, selection }) => {
    const frame = projection.frames.find((f) => f.elementId === selection.elementId)
    return frame !== undefined ? <EventModelingFrameForm frame={frame} /> : null
  },
  'em-data': ({ projection, selection }) => {
    const block = projection.dataBlocks.find((d) => d.elementId === selection.elementId)
    return block !== undefined ? <EventModelingDataForm block={block} /> : null
  },
}

/**
 * agentflow 属性表单（more-diagrams 工单 27）：图表级 = 提示 + 改方向 + 加边（两端从既有
 * 节点下拉，空白亦可用）；节点 = 改 id / 改文本 / 改形状 / 删除（节点画布可寻址，
 * research §8.2 实测）；边 = 改标签 / 删除；容器 = 改标题（仅 flow）/ 删除（连带块内元素）；
 * 文档行 = 只读展示 + 删除。容器与文档行画布无 data-id（如实降级），这些表单 + 结构树是
 * 唯一编辑入口。
 */
const agentflowSelectionForms: SelectionFormTable<AgentflowProjection> = {
  diagram: ({ projection }) => <AgentflowDiagramForm projection={projection} />,
  'agentflow-node': ({ projection, selection }) => {
    const node = projection.nodes.find((n) => n.nodeId === selection.nodeId)
    return node !== undefined ? <AgentflowNodeForm node={node} projection={projection} /> : null
  },
  'agentflow-edge': ({ projection, selection }) => {
    const edge = projection.edges.find((e) => e.elementId === selection.elementId)
    return edge !== undefined ? <AgentflowEdgeForm edge={edge} /> : null
  },
  'agentflow-flow': ({ projection, selection }) => {
    const container = projection.containers.find((c) => c.elementId === selection.elementId)
    return container !== undefined ? <AgentflowContainerForm container={container} /> : null
  },
  'agentflow-doc': ({ projection, selection }) => {
    const docLine = projection.docLines.find((d) => d.elementId === selection.elementId)
    return docLine !== undefined ? <AgentflowDocLineForm docLine={docLine} /> : null
  },
}

/**
 * zenuml 选中表单（more-diagrams 工单 19）：图表级显示提示；参与者落到 ZenumlParticipantForm
 * （按 elementId 寻回），消息落到 ZenumlMessageForm，片段落到 ZenumlFragmentForm。
 */
const zenumlSelectionForms: SelectionFormTable<ZenumlProjection> = {
  diagram: ({ projection }) => <ZenumlDiagramForm projection={projection} />,
  'zenuml-participant': ({ projection, selection }) => {
    const part = projection.participants.find((p) => p.elementId === selection.elementId)
    return part !== undefined ? <ZenumlParticipantForm participant={part} /> : null
  },
  'zenuml-message': ({ projection, selection }) => {
    const msg = projection.messages.find((m) => m.elementId === selection.elementId)
    return msg !== undefined ? <ZenumlMessageForm message={msg} /> : null
  },
  'zenuml-fragment': ({ projection, selection }) => {
    const frag = projection.fragments.find((f) => f.elementId === selection.elementId)
    return frag !== undefined ? <ZenumlFragmentForm fragment={frag} /> : null
  },
}

/**
 * c4 选中表单（more-diagrams 工单 18）：图表级显示关键字与计数；元素 / 边界 / 关系各落到
 * 各自的表单（按 elementId 在投影中寻回）。
 */
const c4SelectionForms: SelectionFormTable<C4Projection> = {
  diagram: ({ projection }) => <C4DiagramForm projection={projection} />,
  'c4-element': ({ projection, selection }) => {
    const element = projection.elements.find((e) => e.elementId === selection.elementId)
    return element !== undefined ? <C4ElementForm element={element} /> : null
  },
  'c4-boundary': ({ projection, selection }) => {
    const boundary = projection.boundaries.find((b) => b.elementId === selection.elementId)
    return boundary !== undefined ? <C4BoundaryForm boundary={boundary} /> : null
  },
  'c4-relation': ({ projection, selection }) => {
    const relation = projection.relations.find((r) => r.elementId === selection.elementId)
    return relation !== undefined ? <C4RelationForm relation={relation} /> : null
  },
}

/**
 * 图种 id → 已绑定（擦除图种泛型）的表单路由。键穷尽由 DiagramTypeId 索引签名 +
 * `satisfies` 校验：漏一张表是编译错误（挂载循环按 id 逐项挂入）。
 */
const SELECTION_FORMS = {
  flowchart: bindSelectionForms(flowchartSelectionForms),
  sequence: bindSelectionForms(sequenceSelectionForms),
  class: bindSelectionForms(classSelectionForms),
  mindmap: bindSelectionForms(mindmapSelectionForms),
  state: bindSelectionForms(stateSelectionForms),
  er: bindSelectionForms(erSelectionForms),
  gitgraph: bindSelectionForms(gitgraphSelectionForms),
  timeline: bindSelectionForms(timelineSelectionForms),
  kanban: bindSelectionForms(kanbanSelectionForms),
  requirement: bindSelectionForms(requirementSelectionForms),
  journey: bindSelectionForms(journeySelectionForms),
  pie: bindSelectionForms(pieSelectionForms),
  block: bindSelectionForms(blockSelectionForms),
  sankey: bindSelectionForms(sankeySelectionForms),
  gantt: bindSelectionForms(ganttSelectionForms),
  quadrant: bindSelectionForms(quadrantSelectionForms),
  packet: bindSelectionForms(packetSelectionForms),
  xychart: bindSelectionForms(xychartSelectionForms),
  radar: bindSelectionForms(radarSelectionForms),
  architecture: bindSelectionForms(architectureSelectionForms),
  treemap: bindSelectionForms(treemapSelectionForms),
  ishikawa: bindSelectionForms(ishikawaSelectionForms),
  wardley: bindSelectionForms(wardleySelectionForms),
  venn: bindSelectionForms(vennSelectionForms),
  cynefin: bindSelectionForms(cynefinSelectionForms),
  usecase: bindSelectionForms(usecaseSelectionForms),
  treeview: bindSelectionForms(treeviewSelectionForms),
  eventmodeling: bindSelectionForms(eventmodelingSelectionForms),
  agentflow: bindSelectionForms(agentflowSelectionForms),
  zenuml: bindSelectionForms(zenumlSelectionForms),
  c4: bindSelectionForms(c4SelectionForms),
} as const satisfies Record<DiagramTypeId, DiagramSelectionForms>

/**
 * 挂载（工单 05）：路由表在组件层定义，注册表在 lib 层不能反向 import（会成
 * store → registry → 路由表 → store 的环），故在本模块加载时把各表挂到注册项的
 * forms 槽位。本模块被 selection-forms.tsx（壳）import，先于任何渲染执行。
 */
for (const registration of DIAGRAM_TYPE_LIST) {
  registration.forms = SELECTION_FORMS[registration.id]
}

/** 供壳之外的调用方（如测试）确认挂载完成：按投影图种取路由 */
export function selectionFormsOf(projection: AnyProjection): DiagramSelectionForms | undefined {
  return SELECTION_FORMS[projection.type]
}
