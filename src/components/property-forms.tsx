import { useEffect, useState } from 'react'
import {
  Button,
  ColorInput,
  MultiSelect,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { NodeShapeType } from '../lib/pipeline/flowchart'
import {
  ARROW_OPTIONS,
  BORDER_DASH_OPTIONS,
  DIRECTION_OPTIONS,
  DIRECTION_VALUES,
  LINK_STYLE_OPTIONS,
  SHAPE_OPTIONS,
  applyClassIntent,
  classDefStyleIntents,
  deleteClassDefIntent,
  deleteEdgeIntent,
  deleteNodeIntent,
  deleteSubgraphIntent,
  dasharrayToStyle,
  renameNodeIntent,
  setEdgeIntent,
  setNodeShapeIntent,
  setNodeTextIntent,
  setSubgraphTitleIntent,
  unapplyClassIntent,
  type BorderDashStyle,
} from '../lib/editing/flowchart-forms'
import type {
  ProjectionClassDef,
  ProjectionEdge,
  ProjectionNode,
  ProjectionSubgraph,
} from '../lib/projection/flowchart-projection'
import { useEditorStore } from '../store/editor'

/**
 * 属性表单集合（工单 04）：全部表单值变化都映射为编辑意图，经
 * store.commitIntent 走管线手术式落码（独立撤销快照），左侧代码实时变化。
 * 文本类输入在失焦/回车时提交，避免逐字符快照。
 */

/** 提交一个编辑意图；失败（目标不存在等）静默忽略——投影会在源码刷新后修正 */
function useCommitIntent() {
  return useEditorStore((s) => s.commitIntent)
}

/** 受控草稿输入：外部值变化时同步，失焦/回车时提交（sequence 表单复用） */
export function useDraft(value: string, onCommit: (next: string) => void) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = () => {
    if (draft !== value) onCommit(draft)
  }
  return { draft, setDraft, commit }
}

function shapeOptions(t: (k: string) => string) {
  return SHAPE_OPTIONS.map((s) => ({ value: s.value, label: t(s.labelKey) }))
}

// ---------- 图表（方向） ----------

/** 「跟随 Mermaid 默认（不设置方向）」的哨兵值（不是方向 token，仅用于 Select 选项） */
const FOLLOW_DIRECTION_VALUE = '__follow__'

/**
 * 图表方向选择器（flowchart / class 共用，工单 07 起）：
 * - 回显源码里的**原始字符串**（源码是唯一真相源）；手写非法值时如实回显原文并提示，
 *   不假装成某个值（这是主题选择器踩过的坑，见 editor-polish spec 的「选择器回显」）
 * - `allowFollowDefault`：置顶「跟随 Mermaid 默认（不设置方向）」，选中即删除源码里的
 *   direction 行；flowchart 的方向来自表头 token（`flowchart TD`）、没有「不设置」的形态，
 *   故 flowchart 不启用
 * - `knownDirections`：判定「手写值」时的合法取值全集（flowchart 的 `TD` 是 TB 的合法别名，
 *   不应当被当成手写值）
 */
export function DiagramForm({
  direction,
  onSelect,
  allowFollowDefault = false,
  knownDirections = DIRECTION_VALUES,
}: {
  direction: string | null
  /** `null` = 选「跟随 Mermaid 默认」（仅 allowFollowDefault 时可能传回） */
  onSelect: (direction: string | null) => void
  allowFollowDefault?: boolean
  knownDirections?: readonly string[]
}) {
  const t = useTranslation().t
  // 手写值：不在已知取值里 → 如实回显原文（mermaid 会忽略它并回退到默认）
  const unknownRaw = direction !== null && !knownDirections.includes(direction) ? direction : null
  return (
    <Select
      label={t('app:propertyPanel.direction')}
      aria-label={t('app:propertyPanel.direction')}
      data={[
        ...(allowFollowDefault
          ? [{ value: FOLLOW_DIRECTION_VALUE, label: t('app:directions.followDefault') }]
          : []),
        ...DIRECTION_OPTIONS.map((d) => ({ value: d.value, label: t(d.labelKey) })),
        ...(unknownRaw === null ? [] : [{ value: unknownRaw, label: unknownRaw }]),
      ]}
      // 无「跟随」形态（flowchart）时沿用旧口径：表头必有方向，缺省即 mermaid 的 TB
      value={allowFollowDefault ? (direction ?? FOLLOW_DIRECTION_VALUE) : (direction ?? 'TB')}
      error={unknownRaw === null ? undefined : t('app:propertyPanel.directionInvalid')}
      onChange={(v) => {
        if (v === null) return
        const next = v === FOLLOW_DIRECTION_VALUE ? null : v
        if (next === direction) return
        onSelect(next)
      }}
      allowDeselect={false}
    />
  )
}

