import { Stack, Text, UnstyledButton } from '@mantine/core'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { DIAGRAM_SELECTION, type Selection, sameSelection } from '../lib/projection/selection'
import type { AnyProjection } from '../lib/diagram-registry'
import type { FlowchartProjection } from '../lib/projection/flowchart-projection'
import type { MindmapProjection, ProjectionMindmapNode } from '../lib/projection/mindmap-projection'
import { mindmapActionIntents } from '../lib/editing/canvas-keyboard'
import { useEditorStore } from '../store/editor'

/**
 * 结构树（工单 04）：属性面板上半区，展示图中全部元素，
 * 点击选中并定位到下半区的属性表单。
 * sequence 分支（工单 06）：参与者 / 消息 / note / 逻辑块按嵌套深度展示。
 * mindmap 分支（工单 08）：树形缩进即主编辑界面——层级节点直接在树中增删。
 */

function TreeItem({
  label,
  detail,
  active,
  depth,
  onSelect,
  onKeyDown,
}: {
  label: string
  detail?: string
  active: boolean
  depth: number
  onSelect: () => void
  /** 键盘操作（工单 06：mindmap 树节点聚焦时 Tab/Enter 增删节点） */
  onKeyDown?: (e: React.KeyboardEvent) => void
}) {
  return (
    <UnstyledButton
      onClick={onSelect}
      onKeyDown={onKeyDown}
      py={4}
      px="xs"
      style={{
        display: 'block',
        width: '100%',
        borderRadius: 4,
        paddingLeft: 8 + depth * 16,
        background: active ? 'var(--mantine-color-blue-1)' : undefined,
      }}
    >
      <Text size="sm" span>
        {label}
      </Text>
      {detail !== undefined && (
        <Text size="xs" c="dimmed" span ml={6}>
          {detail}
        </Text>
      )}
    </UnstyledButton>
  )
}

/** 图种无关的结构树入口（工单 06）：按投影类型分发到各图种分支 */
export function StructureTree({ projection }: { projection: AnyProjection }) {
  if (projection.type === 'flowchart') return <FlowchartTree projection={projection.flowchart} />
  if (projection.type === 'sequence') return <SequenceTree projection={projection.sequence} />
  if (projection.type === 'mindmap') return <MindmapTree projection={projection.mindmap} />
  return <ClassTree projection={projection.class} />
}

function FlowchartTree({ projection }: { projection: FlowchartProjection }) {
  const { t } = useTranslation()
  const selection = useEditorStore((s) => s.selection)
  const select = useEditorStore((s) => s.select)
  const is = (sel: Selection) => selection !== null && sameSelection(selection, sel)

  return (
    <Stack gap={4} aria-label={t('app:propertyPanel.structureTree')}>
      <TreeItem
        label={t('app:propertyPanel.diagram')}
        detail={projection.direction ?? 'TB'}
        active={is(DIAGRAM_SELECTION)}
        depth={0}
        onSelect={() => select(DIAGRAM_SELECTION)}
      />

      <Text size="xs" c="dimmed" mt={4} px="xs">
        {t('app:propertyPanel.nodes')}（{projection.nodes.length}）
      </Text>
      {projection.nodes.map((node) => (
        <TreeItem
          key={node.nodeId}
          label={node.text ?? node.nodeId}
          detail={node.text !== null ? node.nodeId : undefined}
          active={is({ kind: 'node', nodeId: node.nodeId })}
          depth={1}
          onSelect={() => select({ kind: 'node', nodeId: node.nodeId })}
        />
      ))}

      <Text size="xs" c="dimmed" mt={4} px="xs">
        {t('app:propertyPanel.edges')}（{projection.edges.length}）
      </Text>
      {projection.edges.map((edge) => (
        <TreeItem
          key={`${edge.from}->${edge.to}#${edge.occurrence}`}
          label={t('app:propertyPanel.edgeLabel', { from: edge.from, to: edge.to })}
          detail={edge.label ?? undefined}
          active={is({ kind: 'edge', from: edge.from, to: edge.to, occurrence: edge.occurrence })}
          depth={1}
          onSelect={() => select({ kind: 'edge', from: edge.from, to: edge.to, occurrence: edge.occurrence })}
        />
      ))}

      <Text size="xs" c="dimmed" mt={4} px="xs">
        {t('app:propertyPanel.subgraphs')}（{projection.subgraphs.length}）
      </Text>
      {projection.subgraphs.map((sg) => (
        <TreeItem
          key={sg.elementId}
          label={sg.title ?? sg.id ?? t('app:propertyPanel.unnamedSubgraph')}
          active={is({ kind: 'subgraph', elementId: sg.elementId })}
          depth={1}
          onSelect={() => select({ kind: 'subgraph', elementId: sg.elementId })}
        />
      ))}

      <Text size="xs" c="dimmed" mt={4} px="xs">
        {t('app:propertyPanel.classDefs')}（{projection.classDefs.length}）
      </Text>
      {projection.classDefs.map((cd) => (
        <TreeItem
          key={cd.name}
          label={cd.name}
          detail={cd.props.fill}
          active={is({ kind: 'classdef', name: cd.name })}
          depth={1}
          onSelect={() => select({ kind: 'classdef', name: cd.name })}
        />
      ))}
    </Stack>
  )
}

