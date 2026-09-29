import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MantineProvider } from '@mantine/core'
import { PropertyPanel } from '../PropertyPanel'
import { initI18n } from '../../i18n'
import { classParser } from '../../lib/pipeline/class'
import { buildClassProjection } from '../../lib/projection/class-projection'
import type { AnyProjection } from '../../lib/diagram-registry'
import { resetEditorHistory, useEditorStore } from '../../store/editor'
import { DEFAULT_DIAGRAM_SOURCE } from '../../lib/storage'

/**
 * 工单 02（spec F2）：namespace 改名后的跟随选中必须落在**解析器真实产出的 elementId** 上。
 *
 * 解析器给第 2 次及以后出现的同名 namespace 带重名序号（`namespace:<名>#2`）。
 * 表单若自己拼 `namespace:<名>`，改到重名时该 id 不存在 → 选中落空 →
 * 属性面板回落到图表级，用户看不到刚输入的名字。
 */

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
initI18n()

const NS_NAME_LABEL = '命名空间名'

let host: HTMLDivElement | null = null
let root: Root | null = null

function classProjectionOf(source: string): AnyProjection {
  const parsed = classParser.parse(source)
  if (!parsed.ok) throw new Error(`样例源码必须可解析：${parsed.error.message}`)
  return { type: 'class', class: buildClassProjection(parsed.doc) }
}

/** 渲染属性面板（源码 → 投影，与应用内同一条派生链） */
async function renderPanel(source: string, selection: { kind: 'class-namespace'; elementId: string }): Promise<void> {
  resetEditorHistory(source)
  useEditorStore.getState().select(selection)
  if (host === null) {
    host = document.createElement('div')
    document.body.appendChild(host)
  }
  await act(async () => {
    if (root === null) root = createRoot(host as HTMLDivElement)
    root.render(
      <MantineProvider>
        <PropertyPanel projection={classProjectionOf(source)} parseError={null} />
      </MantineProvider>,
    )
  })
}

/** 落码后按新源码重新派生投影并重渲染（应用内 source 变化即重新派生） */
async function rerenderWithCurrentSource(): Promise<void> {
  const source = useEditorStore.getState().source
  await act(async () => {
    root?.render(
      <MantineProvider>
        <PropertyPanel projection={classProjectionOf(source)} parseError={null} />
      </MantineProvider>,
    )
  })
}

function nameInput(): HTMLInputElement {
  const label = Array.from((host as HTMLDivElement).querySelectorAll('label')).find(
    (l) => l.textContent?.trim() === NS_NAME_LABEL,
  )
  if (label === undefined) throw new Error('未找到「命名空间名」表单（属性面板已回落？）')
  const input = document.getElementById(label.htmlFor)
  if (!(input instanceof HTMLInputElement)) throw new Error('「命名空间名」标签未关联输入框')
  return input
}

async function renameTo(next: string): Promise<void> {
  const input = nameInput()
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, next)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
}

function selectionId(): string {
  const selection = useEditorStore.getState().selection
  if (selection === null || selection.kind !== 'class-namespace') throw new Error('选中已不是 namespace')
  return selection.elementId
}

const TWO_NAMESPACES = `classDiagram
namespace Shapes {
    class Circle
}
namespace Legacy {
    class Square
}
`

const TWO_SAME_NAME = `classDiagram
namespace Foo {
    class Circle
}
namespace Foo {
    class Square
}
`

describe('namespace 改名后跟随选中（工单 02 / spec F2）', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    host = null
    root = null
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    host = null
    document.body.innerHTML = ''
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
  })

  it('改成唯一名字：选中跟到 namespace:<新名>，表单留在 namespace 上', async () => {
    await renderPanel(TWO_NAMESPACES, { kind: 'class-namespace', elementId: 'namespace:Legacy' })
    await renameTo('Geometry')

    expect(useEditorStore.getState().source).toContain('namespace Geometry {')
    expect(selectionId()).toBe('namespace:Geometry')

    await rerenderWithCurrentSource()
    expect(nameInput().value).toBe('Geometry')
  })

  it('改成与既有 namespace 重名的名字：选中跟到带序号的真实 id，面板不回落图表级', async () => {
    await renderPanel(TWO_NAMESPACES, { kind: 'class-namespace', elementId: 'namespace:Legacy' })
    await renameTo('Shapes')

    // 两个同名 namespace：第 2 个的真实 id 带重名序号
    expect(useEditorStore.getState().source.match(/namespace Shapes \{/g)).toHaveLength(2)
    expect(selectionId()).toBe('namespace:Shapes#2')

    await rerenderWithCurrentSource()
    expect(nameInput().value).toBe('Shapes')
  })

  it('图里已有两个同名 namespace：给其中一个改名，选中仍在刚改的那个上', async () => {
    await renderPanel(TWO_SAME_NAME, { kind: 'class-namespace', elementId: 'namespace:Foo#2' })
    await renameTo('Bar')

    expect(useEditorStore.getState().source).toBe(`classDiagram
namespace Foo {
    class Circle
}
namespace Bar {
    class Square
}
`)
    expect(selectionId()).toBe('namespace:Bar')

    await rerenderWithCurrentSource()
    expect(nameInput().value).toBe('Bar')
  })
})
