import { useState } from 'react'
import { Button, Checkbox, Group, Select, Stack, Text, TextInput } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type {
  ProjectionErAttribute,
  ProjectionErEntity,
  ProjectionErRelation,
} from '../lib/projection/er-projection'
import {
  ER_CARDINALITIES,
  ER_CARD_LEFT_OF,
  ER_CARD_RIGHT_OF,
  erCardinalityOf,
  type ErCardinality,
  type ErIntent,
} from '../lib/pipeline/er'
import { useEditorStore } from '../store/editor'
import { useDraft } from './property-forms'

/**
 * er 属性表单集合（more-diagrams 工单 03）：全部表单值变化都映射为编辑意图，
 * 经 store.commitIntent 走管线手术式落码（独立撤销快照）。
 * 文本类输入在失焦/回车时提交，避免逐字符快照。
 * 关系基数用枚举选择（零或一/恰一/零或多/一或多 × 实线/虚线），不自由文本（工单 03 定案）。
 */

function useCommit() {
  return useEditorStore((s) => s.commitIntent)
}

function clearSelection() {
  useEditorStore.getState().select(null)
}

/** 基数枚举选项（i18n 文案） */
function cardinalityOptions(t: (k: string) => string) {
  return ER_CARDINALITIES.map((value) => ({ value, label: t(`app:erCardinalities.${value}`) }))
}

const LINE_OPTIONS: Array<{ value: 'identifying' | 'non-identifying'; token: string }> = [
  { value: 'identifying', token: '--' },
  { value: 'non-identifying', token: '..' },
]

function lineTokenOf(kind: string): string {
  return LINE_OPTIONS.find((o) => o.value === kind)?.token ?? '--'
}

/** 基数符号 → 语义枚举（表单值）；清单外符号回落恰一显示（选中才会规范化源码） */
function semanticOf(token: string, side: 'left' | 'right'): ErCardinality {
  return erCardinalityOf(token, side) ?? 'one'
}

function tokenOf(value: string | null, side: 'left' | 'right'): string {
  const c = (value ?? 'one') as ErCardinality
  return (side === 'left' ? ER_CARD_LEFT_OF : ER_CARD_RIGHT_OF)[c]
}

// ---------- 实体 ----------

export function ErEntityForm({ entity }: { entity: ProjectionErEntity }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const aliasDraft = useDraft(entity.alias ?? '', (next) => {
    commitIntent({ type: 'set-alias', name: entity.name, alias: next !== '' ? next : null } satisfies ErIntent)
  })

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.erEntityName', { name: entity.name })}
      </Text>
      <TextInput
        label={t('app:propertyPanel.erAlias')}
        value={aliasDraft.draft}
        onChange={(e) => aliasDraft.setDraft(e.currentTarget.value)}
        onBlur={aliasDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') aliasDraft.commit()
        }}
      />
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-entity', name: entity.name } satisfies ErIntent)) clearSelection()
        }}
      >
        {t('app:propertyPanel.deleteErEntity')}
      </Button>
    </Stack>
  )
}

// ---------- 属性 ----------