function SequenceTree({ projection }: { projection: Extract<AnyProjection, { type: 'sequence' }>['sequence'] }) {
  const { t } = useTranslation()
  const selection = useEditorStore((s) => s.selection)
  const select = useEditorStore((s) => s.select)
  const is = (sel: Selection) => selection !== null && sameSelection(selection, sel)

  return (
    <Stack gap={4} aria-label={t('app:propertyPanel.structureTree')}>
      <TreeItem
        label={t('app:propertyPanel.diagram')}
        detail={projection.autonumber ? 'autonumber' : undefined}
        active={is(DIAGRAM_SELECTION)}
        depth={0}
        onSelect={() => select(DIAGRAM_SELECTION)}
      />

      <Text size="xs" c="dimmed" mt={4} px="xs">
        {t('app:propertyPanel.participants')}（{projection.participants.length}）
      </Text>
      {projection.participants.map((p) => (
        <TreeItem
          key={p.actorId}
          label={p.alias ?? p.actorId}
          detail={
            [
              p.alias !== null ? p.actorId : p.active ? 'activate' : undefined,
              p.created === true ? t('app:propertyPanel.createdByCreate') : undefined,
            ]
              .filter((x) => x !== undefined)
              .join(' · ') || undefined
          }
          active={is({ kind: 'participant', actorId: p.actorId })}
          depth={1}
          onSelect={() => select({ kind: 'participant', actorId: p.actorId })}
        />
      ))}

      <Text size="xs" c="dimmed" mt={4} px="xs">
        {t('app:propertyPanel.messages')}（{projection.messages.length}）
      </Text>
      {projection.messages.map((m) => (
        <TreeItem
          key={m.elementId}
          label={`${m.from} → ${m.to}`}
          detail={m.text || undefined}
          active={is({ kind: 'message', elementId: m.elementId })}
          depth={1}
          onSelect={() => select({ kind: 'message', elementId: m.elementId })}
        />
      ))}

      <Text size="xs" c="dimmed" mt={4} px="xs">
        {t('app:propertyPanel.notes')}（{projection.notes.length}）
      </Text>
      {projection.notes.map((n) => (
        <TreeItem
          key={n.elementId}
          label={t(`app:notePos.${n.pos}`)}
          detail={n.text || undefined}
          active={is({ kind: 'note', elementId: n.elementId })}
          depth={1}
          onSelect={() => select({ kind: 'note', elementId: n.elementId })}
        />
      ))}

      <Text size="xs" c="dimmed" mt={4} px="xs">
        {t('app:propertyPanel.blocks')}（{projection.blocks.length}）
      </Text>
      {projection.blocks.map((b) => (
        <TreeItem
          key={b.elementId}
          label={
            b.keyword === 'else' || b.keyword === 'and'
              ? t(`app:elseKeywords.${b.keyword}`)
              : t(`app:blockKeywords.${b.keyword}`)
          }
          detail={b.label ?? undefined}
          active={is({ kind: 'block', elementId: b.elementId })}
          depth={b.depth}
          onSelect={() => select({ kind: 'block', elementId: b.elementId })}
        />
      ))}
    </Stack>
  )
}

function ClassTree({ projection }: { projection: Extract<AnyProjection, { type: 'class' }>['class'] }) {
  const { t } = useTranslation()
  const selection = useEditorStore((s) => s.selection)
  const select = useEditorStore((s) => s.select)
  const is = (sel: Selection) => selection !== null && sameSelection(selection, sel)

  return (
    <Stack gap={4} aria-label={t('app:propertyPanel.structureTree')}>
      <TreeItem
        label={t('app:propertyPanel.diagram')}
        detail="classDiagram"
        active={is(DIAGRAM_SELECTION)}
        depth={0}
        onSelect={() => select(DIAGRAM_SELECTION)}
      />

      <Text size="xs" c="dimmed" mt={4} px="xs">
        {t('app:propertyPanel.classes')}（{projection.classes.length}）
      </Text>
      {projection.classes.map((c) => (
        <TreeItem
          key={c.elementId}
          label={c.generic !== null ? `${c.name}~${c.generic}~` : c.name}
          detail={c.hasBlock ? '{}' : undefined}
          active={is({ kind: 'class', name: c.name })}
          depth={1}
          onSelect={() => select({ kind: 'class', name: c.name })}
        />
      ))}

      <Text size="xs" c="dimmed" mt={4} px="xs">
        {t('app:propertyPanel.members')}（{projection.members.length}）
      </Text>
      {projection.members.map((m) => (
        <TreeItem
          key={m.elementId}
          label={`${m.vis === '' ? '' : m.vis + ' '}${m.text}`}
          detail={m.owner ?? undefined}
          active={is({ kind: 'class-member', elementId: m.elementId })}
          depth={2}
          onSelect={() => select({ kind: 'class-member', elementId: m.elementId })}
        />
      ))}

      <Text size="xs" c="dimmed" mt={4} px="xs">
        {t('app:propertyPanel.relations')}（{projection.relations.length}）
      </Text>
      {projection.relations.map((r) => (
        <TreeItem
          key={r.elementId}
          label={`${r.from} ${r.kind} ${r.to}`}
          detail={r.label ?? undefined}
          active={is({ kind: 'class-relation', elementId: r.elementId })}
          depth={1}
          onSelect={() => select({ kind: 'class-relation', elementId: r.elementId })}
        />
      ))}

      <Text size="xs" c="dimmed" mt={4} px="xs">
        {t('app:propertyPanel.notes')}（{projection.notes.length}）
      </Text>
      {projection.notes.map((n) => (
        <TreeItem
          key={n.elementId}
          label={n.forClass !== null ? t('app:propertyPanel.noteFor', { cls: n.forClass }) : t('app:propertyPanel.floatingNote')}
          detail={n.text || undefined}
          active={is({ kind: 'class-note', elementId: n.elementId })}
          depth={1}
          onSelect={() => select({ kind: 'class-note', elementId: n.elementId })}
        />
      ))}

      <Text size="xs" c="dimmed" mt={4} px="xs">
        {t('app:propertyPanel.classDefs')}（{projection.classDefs.length}）
      </Text>
      {projection.classDefs.map((cd) => (
        <TreeItem
          key={cd.name}
          label={cd.name}
          detail={cd.props.fill}
          active={is({ kind: 'classdef', name: cd.name })}
          depth={1}
          onSelect={() => select({ kind: 'classdef', name: cd.name })}
        />
      ))}
    </Stack>
  )
}

