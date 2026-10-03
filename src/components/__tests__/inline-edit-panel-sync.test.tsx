import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MantineProvider } from '@mantine/core'
import { PropertyPanel } from '../PropertyPanel'
import { initI18n } from '../../i18n'
import { flowchartParser } from '../../lib/pipeline/flowchart'
import { buildFlowchartProjection } from '../../lib/projection/flowchart-projection'
import type { AnyProjection } from '../../lib/diagram-registry'
import { resetEditorHistory, useEditorStore } from '../../store/editor'
import { flowchartKeyPlan } from '../../lib/pipeline/flowchart-keyboard'
import { applyPlan } from '../../lib/pipeline/key-plan'
import { DEFAULT_DIAGRAM_SOURCE } from '../../lib/storage'

/**
 * browser-test-findings-2026-10-02.md #3：
 * Tab 新建节点 → 内联编辑改名回车后，属性面板「显示文本」与结构树应同步刷新。
 */

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
initI18n()

const SRC = 'flowchart TD\n    A[开始] --> B[处理]\n'

function projectionOf(source: string): AnyProjection {
  const parsed = flowchartParser.parse(source)
  if (!parsed.ok) throw new Error(`样例源码必须可解析：${String(parsed.error)}`)
  return { type: 'flowchart', flowchart: buildFlowchartProjection(parsed.doc) }
}

function flowProjectionOf(source: string) {
  const parsed = flowchartParser.parse(source)
  if (!parsed.ok) throw new Error(`样例源码必须可解析：${String(parsed.error)}`)
  return buildFlowchartProjection(parsed.doc)
}

describe('实测发现 3：内联改名后面板同步', () => {
  let host: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    window.localStorage?.clear()
    resetEditorHistory(SRC)
    useEditorStore.getState().select(null)
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    host?.remove()
    host = null
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
  })

  async function render(projection: AnyProjection): Promise<void> {
    if (root === null) {
      host = document.createElement('div')
      document.body.appendChild(host)
      root = createRoot(host)
    }
    await act(async () => {
      root!.render(
        <MantineProvider>
          <PropertyPanel projection={projection} parseError={null} />
        </MantineProvider>,
      )
    })
  }

  function displayTextInput(): HTMLInputElement {
    const label = [...(host as HTMLDivElement).querySelectorAll('label')].find(
      (l) => l.textContent === '显示文本',
    )
    if (label === undefined) throw new Error('未找到「显示文本」表单')
    return (host as HTMLDivElement).querySelector(`#${label.htmlFor}`) as HTMLInputElement
  }

  it('Tab 添加 + 内联改名提交后，显示文本与结构树显示新文本', async () => {
    const plan = flowchartKeyPlan(flowProjectionOf(SRC), {
      key: 'Tab',
      selection: { kind: 'node', nodeId: 'A' },
    })
    expect(plan).not.toBeNull()
    const { commitIntent, commitIntents, select } = useEditorStore.getState()
    applyPlan(plan!, { commitIntent, commitIntents, select })
    // 内联编辑提交（回车）
    expect(useEditorStore.getState().commitIntent({ type: 'set-node-text', nodeId: 'n1', text: '测试子节点' })).toBe(true)

    // 面板随新源码重渲染（App 的投影派生路径）
    await render(projectionOf(useEditorStore.getState().source))
    expect(displayTextInput().value).toBe('测试子节点')
    expect(host?.textContent).toContain('测试子节点')
  })
})
