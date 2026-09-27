import { Alert, Box, Stack, Text, Title } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { MermaidPreview } from '../lib/use-mermaid-preview'
import { flowchartDataIdResolver, toEditorSelection } from '../lib/canvas-selection/flowchart-adapter'
import { useCanvasSelection } from '../lib/canvas-selection/use-canvas-selection'
import type { FlowchartProjection } from '../lib/projection/flowchart-projection'
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
  projection: FlowchartProjection | null
}

export function CanvasPanel({ preview, projection }: CanvasPanelProps) {
  const { t } = useTranslation()
  const select = useEditorStore((s) => s.select)
  const selection = useEditorStore((s) => s.selection)
  const { svg, error } = preview

  const { containerRef, onClick } = useCanvasSelection({
    svg,
    resolver: projection !== null ? flowchartDataIdResolver(projection) : null,
    selectedDataId: selection !== null && selection.kind === 'node' ? selection.nodeId : null,
    onSelect: (canvasSelection) => select(toEditorSelection(canvasSelection)),
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
