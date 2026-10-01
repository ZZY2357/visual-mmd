import { Button, Group, Stack, Switch, Text, TextInput } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { ProjectionTreeviewNode } from '../lib/projection/treeview-projection'
import { isValidTreeviewName, type TreeviewIntent } from '../lib/pipeline/treeview'
import { useEditorStore } from '../store/editor'
import { useDraft } from './property-forms'

/**
 * treeView 属性表单集合（more-diagrams 工单 24）：全部表单值变化都映射为编辑意图，
 * 经 store.commitIntent 走管线手术式落码（独立撤销快照）。
 * 文本类输入在失焦/回车时提交，避免逐字符快照。
 * 画布 DOM 无 data-id（research §4 实测降级）：名称不做双击内联编辑，在这里改；
 * 目录/文件切换用开关（映射 set-node-directory，名称尾 `/` 由手术式改写维护）。
 * 注解（:::class / icon() / ## 描述）由本解析器保存原文并逐字保留，但**暂不表单化编辑**
 * ——research §1 允许任意顺序、可重复出现，做成固定三输入会与「重复注解」「交错顺序」
 * 冲突，且它是外观修饰而非结构，与本轮编辑目标（改名/增删节点）无关，故不做（理由同
 * ishikawa 不做标题编辑）。结构树的 Tab/Enter/Delete + 本表单覆盖全部结构编辑。
 */

function clearSelection() {
  useEditorStore.getState().select(null)
}

export function TreeviewNodeForm({ node }: { node: ProjectionTreeviewNode }) {
  const t = useTranslation().t
  const commitIntent = useEditorStore((s) => s.commitIntent)
  const nameDraft = useDraft(node.name, (next) => {
    if (next === node.name || !isValidTreeviewName(next)) return
    commitIntent({ type: 'set-node-name', elementId: node.elementId, name: next } satisfies TreeviewIntent)
  })

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {node.isDirectory
          ? t('app:propertyPanel.treeviewDirectoryHint')
          : t('app:propertyPanel.treeviewFileHint')}
      </Text>
      <TextInput
        label={t('app:propertyPanel.treeviewName')}
        value={nameDraft.draft}
        error={isValidTreeviewName(nameDraft.draft) ? undefined : t('app:propertyPanel.treeviewNameInvalid')}
        onChange={(e) => nameDraft.setDraft(e.currentTarget.value)}
        onBlur={nameDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') nameDraft.commit()
        }}
      />
      <Switch
        label={t('app:propertyPanel.treeviewIsDirectory')}
        checked={node.isDirectory}
        onChange={(e) => {
          const next = e.currentTarget.checked
          if (next === node.isDirectory) return
          commitIntent({
            type: 'set-node-directory',
            elementId: node.elementId,
            isDirectory: next,
          } satisfies TreeviewIntent)
        }}
      />
      <Group justify="flex-end">
        <Button
          variant="light"
          color="red"
          onClick={() => {
            if (commitIntent({ type: 'delete-node', elementId: node.elementId } satisfies TreeviewIntent)) {
              clearSelection()
            }
          }}
        >
          {t('app:propertyPanel.deleteTreeviewNode')}
        </Button>
      </Group>
    </Stack>
  )
}
