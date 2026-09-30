import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MantineProvider } from '@mantine/core'
import { resetEditorHistory, useEditorStore } from '../../store/editor'
import { initI18n } from '../../i18n'
import type { MermaidPreview } from '../../lib/use-mermaid-preview'
import { CanvasPanel } from '../CanvasPanel'
import { PropertyPanel } from '../PropertyPanel'

/**
 * unsupported 只读降级（more-diagrams 工单 01）：源码不属于任何已注册图种时——
 * mermaid 预览照常渲染（本测试直接喂假 svg），画布与属性面板显示占位提示，
 * 投影为空、结构树不渲染、无任何表单。
 */

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
initI18n()

const UNSUPPORTED_SOURCE = 'venn-beta\n    A o B\n'
const SVG = '<svg><g data-id="X1"><rect width="10" height="10" /></g></svg>'
const preview: MermaidPreview = { svg: SVG, error: null, rendering: false }

describe('unsupported 只读降级（more-diagrams 工单 01）', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    window.localStorage?.clear()
    resetEditorHistory(UNSUPPORTED_SOURCE)
    useEditorStore.getState().select(null)
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    resetEditorHistory(UNSUPPORTED_SOURCE)
  })

  it('CanvasPanel：预览照常渲染并显示占位提示', async () => {
    await act(async () => {
      root.render(
        <MantineProvider>
          <CanvasPanel preview={preview} projection={null} unsupported />
        </MantineProvider>,
      )
    })
    expect(host.querySelector('svg')).not.toBeNull()
    expect(host.textContent).toContain('该图种暂不支持可视化编辑')
  })

  it('PropertyPanel：占位提示替代结构树与表单', async () => {
    await act(async () => {
      root.render(
        <MantineProvider>
          <PropertyPanel projection={null} parseError={null} unsupported />
        </MantineProvider>,
      )
    })
    expect(host.textContent).toContain('该图种暂不支持可视化编辑')
    // 结构树标题只在投影非空时渲染（提示文案里提到「结构树」属正常）
    expect(host.textContent).not.toContain('在结构树中选择一个元素')
  })

  it('已注册图种不显示占位提示（回归）', async () => {
    resetEditorHistory('mindmap\n')
    await act(async () => {
      root.render(
        <MantineProvider>
          <CanvasPanel preview={preview} projection={null} unsupported={false} />
          <PropertyPanel projection={null} parseError={null} unsupported={false} />
        </MantineProvider>,
      )
    })
    expect(host.textContent).not.toContain('该图种暂不支持可视化编辑')
  })
})
