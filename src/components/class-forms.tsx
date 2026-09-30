import { useState } from 'react'
import { Button, Group, Select, Stack, Text, TextInput } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { ProjectionClass, ProjectionMember, ProjectionNamespace, ProjectionNote, ProjectionRelation } from '../lib/projection/class-projection'
import { useEditorStore } from '../store/editor'
import { useDraft } from './property-forms'
import {
  RELATION_KIND_OPTIONS,
  VISIBILITY_OPTIONS,
  addMemberIntent,
  addNoteIntent,
  addRelationIntent,
  deleteClassIntent,
  deleteMemberIntent,
  deleteNoteIntent,
  deleteRelationIntent,
  renameClassIntent,
  setClassGenericIntent,
  setMemberIntent,
  setNamespaceNameIntent,
  setNoteIntent,
  setRelationIntent,
} from '../lib/editing/class-forms'
import type { RelationKind, Visibility } from '../lib/pipeline/class'
import { namespaceIdAfterRename } from '../lib/pipeline/class'

/**
 * class 属性表单集合（工单 07）：全部表单值变化都映射为编辑意图，经
 * store.commitIntent 走管线手术式落码（独立撤销快照），左侧代码实时变化。
 * 文本类输入在失焦/回车时提交，避免逐字符快照。
 */

function useCommit() {
  return useEditorStore((s) => s.commitIntent)
}

function clearSelection() {
  useEditorStore.getState().select(null)
}

function visibilityLabel(t: (k: string) => string, vis: Visibility): string {
  const option = VISIBILITY_OPTIONS.find((o) => o.value === vis)
  return t(option !== undefined ? option.labelKey : vis)
}

function relationKindLabel(t: (k: string) => string, kind: RelationKind): string {
  const option = RELATION_KIND_OPTIONS.find((o) => o.value === kind)
  return t(option !== undefined ? option.labelKey : kind)
}

// ---------- 类 ----------

export function ClassForm({ cls }: { cls: ProjectionClass }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const nameDraft = useDraft(cls.name, (next) => {
    const intent = renameClassIntent(cls.name, next)
    if (intent !== null && commitIntent(intent)) {
      useEditorStore.getState().select({ kind: 'class', name: next })
    }
  })
  const genericDraft = useDraft(cls.generic ?? '', (next) => {
    commitIntent(setClassGenericIntent(cls.name, next))
  })

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.classType')}
      </Text>
      <TextInput
        label={t('app:propertyPanel.className')}
        value={nameDraft.draft}
        onChange={(e) => nameDraft.setDraft(e.currentTarget.value)}
        onBlur={nameDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') nameDraft.commit()
        }}
        error={
          renameClassIntent(cls.name, nameDraft.draft) === null && nameDraft.draft !== cls.name
            ? t('app:propertyPanel.invalidClassName')
            : undefined
        }
      />
      <TextInput
        label={t('app:propertyPanel.classGeneric')}
        value={genericDraft.draft}
        onChange={(e) => genericDraft.setDraft(e.currentTarget.value)}
        onBlur={genericDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') genericDraft.commit()
        }}
      />
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent(deleteClassIntent(cls.name))) clearSelection()
        }}
      >
        {t('app:propertyPanel.deleteClass')}
      </Button>
    </Stack>
  )
}

// ---------- 成员 ----------

export function MemberForm({ member }: { member: ProjectionMember }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const textDraft = useDraft(member.text, (next) => {
    commitIntent(setMemberIntent(member.elementId, { text: next }))
  })
  const applyVis = (vis: Visibility) => {
    commitIntent(setMemberIntent(member.elementId, { vis }))
  }

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {member.owner ?? t('app:propertyPanel.blockMember')}
      </Text>
      <Select
        label={t('app:propertyPanel.memberVisibility')}
        data={VISIBILITY_OPTIONS.map((v) => ({ value: v.value, label: t(v.labelKey) }))}
        value={member.vis}
        onChange={(v) => v !== null && applyVis(v as Visibility)}
        allowDeselect={false}
      />
      <TextInput
        label={t('app:propertyPanel.memberText')}
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
          if (commitIntent(deleteMemberIntent(member.elementId))) clearSelection()
        }}
      >
        {t('app:propertyPanel.deleteMember')}
      </Button>
    </Stack>
  )
}

// ---------- 关系 ----------

