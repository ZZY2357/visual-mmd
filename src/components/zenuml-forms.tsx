import { Button, Select, Stack, Text, TextInput } from '@mantine/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  ProjectionZenumlFragment,
  ProjectionZenumlMessage,
  ProjectionZenumlParticipant,
  ZenumlProjection,
} from '../lib/projection/zenuml-projection'
import { isValidZenumlId, isValidZenumlLabel, type ZenumlIntent } from '../lib/pipeline/zenuml'
import { useEditorStore } from '../store/editor'
import { useDraft } from './property-forms'

/**
 * zenuml 属性表单集合（more-diagrams 工单 19）：表单值变化映射为编辑意图，经
 * store.commitIntent 走管线手术式落码（独立撤销快照）。文本类输入在失焦/回车时提交。
 *
 * 分层（与 zenuml 语法对齐，research §10）：
 * - 参与者表单改**别名**（显示文本，落 `as "…"`）；标识符是消息端点引用的语法身份，
 *   本表单不改（改名是 rename-zenuml-participant 意图，牵动消息端点引用——留给后续）；
 * - 消息表单改**方法名 / 参数**（set-zenuml-message-text）；种类与端点是语法结构，不在此改；
 * - 片段（分组）条件由结构树选中后……条件是片段声明行的一部分，本表单只读展示（不做条件编辑）。
 */

function useCommit() {
  return useEditorStore((s) => s.commitIntent)
}

function clearSelection() {
  useEditorStore.getState().select(null)
}

// ---------- 参与者 ----------

export function ZenumlParticipantForm({ participant }: { participant: ProjectionZenumlParticipant }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const aliasDraft = useDraft(participant.alias ?? '', (next) => {
    const trimmed = next.trim()
    if (trimmed !== '' && !isValidZenumlLabel(trimmed)) return
    commitIntent({
      type: 'set-zenuml-participant-alias',
      elementId: participant.elementId,
      alias: trimmed === '' ? null : trimmed,
    } satisfies ZenumlIntent)
  })

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.zenumlParticipantAliasHint', { id: participant.id })}
      </Text>
      <TextInput
        label={t('app:propertyPanel.zenumlParticipantAlias')}
        value={aliasDraft.draft}
        error={
          aliasDraft.draft.trim() === '' || isValidZenumlLabel(aliasDraft.draft.trim())
            ? undefined
            : t('app:propertyPanel.invalidZenumlLabel')
        }
        onChange={(e) => aliasDraft.setDraft(e.currentTarget.value)}
        onBlur={aliasDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') aliasDraft.commit()
        }}
      />
      {participant.annotation !== null && (
        <Text size="xs" c="dimmed">
          {t('app:propertyPanel.zenumlAnnotation')}: @{participant.annotation}
        </Text>
      )}
      <Button
        variant="light"
        color="red"
        disabled={!participant.declared}
        onClick={() => {
          if (
            commitIntent({
              type: 'delete-zenuml-participant',
              elementId: participant.elementId,
            } satisfies ZenumlIntent)
          ) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteZenumlParticipant')}
      </Button>
    </Stack>
  )
}

// ---------- 消息 ----------

const MESSAGE_KIND_LABELS: Record<ProjectionZenumlMessage['messageKind'], string> = {
  sync: 'app:propertyPanel.zenumlMessageKindSync',
  async: 'app:propertyPanel.zenumlMessageKindAsync',
  new: 'app:propertyPanel.zenumlMessageKindNew',
  return: 'app:propertyPanel.zenumlMessageKindReturn',
}

export function ZenumlMessageForm({ message }: { message: ProjectionZenumlMessage }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const methodDraft = useDraft(message.method, (next) => {
    const trimmed = next.trim()
    if (trimmed === '' || trimmed === message.method) return
    commitIntent({
      type: 'set-zenuml-message-text',
      elementId: message.elementId,
      method: trimmed,
    } satisfies ZenumlIntent)
  })
  const argsDraft = useDraft(message.argsRaw ?? '', (next) => {
    const trimmed = next.trim()
    commitIntent({
      type: 'set-zenuml-message-text',
      elementId: message.elementId,
      args: trimmed === '' ? null : trimmed,
    } satisfies ZenumlIntent)
  })

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.zenumlMessageHint', { label: message.label })}
      </Text>
      <TextInput
        label={t('app:propertyPanel.zenumlMessageKind')}
        value={t(MESSAGE_KIND_LABELS[message.messageKind])}
        readOnly
      />
      <TextInput
        label={t('app:propertyPanel.zenumlMethodLabel')}
        value={methodDraft.draft}
        onChange={(e) => methodDraft.setDraft(e.currentTarget.value)}
        onBlur={methodDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') methodDraft.commit()
        }}
      />
      <TextInput
        label={t('app:propertyPanel.zenumlArgsLabel')}
        value={argsDraft.draft}
        onChange={(e) => argsDraft.setDraft(e.currentTarget.value)}
        onBlur={argsDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') argsDraft.commit()
        }}
      />
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (
            commitIntent({
              type: 'delete-zenuml-message',
              elementId: message.elementId,
            } satisfies ZenumlIntent)
          ) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteZenumlMessage')}
      </Button>
    </Stack>
  )
}

