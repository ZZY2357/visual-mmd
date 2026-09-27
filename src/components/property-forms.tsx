import { useEffect, useState } from 'react'
import {
  Button,
  ColorInput,
  Group,
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
  LINK_STYLE_OPTIONS,
  SHAPE_OPTIONS,
  addClassDefIntent,
  addEdgeIntent,
  addNodeIntent,
  addSubgraphIntent,
  classDefStyleIntents,
  deleteEdgeIntent,
  deleteNodeIntent,
  deleteSubgraphIntent,
  dasharrayToStyle,
  renameNodeIntent,
  setDirectionIntent,
  setEdgeIntent,
  setNodeShapeIntent,
  setNodeTextIntent,
  setSubgraphTitleIntent,
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

/** 受控草稿输入：外部值变化时同步，失焦/回车时提交 */
function useDraft(value: string, onCommit: (next: string) => void) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = () => {
    if (draft !== value) onCommit(draft)
  }
  return { draft, setDraft, commit }
}

function shapeOptions(t: (k: string) => string) {
  return SHAPE_OPTIONS.map((s) => ({ value: s, label: t(`app:shapes.${s}`) }))
}

// ---------- 图表（方向） ----------

export function DiagramForm({ direction }: { direction: string | null }) {
  const t = useTranslation().t
  const commitIntent = useCommitIntent()
  return (
    <Select
      label={t('app:propertyPanel.direction')}
      data={DIRECTION_OPTIONS.map((d) => ({ value: d, label: t(`app:directions.${d}`) }))}
      value={direction ?? 'TB'}
      onChange={(v) => {
        if (v !== null && v !== direction) commitIntent(setDirectionIntent(v))
      }}
      allowDeselect={false}
    />
  )
}

// ---------- 节点 ----------

export function NodeForm({ node }: { node: ProjectionNode }) {
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
        data={LINK_STYLE_OPTIONS.map((s) => ({ value: s, label: t(`app:linkStyles.${s}`) }))}
        value={edge.spec.lineStyle}
        onChange={(v) => v !== null && apply({ lineStyle: v as never })}
        allowDeselect={false}
      />
      <Select
        label={t('app:propertyPanel.edgeArrow')}
        data={ARROW_OPTIONS.map((a) => ({ value: a, label: t(`app:arrows.${a}`) }))}
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
        data={BORDER_DASH_OPTIONS.map((d) => ({ value: d, label: t(`app:borderDash.${d}`) }))}
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
    </Stack>
  )
}

// ---------- 添加元素（内联小表单） ----------

export function AddNodeInlineForm({ onDone }: { onDone: () => void }) {
  const t = useTranslation().t
  const commitIntent = useCommitIntent()
  const [nodeId, setNodeId] = useState('')
  const [text, setText] = useState('')
  const [shape, setShape] = useState<NodeShapeType>('rectangle')
  return (
    <Stack gap="sm">
      <TextInput label={t('app:propertyPanel.addNode')} value={nodeId} onChange={(e) => setNodeId(e.currentTarget.value)} />
      <TextInput label={t('app:propertyPanel.addNodeText')} value={text} onChange={(e) => setText(e.currentTarget.value)} />
      <Select
        label={t('app:propertyPanel.nodeShape')}
        data={shapeOptions(t)}
        value={shape}
        onChange={(v) => v !== null && setShape(v as NodeShapeType)}
        allowDeselect={false}
      />
      <Button
        onClick={() => {
          const intent = addNodeIntent({ nodeId: nodeId.trim(), text: text.trim(), shape })
          if (intent !== null && commitIntent(intent)) onDone()
        }}
      >
        {t('app:propertyPanel.add')}
      </Button>
    </Stack>
  )
}

export function AddEdgeInlineForm({ nodes, onDone }: { nodes: ProjectionNode[]; onDone: () => void }) {
  const t = useTranslation().t
  const commitIntent = useCommitIntent()
  const [from, setFrom] = useState<string | null>(nodes[0]?.nodeId ?? null)
  const [to, setTo] = useState<string | null>(nodes[1]?.nodeId ?? nodes[0]?.nodeId ?? null)
  const [label, setLabel] = useState('')
  const options = nodes.map((n) => ({ value: n.nodeId, label: n.text ?? n.nodeId }))
  return (
    <Stack gap="sm">
      <Select
        label={t('app:propertyPanel.addEdgeFrom')}
        data={options}
        value={from}
        onChange={setFrom}
        allowDeselect={false}
      />
      <Select
        label={t('app:propertyPanel.addEdgeTo')}
        data={options}
        value={to}
        onChange={setTo}
        allowDeselect={false}
      />
      <TextInput
        label={t('app:propertyPanel.addEdgeLabel')}
        value={label}
        onChange={(e) => setLabel(e.currentTarget.value)}
      />
      <Button
        onClick={() => {
          if (from === null || to === null) return
          const intent = addEdgeIntent({ from, to, label: label.trim() })
          if (intent !== null && commitIntent(intent)) onDone()
        }}
      >
        {t('app:propertyPanel.add')}
      </Button>
    </Stack>
  )
}

export function AddSubgraphInlineForm({ onDone }: { onDone: () => void }) {
  const t = useTranslation().t
  const commitIntent = useCommitIntent()
  const [title, setTitle] = useState('')
  return (
    <Stack gap="sm">
      <TextInput
        label={t('app:propertyPanel.addSubgraphLabel')}
        value={title}
        onChange={(e) => setTitle(e.currentTarget.value)}
      />
      <Button
        onClick={() => {
          if (commitIntent(addSubgraphIntent(title.trim()))) onDone()
        }}
      >
        {t('app:propertyPanel.add')}
      </Button>
    </Stack>
  )
}

export function AddClassDefInlineForm({ onDone }: { onDone: () => void }) {
  const t = useTranslation().t
  const commitIntent = useCommitIntent()
  const [name, setName] = useState('')
  const [fill, setFill] = useState('')
  const [stroke, setStroke] = useState('')
  const [dashStyle, setDashStyle] = useState<BorderDashStyle>('solid')
  const [color, setColor] = useState('')
  return (
    <Stack gap="sm">
      <TextInput label={t('app:propertyPanel.classDefName')} value={name} onChange={(e) => setName(e.currentTarget.value)} />
      <Group grow>
        <ColorInput label={t('app:propertyPanel.styleFill')} value={fill} onChange={setFill} />
        <ColorInput label={t('app:propertyPanel.styleStroke')} value={stroke} onChange={setStroke} />
      </Group>
      <Select
        label={t('app:propertyPanel.styleDash')}
        data={BORDER_DASH_OPTIONS.map((d) => ({ value: d, label: t(`app:borderDash.${d}`) }))}
        value={dashStyle}
        onChange={(v) => v !== null && setDashStyle(v as BorderDashStyle)}
        allowDeselect={false}
      />
      <ColorInput label={t('app:propertyPanel.styleColor')} value={color} onChange={setColor} />
      <Button
        onClick={() => {
          const intent = addClassDefIntent({ name: name.trim(), fill, stroke, dashStyle, color })
          if (intent !== null && commitIntent(intent)) onDone()
        }}
      >
        {t('app:propertyPanel.add')}
      </Button>
    </Stack>
  )
}
