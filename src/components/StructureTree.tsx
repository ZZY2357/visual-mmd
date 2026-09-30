import { Stack, Text, UnstyledButton } from '@mantine/core'
import { Fragment, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { type Selection, sameSelection } from '../lib/projection/selection'
import type { AnyProjection } from '../lib/diagram-registry'
import { DIAGRAM_TYPES } from '../lib/diagram-registry'
import type { TreeEntry } from '../lib/structure-tree/partitions'
import { useEditorStore } from '../store/editor'

/**
 * 结构树（工单 04）：属性面板上半区，展示图中全部元素，
 * 点击选中并定位到下半区的属性表单。
 *
 * architecture-deepening-2 工单 06：四个图种各自的树分区收敛为注册表 `tree` 字段上的
 * 声明式描述（src/lib/structure-tree/partitions.ts，独立字段不进画布能力包——守 ADR-0015），
 * 本组件只保留**一份渲染 JSX**：图表级行 + 各分区「标题（计数）+ 条目」，
 * mindmap 的树形缩进由条目 children 递归展开，键盘经描述里的 onKeyDown 消费 applyPlan。
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

/** 图种无关的结构树入口（工单 06）：按注册表的分区描述渲染，渲染 JSX 只有一份 */
export function StructureTree({ projection }: { projection: AnyProjection }) {
  const { t } = useTranslation()
  const selection = useEditorStore((s) => s.selection)
  const select = useEditorStore((s) => s.select)
  const is = (sel: Selection) => selection !== null && sameSelection(selection, sel)

  const sections = DIAGRAM_TYPES[projection.type].tree(projection, { t })

  const renderEntry = (entry: TreeEntry): ReactNode => {
    const item = (
      <TreeItem
        label={entry.label}
        detail={entry.detail}
        active={is(entry.selection)}
        depth={entry.depth}
        onSelect={() => select(entry.selection)}
        onKeyDown={entry.onKeyDown}
      />
    )
    if (entry.children === undefined || entry.children.length === 0) {
      return <Fragment key={entry.key}>{item}</Fragment>
    }
    // 树形分区（mindmap）：条目与其子树收进无间距的 Stack，缩进由 depth 决定
    return (
      <Stack key={entry.key} gap={0}>
        {item}
        {entry.children.map(renderEntry)}
      </Stack>
    )
  }

  return (
    <Stack gap={4} aria-label={t('app:propertyPanel.structureTree')}>
      {sections.map((section) => (
        <Fragment key={section.key}>
          {section.heading !== undefined && (
            <Text size="xs" c="dimmed" mt={section.count !== undefined ? 4 : undefined} px="xs">
              {section.count !== undefined ? `${section.heading}（${section.count}）` : section.heading}
            </Text>
          )}
          {section.entries.length === 0 && section.emptyText !== undefined ? (
            <Text size="xs" c="dimmed" px="xs">
              {section.emptyText}
            </Text>
          ) : (
            section.entries.map(renderEntry)
          )}
        </Fragment>
      ))}
    </Stack>
  )
}
