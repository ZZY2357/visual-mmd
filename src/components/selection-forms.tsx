import { Select } from '@mantine/core'
import { Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { Selection } from '../lib/projection/selection'
import { type FlowchartProjection } from '../lib/projection/flowchart-projection'
import {
  type ProjectionBlock,
  type ProjectionElse,
  type SequenceProjection,
} from '../lib/projection/sequence-projection'
import { type ClassProjection } from '../lib/projection/class-projection'
import { type MindmapProjection } from '../lib/projection/mindmap-projection'
import { type StateProjection } from '../lib/projection/state-projection'
import { type ErProjection } from '../lib/projection/er-projection'
import { type RequirementProjection } from '../lib/projection/requirement-projection'
import { type GitgraphProjection } from '../lib/projection/gitgraph-projection'
import { type TimelineProjection } from '../lib/projection/timeline-projection'
import { type KanbanProjection } from '../lib/projection/kanban-projection'
import { DIRECTIONS } from '../lib/pipeline/flowchart'
import { setDirectionIntent } from '../lib/editing/flowchart-forms'
import { setClassDirectionIntent } from '../lib/editing/class-forms'
import { useEditorStore } from '../store/editor'
import type { AnyProjection } from '../lib/diagram-registry'
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
import { GITGRAPH_DIRECTIONS, type GitgraphIntent } from '../lib/pipeline/gitgraph'
import {
  TimelineDiagramForm,
  TimelineEventForm,
  TimelinePeriodForm,
  TimelineSectionForm,
} from './timeline-forms'
import { KanbanCardForm, KanbanColumnForm } from './kanban-forms'
import { JourneyDiagramForm, JourneySectionForm, JourneyTaskForm } from './journey-forms'
import { type JourneyProjection } from '../lib/projection/journey-projection'
import { PieDiagramForm, PieSectorForm } from './pie-forms'
import { type PieProjection } from '../lib/projection/pie-projection'
import { RadarAxisForm, RadarCurveForm, RadarDiagramForm } from './radar-forms'
import { type RadarProjection } from '../lib/projection/radar-projection'
import { BlockDiagramForm, BlockEdgeForm, BlockGroupForm, BlockNodeForm } from './block-forms'
import { type BlockProjection } from '../lib/projection/block-projection'
import { SankeyLinkForm, SankeyNodeForm } from './sankey-forms'
import { type SankeyProjection } from '../lib/projection/sankey-projection'
import {
  GanttDiagramForm,
  GanttDirectiveForm,
  GanttSectionForm,
  GanttTaskForm,
} from './gantt-forms'
import { type GanttProjection } from '../lib/projection/gantt-projection'
import {
  QuadrantAxisForm,
  QuadrantDiagramForm,
  QuadrantPointForm,
  QuadrantQuadrantForm,
} from './quadrant-forms'
import { type QuadrantProjection } from '../lib/projection/quadrant-projection'
import { PacketDiagramForm, PacketFieldForm } from './packet-forms'
import { type PacketProjection } from '../lib/projection/packet-projection'
import { XychartAxisForm, XychartSeriesForm, XychartTitleForm } from './xychart-forms'
import { type XychartProjection } from '../lib/projection/xychart-projection'
import {
  ArchitectureAlignForm,
  ArchitectureEdgeForm,
  ArchitectureGroupForm,
  ArchitectureJunctionForm,
  ArchitectureServiceForm,
} from './architecture-forms'
import { type ArchitectureProjection } from '../lib/projection/architecture-projection'
import { TreemapNodeForm } from './treemap-forms'
import { type TreemapProjection } from '../lib/projection/treemap-projection'
import { IshikawaNodeForm } from './ishikawa-forms'
import { type IshikawaProjection } from '../lib/projection/ishikawa-projection'
import { WardleyEvolveForm, WardleyLinkForm, WardleyNodeForm } from './wardley-forms'
import { type WardleyProjection } from '../lib/projection/wardley-projection'
import { VennAreaForm, VennDiagramForm } from './venn-forms'
import {
  UsecaseDiagramForm,
  UsecaseNodeForm,
  UsecaseRelationForm,
} from './usecase-forms'
import { type VennProjection } from '../lib/projection/venn-projection'
import { CynefinDiagramForm, CynefinDomainForm, CynefinItemForm, CynefinTransitionForm } from './cynefin-forms'
import { type CynefinProjection } from '../lib/projection/cynefin-projection'
import { type UsecaseProjection } from '../lib/projection/usecase-projection'
import { TreeviewNodeForm } from './treeview-forms'
import { type TreeviewProjection } from '../lib/projection/treeview-projection'
import {
  EventModelingDataForm,
  EventModelingDiagramForm,
  EventModelingFrameForm,
} from './eventmodeling-forms'
import { type EventModelingProjection } from '../lib/projection/eventmodeling-projection'
import {
  AgentflowContainerForm,
  AgentflowDiagramForm,
  AgentflowDocLineForm,
  AgentflowEdgeForm,
  AgentflowNodeForm,
} from './agentflow-forms'
import { type AgentflowProjection } from '../lib/projection/agentflow-projection'

/**
 * 选中元素的属性表单，按投影图种分发（工单 04-bundle 自 PropertyPanel 迁出）：
 * 四个图种各自的 SelectionForm 逐 kind 找到投影中的元素并渲染对应表单；
 * 选中为 null（图表级回落由 PropertyPanel 经能力包 resolveSelection 完成后传入）时显示占位文案。
 */

function FlowchartSelectionForm({
  projection,
  selection,
}: {
  projection: FlowchartProjection
  selection: Selection | null
}) {
  const { t } = useTranslation()
  const commitIntent = useEditorStore((s) => s.commitIntent)
  if (selection === null) {
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.nothingSelected')}
      </Text>
    )
  }
  switch (selection.kind) {
    case 'diagram':
      // 方向来自表头 token（`flowchart TD`）：没有「不设置」的形态，故不提供「跟随默认」
      return (
        <DiagramForm
          direction={projection.direction}
          knownDirections={DIRECTIONS}
          onSelect={(next) => {
            if (next !== null) commitIntent(setDirectionIntent(next))
          }}
        />
      )
    case 'node': {
      const node = projection.nodes.find((n) => n.nodeId === selection.nodeId)
      return node !== undefined ? (
        <NodeForm node={node} classDefs={projection.classDefs} appliedStyles={projection.appliedStyles} />
      ) : null
    }
    case 'edge': {
      const edge = projection.edges.find(
        (e) => e.from === selection.from && e.to === selection.to && e.occurrence === selection.occurrence,
      )
      return edge !== undefined ? <EdgeForm edge={edge} /> : null
    }
    case 'subgraph': {
      const sg = projection.subgraphs.find((s) => s.elementId === selection.elementId)
      return sg !== undefined ? <SubgraphForm subgraph={sg} /> : null
    }
    case 'classdef': {
      const cd = projection.classDefs.find((c) => c.name === selection.name)
      return cd !== undefined ? <ClassDefForm classDef={cd} /> : null
    }
    default:
      return null
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

function SequenceSelectionForm({
  projection,
  selection,
}: {
  projection: SequenceProjection
  selection: Selection | null
}) {
  const { t } = useTranslation()
  if (selection === null) {
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.nothingSelected')}
      </Text>
    )
  }
  switch (selection.kind) {
    case 'diagram':
      return <SequenceDiagramForm projection={projection} />
    case 'participant': {
      const p = projection.participants.find((x) => x.actorId === selection.actorId)
      return p !== undefined ? <ParticipantForm participant={p} /> : null
    }
    case 'message': {
      const m = projection.messages.find((x) => x.elementId === selection.elementId)
      return m !== undefined ? <MessageForm message={m} /> : null
    }
    case 'note': {
      const n = projection.notes.find((x) => x.elementId === selection.elementId)
      return n !== undefined ? <NoteForm note={n} /> : null
    }
    case 'block': {
      const b = projection.blocks.find((x) => x.elementId === selection.elementId)
      if (b === undefined || !isBlockOpen(b)) return null
      return <BlockForm block={b} elseBranches={elseBranchesOf(projection, b.elementId)} />
    }
    case 'seq-region': {
      const r = projection.regions.find((x) => x.elementId === selection.elementId)
      return r !== undefined ? <SequenceRegionForm region={r} /> : null
    }
    default:
      return null
  }
}

function ClassSelectionForm({
  projection,
  selection,
}: {
  projection: ClassProjection
  selection: Selection | null
}) {
  const { t } = useTranslation()
  const commitIntent = useEditorStore((s) => s.commitIntent)
  if (selection === null) {
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.nothingSelected')}
      </Text>
    )
  }
  switch (selection.kind) {
    case 'diagram':
      // classDiagram 的方向是独立语句行：没有该行时如实显示「跟随 Mermaid 默认」（工单 07）
      return (
        <DiagramForm
          direction={projection.direction}
          allowFollowDefault
          onSelect={(next) => commitIntent(setClassDirectionIntent(next))}
        />
      )
    case 'class': {
      const c = projection.classes.find((x) => x.name === selection.name)
      return c !== undefined ? <ClassForm cls={c} /> : null
    }
    case 'class-member': {
      const m = projection.members.find((x) => x.elementId === selection.elementId)
      return m !== undefined ? <MemberForm member={m} /> : null
    }
    case 'class-relation': {
      const r = projection.relations.find((x) => x.elementId === selection.elementId)
      return r !== undefined ? <RelationForm relation={r} /> : null
    }
    case 'class-note': {
      const n = projection.notes.find((x) => x.elementId === selection.elementId)
      return n !== undefined ? <ClassNoteForm note={n} /> : null
    }
    case 'class-namespace': {
      const ns = projection.namespaces.find((x) => x.elementId === selection.elementId)
      return ns !== undefined ? <NamespaceForm namespace={ns} /> : null
    }
    case 'classdef': {
      const cd = projection.classDefs.find((x) => x.name === selection.name)
      return cd !== undefined ? <ClassDefForm classDef={cd} /> : null
    }
    default:
      return null
  }
}

