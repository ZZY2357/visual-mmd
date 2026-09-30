import { Button, Group, Select, Stack, Text, TextInput } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type {
  ProjectionTimelineEvent,
  ProjectionTimelinePeriod,
  ProjectionTimelineSection,
  TimelineProjection,
} from '../lib/projection/timeline-projection'
import {
  TIMELINE_DIRECTIONS,
  isValidTimelineEventText,
  isValidTimelinePeriodText,
  isValidTimelineSectionName,
  type TimelineIntent,
} from '../lib/pipeline/timeline'
import { useEditorStore } from '../store/editor'
import { useDraft } from './property-forms'

/**
 * timeline 属性表单集合（more-diagrams 工单 05）：全部表单值变化都映射为编辑意图，
 * 经 store.commitIntent 走管线手术式落码（独立撤销快照）。
 * 文本类输入在失焦/回车时提交，避免逐字符快照。
 *
 * 表单是 timeline 的**唯一文本编辑入口**：画布无 data-id 寻址（见 timeline-adapter），
 * 双击内联编辑不做——时期/事件的文本都在这三张表单里改。
 */

function useCommit() {
  return useEditorStore((s) => s.commitIntent)
}

function clearSelection() {
  useEditorStore.getState().select(null)
}

// ---------- 图表（标题 + 方向） ----------

/** 「跟随 Mermaid 默认（不设置方向）」的哨兵值（不是方向 token，仅用于 Select 选项） */
const FOLLOW_DIRECTION_VALUE = '__follow__'

export function TimelineDiagramForm({ projection }: { projection: TimelineProjection }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const titleDraft = useDraft(projection.title ?? '', (next) => {
    commitIntent({ type: 'set-title', text: next } satisfies TimelineIntent)
  })
  // 手写方向：不在 LR/TD 里 → 如实回显原文（mermaid 会忽略并回退默认），不假装成某个值
  const unknownRaw =
    projection.direction !== null && !(TIMELINE_DIRECTIONS as readonly string[]).includes(projection.direction)
      ? projection.direction
      : null

  return (
    <Stack gap="sm">
      <TextInput
        label={t('app:propertyPanel.timelineTitle')}
        placeholder={t('app:propertyPanel.timelineTitle')}
        value={titleDraft.draft}
        onChange={(e) => titleDraft.setDraft(e.currentTarget.value)}
        onBlur={titleDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') titleDraft.commit()
        }}
      />
      <Select
        label={t('app:propertyPanel.timelineDirection')}
        data={[
          { value: FOLLOW_DIRECTION_VALUE, label: t('app:timelineDirections.followDefault') },
          ...TIMELINE_DIRECTIONS.map((d) => ({ value: d, label: t(`app:timelineDirections.${d}`) })),
          ...(unknownRaw === null ? [] : [{ value: unknownRaw, label: unknownRaw }]),
        ]}
        value={projection.direction ?? FOLLOW_DIRECTION_VALUE}
        onChange={(v) => {
          if (v === null) return
          const next = v === FOLLOW_DIRECTION_VALUE ? null : v
          if (next === projection.direction) return
          commitIntent({ type: 'set-direction', direction: next } satisfies TimelineIntent)
        }}
        allowDeselect={false}
      />
    </Stack>
  )
}

// ---------- 时期 ----------

export function TimelinePeriodForm({ period }: { period: ProjectionTimelinePeriod }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const textDraft = useDraft(period.text, (next) => {
    commitIntent({ type: 'set-period-text', elementId: period.elementId, text: next } satisfies TimelineIntent)
  })

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.timelinePeriodOwner', { section: period.sectionName ?? '—' })} · {period.elementId}
      </Text>
      <TextInput
        label={t('app:propertyPanel.timelinePeriodText')}
        value={textDraft.draft}
        error={
          isValidTimelinePeriodText(textDraft.draft) ? undefined : t('app:propertyPanel.invalidTimelinePeriodText')
        }
        onChange={(e) => textDraft.setDraft(e.currentTarget.value)}
        onBlur={textDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') textDraft.commit()
        }}
      />
      <Text size="xs" c="dimmed">
        {t('app:propertyPanel.timelineEventsCount', { count: period.events.length })}
      </Text>
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-period', elementId: period.elementId } satisfies TimelineIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteTimelinePeriod')}
      </Button>
    </Stack>
  )
}

// ---------- 事件 ----------

export function TimelineEventForm({ event }: { event: ProjectionTimelineEvent }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const textDraft = useDraft(event.text, (next) => {
    commitIntent({ type: 'set-event-text', elementId: event.elementId, text: next } satisfies TimelineIntent)
  })

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.timelineEventOwner', { period: event.periodElementId })} · {event.elementId}
      </Text>
      <TextInput
        label={t('app:propertyPanel.timelineEventText')}
        value={textDraft.draft}
        error={
          isValidTimelineEventText(textDraft.draft) ? undefined : t('app:propertyPanel.invalidTimelineEventText')
        }
        onChange={(e) => textDraft.setDraft(e.currentTarget.value)}
        onBlur={textDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') textDraft.commit()
        }}
      />
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-event', elementId: event.elementId } satisfies TimelineIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteTimelineEvent')}
      </Button>
    </Stack>
  )
}

// ---------- 分组 ----------

export function TimelineSectionForm({ section }: { section: ProjectionTimelineSection }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const nameDraft = useDraft(section.name, (next) => {
    commitIntent({ type: 'set-section-name', elementId: section.elementId, name: next } satisfies TimelineIntent)
  })

  return (
    <Stack gap="sm">
      <Group gap="xs">
        <Text size="sm" c="dimmed">
          {section.elementId}
        </Text>
      </Group>
      <TextInput
        label={t('app:propertyPanel.timelineSectionName')}
        value={nameDraft.draft}
        error={
          isValidTimelineSectionName(nameDraft.draft) ? undefined : t('app:propertyPanel.invalidTimelineSectionName')
        }
        onChange={(e) => nameDraft.setDraft(e.currentTarget.value)}
        onBlur={nameDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') nameDraft.commit()
        }}
      />
    </Stack>
  )
}
