import { useState } from 'react'
import { Button, Group, Select, Stack, Text, TextInput } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { MindmapShapeType } from '../lib/pipeline/mindmap'
import type { ProjectionMindmapNode } from '../lib/projection/mindmap-projection'
import {
  MINDMAP_SHAPE_OPTIONS,
  addChildIntent,
  addSiblingIntent,
  deleteMindmapNodeIntent,
  setMindmapNodeIconIntent,
  setMindmapNodeIdIntent,
  setMindmapNodeShapeIntent,
  setMindmapNodeTextIntent,
} from '../lib/editing/mindmap-forms'
import { useDraft } from './property-forms'
import { useEditorStore } from '../store/editor'

/**
 * mindmap 属性表单（工单 08）：树形结构树是主编辑界面（StructureTree 的
 * mindmap 分支承担增删与选中），本表单负责选中节点的文本 / 形状 / 图标 / 节点 ID。
 * 全部编辑都映射为意图，经 store.commitIntent 手术式落码（独立撤销快照）。
 * 节点 ID（工单 05，ADR-0009）：默认不分离；填 id 把纯文本节点改写成 `id[显示文本]`，
 * 清空 id 还原纯文本；画布寻址用位置序，与 id 无关。
 */

function useCommitIntent() {
  return useEditorStore((s) => s.commitIntent)
}

function shapeSelectData(t: (k: string) => string) {
  return MINDMAP_SHAPE_OPTIONS.map((o) => ({
    value: o.value,
    label: o.value === 'default' ? t('app:mindmapShapes.default') : t(`app:mindmapShapes.${o.value}`),
  }))
}

export function MindmapNodeForm({ node }: { node: ProjectionMindmapNode }) {
  const { t } = useTranslation()
  const commitIntent = useCommitIntent()
  const clearSelection = useEditorStore((s) => s.select)
  const textDraft = useDraft(node.text, (next) => {
    const intent = setMindmapNodeTextIntent(node.elementId, next)
    if (intent !== null) commitIntent(intent)
  })
  const iconDraft = useDraft(node.icon ?? '', (next) => {
    commitIntent(setMindmapNodeIconIntent(node.elementId, next))
  })
  const currentId = node.id ?? ''
  const idDraft = useDraft(currentId, (next) => {
    const intent = setMindmapNodeIdIntent(node.elementId, next)
    if (intent !== null) commitIntent(intent)
  })
  const idInvalid =
    idDraft.draft !== currentId && setMindmapNodeIdIntent(node.elementId, idDraft.draft) === null
  const [addText, setAddText] = useState('')
  const [addShape, setAddShape] = useState<MindmapShapeType | 'default'>('default')
  const [addMode, setAddMode] = useState<'child' | 'sibling' | null>(null)

  const submitAdd = () => {
    if (addText.trim() === '') return
    const intent =
      addMode === 'child'
        ? addChildIntent(node.elementId, addText, addShape)
        : addSiblingIntent(node.elementId, addText, addShape)
    if (intent !== null && commitIntent(intent)) {
      setAddText('')
      setAddMode(null)
    }
  }

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
        data={shapeSelectData(t)}
        value={node.shapeType ?? 'default'}
        onChange={(v) => {
          if (v !== null) commitIntent(setMindmapNodeShapeIntent(node.elementId, v as MindmapShapeType | 'default'))
        }}
        allowDeselect={false}
      />
      <TextInput
        label={t('app:propertyPanel.mindmapNodeIcon')}
        description={t('app:propertyPanel.mindmapIconHint')}
        placeholder="fa fa-book"
        value={iconDraft.draft}
        onChange={(e) => iconDraft.setDraft(e.currentTarget.value)}
        onBlur={iconDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') iconDraft.commit()
        }}
      />

      <TextInput
        label={t('app:propertyPanel.nodeId')}
        description={t('app:propertyPanel.mindmapNodeIdHint')}
        value={idDraft.draft}
        onChange={(e) => idDraft.setDraft(e.currentTarget.value)}
        onBlur={idDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') idDraft.commit()
        }}
        error={idInvalid ? t('app:propertyPanel.mindmapInvalidNodeId') : undefined}
      />

      <Group gap="xs">
        <Button size="compact-xs" variant={addMode === 'child' ? 'light' : 'default'} onClick={() => setAddMode(addMode === 'child' ? null : 'child')}>
          + {t('app:propertyPanel.addChild')}
        </Button>
        <Button size="compact-xs" variant={addMode === 'sibling' ? 'light' : 'default'} onClick={() => setAddMode(addMode === 'sibling' ? null : 'sibling')}>
          + {t('app:propertyPanel.addSibling')}
        </Button>
        <Button
          size="compact-xs"
          color="red"
          variant="light"
          onClick={() => {
            if (commitIntent(deleteMindmapNodeIntent(node.elementId))) clearSelection(null)
          }}
        >
          {t('app:propertyPanel.deleteMindmapNode')}
        </Button>
      </Group>

      {addMode !== null && (
        <Stack gap="xs">
          <TextInput
            label={t('app:propertyPanel.mindmapAddText')}
            value={addText}
            onChange={(e) => setAddText(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitAdd()
            }}
            data-autofocus
          />
          <Select
            label={t('app:propertyPanel.nodeShape')}
            data={shapeSelectData(t)}
            value={addShape}
            onChange={(v) => {
              if (v !== null) setAddShape(v as MindmapShapeType | 'default')
            }}
            allowDeselect={false}
          />
          <Group gap="xs">
            <Button size="compact-xs" onClick={submitAdd}>
              {t('app:propertyPanel.add')}
            </Button>
            <Button size="compact-xs" variant="default" onClick={() => setAddMode(null)}>
              {t('app:propertyPanel.cancel')}
            </Button>
          </Group>
        </Stack>
      )}
    </Stack>
  )
}

/** 空思维导图（无任何节点）时的起步表单：创建根节点 */
export function MindmapRootForm() {
  const { t } = useTranslation()
  const commitIntent = useCommitIntent()
  const [text, setText] = useState('')
  const submit = () => {
    const intent = addChildIntent(undefined, text)
    if (intent !== null && commitIntent(intent)) setText('')
  }
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.mindmapEmptyHint')}
      </Text>
      <TextInput
        label={t('app:propertyPanel.mindmapAddText')}
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
        }}
      />
      <Button size="compact-xs" onClick={submit}>
        {t('app:propertyPanel.addRootNode')}
      </Button>
    </Stack>
  )
}
