import { useState } from 'react'
import { Button, Group, Stack, Text, TextInput } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { SankeyProjection, ProjectionSankeyNode } from '../lib/projection/sankey-projection'
import {
  isValidSankeyName,
  parseSankeyValue,
  type SankeyIntent,
} from '../lib/pipeline/sankey'
import { useEditorStore } from '../store/editor'
import { useDraft } from './property-forms'

/**
 * sankey 属性表单集合（more-diagrams 工单 13）：全部表单值变化都映射为编辑意图，
 * 经 store.commitIntent 走管线手术式落码（独立撤销快照）。
 * 文本类输入在失焦/回车时提交，避免逐字符快照。
 *
 * 表单是节点重命名与链路三列的**主编辑入口**：双击内联编辑不做（sankey 的可编辑字段
 * 是 CSV 三列，链路是 path、节点标签在独立 g.node-labels 里且身份是全局计数器，
 * 工单定案）。名字落码口径 = 非空可打印 ASCII（mermaid sankey 词法限 `\u0020-\u007E`，
 * 非 ASCII 名字词法直接失败）；value = 非负整数/小数（mermaid 的宽松 parseFloat
 * 在编辑器侧收紧）。手写源码的非法值以原文回显并提示（不静默改写用户源码）。
 */

function useCommit() {
  return useEditorStore((s) => s.commitIntent)
}

function clearSelection() {
  useEditorStore.getState().select(null)
}

// ---------- 节点（重命名） ----------

/**
 * 节点表单（重命名）：节点不落码（链路行去重派生），重命名 = 手术改写该节点参与的
 * 全部链路行对应列（管线 rename-node 意图），未触碰行逐字保留。提交后选中随旧名失效
 * （投影里名字即身份），清空选中由属性面板的 resolveSelection 回落。
 */
export function SankeyNodeForm({ node }: { node: ProjectionSankeyNode }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const nameDraft = useDraft(node.name, (next) => {
    const newName = next.trim()
    if (newName === node.name) return
    commitIntent({ type: 'rename-node', name: node.name, newName } satisfies SankeyIntent)
  })

  return (
    <Stack gap="sm">
      <TextInput
        label={t('app:propertyPanel.sankeyNodeName')}
        value={nameDraft.draft}
        error={isValidSankeyName(nameDraft.draft.trim()) ? undefined : t('app:propertyPanel.invalidSankeyName')}
        onChange={(e) => nameDraft.setDraft(e.currentTarget.value)}
        onBlur={nameDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') nameDraft.commit()
        }}
      />
      <Text size="xs" c="dimmed">
        {t('app:propertyPanel.sankeyRenameHint', { count: node.linkIds.length })}
      </Text>
    </Stack>
  )
}

// ---------- 链路（三列） ----------

export function SankeyLinkForm({ link }: { link: SankeyProjection['links'][number] }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const sourceDraft = useDraft(link.source, (next) => {
    commitIntent({ type: 'set-link', elementId: link.elementId, changes: { source: next } } satisfies SankeyIntent)
  })
  const targetDraft = useDraft(link.target, (next) => {
    commitIntent({ type: 'set-link', elementId: link.elementId, changes: { target: next } } satisfies SankeyIntent)
  })
  const valueDraft = useDraft(link.valueText, (next) => {
    commitIntent({ type: 'set-link', elementId: link.elementId, changes: { value: next } } satisfies SankeyIntent)
  })

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {link.elementId}
      </Text>
      <TextInput
        label={t('app:propertyPanel.sankeySource')}
        value={sourceDraft.draft}
        error={isValidSankeyName(sourceDraft.draft.trim()) ? undefined : t('app:propertyPanel.invalidSankeyName')}
        onChange={(e) => sourceDraft.setDraft(e.currentTarget.value)}
        onBlur={sourceDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') sourceDraft.commit()
        }}
      />
      <TextInput
        label={t('app:propertyPanel.sankeyTarget')}
        value={targetDraft.draft}
        error={isValidSankeyName(targetDraft.draft.trim()) ? undefined : t('app:propertyPanel.invalidSankeyName')}
        onChange={(e) => targetDraft.setDraft(e.currentTarget.value)}
        onBlur={targetDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') targetDraft.commit()
        }}
      />
      <TextInput
        label={t('app:propertyPanel.sankeyValue')}
        value={valueDraft.draft}
        error={parseSankeyValue(valueDraft.draft) !== null ? undefined : t('app:propertyPanel.invalidSankeyValue')}
        onChange={(e) => valueDraft.setDraft(e.currentTarget.value)}
        onBlur={valueDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') valueDraft.commit()
        }}
      />
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-link', elementId: link.elementId } satisfies SankeyIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteSankeyLink')}
      </Button>
    </Stack>
  )
}

// ---------- 添加链路（空白右键 / 链路上 Tab 的浮层小表单） ----------

/**
 * 添加链路表单：三列自由输入（名字含逗号/引号时由管线自动引号包裹落码），
 * source 预填同源（链路上 Tab 的就近语义）。提交才落码（三列全部过落码门，
 * 非法输入由按钮 guard 拦下——管线侧同样拒绝，双保险）。
 */
export function AddSankeyLinkInlineForm({
  nodeNames,
  initialSource,
  afterElementId,
  onDone,
}: {
  /** 既有节点名（供快速参照；节点不落码，允许输入任意合法新名字） */
  nodeNames: string[]
  /** 预填 source（链路上 Tab = 同源）；空白处缺省取第一个节点名 */
  initialSource?: string
  /** 落码锚点：新链路行插到该元素之后；缺省 = 文档最后一个元素 */
  afterElementId?: string
  onDone: () => void
}) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const [source, setSource] = useState(initialSource ?? nodeNames[0] ?? '')
  const [target, setTarget] = useState(nodeNames[0] ?? '')
  const [value, setValue] = useState('1')
  const valid =
    isValidSankeyName(source.trim()) && isValidSankeyName(target.trim()) && parseSankeyValue(value) !== null
  return (
    <Stack gap="sm">
      <TextInput
        label={t('app:propertyPanel.sankeySource')}
        value={source}
        error={isValidSankeyName(source.trim()) ? undefined : t('app:propertyPanel.invalidSankeyName')}
        onChange={(e) => setSource(e.currentTarget.value)}
      />
      <TextInput
        label={t('app:propertyPanel.sankeyTarget')}
        value={target}
        error={isValidSankeyName(target.trim()) ? undefined : t('app:propertyPanel.invalidSankeyName')}
        onChange={(e) => setTarget(e.currentTarget.value)}
      />
      <TextInput
        label={t('app:propertyPanel.sankeyValue')}
        value={value}
        error={parseSankeyValue(value) !== null ? undefined : t('app:propertyPanel.invalidSankeyValue')}
        onChange={(e) => setValue(e.currentTarget.value)}
      />
      <Group gap="xs" justify="flex-end">
        <Button
          disabled={!valid}
          onClick={() => {
            if (
              !commitIntent({
                type: 'add-link',
                source: source.trim(),
                target: target.trim(),
                value: value.trim(),
                afterElementId,
              } satisfies SankeyIntent)
            ) {
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
