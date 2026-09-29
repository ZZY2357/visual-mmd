import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Alert, Box, Button, ColorInput, Group, Stack, Text, TextInput, Title, UnstyledButton } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { MermaidPreview } from '../lib/use-mermaid-preview'
import { flowchartDataIdResolver, toEditorSelection } from '../lib/canvas-selection/flowchart-adapter'
import { mindmapDataIdResolver, mindmapDomIdOf } from '../lib/canvas-selection/mindmap-adapter'
import type { CanvasSelection, DataIdResolver } from '../lib/canvas-selection/data-id'
import { elementDataIdResolver, nodeDataIdResolver } from '../lib/canvas-selection/data-id'
import { edgeSelectionOf } from '../lib/canvas-selection/edge-adapter'
import {
  annotateClassRelationIdentities,
  annotateSequenceIdentities,
  hitTestEdgeIdentity,
  relationShapesOf,
} from '../lib/canvas-selection/edge-locate'
import type { Selection } from '../lib/projection/selection'
import type { SequenceProjection } from '../lib/projection/sequence-projection'
import { useCanvasSelection } from '../lib/canvas-selection/use-canvas-selection'
import { useCanvasKeyboard } from '../lib/editing/use-canvas-keyboard'
import type { EditKeyRequest } from '../lib/editing/use-canvas-keyboard'
import type { CanvasKeyboardProjection, CanvasNavigation, NodeExtent } from '../lib/editing/canvas-keyboard'
import { measureNodeExtents } from '../lib/editing/canvas-measure'
import { useCanvasInlineEdit, inlineEditTextOf } from '../lib/editing/use-canvas-inline-edit'
import type { InlineEditCloseOptions } from '../lib/editing/use-canvas-inline-edit'
import type { Rect } from '../lib/editing/inline-edit'
import { useCanvasContextMenu } from '../lib/editing/use-canvas-context-menu'
import type { ContextMenuItemId } from '../lib/editing/context-menu'
import { AddMemberInlineForm, AddRelationInlineForm, AddClassNoteInlineForm } from './class-forms'
import { AddMessageInlineForm, AddNoteInlineForm, AddBlockInlineForm } from './sequence-forms'
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
 * 方向键方位导航（工单 14 / ADR-0011）：四个图种同一套几何语义——以选中节点的可视范围
 * 中心为锚点，按方向键所指的 45° 锥取最近节点；落点未完全可见时自动平移视图（瞬时无补间）。
 * 本组件把测量 / 选中映射 / 自动平移打包成 CanvasNavigation 适配对象交给 useCanvasKeyboard。
 *
 * 内联编辑（工单 05）：双击节点（flowchart/mindmap 改文本、class 改类名、sequence 改 `as`
 * 别名）原位浮出输入框，回车/失焦提交、Esc 取消；Tab/Enter 新建节点后经 onNodeCreated
 * 自动进入同一输入框。class 的成员正文、关系标签与 sequence 的消息文本/actorId 不做双击。
 *
 * 右键菜单（工单 07/04/06）：单一菜单随右键目标变化（空白/节点/连线/mindmap 节点/
 * class 节点/sequence 参与者），挂在画布容器上阻止浏览器默认菜单，代码面板不受影响；
 * 连线模式光标十字，依次单击起点终点创建连线；「添加样式」与 class/sequence 的
 * 「添加成员/关系/消息/注释/逻辑块」在菜单位置浮出小表单，提交才落码。
 */

interface CanvasPanelProps {
  preview: MermaidPreview
  projection: AnyProjection | null
}

/** 图种 → data-id resolver（工单 06/07/08/09）：flowchart 全套适配；sequence 参与者
 * 与 class 类的 data-id 即其 id（class 的 data-id 由 node-data-ids 的渲染后处理从
 * `{svgId}-classId-{类名}-{n}` 反注而来，工单 09；无法匹配时不选中）。
 * mindmap（工单 06）：mermaid 不发 data-id，但节点 g 的 DOM id 为 node_N（源码节点序），
 * 经 mindmapDataIdResolver 映射回投影节点。
 * 连线（工单 02）：class 的关系边与 sequence 的消息/注释/块按**位置序**寻址（ADR-0012），
 * data-id 为投影 elementId（`relation:1` / `message:2` …），由 edge-locate 的渲染后处理标注。 */
