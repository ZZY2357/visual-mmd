import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MantineProvider } from '@mantine/core'
import { resetEditorHistory, useEditorStore } from '../../store/editor'
import { DEFAULT_DIAGRAM_SOURCE } from '../../lib/storage'
import { initI18n } from '../../i18n'
import { buildFlowchartProjection } from '../../lib/projection/flowchart-projection'
import { flowchartParser } from '../../lib/pipeline/flowchart'
import type { CanvasCapabilities } from '../../lib/canvas-selection/capabilities'
import type { MermaidPreview } from '../../lib/use-mermaid-preview'
import { CanvasPanel } from '../CanvasPanel'

/**
 * 触屏长按打开上下文菜单（工单 15）：手机没有右键，长按节点须弹出与桌面右键
 * **完全一致**的菜单（同一份 use-canvas-context-menu / context-menu，不复制菜单）。
 */

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
initI18n()

const fake = vi.hoisted(() => {
  const fakeCaps: CanvasCapabilities = {
    dataIdResolver: () => (dataId) => (dataId === 'X1' ? { kind: 'node', id: 'X1' } : null),
    toSelection: () => ({ kind: 'node', nodeId: 'X1' }),
    canvasIdOf: (_projection, selection) => (selection.kind === 'node' && selection.nodeId === 'X1' ? 'X1' : null),
    navigationIds: () => ['X1'],
    keyboardProjection: () => ({ kind: 'flowchart', projection: null as never }),
    resolveSelection: () => null,
    deleteIntent: () => null,
    keyHandler: () => () => null,
  }
  return { fakeCaps }
})

vi.mock('../../lib/canvas-selection/capabilities', () => ({
  capabilitiesOf: () => fake.fakeCaps,
}))

const SVG = '<svg><g data-id="X1" id="X1"><rect width="10" height="10" /></g></svg>'

function flowchartProjection() {
  const parsed = flowchartParser.parse(DEFAULT_DIAGRAM_SOURCE)
  if (!parsed.ok) throw new Error('样例源码必须可解析')
  return { type: 'flowchart', flowchart: buildFlowchartProjection(parsed.doc) } as const
}

const preview: MermaidPreview = { svg: SVG, error: null, errorNotice: null, rendering: false }

function touchPointer(type: string, init: Partial<PointerEventInit> = {}): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerType: 'touch',
    isPrimary: true,
    pointerId: 1,
    ...init,
  })
}

describe('CanvasPanel 触屏长按菜单（工单 15）', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(async () => {
    vi.useFakeTimers()
    window.localStorage?.clear()
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
    useEditorStore.getState().select(null)
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => {
      root.render(
        <MantineProvider>
          <CanvasPanel preview={preview} projection={flowchartProjection()} />
        </MantineProvider>,
      )
    })
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
    useEditorStore.getState().select(null)
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function menuLabels(): string[] {
    // 菜单浮层内每个菜单项是 UnstyledButton（<button>）；画布上另有「适应窗口」按钮，
    // 用菜单项文案集合筛选（菜单项文案不含「适应窗口」）。
    return Array.from(host.querySelectorAll('button'))
      .map((b) => b.textContent?.trim() ?? '')
      .filter((text) => text !== '' && text !== '适应窗口')
  }

  it('长按节点 500ms → 弹出菜单并联动选中，内容与桌面右键一致', async () => {
    const target = host.querySelector('[data-id="X1"]')
    if (target === null) throw new Error('SVG 必须渲染出 data-id="X1" 的元素')

    await act(async () => {
      target.dispatchEvent(touchPointer('pointerdown', { clientX: 20, clientY: 30 }))
    })
    expect(menuLabels()).toEqual([])
    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    // 节点菜单：从这里连线 / 编辑文本 / 应用样式 / 删除（flowchartMenu.nodeItems.node）
    expect(menuLabels()).toEqual(['从这里连线', '编辑文本', '应用样式', '删除'])
    expect(useEditorStore.getState().selection).toEqual({ kind: 'node', nodeId: 'X1' })

    // 长按后紧随的 click 被抑制一次（真实触屏长按后仍派发 click）——菜单保持打开
    await act(async () => {
      host.querySelector('[data-id="X1"]')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      )
    })
    expect(menuLabels()).toEqual(['从这里连线', '编辑文本', '应用样式', '删除'])

    // 再点一次即关掉菜单
    await act(async () => {
      host.querySelector('[data-id="X1"]')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      )
    })
    expect(menuLabels()).toEqual([])

    // 与桌面右键同内容：右键节点，菜单项应完全一致
    await act(async () => {
      host.querySelector('[data-id="X1"]')!.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
      )
    })
    expect(menuLabels()).toEqual(['从这里连线', '编辑文本', '应用样式', '删除'])
  })

  it('长按空白处 → 弹出空白菜单（添加节点等）', async () => {
    const svg = host.querySelector('svg')!
    await act(async () => {
      svg.dispatchEvent(touchPointer('pointerdown', { clientX: 1, clientY: 2 }))
    })
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    // flowchart 空白菜单：添加节点 / 添加连线 / 添加样式 / 添加子图
    expect(menuLabels()).toEqual(['添加节点', '添加连线', '添加样式', '添加子图'])
  })

  it('长按后移动（拖拽平移）不弹菜单', async () => {
    const target = host.querySelector('[data-id="X1"]')!
    await act(async () => {
      target.dispatchEvent(touchPointer('pointerdown', { clientX: 0, clientY: 0 }))
      target.dispatchEvent(touchPointer('pointermove', { clientX: 60, clientY: 0 }))
    })
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    expect(menuLabels()).toEqual([])
  })
})