export function ErAttributeForm({ attribute }: { attribute: ProjectionErAttribute }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const typeDraft = useDraft(attribute.type, (next) => {
    commitIntent({ type: 'set-attribute', elementId: attribute.elementId, changes: { type: next } } satisfies ErIntent)
  })
  const nameDraft = useDraft(attribute.name, (next) => {
    commitIntent({ type: 'set-attribute', elementId: attribute.elementId, changes: { name: next } } satisfies ErIntent)
  })
  const commentDraft = useDraft(attribute.comment ?? '', (next) => {
    commitIntent({
      type: 'set-attribute',
      elementId: attribute.elementId,
      changes: { comment: next !== '' ? next : null },
    } satisfies ErIntent)
  })
  const toggleKey = (key: string, checked: boolean) => {
    const keys = checked
      ? [...attribute.keys, key]
      : attribute.keys.filter((k) => k !== key)
    commitIntent({ type: 'set-attribute', elementId: attribute.elementId, changes: { keys } } satisfies ErIntent)
  }

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.erAttrOwner', { entity: attribute.entity })} · {attribute.name}
      </Text>
      <TextInput
        label={t('app:propertyPanel.erAttrType')}
        value={typeDraft.draft}
        onChange={(e) => typeDraft.setDraft(e.currentTarget.value)}
        onBlur={typeDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') typeDraft.commit()
        }}
      />
      <TextInput
        label={t('app:propertyPanel.erAttrName')}
        value={nameDraft.draft}
        onChange={(e) => nameDraft.setDraft(e.currentTarget.value)}
        onBlur={nameDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') nameDraft.commit()
        }}
      />
      <Group gap="sm">
        <Checkbox
          label={t('app:propertyPanel.erKeyPk')}
          checked={attribute.keys.includes('PK')}
          onChange={(e) => toggleKey('PK', e.currentTarget.checked)}
        />
        <Checkbox
          label={t('app:propertyPanel.erKeyFk')}
          checked={attribute.keys.includes('FK')}
          onChange={(e) => toggleKey('FK', e.currentTarget.checked)}
        />
        <Checkbox
          label={t('app:propertyPanel.erKeyUk')}
          checked={attribute.keys.includes('UK')}
          onChange={(e) => toggleKey('UK', e.currentTarget.checked)}
        />
      </Group>
      <Checkbox
        label={t('app:propertyPanel.erAttrNullable')}
        checked={attribute.nullable}
        onChange={(e) => {
          commitIntent({
            type: 'set-attribute',
            elementId: attribute.elementId,
            changes: { nullable: e.currentTarget.checked },
          } satisfies ErIntent)
        }}
      />
      <TextInput
        label={t('app:propertyPanel.erAttrComment')}
        value={commentDraft.draft}
        onChange={(e) => commentDraft.setDraft(e.currentTarget.value)}
        onBlur={commentDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commentDraft.commit()
        }}
      />
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-attribute', elementId: attribute.elementId } satisfies ErIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteErAttribute')}
      </Button>
    </Stack>
  )
}

// ---------- 关系 ----------

export function ErRelationForm({ relation }: { relation: ProjectionErRelation }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const labelDraft = useDraft(relation.label ?? '', (next) => {
    commitIntent({
      type: 'set-relation',
      elementId: relation.elementId,
      changes: { label: next !== '' ? next : null },
    } satisfies ErIntent)
  })
  const leftOptions = cardinalityOptions(t)
  const rightOptions = cardinalityOptions(t)

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {relation.from} → {relation.to}
      </Text>
      <Group grow>
        <Select
          label={t('app:propertyPanel.erCardLeft')}
          data={leftOptions}
          value={semanticOf(relation.cardLeft, 'left')}
          onChange={(value) => {
            commitIntent({
              type: 'set-relation',
              elementId: relation.elementId,
              changes: { cardLeft: tokenOf(value, 'left') },
            } satisfies ErIntent)
          }}
          allowDeselect={false}
        />
        <Select
          label={t('app:propertyPanel.erCardRight')}
          data={rightOptions}
          value={semanticOf(relation.cardRight, 'right')}
          onChange={(value) => {
            commitIntent({
              type: 'set-relation',
              elementId: relation.elementId,
              changes: { cardRight: tokenOf(value, 'right') },
            } satisfies ErIntent)
          }}
          allowDeselect={false}
        />
      </Group>
      <Select
        label={t('app:propertyPanel.erLineType')}
        data={LINE_OPTIONS.map((o) => ({ value: o.value, label: t(`app:erLines.${o.value}`) }))}
        value={relation.line}
        onChange={(value) => {
          if (value === null) return
          commitIntent({
            type: 'set-relation',
            elementId: relation.elementId,
            changes: { line: lineTokenOf(value) },
          } satisfies ErIntent)
        }}
        allowDeselect={false}
      />
      <TextInput
        label={t('app:propertyPanel.erRelationLabel')}
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
          if (commitIntent({ type: 'delete-relation', elementId: relation.elementId } satisfies ErIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteErRelation')}
      </Button>
    </Stack>
  )
}

// ---------- 添加属性（右键菜单 / Tab 键路径的浮层小表单） ----------

export function AddErAttributeInlineForm({
  entity,
  afterElementId,
  onDone,
}: {
  /** 目标实体名（右键的那个实体 / Tab 时的选中实体） */
  entity: string
  /** 落码锚点：实体有块时为块内最后一个属性 ?? 声明行；缺省 = 文档最后一个元素 */
  afterElementId?: string
  onDone: () => void
}) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const [type, setType] = useState('string')
  const [name, setName] = useState('')
  const [pk, setPk] = useState(false)
  const [nullable, setNullable] = useState(false)
  const [comment, setComment] = useState('')
  const valid = type.trim() !== '' && name.trim() !== ''
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.erAttrOwner', { entity })}
      </Text>
      <TextInput
        label={t('app:propertyPanel.erAttrType')}
        value={type}
        onChange={(e) => setType(e.currentTarget.value)}
      />
      <TextInput
        label={t('app:propertyPanel.erAttrName')}
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
      />
      <Group gap="sm">
        <Checkbox label={t('app:propertyPanel.erKeyPk')} checked={pk} onChange={(e) => setPk(e.currentTarget.checked)} />
        <Checkbox
          label={t('app:propertyPanel.erAttrNullable')}
          checked={nullable}
          onChange={(e) => setNullable(e.currentTarget.checked)}
        />
      </Group>
      <TextInput
        label={t('app:propertyPanel.erAttrComment')}
        value={comment}
        onChange={(e) => setComment(e.currentTarget.value)}
      />
      <Button
        disabled={!valid}
        onClick={() => {
          commitIntent({
            type: 'add-attribute',
            entity,
            attrType: type.trim(),
            name: name.trim(),
            keys: pk ? ['PK'] : [],
            nullable,
            comment: comment.trim() !== '' ? comment.trim() : undefined,
            afterElementId,
          } satisfies ErIntent)
          onDone()
        }}
      >
        {t('app:propertyPanel.add')}
      </Button>
    </Stack>
  )
}

