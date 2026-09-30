import { useState } from 'react'
import { Button, Checkbox, Group, Select, Stack, Text, TextInput } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type {
  ProjectionRequirement,
  ProjectionRequirementElement,
  ProjectionRequirementRelation,
} from '../lib/projection/requirement-projection'
import {
  isValidRequirementName,
  REQUIREMENT_ELEMENT_FIELDS,
  REQUIREMENT_FIELDS,
  REQUIREMENT_RELATION_KINDS,
  REQUIREMENT_RISKS,
  REQUIREMENT_TYPES,
  REQUIREMENT_VERIFY_METHODS,
  type RequirementFieldKind,
  type RequirementIntent,
} from '../lib/pipeline/requirement'
import { useEditorStore } from '../store/editor'
import { useDraft } from './property-forms'

/**
 * requirement 属性表单集合（more-diagrams 工单 07）：全部表单值变化都映射为编辑意图，
 * 经 store.commitIntent 走管线手术式落码（独立撤销快照）。
 * 文本类输入在失焦/回车时提交，避免逐字符快照。
 *
 * 引号语义（工单 07 定案 + research/timeline-kanban-requirement.md）：字段值可以带引号
 * （可含关键字与 markdown），也可以裸写。表单编辑**保持原有书写形态**——原先带引号的
 * 值改后仍带引号；原先裸写的值改后若会撞关键字/禁字符，由管线侧的
 * isSafelyUnquotedRequirementValue 判定（表单层把「引号形态」随意图传下去，
 * 裸写不安全时管线自动补引号，源码始终合法）。
 */

function useCommit() {
  return useEditorStore((s) => s.commitIntent)
}

function clearSelection() {
  useEditorStore.getState().select(null)
}

/** 风险枚举选项（i18n 文案） */
function riskOptions(t: (k: string) => string) {
  return REQUIREMENT_RISKS.map((value) => ({ value, label: t(`app:requirementRisks.${value}`) }))
}

/** 验证方式枚举选项 */
function verifyOptions(t: (k: string) => string) {
  return REQUIREMENT_VERIFY_METHODS.map((value) => ({ value, label: t(`app:requirementVerifies.${value}`) }))
}

/** 关系 kind 枚举选项 */
function relationKindOptions(t: (k: string) => string) {
  return REQUIREMENT_RELATION_KINDS.map((value) => ({ value, label: t(`app:requirementKinds.${value}`) }))
}

/** 字段文本输入：失焦/回车提交；空值 = 删除该字段行（意图 value null） */
function FieldInput({
  label,
  initial,
  commit,
}: {
  label: string
  initial: string
  commit: (next: string) => void
}) {
  const draft = useDraft(initial, commit)
  return (
    <TextInput
      label={label}
      value={draft.draft}
      onChange={(e) => draft.setDraft(e.currentTarget.value)}
      onBlur={draft.commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') draft.commit()
      }}
    />
  )
}

// ---------- requirement 块（节点） ----------

export function RequirementNodeForm({ requirement }: { requirement: ProjectionRequirement }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const setField = (field: RequirementFieldKind, value: string | null) =>
    commitIntent({ type: 'set-requirement-field', requirement: requirement.name, field, value } satisfies RequirementIntent)

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.requirementOwner', { name: requirement.name })} ·{' '}
        {t(`app:requirementTypes.${requirement.type}`, { defaultValue: requirement.type })}
      </Text>
      {REQUIREMENT_FIELDS.map((field) => {
        const current = requirement.fields.find((f) => f.field === field)
        if (field === 'risk') {
          return (
            <Select
              key={field}
              label={t('app:propertyPanel.requirementFieldRisk')}
              data={riskOptions(t)}
              value={requirement.risk ?? null}
              onChange={(value) => setField('risk', value)}
              clearable
              placeholder={t('app:propertyPanel.requirementFieldUnset')}
            />
          )
        }
        if (field === 'verifymethod') {
          return (
            <Select
              key={field}
              label={t('app:propertyPanel.requirementFieldVerify')}
              data={verifyOptions(t)}
              value={requirement.verifymethod ?? null}
              onChange={(value) => setField('verifymethod', value)}
              clearable
              placeholder={t('app:propertyPanel.requirementFieldUnset')}
            />
          )
        }
        return (
          <FieldInput
            key={field}
            label={field === 'id' ? t('app:propertyPanel.requirementFieldId') : t('app:propertyPanel.requirementFieldText')}
            initial={current?.value ?? ''}
            commit={(next) => setField(field, next !== '' ? next : null)}
          />
        )
      })}
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-requirement', name: requirement.name } satisfies RequirementIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteRequirement')}
      </Button>
    </Stack>
  )
}

// ---------- element 块（节点） ----------

export function RequirementElementForm({ element }: { element: ProjectionRequirementElement }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const setField = (field: RequirementFieldKind, value: string | null) =>
    commitIntent({ type: 'set-element-field', element: element.name, field, value } satisfies RequirementIntent)

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.requirementElementOwner', { name: element.name })}
      </Text>
      {REQUIREMENT_ELEMENT_FIELDS.map((field) => {
        const current = element.fields.find((f) => f.field === field)
        return (
          <FieldInput
            key={field}
            label={field === 'type' ? t('app:propertyPanel.requirementElementType') : t('app:propertyPanel.requirementElementDocref')}
            initial={current?.value ?? ''}
            commit={(next) => setField(field, next !== '' ? next : null)}
          />
        )
      })}
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-element', name: element.name } satisfies RequirementIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteRequirementElement')}
      </Button>
    </Stack>
  )
}