function MindmapSelectionForm({
  projection,
  selection,
}: {
  projection: MindmapProjection
  selection: Selection | null
}) {
  const { t } = useTranslation()
  if (selection === null) {
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.nothingSelected')}
      </Text>
    )
  }
  switch (selection.kind) {
    case 'diagram':
      return (
        <Text size="sm" c="dimmed" px="xs">
          {t('app:propertyPanel.mindmapHint')}
        </Text>
      )
    case 'mindmap-node': {
      const node = projection.nodes.find((n) => n.elementId === selection.elementId)
      return node !== undefined ? <MindmapNodeForm node={node} /> : null
    }
    default:
      return null
  }
}
function StateSelectionForm({
  projection,
  selection,
}: {
  projection: StateProjection
  selection: Selection | null
}) {
  const { t } = useTranslation()
  if (selection === null) {
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.nothingSelected')}
      </Text>
    )
  }
  switch (selection.kind) {
    case 'diagram':
      // stateDiagram 的 direction 是独立语句行：没有该行时如实显示「跟随 Mermaid 默认」
      return (
        <DiagramForm
          direction={projection.direction}
          allowFollowDefault
          onSelect={(next) => commitStateDirection(next)}
        />
      )
    case 'state': {
      const state = projection.states.find((s) => s.id === selection.id)
      return state !== undefined ? <StateForm state={state} /> : null
    }
    case 'state-transition': {
      const tr = projection.transitions.find((x) => x.elementId === selection.elementId)
      return tr !== undefined ? <StateTransitionForm transition={tr} /> : null
    }
    case 'state-note': {
      const n = projection.notes.find((x) => x.elementId === selection.elementId)
      return n !== undefined ? <StateNoteForm note={n} /> : null
    }
    default:
      return null
  }
}

