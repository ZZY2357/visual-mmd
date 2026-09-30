import { useState } from 'react'
import { Button, Group, NumberInput, Select, Stack, Text, TextInput } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import {
  type ProjectionBlockEdge,
  type ProjectionBlockGroup,
  type ProjectionBlockNode,
} from '../lib/projection/block-projection'
import {
  BLOCK_SHAPES,
  splitBlockEdgeLine,
  type BlockIntent,
  type BlockShape,
} from '../lib/pipeline/block'
import { useEditorStore } from '../store/editor'
import { useDraft } from './property-forms'

/**
 * block 属性表单集合（more-diagrams 工单 09）：全部表单值变化都映射为编辑意图，
 * 经 store.commitIntent 走管线手术式落码（独立撤销快照）。文本类输入在失焦/回车时提交，
 * 避免逐字符快照。
 *
 * 工单决策的落点：
 * - block_arrow 只做解析 + label 编辑，不做形状/方向编辑（表单如实只读呈现）；
 * - 块图无自动布局，不提供位置/移动编辑（布局 = 书写顺序 + columns）；
 * - 边线可循环枚举选择，标签只在能承载标签的算子上可编（裸 `--`/`==`/`-.` 拒绝）。
 */

/** 可在表单中选择的边算子（全家族；裸 `--`/`==`/`-.` 不能承载标签，选择时联动清空） */
export const BLOCK_EDGE_LINE_OPTIONS = [
  '--',
  '-->',
  '==',
  '==>',
  '-.',
  '-.->',
  'x--x',
  'o--o',
  '<-->',
] as const

function useCommit() {
  return useEditorStore((s) => s.commitIntent)
}

function clearSelection() {
  useEditorStore.getState().select(null)
}

/** 标签文本输入：失焦/回车提交；空值 = 去掉标签变裸形状（意图 label null） */
function LabelInput({
  label,
  initial,
  disabled,
  commit,
}: {
  label: string
  initial: string
  disabled?: boolean
  commit: (next: string) => void
}) {
  const draft = useDraft(initial, commit)
  return (
    <TextInput
      label={label}
      value={draft.draft}
      disabled={disabled}
      onChange={(e) => draft.setDraft(e.currentTarget.value)}
      onBlur={draft.commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') draft.commit()
      }}
    />
  )
}

// ---------- 块节点 ----------

export function BlockNodeForm({ node }: { node: ProjectionBlockNode }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const isArrow = node.shape === 'block_arrow'

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.blockNodeOwner', { id: node.id })}
      </Text>
      <LabelInput
        label={t('app:propertyPanel.blockNodeLabel')}
        initial={node.label ?? ''}
        commit={(next) => {
          const value = next.trim()
          // 块箭头不允许去标签（`id<[]>` 无意义，管线侧同样拒绝）；普通节点空值 = 变裸形状
          if (isArrow && value === '') return
          commitIntent({ type: 'set-node-label', id: node.id, label: value !== '' ? value : null } satisfies BlockIntent)
        }}
      />
      <Select
        label={t('app:propertyPanel.blockNodeShape')}
        data={(isArrow ? ['block_arrow', ...BLOCK_SHAPES] : [...BLOCK_SHAPES]).map((value) => ({
          value,
          label: t(`app:blockShapes.${value}`),
        }))}
        value={node.shape ?? 'none'}
        disabled={isArrow}
        onChange={(value) => {
          if (value === null) return
          if (isArrow) return // 块箭头不做形状编辑（改形状会丢方向串）
          commitIntent({
            type: 'set-node-shape',
            id: node.id,
            shape: value === 'none' ? null : (value as BlockShape),
          } satisfies BlockIntent)
        }}
        allowDeselect={false}
      />
      <NumberInput
        label={t('app:propertyPanel.blockNodeWidth')}
        description={t('app:propertyPanel.blockNodeWidthHint')}
        min={1}
        value={node.width ?? ''}
        onChange={(value) => {
          const width = value === '' || typeof value !== 'number' ? null : value
          if (width === node.width) return
          commitIntent({ type: 'set-node-width', id: node.id, width } satisfies BlockIntent)
        }}
      />
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-node', id: node.id } satisfies BlockIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteBlockNode')}
      </Button>
    </Stack>
  )
}

// ---------- 嵌套块 ----------

export function BlockGroupForm({ group }: { group: ProjectionBlockGroup }) {
  const t = useTranslation().t
  const commitIntent = useCommit()

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.blockGroupOwner', { id: group.id })}
      </Text>
      <Select
        label={t('app:propertyPanel.blockGroupColumns')}
        data={[
          { value: 'auto', label: t('app:propertyPanel.blockColumnsAuto') },
          ...[1, 2, 3, 4, 5, 6].map((n) => ({ value: `${n}`, label: `${n}` })),
        ]}
        value={group.columns === null ? 'auto' : `${group.columns}`}
        onChange={(value) => {
          if (value === null) return
          commitIntent({
            type: 'set-columns',
            groupId: group.id,
            value: value === 'auto' ? 'auto' : Number(value),
          } satisfies BlockIntent)
        }}
        allowDeselect={false}
      />
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-group', id: group.id } satisfies BlockIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteBlockGroup')}
      </Button>
    </Stack>
  )
}