export function RelationForm({ relation }: { relation: ProjectionRelation }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const apply = (partial: {
    kind?: RelationKind
    fromGeneric?: string | null
    toGeneric?: string | null
    cardFrom?: string | null
    cardTo?: string | null
    label?: string | null
  }) => {
    commitIntent(setRelationIntent(relation.elementId, partial))
  }
  const labelDraft = useDraft(relation.label ?? '', (next) => {
    apply({ label: next !== '' ? next : null })
  })
  // 端点泛型（工单 08）：`Foo~T~ --> Bar~U~`，留空即无泛型
  const fromGenericDraft = useDraft(relation.fromGeneric ?? '', (next) => {
    apply({ fromGeneric: next !== '' ? next : null })
  })
  const toGenericDraft = useDraft(relation.toGeneric ?? '', (next) => {
    apply({ toGeneric: next !== '' ? next : null })
  })

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {relation.from} → {relation.to}
      </Text>
      <Group grow>
        <TextInput
          label={t('app:propertyPanel.relationFromGeneric')}
          value={fromGenericDraft.draft}
          onChange={(e) => fromGenericDraft.setDraft(e.currentTarget.value)}
          onBlur={fromGenericDraft.commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') fromGenericDraft.commit()
          }}
        />
        <TextInput
          label={t('app:propertyPanel.relationToGeneric')}
          value={toGenericDraft.draft}
          onChange={(e) => toGenericDraft.setDraft(e.currentTarget.value)}
          onBlur={toGenericDraft.commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') toGenericDraft.commit()
          }}
        />
      </Group>
      <Select
        label={t('app:propertyPanel.relationKind')}
        data={RELATION_KIND_OPTIONS.map((k) => ({ value: k.value, label: t(k.labelKey) }))}
        value={relation.kind}
        onChange={(v) => v !== null && apply({ kind: v as RelationKind })}
        allowDeselect={false}
      />
      <Group grow>
        <TextInput
          label={t('app:propertyPanel.cardFrom')}
          value={relation.cardFrom ?? ''}
          onChange={(e) => apply({ cardFrom: e.currentTarget.value !== '' ? e.currentTarget.value : null })}
        />
        <TextInput
          label={t('app:propertyPanel.cardTo')}
          value={relation.cardTo ?? ''}
          onChange={(e) => apply({ cardTo: e.currentTarget.value !== '' ? e.currentTarget.value : null })}
        />
      </Group>
      <TextInput
        label={t('app:propertyPanel.relationLabel')}
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
          if (commitIntent(deleteRelationIntent(relation.elementId))) clearSelection()
        }}
      >
        {t('app:propertyPanel.deleteRelation')}
      </Button>
    </Stack>
  )
}

// ---------- note ----------

export function ClassNoteForm({ note }: { note: ProjectionNote }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const textDraft = useDraft(note.text, (next) => {
    commitIntent(setNoteIntent(note.elementId, { text: next }))
  })

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {note.forClass ?? t('app:propertyPanel.floatingNote')}
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
          if (commitIntent(deleteNoteIntent(note.elementId))) clearSelection()
        }}
      >
        {t('app:propertyPanel.deleteNote')}
      </Button>
    </Stack>
  )
}

// ---------- namespace（工单 06：只改名，不做分组编辑） ----------

/** namespace 属性表单：改命名空间名（行尾原文由管线逐字保留）。 */
export function NamespaceForm({ namespace }: { namespace: ProjectionNamespace }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const nameDraft = useDraft(namespace.name, (next) => {
    const intent = setNamespaceNameIntent(namespace.elementId, next)
    if (intent === null) return
    const before = useEditorStore.getState().source
    if (!commitIntent(intent)) return
    // 改名后元素 id 由解析器给出（重名时带 `#N` 序号）：从落码结果里取回真实 id 再跟随选中，
    // 表单不自己拼 id（拼错了会选中落空、面板回落图表级，用户看不到刚改的名字）
    const renamed = namespaceIdAfterRename(before, useEditorStore.getState().source, namespace.elementId)
    if (renamed !== null) useEditorStore.getState().select({ kind: 'class-namespace', elementId: renamed })
  })

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.namespaces')}
      </Text>
      <TextInput
        label={t('app:propertyPanel.namespaceName')}
        value={nameDraft.draft}
        onChange={(e) => nameDraft.setDraft(e.currentTarget.value)}
        onBlur={nameDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') nameDraft.commit()
        }}
        error={
          setNamespaceNameIntent(namespace.elementId, nameDraft.draft) === null && nameDraft.draft !== namespace.name
            ? t('app:propertyPanel.invalidNamespaceName')
            : undefined
        }
      />
    </Stack>
  )
}

// ---------- 添加元素（右键菜单的浮层小表单，工单 06 / 工单 04） ----------

/** 添加 note（工单 04 从 git 历史取回后按右键菜单需求调整）。
 * 目标类可选：类节点右键预选该类 → `note for X`；空白处右键缺省 = 无目标类 → 浮动 note。 */
