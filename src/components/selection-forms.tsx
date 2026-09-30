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
import { BlockDiagramForm, BlockEdgeForm, BlockGroupForm, BlockNodeForm } from './block-forms'
import { type BlockProjection } from '../lib/projection/block-projection'

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
  return <ClassSelectionForm projection={projection.class} selection={selection} />
}
