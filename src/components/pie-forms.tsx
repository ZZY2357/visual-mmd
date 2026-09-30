import { Button, Stack, Text, TextInput } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { PieProjection, ProjectionPieSector } from '../lib/projection/pie-projection'
import {
  isPieValuePositive,
  isValidPieLabel,
  isValidPieTitle,
  type PieIntent,
} from '../lib/pipeline/pie'
import { useEditorStore } from '../store/editor'
import { useDraft } from './property-forms'

/**
 * pie 属性表单集合（more-diagrams 工单 10）：全部表单值变化都映射为编辑意图，
 * 经 store.commitIntent 走管线手术式落码（独立撤销快照）。
 * 文本类输入在失焦/回车时提交，避免逐字符快照。
 *
 * 表单是 pie 的**唯一文本编辑入口**：画布无 data-id 寻址（见 pie-adapter），
 * 双击内联编辑随之降级不做——标签/数值都在这两张表单里改。数值输入强制 >0
 * （负数是 mermaid 落码错误、零被渲染层静默过滤，工单定案）；提交的是输入原文
 * （`5` 落 `5`、`42.96` 落 `42.96`，小数风格保留）；手写源码的非法数值以原文
 * 回显在数值输入框上并提示（不假装成某个合法值，不静默改写用户源码）。
 */

function useCommit() {
  return useEditorStore((s) => s.commitIntent)
}

function clearSelection() {
  useEditorStore.getState().select(null)
}

// ---------- 图表（标题） ----------

export function PieDiagramForm({ projection }: { projection: PieProjection }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const titleDraft = useDraft(projection.title ?? '', (next) => {
    commitIntent({ type: 'set-title', text: next } satisfies PieIntent)
  })

  return (
    <Stack gap="sm">
      <TextInput
        label={t('app:propertyPanel.pieTitle')}
        placeholder={t('app:propertyPanel.pieTitle')}
        value={titleDraft.draft}
        error={isValidPieTitle(titleDraft.draft) ? undefined : t('app:propertyPanel.invalidPieTitle')}
        onChange={(e) => titleDraft.setDraft(e.currentTarget.value)}
        onBlur={titleDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') titleDraft.commit()
        }}
      />
      <Text size="xs" c="dimmed">
        {t('app:propertyPanel.pieDiagramHint')}
      </Text>
    </Stack>
  )
}

// ---------- 扇区 ----------

export function PieSectorForm({ sector }: { sector: ProjectionPieSector }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const labelDraft = useDraft(sector.label, (next) => {
    commitIntent({ type: 'set-sector-label', elementId: sector.elementId, label: next } satisfies PieIntent)
  })
  const valueDraft = useDraft(sector.valueText, (next) => {
    commitIntent({ type: 'set-sector-value', elementId: sector.elementId, value: next } satisfies PieIntent)
  })

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {sector.elementId}
      </Text>
      <TextInput
        label={t('app:propertyPanel.pieLabel')}
        value={labelDraft.draft}
        error={isValidPieLabel(labelDraft.draft) ? undefined : t('app:propertyPanel.invalidPieLabel')}
        onChange={(e) => labelDraft.setDraft(e.currentTarget.value)}
        onBlur={labelDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') labelDraft.commit()
        }}
      />
      <TextInput
        label={t('app:propertyPanel.pieValue')}
        value={valueDraft.draft}
        error={isPieValuePositive(valueDraft.draft) ? undefined : t('app:propertyPanel.invalidPieValue')}
        onChange={(e) => valueDraft.setDraft(e.currentTarget.value)}
        onBlur={valueDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') valueDraft.commit()
        }}
      />
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-sector', elementId: sector.elementId } satisfies PieIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deletePieSector')}
      </Button>
    </Stack>
  )
}
