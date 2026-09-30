import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Box, Button, ColorInput, Group, Stack, Text, TextInput, Title, UnstyledButton } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { MermaidPreview } from '../lib/use-mermaid-preview'
import type { CanvasSelection } from '../lib/canvas-selection/data-id'
import { canvasIdOf } from '../lib/canvas-selection/selection-codec'
import { hitTestEdgeIdentity } from '../lib/canvas-selection/edge-locate'
import { capabilitiesOf } from '../lib/canvas-selection/capabilities'
import type { Selection } from '../lib/projection/selection'
import { useCanvasSelection } from '../lib/canvas-selection/use-canvas-selection'
import { useCanvasKeyboard } from '../lib/editing/use-canvas-keyboard'
import type { CanvasNavigation, NodeExtent } from '../lib/editing/canvas-keyboard'
import { measureNodeExtents } from '../lib/editing/canvas-measure'
import { useCanvasInlineEdit, inlineEditTextOf } from '../lib/editing/use-canvas-inline-edit'
import type { InlineEditCloseOptions } from '../lib/editing/use-canvas-inline-edit'
import type { Rect } from '../lib/editing/inline-edit'
import { useCanvasContextMenu } from '../lib/editing/use-canvas-context-menu'
import { canvasClickRuling, pointerDownBlocksDrag } from '../lib/editing/overlay-state'
import type { ContextMenuItemId } from '../lib/editing/context-menu'
import { NodeFormPopup } from './node-form-popup'
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
  /** unsupported 态（more-diagrams 工单 01）：源码不属于任何已注册图种——
   * mermaid 预览照常渲染，画布选中/键盘/右键全部停用并显示占位提示 */
  unsupported?: boolean
}

// 图种分发（工单 04，ADR-0015）：data-id resolver / 选中映射 / 导航 id 列表 / 键盘投影 /
// 连线位置序标注 / 选中回落全部收进画布能力包（canvas-selection/capabilities.ts），
// 实例挂在 DiagramTypeRegistration.canvas 上——本组件只剩 capabilitiesOf 一次查表，
// 不再有任何按图种手写的 if 分发链。
//
// 选中映射（工单 03）：画布选中 ↔ 编辑器选中 ↔ data-id 的互逆映射中，图种无关的部分
// 收在 canvas-selection/selection-codec.ts（canvasIdOf），图种相关的 toSelection 在能力包里。

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

