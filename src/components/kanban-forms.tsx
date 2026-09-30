import { Button, Group, Select, Stack, Text, TextInput } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { ProjectionKanbanCard, ProjectionKanbanColumn } from '../lib/projection/kanban-projection'
import { KANBAN_PRIORITIES, type KanbanIntent, type KanbanMetadata } from '../lib/pipeline/kanban'
import { useEditorStore } from '../store/editor'
import { useDraft } from './property-forms'

/**
 * kanban 属性表单集合（more-diagrams 工单 06）：全部表单值变化都映射为编辑意图，
 * 经 store.commitIntent 走管线手术式落码（独立撤销快照）。
 * 文本类输入在失焦 / 回车时提交，避免逐字符快照；优先级用枚举选择（KANBAN_PRIORITIES）。
 * 元数据三字段合成一次 set-metadata（parser 侧未托管键 icon / label / shape 逐字保留）。
 */

function useCommit() {
  return useEditorStore((s) => s.commitIntent)
}

function clearSelection() {
  useEditorStore.getState().select(null)
}

/** 「不设置优先级」的哨兵值（Mantine Select 空串会被当作未选中，故用显式哨兵） */
const NONE_PRIORITY = '__none__'

// ---------- 列 ----------

export function KanbanColumnForm({ column }: { column: ProjectionKanbanColumn }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const titleDraft = useDraft(column.title, (next) => {
    commitIntent({ type: 'set-column-title', elementId: column.elementId, title: next } satisfies KanbanIntent)
  })

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.kanbanColumnName', { title: column.title })}
      </Text>
      <TextInput
        label={t('app:propertyPanel.kanbanColumnTitle')}
        value={titleDraft.draft}
        onChange={(e) => titleDraft.setDraft(e.currentTarget.value)}
        onBlur={titleDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') titleDraft.commit()
        }}
      />
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-column', elementId: column.elementId } satisfies KanbanIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteKanbanColumn')}
      </Button>
    </Stack>
  )
}

// ---------- 卡片 ----------

export function KanbanCardForm({ card, columnTitle }: { card: ProjectionKanbanCard; columnTitle: string }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  // 三字段合成一次 set-metadata：以当前投影值为底，只改被编辑的那一项。
  // renderKanbanMeta 把空串视为移除，故清空输入 = 去掉该元数据项。
  const commitMetadata = (patch: Partial<KanbanMetadata>) => {
    commitIntent({
      type: 'set-metadata',
      elementId: card.elementId,
      metadata: {
        assigned: card.assigned,
        ticket: card.ticket,
        priority: card.priority,
        ...patch,
      },
    } satisfies KanbanIntent)
  }
  const descDraft = useDraft(card.description, (next) => {
    commitIntent({ type: 'set-description', elementId: card.elementId, description: next } satisfies KanbanIntent)
  })
  const assignedDraft = useDraft(card.assigned ?? '', (next) => commitMetadata({ assigned: next }))
  const ticketDraft = useDraft(card.ticket ?? '', (next) => commitMetadata({ ticket: next }))
  const priorityOptions = [
    { value: NONE_PRIORITY, label: t('app:propertyPanel.kanbanPriorityNone') },
    ...KANBAN_PRIORITIES.map((value) => ({ value, label: t(`app:kanbanPriorities.${value}`) })),
  ]

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.kanbanCardOwner', { column: columnTitle })}
      </Text>
      <TextInput
        label={t('app:propertyPanel.kanbanCardDescription')}
        value={descDraft.draft}
        onChange={(e) => descDraft.setDraft(e.currentTarget.value)}
        onBlur={descDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') descDraft.commit()
        }}
      />
      <TextInput
        label={t('app:propertyPanel.kanbanAssigned')}
        value={assignedDraft.draft}
        onChange={(e) => assignedDraft.setDraft(e.currentTarget.value)}
        onBlur={assignedDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') assignedDraft.commit()
        }}
      />
      <TextInput
        label={t('app:propertyPanel.kanbanTicket')}
        value={ticketDraft.draft}
        onChange={(e) => ticketDraft.setDraft(e.currentTarget.value)}
        onBlur={ticketDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') ticketDraft.commit()
        }}
      />
      <Select
        label={t('app:propertyPanel.kanbanPriority')}
        data={priorityOptions}
        value={card.priority ?? NONE_PRIORITY}
        onChange={(value) => commitMetadata({ priority: value === NONE_PRIORITY ? null : value })}
        allowDeselect={false}
      />
      <Group justify="flex-end">
        <Button
          variant="light"
          color="red"
          onClick={() => {
            if (commitIntent({ type: 'delete-card', elementId: card.elementId } satisfies KanbanIntent)) {
              clearSelection()
            }
          }}
        >
          {t('app:propertyPanel.deleteKanbanCard')}
        </Button>
      </Group>
    </Stack>
  )
}
