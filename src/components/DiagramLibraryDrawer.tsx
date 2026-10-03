import { useState } from 'react'
import {
  ActionIcon,
  Badge,
  Button,
  Drawer,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../store/editor'
import type { StoredLibraryDiagram } from '../lib/library-storage'

/**
 * 图表库抽屉（工单 09）：列出 localStorage 中的全部图表，
 * 支持打开（切换）、重命名、复制、删除；新建走顶栏「新建」菜单（按类型模板起步）。
 */
export function DiagramLibraryDrawer({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const diagrams = useEditorStore((s) => s.diagrams)
  const activeId = useEditorStore((s) => s.activeId)
  const openDiagram = useEditorStore((s) => s.openDiagram)
  const renameDiagram = useEditorStore((s) => s.renameDiagram)
  const duplicateDiagram = useEditorStore((s) => s.duplicateDiagram)
  const deleteDiagram = useEditorStore((s) => s.deleteDiagram)

  const [renaming, setRenaming] = useState<StoredLibraryDiagram | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleting, setDeleting] = useState<StoredLibraryDiagram | null>(null)

  const openRename = (diagram: StoredLibraryDiagram) => {
    setRenaming(diagram)
    setRenameValue(diagram.name)
  }

  const applyRename = () => {
    if (renaming !== null) renameDiagram(renaming.id, renameValue)
    setRenaming(null)
  }

  const confirmDelete = () => {
    if (deleting !== null) deleteDiagram(deleting.id)
    setDeleting(null)
  }

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="left"
      title={t('library.title')}
      aria-label={t('library.ariaLabel')}
    >
      <Stack gap="xs">
        {diagrams.length === 0 && <Text c="dimmed">{t('library.empty')}</Text>}
        {diagrams.map((diagram) => {
          const active = diagram.id === activeId
          return (
            <Group
              key={diagram.id}
              justify="space-between"
              wrap="nowrap"
              style={{
                border: '1px solid var(--mantine-color-default-border)',
                borderRadius: 'var(--mantine-radius-md)',
                padding: 'var(--mantine-spacing-xs)',
                cursor: 'pointer',
              }}
              onClick={() => openDiagram(diagram.id)}
              role="button"
              aria-label={t('library.openAria', { name: diagram.name })}
            >
              <Group gap="xs" wrap="nowrap" maw="60%">
                <Text size="sm" truncate="end" fw={active ? 700 : 400}>
                  {diagram.name}
                </Text>
                {active && (
                  <Badge size="xs" variant="light">
                    {t('library.active')}
                  </Badge>
                )}
              </Group>
              <Group gap={4} wrap="nowrap">
                <Tooltip label={t('library.rename')}>
                  <ActionIcon
                    variant="default"
                    size="sm"
                    aria-label={t('library.renameAria', { name: diagram.name })}
                    onClick={(e) => {
                      e.stopPropagation()
                      openRename(diagram)
                    }}
                  >
                    ✎
                  </ActionIcon>
                </Tooltip>
                <Tooltip label={t('library.duplicate')}>
                  <ActionIcon
                    variant="default"
                    size="sm"
                    aria-label={t('library.duplicateAria', { name: diagram.name })}
                    onClick={(e) => {
                      e.stopPropagation()
                      duplicateDiagram(diagram.id)
                    }}
                  >
                    ⧉
                  </ActionIcon>
                </Tooltip>
                <Tooltip label={t('library.delete')}>
                  <ActionIcon
                    variant="default"
                    size="sm"
                    color="red"
                    aria-label={t('library.deleteAria', { name: diagram.name })}
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleting(diagram)
                    }}
                  >
                    ✕
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Group>
          )
        })}
      </Stack>

      <Modal opened={renaming !== null} onClose={() => setRenaming(null)} title={t('library.renameTitle')} size="sm">
        <Stack gap="sm">
          <TextInput
            data-autofocus
            label={t('library.nameLabel')}
            value={renameValue}
            onChange={(e) => setRenameValue(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyRename()
            }}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setRenaming(null)}>
              {t('library.cancel')}
            </Button>
            <Button onClick={applyRename}>{t('library.apply')}</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={deleting !== null} onClose={() => setDeleting(null)} title={t('library.deleteTitle')} size="sm">
        <Stack gap="sm">
          <Text size="sm">{t('library.deleteConfirm', { name: deleting?.name ?? '' })}</Text>
          <Text size="sm" c="dimmed">{t('library.deleteIrreversible')}</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleting(null)}>
              {t('library.cancel')}
            </Button>
            <Button color="red" onClick={confirmDelete}>
              {t('library.deleteConfirmAction')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Drawer>
  )
}
