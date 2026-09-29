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
import { DIRECTIONS } from '../lib/pipeline/flowchart'
import { setDirectionIntent } from '../lib/editing/flowchart-forms'
import { setClassDirectionIntent } from '../lib/editing/class-forms'
import { useEditorStore } from '../store/editor'
import type { AnyProjection } from '../lib/diagram-registry'
import { DiagramForm, EdgeForm, ClassDefForm, NodeForm, SubgraphForm } from './property-forms'
import { BlockForm, MessageForm, NoteForm, ParticipantForm, SequenceDiagramForm, SequenceRegionForm } from './sequence-forms'
import { ClassForm, ClassNoteForm, MemberForm, NamespaceForm, RelationForm } from './class-forms'
import { MindmapNodeForm } from './mindmap-forms'

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
  return <ClassSelectionForm projection={projection.class} selection={selection} />
}
