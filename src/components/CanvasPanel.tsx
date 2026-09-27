import { useEffect, useRef, useState } from 'react'
import { Alert, Box, Button, Stack, Text, TextInput, Title } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { MermaidPreview } from '../lib/use-mermaid-preview'
import { flowchartDataIdResolver, toEditorSelection } from '../lib/canvas-selection/flowchart-adapter'
import { mindmapDataIdResolver, mindmapDomIdOf } from '../lib/canvas-selection/mindmap-adapter'
import type { CanvasSelection, DataIdResolver } from '../lib/canvas-selection/data-id'
import { nodeDataIdResolver } from '../lib/canvas-selection/data-id'
import type { Selection } from '../lib/projection/selection'
import { useCanvasSelection } from '../lib/canvas-selection/use-canvas-selection'
import { useCanvasKeyboard } from '../lib/editing/use-canvas-keyboard'
import { useCanvasInlineEdit, inlineEditTextOf } from '../lib/editing/use-canvas-inline-edit'
import type { Rect } from '../lib/editing/inline-edit'
import { useCanvasView } from '../lib/canvas-view/use-canvas-view'
import type { AnyProjection } from '../lib/diagram-registry'
import { useEditorStore } from '../store/editor'

/**
 * 画布（中间）：展示 mermaid 实时渲染的预览。
 * 渲染逻辑在 useMermaidPreview 中；出错时本组件只是不换掉旧 SVG（冻结）。
 *
 * 画布选中（工单 05）：点击渲染 SVG 中带 data-id 的元素选中（ADR-0007 事实约定）。
 * 匹配与高亮是图种无关的通用能力（src/lib/canvas-selection/），flowchart 经
 * flowchartDataIdResolver 适配；data-id 无法匹配时安静地不选中，不崩溃。
 *
 * 视图（工单 03）：fit / 滚轮锚点缩放 / 背景拖拽平移见 src/lib/canvas-view/；
 * 变换只落在 DOM 上，导出走 preview.svg 原始字符串，不受视图影响。
 *
 * 内联编辑（工单 05）：双击节点（flowchart + mindmap）原位浮出输入框，回车/失焦
 * 提交、Esc 取消；Tab/Enter 新建节点后经 onNodeCreated 自动进入同一输入框。
 */

interface CanvasPanelProps {
  preview: MermaidPreview
  projection: AnyProjection | null
}

/** 图种 → data-id resolver（工单 06/07/08）：flowchart 全套适配；sequence 参与者与
 * class 类的 data-id 即其 id（尽力而为，无法匹配时不选中）。
 * mindmap（工单 06）：mermaid 不发 data-id，但节点 g 的 DOM id 为 node_N（源码节点序），
 * 经 mindmapDataIdResolver 映射回投影节点。 */
function resolverOf(projection: AnyProjection): DataIdResolver {
  if (projection.type === 'flowchart') return flowchartDataIdResolver(projection.flowchart)
  if (projection.type === 'sequence') return nodeDataIdResolver(projection.sequence.participants.map((p) => p.actorId))
  if (projection.type === 'mindmap') return mindmapDataIdResolver(projection.mindmap)
  return nodeDataIdResolver(projection.class.classes.map((c) => c.name))
}

/** 图种无关的画布选中 → 编辑器选中 */
function canvasToEditorSelection(projection: AnyProjection, canvasSelection: CanvasSelection): Selection | null {
  if (projection.type === 'flowchart') return toEditorSelection(canvasSelection)
  if (projection.type === 'mindmap') {
    // mindmap 画布选中只可能是节点（无连线）；canvas id 即 elementId（mindmap-node:N）
    return canvasSelection.kind === 'node' ? { kind: 'mindmap-node', elementId: canvasSelection.id } : null
  }
  if (canvasSelection.kind === 'node') {
    return projection.type === 'sequence'
      ? { kind: 'participant', actorId: canvasSelection.id }
      : { kind: 'class', name: canvasSelection.id }
  }
  return null
}

/** 当前编辑器选中对应的 data-id（高亮用） */
function selectedDataIdOf(selection: Selection): string | null {
  switch (selection.kind) {
    case 'node':
      return selection.nodeId
    case 'participant':
      return selection.actorId
    case 'class':
      return selection.name
    case 'mindmap-node':
      // mindmap 无 data-id：高亮按节点 DOM id（node_{N-1}）匹配（highlight 已支持）
      return mindmapDomIdOf(selection.elementId)
    default:
      return null
  }
}

/** 内联编辑浮层输入框（工单 05）：预填当前显示文本，回车/失焦提交、Esc 取消 */
function InlineEditInput(props: { rect: Rect | null; initialText: string; onCommit: (text: string) => void; onCancel: () => void }) {
  const { t } = useTranslation()
  const [value, setValue] = useState(props.initialText)
  const inputRef = useRef<HTMLInputElement>(null)
  // 挂载即聚焦并全选：新建节点命名时直接输入即替换默认名
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])
  const rect = props.rect
  return (
    <TextInput
      ref={inputRef}
      variant="unstyled"
      aria-label={t('canvas.inlineEditAria')}
      value={value}
      onChange={(e) => setValue(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') props.onCommit(value)
        else if (e.key === 'Escape') props.onCancel()
      }}
      onBlur={() => props.onCommit(value)}
      style={{
        position: 'absolute',
        // 节点尚未渲染出来（新建节点等 SVG 重渲染）时先不显示
        display: rect === null ? 'none' : undefined,
        left: rect?.left,
        top: rect?.top,
        width: Math.max(rect?.width ?? 0, 40),
        height: rect?.height,
        zIndex: 20,
        background: 'var(--mantine-color-body)',
        outline: '1px solid var(--mantine-color-blue-filled)',
        paddingInline: 4,
        fontSize: 12,
      }}
    />
  )
}

