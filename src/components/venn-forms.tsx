import { Button, Stack, Text, TextInput } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { ProjectionVennArea, VennProjection } from '../lib/projection/venn-projection'
import { isValidVennLabel, isValidVennSize, type VennIntent } from '../lib/pipeline/venn'
import { useEditorStore } from '../store/editor'
import { useDraft } from './property-forms'

/**
 * venn 属性表单集合（more-diagrams 工单 21）：全部表单值变化都映射为编辑意图，
 * 经 store.commitIntent 走管线手术式落码（独立撤销快照）。
 * 文本类输入在失焦/回车时提交，避免逐字符快照。
 *
 * 颜色图例说明：集合 / 交集都渲染同一张区域表单（标签 + 尺寸 + 删除），
 * 用 `elementId` 定点寻址（`venn-set:<id>` / `venn-union:N`）。尺寸为空 = 删除尺寸段；
 * 标签为空 = 删除标签段（意图的 null 语义；表单用空串表达）。标签/replaces 引号由
 * 解析器按原有引号风格补齐（research §8：title 引号不剥离——title 表单提交原文）。
 */

function useCommit() {
  return useEditorStore((s) => s.commitIntent)
}

function clearSelection() {
  useEditorStore.getState().select(null)
}

// ---------- 图表（标题） ----------

export function VennDiagramForm({ projection }: { projection: VennProjection }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  // title 引号不剥离（research 坑 6）：提交原文即原样，空串 = 清空标题行
  const titleDraft = useDraft(projection.title ?? '', (next) => {
    commitIntent({ type: 'set-title', text: next } satisfies VennIntent)
  })

  return (
    <Stack gap="sm">
      <TextInput
        label={t('app:propertyPanel.vennTitle')}
        placeholder={t('app:propertyPanel.vennTitle')}
        value={titleDraft.draft}
        onChange={(e) => titleDraft.setDraft(e.currentTarget.value)}
        onBlur={titleDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') titleDraft.commit()
        }}
      />
      <Text size="xs" c="dimmed">
        {t('app:propertyPanel.vennDiagramHint')}
      </Text>
    </Stack>
  )
}

// ---------- 区域（集合 / 交集共用） ----------

export function VennAreaForm({ area }: { area: ProjectionVennArea }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const labelDraft = useDraft(area.label ?? '', (next) => {
    const trimmed = next.trim()
    if (trimmed !== '' && !isValidVennLabel(trimmed)) return
    commitIntent({
      type: 'set-label',
      elementId: area.elementId,
      label: trimmed === '' ? null : trimmed,
    } satisfies VennIntent)
  })
  const sizeDraft = useDraft(area.sizeText ?? '', (next) => {
    const trimmed = next.trim()
    if (trimmed !== '' && !isValidVennSize(trimmed)) return
    commitIntent({
      type: 'set-size',
      elementId: area.elementId,
      size: trimmed === '' ? null : trimmed,
    } satisfies VennIntent)
  })

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {area.kind === 'set'
          ? t('app:propertyPanel.vennSetHint', { id: area.ids[0] })
          : t('app:propertyPanel.vennUnionHint', { ids: area.ids.join(', ') })}
      </Text>
      <TextInput
        label={t('app:propertyPanel.vennLabel')}
        value={labelDraft.draft}
        error={
          labelDraft.draft.trim() === '' || isValidVennLabel(labelDraft.draft.trim())
            ? undefined
            : t('app:propertyPanel.invalidVennLabel')
        }
        onChange={(e) => labelDraft.setDraft(e.currentTarget.value)}
        onBlur={labelDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') labelDraft.commit()
        }}
      />
      <TextInput
        label={t('app:propertyPanel.vennSize')}
        description={t('app:propertyPanel.vennSizeHint')}
        value={sizeDraft.draft}
        error={
          sizeDraft.draft.trim() === '' || isValidVennSize(sizeDraft.draft.trim())
            ? undefined
            : t('app:propertyPanel.invalidVennSize')
        }
        onChange={(e) => sizeDraft.setDraft(e.currentTarget.value)}
        onBlur={sizeDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') sizeDraft.commit()
        }}
      />
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-area', elementId: area.elementId } satisfies VennIntent)) {
            clearSelection()
          }
        }}
      >
        {area.kind === 'set'
          ? t('app:propertyPanel.deleteVennSet')
          : t('app:propertyPanel.deleteVennUnion')}
      </Button>
    </Stack>
  )
}
