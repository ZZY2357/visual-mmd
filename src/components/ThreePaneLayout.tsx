import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ActionIcon, Tooltip } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import {
  CANVAS_MIN,
  clampWidth,
  isNarrowViewport,
  maxCodePanelWidth,
  maxPropsPanelWidth,
  resolveCollapse,
} from '../lib/layout/pane-layout'

/**
 * 三栏可拖拽布局（工单 04；边界细节收尾于工单 12）：
 * 代码面板 | 画布 | 属性面板。
 * - 栏间分隔条可拖拽调整宽度，最小/最大宽度保护：画布永远保有
 *   CANVAS_MIN 的宽度，拖到边界即停（clampWidth）。
 * - 代码面板与属性面板均可折叠，折叠互斥（至多一个折叠，resolveCollapse）。
 * - 视口低于窄屏断点时只显示画布（窄屏只显示画布，spec 用户故事 37）；
 *   视口变化时面板宽度向下收敛，不破版。
 */

const CODE_MIN = 240
const PROPS_MIN = 260
const CODE_DEFAULT = 400
const PROPS_DEFAULT = 340

interface DragState {
  target: 'code' | 'props'
  startX: number
  startWidth: number
}

export interface ThreePaneLayoutProps {
  code: ReactNode
  canvas: ReactNode
  properties: ReactNode
}

function useWindowWidth(): number {
  const [width, setWidth] = useState(() =>
    typeof window === 'undefined' ? Number.POSITIVE_INFINITY : window.innerWidth,
  )
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return width
}

export function ThreePaneLayout({ code, canvas, properties }: ThreePaneLayoutProps) {
  const { t } = useTranslation()
  const windowWidth = useWindowWidth()
  const [codeWidth, setCodeWidth] = useState(CODE_DEFAULT)
  const [propsWidth, setPropsWidth] = useState(PROPS_DEFAULT)
  const [codeCollapsed, setCodeCollapsed] = useState(false)
  const [propsCollapsed, setPropsCollapsed] = useState(false)
  const dragRef = useRef<DragState | null>(null)

  // 窄屏：只显示画布。断点语义与面板宽度保护见 pane-layout.ts。
  const narrow = isNarrowViewport(windowWidth)

  // 当前约束下的宽度上限（另一面板折叠时不占用宽度）；
  // 视口收窄时向下收敛已打开的面板宽度，保证画布不小于 CANVAS_MIN。
  const codeMax = maxCodePanelWidth(windowWidth, propsCollapsed ? null : Math.max(propsWidth, PROPS_MIN))
  const propsMax = maxPropsPanelWidth(windowWidth, codeCollapsed ? null : Math.max(codeWidth, CODE_MIN))
  useEffect(() => {
    if (narrow) return
    setCodeWidth((w) => clampWidth(w, CODE_MIN, codeMax))
    setPropsWidth((w) => clampWidth(w, PROPS_MIN, propsMax))
  }, [narrow, codeMax, propsMax])

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current
      if (drag === null || isNarrowViewport(window.innerWidth)) return
      const delta = e.clientX - drag.startX
      if (drag.target === 'code') {
        setCodeWidth(clampWidth(drag.startWidth + delta, CODE_MIN, codeMax))
      } else {
        // 属性面板在右侧：向左拖 = 变宽；拖到边界（画布最小宽度）即停
        setPropsWidth(clampWidth(drag.startWidth - delta, PROPS_MIN, propsMax))
      }
    },
    [codeMax, propsMax],
  )

  const onPointerUp = useCallback(() => {
    dragRef.current = null
  }, [])

  useEffect(() => {
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [onPointerMove, onPointerUp])

  const startDrag = (target: 'code' | 'props') => (e: React.PointerEvent) => {
    dragRef.current = {
      target,
      startX: e.clientX,
      startWidth: target === 'code' ? codeWidth : propsWidth,
    }
  }

  // 折叠互斥：至多一个面板折叠，避免宽屏上丢失全部编辑面板
  const toggleCode = () => setCodeCollapsed((c) => resolveCollapse(!c, propsCollapsed))
  const toggleProps = () => setPropsCollapsed((c) => resolveCollapse(!c, codeCollapsed))

  // 工单 03（gui-test-2026-10-03）：折叠互斥的禁用态与提示。
  // 另一面板已折叠且本面板尚未折叠时，折叠按钮置为 disabled；
  // tooltip / aria-label 改述互斥原因，避免"可点但静默无效"被当成 bug。
  const codeCollapseDisabled = !codeCollapsed && propsCollapsed
  const propsCollapseDisabled = !propsCollapsed && codeCollapsed
  const codeButtonLabel = codeCollapsed
    ? t('app:codePanel.expand')
    : codeCollapseDisabled
      ? t('app:layout.collapseDisabled')
      : t('app:codePanel.collapse')
  const propsButtonLabel = propsCollapsed
    ? t('app:propertyPanel.expand')
    : propsCollapseDisabled
      ? t('app:layout.collapseDisabled')
      : t('app:propertyPanel.collapse')

  const dividerStyle: React.CSSProperties = {
    width: 6,
    cursor: 'col-resize',
    flexShrink: 0,
    borderRadius: 3,
    background: 'var(--mantine-color-gray-3)',
  }

  if (narrow) {
    // 窄屏/小窗：只显示画布（代码面板与属性面板不渲染）
    return (
      <div style={{ display: 'flex', height: '100%', minHeight: 0, minWidth: CANVAS_MIN }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {canvas}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      {!codeCollapsed && (
        <>
          <div style={{ width: codeWidth, minWidth: CODE_MIN, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {code}
          </div>
          <div
            role="separator"
            aria-orientation="vertical"
            style={dividerStyle}
            onPointerDown={startDrag('code')}
          />
        </>
      )}
      <Tooltip label={codeButtonLabel} position="bottom">
        <ActionIcon
          variant="default"
          aria-label={codeButtonLabel}
          onClick={toggleCode}
          disabled={codeCollapseDisabled}
          style={{ alignSelf: 'flex-start', flexShrink: 0, marginInline: 2 }}
          size="compact-sm"
        >
          {codeCollapsed ? '»' : '«'}
        </ActionIcon>
      </Tooltip>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {canvas}
      </div>
      {!propsCollapsed && (
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            style={dividerStyle}
            onPointerDown={startDrag('props')}
          />
          <div style={{ width: propsWidth, minWidth: PROPS_MIN, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {properties}
          </div>
        </>
      )}
      <Tooltip label={propsButtonLabel} position="bottom">
        <ActionIcon
          variant="default"
          aria-label={propsButtonLabel}
          onClick={toggleProps}
          disabled={propsCollapseDisabled}
          style={{ alignSelf: 'flex-start', flexShrink: 0, marginInline: 2 }}
          size="compact-sm"
        >
          {propsCollapsed ? '«' : '»'}
        </ActionIcon>
      </Tooltip>
    </div>
  )
}