/** state 图表方向的表单值 → set-direction 意图（与 class 同口径：null = 删除 direction 行） */
function commitStateDirection(direction: string | null): void {
  useEditorStore.getState().commitIntent({ type: 'set-direction', direction })
}

function ErSelectionForm({
  projection,
  selection,
}: {
  projection: ErProjection
  selection: Selection | null
}) {
  const { t } = useTranslation()
  const commitIntent = useEditorStore((s) => s.commitIntent)
  if (selection === null) {
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.nothingSelected')}
      </Text>
    )
  }
  switch (selection.kind) {
    case 'diagram':
      // erDiagram 的 direction 是独立语句行：没有该行时如实显示「跟随 Mermaid 默认」
      return (
        <DiagramForm
          direction={projection.direction}
          allowFollowDefault
          onSelect={(next) => commitIntent({ type: 'set-direction', direction: next })}
        />
      )
    case 'er-entity': {
      const entity = projection.entities.find((e) => e.name === selection.name)
      return entity !== undefined ? <ErEntityForm entity={entity} /> : null
    }
    case 'er-attribute': {
      const attr = projection.attributes.find((a) => a.elementId === selection.elementId)
      return attr !== undefined ? <ErAttributeForm attribute={attr} /> : null
    }
    case 'er-relation': {
      const rel = projection.relations.find((r) => r.elementId === selection.elementId)
      return rel !== undefined ? <ErRelationForm relation={rel} /> : null
    }
    default:
      return null
  }
}

function GitgraphSelectionForm({
  projection,
  selection,
}: {
  projection: GitgraphProjection
  selection: Selection | null
}) {
  const { t } = useTranslation()
  const commitIntent = useEditorStore((s) => s.commitIntent)
  if (selection === null) {
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.nothingSelected')}
      </Text>
    )
  }
  switch (selection.kind) {
    case 'diagram':
      // gitGraph 的方向在表头 token 上（gitGraph LR:）：没有「不设置」之外的独立语句；
      // 缺省即 mermaid 默认 LR（表头可写回方向 token，无「跟随」哨兵的必要——默认就是 LR）
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
    case 'gitgraph-commit': {
      const commit = projection.commits.find((c) => c.elementId === selection.elementId)
      return commit !== undefined ? <GitgraphCommitForm commit={commit} /> : null
    }
    case 'gitgraph-branch': {
      const branch = projection.branches.find((b) => b.name === selection.name)
      return branch !== undefined ? <GitgraphBranchForm branch={branch} /> : null
    }
    case 'gitgraph-merge': {
      const merge = projection.merges.find((m) => m.elementId === selection.elementId)
      return merge !== undefined ? <GitgraphMergeForm merge={merge} /> : null
    }
    case 'gitgraph-cherry-pick': {
      const pick = projection.cherryPicks.find((p) => p.elementId === selection.elementId)
      return pick !== undefined ? <GitgraphCherryPickForm pick={pick} /> : null
    }
    default:
      return null
  }
}

function TimelineSelectionForm({
  projection,
  selection,
}: {
  projection: TimelineProjection
  selection: Selection | null
}) {
  const { t } = useTranslation()
  if (selection === null) {
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.nothingSelected')}
      </Text>
    )
  }
  switch (selection.kind) {
    case 'diagram':
      return <TimelineDiagramForm projection={projection} />
    case 'timeline-section': {
      const section = projection.sections.find((s) => s.elementId === selection.elementId)
      return section !== undefined ? <TimelineSectionForm section={section} /> : null
    }
    case 'timeline-period': {
      const period = projection.periods.find((p) => p.elementId === selection.elementId)
      return period !== undefined ? <TimelinePeriodForm period={period} /> : null
    }
    case 'timeline-event': {
      const event = projection.events.find((e) => e.elementId === selection.elementId)
      return event !== undefined ? <TimelineEventForm event={event} /> : null
    }
    default:
      return null
  }
}

/**
 * kanban（more-diagrams 工单 06）：选中列 / 卡片时渲染对应表单；图表级（无方向概念）
 * 显示看板操作提示。卡片表单需要归属列标题，按 `columnElementId` 反查。
 */
function KanbanSelectionForm({
  projection,
  selection,
}: {
  projection: KanbanProjection
  selection: Selection | null
}) {
  const { t } = useTranslation()
  if (selection === null) {
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.nothingSelected')}
      </Text>
    )
  }
  switch (selection.kind) {
    case 'diagram':
      return (
        <Text size="sm" c="dimmed" px="xs">
          {t('app:propertyPanel.kanbanHint')}
        </Text>
      )
    case 'kanban-column': {
      const column = projection.columns.find((c) => c.elementId === selection.elementId)
      return column !== undefined ? <KanbanColumnForm column={column} /> : null
    }
    case 'kanban-card': {
      const card = projection.cards.find((c) => c.elementId === selection.elementId)
      if (card === undefined) return null
      const column = projection.columns.find((c) => c.elementId === card.columnElementId)
      return <KanbanCardForm card={card} columnTitle={column?.title ?? card.columnElementId} />
    }
    default:
      return null
  }
}

