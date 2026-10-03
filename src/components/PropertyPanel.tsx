import { Alert, Box, Button, Divider, ScrollArea, Stack, Text, Title } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { SourceParseError } from '../lib/mermaid-error'
import { DIAGRAM_SELECTION } from '../lib/projection/selection'
import type { AnyProjection } from '../lib/diagram-registry'
import { capabilitiesOf } from '../lib/canvas-selection/capabilities'
import { useEditorStore } from '../store/editor'
import { StructureTree } from './StructureTree'
import { ProjectionSelectionForm } from './selection-forms'
import { ThemePicker } from './ThemePicker'

/**
 * 属性面板（工单 04/06）：上半为结构树、下半为选中元素属性表单。
 * 源码有语法错误时整体禁用，提示并可跳转到错误行（代码面板滚动并高亮）。
 * 选中元素的属性表单按投影图种分发（已迁往 selection-forms.tsx，工单 04-bundle）。
 * 元素的添加入口在画布右键菜单（工单 07），属性面板不再有「添加」按钮组。
 */

interface PropertyPanelProps {
  projection: AnyProjection | null
  parseError: SourceParseError | null
  /** unsupported 态（more-diagrams 工单 01）：源码不属于任何已注册图种——
   * mermaid 预览与源码编辑照常，结构树/属性表单降级为占位提示 */
  unsupported?: boolean
}

export function PropertyPanel({ projection, parseError, unsupported = false }: PropertyPanelProps) {
  const { t } = useTranslation()
  const selection = useEditorStore((s) => s.selection)
  const requestGotoLine = useEditorStore((s) => s.requestGotoLine)
  const disabled = parseError !== null || projection === null

  // 源码变化后选中元素可能已不存在：经能力包 resolveSelection 回落到图表级（工单 04，ADR-0015）
  const caps = projection !== null ? capabilitiesOf(projection) : null
  const effectiveSelection =
    caps !== null && projection !== null
      ? (caps.resolveSelection(projection, selection) ?? DIAGRAM_SELECTION)
      : DIAGRAM_SELECTION

  return (
    <Stack gap="xs" h="100%" style={{ minHeight: 0 }} aria-label={t('app:propertyPanel.ariaLabel')}>
      <Title order={4}>{t('app:propertyPanel.title')}</Title>

      {/* 主题选择器（工单 11）：图种无关，frontmatter 手术式落码 */}
      <Box px="xs">
        <ThemePicker disabled={disabled} />
      </Box>

      {unsupported && parseError === null && (
        <Alert color="yellow" title={t('app:propertyPanel.unsupportedTitle')}>
          <Text size="sm">{t('app:propertyPanel.unsupportedHint')}</Text>
        </Alert>
      )}

      {parseError !== null && (
        <Alert color="red" title={t('app:propertyPanel.disabledTitle')}>
          <Stack gap="xs">
            <Text size="sm">{t('app:propertyPanel.disabledHint')}</Text>
            {parseError.line !== null && (
              <Button size="compact-sm" variant="light" color="red" onClick={() => requestGotoLine(parseError.line as number)}>
                {t('app:propertyPanel.gotoErrorLine', { line: parseError.line })}
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
            {projection !== null && (
              <ProjectionSelectionForm projection={projection} selection={effectiveSelection} />
            )}
          </Box>
        </ScrollArea>
      </Box>
    </Stack>
  )
}