function resolverOf(projection: AnyProjection): DataIdResolver {
  if (projection.type === 'flowchart') return flowchartDataIdResolver(projection.flowchart)
  if (projection.type === 'sequence') {
    const nodes = nodeDataIdResolver(projection.sequence.participants.map((p) => p.actorId))
    const edges = elementDataIdResolver([
      ...projection.sequence.messages.map((m) => m.elementId),
      ...projection.sequence.notes.map((n) => n.elementId),
      ...projection.sequence.blocks.map((b) => b.elementId),
    ])
    return (dataId) => nodes(dataId) ?? edges(dataId)
  }
  if (projection.type === 'mindmap') return mindmapDataIdResolver(projection.mindmap)
  const nodes = nodeDataIdResolver(projection.class.classes.map((c) => c.name))
  const edges = elementDataIdResolver(projection.class.relations.map((r) => r.elementId))
  return (dataId) => nodes(dataId) ?? edges(dataId)
}

/** 图种无关的画布选中 → 编辑器选中 */
function canvasToEditorSelection(projection: AnyProjection, canvasSelection: CanvasSelection): Selection | null {
  if (projection.type === 'flowchart') return toEditorSelection(canvasSelection)
  if (projection.type === 'mindmap') {
    // mindmap 画布选中只可能是节点（无连线）；canvas id 即 elementId（mindmap-node:N）
    return canvasSelection.kind === 'node' ? { kind: 'mindmap-node', elementId: canvasSelection.id } : null
  }
  // 位置序连线（工单 02）：elementId 直接落成 class-relation / message / note / block
  if (canvasSelection.kind === 'element') return edgeSelectionOf(projection.type, canvasSelection.elementId)
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
    // 位置序连线（工单 02）：elementId 即渲染后标注的 data-id。class 的成员/注释
    // 本票未纳入寻址，画布上没有对应 data-id，返回后安静地不高亮（既有行为不变）。
    case 'class-relation':
    case 'message':
    case 'note':
    case 'block':
      return selection.elementId
    case 'mindmap-node':
      // mindmap 无 data-id：高亮按节点 DOM id（node_{N-1}）匹配（highlight 已支持）
      return mindmapDomIdOf(selection.elementId)
    default:
      return null
  }
}

/** 各图种全部节点的 data-id 列表（**投影顺序**，工单 14 §3 表格）：方位导航的候选与
 * 「无选中回落首节点」共用同一口径。flowchart = nodes[].nodeId；class = classes[].name；
 * sequence = participants[].actorId；mindmap = nodes[].elementId 经 mindmapDomIdOf
 * （node_{N-1}，与高亮 / selectedDataIdOf 同形态）。 */
function nodeDataIdsOf(projection: AnyProjection): string[] {
  if (projection.type === 'flowchart') return projection.flowchart.nodes.map((n) => n.nodeId)
  if (projection.type === 'class') return projection.class.classes.map((c) => c.name)
  if (projection.type === 'sequence') return projection.sequence.participants.map((p) => p.actorId)
  const ids: string[] = []
  for (const n of projection.mindmap.nodes) {
    const domId = mindmapDomIdOf(n.elementId)
    if (domId !== null) ids.push(domId) // 非 mindmap-node 形态的 elementId 不入列表（不参与导航）
  }
  return ids
}

/** 图种 → 画布键盘的 tagged union（工单 14：四个图种齐备；投影缺失时为 null） */
function keyboardProjectionOf(projection: AnyProjection | null): CanvasKeyboardProjection | null {
  if (projection === null) return null
  if (projection.type === 'flowchart') return { kind: 'flowchart', projection: projection.flowchart }
  if (projection.type === 'mindmap') return { kind: 'mindmap', projection: projection.mindmap }
  if (projection.type === 'class') return { kind: 'class', projection: projection.class }
  return { kind: 'sequence', projection: projection.sequence }
}

/** sequence 位置序标注的条数（工单 02）：块只数 block-open——`else`/`and` 是分支行，
 * 画布上不构成独立元素（其 elementId 是 `else:N`，不是位置序身份）。 */