// ---------- 边（位置序身份） ----------

export function BlockEdgeForm({ edge }: { edge: ProjectionBlockEdge }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const canBearLabel = splitBlockEdgeLine(edge.line) !== null

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {edge.from} → {edge.to}
      </Text>
      <Select
        label={t('app:propertyPanel.blockEdgeLine')}
        data={BLOCK_EDGE_LINE_OPTIONS.map((value) => ({ value, label: value }))}
        value={edge.line}
        onChange={(value) => {
          if (value === null || value === edge.line) return
          // 换成不能承载标签的裸算子时联动清空标签（管线侧对带标签的裸算子同样拒绝）
          const changes =
            edge.label !== null && splitBlockEdgeLine(value) === null
              ? { line: value, label: null }
              : { line: value }
          commitIntent({ type: 'set-edge', elementId: edge.elementId, changes } satisfies BlockIntent)
        }}
        allowDeselect={false}
      />
      <LabelInput
        label={t('app:propertyPanel.blockEdgeLabel')}
        initial={edge.label ?? ''}
        disabled={!canBearLabel}
        commit={(next) => {
          const value = next.trim()
          if (value === (edge.label ?? '')) return
          commitIntent({
            type: 'set-edge',
            elementId: edge.elementId,
            changes: { label: value !== '' ? value : null },
          } satisfies BlockIntent)
        }}
      />
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-edge', elementId: edge.elementId } satisfies BlockIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteBlockEdge')}
      </Button>
    </Stack>
  )
}

// ---------- 图表级（title / columns） ----------

export function BlockDiagramForm({
  title,
  columns,
}: {
  title: string | null
  columns: number | 'auto' | null
}) {
  const t = useTranslation().t
  const commitIntent = useCommit()

  return (
    <Stack gap="sm">
      <LabelInput
        label={t('app:propertyPanel.blockTitle')}
        initial={title ?? ''}
        commit={(next) => {
          const value = next.trim()
          if (value === (title ?? '')) return
          commitIntent({ type: 'set-title', value: value !== '' ? value : null } satisfies BlockIntent)
        }}
      />
      <Select
        label={t('app:propertyPanel.blockDiagramColumns')}
        data={[
          { value: 'auto', label: t('app:propertyPanel.blockColumnsAuto') },
          ...[1, 2, 3, 4, 5, 6].map((n) => ({ value: `${n}`, label: `${n}` })),
        ]}
        value={columns === null || columns === 'auto' ? 'auto' : `${columns}`}
        onChange={(value) => {
          if (value === null) return
          commitIntent({
            type: 'set-columns',
            value: value === 'auto' ? 'auto' : Number(value),
          } satisfies BlockIntent)
        }}
        allowDeselect={false}
      />
    </Stack>
  )
}

// ---------- 添加边（Enter 键 / 节点菜单的浮层小表单） ----------

export function AddBlockEdgeInlineForm({
  nodeIds,
  groupIds,
  initialFrom,
  afterElementId,
  onDone,
}: {
  /** 可作端点的块节点 id */
  nodeIds: string[]
  /** 可作端点的嵌套块 id */
  groupIds: string[]
  /** 预选起点（Enter 时的选中节点）；缺省取第一个节点 */
  initialFrom?: string
  /** 落码锚点：新边行插到该元素之后；缺省 = 文档最后一个元素 */
  afterElementId?: string
  onDone: () => void
}) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const options = [
    ...nodeIds.map((id) => ({ value: id, label: id })),
    ...groupIds.map((id) => ({ value: id, label: id })),
  ]
  const start = initialFrom ?? options[0]?.value ?? null
  const [from, setFrom] = useState<string | null>(start)
  const [to, setTo] = useState<string | null>(options.find((o) => o.value !== start)?.value ?? start)
  const [line, setLine] = useState<string>('-->')
  return (
    <Stack gap="sm">
      <Group grow>
        <Select label={t('app:propertyPanel.blockEdgeFrom')} data={options} value={from} onChange={setFrom} allowDeselect={false} />
        <Select label={t('app:propertyPanel.blockEdgeTo')} data={options} value={to} onChange={setTo} allowDeselect={false} />
      </Group>
      <Select
        label={t('app:propertyPanel.blockEdgeLine')}
        data={BLOCK_EDGE_LINE_OPTIONS.map((value) => ({ value, label: value }))}
        value={line}
        onChange={(value) => {
          if (value !== null) setLine(value)
        }}
        allowDeselect={false}
      />
      <Button
        onClick={() => {
          if (from === null || to === null || from === to) return
          commitIntent({ type: 'add-edge', from, to, line, afterElementId } satisfies BlockIntent)
          onDone()
        }}
      >
        {t('app:propertyPanel.add')}
      </Button>
    </Stack>
  )
}
