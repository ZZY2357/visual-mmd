import { useEffect, useRef, useState } from 'react'
import { Alert, Box, Button, ColorInput, Group, Stack, Text, TextInput, Title, UnstyledButton } from '@mantine/core'
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
import type { InlineEditCloseOptions } from '../lib/editing/use-canvas-inline-edit'
import type { Rect } from '../lib/editing/inline-edit'
import { useCanvasContextMenu } from '../lib/editing/use-canvas-context-menu'
import type { ContextMenuItemId } from '../lib/editing/context-menu'
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
 *
 * 右键菜单（工单 07）：单一菜单随右键目标变化（空白/节点/连线/mindmap 节点），
 * 挂在画布容器上阻止浏览器默认菜单，代码面板不受影响；连线模式光标十字，
 * 依次单击起点终点创建连线；「添加样式」在菜单位置浮出小表单，提交才落码。
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

/** 内联编辑浮层输入框（工单 05/02）：预填当前显示文本，回车/失焦提交、Esc 取消。
 * Enter/Esc 走「归还焦点」的提交路径（keydown，用户想继续在画布上操作）；
 * 失焦提交不归还焦点（用户已点到画布之外，如代码面板）。 */
function InlineEditInput(props: {
  rect: Rect | null
  initialText: string
  onCommit: (text: string, options?: InlineEditCloseOptions) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState(props.initialText)
  const inputRef = useRef<HTMLInputElement>(null)
  const focusRef = useRef(false)
  // 聚焦并全选：新建节点命名时直接输入即替换默认名。
  // 输入框在节点渲染出来前是 display:none（rect === null），对隐藏元素 focus() 无效
  // ——等浮层定位就绪（rect 首次非空）再聚焦（工单 08 浏览器实测发现）
  useEffect(() => {
    if (props.rect === null || focusRef.current) return
    focusRef.current = true
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [props.rect])
  const rect = props.rect
  return (
    <TextInput
      ref={inputRef}
      variant="unstyled"
      // 浮层根元素标记（style/className 落在 Mantine 的 wrapper 根上）：容器点击
      // 用 .canvas-inline-edit 排除整个浮层，连它的内边距也不当作画布（工单 02）
      className="canvas-inline-edit"
      aria-label={t('canvas.inlineEditAria')}
      value={value}
      onChange={(e) => setValue(e.currentTarget.value)}
      onKeyDown={(e) => {
        // Enter/Esc 是「keydown 提交」：结束后由 hook 把焦点归还画布容器（工单 02）
        if (e.key === 'Enter') props.onCommit(value, { restoreFocus: true })
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

/** 菜单项标签（i18n key 与菜单项 id 同名） */
function menuItemLabel(t: (k: string) => string, id: ContextMenuItemId): string {
  return t(`app:canvas.menu.${id}`)
}

/** 右键菜单浮层（工单 07）：绝对定位在右键点，应用样式为原地展开的子列表 */
function ContextMenuOverlay(props: {
  x: number
  y: number
  items: ContextMenuItemId[]
  /** flowchart 投影中的全部样式名（应用样式子列表；空列表显示占位项） */
  classDefNames: string[]
  onItem: (id: ContextMenuItemId) => void
  onApplyStyle: (className: string) => void
}) {
  const { t } = useTranslation()
  const [stylesOpen, setStylesOpen] = useState(false)
  const itemSx = {
    display: 'block',
    width: '100%',
    textAlign: 'left' as const,
    padding: '4px 10px',
    fontSize: 12,
    borderRadius: 4,
  }
  return (
    <Box
      style={{
        position: 'absolute',
        left: props.x,
        top: props.y,
        zIndex: 30,
        minWidth: 140,
        background: 'var(--mantine-color-body)',
        border: '1px solid var(--mantine-color-gray-3)',
        borderRadius: 'var(--mantine-radius-sm)',
        boxShadow: 'var(--mantine-shadow-md)',
        padding: 4,
      }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {props.items.map((id) =>
        id === 'apply-style' ? (
          <Box key={id}>
            <UnstyledButton
              style={itemSx}
              onClick={() => setStylesOpen((open) => !open)}
              onMouseOver={(e) => (e.currentTarget.style.background = 'var(--mantine-color-gray-1)')}
              onMouseOut={(e) => (e.currentTarget.style.background = '')}
            >
              {menuItemLabel(t, id)} {props.classDefNames.length > 0 ? (stylesOpen ? '▾' : '▸') : ''}
            </UnstyledButton>
            {stylesOpen && (
              <Box pl={12}>
                {props.classDefNames.length === 0 ? (
                  <Text size="xs" c="dimmed" px={10} py={2}>
                    {t('app:canvas.menu.applyStyleEmpty')}
                  </Text>
                ) : (
                  props.classDefNames.map((name) => (
                    <UnstyledButton
                      key={name}
                      style={itemSx}
                      onClick={() => props.onApplyStyle(name)}
                      onMouseOver={(e) => (e.currentTarget.style.background = 'var(--mantine-color-gray-1)')}
                      onMouseOut={(e) => (e.currentTarget.style.background = '')}
                    >
                      {name}
                    </UnstyledButton>
                  ))
                )}
              </Box>
            )}
          </Box>
        ) : (
          <UnstyledButton
            key={id}
            style={{ ...itemSx, color: id === 'delete' ? 'var(--mantine-color-red-filled)' : undefined }}
            onClick={() => props.onItem(id)}
            onMouseOver={(e) => (e.currentTarget.style.background = 'var(--mantine-color-gray-1)')}
            onMouseOut={(e) => (e.currentTarget.style.background = '')}
          >
            {menuItemLabel(t, id)}
          </UnstyledButton>
        ),
      )}
    </Box>
  )
}

/** 「添加样式」小表单浮层（工单 07）：名称 + 颜色，提交才落码 */
function AddStyleForm(props: {
  x: number
  y: number
  onSubmit: (name: string, color: string) => boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [color, setColor] = useState('')
  const invalid = name.trim() === '' || /[\s,]/.test(name.trim())
  return (
    <Box
      style={{
        position: 'absolute',
        left: props.x,
        top: props.y,
        zIndex: 30,
        width: 200,
        background: 'var(--mantine-color-body)',
        border: '1px solid var(--mantine-color-gray-3)',
        borderRadius: 'var(--mantine-radius-sm)',
        boxShadow: 'var(--mantine-shadow-md)',
        padding: 8,
      }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Stack gap={6}>
        <TextInput
          size="xs"
          label={t('app:canvas.menu.styleName')}
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !invalid && props.onSubmit(name, color)) props.onClose()
          }}
          error={invalid && name.trim() !== '' ? t('app:canvas.menu.styleNameInvalid') : undefined}
        />
        <ColorInput
          size="xs"
          label={t('app:canvas.menu.styleColor')}
          value={color}
          onChange={setColor}
          closeOnColorSwatchClick
        />
        <Group gap="xs" justify="flex-end">
          <Button size="compact-xs" variant="default" onClick={props.onClose}>
            {t('app:propertyPanel.cancel')}
          </Button>
          <Button
            size="compact-xs"
            disabled={invalid}
            onClick={() => {
              if (props.onSubmit(name, color)) props.onClose()
            }}
          >
            {t('app:propertyPanel.add')}
          </Button>
        </Group>
      </Stack>
    </Box>
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

  // 右键菜单（工单 07）：菜单/连线模式/添加样式表单三个状态托管在 hook 中，
  // 编辑文本与新建节点的内联命名同样走 beginEdit
  const ctx = useCanvasContextMenu({
    projection,
    resolver: projection !== null ? resolverOf(projection) : null,
    containerRef,
    onNodeCreated: beginEdit,
    newNodeText: t('app:propertyPanel.mindmapNewNode'),
  })
  const classDefNames = projection?.type === 'flowchart' ? projection.flowchart.classDefs.map((c) => c.name) : []

  // 菜单项 → 动作分发（编辑标签：右键时已选中该连线，EdgeForm 承接）
  const onMenuItem = (id: ContextMenuItemId): void => {
    if (id === 'add-node') ctx.addNode()
    else if (id === 'link-mode') ctx.enterLinkMode()
    else if (id === 'add-style') ctx.openStyleForm()
    else if (id === 'add-subgraph') ctx.addSubgraph()
    else if (id === 'link-from-here') {
      const target = ctx.menu?.target
      if (target !== undefined && target.kind === 'flowchart-node') ctx.enterLinkMode(target.nodeId)
    } else if (id === 'edit-text') ctx.beginEditText()
    else if (id === 'edit-label') ctx.beginEditLabel()
    else if (id === 'delete') ctx.deleteTarget()
    else if (id === 'add-child') ctx.addChildToMindmap()
  }

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
          // 连线模式光标十字（工单 07），其余保持背景拖拽的抓手
          cursor: ctx.linkMode.stage !== 'idle' ? 'crosshair' : 'grab',
          outline: 'none', // 画布聚焦即键盘生效，不要浏览器默认焦点圈
        }}
        onClick={(e) => {
          // 只在点击画布背景/节点时把焦点收进容器：Tab/Enter/Del 随即可用。
          // 点击内联编辑浮层（含其根元素的留白）时不抢焦点——否则输入框立刻失焦并
          // 触发 onBlur 提交，表现为「输入框点不进去」（工单 02 修复的死守卫：
          // 原来这个 if 后面还跟着一句无条件 focus()，守卫形同虚设）
          const clickedControl =
            (e.target as Element).closest('input, textarea, .cm-editor, .canvas-inline-edit') !== null
          if (!clickedControl) selectionRef.current?.focus()
          // 打开的菜单先收起（点击画布任意处关闭菜单）
          if (ctx.menu !== null) {
            ctx.closeMenu()
            return
          }
          // 连线模式优先消费单击（工单 07）：节点 = 推进，空白 = 取消
          if (ctx.onCanvasClick(e)) return
          onClick(e)
        }}
        onContextMenu={ctx.onContextMenu}
        onDoubleClick={onDoubleClick}
        onPointerDown={(e) => {
          // 内联编辑期间不让背景拖拽抢走指针（输入框上的按下要留给文本选择）
          if (editing !== null) return
          // 右键菜单 / 添加样式表单打开时也不启动背景拖拽：拖拽的 setPointerCapture
          // 会把后续指针事件（含派生的 click）劫持到容器，菜单项/表单按钮将永远
          // 收不到点击（工单 08 浏览器实测发现）
          if (ctx.menu !== null || ctx.styleForm !== null) return
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
        {ctx.menu !== null && (
          <ContextMenuOverlay
            x={ctx.menu.x}
            y={ctx.menu.y}
            items={ctx.menu.items}
            classDefNames={classDefNames}
            onItem={onMenuItem}
            onApplyStyle={ctx.applyStyle}
          />
        )}
        {ctx.styleForm !== null && (
          <AddStyleForm
            x={ctx.styleForm.x}
            y={ctx.styleForm.y}
            onSubmit={ctx.submitStyleForm}
            onClose={ctx.closeStyleForm}
          />
        )}
      </Box>
    </Stack>
  )
}
