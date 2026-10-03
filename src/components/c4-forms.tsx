import { Button, Select, Stack, Text, TextInput } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type {
  ProjectionC4Boundary,
  ProjectionC4Element,
  ProjectionC4Relation,
  C4Projection,
} from '../lib/projection/c4-projection'
import {
  C4_ELEMENT_MACROS,
  C4_BOUNDARY_MACROS,
  C4_REL_MACRO_OF,
  isValidC4Alias,
  isValidC4Text,
  type C4Direction,
  type C4Intent,
} from '../lib/pipeline/c4'
import { useEditorStore } from '../store/editor'
import { useDraft } from './property-forms'

/**
 * C4 属性表单集合（more-diagrams 工单 18）：全部表单值变化都映射为编辑意图，经
 * store.commitIntent 走管线手术式落码（独立撤销快照）。文本类输入在失焦/回车时提交，
 * 避免逐字符快照。
 *
 * 分层边界（工单 18 白名单）：
 * - 元素：macro（种类与变体）/ alias（语法标识）/ label（显示文本）/ techn / descr 可编；
 *   sprite / tags / $link 只读展示；
 * - 边界：macro / label 可编（alias 不可改——边界 alias 目前不被关系引用，但改它要动块体
 *   开行，本票不做；改标题走表单）；
 * - 关系：label / techn / descr / 方向可编（方向切换宏名，Rel ↔ Rel_U/D/L/R）。
 *
 * alias 与 label 分离（工单 18 核心约定）：改 alias 走 rename-c4-alias，管线连带重写
 * **引用它的关系端点**（手术改写，其余逐字保留）；改 label 只动显示文本。两者在同一张
 * 表单里分字段编辑。
 */

function useCommit() {
  return useEditorStore((s) => s.commitIntent)
}

function clearSelection() {
  useEditorStore.getState().select(null)
}

/** 边界宏下拉（四类 Boundary + Deployment Node 四类） */
const BOUNDARY_MACRO_OPTIONS = Object.entries(C4_BOUNDARY_MACROS).map(([macro, sig]) => ({
  value: macro,
  label: `${macro}（${sig.boundaryKind}）`,
}))

/** 关系方向下拉（default + 四显式方向；宏名由 C4_REL_MACRO_OF 给出） */
const DIRECTION_OPTIONS: ReadonlyArray<{ value: C4Direction; labelKey: string }> = [
  { value: 'default', labelKey: 'c4RelDirDefault' },
  { value: 'U', labelKey: 'c4RelDirU' },
  { value: 'D', labelKey: 'c4RelDirD' },
  { value: 'L', labelKey: 'c4RelDirL' },
  { value: 'R', labelKey: 'c4RelDirR' },
]

// ---------- 图表（关键字 + 计数） ----------

export function C4DiagramForm({ projection }: { projection: C4Projection }) {
  const t = useTranslation().t
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {projection.keyword !== null
          ? t('app:propertyPanel.c4DiagramKeyword', { keyword: projection.keyword })
          : t('app:propertyPanel.c4DiagramNoKeyword')}
      </Text>
      <Text size="xs" c="dimmed">
        {t('app:propertyPanel.c4DiagramHint', {
          elements: projection.elements.length,
          boundaries: projection.boundaries.length,
          relations: projection.relations.length,
        })}
      </Text>
    </Stack>
  )
}

// ---------- 元素 ----------