// ---------- 关系（连线，位置序身份） ----------

export function RequirementRelationForm({ relation }: { relation: ProjectionRequirementRelation }) {
  const t = useTranslation().t
  const commitIntent = useCommit()

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {relation.from} → {relation.to}
      </Text>
      <Select
        label={t('app:propertyPanel.requirementRelationKind')}
        data={relationKindOptions(t)}
        value={relation.relationKind}
        onChange={(value) => {
          if (value === null) return
          commitIntent({
            type: 'set-relation',
            elementId: relation.elementId,
            changes: { relationKind: value },
          } satisfies RequirementIntent)
        }}
        allowDeselect={false}
      />
      <Checkbox
        label={t('app:propertyPanel.requirementRelationReversed')}
        checked={relation.reversed}
        onChange={(e) => {
          commitIntent({
            type: 'set-relation',
            elementId: relation.elementId,
            changes: { reversed: e.currentTarget.checked },
          } satisfies RequirementIntent)
        }}
      />
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-relation', elementId: relation.elementId } satisfies RequirementIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteRequirementRelation')}
      </Button>
    </Stack>
  )
}

// ---------- 添加 requirement 块（右键空白菜单的浮层小表单；type 在这里选） ----------

export function AddRequirementInlineForm({
  afterElementId,
  onDone,
}: {
  /** 落码锚点：新块插到该元素之后；缺省 = 文档最后一个元素 */
  afterElementId?: string
  onDone: () => void
}) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const [requirementType, setRequirementType] = useState<string>('functionalRequirement')
  const [name, setName] = useState('')
  const valid = name.trim() !== '' && isValidRequirementName(name.trim())
  return (
    <Stack gap="sm">
      <Select
        label={t('app:propertyPanel.requirementType')}
        data={REQUIREMENT_TYPES.map((value) => ({ value, label: t(`app:requirementTypes.${value}`) }))}
        value={requirementType}
        onChange={(value) => {
          if (value !== null) setRequirementType(value)
        }}
        allowDeselect={false}
      />
      <TextInput
        label={t('app:propertyPanel.requirementName')}
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        error={name.trim() !== '' && !valid ? t('app:propertyPanel.requirementNameInvalid') : undefined}
      />
      <Button
        disabled={!valid}
        onClick={() => {
          commitIntent({
            type: 'add-requirement',
            requirementType,
            name: name.trim(),
            afterElementId,
          } satisfies RequirementIntent)
          onDone()
        }}
      >
        {t('app:propertyPanel.add')}
      </Button>
    </Stack>
  )
}

// ---------- 添加 element 块 ----------

export function AddRequirementElementInlineForm({
  afterElementId,
  onDone,
}: {
  afterElementId?: string
  onDone: () => void
}) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const [name, setName] = useState('')
  const valid = name.trim() !== '' && isValidRequirementName(name.trim())
  return (
    <Stack gap="sm">
      <TextInput
        label={t('app:propertyPanel.requirementElementName')}
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        error={name.trim() !== '' && !valid ? t('app:propertyPanel.requirementNameInvalid') : undefined}
      />
      <Button
        disabled={!valid}
        onClick={() => {
          commitIntent({ type: 'add-element', name: name.trim(), afterElementId } satisfies RequirementIntent)
          onDone()
        }}
      >
        {t('app:propertyPanel.add')}
      </Button>
    </Stack>
  )
}

// ---------- 添加关系（节点右键 / Enter 键的浮层小表单） ----------

export function AddRequirementRelationInlineForm({
  requirements,
  elements,
  initialFrom,
  afterElementId,
  onDone,
}: {
  requirements: ProjectionRequirement[]
  elements: ProjectionRequirementElement[]
  /** 预选起点（右键的那个节点 / Enter 时的选中节点）；缺省取第一个节点 */
  initialFrom?: string
  /** 落码锚点：新关系行插到该元素之后；缺省 = 文档最后一个元素 */
  afterElementId?: string
  onDone: () => void
}) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  // 两类节点都可作为关系端点（mermaid 语义允许）；requirement 在前（与方位导航同序）
  const options = [
    ...requirements.map((r) => ({ value: r.name, label: r.name })),
    ...elements.map((e) => ({ value: e.name, label: e.name })),
  ]
  const start = initialFrom ?? options[0]?.value ?? null
  const [from, setFrom] = useState<string | null>(start)
  const [to, setTo] = useState<string | null>(() => options.find((o) => o.value !== start)?.value ?? start)
  const [relationKind, setRelationKind] = useState<string | null>('satisfies')
  return (
    <Stack gap="sm">
      <Group grow>
        <Select label={t('app:propertyPanel.requirementFrom')} data={options} value={from} onChange={setFrom} allowDeselect={false} />
        <Select label={t('app:propertyPanel.requirementTo')} data={options} value={to} onChange={setTo} allowDeselect={false} />
      </Group>
      <Select
        label={t('app:propertyPanel.requirementRelationKind')}
        data={relationKindOptions(t)}
        value={relationKind}
        onChange={setRelationKind}
        allowDeselect={false}
      />
      <Button
        onClick={() => {
          if (from === null || to === null || relationKind === null) return
          commitIntent({
            type: 'add-relation',
            from,
            to,
            relationKind,
            afterElementId,
          } satisfies RequirementIntent)
          onDone()
        }}
      >
        {t('app:propertyPanel.add')}
      </Button>
    </Stack>
  )
}
