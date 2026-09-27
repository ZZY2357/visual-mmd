import { Stack, Text, UnstyledButton } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import {
  DIAGRAM_SELECTION,
  type FlowchartProjection,
  type Selection,
  sameSelection,
} from '../lib/projection/flowchart-projection'
import { useEditorStore } from '../store/editor'

/**
 * 结构树（工单 04）：属性面板上半区，展示图中全部节点、连线、子图与样式，
 * 点击选中并定位到下半区的属性表单。
 */

function TreeItem({
  label,
  detail,
  active,
  depth,
  onSelect,
}: {
  label: string
  detail?: string
  active: boolean
  depth: number
  onSelect: () => void
}) {
  return (
    <UnstyledButton
      onClick={onSelect}
      py={4}
      px="xs"
      style={{
        display: 'block',
        width: '100%',
        borderRadius: 4,
        paddingLeft: 8 + depth * 16,
        background: active ? 'var(--mantine-color-blue-1)' : undefined,
      }}
    >
      <Text size="sm" span>
        {label}
      </Text>
      {detail !== undefined && (
        <Text size="xs" c="dimmed" span ml={6}>
          {detail}
        </Text>
      )}
    </UnstyledButton>
  )
}

export function StructureTree({ projection }: { projection: FlowchartProjection }) {
  const { t } = useTranslation()
  const selection = useEditorStore((s) => s.selection)
  const select = useEditorStore((s) => s.select)
  const is = (sel: Selection) => selection !== null && sameSelection(selection, sel)

  return (
    <Stack gap={4} aria-label={t('app:propertyPanel.structureTree')}>
      <TreeItem
        label={t('app:propertyPanel.diagram')}
        detail={projection.direction ?? 'TB'}
        active={is(DIAGRAM_SELECTION)}
        depth={0}
        onSelect={() => select(DIAGRAM_SELECTION)}
      />

      <Text size="xs" c="dimmed" mt={4} px="xs">
        {t('app:propertyPanel.nodes')}（{projection.nodes.length}）
      </Text>
      {projection.nodes.map((node) => (
        <TreeItem
          key={node.nodeId}
          label={node.text ?? node.nodeId}
          detail={node.text !== null ? node.nodeId : undefined}
          active={is({ kind: 'node', nodeId: node.nodeId })}
          depth={1}
          onSelect={() => select({ kind: 'node', nodeId: node.nodeId })}
        />
      ))}

      <Text size="xs" c="dimmed" mt={4} px="xs">
        {t('app:propertyPanel.edges')}（{projection.edges.length}）
      </Text>
      {projection.edges.map((edge) => (
        <TreeItem
          key={`${edge.from}->${edge.to}#${edge.occurrence}`}
          label={t('app:propertyPanel.edgeLabel', { from: edge.from, to: edge.to })}
          detail={edge.label ?? undefined}
          active={is({ kind: 'edge', from: edge.from, to: edge.to, occurrence: edge.occurrence })}
          depth={1}
          onSelect={() => select({ kind: 'edge', from: edge.from, to: edge.to, occurrence: edge.occurrence })}
        />
      ))}

      <Text size="xs" c="dimmed" mt={4} px="xs">
        {t('app:propertyPanel.subgraphs')}（{projection.subgraphs.length}）
      </Text>
      {projection.subgraphs.map((sg) => (
        <TreeItem
          key={sg.elementId}
          label={sg.title ?? sg.id ?? t('app:propertyPanel.unnamedSubgraph')}
          active={is({ kind: 'subgraph', elementId: sg.elementId })}
          depth={1}
          onSelect={() => select({ kind: 'subgraph', elementId: sg.elementId })}
        />
      ))}

      <Text size="xs" c="dimmed" mt={4} px="xs">
        {t('app:propertyPanel.classDefs')}（{projection.classDefs.length}）
      </Text>
      {projection.classDefs.map((cd) => (
        <TreeItem
          key={cd.name}
          label={cd.name}
          detail={cd.props.fill}
          active={is({ kind: 'classdef', name: cd.name })}
          depth={1}
          onSelect={() => select({ kind: 'classdef', name: cd.name })}
        />
      ))}
    </Stack>
  )
}
