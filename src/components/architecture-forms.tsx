import { useState } from 'react'
import { Button, Group, Select, Stack, Text, TextInput } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type {
  ProjectionArchitectureAlign,
  ProjectionArchitectureEdge,
  ProjectionArchitectureGroup,
  ProjectionArchitectureJunction,
  ProjectionArchitectureService,
} from '../lib/projection/architecture-projection'
import { ARCH_BUILTIN_ICONS, type ArchArrow, type ArchPort, type ArchitectureIntent } from '../lib/pipeline/architecture'
import { useEditorStore } from '../store/editor'
import { useDraft } from './property-forms'

/**
 * architecture 属性表单集合（more-diagrams 工单 17）：全部表单值变化都映射为编辑意图，
 * 经 store.commitIntent 走管线手术式落码（独立撤销快照）。文本类输入在失焦/回车时提交，
 * 避免逐字符快照。service / group 标题可双击内联编辑（画布节点可寻址），此处是第二入口；
 * 图标 / in 分组 / 边的端口与箭头是 D5「选中 + 关菜单」的承接面。边不可寻址（见
 * architecture-adapter），ArchitectureEdgeForm 只从结构树选中进入。
 */

function useCommit() {
  return useEditorStore((s) => s.commitIntent)
}

function clearSelection() {
  useEditorStore.getState().select(null)
}

const PORT_OPTIONS: ArchPort[] = ['T', 'B', 'L', 'R']

const ARROW_OPTIONS: ArchArrow[] = ['none', 'target', 'source', 'both']

/** 内置五图标 + 当前自由串（`pack:icon-name`）的选项表 */
function iconOptions(current: string | null, t: (k: string) => string): Array<{ value: string; label: string }> {
  const values = [...ARCH_BUILTIN_ICONS]
  if (current !== null && current !== '' && !values.includes(current as never)) values.push(current as never)
  return [{ value: '', label: t('app:propertyPanel.archIconNone') }, ...values.map((v) => ({ value: v, label: v }))]
}

/** in 分组选项：全部 group + 「顶层」哨兵 + 当前值兜底（非法手写值如实回显） */
function groupOptions(groups: ProjectionArchitectureGroup[], current: string | null, t: (k: string) => string) {
  const data = groups.map((g) => ({ value: g.id, label: g.title ?? g.id }))
  if (current !== null && !data.some((d) => d.value === current)) data.push({ value: current, label: current })
  return [{ value: '', label: t('app:propertyPanel.archNoGroup') }, ...data]
}

// ---------- service ----------

export function ArchitectureServiceForm({
  service,
  groups,
}: {
  service: ProjectionArchitectureService
  groups: ProjectionArchitectureGroup[]
}) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const titleDraft = useDraft(service.title ?? '', (next) => {
    commitIntent({ type: 'set-service-title', id: service.id, title: next !== '' ? next : null } satisfies ArchitectureIntent)
  })
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.archServiceOwner', { id: service.id })}
      </Text>
      <TextInput
        label={t('app:propertyPanel.archTitle')}
        value={titleDraft.draft}
        error={titleDraft.draft.trim() !== '' ? undefined : t('app:propertyPanel.archTitleEmptyHint')}
        onChange={(e) => titleDraft.setDraft(e.currentTarget.value)}
        onBlur={titleDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') titleDraft.commit()
        }}
      />
      <Select
        label={t('app:propertyPanel.archIcon')}
        description={t('app:propertyPanel.archIconHint')}
        data={iconOptions(service.icon, t)}
        value={service.icon ?? ''}
        onChange={(value) => {
          commitIntent({ type: 'set-service-icon', id: service.id, icon: value !== null && value !== '' ? value : null } satisfies ArchitectureIntent)
        }}
        allowDeselect={false}
      />
      <Select
        label={t('app:propertyPanel.archInGroup')}
        data={groupOptions(groups, service.parent, t)}
        value={service.parent ?? ''}
        onChange={(value) => {
          commitIntent({ type: 'set-service-parent', id: service.id, parent: value !== null && value !== '' ? value : null } satisfies ArchitectureIntent)
        }}
        allowDeselect={false}
      />
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-service', id: service.id } satisfies ArchitectureIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteArchService')}
      </Button>
    </Stack>
  )
}