export function CanvasPanel({ preview, projection }: CanvasPanelProps) {
  const { t } = useTranslation()
  const select = useEditorStore((s) => s.select)
  const selection = useEditorStore((s) => s.selection)
  const { svg, error } = preview

  // 视图（工单 03）：fit / 滚轮锚点缩放 / 背景拖拽平移；SVG 换新即重新 fit，
  // 切换图表自然重置，无需持久化
  const { containerRef, view, fit, onPointerDown, onPointerMove, onPointerUp } = useCanvasView(svg)

  // 内联编辑（工单 05）：双击 flowchart/mindmap 节点原位浮出输入框
  const { editing, onDoubleClick, beginEdit, commit, cancel } = useCanvasInlineEdit({
    projection,
    resolver:
      projection !== null && (projection.type === 'flowchart' || projection.type === 'mindmap')
        ? resolverOf(projection)
        : null,
    svg,
    containerRef,
    view,
  })

  // 键盘焦点体系（工单 04，工单 06 扩展 mindmap）：容器 tabindex=0，点击画布即持有
  // 焦点；keydown 挂在容器上，Tab/Enter/Del 仅在画布聚焦时拦截，焦点在代码面板/
  // 输入框时完全不干扰。flowchart 与 mindmap 各有画布键盘语义（Tab 加子 / Enter 加
  // 同级 / Del 删除），其它图种接线见后续工单
  useCanvasKeyboard(
    projection === null
      ? null
      : projection.type === 'flowchart'
        ? { kind: 'flowchart', projection: projection.flowchart }
        : projection.type === 'mindmap'
          ? { kind: 'mindmap', projection: projection.mindmap }
          : null,
    {
      containerRef,
      // 工单 05/06 接线：新建节点落码后立即进入内联命名
      onNodeCreated: beginEdit,
      newNodeText: t('app:propertyPanel.mindmapNewNode'),
    },
  )

  // 结构树键盘（工单 06）添加节点后的内联命名请求：画布侧消费（gotoLine 同款 nonce 模式）
  const pendingInlineEdit = useEditorStore((s) => s.pendingInlineEdit)
  useEffect(() => {
    if (pendingInlineEdit === null || projection === null) return
    // 请求目标必须属于当前图种（切换图表后残留请求安静丢弃）
    const matches =
      (projection.type === 'flowchart' && pendingInlineEdit.target.kind === 'flowchart') ||
      (projection.type === 'mindmap' && pendingInlineEdit.target.kind === 'mindmap')
    if (matches) beginEdit(pendingInlineEdit.target)
  }, [pendingInlineEdit, projection, beginEdit])

  const { containerRef: selectionRef, onClick } = useCanvasSelection({
    svg,
    containerRef,
    resolver: projection !== null ? resolverOf(projection) : null,
    selectedDataId: selection !== null ? selectedDataIdOf(selection) : null,
    onSelect: (canvasSelection) => {
      if (projection !== null) {
        const editorSelection = canvasToEditorSelection(projection, canvasSelection)
        if (editorSelection !== null) select(editorSelection)
      }
    },
  })

  return (
    <Stack gap="xs" h="100%" style={{ minHeight: 0 }}>
      <Title order={4}>{t('canvas.title')}</Title>
      <Text size="xs" c="dimmed">
        {t('canvas.keyboardHint')}
      </Text>
      {error !== null && (
        <Alert color="red" title={t('canvas.errorTitle')}>
          <Text size="sm">{error.message}</Text>
        </Alert>
      )}
      <Box
        ref={selectionRef}
        tabIndex={0}
        h="100%"
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          background: 'var(--mantine-color-gray-0)',
          borderRadius: 'var(--mantine-radius-sm)',
          cursor: 'grab',
          outline: 'none', // 画布聚焦即键盘生效，不要浏览器默认焦点圈
        }}
        onClick={(e) => {
          // 点击画布（含节点）把焦点收进容器：Tab/Enter/Del 随即可用
          selectionRef.current?.focus()
          onClick(e)
        }}
        onDoubleClick={onDoubleClick}
        onPointerDown={(e) => {
          // 内联编辑期间不让背景拖拽抢走指针（输入框上的按下要留给文本选择）
          if (editing !== null) return
          onPointerDown(e)
        }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {svg === null ? (
          <Text c="dimmed" mt="xl" ta="center">
            {error === null ? t('canvas.emptySource') : error.message}
          </Text>
        ) : (
          <Box dangerouslySetInnerHTML={{ __html: svg }} style={{ position: 'absolute', inset: 0 }} />
        )}
        {svg !== null && (
          <Button
            size="compact-xs"
            variant="default"
            style={{ position: 'absolute', top: 8, right: 8, zIndex: 10 }}
            onClick={fit}
          >
            {t('canvas.fitView')}
          </Button>
        )}
        {editing !== null && (
          <InlineEditInput
            rect={editing.rect}
            initialText={inlineEditTextOf(projection, editing.target)}
            onCommit={commit}
            onCancel={cancel}
          />
        )}
      </Box>
    </Stack>
  )
}
