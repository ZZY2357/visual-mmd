import { Button, Select, Stack, Text, TextInput } from '@mantine/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  CynefinProjection,
  ProjectionCynefinDomain,
  ProjectionCynefinItem,
  ProjectionCynefinTransition,
} from '../lib/projection/cynefin-projection'
import {
  CYNEFIN_DOMAINS,
  isValidCynefinItemText,
  isValidCynefinLabel,
  type CynefinDomainName,
  type CynefinIntent,
} from '../lib/pipeline/cynefin'
import { useEditorStore } from '../store/editor'
import { useDraft } from './property-forms'

/**
 * cynefin 属性表单集合（more-diagrams 工单 25）：全部表单值变化都映射为编辑意图，
 * 经 store.commitIntent 走管线手术式落码（独立撤销快照）。
 * 文本类输入在失焦/回车时提交，避免逐字符快照。
 *
 * **画布 DOM 无 data-id（research §4/§8.1 实测降级）**：条目不做双击内联编辑，文本在这里改；
 * 转移的 from/to 用**固定五域下拉**（域名词是唯一合法端点，research 坑 6），
 * 标签为自由文本；域名词行本身是固定五域的分组声明语句，不做改名/删除（工单定案）。
 * 结构树 + 这些表单是完整编辑入口。
 */

function clearSelection() {
  useEditorStore.getState().select(null)
}

const DOMAIN_OPTIONS = CYNEFIN_DOMAINS.map((name) => ({ value: name, label: name }))

/** 条目表单：改文本 + 删除（归属域由位置决定，不改属） */
export function CynefinItemForm({ item }: { item: ProjectionCynefinItem }) {
  const t = useTranslation().t
  const commitIntent = useEditorStore((s) => s.commitIntent)
  const textDraft = useDraft(item.text, (next) => {
    if (next === item.text || !isValidCynefinItemText(next)) return
    commitIntent({ type: 'set-item-text', elementId: item.elementId, text: next } satisfies CynefinIntent)
  })

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.cynefinItemHint', { domain: item.domain })}
      </Text>
      <TextInput
        label={t('app:propertyPanel.cynefinItemText')}
        value={textDraft.draft}
        error={isValidCynefinItemText(textDraft.draft) ? undefined : t('app:propertyPanel.cynefinItemTextInvalid')}
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
          if (commitIntent({ type: 'delete-item', elementId: item.elementId } satisfies CynefinIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteCynefinItem')}
      </Button>
    </Stack>
  )
}

/** 域名词行表单：展示归属域与其条目数（域不可改名/删除，工单定案）；加条目入口 */
export function CynefinDomainForm({ domain }: { domain: ProjectionCynefinDomain }) {
  const t = useTranslation().t
  const commitIntent = useEditorStore((s) => s.commitIntent)
  const [newText, setNewText] = useState('')

  const addItem = () => {
    if (!isValidCynefinItemText(newText)) return
    const lastItem = domain.items[domain.items.length - 1]
    if (
      commitIntent({
        type: 'add-item',
        domain: domain.name,
        text: newText,
        afterElementId: lastItem !== undefined ? lastItem.elementId : domain.elementId,
      } satisfies CynefinIntent)
    ) {
      setNewText('')
    }
  }

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.cynefinDomainHint', { count: domain.items.length })}
      </Text>
      <TextInput
        label={t('app:propertyPanel.cynefinNewItem')}
        value={newText}
        error={newText !== '' && !isValidCynefinItemText(newText) ? t('app:propertyPanel.cynefinItemTextInvalid') : undefined}
        onChange={(e) => setNewText(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') addItem()
        }}
      />
      <Button variant="light" disabled={!isValidCynefinItemText(newText)} onClick={addItem}>
        {t('app:propertyPanel.addCynefinItem')}
      </Button>
    </Stack>
  )
}

