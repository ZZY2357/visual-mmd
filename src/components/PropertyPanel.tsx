import { Alert, Box, Button, Divider, ScrollArea, Stack, Text, Title } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { SourceParseError } from '../lib/mermaid-error'
import { DIAGRAM_SELECTION, resolveSelection, type FlowchartProjection, type Selection } from '../lib/projection/flowchart-projection'
import {
  resolveSequenceSelection,
  type ProjectionBlock,
  type ProjectionElse,
  type SequenceProjection,
} from '../lib/projection/sequence-projection'
import { resolveClassSelection, type ClassProjection } from '../lib/projection/class-projection'
import type { AnyProjection } from '../lib/diagram-registry'
import { useEditorStore } from '../store/editor'
import { StructureTree } from './StructureTree'
import { ClassDefForm, DiagramForm, EdgeForm, NodeForm, SubgraphForm } from './property-forms'
import { BlockForm, MessageForm, NoteForm, ParticipantForm, SequenceDiagramForm } from './sequence-forms'
import { ClassForm, ClassNoteForm, MemberForm, RelationForm } from './class-forms'
import { MindmapNodeForm } from './mindmap-forms'
import { resolveMindmapSelection, type MindmapProjection } from '../lib/projection/mindmap-projection'
import { ThemePicker } from './ThemePicker'

/**
 * 属性面板（工单 04/06）：上半为结构树、下半为选中元素属性表单。
 * 源码有语法错误时整体禁用，提示并可跳转到错误行（代码面板滚动并高亮）。
 * 图种分支按投影类型分发（工单 06，07/08 复用此模式）。
 * 元素的添加入口在画布右键菜单（工单 07），属性面板不再有「添加」按钮组。
 */

interface PropertyPanelProps {
  projection: AnyProjection | null
  parseError: SourceParseError | null
}

function FlowchartSelectionForm({
  projection,
  selection,
}: {
  projection: FlowchartProjection
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
      return <DiagramForm direction={projection.direction} />
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
          {t('app:propertyPanel.classDiagramHint')}
        </Text>
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

function resolveProjectionSelection(projection: AnyProjection, selection: Selection | null): Selection | null {
  if (projection.type === 'flowchart') return resolveSelection(projection.flowchart, selection)
  if (projection.type === 'sequence') return resolveSequenceSelection(projection.sequence, selection)
  if (projection.type === 'mindmap') return resolveMindmapSelection(projection.mindmap, selection)
  return resolveClassSelection(projection.class, selection)
}

export function PropertyPanel({ projection, parseError }: PropertyPanelProps) {
  const { t } = useTranslation()
  const selection = useEditorStore((s) => s.selection)
  const requestGotoLine = useEditorStore((s) => s.requestGotoLine)
  const disabled = parseError !== null || projection === null

  // 源码变化后选中元素可能已不存在：回落到图表级
  const effectiveSelection =
    projection !== null ? (resolveProjectionSelection(projection, selection) ?? DIAGRAM_SELECTION) : DIAGRAM_SELECTION

  return (
    <Stack gap="xs" h="100%" style={{ minHeight: 0 }} aria-label={t('app:propertyPanel.ariaLabel')}>
      <Title order={4}>{t('app:propertyPanel.title')}</Title>

      {/* 主题选择器（工单 11）：图种无关，frontmatter 手术式落码 */}
      <Box px="xs">
        <ThemePicker disabled={disabled} />
      </Box>

      {parseError !== null && (
        <Alert color="red" title={t('app:propertyPanel.disabledTitle')}>
          <Stack gap="xs">
            <Text size="sm">{t('app:propertyPanel.disabledHint')}</Text>
            {parseError.line !== null && (
              <Button size="compact-sm" variant="light" color="red" onClick={() => requestGotoLine(parseError.line as number)}>
                {t('app:propertyPanel.gotoError')}（第 {parseError.line} 行）
              </Button>
            )}
          </Stack>
        </Alert>
      )}

      <Box
        h="100%"
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          opacity: disabled ? 0.55 : undefined,
          pointerEvents: disabled ? 'none' : undefined,
        }}
      >
        {/* 上半：结构树 */}
        <ScrollArea style={{ flex: '1 1 40%', minHeight: 0 }} type="auto">
          {projection !== null && <StructureTree projection={projection} />}
        </ScrollArea>

        <Divider />

        {/* 下半：选中元素属性表单 */}
        <ScrollArea style={{ flex: '1 1 60%', minHeight: 0 }} type="auto">
          <Box px="xs" pb="md">
            {projection !== null &&
              (projection.type === 'flowchart' ? (
                <FlowchartSelectionForm projection={projection.flowchart} selection={effectiveSelection} />
              ) : projection.type === 'sequence' ? (
                <SequenceSelectionForm projection={projection.sequence} selection={effectiveSelection} />
              ) : projection.type === 'mindmap' ? (
                <MindmapSelectionForm projection={projection.mindmap} selection={effectiveSelection} />
              ) : (
                <ClassSelectionForm projection={projection.class} selection={effectiveSelection} />
              ))}
          </Box>
        </ScrollArea>
      </Box>
    </Stack>
  )
}