// ---------- 添加关系（右键菜单 / Enter 键的浮层小表单） ----------

export function AddErRelationInlineForm({
  entities,
  initialFrom,
  afterElementId,
  onDone,
}: {
  entities: ProjectionErEntity[]
  /** 预选起点实体名（右键的那个实体 / Enter 时的选中实体）；缺省取第一个实体 */
  initialFrom?: string
  /** 落码锚点：新关系插到该元素之后；缺省 = 文档最后一个元素 */
  afterElementId?: string
  onDone: () => void
}) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const options = entities.map((e) => ({ value: e.name, label: e.name }))
  const start = initialFrom ?? entities[0]?.name ?? null
  const [from, setFrom] = useState<string | null>(start)
  const [to, setTo] = useState<string | null>(() => {
    return options.find((o) => o.value !== start)?.value ?? start
  })
  const [cardLeft, setCardLeft] = useState<string | null>('one')
  const [cardRight, setCardRight] = useState<string | null>('one-many')
  const [line, setLine] = useState<string | null>('identifying')
  const [label, setLabel] = useState('')
  return (
    <Stack gap="sm">
      <Group grow>
        <Select label={t('app:propertyPanel.erFrom')} data={options} value={from} onChange={setFrom} allowDeselect={false} />
        <Select label={t('app:propertyPanel.erTo')} data={options} value={to} onChange={setTo} allowDeselect={false} />
      </Group>
      <Group grow>
        <Select
          label={t('app:propertyPanel.erCardLeft')}
          data={cardinalityOptions(t)}
          value={cardLeft}
          onChange={setCardLeft}
          allowDeselect={false}
        />
        <Select
          label={t('app:propertyPanel.erCardRight')}
          data={cardinalityOptions(t)}
          value={cardRight}
          onChange={setCardRight}
          allowDeselect={false}
        />
      </Group>
      <Select
        label={t('app:propertyPanel.erLineType')}
        data={LINE_OPTIONS.map((o) => ({ value: o.value, label: t(`app:erLines.${o.value}`) }))}
        value={line}
        onChange={setLine}
        allowDeselect={false}
      />
      <TextInput
        label={t('app:propertyPanel.erRelationLabel')}
        value={label}
        onChange={(e) => setLabel(e.currentTarget.value)}
      />
      <Button
        onClick={() => {
          if (from === null || to === null) return
          commitIntent({
            type: 'add-relation',
            from,
            to,
            cardLeft: tokenOf(cardLeft, 'left'),
            line: lineTokenOf(line ?? 'identifying'),
            cardRight: tokenOf(cardRight, 'right'),
            label: label !== '' ? label : undefined,
            afterElementId,
          } satisfies ErIntent)
          onDone()
        }}
      >
        {t('app:propertyPanel.add')}
      </Button>
    </Stack>
  )
}
