import { Button, Stack, Text, TextInput } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { ProjectionIshikawaNode } from '../lib/projection/ishikawa-projection'
import { isValidIshikawaText, type IshikawaIntent } from '../lib/pipeline/ishikawa'
import { useEditorStore } from '../store/editor'
import { useDraft } from './property-forms'

/**
 * ishikawa 属性表单集合（more-diagrams 工单 22）：全部表单值变化都映射为编辑意图，
 * 经 store.commitIntent 走管线手术式落码（独立撤销快照）。
 * 文本类输入在失焦/回车时提交，避免逐字符快照。
 * 画布 DOM 无 data-id（research §4 实测降级）：文本不做双击内联编辑，在这里改；
 * 鱼头（问题/事件）可改名（改第一行即改图标题，research 坑 4）但不可删除。
 */

function clearSelection() {
  useEditorStore.getState().select(null)
}

export function IshikawaNodeForm({ node }: { node: ProjectionIshikawaNode }) {
  const t = useTranslation().t
  const commitIntent = useEditorStore((s) => s.commitIntent)
  const textDraft = useDraft(node.text, (next) => {
    if (next === node.text || !isValidIshikawaText(next)) return
    commitIntent({ type: 'set-node-text', elementId: node.elementId, text: next } satisfies IshikawaIntent)
  })

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {node.isRoot
          ? t('app:propertyPanel.ishikawaRootHint')
          : node.depth === 1
            ? t('app:propertyPanel.ishikawaCauseHint')
            : t('app:propertyPanel.ishikawaBranchHint')}
      </Text>
      <TextInput
        label={node.isRoot ? t('app:propertyPanel.ishikawaProblem') : t('app:propertyPanel.ishikawaText')}
        value={textDraft.draft}
        error={isValidIshikawaText(textDraft.draft) ? undefined : t('app:propertyPanel.ishikawaTextInvalid')}
        onChange={(e) => textDraft.setDraft(e.currentTarget.value)}
        onBlur={textDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') textDraft.commit()
        }}
      />
      {!node.isRoot && (
        <Button
          variant="light"
          color="red"
          onClick={() => {
            if (commitIntent({ type: 'delete-node', elementId: node.elementId } satisfies IshikawaIntent)) {
              clearSelection()
            }
          }}
        >
          {t('app:propertyPanel.deleteIshikawaNode')}
        </Button>
      )}
    </Stack>
  )
}