/** requirement 属性表单（more-diagrams 工单 07）：图表级 direction（独立语句行，
 * 没有「跟随 Mermaid 默认」形态）+ requirement / element / relation 三类元素 */
function RequirementSelectionForm({
  projection,
  selection,
}: {
  projection: RequirementProjection
  selection: Selection | null
}) {
  const { t } = useTranslation()
  const commitIntent = useEditorStore((s) => s.commitIntent)
  if (selection === null) {
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.nothingSelected')}
      </Text>
    )
  }
  switch (selection.kind) {
    case 'diagram':
      return (
        <DiagramForm
          direction={projection.direction}
          allowFollowDefault
          onSelect={(next) => commitIntent({ type: 'set-direction', direction: next })}
        />
      )
    case 'requirement': {
      const requirement = projection.requirements.find((r) => r.name === selection.name)
      return requirement !== undefined ? <RequirementNodeForm requirement={requirement} /> : null
    }
    case 'requirement-element': {
      const element = projection.elements.find((e) => e.name === selection.name)
      return element !== undefined ? <RequirementElementForm element={element} /> : null
    }
    case 'requirement-relation': {
      const relation = projection.relations.find((r) => r.elementId === selection.elementId)
      return relation !== undefined ? <RequirementRelationForm relation={relation} /> : null
    }
    default:
      return null
  }
}

/**
 * journey（more-diagrams 工单 08）：选中任务 / section 时渲染对应表单；图表级 = 标题。
 * journey 画布无 data-id 寻址（见 journey-adapter），这三张表单是唯一文本编辑入口。
 */
function JourneySelectionForm({
  projection,
  selection,
}: {
  projection: JourneyProjection
  selection: Selection | null
}) {
  const { t } = useTranslation()
  if (selection === null) {
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.nothingSelected')}
      </Text>
    )
  }
  switch (selection.kind) {
    case 'diagram':
      return <JourneyDiagramForm projection={projection} />
    case 'journey-section': {
      const section = projection.sections.find((s) => s.elementId === selection.elementId)
      return section !== undefined ? <JourneySectionForm section={section} /> : null
    }
    case 'journey-task': {
      const task = projection.tasks.find((task) => task.elementId === selection.elementId)
      return task !== undefined ? <JourneyTaskForm task={task} /> : null
    }
    default:
      return null
  }
}

/**
 * pie（more-diagrams 工单 10）：选中扇区时渲染对应表单；图表级 = 标题。
 * pie 画布无 data-id 寻址（见 pie-adapter），这两张表单是唯一文本编辑入口。
 */
function PieSelectionForm({
  projection,
  selection,
}: {
  projection: PieProjection
  selection: Selection | null
}) {
  const { t } = useTranslation()
  if (selection === null) {
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.nothingSelected')}
      </Text>
    )
  }
  switch (selection.kind) {
    case 'diagram':
      return <PieDiagramForm projection={projection} />
    case 'pie-sector': {
      const sector = projection.sectors.find((s) => s.elementId === selection.elementId)
      return sector !== undefined ? <PieSectorForm sector={sector} /> : null
    }
    default:
      return null
  }
}

/**
 * radar（more-diagrams 工单 15）：选中轴 / 曲线时渲染对应表单；图表级 = 标题 + 选项。
 * radar 画布无 data-id 寻址（见 radar-adapter），这些表单是主要文本编辑入口
 * （轴 label 另有双击内联编辑，按 class 文本匹配）。
 */
function RadarSelectionForm({
  projection,
  selection,
}: {
  projection: RadarProjection
  selection: Selection | null
}) {
  const { t } = useTranslation()
  if (selection === null) {
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.nothingSelected')}
      </Text>
    )
  }
  switch (selection.kind) {
    case 'diagram':
      return <RadarDiagramForm projection={projection} />
    case 'radar-axis': {
      const axis = projection.axes.find((a) => a.elementId === selection.elementId)
      return axis !== undefined ? <RadarAxisForm axis={axis} /> : null
    }
    case 'radar-curve': {
      const curve = projection.curves.find((c) => c.elementId === selection.elementId)
      return curve !== undefined ? <RadarCurveForm curve={curve} projection={projection} /> : null
    }
    default:
      return null
  }
}

/**
 * block 属性表单（more-diagrams 工单 09）：图表级 title/columns + 节点 / 嵌套块 /
 * 边三类元素。space 不进投影选中面（布局空位，无表单）。
 */
function BlockSelectionForm({
  projection,
  selection,
}: {
  projection: BlockProjection
  selection: Selection | null
}) {
  const { t } = useTranslation()
  if (selection === null) {
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.nothingSelected')}
      </Text>
    )
  }
  switch (selection.kind) {
    case 'diagram':
      return <BlockDiagramForm title={projection.title} columns={projection.columns} />
    case 'block-node': {
      const node = projection.nodes.find((n) => n.id === selection.id)
      return node !== undefined ? <BlockNodeForm node={node} /> : null
    }
    case 'block-group': {
      const group = projection.groups.find((g) => g.id === selection.id)
      return group !== undefined ? <BlockGroupForm group={group} /> : null
    }
    case 'block-edge': {
      const edge = projection.edges.find((e) => e.elementId === selection.elementId)
      return edge !== undefined ? <BlockEdgeForm edge={edge} /> : null
    }
    default:
      return null
  }
}

