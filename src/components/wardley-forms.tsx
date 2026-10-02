import { Button, Group, Select, Stack, Text, TextInput } from '@mantine/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  ProjectionWardleyEvolve,
  ProjectionWardleyLink,
  ProjectionWardleyNode,
  WardleyProjection,
} from '../lib/projection/wardley-projection'
import { isValidWardleyName, type WardleyIntent } from '../lib/pipeline/wardley'
import { isWardleyCoordsValid, isWardleyTargetValid } from '../lib/pipeline/wardley-keyboard'
import { useEditorStore } from '../store/editor'
import { useDraft } from './property-forms'

/**
 * wardley 属性表单集合（more-diagrams 工单 23）：全部表单值变化都映射为编辑意图，
 * 经 store.commitIntent 走管线手术式落码（独立撤销快照）。
 * 文本类输入在失焦/回车时提交，避免逐字符快照。
 *
 * **画布 DOM 无 data-id（research §4 实测降级）**：节点不做双击内联编辑，改名/改坐标
 * 在这里做；连线与 evolve 的端点/目标用**既有节点名下拉**（名字即身份，mermaid 按名引用），
 * 不做自由文本以免产生悬空引用。结构树 + 这三张表单是完整编辑入口。
 */

function clearSelection() {
  useEditorStore.getState().select(null)
}

/** 节点表单：改名（引号风格逐字保留）+ 改坐标（可见度 / 演化度，原文落码）+ 删除 */
export function WardleyNodeForm({
  node,
  projection,
}: {
  node: ProjectionWardleyNode
  projection: WardleyProjection
}) {
  const t = useTranslation().t
  const commitIntent = useEditorStore((s) => s.commitIntent)
  const nameDraft = useDraft(node.name, (next) => {
    if (next === node.name || !isValidWardleyName(next)) return
    commitIntent({
      type: 'set-node-name',
      elementId: node.elementId,
      name: next,
    } satisfies WardleyIntent)
  })
  const visibilityDraft = useDraft(node.visibilityText, (next) => {
    if (next === node.visibilityText || !isWardleyCoordsValid(next, node.evolutionText)) return
    commitIntent({
      type: 'set-node-coords',
      elementId: node.elementId,
      visibility: next,
    } satisfies WardleyIntent)
  })
  const evolutionDraft = useDraft(node.evolutionText, (next) => {
    if (next === node.evolutionText || !isWardleyCoordsValid(node.visibilityText, next)) return
    commitIntent({
      type: 'set-node-coords',
      elementId: node.elementId,
      evolution: next,
    } satisfies WardleyIntent)
  })

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {node.nodeKind === 'anchor'
          ? t('app:propertyPanel.wardleyAnchorHint')
          : t('app:propertyPanel.wardleyComponentHint')}
      </Text>
      {node.inPipeline && (
        <Text size="xs" c="dimmed">
          {t('app:propertyPanel.wardleyInPipelineHint')}
        </Text>
      )}
      <TextInput
        label={t('app:propertyPanel.wardleyName')}
        value={nameDraft.draft}
        error={isValidWardleyName(nameDraft.draft) ? undefined : t('app:propertyPanel.wardleyNameInvalid')}
        onChange={(e) => nameDraft.setDraft(e.currentTarget.value)}
        onBlur={nameDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') nameDraft.commit()
        }}
      />
      <Group grow>
        <TextInput
          label={t('app:propertyPanel.wardleyVisibility')}
          description={t('app:propertyPanel.wardleyCoordAxisHint')}
          value={visibilityDraft.draft}
          error={
            isWardleyCoordsValid(visibilityDraft.draft, node.evolutionText)
              ? undefined
              : t('app:propertyPanel.wardleyCoordInvalid')
          }
          onChange={(e) => visibilityDraft.setDraft(e.currentTarget.value)}
          onBlur={visibilityDraft.commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') visibilityDraft.commit()
          }}
        />
        <TextInput
          label={t('app:propertyPanel.wardleyEvolution')}
          value={evolutionDraft.draft}
          error={
            isWardleyCoordsValid(node.visibilityText, evolutionDraft.draft)
              ? undefined
              : t('app:propertyPanel.wardleyCoordInvalid')
          }
          onChange={(e) => evolutionDraft.setDraft(e.currentTarget.value)}
          onBlur={evolutionDraft.commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') evolutionDraft.commit()
          }}
        />
      </Group>
      <Text size="xs" c="dimmed">
        {t('app:propertyPanel.wardleyCoordsOrderHint')}
      </Text>
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-node', elementId: node.elementId } satisfies WardleyIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteWardleyNode')}
      </Button>
      {/* projection 参与：删除节点会级联删触及连线/evolve，提示受影响条数（只读参考） */}
      <Text size="xs" c="dimmed">
        {t('app:propertyPanel.wardleyDeleteCascadeHint', {
          links: projection.links.filter((l) => l.from === node.name || l.to === node.name).length,
          evolves: projection.evolves.filter((e) => e.name === node.name).length,
        })}
      </Text>
    </Stack>
  )
}

