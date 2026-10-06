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
import type { Selection } from '../../lib/projection/selection'
import type { MermaidPreview } from '../../lib/use-mermaid-preview'
import { useCursorHintStore } from '../../lib/follow/hint-store'
import { CanvasPanel } from '../CanvasPanel'

/**
 * CanvasPanel 首个测试（工单 04）：画布能力包（CanvasCapabilities）是本组件的
 * 注入缝——vi.mock 掉 capabilitiesOf 即注入假 bundle，组件沦为可测的薄壳。
 * 断言两条主链路：点击带 data-id 的元素 → store.select 被调用；
 * store 有了选中 → 高亮标到正确 data-id 的元素上（data-vm-selected）。
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

describe('CanvasPanel（工单 04：经假能力包注入的首个组件测试）', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(async () => {
    window.localStorage?.clear()
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
    useEditorStore.getState().select(null)
    useCursorHintStore.getState().setHint(null)
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => {
      root.render(
        <MantineProvider>
          <CanvasPanel preview={preview} projection={flowchartProjection()} />
        </MantineProvider>,
      )
    }
    )
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
    vi.restoreAllMocks()
  })

  it('点击带 data-id 的元素 → 假包解析 → store.select 被调用', async () => {
    const target = host.querySelector('[data-id="X1"]')
    if (target === null) throw new Error('SVG 必须渲染出 data-id="X1" 的元素')
    await act(async () => {
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    expect(useEditorStore.getState().selection).toEqual({ kind: 'node', nodeId: 'X1' })
  })

  it('点击画布空白（无 data-id）→ 不选中', async () => {
    await act(async () => {
      host.querySelector('svg')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    expect(useEditorStore.getState().selection).toBeNull()
  })

  it('选中变化 → 高亮经假包 canvasIdOf 标到正确 data-id 的元素；取消选中即清除', async () => {
    const target = host.querySelector('[data-id="X1"]')
    if (target === null) throw new Error('SVG 必须渲染出 data-id="X1" 的元素')
    await act(async () => {
      useEditorStore.getState().select({ kind: 'node', nodeId: 'X1' } satisfies Selection)
    })
    expect(target.getAttribute('data-vm-selected')).toBe('true')

    await act(async () => {
      useEditorStore.getState().select(null)
    })
    expect(target.hasAttribute('data-vm-selected')).toBe(false)
  })

  it('光标提示（工单 16）→ 画布轻量标记，且不改变选中', async () => {
    const target = host.querySelector('[data-id="X1"]')
    if (target === null) throw new Error('SVG 必须渲染出 data-id="X1" 的元素')
    await act(async () => {
      useCursorHintStore.getState().setHint({ kind: 'node', nodeId: 'X1' } satisfies Selection)
    })
    expect(target.getAttribute('data-vm-hinted')).toBe('true')
    // 提示不抢选中：store 选中仍为空，且未写选中高亮标记
    expect(useEditorStore.getState().selection).toBeNull()
    expect(target.hasAttribute('data-vm-selected')).toBe(false)

    await act(async () => {
      useCursorHintStore.getState().setHint(null)
    })
    expect(target.hasAttribute('data-vm-hinted')).toBe(false)
  })

  it('提示与选中同一元素时提示不叠加（选中高亮已表达）', async () => {
    const target = host.querySelector('[data-id="X1"]')
    if (target === null) throw new Error('SVG 必须渲染出 data-id="X1" 的元素')
    await act(async () => {
      useEditorStore.getState().select({ kind: 'node', nodeId: 'X1' } satisfies Selection)
      useCursorHintStore.getState().setHint({ kind: 'node', nodeId: 'X1' } satisfies Selection)
    })
    expect(target.getAttribute('data-vm-selected')).toBe('true')
    expect(target.hasAttribute('data-vm-hinted')).toBe(false)
  })
})