// ---------- 节点 ----------

export function NodeForm({
  node,
  classDefs,
  appliedStyles,
}: {
  node: ProjectionNode
  /** 当前图的全部 classDef（应用样式下拉的选项来源） */
  classDefs: ProjectionClassDef[]
  /** 全部节点的已应用样式（节点 id → 样式名列表） */
  appliedStyles: Record<string, string[]>
}) {
  const t = useTranslation().t
  const commitIntent = useCommitIntent()
  const textDraft = useDraft(node.text ?? '', (next) => {
    commitIntent(setNodeTextIntent(node.nodeId, next))
  })
  const idDraft = useDraft(node.nodeId, (next) => {
    const intent = renameNodeIntent(node.nodeId, next)
    if (intent !== null && commitIntent(intent)) {
      // 改名后旧选中态失效：跟随到新 id
      useEditorStore.getState().select({ kind: 'node', nodeId: next })
    }
  })
  const applied = appliedStyles[node.nodeId] ?? []

  return (
    <Stack gap="sm">
      <TextInput
        label={t('app:propertyPanel.nodeText')}
        value={textDraft.draft}
        onChange={(e) => textDraft.setDraft(e.currentTarget.value)}
        onBlur={textDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') textDraft.commit()
        }}
      />
      <Select
        label={t('app:propertyPanel.nodeShape')}
        data={shapeOptions(t)}
        value={node.shape ?? 'rectangle'}
        onChange={(v) => {
          if (v !== null) commitIntent(setNodeShapeIntent(node.nodeId, v as NodeShapeType))
        }}
        allowDeselect={false}
      />
      <MultiSelect
        label={t('app:propertyPanel.applyStyles')}
        data={classDefs.map((c) => ({ value: c.name, label: c.name }))}
        value={applied}
        placeholder={
          classDefs.length === 0 ? t('app:propertyPanel.applyStylesEmpty') : undefined
        }
        searchable
        onChange={(values) => {
          // 勾选落码为 class 语句，取消勾选摘除；一个节点可挂多个样式
          for (const name of values) {
            if (!applied.includes(name)) commitIntent(applyClassIntent(node.nodeId, name))
          }
          for (const name of applied) {
            if (!values.includes(name)) commitIntent(unapplyClassIntent(node.nodeId, name))
          }
        }}
      />
      <TextInput
        label={t('app:propertyPanel.nodeId')}
        value={idDraft.draft}
        onChange={(e) => idDraft.setDraft(e.currentTarget.value)}
        onBlur={idDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') idDraft.commit()
        }}
        error={renameNodeIntent(node.nodeId, idDraft.draft) === null && idDraft.draft !== node.nodeId
          ? t('app:propertyPanel.invalidId')
          : undefined}
      />
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent(deleteNodeIntent(node.nodeId))) {
            useEditorStore.getState().select(null)
          }
        }}
      >
        {t('app:propertyPanel.deleteNode')}
      </Button>
    </Stack>
  )
}

// ---------- 连线 ----------