/** 连线表单：改两端（既有节点名下拉）+ 删除 */
export function WardleyLinkForm({
  link,
  projection,
}: {
  link: ProjectionWardleyLink
  projection: WardleyProjection
}) {
  const t = useTranslation().t
  const commitIntent = useEditorStore((s) => s.commitIntent)
  const nameOptions = projection.nodes.map((n) => ({ value: n.name, label: n.name }))

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.wardleyLinkHint')}
      </Text>
      <Select
        label={t('app:propertyPanel.wardleyLinkFrom')}
        data={nameOptions}
        value={link.from}
        searchable
        onChange={(next) => {
          if (next !== null && next !== link.from) {
            commitIntent({ type: 'set-link', elementId: link.elementId, from: next } satisfies WardleyIntent)
          }
        }}
      />
      <Select
        label={t('app:propertyPanel.wardleyLinkTo')}
        data={nameOptions}
        value={link.to}
        searchable
        onChange={(next) => {
          if (next !== null && next !== link.to) {
            commitIntent({ type: 'set-link', elementId: link.elementId, to: next } satisfies WardleyIntent)
          }
        }}
      />
      {!link.endpointsValid && (
        <Text size="xs" c="red">
          {t('app:propertyPanel.wardleyDanglingHint')}
        </Text>
      )}
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-link', elementId: link.elementId } satisfies WardleyIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteWardleyLink')}
      </Button>
    </Stack>
  )
}

/** evolve 表单：改目标演化度（0–100 数值）+ 删除 */
export function WardleyEvolveForm({ evolve }: { evolve: ProjectionWardleyEvolve }) {
  const t = useTranslation().t
  const commitIntent = useEditorStore((s) => s.commitIntent)
  const targetDraft = useDraft(evolve.targetText, (next) => {
    if (next === evolve.targetText || !isWardleyTargetValid(next)) return
    commitIntent({
      type: 'set-evolve-target',
      elementId: evolve.elementId,
      target: next,
    } satisfies WardleyIntent)
  })

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.wardleyEvolveHint', { name: evolve.name })}
      </Text>
      {!evolve.nameValid && (
        <Text size="xs" c="red">
          {t('app:propertyPanel.wardleyDanglingHint')}
        </Text>
      )}
      <TextInput
        label={t('app:propertyPanel.wardleyEvolveTarget')}
        value={targetDraft.draft}
        error={isWardleyTargetValid(targetDraft.draft) ? undefined : t('app:propertyPanel.wardleyTargetInvalid')}
        onChange={(e) => targetDraft.setDraft(e.currentTarget.value)}
        onBlur={targetDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') targetDraft.commit()
        }}
      />
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-evolve', elementId: evolve.elementId } satisfies WardleyIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteWardleyEvolve')}
      </Button>
    </Stack>
  )
}

/**
 * 加连线浮出表单（工单 23，与 sankey 加链路同形态）：两端从**既有节点名下拉**选择
 * （名字即身份，避免产生悬空引用），提交才经 add-link 落码。锚点 = 右键 / 选中元素
 * （缺省回退文档末尾）。表单自身不做内联命名（链路无名字）。
 */
export function AddWardleyLinkInlineForm({
  nodeNames,
  initialFrom,
  afterElementId,
  onDone,
}: {
  nodeNames: string[]
  /** 预选起点（链路上 Tab = 同源；空白处缺省取第一个节点名） */
  initialFrom?: string
  /** 落码锚点：新连线行插到该元素之后；缺省 = 文档最后一个元素 */
  afterElementId?: string
  onDone: () => void
}) {
  const t = useTranslation().t
  const commitIntent = useEditorStore((s) => s.commitIntent)
  const [from, setFrom] = useState(initialFrom ?? nodeNames[0] ?? '')
  const [to, setTo] = useState(nodeNames.find((n) => n !== (initialFrom ?? nodeNames[0])) ?? nodeNames[0] ?? '')
  const options = nodeNames.map((n) => ({ value: n, label: n }))
  const valid = from !== '' && to !== '' && from !== to

  return (
    <Stack gap="sm">
      <Select
        label={t('app:propertyPanel.wardleyLinkFrom')}
        data={options}
        value={from}
        searchable
        onChange={(next) => setFrom(next ?? '')}
      />
      <Select
        label={t('app:propertyPanel.wardleyLinkTo')}
        data={options}
        value={to}
        searchable
        onChange={(next) => setTo(next ?? '')}
      />
      {from !== '' && to !== '' && from === to && (
        <Text size="xs" c="red">
          {t('app:propertyPanel.wardleyLinkSelfHint')}
        </Text>
      )}
      <Group gap="xs" justify="flex-end">
        <Button
          disabled={!valid}
          onClick={() => {
            if (commitIntent({ type: 'add-link', from, to, afterElementId } satisfies WardleyIntent)) {
              onDone()
            }
          }}
        >
          {t('app:propertyPanel.add')}
        </Button>
      </Group>
    </Stack>
  )
}
