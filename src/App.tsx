import { useEffect, useMemo, useRef, useState } from 'react'
import { AppShell, Button, Group, Menu, Title, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from './store/editor'
import { useMermaidPreview } from './lib/use-mermaid-preview'
import { saveLibrary } from './lib/library-storage'
import { debounce } from './lib/debounce'
import { detectDiagramType } from './lib/diagram-registry'
import { CodePanel } from './components/CodePanel'
import { CanvasPanel } from './components/CanvasPanel'
import { PropertyPanel } from './components/PropertyPanel'
import { ThreePaneLayout } from './components/ThreePaneLayout'
import { DiagramLibraryDrawer } from './components/DiagramLibraryDrawer'
import {
  downloadBlob,
  readFileText,
  sanitizeFileName,
  svgToPngBlob,
  withExtension,
} from './lib/file-io'

/**
 * 三栏布局（工单 04）：代码面板 | 画布 | 属性面板（结构树 + 属性表单）。
 * - 源码是唯一真相源（ADR-0008）：任何编辑都改源码
 * - 属性面板的投影来自自研解析器；解析失败时表单整体禁用并可跳转错误行
 * - 图表库（工单 09）：多张图表存 localStorage，活跃图表随编辑自动保存
 */
export default function App() {
  const { t } = useTranslation()
  const source = useEditorStore((s) => s.source)
  const diagrams = useEditorStore((s) => s.diagrams)
  const activeId = useEditorStore((s) => s.activeId)
  const canUndo = useEditorStore((s) => s.canUndo)
  const canRedo = useEditorStore((s) => s.canRedo)
  const undo = useEditorStore((s) => s.undo)
  const redo = useEditorStore((s) => s.redo)
  const newDiagram = useEditorStore((s) => s.newDiagram)
  const commitEdit = useEditorStore((s) => s.commitEdit)
  const [libraryOpened, setLibraryOpened] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const preview = useMermaidPreview(source)

  // 当前图表名（工单 10）：导出文件名的建议来源
  const activeName = useMemo(
    () => diagrams.find((d) => d.id === activeId)?.name ?? '',
    [diagrams, activeId],
  )
  const exportBaseName = useMemo(() => sanitizeFileName(activeName), [activeName])

  // ---- 导入/导出（工单 10）----
  // 导入：文件内容原样成为当前源码（commitEdit 独立快照，可撤销）；
  // 非法内容无需特判——预览与投影对源码的既有错误冻结路径自然生效
  const handleImportFile = async (file: File | undefined) => {
    if (file === undefined) return
    try {
      const text = await readFileText(file)
      commitEdit(text)
    } catch {
      window.alert(t('file.importReadError'))
    }
    // 允许连续选择同一个文件再次触发 change
    if (fileInputRef.current !== null) fileInputRef.current.value = ''
  }
  const handleExportMmd = () => {
    // 导出的源码即代码面板原文（逐字保留承诺延伸到交付物），不做任何变换
    downloadBlob(new Blob([source], { type: 'text/plain;charset=utf-8' }), withExtension(exportBaseName, 'mmd'))
  }
  const handleExportSvg = () => {
    if (preview.svg === null) return
    downloadBlob(new Blob([preview.svg], { type: 'image/svg+xml;charset=utf-8' }), withExtension(exportBaseName, 'svg'))
  }
  const handleExportPng = async () => {
    if (preview.svg === null) return
    const blob = await svgToPngBlob(preview.svg, { scale: 2, background: '#ffffff' })
    downloadBlob(blob, withExtension(exportBaseName, 'png'))
  }

  // 投影：源码 → 图表注册表分发解析器 → 只读结构视图（属性面板，工单 06 起）。
  // detect 失败 = unsupported 态（more-diagrams 工单 01）：mermaid 预览与代码面板照常，
  // 投影为空、无选中、无右键动作，画布/属性面板显示「暂不支持可视化编辑」占位提示——
  // 禁止把未识别源码喂给 flowchart 解析器（原默认 flowchart 的缺陷已移除）。
  const diagramType = useMemo(() => detectDiagramType(source), [source])
  const unsupported = diagramType === null
  const parseResult = useMemo(
    () => (diagramType === null ? null : diagramType.parser.parse(source)),
    [diagramType, source],
  )
  const projection = useMemo(
    () =>
      diagramType !== null && parseResult !== null && parseResult.ok
        ? diagramType.buildProjection(parseResult.doc)
        : null,
    [diagramType, parseResult],
  )

  // 画布键盘操作（工单 04）：移入 CanvasPanel —— keydown 挂在画布容器上，
  // 仅画布聚焦时拦截 Tab/Enter/Del，焦点在代码面板/输入框时完全不干扰

  // 图表库自动保存（工单 09）：整库序列化为一个 key，活跃图表随编辑更新；
  // 连续输入合并为一次写入（防抖），卸载/隐藏时立即冲刷
  const debouncedSaveRef = useRef(
    debounce((lib: { diagrams: typeof diagrams; activeId: string | null }) => saveLibrary(lib), 500),
  )
  useEffect(() => {
    const debouncedSave = debouncedSaveRef.current
    const flush = () => debouncedSave.flush()
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', flush)
    debouncedSave({ diagrams, activeId })
  }, [diagrams, activeId])
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
            <input
              ref={fileInputRef}
              type="file"
              accept=".mmd,text/plain"
              style={{ display: 'none' }}
              onChange={(e) => void handleImportFile(e.target.files?.[0])}
            />
            <Button
              variant="default"
              size="compact-sm"
              onClick={() => fileInputRef.current?.click()}
              aria-label={t('file.importAria')}
            >
              {t('file.import')}
            </Button>
            <Menu shadow="md" withinPortal>
              <Menu.Target>
                <Button variant="default" size="compact-sm" aria-label={t('file.export')}>
                  {t('file.export')}
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={handleExportMmd}>{t('file.exportMmd')}</Menu.Item>
                <Menu.Item
                  disabled={preview.svg === null}
                  title={preview.svg === null ? t('file.exportUnavailable') : undefined}
                  onClick={() => void handleExportSvg()}
                >
                  {t('file.exportSvg')}
                </Menu.Item>
                <Menu.Item
                  disabled={preview.svg === null}
                  title={preview.svg === null ? t('file.exportUnavailable') : undefined}
                  onClick={() => void handleExportPng()}
                >
                  {t('file.exportPng')}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
            <Button
              variant="default"
              size="compact-sm"
              onClick={() => setLibraryOpened(true)}
              aria-label={t('library.open')}
            >
              {t('library.title')}
            </Button>
            <Menu shadow="md" withinPortal>
              <Menu.Target>
                <Button variant="default" size="compact-sm" aria-label={t('newDiagram.title')}>
                  {t('newDiagram.title')}
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={() => newDiagram('flowchart', t('newDiagram.flowchart'))}>
                  {t('newDiagram.flowchart')}
                </Menu.Item>
                <Menu.Item onClick={() => newDiagram('sequence', t('newDiagram.sequence'))}>
                  {t('newDiagram.sequence')}
                </Menu.Item>
                <Menu.Item onClick={() => newDiagram('class', t('newDiagram.class'))}>
                  {t('newDiagram.class')}
                </Menu.Item>
                <Menu.Item onClick={() => newDiagram('mindmap', t('newDiagram.mindmap'))}>
                  {t('newDiagram.mindmap')}
                </Menu.Item>
                <Menu.Item onClick={() => newDiagram('state', t('newDiagram.state'))}>
                  {t('newDiagram.state')}
                </Menu.Item>
                <Menu.Item onClick={() => newDiagram('er', t('newDiagram.er'))}>
                  {t('newDiagram.er')}
                </Menu.Item>
                <Menu.Item onClick={() => newDiagram('gitgraph', t('newDiagram.gitgraph'))}>
                  {t('newDiagram.gitgraph')}
                </Menu.Item>
                <Menu.Item onClick={() => newDiagram('timeline', t('newDiagram.timeline'))}>
                  {t('newDiagram.timeline')}
                </Menu.Item>
                <Menu.Item onClick={() => newDiagram('kanban', t('newDiagram.kanban'))}>
                  {t('newDiagram.kanban')}
                </Menu.Item>
                <Menu.Item onClick={() => newDiagram('requirement', t('newDiagram.requirement'))}>
                  {t('newDiagram.requirement')}
                </Menu.Item>
                <Menu.Item onClick={() => newDiagram('journey', t('newDiagram.journey'))}>
                  {t('newDiagram.journey')}
                </Menu.Item>
                <Menu.Item onClick={() => newDiagram('pie', t('newDiagram.pie'))}>
                  {t('newDiagram.pie')}
                </Menu.Item>
                <Menu.Item onClick={() => newDiagram('block', t('newDiagram.block'))}>
                  {t('newDiagram.block')}
                </Menu.Item>
                <Menu.Item onClick={() => newDiagram('sankey', t('newDiagram.sankey'))}>
                  {t('newDiagram.sankey')}
                </Menu.Item>
                <Menu.Item onClick={() => newDiagram('gantt', t('newDiagram.gantt'))}>
                  {t('newDiagram.gantt')}
                </Menu.Item>
                <Menu.Item onClick={() => newDiagram('quadrant', t('newDiagram.quadrant'))}>
                  {t('newDiagram.quadrant')}
                </Menu.Item>
                <Menu.Item onClick={() => newDiagram('packet', t('newDiagram.packet'))}>
                  {t('newDiagram.packet')}
                </Menu.Item>
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
            canvas={<CanvasPanel preview={preview} projection={projection} unsupported={unsupported} />}
            properties={
              <PropertyPanel
                projection={projection}
                parseError={parseResult !== null && !parseResult.ok ? parseResult.error : null}
                unsupported={unsupported}
              />
            }
          />
        </div>
      </AppShell.Main>
      <DiagramLibraryDrawer opened={libraryOpened} onClose={() => setLibraryOpened(false)} />
    </AppShell>
  )
}
