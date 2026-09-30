import { useState } from 'react'
import { Button, Group, Select, Stack, Text, TextInput } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type {
  ProjectionState,
  ProjectionStateNote,
  ProjectionStateTransition,
} from '../lib/projection/state-projection'
import { useEditorStore } from '../store/editor'
import { useDraft } from './property-forms'
import type { StateIntent } from '../lib/pipeline/state'

/**
 * state 属性表单集合（more-diagrams 工单 02）：全部表单值变化都映射为编辑意图，
 * 经 store.commitIntent 走管线手术式落码（独立撤销快照）。
 * 文本类输入在失焦/回车时提交，避免逐字符快照。
 */

function useCommit() {
  return useEditorStore((s) => s.commitIntent)
}

function clearSelection() {
  useEditorStore.getState().select(null)
}

// ---------- 状态 ----------

export function StateForm({ state }: { state: ProjectionState }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const descDraft = useDraft(state.desc ?? '', (next) => {
    commitIntent({ type: 'set-state-desc', id: state.id, desc: next !== '' ? next : null } satisfies StateIntent)
  })

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.stateId', { id: state.id })}
      </Text>
      <TextInput
        label={t('app:propertyPanel.stateDesc')}
        value={descDraft.draft}
        onChange={(e) => descDraft.setDraft(e.currentTarget.value)}
        onBlur={descDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') descDraft.commit()
        }}
      />
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-state', id: state.id } satisfies StateIntent)) clearSelection()
        }}
      >
        {t('app:propertyPanel.deleteState')}
      </Button>
    </Stack>
  )
}

// ---------- 转移 ----------

export function StateTransitionForm({ transition }: { transition: ProjectionStateTransition }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const labelDraft = useDraft(transition.label ?? '', (next) => {
    commitIntent({
      type: 'set-transition-label',
      elementId: transition.elementId,
      label: next !== '' ? next : null,
    } satisfies StateIntent)
  })

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {transition.from} → {transition.to}
      </Text>
      <TextInput
        label={t('app:propertyPanel.transitionLabel')}
        value={labelDraft.draft}
        onChange={(e) => labelDraft.setDraft(e.currentTarget.value)}
        onBlur={labelDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') labelDraft.commit()
        }}
      />
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-transition', elementId: transition.elementId } satisfies StateIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteTransition')}
      </Button>
    </Stack>
  )
}

// ---------- note ----------

export function StateNoteForm({ note }: { note: ProjectionStateNote }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const textDraft = useDraft(note.text, (next) => {
    commitIntent({ type: 'set-note-text', elementId: note.elementId, text: next } satisfies StateIntent)
  })

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.stateNoteTarget', { side: t(`app:notePos.${note.side}`), target: note.target })}
      </Text>
      <TextInput
        label={t('app:propertyPanel.noteText')}
        value={textDraft.draft}
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
          if (commitIntent({ type: 'delete-note', elementId: note.elementId } satisfies StateIntent)) clearSelection()
        }}
      >
        {t('app:propertyPanel.deleteNote')}
      </Button>
    </Stack>
  )
}

// ---------- 添加转移（右键菜单 / Enter 键的浮层小表单） ----------

/** 端点选项：全部状态 id + 起止伪状态 `[*]` */
function endpointOptions(states: ProjectionState[]): Array<{ value: string; label: string }> {
  return [...states.map((s) => ({ value: s.id, label: s.id })), { value: '[*]', label: '[*]' }]
}

export function AddTransitionInlineForm({
  states,
  initialFrom,
  afterElementId,
  onDone,
}: {
  states: ProjectionState[]
  /** 预选起点状态 id（右键的那个状态 / Enter 时的选中状态）；缺省取第一个状态 */
  initialFrom?: string
  /** 落码锚点：新转移插到该元素之后；缺省 = 文档最后一个元素 */
  afterElementId?: string
  onDone: () => void
}) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const start = initialFrom ?? states[0]?.id ?? null
  const [from, setFrom] = useState<string | null>(start)
  const [to, setTo] = useState<string | null>(() => {
    const options = endpointOptions(states)
    return options.find((o) => o.value !== start)?.value ?? start
  })
  const [label, setLabel] = useState('')
  const options = endpointOptions(states)
  return (
    <Stack gap="sm">
      <Group grow>
        <Select label={t('app:propertyPanel.addStateFrom')} data={options} value={from} onChange={setFrom} allowDeselect={false} />
        <Select label={t('app:propertyPanel.addStateTo')} data={options} value={to} onChange={setTo} allowDeselect={false} />
      </Group>
      <TextInput
        label={t('app:propertyPanel.transitionLabel')}
        value={label}
        onChange={(e) => setLabel(e.currentTarget.value)}
      />
      <Button
        onClick={() => {
          if (from === null || to === null) return
          commitIntent({
            type: 'add-transition',
            from,
            to,
            label: label !== '' ? label : undefined,
            afterElementId,
          } satisfies StateIntent)
          onDone()
        }}
      >
        {t('app:propertyPanel.add')}
      </Button>
    </Stack>
  )
}