export function C4ElementForm({ element }: { element: ProjectionC4Element }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const labelDraft = useDraft(element.label, (next) => {
    const trimmed = next.trim()
    if (trimmed !== '' && !isValidC4Text(trimmed)) return
    commitIntent({
      type: 'set-c4-element',
      elementId: element.elementId,
      changes: { label: trimmed === '' ? null : trimmed },
    } satisfies C4Intent)
  })
  const aliasDraft = useDraft(element.alias, (next) => {
    if (next === element.alias || !isValidC4Alias(next)) return
    commitIntent({ type: 'rename-c4-alias', elementId: element.elementId, alias: next } satisfies C4Intent)
  })
  const technDraft = useDraft(element.techn ?? '', (next) => {
    const trimmed = next.trim()
    if (trimmed !== '' && !isValidC4Text(trimmed)) return
    commitIntent({
      type: 'set-c4-element',
      elementId: element.elementId,
      changes: { techn: trimmed === '' ? null : trimmed },
    } satisfies C4Intent)
  })
  const descrDraft = useDraft(element.descr ?? '', (next) => {
    const trimmed = next.trim()
    if (trimmed !== '' && !isValidC4Text(trimmed)) return
    commitIntent({
      type: 'set-c4-element',
      elementId: element.elementId,
      changes: { descr: trimmed === '' ? null : trimmed },
    } satisfies C4Intent)
  })

  // 元素种类的可切换目标（同 kind 的全部宏）；改 macro 走「删旧 + 加新」是不做的——
  // 本票不做种类迁移，只显示 kind（表单下方 Select 用于**查看**变体族，切换不做落码）
  const sameKindMacros = Object.entries(C4_ELEMENT_MACROS)
    .filter(([, sig]) => sig.kind === element.elementKind)
    .map(([macro]) => macro)

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.c4ElementHint', { macro: element.macro, kind: element.elementKind })}
      </Text>
      <Select
        label={t('app:propertyPanel.c4ElementMacro')}
        data={sameKindMacros.map((m) => ({ value: m, label: m }))}
        value={element.macro}
        disabled
        description={t('app:propertyPanel.c4ElementMacroHint')}
      />
      <TextInput
        label={t('app:propertyPanel.c4Label')}
        value={labelDraft.draft}
        error={
          labelDraft.draft.trim() === '' || isValidC4Text(labelDraft.draft.trim())
            ? undefined
            : t('app:propertyPanel.invalidC4Text')
        }
        onChange={(e) => labelDraft.setDraft(e.currentTarget.value)}
        onBlur={labelDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') labelDraft.commit()
        }}
      />
      <TextInput
        label={t('app:propertyPanel.c4Alias')}
        description={t('app:propertyPanel.c4AliasHint')}
        value={aliasDraft.draft}
        error={isValidC4Alias(aliasDraft.draft) ? undefined : t('app:propertyPanel.invalidC4Alias')}
        onChange={(e) => aliasDraft.setDraft(e.currentTarget.value)}
        onBlur={aliasDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') aliasDraft.commit()
        }}
      />
      {element.elementKind === 'container' || element.elementKind === 'component' ? (
        <TextInput
          label={t('app:propertyPanel.c4Techn')}
          value={technDraft.draft}
          onChange={(e) => technDraft.setDraft(e.currentTarget.value)}
          onBlur={technDraft.commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') technDraft.commit()
          }}
        />
      ) : null}
      <TextInput
        label={t('app:propertyPanel.c4Descr')}
        value={descrDraft.draft}
        onChange={(e) => descrDraft.setDraft(e.currentTarget.value)}
        onBlur={descrDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') descrDraft.commit()
        }}
      />
      {(element.sprite !== null || element.tags !== null || element.link !== null) && (
        <Text size="xs" c="dimmed">
          {t('app:propertyPanel.c4ReadonlyExtras', {
            sprite: element.sprite ?? '—',
            tags: element.tags ?? '—',
            link: element.link ?? '—',
          })}
        </Text>
      )}
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-c4-element', elementId: element.elementId } satisfies C4Intent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteC4Element')}
      </Button>
    </Stack>
  )
}

// ---------- 边界 ----------

export function C4BoundaryForm({ boundary }: { boundary: ProjectionC4Boundary }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const labelDraft = useDraft(boundary.label, (next) => {
    const trimmed = next.trim()
    if (trimmed !== '' && !isValidC4Text(trimmed)) return
    commitIntent({
      type: 'set-c4-boundary',
      elementId: boundary.elementId,
      changes: { label: trimmed === '' ? null : trimmed },
    } satisfies C4Intent)
  })

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.c4BoundaryHint', {
          macro: boundary.macro,
          alias: boundary.alias,
          count: boundary.memberCount,
        })}
      </Text>
      <Select
        label={t('app:propertyPanel.c4BoundaryMacro')}
        data={BOUNDARY_MACRO_OPTIONS}
        value={boundary.macro}
        disabled
        description={t('app:propertyPanel.c4BoundaryMacroHint')}
      />
      <TextInput
        label={t('app:propertyPanel.c4Label')}
        value={labelDraft.draft}
        error={
          labelDraft.draft.trim() === '' || isValidC4Text(labelDraft.draft.trim())
            ? undefined
            : t('app:propertyPanel.invalidC4Text')
        }
        onChange={(e) => labelDraft.setDraft(e.currentTarget.value)}
        onBlur={labelDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') labelDraft.commit()
        }}
      />
      {(boundary.tags !== null || boundary.link !== null) && (
        <Text size="xs" c="dimmed">
          {t('app:propertyPanel.c4ReadonlyTagsLink', {
            tags: boundary.tags ?? '—',
            link: boundary.link ?? '—',
          })}
        </Text>
      )}
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-c4-boundary', elementId: boundary.elementId } satisfies C4Intent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteC4Boundary')}
      </Button>
    </Stack>
  )
}

