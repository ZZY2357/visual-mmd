import { Button, Select, Stack, Text, TextInput } from '@mantine/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  AgentflowProjection,
  ProjectionAgentflowContainer,
  ProjectionAgentflowDocLine,
  ProjectionAgentflowEdge,
  ProjectionAgentflowNode,
} from '../lib/projection/agentflow-projection'
import {
  AGENTFLOW_DIRECTIONS,
  AGENTFLOW_SHAPES,
  isAgentflowShape,
  isValidNewNodeId,
  type AgentflowEdgeKind,
  type AgentflowIntent,
} from '../lib/pipeline/agentflow'
import { useEditorStore } from '../store/editor'
import { useDraft } from './property-forms'

/**
 * agentflow 属性表单集合（more-diagrams 工单 27）：全部表单值变化都映射为编辑意图，
 * 经 store.commitIntent 走管线手术式落码（独立撤销快照）。文本类输入在失焦/回车时提交，
 * 避免逐字符快照。
 *
 * **节点画布可寻址（research §8.2 实测）**：节点选中后这些表单是形状/文本的编辑入口；
 * **不做双击内联编辑**——节点身份即源码 id，改显示文本是 `set-node-text`（重写全部出现），
 * 改 id 是 `rename-node`（牵动全图引用重写），二者都不适合就地单点编辑（见工单 Comments）。
 * 容器画布无 data-id（`<g class="cluster">` 无 `data-id`、无 `data-et`），
 * **不做画布点选**——容器/文档行由结构树选中，在这里改标题/删除。
 */

function clearSelection() {
  useEditorStore.getState().select(null)
}

const SHAPE_OPTIONS = AGENTFLOW_SHAPES.map((shape) => ({ value: shape, label: shape }))
const DIRECTION_OPTIONS = AGENTFLOW_DIRECTIONS.map((direction) => ({ value: direction, label: direction }))

/** 边语义（三种算子）下拉选项 */
const EDGE_KIND_OPTIONS: ReadonlyArray<{ value: AgentflowEdgeKind; label: string }> = [
  { value: 'sequence', label: '-->' },
  { value: 'reference', label: '-.-' },
  { value: 'failure', label: '--x' },
]

/**
 * 节点表单：改显示文本（`set-node-text`）/ 改形状（`set-node-shape`）/ 改 id
 * （`rename-node`，重写全图引用）/ 删除节点（级联删触及的边）。形状缺省下拉含
 * 全部规范形状；源码里出现的未知形状（如实反映在投影里）也保留为选项，避免静默改写。
 */
export function AgentflowNodeForm({ node, projection }: { node: ProjectionAgentflowNode; projection: AgentflowProjection }) {
  const t = useTranslation().t
  const commitIntent = useEditorStore((s) => s.commitIntent)
  const textDraft = useDraft(node.text ?? '', (next) => {
    if (next === (node.text ?? '')) return
    commitIntent({ type: 'set-node-text', nodeId: node.nodeId, text: next } satisfies AgentflowIntent)
  })
  const idDraft = useDraft(node.nodeId, (next) => {
    if (next === node.nodeId || !isValidNewNodeId(next)) return
    // 新 id 与既有节点重名 → 会让两个节点合流，拒绝（表单层拦，管线亦会因 id 冲突无效）
    if (projection.nodes.some((n) => n.nodeId === next)) return
    commitIntent({ type: 'rename-node', nodeId: node.nodeId, newId: next } satisfies AgentflowIntent)
  })

  // 形状选项：规范形状 + 当前源码里出现的未知形状（如实反映，避免下拉改写）
  const shapeOptions =
    node.shape !== null && !isAgentflowShape(node.shape)
      ? [...SHAPE_OPTIONS, { value: node.shape, label: node.shape }]
      : SHAPE_OPTIONS
  const currentShape = node.shape ?? 'task'

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {node.isConnector ? t('app:propertyPanel.agentflowConnectorHint') : t('app:propertyPanel.agentflowNodeHint')}
      </Text>
      <TextInput
        label={t('app:propertyPanel.agentflowNodeId')}
        value={idDraft.draft}
        error={isValidNewNodeId(idDraft.draft) ? undefined : t('app:propertyPanel.agentflowNodeIdInvalid')}
        onChange={(e) => idDraft.setDraft(e.currentTarget.value)}
        onBlur={idDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') idDraft.commit()
        }}
      />
      <TextInput
        label={t('app:propertyPanel.agentflowNodeText')}
        value={textDraft.draft}
        onChange={(e) => textDraft.setDraft(e.currentTarget.value)}
        onBlur={textDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') textDraft.commit()
        }}
      />
      <Select
        label={t('app:propertyPanel.agentflowNodeShape')}
        data={shapeOptions}
        value={currentShape}
        onChange={(value) => {
          if (value === null || value === node.shape) return
          commitIntent({ type: 'set-node-shape', nodeId: node.nodeId, shape: value } satisfies AgentflowIntent)
        }}
      />
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-node', nodeId: node.nodeId } satisfies AgentflowIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteAgentflowNode')}
      </Button>
    </Stack>
  )
}