// ---------- group ----------

export function ArchitectureGroupForm({
  group,
  groups,
}: {
  group: ProjectionArchitectureGroup
  groups: ProjectionArchitectureGroup[]
}) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const titleDraft = useDraft(group.title ?? '', (next) => {
    commitIntent({ type: 'set-group-title', id: group.id, title: next !== '' ? next : null } satisfies ArchitectureIntent)
  })
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.archGroupOwner', { id: group.id })}
      </Text>
      <TextInput
        label={t('app:propertyPanel.archTitle')}
        value={titleDraft.draft}
        error={titleDraft.draft.trim() !== '' ? undefined : t('app:propertyPanel.archTitleEmptyHint')}
        onChange={(e) => titleDraft.setDraft(e.currentTarget.value)}
        onBlur={titleDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') titleDraft.commit()
        }}
      />
      <Select
        label={t('app:propertyPanel.archInGroup')}
        data={groupOptions(groups.filter((g) => g.id !== group.id), group.parent, t)}
        value={group.parent ?? ''}
        onChange={(value) => {
          commitIntent({ type: 'set-group-parent', id: group.id, parent: value !== null && value !== '' ? value : null } satisfies ArchitectureIntent)
        }}
        allowDeselect={false}
      />
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-group', id: group.id } satisfies ArchitectureIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteArchGroup')}
      </Button>
    </Stack>
  )
}

// ---------- junction ----------

export function ArchitectureJunctionForm({
  junction,
  groups,
}: {
  junction: ProjectionArchitectureJunction
  groups: ProjectionArchitectureGroup[]
}) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.archJunctionOwner', { id: junction.id })}
      </Text>
      <Select
        label={t('app:propertyPanel.archInGroup')}
        data={groupOptions(groups, junction.parent, t)}
        value={junction.parent ?? ''}
        onChange={(value) => {
          commitIntent({ type: 'set-junction-parent', id: junction.id, parent: value !== null && value !== '' ? value : null } satisfies ArchitectureIntent)
        }}
        allowDeselect={false}
      />
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-junction', id: junction.id } satisfies ArchitectureIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteArchJunction')}
      </Button>
    </Stack>
  )
}

// ---------- 边 ----------

export function ArchitectureEdgeForm({ edge }: { edge: ProjectionArchitectureEdge }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const portLabel = (port: ArchPort): string => t(`app:archPorts.${port}`)
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {edge.endpointValid
          ? t('app:propertyPanel.archEdgeEnds', { from: edge.from, to: edge.to })
          : t('app:propertyPanel.archEdgeEndsInvalid', { from: edge.from, to: edge.to })}
      </Text>
      <Select
        label={t('app:propertyPanel.archFromPort')}
        description={t('app:propertyPanel.archPortRequiredHint')}
        data={PORT_OPTIONS.map((p) => ({ value: p, label: portLabel(p) }))}
        value={edge.fromPort ?? 'T'}
        onChange={(value) => {
          if (value === null) return
          commitIntent({
            type: 'set-edge-port',
            elementId: edge.elementId,
            side: 'from',
            port: value as ArchPort,
          } satisfies ArchitectureIntent)
        }}
        allowDeselect={false}
      />
      <Select
        label={t('app:propertyPanel.archToPort')}
        description={t('app:propertyPanel.archPortRequiredHint')}
        data={PORT_OPTIONS.map((p) => ({ value: p, label: portLabel(p) }))}
        value={edge.toPort ?? 'T'}
        onChange={(value) => {
          if (value === null) return
          commitIntent({
            type: 'set-edge-port',
            elementId: edge.elementId,
            side: 'to',
            port: value as ArchPort,
          } satisfies ArchitectureIntent)
        }}
        allowDeselect={false}
      />
      <Select
        label={t('app:propertyPanel.archArrow')}
        data={ARROW_OPTIONS.map((a) => ({ value: a, label: t(`app:architectureArrows.${a}`) }))}
        value={edge.arrow}
        onChange={(value) => {
          if (value === null) return
          commitIntent({ type: 'set-edge-arrow', elementId: edge.elementId, arrow: value as ArchArrow } satisfies ArchitectureIntent)
        }}
        allowDeselect={false}
      />
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-edge', elementId: edge.elementId } satisfies ArchitectureIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteArchEdge')}
      </Button>
    </Stack>
  )
}

