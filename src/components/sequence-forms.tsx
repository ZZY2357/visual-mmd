import { useState } from 'react'
import { Button, Group, Select, Stack, Switch, Text, TextInput } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { BlockKeyword, MessageAct, MessageArrow, NotePos } from '../lib/pipeline/sequence'
import {
  BLOCK_KEYWORD_OPTIONS,
  MESSAGE_ARROW_OPTIONS,
  NOTE_POS_OPTIONS,
  addBlockIntent,
  addMessageIntent,
  addNoteIntent,
  deleteBlockIntent,
  deleteElseIntent,
  deleteMessageIntent,
  deleteNoteIntent,
  deleteParticipantIntent,
  renameParticipantIntent,
  setAutonumberIntent,
  setBlockLabelIntent,
  setBoxLabelIntent,
  setElseLabelIntent,
  setMessageIntent,
  setNoteIntent,
  setParticipantAliasIntent,
  setRectColorIntent,
  toggleActivationIntent,
} from '../lib/editing/sequence-forms'
import type {
  ProjectionBlock,
  ProjectionElse,
  ProjectionMessage,
  ProjectionNote,
  ProjectionParticipant,
  ProjectionRegion,
  SequenceProjection,
} from '../lib/projection/sequence-projection'
import { useEditorStore } from '../store/editor'
import { useDraft } from './property-forms'

/**
 * sequence 属性表单集合（工单 06）：全部表单值变化都映射为编辑意图，经
 * store.commitIntent 走管线手术式落码（独立撤销快照），左侧代码实时变化。
 * 文本类输入在失焦/回车时提交，避免逐字符快照。
 */

function useCommit() {
  return useEditorStore((s) => s.commitIntent)
}

function clearSelection() {
  useEditorStore.getState().select(null)
}

function messageArrowLabel(t: (k: string) => string, arrow: MessageArrow): string {
  return t(`app:seqArrows.${arrow}`)
}

// ---------- 图表（autonumber） ----------

export function SequenceDiagramForm({ projection }: { projection: SequenceProjection }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  return (
    <Switch
      label={t('app:propertyPanel.autonumber')}
      checked={projection.autonumber}
      onChange={(e) => commitIntent(setAutonumberIntent(e.currentTarget.checked))}
    />
  )
}

// ---------- 参与者 ----------

export function ParticipantForm({ participant }: { participant: ProjectionParticipant }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const aliasDraft = useDraft(participant.alias ?? '', (next) => {
    commitIntent(setParticipantAliasIntent(participant.actorId, next))
  })
  const idDraft = useDraft(participant.actorId, (next) => {
    const intent = renameParticipantIntent(participant.actorId, next)
    if (intent !== null && commitIntent(intent)) {
      useEditorStore.getState().select({ kind: 'participant', actorId: next })
    }
  })

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {participant.keyword === 'actor' ? t('app:propertyPanel.actorType') : t('app:propertyPanel.participantType')}
        {participant.active ? ` · ${t('app:propertyPanel.lifelineActive')}` : ''}
      </Text>
      <TextInput
        label={t('app:propertyPanel.participantAlias')}
        value={aliasDraft.draft}
        onChange={(e) => aliasDraft.setDraft(e.currentTarget.value)}
        onBlur={aliasDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') aliasDraft.commit()
        }}
      />
      <TextInput
        label={t('app:propertyPanel.participantId')}
        value={idDraft.draft}
        onChange={(e) => idDraft.setDraft(e.currentTarget.value)}
        onBlur={idDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') idDraft.commit()
        }}
        error={
          renameParticipantIntent(participant.actorId, idDraft.draft) === null && idDraft.draft !== participant.actorId
            ? t('app:propertyPanel.invalidParticipantId')
            : undefined
        }
      />
      <Button variant="default" onClick={() => commitIntent(toggleActivationIntent(participant.actorId))}>
        {participant.active ? t('app:propertyPanel.deactivateLifeline') : t('app:propertyPanel.activateLifeline')}
      </Button>
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent(deleteParticipantIntent(participant.actorId))) clearSelection()
        }}
      >
        {t('app:propertyPanel.deleteParticipant')}
      </Button>
    </Stack>
  )
}