/**
 * sankey 属性表单（more-diagrams 工单 13）：图表级 = 提示文案（无标题/direction 等图表级
 * 可编辑项，config 不做编辑——工单定案）；节点 = 重命名（名字即身份）；链路 = 三列编辑。
 */
function SankeySelectionForm({
  projection,
  selection,
}: {
  projection: SankeyProjection
  selection: Selection | null
}) {
  const { t } = useTranslation()
  if (selection === null) {
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.nothingSelected')}
      </Text>
    )
  }
  switch (selection.kind) {
    case 'diagram':
      return (
        <Text size="sm" c="dimmed" px="xs">
          {t('app:propertyPanel.sankeyDiagramHint')}
        </Text>
      )
    case 'sankey-node': {
      const node = projection.nodes.find((n) => n.name === selection.name)
      return node !== undefined ? <SankeyNodeForm node={node} /> : null
    }
    case 'sankey-link': {
      const link = projection.links.find((l) => l.elementId === selection.elementId)
      return link !== undefined ? <SankeyLinkForm link={link} /> : null
    }
    default:
      return null
  }
}

/**
 * gantt（more-diagrams 工单 11）：选中任务 / section / 指令行时渲染对应表单；
 * 图表级 = 标题 + dateFormat。任务条画布可寻址但文本编辑入口统一在表单（与 journey/pie
 * 同口径）；section 与指令行不可寻址，这三张表单是其唯一编辑入口。
 */
function GanttSelectionForm({
  projection,
  selection,
}: {
  projection: GanttProjection
  selection: Selection | null
}) {
  const { t } = useTranslation()
  if (selection === null) {
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.nothingSelected')}
      </Text>
    )
  }
  switch (selection.kind) {
    case 'diagram':
      return <GanttDiagramForm projection={projection} />
    case 'gantt-task': {
      const task = projection.tasks.find((task) => task.elementId === selection.elementId)
      return task !== undefined ? <GanttTaskForm task={task} /> : null
    }
    case 'gantt-section': {
      const section = projection.sections.find((s) => s.elementId === selection.elementId)
      return section !== undefined ? <GanttSectionForm section={section} /> : null
    }
    case 'gantt-directive': {
      const directive = projection.directives.find((d) => d.elementId === selection.elementId)
      return directive !== undefined ? <GanttDirectiveForm directive={directive} /> : null
    }
    default:
      return null
  }
}

/**
 * quadrant（more-diagrams 工单 12）：选中点 / 轴 / 象限时渲染对应表单；图表级 = 标题。
 */
function QuadrantSelectionForm({
  projection,
  selection,
}: {
  projection: QuadrantProjection
  selection: Selection | null
}) {
  const { t } = useTranslation()
  if (selection === null) {
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.nothingSelected')}
      </Text>
    )
  }
  switch (selection.kind) {
    case 'diagram':
      return <QuadrantDiagramForm projection={projection} />
    case 'quadrant-point': {
      const point = projection.points.find((p) => p.elementId === selection.elementId)
      return point !== undefined ? <QuadrantPointForm point={point} /> : null
    }
    case 'quadrant-axis': {
      const axis = selection.elementId === 'x-axis' ? projection.xAxis : projection.yAxis
      return axis !== null ? <QuadrantAxisForm axis={axis} /> : null
    }
    case 'quadrant-quadrant': {
      const quadrant = projection.quadrants.find((q) => q.elementId === selection.elementId)
      return quadrant !== undefined ? <QuadrantQuadrantForm quadrant={quadrant} /> : null
    }
    default:
      return null
  }
}

/**
 * packet（more-diagrams 工单 16）：选中字段时渲染字段表单；图表级 = 只读提示。
 */
function PacketSelectionForm({
  projection,
  selection,
}: {
  projection: PacketProjection
  selection: Selection | null
}) {
  const { t } = useTranslation()
  if (selection === null) {
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.nothingSelected')}
      </Text>
    )
  }
  switch (selection.kind) {
    case 'diagram':
      return <PacketDiagramForm projection={projection} />
    case 'packet-field': {
      const field = projection.fields.find((f) => f.elementId === selection.elementId)
      return field !== undefined ? <PacketFieldForm field={field} /> : null
    }
    default:
      return null
  }
}

/**
 * xychart 属性表单（more-diagrams 工单 14）：图表级 = 提示文案（frontmatter config
 * 不做编辑——工单定案）；标题 / 轴 = 文档级属性表单；系列 = 名字/类型/数值行编辑。
 */
function XychartSelectionForm({
  projection,
  selection,
}: {
  projection: XychartProjection
  selection: Selection | null
}) {
  const { t } = useTranslation()
  if (selection === null) {
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.nothingSelected')}
      </Text>
    )
  }
  switch (selection.kind) {
    case 'diagram':
      return (
        <Text size="sm" c="dimmed" px="xs">
          {t('app:propertyPanel.xychartDiagramHint')}
        </Text>
      )
    case 'xychart-title':
      return <XychartTitleForm title={projection.title} />
    case 'xychart-axis':
      return <XychartAxisForm axis={selection.axis === 'x' ? projection.xAxis : projection.yAxis} />
    case 'xychart-series': {
      const series = projection.series.find((s) => s.elementId === selection.elementId)
      return series !== undefined ? <XychartSeriesForm series={series} /> : null
    }
    default:
      return null
  }
}

