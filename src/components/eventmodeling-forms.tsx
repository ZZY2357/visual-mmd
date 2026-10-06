import { Button, Select, Stack, Text, TextInput } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type {
  EventModelingProjection,
  ProjectionEmData,
  ProjectionEmFrame,
} from '../lib/projection/eventmodeling-projection'
import {
  EM_ENTITY_TYPES,
  isValidEmDataName,
  isValidEmEntityIdentifier,
  isValidEmFrameId,
  isEmEntityType,
  type EventModelingIntent,
} from '../lib/pipeline/eventmodeling'
import { useEditorStore } from '../store/editor'
import { useDraft } from './property-forms'

/**
 * eventmodeling 属性表单集合（more-diagrams 工单 28）：全部表单值变化都映射为编辑意图，
 * 经 store.commitIntent 走管线手术式落码（独立撤销快照）。文本类输入在失焦/回车时提交，
 * 避免逐字符快照。
 *
 * **画布 DOM 无 data-id（research §4/§8.3 实测降级）**：帧 / 数据块不做双击内联编辑，
 * 全部在结构树选中后于这些表单里改；帧表单涵盖帧号 / 实体类型 / 实体标识 / 显式来源 /
 * 数据块引用，数据块表单可改名（块体逐字保留）。派生连线（默认推断关系，无源码语句）
 * 只读，无表单可编。结构树 + 这些表单是完整编辑入口。
 */

function clearSelection() {
  useEditorStore.getState().select(null)
}

const ENTITY_TYPE_OPTIONS = EM_ENTITY_TYPES.map((type) => ({ value: type, label: type }))

/** 逗号分隔的来源帧号串 ↔ 帧号数组（空串 = 默认推断） */
function parseSourceFrames(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
}

/** 帧表单：改帧号 / 实体类型 / 实体标识 / 显式来源帧 / 数据块引用 + 删除帧 */
export function EventModelingFrameForm({ frame }: { frame: ProjectionEmFrame }) {
  const t = useTranslation().t
  const commitIntent = useEditorStore((s) => s.commitIntent)

  const frameIdDraft = useDraft(frame.frameId, (next) => {
    if (next === frame.frameId || !isValidEmFrameId(next)) return
    commitIntent({ type: 'set-em-frame', elementId: frame.elementId, frameId: next } satisfies EventModelingIntent)
  })
  const identifierDraft = useDraft(frame.entityIdentifier, (next) => {
    if (next === frame.entityIdentifier || !isValidEmEntityIdentifier(next)) return
    commitIntent({
      type: 'set-em-frame',
      elementId: frame.elementId,
      entityIdentifier: next,
    } satisfies EventModelingIntent)
  })
  const sourceDraft = useDraft(frame.sourceFrames.join(', '), (next) => {
    const frames = parseSourceFrames(next)
    if (frames.join(',') === frame.sourceFrames.join(',')) return
    commitIntent({
      type: 'set-em-frame',
      elementId: frame.elementId,
      sourceFrames: frames,
    } satisfies EventModelingIntent)
  })
  const dataRefDraft = useDraft(frame.dataReference ?? '', (next) => {
    const value = next.trim() === '' ? null : next.trim()
    if (value === frame.dataReference) return
    if (value !== null && !isValidEmDataName(value)) return
    commitIntent({
      type: 'set-em-frame',
      elementId: frame.elementId,
      dataReference: value,
    } satisfies EventModelingIntent)
  })

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.emFrameHint', {
          frameId: frame.frameId,
          type: t(`app:propertyPanel.emEntityTypes.${frame.group}`),
        })}
      </Text>
      <TextInput
        label={t('app:propertyPanel.emFrameId')}
        value={frameIdDraft.draft}
        description={t('app:propertyPanel.emFrameIdHint')}
        error={isValidEmFrameId(frameIdDraft.draft) ? undefined : t('app:propertyPanel.invalidUsecaseId')}
        onChange={(e) => frameIdDraft.setDraft(e.currentTarget.value)}
        onBlur={frameIdDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') frameIdDraft.commit()
        }}
      />
      <Select
        label={t('app:propertyPanel.emEntityType')}
        data={ENTITY_TYPE_OPTIONS}
        value={frame.entityType}
        onChange={(value) => {
          if (value === null || !isEmEntityType(value) || value === frame.entityType) return
          commitIntent({
            type: 'set-em-frame',
            elementId: frame.elementId,
            entityType: value,
          } satisfies EventModelingIntent)
        }}
      />
      <TextInput
        label={t('app:propertyPanel.emEntityIdentifier')}
        value={identifierDraft.draft}
        description={t('app:propertyPanel.emEntityIdentifierHint')}
        error={
          isValidEmEntityIdentifier(identifierDraft.draft)
            ? undefined
            : t('app:propertyPanel.invalidUsecaseId')
        }
        onChange={(e) => identifierDraft.setDraft(e.currentTarget.value)}
        onBlur={identifierDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') identifierDraft.commit()
        }}
      />
      <TextInput
        label={t('app:propertyPanel.emSourceFrames')}
        value={sourceDraft.draft}
        description={t('app:propertyPanel.emSourceFramesHint')}
        onChange={(e) => sourceDraft.setDraft(e.currentTarget.value)}
        onBlur={sourceDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') sourceDraft.commit()
        }}
      />
      <TextInput
        label={t('app:propertyPanel.emDataReference')}
        value={dataRefDraft.draft}
        description={t('app:propertyPanel.emDataReferenceHint')}
        error={
          dataRefDraft.draft.trim() !== '' && !isValidEmDataName(dataRefDraft.draft.trim())
            ? t('app:propertyPanel.invalidUsecaseId')
            : undefined
        }
        onChange={(e) => dataRefDraft.setDraft(e.currentTarget.value)}
        onBlur={dataRefDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') dataRefDraft.commit()
        }}
      />
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-em-frame', elementId: frame.elementId } satisfies EventModelingIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteEmFrame')}
      </Button>
    </Stack>
  )
}

/** 数据块表单：改名字（块体逐字保留）+ 删除整块 */
export function EventModelingDataForm({ block }: { block: ProjectionEmData }) {
  const t = useTranslation().t
  const commitIntent = useEditorStore((s) => s.commitIntent)
  const nameDraft = useDraft(block.name, (next) => {
    if (next === block.name || !isValidEmDataName(next)) return
    commitIntent({ type: 'set-em-data-name', elementId: block.elementId, name: next } satisfies EventModelingIntent)
  })

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.emDataHint', { name: block.name })}
      </Text>
      <TextInput
        label={t('app:propertyPanel.emDataName')}
        value={nameDraft.draft}
        description={t('app:propertyPanel.emDataNameHint')}
        error={isValidEmDataName(nameDraft.draft) ? undefined : t('app:propertyPanel.invalidUsecaseId')}
        onChange={(e) => nameDraft.setDraft(e.currentTarget.value)}
        onBlur={nameDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') nameDraft.commit()
        }}
      />
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-em-data', elementId: block.elementId } satisfies EventModelingIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteEmData')}
      </Button>
    </Stack>
  )
}

/** eventmodeling 图表级表单：概览计数 + 提示（加帧 / 加数据块走结构树 / 右键动作） */
export function EventModelingDiagramForm({ projection }: { projection: EventModelingProjection }) {
  const t = useTranslation().t
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.emDiagramHint', {
          frames: projection.frames.length,
          data: projection.dataBlocks.length,
          relations: projection.relations.length,
        })}
      </Text>
    </Stack>
  )
}