export function CanvasPanel({ preview, projection, unsupported = false }: CanvasPanelProps) {
  const { t } = useTranslation()
  const select = useEditorStore((s) => s.select)
  const selection = useEditorStore((s) => s.selection)
  const { svg, error } = preview

  // 画布能力包（工单 04，ADR-0015）：本组件唯一的图种分发点——一次查表，
  // 之后所有图种知识（resolver / 选中映射 / 导航 id / 键盘投影 / 连线标注）都经 caps 取用。
  const caps = projection !== null ? capabilitiesOf(projection) : null

  // 视图（工单 03）：fit / 滚轮锚点缩放 / 背景拖拽平移；SVG 换新即重新 fit，
  // 切换图表自然重置，无需持久化。revealRect：方向键导航的自动平移入口（工单 14）
  const { containerRef, view, fit, revealRect, onPointerDown, onPointerMove, onPointerUp } = useCanvasView(svg)

  // 内联编辑（工单 05，工单 05 批内扩到 class/sequence）：双击节点原位浮出输入框。
  // 四图种都用 resolver 精确寻址（class 的 data-id 由渲染后处理反注，sequence 参与者
  // data-id 即 actorId）；mindmap 无 data-id 时 hook 内回落文本匹配。
  const { editing, onDoubleClick, beginEdit, commit, cancel } = useCanvasInlineEdit({
    projection,
    resolver: caps !== null && projection !== null ? caps.dataIdResolver(projection) : null,
    svg,
    containerRef,
    view,
  })

  // 方向键方位导航的适配对象（工单 14）：DOM 测量 + 选中映射 + 自动平移，全部复用现成能力：
  // measureNodeExtents（可视范围并集）、canvasIdOf / resolverOf / fromCanvasId
  // （选中 ↔ data-id）、useCanvasView 的 revealRect（自动平移）。measureNodeExtents 不做缓存
  // （模板规模 2–13 节点，工单接受每次现测）。
  const navigation = useMemo<CanvasNavigation | undefined>(() => {
    if (caps === null || projection === null) return undefined
    const ids = caps.navigationIds(projection)
    const resolver = caps.dataIdResolver(projection)
    const toSelection = (dataId: string): Selection | null => {
      const canvasSelection = resolver(dataId)
      return canvasSelection === null ? null : caps.toSelection(canvasSelection)
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
        const dataId = canvasIdOf(selection)
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
  }, [caps, projection, svg, revealRect])

  // 右键菜单（工单 07）：菜单/连线模式/添加样式表单三个状态托管在 hook 中，
  // 编辑文本与新建节点的内联命名同样走 beginEdit。
  // 画布键盘的编辑键（工单 05）也复用这里的表单浮层状态：先声明 ctx，再接线键盘 hook。
  const ctx = useCanvasContextMenu({
    projection,
    resolver: caps !== null && projection !== null ? caps.dataIdResolver(projection) : null,
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
  useCanvasKeyboard(caps !== null && projection !== null ? caps.keyboardProjection(projection) : null, {
    containerRef,
    // 工单 05/06 接线：新建节点落码后立即进入内联命名
    onNodeCreated: beginEdit,
    newNodeText: t('app:propertyPanel.mindmapNewNode'),
    // 工单 14：方向键方位导航 + 自动平移
    navigation,
    // 工单 05：class/sequence 的 Tab/Enter 落到已有表单或既有创建路径
    openForm: (kind) => {
      // 「创建 + 选中 + 内联命名」走菜单动作表的 createElement（工单 01 收敛后的唯一实现）
      if (kind === 'participant') ctx.onMenuItem('add-participant')
      else ctx.openFormForSelection(kind)
    },
  })
  const classDefNames = projection?.type === 'flowchart' ? projection.flowchart.classDefs.map((c) => c.name) : []

  // 菜单项 → 动作分发在 Hook 内完成（architecture-deepening-2 工单 01）：ctx.onMenuItem
  // 现场组装 MenuActionContext 语境后查 menu-actions.ts 的 MENU_ACTIONS 表——
  // Record 穷尽性在类型层保证漏一项是编译错误，而不是静默无反应。

  // 结构树键盘（工单 06）添加节点后的内联命名请求：画布侧消费（gotoLine 同款 nonce 模式）
  const pendingInlineEdit = useEditorStore((s) => s.pendingInlineEdit)
  useEffect(() => {
    if (pendingInlineEdit === null || projection === null) return
    // 请求目标必须属于当前图种（切换图表后残留请求安静丢弃）——图种 id 与目标 kind 同一命名空间
    if (projection?.type !== pendingInlineEdit.target.kind) return
    beginEdit(pendingInlineEdit.target)
  }, [pendingInlineEdit, projection, beginEdit])

  // 连线位置序寻址（工单 02，ADR-0012）：渲染后把身份写进连线的 data-id——
  // class 的关系边（含标签/基数，故 shapes 由投影的 label/基数算出）、
  // sequence 的消息 / 注释 / 块（条数由投影给出，条数不符的种类整体不标）。
  // flowchart 的边仍走 mermaid data-id（ADR-0007），mindmap 无连线 → 不标注。
  const canvasResolver = caps !== null && projection !== null ? caps.dataIdResolver(projection) : null
  // 有 edgeAnnotator 的图种（class / sequence）才有位置序连线，才需要兜底命中
  const annotateEdges = projection !== null ? caps?.edgeAnnotator?.(projection) : undefined
  // 节点级位置序反注（more-diagrams 工单 12）：quadrant 渲染器不写任何 id/data-id，
  // 由能力包的 nodeAnnotator 在 quadrant 专属包裹内按位置序反注（其余图种无此成员）
  const annotateNodes = projection !== null ? caps?.nodeAnnotator?.(projection) : undefined
  // 兜底命中：data-id 没命中时按屏幕坐标沿真实路径采样（只对位置序连线开的图种启用）
  const hitTestEdge =
    canvasResolver === null || annotateEdges === undefined
      ? undefined
      : (root: ParentNode, clientX: number, clientY: number): CanvasSelection | null => {
          const elementId = hitTestEdgeIdentity(root, clientX, clientY)
          return elementId === null ? null : canvasResolver(elementId)
        }

  const { containerRef: selectionRef, onClick } = useCanvasSelection({
    svg,
    containerRef,
    resolver: canvasResolver,
    selectedDataId: selection !== null && caps !== null ? caps.canvasIdOf(selection) : null,
    annotateEdges,
    annotateNodes,
    hitTestEdge,
    onSelect: (canvasSelection) => {
      const editorSelection = caps !== null ? caps.toSelection(canvasSelection) : null
      if (editorSelection !== null) select(editorSelection)
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
      {unsupported && (
        <Alert color="yellow" title={t('canvas.unsupportedTitle')}>
          <Text size="sm">{t('canvas.unsupportedHint')}</Text>
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
          cursor: ctx.open.kind === 'linkMode' ? 'crosshair' : 'grab',
          outline: 'none', // 画布聚焦即键盘生效，不要浏览器默认焦点圈
        }}
        onClick={(e) => {
          // 只在点击画布背景/节点时把焦点收进容器：Tab/Enter/Del 随即可用。
          // 点击内联编辑浮层（含其根元素的留白）时不抢焦点——否则输入框立刻失焦并
          // 触发 onBlur 提交，表现为「输入框点不进去」（工单 02 修复的死守卫：
          // 原来这个 if 后面还跟着一句无条件 focus()，守卫形同虚设）。
          // 这是焦点守卫，不是覆盖层裁定——覆盖层只裁「谁消费这次点击」。
          const clickedControl =
            (e.target as Element).closest('input, textarea, .cm-editor, .canvas-inline-edit') !== null
          if (!clickedControl) selectionRef.current?.focus()
          // 谁消费这次点击由覆盖层状态机的裁定表驱动（architecture-deepening-2 工单 05，
          // overlay-state.ts 的 canvasClickRuling，脱离 DOM 可测）：
          // 菜单 / 节点表单打开 → 关浮层；连线模式 → 推进连线（节点）/ 取消（空白）；
          // 样式表单与无浮层 → 落到选中链路（样式表单不被画布点击关闭，现状逐字保持）。
          const overlay = { open: ctx.open, inlineEdit: editing !== null }
          const ruling = canvasClickRuling(overlay)
          if (ruling === 'close-float') {
            ctx.closeFloat()
            return
          }
          if (ruling === 'link-mode') {
            ctx.onCanvasClick(e)
            return
          }
          onClick(e)
        }}
        onContextMenu={ctx.onContextMenu}
        onDoubleClick={onDoubleClick}
        onPointerDown={(e) => {
          // 背景拖拽让位由覆盖层状态机的裁定表驱动（architecture-deepening-2 工单 05，
          // overlay-state.ts 的 pointerDownBlocksDrag）：内联编辑期间不让拖拽抢走指针
          // （输入框上的按下要留给文本选择）；右键菜单 / 添加样式表单 / 节点表单打开时
          // 也不启动拖拽——拖拽的 setPointerCapture 会把后续指针事件（含派生的 click）
          // 劫持到容器，菜单项/表单按钮将永远收不到点击（工单 08 浏览器实测发现）。
          // 连线模式不挡拖拽（现状如此）。
          if (pointerDownBlocksDrag({ open: ctx.open, inlineEdit: editing !== null })) return
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
            onItem={ctx.onMenuItem}
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
        {/* class/sequence 的添加型表单浮层（工单 06 成员/关系/消息；工单 04 补注释/逻辑块；
            工单 04-bundle：浮层连同表单分发迁往 node-form-popup.tsx） */}
        {ctx.nodeForm !== null && projection !== null && (
          <NodeFormPopup state={ctx.nodeForm} projection={projection} onClose={ctx.closeNodeForm} />
        )}
      </Box>
    </Stack>
  )
}