/**
 * architecture 属性表单（more-diagrams 工单 17）：图表级 = 提示文案（config 不做编辑
 * ——工单定案）；service / group / junction / 边 / align 五类元素。边不可寻址（见
 * architecture-adapter），ArchitectureEdgeForm 只从结构树选中进入。
 */
function ArchitectureSelectionForm({
  projection,
  selection,
}: {
  projection: ArchitectureProjection
  selection: Selection | null
}) {
  const { t } = useTranslation()
  if (selection === null) {
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.nothingSelected')}
      </Text>
    )
  }
  switch (selection.kind) {
    case 'diagram':
      return (
        <Text size="sm" c="dimmed" px="xs">
          {t('app:propertyPanel.architectureDiagramHint')}
        </Text>
      )
    case 'architecture-service': {
      const service = projection.services.find((s) => s.id === selection.name)
      return service !== undefined ? <ArchitectureServiceForm service={service} groups={projection.groups} /> : null
    }
    case 'architecture-group': {
      const group = projection.groups.find((g) => g.id === selection.name)
      return group !== undefined ? <ArchitectureGroupForm group={group} groups={projection.groups} /> : null
    }
    case 'architecture-junction': {
      const junction = projection.junctions.find((j) => j.id === selection.name)
      return junction !== undefined ? <ArchitectureJunctionForm junction={junction} groups={projection.groups} /> : null
    }
    case 'architecture-edge': {
      const edge = projection.edges.find((e) => e.elementId === selection.elementId)
      return edge !== undefined ? <ArchitectureEdgeForm edge={edge} /> : null
    }
    case 'architecture-align': {
      const align = projection.aligns.find((a) => a.elementId === selection.elementId)
      return align !== undefined ? <ArchitectureAlignForm align={align} /> : null
    }
    default:
      return null
  }
}

/**
 * treemap 属性表单（more-diagrams 工单 20）：图表级 = 提示文案（title/classDef 等文档级
 * 行逐字保留，不做表单化编辑——工单定案）；节点 = 改名 / 改叶子数值 / 删除。
 * treemap 画布无 data-id 寻址（见 treemap-adapter），这两张表单是唯一文本编辑入口。
 */
function TreemapSelectionForm({
  projection,
  selection,
}: {
  projection: TreemapProjection
  selection: Selection | null
}) {
  const { t } = useTranslation()
  if (selection === null) {
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.nothingSelected')}
      </Text>
    )
  }
  switch (selection.kind) {
    case 'diagram':
      return (
        <Text size="sm" c="dimmed" px="xs">
          {t('app:propertyPanel.treemapDiagramHint')}
        </Text>
      )
    case 'treemap-node': {
      const node = projection.nodes.find((n) => n.elementId === selection.elementId)
      return node !== undefined ? <TreemapNodeForm node={node} /> : null
    }
    default:
      return null
  }
}

/**
 * ishikawa 属性表单（more-diagrams 工单 22）：图表级 = 提示文案（无 title/样式语句，
 * 外观只能靠主题，research 坑 6——不做表单化编辑）；节点 = 改文本 / 删除（鱼头不可删）。
 * ishikawa 画布无 data-id 寻址（见 ishikawa-adapter），这两张表单是唯一文本编辑入口。
 */
function IshikawaSelectionForm({
  projection,
  selection,
}: {
  projection: IshikawaProjection
  selection: Selection | null
}) {
  const { t } = useTranslation()
  if (selection === null) {
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.nothingSelected')}
      </Text>
    )
  }
  switch (selection.kind) {
    case 'diagram':
      return (
        <Text size="sm" c="dimmed" px="xs">
          {t('app:propertyPanel.ishikawaDiagramHint')}
        </Text>
      )
    case 'ishikawa-node': {
      const node = projection.nodes.find((n) => n.elementId === selection.elementId)
      return node !== undefined ? <IshikawaNodeForm node={node} /> : null
    }
    default:
      return null
  }
}

/**
 * wardley 属性表单（more-diagrams 工单 23）：图表级 = 提示文案（title/size/evolution
 * 等文档级行逐字保留，不做表单化编辑——工单定案）；节点 = 改名/改坐标/删除；
 * 连线 = 改两端（下拉既有节点名）/删除；evolve = 改目标/删除。
 * wardley 画布无 data-id 寻址（见 wardley-adapter），这些表单是唯一文本编辑入口。
 */
function WardleySelectionForm({
  projection,
  selection,
}: {
  projection: WardleyProjection
  selection: Selection | null
}) {
  const { t } = useTranslation()
  if (selection === null) {
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.nothingSelected')}
      </Text>
    )
  }
  switch (selection.kind) {
    case 'diagram':
      return (
        <Text size="sm" c="dimmed" px="xs">
          {t('app:propertyPanel.wardleyDiagramHint')}
        </Text>
      )
    case 'wardley-node': {
      const node = projection.nodes.find((n) => n.name === selection.name)
      return node !== undefined ? <WardleyNodeForm node={node} projection={projection} /> : null
    }
    case 'wardley-link': {
      const link = projection.links.find((l) => l.elementId === selection.elementId)
      return link !== undefined ? <WardleyLinkForm link={link} projection={projection} /> : null
    }
    case 'wardley-evolve': {
      const evolve = projection.evolves.find((e) => e.elementId === selection.elementId)
      return evolve !== undefined ? <WardleyEvolveForm evolve={evolve} /> : null
    }
    default:
      return null
  }
}