// ---------- 图表（标题） ----------

export function ZenumlDiagramForm({ projection }: { projection: ZenumlProjection }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const titleDraft = useDraft(projection.title ?? '', (next) => {
    commitIntent({ type: 'set-zenuml-title', text: next.trim() } satisfies ZenumlIntent)
  })

  return (
    <Stack gap="sm">
      <TextInput
        label={t('app:propertyPanel.zenumlTitle')}
        placeholder={t('app:propertyPanel.zenumlTitle')}
        value={titleDraft.draft}
        onChange={(e) => titleDraft.setDraft(e.currentTarget.value)}
        onBlur={titleDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') titleDraft.commit()
        }}
      />
      <Text size="xs" c="dimmed">
        {t('app:propertyPanel.zenumlDiagramHint', {
          participants: projection.participants.length,
          messages: projection.messages.length,
          fragments: projection.fragments.length,
        })}
      </Text>
    </Stack>
  )
}

// ---------- 片段（分组） ----------

export function ZenumlFragmentForm({ fragment }: { fragment: ProjectionZenumlFragment }) {
  const t = useTranslation().t
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.zenumlFragmentDetail', { count: fragment.directMessageCount })}
      </Text>
    </Stack>
  )
}

// ---------- 添加消息（浮层表单） ----------

/**
 * 加消息小表单（zenuml，工单 19）：from / to / 方法名 / 参数四字段，提交才落码。
 * from / to 从既有参与者名下选（无参与者可选时安静不落码——消息端点必须是已声明的参与者）。
 * 形态固定为**异步**（`A->B.method(args)`，与模板一致；同步 / new / return 的添加留给
 * 后续——工单 19 的可编形态以异步为主）。
 */
export function AddZenumlMessageInlineForm({
  participants,
  initialFrom,
  afterElementId,
  onDone,
}: {
  participants: ProjectionZenumlParticipant[]
  initialFrom?: string
  afterElementId?: string
  onDone: () => void
}) {
  const t = useTranslation().t
  const commitIntent = useEditorStore((s) => s.commitIntent)
  const ids = participants.map((p) => p.id)
  const [from, setFrom] = useState<string>(
    initialFrom !== undefined && ids.includes(initialFrom) ? initialFrom : (ids[0] ?? ''),
  )
  const [to, setTo] = useState<string>(ids[1] ?? ids[0] ?? '')
  const [method, setMethod] = useState('')
  const [args, setArgs] = useState('')

  const options = participants.map((p) => ({ value: p.id, label: p.alias ?? p.id }))
  const canSubmit = ids.length > 0 && isValidZenumlId(from) && isValidZenumlId(to) && isValidZenumlId(method)

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.zenumlAddMessageTitle')}
      </Text>
      <Select
        label={t('app:propertyPanel.zenumlFromLabel')}
        data={options}
        value={from === '' ? null : from}
        onChange={(v) => v !== null && setFrom(v)}
      />
      <Select
        label={t('app:propertyPanel.zenumlToLabel')}
        data={options}
        value={to === '' ? null : to}
        onChange={(v) => v !== null && setTo(v)}
      />
      <TextInput
        label={t('app:propertyPanel.zenumlMethodLabel')}
        value={method}
        error={method !== '' && !isValidZenumlId(method) ? t('app:propertyPanel.invalidZenumlId') : undefined}
        onChange={(e) => setMethod(e.currentTarget.value)}
      />
      <TextInput
        label={t('app:propertyPanel.zenumlArgsLabel')}
        value={args}
        onChange={(e) => setArgs(e.currentTarget.value)}
      />
      <Button
        variant="light"
        disabled={!canSubmit}
        onClick={() => {
          if (!canSubmit) return
          const intent: ZenumlIntent = {
            type: 'add-zenuml-message',
            messageKind: 'async',
            from,
            to,
            method,
            ...(args.trim() !== '' ? { args: args.trim() } : {}),
            afterElementId,
          }
          if (commitIntent(intent)) onDone()
        }}
      >
        {t('app:propertyPanel.zenumlSubmit')}
      </Button>
    </Stack>
  )
}
