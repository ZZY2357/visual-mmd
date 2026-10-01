import { Button, Group, Stack, Text, TextInput } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { ProjectionTreemapNode } from '../lib/projection/treemap-projection'
import { isValidTreemapName, isValidTreemapValue, type TreemapIntent } from '../lib/pipeline/treemap'
import { useEditorStore } from '../store/editor'
import { useDraft } from './property-forms'

/**
 * treemap 属性表单集合（more-diagrams 工单 20）：全部表单值变化都映射为编辑意图，
 * 经 store.commitIntent 走管线手术式落码（独立撤销快照）。
 * 文本类输入在失焦/回车时提交，避免逐字符快照。
 * 画布 DOM 无 data-id（research §4 实测降级）：名字不做双击内联编辑，在这里改；
 * Leaf↔Section 转换不做（工单定案），分组上只可改名与删除，加子节点走结构树键盘。
 */

function clearSelection() {
  useEditorStore.getState().select(null)
}

export function TreemapNodeForm({ node }: { node: ProjectionTreemapNode }) {
  const t = useTranslation().t
  const commitIntent = useEditorStore((s) => s.commitIntent)
  const nameDraft = useDraft(node.name, (next) => {
    if (next === node.name || !isValidTreemapName(next)) return
    commitIntent({ type: 'set-node-name', elementId: node.elementId, name: next } satisfies TreemapIntent)
  })
  const valueDraft = useDraft(node.valueText ?? '', (next) => {
    if (next === node.valueText || !isValidTreemapValue(next)) return
    commitIntent({ type: 'set-node-value', elementId: node.elementId, value: next } satisfies TreemapIntent)
  })

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {node.nodeKind === 'leaf'
          ? t('app:propertyPanel.treemapLeafHint')
          : t('app:propertyPanel.treemapSectionHint')}
      </Text>
      <TextInput
        label={t('app:propertyPanel.treemapName')}
        value={nameDraft.draft}
        error={isValidTreemapName(nameDraft.draft) ? undefined : t('app:propertyPanel.treemapNameInvalid')}
        onChange={(e) => nameDraft.setDraft(e.currentTarget.value)}
        onBlur={nameDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') nameDraft.commit()
        }}
      />
      {node.nodeKind === 'leaf' && (
        <Group grow>
          <TextInput
            label={t('app:propertyPanel.treemapValue')}
            description={t('app:propertyPanel.treemapValueHint')}
            value={valueDraft.draft}
            error={isValidTreemapValue(valueDraft.draft) ? undefined : t('app:propertyPanel.treemapValueInvalid')}
            onChange={(e) => valueDraft.setDraft(e.currentTarget.value)}
            onBlur={valueDraft.commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') valueDraft.commit()
            }}
          />
        </Group>
      )}
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-node', elementId: node.elementId } satisfies TreemapIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteTreemapNode')}
      </Button>
    </Stack>
  )
}