/**
 * venn 选中表单（more-diagrams 工单 21）：图表级显示提示，集合 / 交集都落到同一张
 * VennAreaForm（按 elementId 在投影中寻回区域）。集合选中用名字（id）寻回、
 * 交集选中用 elementId 寻回。
 */
function VennSelectionForm({
  projection,
  selection,
}: {
  projection: VennProjection
  selection: Selection | null
}) {
  const { t } = useTranslation()
  if (selection === null) {
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.nothingSelected')}
      </Text>
    )
  }
  switch (selection.kind) {
    case 'diagram':
      return <VennDiagramForm projection={projection} />
    case 'venn-set': {
      const area = projection.sets.find((s) => s.ids[0] === selection.id)
      return area !== undefined ? <VennAreaForm area={area} /> : null
    }
    case 'venn-union': {
      const area = projection.unions.find((u) => u.elementId === selection.elementId)
      return area !== undefined ? <VennAreaForm area={area} /> : null
    }
    default:
      return null
  }
}

/**
 * cynefin 属性表单（more-diagrams 工单 25）：图表级 = 提示文案 + 加转移（空白也可用）；
 * 域名词行 = 展示条目数 + 加条目（域不可改名/删除，工单定案）；条目 = 改文本 / 删除；
 * 转移 = 改 from/to（固定五域下拉）/ 改标签 / 删除（自环被管线拒绝，research 坑 5）。
 * cynefin 画布无 data-id 寻址（见 cynefin-adapter），这些表单是唯一文本编辑入口。
 */
function CynefinSelectionForm({
  projection,
  selection,
}: {
  projection: CynefinProjection
  selection: Selection | null
}) {
  const { t } = useTranslation()
  if (selection === null) {
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.nothingSelected')}
      </Text>
    )
  }
  switch (selection.kind) {
    case 'diagram':
      return <CynefinDiagramForm projection={projection} />
    case 'cynefin-domain': {
      const domain = projection.domains.find((d) => d.name === selection.name)
      return domain !== undefined ? <CynefinDomainForm domain={domain} /> : null
    }
    case 'cynefin-item': {
      const item = projection.items.find((i) => i.elementId === selection.elementId)
      return item !== undefined ? <CynefinItemForm item={item} /> : null
    }
    case 'cynefin-transition': {
      const transition = projection.transitions.find((tr) => tr.elementId === selection.elementId)
      return transition !== undefined ? <CynefinTransitionForm transition={transition} /> : null
    }
    default:
      return null
  }
}

/**
 * usecase 选中表单（more-diagrams 工单 26）：图表级显示提示；actor / 用例 / 边界都落到
 * 同一张 UsecaseNodeForm（按 elementId 在投影中寻回节点），关系落到 UsecaseRelationForm。
 */
function UsecaseSelectionForm({
  projection,
  selection,
}: {
  projection: UsecaseProjection
  selection: Selection | null
}) {
  const { t } = useTranslation()
  if (selection === null) {
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.nothingSelected')}
      </Text>
    )
  }
  switch (selection.kind) {
    case 'diagram':
      return <UsecaseDiagramForm projection={projection} />
    case 'usecase-actor':
    case 'usecase-usecase':
    case 'usecase-boundary':
    case 'usecase-note': {
      const node = projection.nodes.find((n) => n.elementId === selection.elementId)
      return node !== undefined ? <UsecaseNodeForm node={node} /> : null
    }
    case 'usecase-relation': {
      const relation = projection.relations.find((r) => r.elementId === selection.elementId)
      return relation !== undefined ? <UsecaseRelationForm relation={relation} /> : null
    }
    default:
      return null
  }
}

/**
 * treeView 属性表单（more-diagrams 工单 24）：图表级 = 提示文案（无 title/方向语句，
 * 外观靠主题，research §3——不做表单化编辑）；节点 = 改名 / 目录开关 / 删除。
 * treeView 画布无 data-id 寻址（见 treeview-adapter），这两张表单是唯一文本编辑入口。
 */
function TreeviewSelectionForm({
  projection,
  selection,
}: {
  projection: TreeviewProjection
  selection: Selection | null
}) {
  const { t } = useTranslation()
  if (selection === null) {
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.nothingSelected')}
      </Text>
    )
  }
  switch (selection.kind) {
    case 'diagram':
      return (
        <Text size="sm" c="dimmed" px="xs">
          {t('app:propertyPanel.treeviewDiagramHint')}
        </Text>
      )
    case 'treeview-node': {
      const node = projection.nodes.find((n) => n.elementId === selection.elementId)
      return node !== undefined ? <TreeviewNodeForm node={node} /> : null
    }
    default:
      return null
  }
}

/**
 * eventmodeling 选中表单（more-diagrams 工单 28）：图表级显示概览；帧落到
 * EventModelingFrameForm、数据块落到 EventModelingDataForm。派生连线（默认推断关系）
 * 无源码语句、只读 → 无表单（返回 null）。
 */
function EventModelingSelectionForm({
  projection,
  selection,
}: {
  projection: EventModelingProjection
  selection: Selection | null
}) {
  const { t } = useTranslation()
  if (selection === null) {
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.nothingSelected')}
      </Text>
    )
  }
  switch (selection.kind) {
    case 'diagram':
      return <EventModelingDiagramForm projection={projection} />
    case 'em-frame': {
      const frame = projection.frames.find((f) => f.elementId === selection.elementId)
      return frame !== undefined ? <EventModelingFrameForm frame={frame} /> : null
    }
    case 'em-data': {
      const block = projection.dataBlocks.find((d) => d.elementId === selection.elementId)
      return block !== undefined ? <EventModelingDataForm block={block} /> : null
    }
    default:
      return null
  }
}