/** 转移表单：改 from/to（固定五域下拉）+ 改标签 + 删除；自环被管线拒绝（research 坑 5） */
export function CynefinTransitionForm({ transition }: { transition: ProjectionCynefinTransition }) {
  const t = useTranslation().t
  const commitIntent = useEditorStore((s) => s.commitIntent)
  const labelDraft = useDraft(transition.label, (next) => {
    if (next === transition.label || !isValidCynefinLabel(next)) return
    commitIntent({ type: 'set-transition', elementId: transition.elementId, label: next } satisfies CynefinIntent)
  })

  const setEnd = (axis: 'from' | 'to', value: string) => {
    if (!CYNEFIN_DOMAINS.includes(value as CynefinDomainName)) return
    if (axis === 'from') {
      if (value === transition.from) return
      commitIntent({ type: 'set-transition', elementId: transition.elementId, from: value as CynefinDomainName } satisfies CynefinIntent)
    } else {
      if (value === transition.to) return
      commitIntent({ type: 'set-transition', elementId: transition.elementId, to: value as CynefinDomainName } satisfies CynefinIntent)
    }
  }

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.cynefinTransitionHint')}
      </Text>
      <Select
        label={t('app:propertyPanel.cynefinFrom')}
        data={DOMAIN_OPTIONS}
        value={transition.from}
        onChange={(value) => value !== null && setEnd('from', value)}
      />
      <Select
        label={t('app:propertyPanel.cynefinTo')}
        data={DOMAIN_OPTIONS}
        value={transition.to}
        onChange={(value) => value !== null && setEnd('to', value)}
      />
      <TextInput
        label={t('app:propertyPanel.cynefinLabel')}
        value={labelDraft.draft}
        error={isValidCynefinLabel(labelDraft.draft) ? undefined : t('app:propertyPanel.cynefinLabelInvalid')}
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
          if (commitIntent({ type: 'delete-transition', elementId: transition.elementId } satisfies CynefinIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteCynefinTransition')}
      </Button>
    </Stack>
  )
}

/** cynefin 图表级表单：加转移（空白亦可用） */
export function CynefinDiagramForm({ projection }: { projection: CynefinProjection }) {
  const t = useTranslation().t
  const commitIntent = useEditorStore((s) => s.commitIntent)
  const [from, setFrom] = useState<string>(CYNEFIN_DOMAINS[0])
  const [to, setTo] = useState<string>(CYNEFIN_DOMAINS[1])

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.cynefinDiagramHint')}
      </Text>
      <Select label={t('app:propertyPanel.cynefinFrom')} data={DOMAIN_OPTIONS} value={from} onChange={(v) => v !== null && setFrom(v)} />
      <Select label={t('app:propertyPanel.cynefinTo')} data={DOMAIN_OPTIONS} value={to} onChange={(v) => v !== null && setTo(v)} />
      <Button
        variant="light"
        onClick={() => {
          commitIntent({
            type: 'add-transition',
            from: from as CynefinDomainName,
            to: to as CynefinDomainName,
          } satisfies CynefinIntent)
        }}
      >
        {t('app:propertyPanel.addCynefinTransition')}
      </Button>
      <Text size="xs" c="dimmed">
        {t('app:propertyPanel.cynefinTransitionCount', { count: projection.transitions.length })}
      </Text>
    </Stack>
  )
}

/**
 * cynefin 加转移浮层表单（more-diagrams 工单 25）：空白右键 / 转移上 Tab 键共用。
 * 两端从**固定五域下拉**（域名词是唯一合法端点，research 坑 6），标签为自由文本；
 * `initialFrom` 预选起点域（转移上 Tab 时同源预填），`afterElementId` 为落码锚点
 * （缺省回退文档末尾）。自环由管线拒绝（research 坑 5），提交成功即关闭。
 */
export function AddCynefinTransitionInlineForm({
  initialFrom,
  afterElementId,
  onDone,
}: {
  initialFrom?: string
  afterElementId?: string
  onDone: () => void
}) {
  const t = useTranslation().t
  const commitIntent = useEditorStore((s) => s.commitIntent)
  const [from, setFrom] = useState<string>(
    initialFrom !== undefined && CYNEFIN_DOMAINS.includes(initialFrom as CynefinDomainName)
      ? initialFrom
      : CYNEFIN_DOMAINS[0],
  )
  const [to, setTo] = useState<string>(CYNEFIN_DOMAINS[1])
  const [label, setLabel] = useState('')

  return (
    <Stack gap="sm">
      <Select label={t('app:propertyPanel.cynefinFrom')} data={DOMAIN_OPTIONS} value={from} onChange={(v) => v !== null && setFrom(v)} />
      <Select label={t('app:propertyPanel.cynefinTo')} data={DOMAIN_OPTIONS} value={to} onChange={(v) => v !== null && setTo(v)} />
      <TextInput
        label={t('app:propertyPanel.cynefinLabel')}
        value={label}
        error={label !== '' && !isValidCynefinLabel(label) ? t('app:propertyPanel.cynefinLabelInvalid') : undefined}
        onChange={(e) => setLabel(e.currentTarget.value)}
      />
      <Button
        variant="light"
        onClick={() => {
          if (!isValidCynefinLabel(label)) return
          const intent: CynefinIntent = {
            type: 'add-transition',
            from: from as CynefinDomainName,
            to: to as CynefinDomainName,
            ...(label !== '' ? { label } : {}),
            afterElementId,
          }
          if (commitIntent(intent)) onDone()
        }}
      >
        {t('app:propertyPanel.addCynefinTransition')}
      </Button>
    </Stack>
  )
}
