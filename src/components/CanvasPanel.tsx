import { Alert, Box, Stack, Text, Title } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { MermaidPreview } from '../lib/use-mermaid-preview'
import { flowchartDataIdResolver, toEditorSelection } from '../lib/canvas-selection/flowchart-adapter'
import type { CanvasSelection, DataIdResolver } from '../lib/canvas-selection/data-id'
import { nodeDataIdResolver } from '../lib/canvas-selection/data-id'
import type { Selection } from '../lib/projection/selection'
import { useCanvasSelection } from '../lib/canvas-selection/use-canvas-selection'
import type { AnyProjection } from '../lib/diagram-registry'
import { useEditorStore } from '../store/editor'

/**
 * 画布（中间）：展示 mermaid 实时渲染的预览。
 * 渲染逻辑在 useMermaidPreview 中；出错时本组件只是不换掉旧 SVG（冻结）。
 *
 * 画布选中（工单 05）：点击渲染 SVG 中带 data-id 的元素选中（ADR-0007 事实约定）。
 * 匹配与高亮是图种无关的通用能力（src/lib/canvas-selection/），flowchart 经
 * flowchartDataIdResolver 适配；data-id 无法匹配时安静地不选中，不崩溃。
 */

interface CanvasPanelProps {
  preview: MermaidPreview
  projection: AnyProjection | null
}

/** 图种 → data-id resolver（工单 06）：flowchart 全套适配；sequence 参与者的 data-id 即 actorId */
function resolverOf(projection: AnyProjection): DataIdResolver {
  if (projection.type === 'flowchart') return flowchartDataIdResolver(projection.flowchart)
  return nodeDataIdResolver(projection.sequence.participants.map((p) => p.actorId))
}

/** 图种无关的画布选中 → 编辑器选中 */
function canvasToEditorSelection(projection: AnyProjection, canvasSelection: CanvasSelection): Selection | null {
  if (projection.type === 'flowchart') return toEditorSelection(canvasSelection)
  if (canvasSelection.kind === 'node') return { kind: 'participant', actorId: canvasSelection.id }
  return null
}

/** 当前编辑器选中对应的 data-id（高亮用） */
function selectedDataIdOf(selection: Selection): string | null {
  switch (selection.kind) {
    case 'node':
      return selection.nodeId
    case 'participant':
      return selection.actorId
    default:
      return null
  }
}

export function CanvasPanel({ preview, projection }: CanvasPanelProps) {
  const { t } = useTranslation()
  const select = useEditorStore((s) => s.select)
  const selection = useEditorStore((s) => s.selection)
  const { svg, error } = preview

  const { containerRef, onClick } = useCanvasSelection({
    svg,
    resolver: projection !== null ? resolverOf(projection) : null,
    selectedDataId: selection !== null ? selectedDataIdOf(selection) : null,
    onSelect: (canvasSelection) => {
      if (projection !== null) {
        const editorSelection = canvasToEditorSelection(projection, canvasSelection)
        if (editorSelection !== null) select(editorSelection)
      }
    },
  })

  return (
    <Stack gap="xs" h="100%" style={{ minHeight: 0 }}>
      <Title order={4}>{t('canvas.title')}</Title>
      <Text size="xs" c="dimmed">
        {t('canvas.keyboardHint')}
      </Text>
      {error !== null && (
        <Alert color="red" title={t('canvas.errorTitle')}>
          <Text size="sm">{error.message}</Text>
        </Alert>
      )}
      <Box
        ref={containerRef}
        h="100%"
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          background: 'var(--mantine-color-gray-0)',
          borderRadius: 'var(--mantine-radius-sm)',
        }}
        onClick={onClick}
      >
        {svg === null ? (
          <Text c="dimmed" mt="xl">
            {error === null ? t('canvas.emptySource') : error.message}
          </Text>
        ) : (
          <Box
            style={{ padding: 16, width: '100%' }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}
      </Box>
    </Stack>
  )
}
