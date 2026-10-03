import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MantineProvider } from '@mantine/core'
import { initI18n } from '../../i18n'
import { useEditorStore } from '../../store/editor'
import type { StoredLibraryDiagram } from '../../lib/library-storage'
import { DiagramLibraryDrawer } from '../DiagramLibraryDrawer'

/**
 * 图表库删除二次确认（工单 02，gui-test-2026-10-03）：
 * 点击 ✕ 只弹确认弹窗（含图表名称与不可恢复提示），确认才删除，取消不动。
 */

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
initI18n()

const diagrams: StoredLibraryDiagram[] = [
  { id: 'd1', name: '流程图 A', source: 'flowchart TD\n  A --> B\n', savedAt: 1 },
  { id: 'd2', name: '我的副本', source: 'flowchart TD\n  C --> D\n', savedAt: 2 },
]

function seedLibrary() {
  useEditorStore.setState({ diagrams, activeId: 'd1' })
}

describe('DiagramLibraryDrawer 删除二次确认（工单 02）', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(async () => {
    window.localStorage?.clear()
    seedLibrary()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => {
      root.render(
        <MantineProvider>
          <DiagramLibraryDrawer opened onClose={() => {}} />
        </MantineProvider>,
      )
    })
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    seedLibrary()
  })

  function deleteButtonOf(name: string): HTMLButtonElement {
    const button = document.querySelector<HTMLButtonElement>(`button[aria-label="删除图表 ${name}"]`)
    if (button === null) throw new Error(`必须渲染出「${name}」的删除按钮`)
    return button
  }

  function confirmModal(): Element | null {
    return Array.from(document.querySelectorAll('.mantine-Modal-root')).find((modal) =>
      modal.textContent?.includes('确定要删除图表'),
    ) ?? null
  }

  /** 等待 Mantine 弹窗关闭动画结束（内容卸载） */
  async function flushCloseTransition() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350))
    })
  }

  it('点击 ✕ 弹出确认弹窗（含图表名称），确认后图表被删除', async () => {
    const target = diagrams[1]
    await act(async () => {
      deleteButtonOf(target.name).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })

    const modal = confirmModal()
    expect(modal).not.toBeNull()
    expect(modal?.textContent).toContain(target.name)
    expect(modal?.textContent).toContain('删除后不可恢复')
    // 未确认前列表与数据不变
    expect(useEditorStore.getState().diagrams.some((d) => d.id === target.id)).toBe(true)

    const confirmButton = Array.from(modal!.querySelectorAll('button')).find(
      (b) => b.textContent === '删除' && !b.hasAttribute('aria-label'),
    )
    if (confirmButton === undefined) throw new Error('确认弹窗必须渲染「删除」按钮')
    await act(async () => {
      confirmButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })

    expect(useEditorStore.getState().diagrams.some((d) => d.id === target.id)).toBe(false)
    await flushCloseTransition()
    expect(confirmModal()).toBeNull()
  })

  it('点击 ✕ 弹出确认弹窗，取消后列表与数据不变', async () => {
    const target = diagrams[1]
    await act(async () => {
      deleteButtonOf(target.name).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    expect(confirmModal()).not.toBeNull()

    const cancelButton = Array.from(confirmModal()!.querySelectorAll('button')).find(
      (b) => b.textContent === '取消',
    )
    if (cancelButton === undefined) throw new Error('确认弹窗必须渲染「取消」按钮')
    await act(async () => {
      cancelButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })

    expect(useEditorStore.getState().diagrams.map((d) => d.id)).toEqual(['d1', 'd2'])
    await flushCloseTransition()
    expect(confirmModal()).toBeNull()
  })
})