// ---------- 消息 ----------

export function MessageForm({ message }: { message: ProjectionMessage }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const textDraft = useDraft(message.text, (next) => {
    commitIntent(setMessageIntent(message.elementId, { text: next }))
  })
  const apply = (partial: { arrow?: MessageArrow; act?: MessageAct }) => {
    commitIntent(setMessageIntent(message.elementId, partial))
  }

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {message.from} → {message.to}
      </Text>
      <Select
        label={t('app:propertyPanel.messageArrow')}
        data={MESSAGE_ARROW_OPTIONS.map((a) => ({ value: a, label: messageArrowLabel(t, a) }))}
        value={message.arrow}
        onChange={(v) => v !== null && apply({ arrow: v as MessageArrow })}
        allowDeselect={false}
      />
      <Select
        label={t('app:propertyPanel.messageAct')}
        data={[
          { value: '', label: t('app:propertyPanel.actNone') },
          { value: '+', label: t('app:propertyPanel.actActivate') },
          { value: '-', label: t('app:propertyPanel.actDeactivate') },
        ]}
        value={message.act}
        onChange={(v) => v !== null && apply({ act: v as MessageAct })}
        allowDeselect={false}
      />
      <TextInput
        label={t('app:propertyPanel.messageText')}
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
          if (commitIntent(deleteMessageIntent(message.elementId))) clearSelection()
        }}
      >
        {t('app:propertyPanel.deleteMessage')}
      </Button>
    </Stack>
  )
}

// ---------- note ----------

export function NoteForm({ note }: { note: ProjectionNote }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const textDraft = useDraft(note.text, (next) => {
    commitIntent(setNoteIntent(note.elementId, { text: next }))
  })
  const applyPos = (pos: NotePos) => {
    commitIntent(setNoteIntent(note.elementId, { pos }))
  }

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {note.actors !== null ? note.actors.join(', ') : t('app:propertyPanel.noteUnknownActors')}
      </Text>
      <Select
        label={t('app:propertyPanel.notePosition')}
        data={NOTE_POS_OPTIONS.map((p) => ({ value: p, label: t(`app:notePos.${p}`) }))}
        value={note.pos}
        onChange={(v) => v !== null && applyPos(v as NotePos)}
        allowDeselect={false}
      />
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
          if (commitIntent(deleteNoteIntent(note.elementId))) clearSelection()
        }}
      >
        {t('app:propertyPanel.deleteNote')}
      </Button>
    </Stack>
  )
}

// ---------- 逻辑块 ----------

function blockKeywordLabel(t: (k: string) => string, keyword: BlockKeyword): string {
  return t(`app:blockKeywords.${keyword}`)
}

export function BlockForm({ block, elseBranches }: { block: ProjectionBlock; elseBranches: ProjectionElse[] }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const labelDraft = useDraft(block.label ?? '', (next) => {
    commitIntent(setBlockLabelIntent(block.elementId, next))
  })

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {blockKeywordLabel(t, block.keyword)}
      </Text>
      <TextInput
        label={t('app:propertyPanel.blockLabel')}
        value={labelDraft.draft}
        onChange={(e) => labelDraft.setDraft(e.currentTarget.value)}
        onBlur={labelDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') labelDraft.commit()
        }}
      />
      {elseBranches.length > 0 && (
        <Group gap="xs" align="flex-start">
          {elseBranches.map((branch) => (
            <ElseForm key={branch.elementId} branch={branch} />
          ))}
        </Group>
      )}
      {(block.keyword === 'alt' || block.keyword === 'par' || block.keyword === 'critical') && (
        <Button variant="default" onClick={() => commitIntent({ type: 'add-else', blockId: block.elementId })}>
          + {block.keyword === 'par' ? t('app:propertyPanel.addAnd') : t('app:propertyPanel.addElse')}
        </Button>
      )}
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent(deleteBlockIntent(block.elementId))) clearSelection()
        }}
      >
        {t('app:propertyPanel.deleteBlock')}
      </Button>
    </Stack>
  )
}