export function AddClassNoteInlineForm({
  classes,
  initialClassName,
  afterElementId,
  onDone,
}: {
  classes: ProjectionClass[]
  /** 预选 note 目标类（右键的那个类）；缺省为空串 = 浮动 note */
  initialClassName?: string
  /** 落码锚点（类声明的 elementId）：新 note 插到它之后；空白处右键不传 */
  afterElementId?: string
  onDone: () => void
}) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const [target, setTarget] = useState<string>(initialClassName ?? '')
  const [text, setText] = useState('')
  return (
    <Stack gap="sm">
      <Select
        label={t('app:propertyPanel.addNoteTarget')}
        data={[
          { value: '', label: t('app:propertyPanel.floatingNote') },
          ...classes.map((c) => ({ value: c.name, label: c.name })),
        ]}
        value={target}
        onChange={(v) => setTarget(v ?? '')}
        allowDeselect={false}
      />
      <TextInput label={t('app:propertyPanel.noteText')} value={text} onChange={(e) => setText(e.currentTarget.value)} />
      <Button
        onClick={() => {
          const intent = addNoteIntent({ className: target !== '' ? target : null, text })
          if (intent !== null && commitIntent({ ...intent, afterElementId })) onDone()
        }}
      >
        {t('app:propertyPanel.add')}
      </Button>
    </Stack>
  )
}

export function AddMemberInlineForm({
  classes,
  initialClassName,
  afterElementId,
  onDone,
}: {
  classes: ProjectionClass[]
  /** 预选类名（右键的那个类）；缺省取第一个类 */
  initialClassName?: string
  /** 落码锚点（类声明的 elementId）：新成员插到它之后 */
  afterElementId?: string
  onDone: () => void
}) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const [className, setClassName] = useState<string | null>(initialClassName ?? classes[0]?.name ?? null)
  const [vis, setVis] = useState<Visibility>('+')
  const [text, setText] = useState('')
  return (
    <Stack gap="sm">
      <Select
        label={t('app:propertyPanel.memberOwner')}
        data={classes.map((c) => ({ value: c.name, label: c.name }))}
        value={className}
        onChange={setClassName}
        allowDeselect={false}
      />
      <Select
        label={t('app:propertyPanel.memberVisibility')}
        data={VISIBILITY_OPTIONS.map((v) => ({ value: v.value, label: t(v.labelKey) }))}
        value={vis}
        onChange={(v) => v !== null && setVis(v as Visibility)}
        allowDeselect={false}
      />
      <TextInput
        label={t('app:propertyPanel.memberText')}
        placeholder="String name / add(id) bool"
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
      />
      <Button
        onClick={() => {
          if (className === null) return
          const intent = addMemberIntent({ className, vis, text })
          if (intent !== null && commitIntent({ ...intent, afterElementId })) onDone()
        }}
      >
        {t('app:propertyPanel.add')}
      </Button>
    </Stack>
  )
}

export function AddRelationInlineForm({
  classes,
  initialFrom,
  afterElementId,
  onDone,
}: {
  classes: ProjectionClass[]
  /** 预选起点类名（右键的那个类）；缺省取第一个类 */
  initialFrom?: string
  /** 落码锚点（类声明的 elementId）：新关系插到它之后 */
  afterElementId?: string
  onDone: () => void
}) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const start = initialFrom ?? classes[0]?.name ?? null
  const [from, setFrom] = useState<string | null>(start)
  // 终点默认取一个不同于起点的类（自关系需要用户显式选择）
  const [to, setTo] = useState<string | null>(() => classes.find((c) => c.name !== start)?.name ?? start)
  const [kind, setKind] = useState<RelationKind>('-->')
  const [cardFrom, setCardFrom] = useState('')
  const [cardTo, setCardTo] = useState('')
  const [label, setLabel] = useState('')
  const options = classes.map((c) => ({ value: c.name, label: c.name }))
  return (
    <Stack gap="sm">
      <Group grow>
        <Select label={t('app:propertyPanel.addEdgeFrom')} data={options} value={from} onChange={setFrom} allowDeselect={false} />
        <Select label={t('app:propertyPanel.addEdgeTo')} data={options} value={to} onChange={setTo} allowDeselect={false} />
      </Group>
      <Select
        label={t('app:propertyPanel.relationKind')}
        data={RELATION_KIND_OPTIONS.map((k) => ({ value: k.value, label: t(k.labelKey) }))}
        value={kind}
        onChange={(v) => v !== null && setKind(v as RelationKind)}
        allowDeselect={false}
      />
      <Group grow>
        <TextInput label={t('app:propertyPanel.cardFrom')} value={cardFrom} onChange={(e) => setCardFrom(e.currentTarget.value)} />
        <TextInput label={t('app:propertyPanel.cardTo')} value={cardTo} onChange={(e) => setCardTo(e.currentTarget.value)} />
      </Group>
      <TextInput label={t('app:propertyPanel.relationLabel')} value={label} onChange={(e) => setLabel(e.currentTarget.value)} />
      <Button
        onClick={() => {
          if (from === null || to === null) return
          const intent = addRelationIntent({ from, to, kind, cardFrom, cardTo, label })
          if (intent !== null && commitIntent({ ...intent, afterElementId })) onDone()
        }}
      >
        {t('app:propertyPanel.add')}
      </Button>
    </Stack>
  )
}