// ---------- mindmap（工单 08）：树形缩进即主编辑界面 ----------

function MindmapTree({ projection }: { projection: MindmapProjection }) {
  const { t } = useTranslation()
  const selection = useEditorStore((s) => s.selection)
  const select = useEditorStore((s) => s.select)
  const is = (sel: Selection) => selection !== null && sameSelection(selection, sel)

  const childrenOf = new Map<string | null, ProjectionMindmapNode[]>()
  for (const node of projection.nodes) {
    const list = childrenOf.get(node.parentId) ?? []
    list.push(node)
    childrenOf.set(node.parentId, list)
  }

  // 结构树键盘（工单 06）：焦点在树节点上时 Tab 加子节点 / Enter 加同级节点
  // （preventDefault 压掉焦点切换），落码按 mindmap 缩进层级；新节点落码后选中
  // 并请求画布内联命名（pendingInlineEdit → CanvasPanel 的 beginEdit）
  const onItemKeyDown = (node: ProjectionMindmapNode) => (e: React.KeyboardEvent) => {
    const action =
      e.key === 'Tab' && !e.shiftKey ? 'add-child' : e.key === 'Enter' && !e.shiftKey ? 'add-sibling' : null
    if (action === null) return
    e.preventDefault()
    const plan = mindmapActionIntents(projection, node.elementId, action, t('app:propertyPanel.mindmapNewNode'))
    if (plan === null) return
    const { commitIntent, select: selectInStore, requestInlineEdit: request } = useEditorStore.getState()
    for (const intent of plan.intents) {
      if (!commitIntent(intent)) return
    }
    if (plan.newElementId !== null) {
      selectInStore({ kind: 'mindmap-node', elementId: plan.newElementId })
      request({ kind: 'mindmap', elementId: plan.newElementId })
    }
  }

  const renderNode = (node: ProjectionMindmapNode): ReactNode => {
    const children = childrenOf.get(node.elementId) ?? []
    const shapeLabel =
      node.shapeType !== null ? t(`app:mindmapShapes.${node.shapeType}`) : undefined
    return (
      <Stack key={node.elementId} gap={0}>
        <TreeItem
          label={node.text}
          detail={[shapeLabel, node.icon !== null ? `::icon(${node.icon})` : undefined]
            .filter((x) => x !== undefined)
            .join(' · ') || undefined}
          active={is({ kind: 'mindmap-node', elementId: node.elementId })}
          depth={node.depth}
          onSelect={() => select({ kind: 'mindmap-node', elementId: node.elementId })}
          onKeyDown={onItemKeyDown(node)}
        />
        {children.map(renderNode)}
      </Stack>
    )
  }

  return (
    <Stack gap={4} aria-label={t('app:propertyPanel.structureTree')}>
      <TreeItem
        label={t('app:propertyPanel.diagram')}
        detail="mindmap"
        active={is(DIAGRAM_SELECTION)}
        depth={0}
        onSelect={() => select(DIAGRAM_SELECTION)}
      />
      <Text size="xs" c="dimmed" px="xs">
        {t('app:propertyPanel.mindmapHint')}
      </Text>
      {projection.nodes.length === 0 ? (
        <Text size="xs" c="dimmed" px="xs">
          {t('app:propertyPanel.mindmapEmpty')}
        </Text>
      ) : (
        (childrenOf.get(null) ?? []).map(renderNode)
      )}
    </Stack>
  )
}