/**
 * agentflow 属性表单（more-diagrams 工单 27）：图表级 = 提示 + 改方向 + 加边（两端从既有
 * 节点下拉，空白亦可用）；节点 = 改 id / 改文本 / 改形状 / 删除（节点画布可寻址，
 * research §8.2 实测）；边 = 改标签 / 删除；容器 = 改标题（仅 flow）/ 删除（连带块内元素）；
 * 文档行 = 只读展示 + 删除。容器与文档行画布无 data-id（如实降级），这些表单 + 结构树是
 * 唯一编辑入口。
 */
function AgentflowSelectionForm({
  projection,
  selection,
}: {
  projection: AgentflowProjection
  selection: Selection | null
}) {
  const { t } = useTranslation()
  if (selection === null) {
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.nothingSelected')}
      </Text>
    )
  }
  switch (selection.kind) {
    case 'diagram':
      return <AgentflowDiagramForm projection={projection} />
    case 'agentflow-node': {
      const node = projection.nodes.find((n) => n.nodeId === selection.nodeId)
      return node !== undefined ? <AgentflowNodeForm node={node} projection={projection} /> : null
    }
    case 'agentflow-edge': {
      const edge = projection.edges.find((e) => e.elementId === selection.elementId)
      return edge !== undefined ? <AgentflowEdgeForm edge={edge} /> : null
    }
    case 'agentflow-flow': {
      const container = projection.containers.find((c) => c.elementId === selection.elementId)
      return container !== undefined ? <AgentflowContainerForm container={container} /> : null
    }
    case 'agentflow-doc': {
      const docLine = projection.docLines.find((d) => d.elementId === selection.elementId)
      return docLine !== undefined ? <AgentflowDocLineForm docLine={docLine} /> : null
    }
    default:
      return null
  }
}

export function ProjectionSelectionForm({ projection, selection }: { projection: AnyProjection; selection: Selection | null }) {
  if (projection.type === 'flowchart') {
    return <FlowchartSelectionForm projection={projection.flowchart} selection={selection} />
  }
  if (projection.type === 'sequence') {
    return <SequenceSelectionForm projection={projection.sequence} selection={selection} />
  }
  if (projection.type === 'mindmap') {
    return <MindmapSelectionForm projection={projection.mindmap} selection={selection} />
  }
  if (projection.type === 'state') {
    return <StateSelectionForm projection={projection.state} selection={selection} />
  }
  if (projection.type === 'er') {
    return <ErSelectionForm projection={projection.er} selection={selection} />
  }
  if (projection.type === 'gitgraph') {
    return <GitgraphSelectionForm projection={projection.gitgraph} selection={selection} />
  }
  if (projection.type === 'timeline') {
    return <TimelineSelectionForm projection={projection.timeline} selection={selection} />
  }
  if (projection.type === 'kanban') {
    return <KanbanSelectionForm projection={projection.kanban} selection={selection} />
  }
  if (projection.type === 'requirement') {
    return <RequirementSelectionForm projection={projection.requirement} selection={selection} />
  }
  if (projection.type === 'journey') {
    return <JourneySelectionForm projection={projection.journey} selection={selection} />
  }
  if (projection.type === 'pie') {
    return <PieSelectionForm projection={projection.pie} selection={selection} />
  }
  if (projection.type === 'block') {
    return <BlockSelectionForm projection={projection.block} selection={selection} />
  }
  if (projection.type === 'sankey') {
    return <SankeySelectionForm projection={projection.sankey} selection={selection} />
  }
  if (projection.type === 'gantt') {
    return <GanttSelectionForm projection={projection.gantt} selection={selection} />
  }
  if (projection.type === 'quadrant') {
    return <QuadrantSelectionForm projection={projection.quadrant} selection={selection} />
  }
  if (projection.type === 'packet') {
    return <PacketSelectionForm projection={projection.packet} selection={selection} />
  }
  if (projection.type === 'xychart') {
    return <XychartSelectionForm projection={projection.xychart} selection={selection} />
  }
  if (projection.type === 'radar') {
    return <RadarSelectionForm projection={projection.radar} selection={selection} />
  }
  if (projection.type === 'architecture') {
    return <ArchitectureSelectionForm projection={projection.architecture} selection={selection} />
  }
  if (projection.type === 'treemap') {
    return <TreemapSelectionForm projection={projection.treemap} selection={selection} />
  }
  if (projection.type === 'ishikawa') {
    return <IshikawaSelectionForm projection={projection.ishikawa} selection={selection} />
  }
  if (projection.type === 'wardley') {
    return <WardleySelectionForm projection={projection.wardley} selection={selection} />
  }
  if (projection.type === 'venn') {
    return <VennSelectionForm projection={projection.venn} selection={selection} />
  }
  if (projection.type === 'cynefin') {
    return <CynefinSelectionForm projection={projection.cynefin} selection={selection} />
  }
  if (projection.type === 'usecase') {
    return <UsecaseSelectionForm projection={projection.usecase} selection={selection} />
  }
  if (projection.type === 'treeview') {
    return <TreeviewSelectionForm projection={projection.treeview} selection={selection} />
  }
  if (projection.type === 'eventmodeling') {
    return <EventModelingSelectionForm projection={projection.eventmodeling} selection={selection} />
  }
  if (projection.type === 'agentflow') {
    return <AgentflowSelectionForm projection={projection.agentflow} selection={selection} />
  }
  return <ClassSelectionForm projection={projection.class} selection={selection} />
}