function sequenceEdgeCounts(projection: SequenceProjection): { messages: number; notes: number; blocks: number } {
  return {
    messages: projection.messages.length,
    notes: projection.notes.length,
    blocks: projection.blocks.filter((b) => b.keyword !== 'else' && b.keyword !== 'and').length,
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

/** 破坏性菜单项（红色高亮）：删除类/参与者/连线/注释/块与既有删除同理 */
const DESTRUCTIVE_MENU_ITEMS: ContextMenuItemId[] = [
  'delete',
  'delete-class',
  'delete-participant',
  'delete-relation',
  'delete-message',
  'delete-note',
  'delete-block',
]

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
            style={{ ...itemSx, color: DESTRUCTIVE_MENU_ITEMS.includes(id) ? 'var(--mantine-color-red-filled)' : undefined }}
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

/** class/sequence 节点菜单的表单浮层外壳（工单 06）：与「添加样式」同款定位/外观，
 * 内容按 kind 选择复用属性面板的添加型小表单，另有取消按钮（提交由表单自身的按钮负责） */
function NodeFormPopup(props: { x: number; y: number; onClose: () => void; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <Box
      style={{
        position: 'absolute',
        left: props.x,
        top: props.y,
        zIndex: 30,
        width: 240,
        maxHeight: '80%',
        overflowY: 'auto',
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
        {props.children}
        <Group gap="xs" justify="flex-end">
          <Button size="compact-xs" variant="default" onClick={props.onClose}>
            {t('app:propertyPanel.cancel')}
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
  // 切换图表自然重置，无需持久化。revealRect：方向键导航的自动平移入口（工单 14）
  const { containerRef, view, fit, revealRect, onPointerDown, onPointerMove, onPointerUp } = useCanvasView(svg)

  // 内联编辑（工单 05，工单 05 批内扩到 class/sequence）：双击节点原位浮出输入框。
  // 四图种都用 resolver 精确寻址（class 的 data-id 由渲染后处理反注，sequence 参与者
  // data-id 即 actorId）；mindmap 无 data-id 时 hook 内回落文本匹配。
  const { editing, onDoubleClick, beginEdit, commit, cancel } = useCanvasInlineEdit({
    projection,
    resolver: projection !== null ? resolverOf(projection) : null,
    svg,
    containerRef,
    view,
  })

  // 方向键方位导航的适配对象（工单 14）：DOM 测量 + 选中映射 + 自动平移，全部复用现成能力：
  // measureNodeExtents（可视范围并集）、selectedDataIdOf / resolverOf / canvasToEditorSelection
  // （选中 ↔ data-id）、useCanvasView 的 revealRect（自动平移）。measureNodeExtents 不做缓存
  // （模板规模 2–13 节点，工单接受每次现测）。
  const navigation = useMemo<CanvasNavigation | undefined>(() => {
    if (projection === null) return undefined
    const ids = nodeDataIdsOf(projection)
    const resolver = resolverOf(projection)
    const toSelection = (dataId: string): Selection | null => {
      const canvasSelection = resolver(dataId)
      return canvasSelection === null ? null : canvasToEditorSelection(projection, canvasSelection)
    }
    return {
      // 按投影顺序过滤出命中的节点（容器缺失 / 节点未渲染 → 不参与导航）
      extents: () => {
        const container = containerRef.current
        if (container === null) return []
        const measured = measureNodeExtents(container, container, ids)
        const out: NodeExtent[] = []
        for (const id of ids) {
          const rect = measured.get(id)
          if (rect !== undefined) out.push({ dataId: id, rect })
        }
        return out
      },
      // 选中已不在投影中（源码被外部改动等）也算无锚点 → 回落首节点
      dataIdOf: (selection) => {
        if (selection === null) return null
        const dataId = selectedDataIdOf(selection)
        return dataId !== null && ids.includes(dataId) ? dataId : null
      },
      toSelection,
      // 现测一次拿到矩形（工单：测量不做缓存），交给 view 自动平移
      reveal: (dataId) => {
        const container = containerRef.current
        if (container === null) return
        const rect = measureNodeExtents(container, container, [dataId]).get(dataId)
        if (rect !== undefined) revealRect(rect)
      },
      firstSelection: () => {
        const firstId = ids[0]
        return firstId === undefined ? null : toSelection(firstId)
      },
    }
  }, [projection, svg, revealRect])

  // 右键菜单（工单 07）：菜单/连线模式/添加样式表单三个状态托管在 hook 中，
  // 编辑文本与新建节点的内联命名同样走 beginEdit。
  // 画布键盘的编辑键（工单 05）也复用这里的表单浮层状态：先声明 ctx，再接线键盘 hook。
  const ctx = useCanvasContextMenu({
    projection,
    resolver: projection !== null ? resolverOf(projection) : null,
    containerRef,
    onNodeCreated: beginEdit,
    newNodeText: t('app:propertyPanel.mindmapNewNode'),
  })

  // 键盘焦点体系（工单 04，工单 06 扩展 mindmap，工单 14 方向键覆盖四图种，
  // 工单 05 class/sequence 编辑键）：容器 tabindex=0，点击画布即持有焦点；keydown 挂在
  // 容器上，Tab/Enter/Del 仅在画布聚焦时拦截，焦点在代码面板/输入框时完全不干扰。
  // flowchart 与 mindmap：Tab 加子 / Enter 加同级 / Del 删除；class 与 sequence：
  // Tab/Enter 打开**已有添加表单**（成员/关系、参与者/消息），Del 删除选中元素——
  // 这条路径复用 ctx.openFormForSelection / ctx.addParticipant，不新造浮层。
  useCanvasKeyboard(keyboardProjectionOf(projection), {
    containerRef,
    // 工单 05/06 接线：新建节点落码后立即进入内联命名
    onNodeCreated: beginEdit,
    newNodeText: t('app:propertyPanel.mindmapNewNode'),
    // 工单 14：方向键方位导航 + 自动平移
    navigation,
    // 工单 05：class/sequence 的 Tab/Enter 落到已有表单或既有创建路径
    onEditKey: (request: EditKeyRequest) => {
      if (request.form === 'participant') ctx.addParticipant()
      else ctx.openFormForSelection(request.form)
    },
  })
  const classDefNames = projection?.type === 'flowchart' ? projection.flowchart.classDefs.map((c) => c.name) : []

  // 菜单项 → 动作分发（编辑标签/基数/文本：右键时已选中该连线，右侧表单承接）
  const onMenuItem = (id: ContextMenuItemId): void => {
    if (id === 'add-node') ctx.addNode()
    else if (id === 'link-mode') ctx.enterLinkMode()
    else if (id === 'add-style') ctx.openStyleForm()
    else if (id === 'add-subgraph') ctx.addSubgraph()
    else if (id === 'add-class') ctx.addClass()
    else if (id === 'add-participant') ctx.addParticipant()
    else if (id === 'add-root') ctx.addMindmapRoot()
    else if (id === 'add-member') ctx.addMember()
    else if (id === 'add-relation') ctx.addRelation()
    else if (id === 'add-message') ctx.addMessage()
    else if (id === 'add-note') ctx.addNote()
    else if (id === 'add-block') ctx.addBlock()
    else if (
      id === 'delete-class' ||
      id === 'delete-participant' ||
      id === 'delete-relation' ||
      id === 'delete-message' ||
      id === 'delete-note' ||
      id === 'delete-block'
    )
      ctx.deleteTarget()
    else if (id === 'link-from-here') {
      const target = ctx.menu?.target
      if (target !== undefined && target.kind === 'flowchart-node') ctx.enterLinkMode(target.nodeId)
    } else if (id === 'edit-text') ctx.beginEditText()
    else if (id === 'edit-label') ctx.beginEditLabel()
    else if (id === 'delete') ctx.deleteTarget()
    else if (id === 'add-child') ctx.addChildToMindmap()
    else if (id === 'cycle-relation-kind') ctx.cycleRelationKind()
    else if (id === 'edit-relation') ctx.editRelation()
    else if (id === 'cycle-message-arrow') ctx.cycleMessageArrow()
    else if (id === 'edit-message') ctx.editMessage()
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

  // 连线位置序寻址（工单 02，ADR-0012）：渲染后把身份写进连线的 data-id——
  // class 的关系边（含标签/基数，故 shapes 由投影的 label/基数算出）、
  // sequence 的消息 / 注释 / 块（条数由投影给出，条数不符的种类整体不标）。
  // flowchart 的边仍走 mermaid data-id（ADR-0007），mindmap 无连线 → 不标注。
  const canvasResolver = projection !== null ? resolverOf(projection) : null
  const hasOrdinalEdges = projection !== null && (projection.type === 'class' || projection.type === 'sequence')
  const annotateEdges =
    projection !== null && projection.type === 'class'
      ? (root: ParentNode) => annotateClassRelationIdentities(root, relationShapesOf(projection.class.relations))
      : projection !== null && projection.type === 'sequence'
        ? (root: ParentNode) => annotateSequenceIdentities(root, sequenceEdgeCounts(projection.sequence))
        : undefined
  // 兜底命中：data-id 没命中时按屏幕坐标沿真实路径采样（只对位置序连线开的图种启用）
  const hitTestEdge =
    canvasResolver === null || !hasOrdinalEdges
      ? undefined
      : (root: ParentNode, clientX: number, clientY: number): CanvasSelection | null => {
          const elementId = hitTestEdgeIdentity(root, clientX, clientY)
          return elementId === null ? null : canvasResolver(elementId)
        }

  const { containerRef: selectionRef, onClick } = useCanvasSelection({
    svg,
    containerRef,
    resolver: canvasResolver,
    selectedDataId: selection !== null ? selectedDataIdOf(selection) : null,
    annotateEdges,
    hitTestEdge,
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
          // class/sequence 的节点菜单表单浮层：点击画布空白处取消（浮层内部已 stopPropagation）
          if (ctx.nodeForm !== null) {
            ctx.closeNodeForm()
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
          // 右键菜单 / 添加样式表单 / 节点表单打开时也不启动背景拖拽：拖拽的 setPointerCapture
          // 会把后续指针事件（含派生的 click）劫持到容器，菜单项/表单按钮将永远
          // 收不到点击（工单 08 浏览器实测发现）
          if (ctx.menu !== null || ctx.styleForm !== null || ctx.nodeForm !== null) return
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
        {/* class/sequence 的添加型表单浮层（工单 06 成员/关系/消息；工单 04 补注释/逻辑块） */}
        {ctx.nodeForm !== null && projection !== null && (
          <NodeFormPopup x={ctx.nodeForm.x} y={ctx.nodeForm.y} onClose={ctx.closeNodeForm}>
            {ctx.nodeForm.kind === 'member' && projection.type === 'class' && (
              <AddMemberInlineForm
                classes={projection.class.classes}
                initialClassName={ctx.nodeForm.className}
                afterElementId={ctx.nodeForm.anchorElementId}
                onDone={ctx.closeNodeForm}
              />
            )}
            {ctx.nodeForm.kind === 'relation' && projection.type === 'class' && (
              <AddRelationInlineForm
                classes={projection.class.classes}
                initialFrom={ctx.nodeForm.className}
                afterElementId={ctx.nodeForm.anchorElementId}
                onDone={ctx.closeNodeForm}
              />
            )}
            {ctx.nodeForm.kind === 'message' && projection.type === 'sequence' && (
              <AddMessageInlineForm
                participants={projection.sequence.participants}
                initialFrom={ctx.nodeForm.from}
                afterElementId={ctx.nodeForm.anchorElementId}
                onDone={ctx.closeNodeForm}
              />
            )}
            {ctx.nodeForm.kind === 'note' && projection.type === 'sequence' && (
              <AddNoteInlineForm
                participants={projection.sequence.participants}
                afterElementId={ctx.nodeForm.anchorElementId}
                onDone={ctx.closeNodeForm}
              />
            )}
            {ctx.nodeForm.kind === 'block' && projection.type === 'sequence' && (
              <AddBlockInlineForm afterElementId={ctx.nodeForm.anchorElementId} onDone={ctx.closeNodeForm} />
            )}
            {ctx.nodeForm.kind === 'note' && projection.type === 'class' && (
              <AddClassNoteInlineForm
                classes={projection.class.classes}
                initialClassName={ctx.nodeForm.className}
                afterElementId={ctx.nodeForm.anchorElementId}
                onDone={ctx.closeNodeForm}
              />
            )}
          </NodeFormPopup>
        )}
      </Box>
    </Stack>
  )
}