/** 边表单：改标签（`set-edge-label`，空串 = 去标签）+ 删除边（整行删） */
export function AgentflowEdgeForm({ edge }: { edge: ProjectionAgentflowEdge }) {
  const t = useTranslation().t
  const commitIntent = useEditorStore((s) => s.commitIntent)
  const labelDraft = useDraft(edge.label, (next) => {
    if (next === edge.label) return
    commitIntent({ type: 'set-edge-label', elementId: edge.elementId, label: next === '' ? null : next } satisfies AgentflowIntent)
  })

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.agentflowEdgeHint', { from: edge.from, to: edge.to })}
      </Text>
      <Select
        label={t('app:propertyPanel.agentflowEdgeKind')}
        data={EDGE_KIND_OPTIONS}
        value={edge.edgeKind}
        disabled
      />
      <TextInput
        label={t('app:propertyPanel.agentflowEdgeLabel')}
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
          if (commitIntent({ type: 'delete-edge', elementId: edge.elementId } satisfies AgentflowIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteAgentflowEdge')}
      </Button>
    </Stack>
  )
}

/** 容器表单：改标题（`set-flow-title`，仅 `flow` 容器有标题）+ 删除容器（连带块内元素） */
export function AgentflowContainerForm({ container }: { container: ProjectionAgentflowContainer }) {
  const t = useTranslation().t
  const commitIntent = useEditorStore((s) => s.commitIntent)
  const titleDraft = useDraft(container.title ?? '', (next) => {
    if (container.keyword !== 'flow' || next === (container.title ?? '')) return
    commitIntent({ type: 'set-flow-title', elementId: container.elementId, title: next } satisfies AgentflowIntent)
  })

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {container.keyword === 'global'
          ? t('app:propertyPanel.agentflowGlobalHint')
          : t('app:propertyPanel.agentflowFlowHint')}
      </Text>
      {container.keyword === 'flow' ? (
        <TextInput
          label={t('app:propertyPanel.agentflowFlowTitle')}
          value={titleDraft.draft}
          onChange={(e) => titleDraft.setDraft(e.currentTarget.value)}
          onBlur={titleDraft.commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') titleDraft.commit()
          }}
        />
      ) : null}
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-flow', elementId: container.elementId } satisfies AgentflowIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteAgentflowFlow')}
      </Button>
    </Stack>
  )
}

/** 文档级属性行表单：只读展示 + 删除（编辑入口 = 源码 / 图表级表单） */
export function AgentflowDocLineForm({ docLine }: { docLine: ProjectionAgentflowDocLine }) {
  const t = useTranslation().t
  const commitIntent = useEditorStore((s) => s.commitIntent)

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.agentflowDocLineHint')}
      </Text>
      <Text size="sm" ff="monospace">
        {docLine.text}
      </Text>
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-doc-line', elementId: docLine.elementId } satisfies AgentflowIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteAgentflowDocLine')}
      </Button>
    </Stack>
  )
}

/**
 * agentflow 图表级表单（more-diagrams 工单 27）：改图方向（`direction` 声明行，
 * 与 flowchart / cynefin 同口径——空值回退 TB）+ 加边（两端从既有节点下拉，
 * 语义三选一，提交才落码）。加节点 / 加 flow 走空白右键菜单（无需此表单）。
 */
