import { useEffect, useMemo, useRef } from 'react'
import { AppShell, Button, Group, Menu, Title, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { newDiagram, useEditorStore } from './store/editor'
import { useMermaidPreview } from './lib/use-mermaid-preview'
import { saveDiagram } from './lib/storage'
import { debounce } from './lib/debounce'
import { detectDiagramType } from './lib/diagram-registry'
import { CodePanel } from './components/CodePanel'
import { CanvasPanel } from './components/CanvasPanel'
import { PropertyPanel } from './components/PropertyPanel'
import { ThreePaneLayout } from './components/ThreePaneLayout'
import { useCanvasKeyboard } from './lib/editing/use-canvas-keyboard'

/**
 * 三栏布局（工单 04）：代码面板 | 画布 | 属性面板（结构树 + 属性表单）。
 * - 源码是唯一真相源（ADR-0008）：任何编辑都改源码
 * - 属性面板的投影来自自研解析器；解析失败时表单整体禁用并可跳转错误行
 */
export default function App() {
  const { t } = useTranslation()
  const source = useEditorStore((s) => s.source)
  const canUndo = useEditorStore((s) => s.canUndo)
  const canRedo = useEditorStore((s) => s.canRedo)
  const undo = useEditorStore((s) => s.undo)
  const redo = useEditorStore((s) => s.redo)
  const preview = useMermaidPreview(source)

  // 投影：源码 → 图种注册表分发解析器 → 只读结构视图（属性面板，工单 06 起）
  const diagramType = useMemo(() => detectDiagramType(source), [source])
  const parseResult = useMemo(() => diagramType.parser.parse(source), [diagramType, source])
  const projection = useMemo(
    () => (parseResult.ok ? diagramType.buildProjection(parseResult.doc) : null),
    [diagramType, parseResult],
  )

  // 画布键盘操作（工单 05）：flowchart 选中节点后 Del/Tab/Enter，经管线落码可撤销
  useCanvasKeyboard(projection !== null && projection.type === 'flowchart' ? projection.flowchart : null)

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
          <Group gap="xs">
            <Menu shadow="md" withinPortal>
              <Menu.Target>
                <Button variant="default" size="compact-sm" aria-label={t('newDiagram.title')}>
                  {t('newDiagram.title')}
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={() => newDiagram('flowchart')}>{t('newDiagram.flowchart')}</Menu.Item>
                <Menu.Item onClick={() => newDiagram('sequence')}>{t('newDiagram.sequence')}</Menu.Item>
                <Menu.Item onClick={() => newDiagram('class')}>{t('newDiagram.class')}</Menu.Item>
              </Menu.Dropdown>
            </Menu>
            <Button
              variant="default"
              size="compact-sm"
              disabled={!canUndo}
              onClick={undo}
              aria-label={t('history.undo')}
            >
              {t('history.undo')}
            </Button>
            <Button
              variant="default"
              size="compact-sm"
              disabled={!canRedo}
              onClick={redo}
              aria-label={t('history.redo')}
            >
              {t('history.redo')}
            </Button>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <div style={{ height: 'calc(100vh - 56px - var(--mantine-spacing-md) * 2)' }}>
          <ThreePaneLayout
            code={<CodePanel error={preview.error} />}
            canvas={<CanvasPanel preview={preview} projection={projection} />}
            properties={
              <PropertyPanel
                projection={projection}
                parseError={parseResult.ok ? null : parseResult.error}
              />
            }
          />
        </div>
      </AppShell.Main>
    </AppShell>
  )
}
