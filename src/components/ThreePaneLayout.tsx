import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ActionIcon, Tooltip } from '@mantine/core'
import { useTranslation } from 'react-i18next'

/**
 * 三栏可拖拽布局（工单 04）：代码面板 | 画布 | 属性面板。
 * - 栏间分隔条可拖拽调整宽度
 * - 代码面板可折叠（折叠后只剩画布 + 属性面板）
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

export function ThreePaneLayout({ code, canvas, properties }: ThreePaneLayoutProps) {
  const { t } = useTranslation()
  const [codeWidth, setCodeWidth] = useState(CODE_DEFAULT)
  const [propsWidth, setPropsWidth] = useState(PROPS_DEFAULT)
  const [codeCollapsed, setCodeCollapsed] = useState(false)
  const dragRef = useRef<DragState | null>(null)

  const onPointerMove = useCallback((e: PointerEvent) => {
    const drag = dragRef.current
    if (drag === null) return
    const delta = e.clientX - drag.startX
    if (drag.target === 'code') {
      setCodeWidth(Math.max(CODE_MIN, drag.startWidth + delta))
    } else {
      // 属性面板在右侧：向左拖 = 变宽
      setPropsWidth(Math.max(PROPS_MIN, drag.startWidth - delta))
    }
  }, [])

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

  const dividerStyle: React.CSSProperties = {
    width: 6,
    cursor: 'col-resize',
    flexShrink: 0,
    borderRadius: 3,
    background: 'var(--mantine-color-gray-3)',
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
      <Tooltip
        label={codeCollapsed ? t('app:codePanel.expand') : t('app:codePanel.collapse')}
        position="bottom"
      >
        <ActionIcon
          variant="default"
          aria-label={codeCollapsed ? t('app:codePanel.expand') : t('app:codePanel.collapse')}
          onClick={() => setCodeCollapsed((c) => !c)}
          style={{ alignSelf: 'flex-start', flexShrink: 0, marginInline: 2 }}
          size="compact-sm"
        >
          {codeCollapsed ? '»' : '«'}
        </ActionIcon>
      </Tooltip>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {canvas}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        style={dividerStyle}
        onPointerDown={startDrag('props')}
      />
      <div style={{ width: propsWidth, minWidth: PROPS_MIN, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {properties}
      </div>
    </div>
  )
}