function ElseForm({ branch }: { branch: ProjectionElse }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const labelDraft = useDraft(branch.label ?? '', (next) => {
    commitIntent(setElseLabelIntent(branch.elementId, next))
  })
  return (
    <Stack gap="xs" style={{ flex: 1 }}>
      <Text size="xs" c="dimmed">
        {branch.keyword === 'and' ? t('app:propertyPanel.andBranch') : t('app:propertyPanel.elseBranch')}
      </Text>
      <TextInput
        value={labelDraft.draft}
        onChange={(e) => labelDraft.setDraft(e.currentTarget.value)}
        onBlur={labelDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') labelDraft.commit()
        }}
      />
      <Button
        size="compact-xs"
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent(deleteElseIntent(branch.elementId))) clearSelection()
        }}
      >
        {t('app:propertyPanel.delete')}
      </Button>
    </Stack>
  )
}

// ---------- rect / box 区域块（工单 06：只改名，不做分组编辑） ----------

/** rect / box 区域块属性表单：rect 改色值、box 改标签（颜色 token 由管线保留）。 */
export function SequenceRegionForm({ region }: { region: ProjectionRegion }) {
  if (region.kind === 'rect') return <RectColorForm elementId={region.elementId} color={region.color} />
  return <BoxLabelForm elementId={region.elementId} label={region.label} color={region.color} />
}

function RectColorForm({ elementId, color }: { elementId: string; color: string }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const colorDraft = useDraft(color, (next) => {
    commitIntent(setRectColorIntent(elementId, next))
  })
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.rectRegion')}
      </Text>
      <TextInput
        label={t('app:propertyPanel.rectColor')}
        value={colorDraft.draft}
        onChange={(e) => colorDraft.setDraft(e.currentTarget.value)}
        onBlur={colorDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') colorDraft.commit()
        }}
      />
    </Stack>
  )
}

function BoxLabelForm({ elementId, label, color }: { elementId: string; label: string | null; color: string | null }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const labelDraft = useDraft(label ?? '', (next) => {
    commitIntent(setBoxLabelIntent(elementId, next))
  })
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.boxRegion')}
        {color !== null ? ` · ${color}` : ''}
      </Text>
      <TextInput
        label={t('app:propertyPanel.boxLabel')}
        value={labelDraft.draft}
        onChange={(e) => labelDraft.setDraft(e.currentTarget.value)}
        onBlur={labelDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') labelDraft.commit()
        }}
      />
    </Stack>
  )
}

// ---------- 添加元素（右键菜单的浮层小表单，工单 06 / 工单 04） ----------

/** 添加注释（工单 04 从 git 历史取回后按右键菜单需求调整）。
 * 表单自己选参与者：空白处右键没有可预选的参与者，`note over` 才需要第二个。 */
export function AddNoteInlineForm({
  participants,
  afterElementId,
  onDone,
}: {
  participants: ProjectionParticipant[]
  /** 落码锚点（空白处右键不传 → 管线回退到文档最后一个元素） */
  afterElementId?: string
  onDone: () => void
}) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const [pos, setPos] = useState<NotePos>('over')
  const [actorA, setActorA] = useState<string | null>(participants[0]?.actorId ?? null)
  const [actorB, setActorB] = useState<string | null>(participants[1]?.actorId ?? participants[0]?.actorId ?? null)
  const [text, setText] = useState('')
  const options = participants.map((p) => ({ value: p.actorId, label: p.alias ?? p.actorId }))
  return (
    <Stack gap="sm">
      <Select
        label={t('app:propertyPanel.notePosition')}
        data={NOTE_POS_OPTIONS.map((p) => ({ value: p, label: t(`app:notePos.${p}`) }))}
        value={pos}
        onChange={(v) => v !== null && setPos(v as NotePos)}
        allowDeselect={false}
      />
      <Group grow>
        <Select
          label={t('app:propertyPanel.addNoteActorA')}
          data={options}
          value={actorA}
          onChange={setActorA}
          allowDeselect={false}
        />
        {pos === 'over' && (
          <Select
            label={t('app:propertyPanel.addNoteActorB')}
            data={options}
            value={actorB}
            onChange={setActorB}
            allowDeselect={false}
          />
        )}
      </Group>
      <TextInput label={t('app:propertyPanel.noteText')} value={text} onChange={(e) => setText(e.currentTarget.value)} />
      <Button
        onClick={() => {
          if (actorA === null || (pos === 'over' && actorB === null)) return
          const intent = addNoteIntent({ pos, actorA, actorB: actorB ?? '', text: text.trim() })
          if (intent !== null && commitIntent({ ...intent, afterElementId })) onDone()
        }}
      >
        {t('app:propertyPanel.add')}
      </Button>
    </Stack>
  )
}

