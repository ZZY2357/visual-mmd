import { Button, Select, Stack, Text, TextInput } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type {
  ProjectionUsecaseNode,
  ProjectionUsecaseRelation,
  UsecaseProjection,
} from '../lib/projection/usecase-projection'
import { isValidUsecaseId, isValidUsecaseLabel, type UsecaseIntent } from '../lib/pipeline/usecase'
import { useEditorStore } from '../store/editor'
import { useDraft } from './property-forms'

/**
 * usecase 属性表单集合（more-diagrams 工单 26）：全部表单值变化都映射为编辑意图，
 * 经 store.commitIntent 走管线手术式落码（独立撤销快照）。
 * 文本类输入在失焦/回车时提交，避免逐字符快照。
 *
 * 分层边界（以 research §2/§3 为准）：actor / 用例 / 边界 / 关系的标签与种类在表单编辑；
 * 边界内只允许声明行——加/删边界不在此表单（走右键菜单 `systemBoundary … end`）；
 * 关系端点是标识符，不做下拉（改为直接输入标识符，由 isValidUsecaseId 门卫）。
 */

function useCommit() {
  return useEditorStore((s) => s.commitIntent)
}

function clearSelection() {
  useEditorStore.getState().select(null)
}

// ---------- 图表（标题） ----------

export function UsecaseDiagramForm({ projection }: { projection: UsecaseProjection }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const titleDraft = useDraft('', (next) => {
    commitIntent({ type: 'set-usecase-title', text: next } satisfies UsecaseIntent)
  })

  return (
    <Stack gap="sm">
      <TextInput
        label={t('app:propertyPanel.usecaseTitle')}
        placeholder={t('app:propertyPanel.usecaseTitle')}
        value={titleDraft.draft}
        onChange={(e) => titleDraft.setDraft(e.currentTarget.value)}
        onBlur={titleDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') titleDraft.commit()
        }}
      />
      <Text size="xs" c="dimmed">
        {t('app:propertyPanel.usecaseDiagramHint', {
          actors: projection.nodes.filter((n) => n.nodeKind === 'actor').length,
          cases: projection.nodes.filter((n) => n.nodeKind === 'usecase').length,
          boundaries: projection.boundaries.length,
          relations: projection.relations.length,
        })}
      </Text>
    </Stack>
  )
}

// ---------- actor / 用例 ----------

export function UsecaseNodeForm({ node }: { node: ProjectionUsecaseNode }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const labelDraft = useDraft(node.label, (next) => {
    const trimmed = next.trim()
    if (trimmed !== '' && !isValidUsecaseLabel(trimmed)) return
    commitIntent({
      type: 'set-usecase-label',
      elementId: node.elementId,
      label: trimmed === '' ? null : trimmed,
    } satisfies UsecaseIntent)
  })
  const idDraft = useDraft(node.id, (next) => {
    if (next === node.id || !isValidUsecaseId(next)) return
    commitIntent({ type: 'rename-usecase-id', elementId: node.elementId, id: next } satisfies UsecaseIntent)
  })

  const isActor = node.nodeKind === 'actor'
  const isBoundary = node.nodeKind === 'boundary'

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {isActor
          ? t('app:propertyPanel.usecaseActorHint', { id: node.id })
          : isBoundary
            ? t('app:propertyPanel.usecaseBoundaryHint', { id: node.id })
            : t('app:propertyPanel.usecaseCaseHint', { id: node.id })}
      </Text>
      <TextInput
        label={t('app:propertyPanel.usecaseLabel')}
        value={labelDraft.draft}
        error={
          labelDraft.draft.trim() === '' || isValidUsecaseLabel(labelDraft.draft.trim())
            ? undefined
            : t('app:propertyPanel.invalidUsecaseLabel')
        }
        onChange={(e) => labelDraft.setDraft(e.currentTarget.value)}
        onBlur={labelDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') labelDraft.commit()
        }}
      />
      <TextInput
        label={t('app:propertyPanel.usecaseIdentifier')}
        description={t('app:propertyPanel.usecaseIdentifierHint')}
        value={idDraft.draft}
        error={isValidUsecaseId(idDraft.draft) ? undefined : t('app:propertyPanel.invalidUsecaseId')}
        onChange={(e) => idDraft.setDraft(e.currentTarget.value)}
        onBlur={idDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') idDraft.commit()
        }}
      />
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-usecase-element', elementId: node.elementId } satisfies UsecaseIntent)) {
            clearSelection()
          }
        }}
      >
        {isActor
          ? t('app:propertyPanel.deleteUsecaseActor')
          : isBoundary
            ? t('app:propertyPanel.deleteUsecaseBoundary')
            : t('app:propertyPanel.deleteUsecaseCase')}
      </Button>
    </Stack>
  )
}

// ---------- 关系 ----------

const RELATION_KIND_OPTIONS = [
  { value: 'assoc', label: 'assoc' },
  { value: 'include', label: 'include' },
  { value: 'extend', label: 'extend' },
  { value: 'generalization', label: 'generalization' },
] as const

/** 关系种类 → 算子（落在源码的 HTML 上；research §2 的语义关系三种 + 7 种实心关联的缺省） */
const OPERATOR_OF: Record<string, string> = {
  assoc: '-->',
  include: '..>',
  extend: '..>',
  generalization: '--|>',
}

export function UsecaseRelationForm({ relation }: { relation: ProjectionUsecaseRelation }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const labelDraft = useDraft(relation.label ?? '', (next) => {
    const trimmed = next.trim()
    if (trimmed !== '' && !isValidUsecaseLabel(trimmed)) return
    commitIntent({
      type: 'set-relation-label',
      elementId: relation.elementId,
      label: trimmed === '' ? null : trimmed,
    } satisfies UsecaseIntent)
  })

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.usecaseRelationHint', {
          source: relation.source,
          target: relation.target,
          operator: relation.operator,
        })}
      </Text>
      <Select
        label={t('app:propertyPanel.usecaseRelationKind')}
        data={RELATION_KIND_OPTIONS}
        value={relation.relationKind}
        onChange={(value) => {
          if (value === null || value === relation.relationKind) return
          const operator = OPERATOR_OF[value]
          if (operator === undefined) return
          // 语义关系（include / extend）用标签区分种类，assoc 的 7 种算子在属性面板不改
          commitIntent({
            type: 'set-relation-label',
            elementId: relation.elementId,
            label: relation.label,
          } satisfies UsecaseIntent)
        }}
      />
      <TextInput
        label={t('app:propertyPanel.usecaseRelationLabel')}
        value={labelDraft.draft}
        error={
          labelDraft.draft.trim() === '' || isValidUsecaseLabel(labelDraft.draft.trim())
            ? undefined
            : t('app:propertyPanel.invalidUsecaseLabel')
        }
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
          if (
            commitIntent({
              type: 'delete-usecase-relation',
              elementId: relation.elementId,
            } satisfies UsecaseIntent)
          ) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteUsecaseRelation')}
      </Button>
    </Stack>
  )
}
