import { Alert, Box, Stack, Text, Title } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { MermaidPreview } from '../lib/use-mermaid-preview'
import { useEditorStore } from '../store/editor'

/**
 * 画布（中间）：展示 mermaid 实时渲染的预览。
 * 渲染逻辑在 useMermaidPreview 中；出错时本组件只是不换掉旧 SVG（冻结）。
 * 点击渲染 SVG 中带 data-id 的节点可选中（ADR-0007 的事实约定，尽力而为）。
 */

interface CanvasPanelProps {
  preview: MermaidPreview
}

export function CanvasPanel({ preview }: CanvasPanelProps) {
  const { t } = useTranslation()
  const select = useEditorStore((s) => s.select)
  const { svg, error } = preview

  return (
    <Stack gap="xs" h="100%" style={{ minHeight: 0 }}>
      <Title order={4}>{t('canvas.title')}</Title>
      {error !== null && (
        <Alert color="red" title={t('canvas.errorTitle')}>
          <Text size="sm">{error.message}</Text>
        </Alert>
      )}
      <Box
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
        onClick={(e) => {
          // 尽力而为的节点选中：mermaid 渲染的节点 <g> 带 data-id（ADR-0007）
          const target = (e.target as HTMLElement).closest('[data-id]')
          const nodeId = target?.getAttribute('data-id')
          if (nodeId) select({ kind: 'node', nodeId })
        }}
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