/** 添加逻辑块（工单 04 从 git 历史取回后按右键菜单需求调整）：
 * 关键字六选一 + 可选标题；`afterElementId` 决定块插在哪（顺序即语义）。 */
export function AddBlockInlineForm({ afterElementId, onDone }: { afterElementId?: string; onDone: () => void }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const [keyword, setKeyword] = useState<BlockKeyword>('loop')
  const [label, setLabel] = useState('')
  return (
    <Stack gap="sm">
      <Select
        label={t('app:propertyPanel.addBlockKeyword')}
        data={BLOCK_KEYWORD_OPTIONS.map((k) => ({ value: k, label: blockKeywordLabel(t, k) }))}
        value={keyword}
        onChange={(v) => v !== null && setKeyword(v as BlockKeyword)}
        allowDeselect={false}
      />
      <TextInput label={t('app:propertyPanel.blockLabel')} value={label} onChange={(e) => setLabel(e.currentTarget.value)} />
      <Button
        onClick={() => {
          if (commitIntent({ ...addBlockIntent({ keyword, label: label.trim() }), afterElementId })) onDone()
        }}
      >
        {t('app:propertyPanel.add')}
      </Button>
    </Stack>
  )
}

export function AddMessageInlineForm({
  participants,
  initialFrom,
  afterElementId,
  onDone,
}: {
  participants: ProjectionParticipant[]
  /** 预选起点参与者（右键的那个参与者）；缺省取第一个参与者 */
  initialFrom?: string
  /** 落码锚点（参与者声明的 elementId）：新消息插到它之后 */
  afterElementId?: string
  onDone: () => void
}) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const start = initialFrom ?? participants[0]?.actorId ?? null
  const [from, setFrom] = useState<string | null>(start)
  // 终点默认取一个不同于起点的参与者（自消息需要用户显式选择）
  const [to, setTo] = useState<string | null>(
    () => participants.find((p) => p.actorId !== start)?.actorId ?? start,
  )
  const [arrow, setArrow] = useState<MessageArrow>('->>')
  const [act, setAct] = useState<MessageAct>('')
  const [text, setText] = useState('')
  const options = participants.map((p) => ({ value: p.actorId, label: p.alias ?? p.actorId }))
  return (
    <Stack gap="sm">
      <Select label={t('app:propertyPanel.addEdgeFrom')} data={options} value={from} onChange={setFrom} allowDeselect={false} />
      <Select label={t('app:propertyPanel.addEdgeTo')} data={options} value={to} onChange={setTo} allowDeselect={false} />
      <Group grow>
        <Select
          label={t('app:propertyPanel.messageArrow')}
          data={MESSAGE_ARROW_OPTIONS.map((a) => ({ value: a, label: messageArrowLabel(t, a) }))}
          value={arrow}
          onChange={(v) => v !== null && setArrow(v as MessageArrow)}
          allowDeselect={false}
        />
        <Select
          label={t('app:propertyPanel.messageAct')}
          data={[
            { value: '', label: t('app:propertyPanel.actNone') },
            { value: '+', label: t('app:propertyPanel.actActivate') },
            { value: '-', label: t('app:propertyPanel.actDeactivate') },
          ]}
          value={act}
          onChange={(v) => v !== null && setAct(v as MessageAct)}
          allowDeselect={false}
        />
      </Group>
      <TextInput label={t('app:propertyPanel.messageText')} value={text} onChange={(e) => setText(e.currentTarget.value)} />
      <Button
        onClick={() => {
          if (from === null || to === null) return
          const intent = addMessageIntent({ from, to, arrow, act, text: text.trim() })
          if (intent !== null && commitIntent({ ...intent, afterElementId })) onDone()
        }}
      >
        {t('app:propertyPanel.add')}
      </Button>
    </Stack>
  )
}