export function AgentflowDiagramForm({ projection }: { projection: AgentflowProjection }) {
  const t = useTranslation().t
  const commitIntent = useEditorStore((s) => s.commitIntent)
  const nodeOptions = projection.nodes.map((n) => ({ value: n.nodeId, label: n.text ?? n.nodeId }))
  const [from, setFrom] = useState<string>(projection.nodes[0]?.nodeId ?? '')
  const [to, setTo] = useState<string>(projection.nodes[1]?.nodeId ?? '')
  const [edgeKind, setEdgeKind] = useState<AgentflowEdgeKind>('sequence')
  const [label, setLabel] = useState('')

  const canAddEdge = from !== '' && to !== '' && from !== to

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.agentflowDiagramHint')}
      </Text>
      <Select
        label={t('app:propertyPanel.agentflowDirection')}
        data={DIRECTION_OPTIONS}
        value={projection.direction !== '' ? projection.direction : 'TB'}
        onChange={(value) => {
          if (value === null) return
          commitIntent({ type: 'set-direction', direction: value } satisfies AgentflowIntent)
        }}
      />
      {nodeOptions.length >= 2 ? (
        <>
          <Select label={t('app:propertyPanel.agentflowEdgeFrom')} data={nodeOptions} value={from} onChange={(v) => v !== null && setFrom(v)} />
          <Select label={t('app:propertyPanel.agentflowEdgeTo')} data={nodeOptions} value={to} onChange={(v) => v !== null && setTo(v)} />
          <Select
            label={t('app:propertyPanel.agentflowEdgeKind')}
            data={EDGE_KIND_OPTIONS}
            value={edgeKind}
            onChange={(v) => v !== null && setEdgeKind(v as AgentflowEdgeKind)}
          />
          <TextInput
            label={t('app:propertyPanel.agentflowEdgeLabel')}
            value={label}
            onChange={(e) => setLabel(e.currentTarget.value)}
          />
          <Button
            variant="light"
            disabled={!canAddEdge}
            onClick={() => {
              if (!canAddEdge) return
              commitIntent({
                type: 'add-edge',
                from,
                to,
                edgeKind,
                label: label === '' ? null : label,
              } satisfies AgentflowIntent)
              setLabel('')
            }}
          >
            {t('app:propertyPanel.addAgentflowEdge')}
          </Button>
        </>
      ) : (
        <Text size="xs" c="dimmed">
          {t('app:propertyPanel.agentflowEdgeNeedsTwoNodes')}
        </Text>
      )}
      <Text size="xs" c="dimmed">
        {t('app:propertyPanel.agentflowElementCounts', {
          nodes: projection.nodes.length,
          edges: projection.edges.length,
        })}
      </Text>
    </Stack>
  )
}

/**
 * agentflow 加边浮层表单（more-diagrams 工单 27）：空白右键 / 节点「从这里连线」共用。
 * 两端从**既有节点下拉**（边只能连已声明节点，mermaid 会隐式建节点但语义容易失控），
 * 语义三选一（sequence / reference / failure），标签可选；`initialFrom` 预选起点节点
 * （节点上「从这里连线」时同源预填），`afterElementId` 为落码锚点（缺省回退文档末尾）。
 */
export function AddAgentflowEdgeInlineForm({
  projection,
  initialFrom,
  afterElementId,
  onDone,
}: {
  projection: AgentflowProjection
  initialFrom?: string
  afterElementId?: string
  onDone: () => void
}) {
  const t = useTranslation().t
  const commitIntent = useEditorStore((s) => s.commitIntent)
  const nodeOptions = projection.nodes.map((n) => ({ value: n.nodeId, label: n.text ?? n.nodeId }))
  const firstId = projection.nodes[0]?.nodeId ?? ''
  const [from, setFrom] = useState<string>(initialFrom !== undefined ? initialFrom : firstId)
  const [to, setTo] = useState<string>(projection.nodes.find((n) => n.nodeId !== (initialFrom ?? firstId))?.nodeId ?? '')
  const [edgeKind, setEdgeKind] = useState<AgentflowEdgeKind>('sequence')
  const [label, setLabel] = useState('')

  const canAddEdge = from !== '' && to !== '' && from !== to

  return (
    <Stack gap="sm">
      <Select label={t('app:propertyPanel.agentflowEdgeFrom')} data={nodeOptions} value={from} onChange={(v) => v !== null && setFrom(v)} />
      <Select label={t('app:propertyPanel.agentflowEdgeTo')} data={nodeOptions} value={to} onChange={(v) => v !== null && setTo(v)} />
      <Select
        label={t('app:propertyPanel.agentflowEdgeKind')}
        data={EDGE_KIND_OPTIONS}
        value={edgeKind}
        onChange={(v) => v !== null && setEdgeKind(v as AgentflowEdgeKind)}
      />
      <TextInput label={t('app:propertyPanel.agentflowEdgeLabel')} value={label} onChange={(e) => setLabel(e.currentTarget.value)} />
      <Button
        variant="light"
        disabled={!canAddEdge}
        onClick={() => {
          if (!canAddEdge) return
          const intent: AgentflowIntent = {
            type: 'add-edge',
            from,
            to,
            edgeKind,
            ...(label !== '' ? { label } : {}),
            afterElementId,
          }
          if (commitIntent(intent)) onDone()
        }}
      >
        {t('app:propertyPanel.addAgentflowEdge')}
      </Button>
    </Stack>
  )
}
