import { Button, Group, Select, Stack, Text, TextInput } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type {
  ProjectionJourneySection,
  ProjectionJourneyTask,
  JourneyProjection,
} from '../lib/projection/journey-projection'
import {
  JOURNEY_SCORES,
  isValidJourneyActor,
  isValidJourneySectionName,
  isValidJourneyTaskName,
  type JourneyIntent,
} from '../lib/pipeline/journey'
import { useEditorStore } from '../store/editor'
import { useDraft } from './property-forms'

/**
 * journey 属性表单集合（more-diagrams 工单 08）：全部表单值变化都映射为编辑意图，
 * 经 store.commitIntent 走管线手术式落码（独立撤销快照）。
 * 文本类输入在失焦/回车时提交，避免逐字符快照。
 *
 * 表单是 journey 的**唯一文本编辑入口**：画布无 data-id 寻址（见 journey-adapter），
 * 双击内联编辑随之降级不做——任务名/section 名/score/actors 都在这三张表单里改。
 * score 用 1–5 整数选择器（表单不可能产出越界值）；手写源码的越界 score 以原文
 * 回显在禁用的额外选项上（不假装成某个合法值，与 timeline 方向的 unknownRaw 同口径）。
 */

function useCommit() {
  return useEditorStore((s) => s.commitIntent)
}

function clearSelection() {
  useEditorStore.getState().select(null)
}

// ---------- 图表（标题） ----------

export function JourneyDiagramForm({ projection }: { projection: JourneyProjection }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const titleDraft = useDraft(projection.title ?? '', (next) => {
    commitIntent({ type: 'set-title', text: next } satisfies JourneyIntent)
  })

  return (
    <Stack gap="sm">
      <TextInput
        label={t('app:propertyPanel.journeyTitle')}
        placeholder={t('app:propertyPanel.journeyTitle')}
        value={titleDraft.draft}
        error={isValidJourneyTaskName(titleDraft.draft) ? undefined : t('app:propertyPanel.invalidJourneyTitle')}
        onChange={(e) => titleDraft.setDraft(e.currentTarget.value)}
        onBlur={titleDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') titleDraft.commit()
        }}
      />
      <Text size="xs" c="dimmed">
        {t('app:propertyPanel.journeyDiagramHint')}
      </Text>
    </Stack>
  )
}

// ---------- 任务 ----------

export function JourneyTaskForm({ task }: { task: ProjectionJourneyTask }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const nameDraft = useDraft(task.name, (next) => {
    commitIntent({ type: 'set-task-name', elementId: task.elementId, name: next } satisfies JourneyIntent)
  })
  const actorsDraft = useDraft(task.actors.join(', '), (next) => {
    const actors = next
      .split(',')
      .map((a) => a.trim())
      .filter((a) => a !== '')
    commitIntent({ type: 'set-task-actors', elementId: task.elementId, actors } satisfies JourneyIntent)
  })

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.journeyTaskOwner', {
          section: task.sectionElementId ?? t('app:propertyPanel.journeyUngrouped'),
        })}{' '}
        · {task.elementId}
      </Text>
      <TextInput
        label={t('app:propertyPanel.journeyTaskName')}
        value={nameDraft.draft}
        error={isValidJourneyTaskName(nameDraft.draft) ? undefined : t('app:propertyPanel.invalidJourneyTaskName')}
        onChange={(e) => nameDraft.setDraft(e.currentTarget.value)}
        onBlur={nameDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') nameDraft.commit()
        }}
      />
      <Select
        label={t('app:propertyPanel.journeyScore')}
        data={[
          ...JOURNEY_SCORES.map((s) => ({ value: String(s), label: `${s}` })),
          // 手写源码的越界/非数字 score：原文回显在额外选项上（mermaid 按宽松 Number 渲染，
          // 面孔位置可能异常），不静默改写用户源码——改写只能显式选择一个 1–5 值
          ...(task.scoreInRange ? [] : [{ value: task.scoreText, label: task.scoreText }]),
        ]}
        value={task.scoreText}
        onChange={(v) => {
          if (v === null) return
          const score = Number(v)
          if (!Number.isInteger(score) || score === task.score) return
          commitIntent({ type: 'set-task-score', elementId: task.elementId, score } satisfies JourneyIntent)
        }}
        allowDeselect={false}
      />
      <TextInput
        label={t('app:propertyPanel.journeyActors')}
        description={t('app:propertyPanel.journeyActorsHint')}
        value={actorsDraft.draft}
        error={
          actorsDraft.draft
            .split(',')
            .every((a) => a.trim() === '' || isValidJourneyActor(a))
            ? undefined
            : t('app:propertyPanel.invalidJourneyActors')
        }
        onChange={(e) => actorsDraft.setDraft(e.currentTarget.value)}
        onBlur={actorsDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') actorsDraft.commit()
        }}
      />
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-task', elementId: task.elementId } satisfies JourneyIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteJourneyTask')}
      </Button>
    </Stack>
  )
}

// ---------- 分组 ----------

export function JourneySectionForm({ section }: { section: ProjectionJourneySection }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const nameDraft = useDraft(section.name, (next) => {
    commitIntent({ type: 'set-section-name', elementId: section.elementId, name: next } satisfies JourneyIntent)
  })

  return (
    <Stack gap="sm">
      <Group gap="xs">
        <Text size="sm" c="dimmed">
          {section.elementId}
        </Text>
      </Group>
      <TextInput
        label={t('app:propertyPanel.journeySectionName')}
        value={nameDraft.draft}
        error={
          isValidJourneySectionName(nameDraft.draft) ? undefined : t('app:propertyPanel.invalidJourneySectionName')
        }
        onChange={(e) => nameDraft.setDraft(e.currentTarget.value)}
        onBlur={nameDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') nameDraft.commit()
        }}
      />
      <Text size="xs" c="dimmed">
        {t('app:propertyPanel.journeyTasksCount', { count: section.tasks.length })}
      </Text>
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-section', elementId: section.elementId } satisfies JourneyIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteJourneySection')}
      </Button>
    </Stack>
  )
}