// ---------- 关系 ----------

export function C4RelationForm({ relation }: { relation: ProjectionC4Relation }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const labelDraft = useDraft(relation.label ?? '', (next) => {
    const trimmed = next.trim()
    if (trimmed !== '' && !isValidC4Text(trimmed)) return
    commitIntent({
      type: 'set-rel',
      elementId: relation.elementId,
      changes: { label: trimmed === '' ? null : trimmed },
    } satisfies C4Intent)
  })
  const technDraft = useDraft(relation.techn ?? '', (next) => {
    const trimmed = next.trim()
    if (trimmed !== '' && !isValidC4Text(trimmed)) return
    commitIntent({
      type: 'set-rel',
      elementId: relation.elementId,
      changes: { techn: trimmed === '' ? null : trimmed },
    } satisfies C4Intent)
  })
  const descrDraft = useDraft(relation.descr ?? '', (next) => {
    const trimmed = next.trim()
    if (trimmed !== '' && !isValidC4Text(trimmed)) return
    commitIntent({
      type: 'set-rel',
      elementId: relation.elementId,
      changes: { descr: trimmed === '' ? null : trimmed },
    } satisfies C4Intent)
  })

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.c4RelationHint', {
          from: relation.from,
          to: relation.to,
          macro: relation.macro,
        })}
      </Text>
      <Select
        label={t('app:propertyPanel.c4RelationDirection')}
        data={DIRECTION_OPTIONS.map((d) => ({ value: d.value, label: t(`app:propertyPanel.${d.labelKey}`) }))}
        value={relation.direction}
        onChange={(value) => {
          if (value === null || value === relation.direction) return
          const direction = value as C4Direction
          // 方向切换由 set-rel 的 direction 改写宏名（C4_REL_MACRO_OF：Rel ↔ Rel_U/D/L/R）
          if (C4_REL_MACRO_OF[direction] === undefined) return
          commitIntent({
            type: 'set-rel',
            elementId: relation.elementId,
            changes: { direction },
          } satisfies C4Intent)
        }}
      />
      <TextInput
        label={t('app:propertyPanel.c4Label')}
        value={labelDraft.draft}
        error={
          labelDraft.draft.trim() === '' || isValidC4Text(labelDraft.draft.trim())
            ? undefined
            : t('app:propertyPanel.invalidC4Text')
        }
        onChange={(e) => labelDraft.setDraft(e.currentTarget.value)}
        onBlur={labelDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') labelDraft.commit()
        }}
      />
      <TextInput
        label={t('app:propertyPanel.c4Techn')}
        value={technDraft.draft}
        onChange={(e) => technDraft.setDraft(e.currentTarget.value)}
        onBlur={technDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') technDraft.commit()
        }}
      />
      <TextInput
        label={t('app:propertyPanel.c4Descr')}
        value={descrDraft.draft}
        onChange={(e) => descrDraft.setDraft(e.currentTarget.value)}
        onBlur={descrDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') descrDraft.commit()
        }}
      />
      {(relation.sprite !== null || relation.tags !== null || relation.link !== null) && (
        <Text size="xs" c="dimmed">
          {t('app:propertyPanel.c4ReadonlyExtras', {
            sprite: relation.sprite ?? '—',
            tags: relation.tags ?? '—',
            link: relation.link ?? '—',
          })}
        </Text>
      )}
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-rel', elementId: relation.elementId } satisfies C4Intent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteC4Relation')}
      </Button>
    </Stack>
  )
}
