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
import type { SourceParseError } from '../../lib/mermaid-error'
import { CanvasPanel } from '../CanvasPanel'

/**
 * 工单 13 last good render 的画布侧：失败时保留旧 svg + 非遮挡错误角标。
 * 角标是纯信息层（pointer-events:none），不得拦截画布交互；
 * 修正（errorNotice 归 null）后角标消失。去抖去重逻辑在 hook 层测（use-mermaid-preview）。
 */

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
initI18n()

const fake = vi.hoisted(() => {
  const fakeCaps: CanvasCapabilities = {
    dataIdResolver: () => (dataId) => (dataId === 'X1' ? { kind: 'node', id: 'X1' } : null),
    toSelection: () => ({ kind: 'node', nodeId: 'X1' }),
    canvasIdOf: () => 'X1',
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
const ERROR: SourceParseError = { line: 2, message: 'Parse error on line 2: bad' }

function flowchartProjection() {
  const parsed = flowchartParser.parse(DEFAULT_DIAGRAM_SOURCE)
  if (!parsed.ok) throw new Error('样例源码必须可解析')
  return { type: 'flowchart', flowchart: buildFlowchartProjection(parsed.doc) } as const
}

function previewOf(overrides: Partial<MermaidPreview> = {}): MermaidPreview {
  return { svg: SVG, error: null, errorNotice: null, rendering: false, ...overrides }
}

describe('CanvasPanel 错误角标（工单 13 last good render）', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    window.localStorage?.clear()
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
    useEditorStore.getState().select(null)
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
    useEditorStore.getState().select(null)
    vi.restoreAllMocks()
  })

  async function render(preview: MermaidPreview) {
    await act(async () => {
      root.render(
        <MantineProvider>
          <CanvasPanel preview={preview} projection={flowchartProjection()} />
        </MantineProvider>,
      )
    })
  }

  function badge(): HTMLElement | null {
    return host.querySelector('[data-canvas-error-badge]')
  }

  it('无错误时不渲染角标', async () => {
    await render(previewOf())
    expect(badge()).toBeNull()
  })

  it('有 errorNotice 时角标可见，且旧 svg 仍保留（不清空画布）', async () => {
    await render(previewOf({ error: ERROR, errorNotice: ERROR }))
    expect(host.querySelector('[data-id="X1"]')).not.toBeNull()
    const el = badge()
    expect(el).not.toBeNull()
    expect(el?.textContent).toContain('Parse error on line 2')
  })

  it('角标不遮挡交互：容器 pointer-events:none，绝对定位在角落', async () => {
    await render(previewOf({ error: ERROR, errorNotice: ERROR }))
    const el = badge()
    if (el === null) throw new Error('角标必须渲染')
    expect(el.style.pointerEvents).toBe('none')
    expect(el.style.position).toBe('absolute')
    // 左上角，与右上角的「适应窗口」按钮错开
    expect(el.style.top).toBe('8px')
    expect(el.style.left).toBe('8px')
  })

  it('角标不拦截点击：点节点仍能选中（事件穿透到画布）', async () => {
    await render(previewOf({ error: ERROR, errorNotice: ERROR }))
    const target = host.querySelector('[data-id="X1"]')
    if (target === null) throw new Error('SVG 必须渲染出 data-id="X1"')
    await act(async () => {
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    expect(useEditorStore.getState().selection).toEqual({ kind: 'node', nodeId: 'X1' })
  })

  it('修正后 errorNotice 归 null → 角标消失', async () => {
    await render(previewOf({ error: ERROR, errorNotice: ERROR }))
    expect(badge()).not.toBeNull()
    await render(previewOf())
    expect(badge()).toBeNull()
  })

  it('仅有 error（去抖未到）时不显示角标——避免逐键闪红', async () => {
    await render(previewOf({ error: ERROR, errorNotice: null }))
    expect(badge()).toBeNull()
  })

  it('从未渲染成功（svg 为 null）时不显示角标，中心占位显示错误文案', async () => {
    await render(previewOf({ svg: null, error: ERROR, errorNotice: ERROR }))
    expect(badge()).toBeNull()
    expect(host.textContent).toContain('Parse error on line 2')
  })
})
