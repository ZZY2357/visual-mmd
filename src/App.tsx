import { useEffect, useRef } from 'react'
import { AppShell, Group, Title, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from './store/editor'
import { useMermaidPreview } from './lib/use-mermaid-preview'
import { saveDiagram } from './lib/storage'
import { debounce } from './lib/debounce'
import { CodePanel } from './components/CodePanel'
import { CanvasPanel } from './components/CanvasPanel'

/**
 * 应用骨架（工单 01）：代码面板 | 画布 两栏。
 * - 源码是唯一真相源（ADR-0008）：代码面板编辑 → store.source → mermaid 渲染
 * - 非法语法：画布冻结在最近一次合法状态，代码面板错误行标红
 * - 源码变更自动保存（防抖 500ms）到 localStorage，刷新恢复
 */
export default function App() {
  const { t } = useTranslation()
  const source = useEditorStore((s) => s.source)
  const preview = useMermaidPreview(source)

  // 自动保存：连续输入合并为一次写入（防抖），卸载/隐藏时立即冲刷
  const debouncedSaveRef = useRef(debounce((src: string) => saveDiagram(src), 500))
  useEffect(() => {
    const debouncedSave = debouncedSaveRef.current
    const flush = () => debouncedSave.flush()
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', flush)
    debouncedSave(source)
  }, [source])
  useEffect(
    () => () => {
      debouncedSaveRef.current.flush()
    },
    [],
  )

  return (
    <AppShell
      header={{ height: 56 }}
      padding="md"
      layout="default"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Title order={3}>{t('title')}</Title>
            <Text size="sm" c="dimmed">
              {t('subtitle')}
            </Text>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(320px, 5fr) minmax(0, 7fr)',
            gap: 16,
            height: 'calc(100vh - 56px - var(--mantine-spacing-md) * 2)',
          }}
        >
          <CodePanel error={preview.error} />
          <CanvasPanel preview={preview} />
        </div>
      </AppShell.Main>
    </AppShell>
  )
}
