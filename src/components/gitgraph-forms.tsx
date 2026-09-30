import { Button, Group, NumberInput, Select, Stack, Text, TextInput } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type {
  ProjectionGitgraphBranch,
  ProjectionGitgraphCherryPick,
  ProjectionGitgraphCommit,
  ProjectionGitgraphMerge,
} from '../lib/projection/gitgraph-projection'
import { GITGRAPH_COMMIT_TYPES, type GitgraphIntent } from '../lib/pipeline/gitgraph'
import { useEditorStore } from '../store/editor'
import { useDraft } from './property-forms'

/**
 * gitGraph 属性表单集合（more-diagrams 工单 04）：全部表单值变化都映射为编辑意图，
 * 经 store.commitIntent 走管线手术式落码（独立撤销快照）。
 * 文本类输入在失焦/回车时提交，避免逐字符快照。
 * 画布 DOM 无 data-id（实测降级）：提交 id 不做双击内联编辑，在这里改；
 * 分支名不做改名（牵动 checkout 语义，工单明确），只可改 order 与删除。
 */

function useCommit() {
  return useEditorStore((s) => s.commitIntent)
}

function clearSelection() {
  useEditorStore.getState().select(null)
}

const TYPE_OPTIONS = GITGRAPH_COMMIT_TYPES.map((value) => ({ value, label: value }))

// ---------- 提交 ----------

export function GitgraphCommitForm({ commit }: { commit: ProjectionGitgraphCommit }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const idDraft = useDraft(commit.id ?? '', (next) => {
    commitIntent({
      type: 'set-commit-params',
      elementId: commit.elementId,
      changes: { id: next !== '' ? next : null },
    } satisfies GitgraphIntent)
  })
  const tagDraft = useDraft(commit.tag ?? '', (next) => {
    commitIntent({
      type: 'set-commit-params',
      elementId: commit.elementId,
      changes: { tag: next !== '' ? next : null },
    } satisfies GitgraphIntent)
  })

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.gitCommitOn', { branch: commit.branch })}
      </Text>
      <TextInput
        label={t('app:propertyPanel.gitCommitId')}
        value={idDraft.draft}
        onChange={(e) => idDraft.setDraft(e.currentTarget.value)}
        onBlur={idDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') idDraft.commit()
        }}
      />
      <TextInput
        label={t('app:propertyPanel.gitTag')}
        value={tagDraft.draft}
        onChange={(e) => tagDraft.setDraft(e.currentTarget.value)}
        onBlur={tagDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') tagDraft.commit()
        }}
      />
      <Select
        label={t('app:propertyPanel.gitType')}
        data={TYPE_OPTIONS}
        value={commit.type ?? 'NORMAL'}
        onChange={(value) => {
          if (value === null) return
          commitIntent({
            type: 'set-commit-params',
            elementId: commit.elementId,
            changes: { type: value === 'NORMAL' ? null : value },
          } satisfies GitgraphIntent)
        }}
        allowDeselect={false}
      />
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-commit', elementId: commit.elementId } satisfies GitgraphIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteGitCommit')}
      </Button>
    </Stack>
  )
}

// ---------- 分支 ----------

export function GitgraphBranchForm({ branch }: { branch: ProjectionGitgraphBranch }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {branch.name}
      </Text>
      {/* 改名不做：分支名牵动 checkout/merge 语义（工单明确） */}
      <NumberInput
        label={t('app:propertyPanel.gitOrder')}
        description={t('app:propertyPanel.gitOrderHint')}
        min={0}
        value={branch.order ?? ''}
        onChange={(value) => {
          const next = typeof value === 'number' ? value : null
          if (next === branch.order) return
          if (branch.elementId === null) return
          commitIntent({ type: 'set-branch-order', elementId: branch.elementId, order: next } satisfies GitgraphIntent)
        }}
      />
      <Button
        variant="light"
        onClick={() => {
          // 切回该分支（「merge 回 main」等语句序操作需要；branch 创建即已 checkout）
          commitIntent({ type: 'add-checkout', branch: branch.name } satisfies GitgraphIntent)
        }}
      >
        {t('app:propertyPanel.gitCheckout')}
      </Button>
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-branch', name: branch.name } satisfies GitgraphIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteGitBranch')}
      </Button>
    </Stack>
  )
}

// ---------- merge ----------

export function GitgraphMergeForm({ merge }: { merge: ProjectionGitgraphMerge }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const idDraft = useDraft(merge.id ?? '', (next) => {
    commitIntent({
      type: 'set-commit-params',
      elementId: merge.elementId,
      changes: { id: next !== '' ? next : null },
    } satisfies GitgraphIntent)
  })
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.gitMergeOn', { branch: merge.branch, of: merge.of })}
      </Text>
      <TextInput
        label={t('app:propertyPanel.gitCommitId')}
        value={idDraft.draft}
        onChange={(e) => idDraft.setDraft(e.currentTarget.value)}
        onBlur={idDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') idDraft.commit()
        }}
      />
      <Select
        label={t('app:propertyPanel.gitType')}
        data={TYPE_OPTIONS}
        value={merge.type ?? 'NORMAL'}
        onChange={(value) => {
          if (value === null) return
          commitIntent({
            type: 'set-commit-params',
            elementId: merge.elementId,
            changes: { type: value === 'NORMAL' ? null : value },
          } satisfies GitgraphIntent)
        }}
        allowDeselect={false}
      />
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-merge', elementId: merge.elementId } satisfies GitgraphIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteGitMerge')}
      </Button>
    </Stack>
  )
}

// ---------- cherry-pick ----------

export function GitgraphCherryPickForm({ pick }: { pick: ProjectionGitgraphCherryPick }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const idDraft = useDraft(pick.id ?? '', (next) => {
    commitIntent({
      type: 'set-commit-params',
      elementId: pick.elementId,
      changes: { id: next !== '' ? next : null },
    } satisfies GitgraphIntent)
  })
  const parentDraft = useDraft(pick.parent ?? '', (next) => {
    commitIntent({
      type: 'set-commit-params',
      elementId: pick.elementId,
      changes: { parent: next !== '' ? next : null },
    } satisfies GitgraphIntent)
  })
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.gitCherryPickOn', { branch: pick.branch })}
      </Text>
      <Group grow>
        <TextInput
          label={t('app:propertyPanel.gitCherryPickSource')}
          value={idDraft.draft}
          onChange={(e) => idDraft.setDraft(e.currentTarget.value)}
          onBlur={idDraft.commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') idDraft.commit()
          }}
        />
        <TextInput
          label={t('app:propertyPanel.gitCherryPickParent')}
          value={parentDraft.draft}
          onChange={(e) => parentDraft.setDraft(e.currentTarget.value)}
          onBlur={parentDraft.commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') parentDraft.commit()
          }}
        />
      </Group>
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-cherry-pick', elementId: pick.elementId } satisfies GitgraphIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteGitCherryPick')}
      </Button>
    </Stack>
  )
}
