import { useState } from 'react'
import { Alert, Box, Button, Divider, Group, ScrollArea, Stack, Text, Title } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { SourceParseError } from '../lib/mermaid-error'
import { DIAGRAM_SELECTION, resolveSelection, type FlowchartProjection, type Selection } from '../lib/projection/flowchart-projection'
import { useEditorStore } from '../store/editor'
import { StructureTree } from './StructureTree'
import {
  AddClassDefInlineForm,
  AddEdgeInlineForm,
  AddNodeInlineForm,
  AddSubgraphInlineForm,
  ClassDefForm,
  DiagramForm,
  EdgeForm,
  NodeForm,
  SubgraphForm,
} from './property-forms'

/**
 * 属性面板（工单 04）：上半为结构树、下半为选中元素属性表单。
 * 源码有语法错误时整体禁用，提示并可跳转到错误行（代码面板滚动并高亮）。
 */

type AddKind = 'node' | 'edge' | 'subgraph' | 'classdef' | null

interface PropertyPanelProps {
  projection: FlowchartProjection | null
  parseError: SourceParseError | null
}

function SelectionForm({ projection, selection }: { projection: FlowchartProjection; selection: Selection | null }) {
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
      return node !== undefined ? <NodeForm node={node} /> : null
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
  }
}

export function PropertyPanel({ projection, parseError }: PropertyPanelProps) {
  const { t } = useTranslation()
  const selection = useEditorStore((s) => s.selection)
  const requestGotoLine = useEditorStore((s) => s.requestGotoLine)
  const [addKind, setAddKind] = useState<AddKind>(null)
  const disabled = parseError !== null || projection === null

  // 源码变化后选中元素可能已不存在：回落到图表级
  const effectiveSelection =
    projection !== null ? (resolveSelection(projection, selection) ?? DIAGRAM_SELECTION) : DIAGRAM_SELECTION

  return (
    <Stack gap="xs" h="100%" style={{ minHeight: 0 }} aria-label={t('app:propertyPanel.ariaLabel')}>
      <Title order={4}>{t('app:propertyPanel.title')}</Title>

      {parseError !== null && (
        <Alert color="red" title={t('app:propertyPanel.disabledTitle')}>
          <Stack gap="xs">
            <Text size="sm">{t('app:propertyPanel.disabledHint')}</Text>
            {parseError.line !== null && (
              <Button
                size="compact-sm"
                variant="light"
                color="red"
                onClick={() => requestGotoLine(parseError.line as number)}
              >
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

        {/* 添加元素 */}
        {projection !== null && (
          <Box px="xs">
            <Group gap="xs">
              {(
                [
                  ['node', t('app:propertyPanel.addNodeTitle')],
                  ['edge', t('app:propertyPanel.addEdgeTitle')],
                  ['subgraph', t('app:propertyPanel.addSubgraphTitle')],
                  ['classdef', t('app:propertyPanel.addClassDefTitle')],
                ] as const
              ).map(([kind, label]) => (
                <Button
                  key={kind}
                  size="compact-xs"
                  variant={addKind === kind ? 'light' : 'default'}
                  onClick={() => setAddKind(addKind === kind ? null : kind)}
                >
                  + {label}
                </Button>
              ))}
            </Group>
            {addKind === 'node' && <AddNodeInlineForm onDone={() => setAddKind(null)} />}
            {addKind === 'edge' && (
              <AddEdgeInlineForm nodes={projection.nodes} onDone={() => setAddKind(null)} />
            )}
            {addKind === 'subgraph' && <AddSubgraphInlineForm onDone={() => setAddKind(null)} />}
            {addKind === 'classdef' && <AddClassDefInlineForm onDone={() => setAddKind(null)} />}
          </Box>
        )}

        {/* 下半：选中元素属性表单 */}
        <ScrollArea style={{ flex: '1 1 60%', minHeight: 0 }} type="auto">
          <Box px="xs" pb="md">
            {projection !== null && <SelectionForm projection={projection} selection={effectiveSelection} />}
          </Box>
        </ScrollArea>
      </Box>
    </Stack>
  )
}