// ---------- align ----------

export function ArchitectureAlignForm({ align }: { align: ProjectionArchitectureAlign }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.archAlignMembers', { members: align.members.join(', ') })}
      </Text>
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-align', elementId: align.elementId } satisfies ArchitectureIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteArchAlign')}
      </Button>
    </Stack>
  )
}

// ---------- 加边（提交才落码） ----------

/**
 * 加边表单（service 右键「从这里连线」/ Enter 键 / 空白菜单之外的第二入口）：from 预选，
 * 终点与箭头在表单选，提交才落码（锚点为该 service 声明行）。
 */
export function AddArchitectureEdgeInlineForm({
  serviceIds,
  initialFrom,
  afterElementId,
  onDone,
}: {
  /** 全部可作端点的节点 id（service + junction） */
  serviceIds: string[]
  /** 预填 from（service 上拉边 = 该 service）；缺省取第一个 */
  initialFrom?: string
  /** 落码锚点：新边插到该元素之后；缺省 = 文档最后一个元素 */
  afterElementId?: string
  onDone: () => void
}) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const [from, setFrom] = useState(initialFrom ?? serviceIds[0] ?? '')
  const [to, setTo] = useState(serviceIds.find((id) => id !== from) ?? '')
  const [fromPort, setFromPort] = useState<ArchPort>('R')
  const [toPort, setToPort] = useState<ArchPort>('L')
  const [arrow, setArrow] = useState<ArchArrow>('target')
  const valid = serviceIds.includes(from) && serviceIds.includes(to) && from !== to
  return (
    <Stack gap="sm">
      <Select
        label={t('app:propertyPanel.archFrom')}
        data={serviceIds}
        value={from}
        onChange={(v) => setFrom(v ?? '')}
        allowDeselect={false}
      />
      <Select
        label={t('app:propertyPanel.archTo')}
        data={serviceIds.filter((id) => id !== from)}
        value={to}
        onChange={(v) => setTo(v ?? '')}
        allowDeselect={false}
      />
      <Group grow gap="xs">
        <Select
          label={t('app:propertyPanel.archFromPort')}
          data={PORT_OPTIONS.map((p) => ({ value: p, label: t(`app:archPorts.${p}`) }))}
          value={fromPort}
          onChange={(v) => {
            if (v !== null) setFromPort(v as ArchPort)
          }}
          allowDeselect={false}
        />
        <Select
          label={t('app:propertyPanel.archToPort')}
          data={PORT_OPTIONS.map((p) => ({ value: p, label: t(`app:archPorts.${p}`) }))}
          value={toPort}
          onChange={(v) => {
            if (v !== null) setToPort(v as ArchPort)
          }}
          allowDeselect={false}
        />
      </Group>
      <Select
        label={t('app:propertyPanel.archArrow')}
        data={ARROW_OPTIONS.map((a) => ({ value: a, label: t(`app:architectureArrows.${a}`) }))}
        value={arrow}
        onChange={(v) => {
          if (v !== null) setArrow(v as ArchArrow)
        }}
        allowDeselect={false}
      />
      <Group gap="xs" justify="flex-end">
        <Button
          disabled={!valid}
          onClick={() => {
            if (!commitIntent({ type: 'add-edge', from, to, fromPort, toPort, arrow, afterElementId } satisfies ArchitectureIntent)) {
              return
            }
            onDone()
          }}
        >
          {t('app:propertyPanel.add')}
        </Button>
      </Group>
    </Stack>
  )
}