export function EdgeForm({ edge }: { edge: ProjectionEdge }) {
  const t = useTranslation().t
  const commitIntent = useCommitIntent()
  const labelDraft = useDraft(edge.label ?? '', (next) => {
    commitIntent(setEdgeIntent(edge.from, edge.to, edge.occurrence, { label: next !== '' ? next : null }))
  })
  const apply = (partial: Parameters<typeof setEdgeIntent>[3]) => {
    commitIntent(setEdgeIntent(edge.from, edge.to, edge.occurrence, partial))
  }

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.edgeFrom')}: {edge.from}　{t('app:propertyPanel.edgeTo')}: {edge.to}
      </Text>
      <Select
        label={t('app:propertyPanel.edgeLineStyle')}
        data={LINK_STYLE_OPTIONS.map((s) => ({ value: s.value, label: t(s.labelKey) }))}
        value={edge.spec.lineStyle}
        onChange={(v) => v !== null && apply({ lineStyle: v as never })}
        allowDeselect={false}
      />
      <Select
        label={t('app:propertyPanel.edgeArrow')}
        data={ARROW_OPTIONS.map((a) => ({ value: a.value, label: t(a.labelKey) }))}
        value={edge.spec.head}
        onChange={(v) => v !== null && apply({ head: v as never })}
        allowDeselect={false}
      />
      <Switch
        label={t('app:propertyPanel.edgeBidirectional')}
        checked={edge.spec.bidirectional}
        onChange={(e) => apply({ bidirectional: e.currentTarget.checked })}
      />
      <NumberInput
        label={t('app:propertyPanel.edgeLength')}
        min={1}
        max={6}
        value={edge.spec.length}
        onChange={(v) => {
          if (typeof v === 'number' && v !== edge.spec.length) apply({ length: v })
        }}
      />
      <TextInput
        label={t('app:propertyPanel.edgeLabelField')}
        placeholder={t('app:propertyPanel.edgeLabelPlaceholder')}
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
          if (commitIntent(deleteEdgeIntent(edge.from, edge.to, edge.occurrence))) {
            useEditorStore.getState().select(null)
          }
        }}
      >
        {t('app:propertyPanel.deleteEdge')}
      </Button>
    </Stack>
  )
}

// ---------- 子图 ----------

export function SubgraphForm({ subgraph }: { subgraph: ProjectionSubgraph }) {
  const t = useTranslation().t
  const commitIntent = useCommitIntent()
  const titleDraft = useDraft(subgraph.title ?? subgraph.id ?? '', (next) => {
    commitIntent(setSubgraphTitleIntent(subgraph.elementId, next))
  })
  return (
    <Stack gap="sm">
      <TextInput
        label={t('app:propertyPanel.subgraphTitle')}
        value={titleDraft.draft}
        onChange={(e) => titleDraft.setDraft(e.currentTarget.value)}
        onBlur={titleDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') titleDraft.commit()
        }}
      />
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent(deleteSubgraphIntent(subgraph.elementId))) {
            useEditorStore.getState().select(null)
          }
        }}
      >
        {t('app:propertyPanel.deleteSubgraph')}
      </Button>
    </Stack>
  )
}

// ---------- classDef 常用样式 ----------

export function ClassDefForm({ classDef }: { classDef: ProjectionClassDef }) {
  const t = useTranslation().t
  const commitIntent = useCommitIntent()
  const dashStyle = dasharrayToStyle(classDef.props['stroke-dasharray'])
  const commitStyle = (style: Parameters<typeof classDefStyleIntents>[1]) => {
    for (const intent of classDefStyleIntents(classDef.name, style)) {
      commitIntent(intent)
    }
  }
  const fillDraft = useDraft(classDef.props.fill ?? '', (v) => commitStyle({ fill: v }))
  const strokeDraft = useDraft(classDef.props.stroke ?? '', (v) => commitStyle({ stroke: v }))
  const colorDraft = useDraft(classDef.props.color ?? '', (v) => commitStyle({ color: v }))

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        classDef {classDef.name}
      </Text>
      <ColorInput
        label={t('app:propertyPanel.styleFill')}
        value={fillDraft.draft}
        onChange={fillDraft.setDraft}
        onBlur={fillDraft.commit}
        closeOnColorSwatchClick
      />
      <ColorInput
        label={t('app:propertyPanel.styleStroke')}
        value={strokeDraft.draft}
        onChange={strokeDraft.setDraft}
        onBlur={strokeDraft.commit}
        closeOnColorSwatchClick
      />
      <Select
        label={t('app:propertyPanel.styleDash')}
        data={BORDER_DASH_OPTIONS.map((d) => ({ value: d.value, label: t(d.labelKey) }))}
        value={dashStyle}
        onChange={(v) => v !== null && commitStyle({ dashStyle: v as BorderDashStyle })}
        allowDeselect={false}
      />
      <ColorInput
        label={t('app:propertyPanel.styleColor')}
        value={colorDraft.draft}
        onChange={colorDraft.setDraft}
        onBlur={colorDraft.commit}
        closeOnColorSwatchClick
      />
      <Button
        variant="light"
        color="red"
        onClick={() => {
          // 删除 classDef 同步清理引用它的 class 语句（工单 02）
          if (commitIntent(deleteClassDefIntent(classDef.name))) {
            useEditorStore.getState().select(null)
          }
        }}
      >
        {t('app:propertyPanel.deleteClassDef')}
      </Button>
    </Stack>
  )
}
