import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MantineProvider } from '@mantine/core'
import { PropertyPanel } from '../PropertyPanel'
import { initI18n } from '../../i18n'
import { classParser } from '../../lib/pipeline/class'
import { buildClassProjection } from '../../lib/projection/class-projection'
import { flowchartParser } from '../../lib/pipeline/flowchart'
import { buildFlowchartProjection } from '../../lib/projection/flowchart-projection'
import type { AnyProjection } from '../../lib/diagram-registry'
import { resetEditorHistory, useEditorStore } from '../../store/editor'
import { DEFAULT_DIAGRAM_SOURCE } from '../../lib/storage'

/**
 * 工单 07：class / flowchart 的方向表单。
 * - 源码里没有 `direction` 行 → 如实显示「跟随 Mermaid 默认（不设置方向）」，不假装成某个值
 * - 选中即手术式插入 / 改写 `direction` 行；选「跟随默认」即删除该行
 * - 手写非法值如实回显原文 + 提示
 * - flowchart 复用同一组件与文案（方向来自表头 token，没有「跟随默认」这一项）
 */

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
initI18n()

const FOLLOW_LABEL = '跟随 Mermaid 默认（不设置方向）'
const LR_LABEL = '从左到右（LR）'
const INVALID_HINT = '无效方向，Mermaid 将忽略它并回退到默认'

let root: Root | null = null
let host: HTMLDivElement | null = null

function classProjectionOf(source: string): AnyProjection {
  const parsed = classParser.parse(source)
  if (!parsed.ok) throw new Error(`样例源码必须可解析：${parsed.error.message}`)
  return { type: 'class', class: buildClassProjection(parsed.doc) }
}

function flowchartProjectionOf(source: string): AnyProjection {
  const parsed = flowchartParser.parse(source)
  if (!parsed.ok) throw new Error(`样例源码必须可解析：${parsed.error.message}`)
  return { type: 'flowchart', flowchart: buildFlowchartProjection(parsed.doc) }
}

/** 渲染属性面板并停在图表级选中（selection = null → 回落图表级） */
async function renderPanel(projection: AnyProjection): Promise<void> {
  host = document.createElement('div')
  document.body.appendChild(host)
  await act(async () => {
    root = createRoot(host as HTMLDivElement)
    root.render(
      <MantineProvider>
        <PropertyPanel projection={projection} parseError={null} />
      </MantineProvider>,
    )
  })
}

/** 方向选择器的输入框：按可见 label「方向」关联的 id 定位 */
function directionInput(): HTMLInputElement {
  const label = [...(host as HTMLDivElement).querySelectorAll('label')].find((l) => l.textContent === '方向')
  if (label === undefined || label.htmlFor === '') throw new Error('未找到「方向」表单')
  const input = (host as HTMLDivElement).querySelector(`#${label.htmlFor}`)
  if (input === null) throw new Error('未找到「方向」输入框')
  return input as HTMLInputElement
}

/**
 * 本选择器自己的下拉（Mantine 给下拉的 id 不挂在输入框上，但下拉带
 * `aria-labelledby="{输入框 id}-label"`，用它把主题选择器的选项排除掉）
 */
function dropdownOf(input: HTMLInputElement): HTMLElement {
  const labelledby = `${input.id}-label`
  const dropdown = [...document.querySelectorAll('[role="listbox"]')].find(
    (lb) => lb.getAttribute('aria-labelledby') === labelledby,
  )
  if (dropdown === undefined) throw new Error('未找到方向选择器的下拉')
  return dropdown as HTMLElement
}

function optionElementsOf(input: HTMLInputElement): Element[] {
  return [...dropdownOf(input).querySelectorAll('[role="option"]')]
}

/** 打开下拉并返回选项文本 */
async function openOptions(input: HTMLInputElement): Promise<string[]> {
  await act(async () => {
    input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  return optionElementsOf(input).map((o) => o.textContent ?? '')
}

async function clickOption(input: HTMLInputElement, text: string): Promise<void> {
  const option = optionElementsOf(input).find((o) => o.textContent === text)
  if (option === undefined) throw new Error(`未找到选项：${text}`)
  await act(async () => {
    option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    option.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('方向表单（工单 07）', () => {
  beforeEach(() => {
    window.localStorage?.clear()
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
    useEditorStore.getState().select(null)
  })

  afterEach(async () => {
    await act(async () => {
      root?.unmount()
    })
    root = null
    host = null
    document.body.innerHTML = ''
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
  })

  it('class 源码没有 direction：如实回显「跟随 Mermaid 默认（不设置方向）」', async () => {
    resetEditorHistory('classDiagram\n    class A\n')
    await renderPanel(classProjectionOf('classDiagram\n    class A\n'))
    const input = directionInput()
    expect(input.value).toBe(FOLLOW_LABEL)
    expect(input.value).not.toBe('从上到下（TB）')

    const options = await openOptions(input)
    expect(options).toHaveLength(1 + 4)
    expect(options[0]).toBe(FOLLOW_LABEL)
    expect(options).toContain(LR_LABEL)
  })

  it('class 源码已有 direction LR：回显其选项原文（不显示「跟随默认」）', async () => {
    resetEditorHistory('classDiagram\ndirection LR\n    class A\n')
    await renderPanel(classProjectionOf('classDiagram\ndirection LR\n    class A\n'))
    expect(directionInput().value).toBe(LR_LABEL)
  })

  it('class 选 LR：手术式插入 direction 行（插到表头之后，走 commitIntent 可撤销）', async () => {
    const source = 'classDiagram\n    class A\n'
    resetEditorHistory(source)
    await renderPanel(classProjectionOf(source))
    await openOptions(directionInput())
    await clickOption(directionInput(), LR_LABEL)

    expect(useEditorStore.getState().source).toBe('classDiagram\ndirection LR\n    class A\n')
    await act(async () => {
      useEditorStore.getState().undo()
    })
    expect(useEditorStore.getState().source).toBe(source)
  })

  it('class 选「跟随默认」：删除 direction 行，其余文本逐字不变', async () => {
    const source = 'classDiagram\ndirection LR\n    class A\n    A <|-- B\n'
    resetEditorHistory(source)
    await renderPanel(classProjectionOf(source))
    await openOptions(directionInput())
    await clickOption(directionInput(), FOLLOW_LABEL)

    expect(useEditorStore.getState().source).not.toContain('direction')
    expect(useEditorStore.getState().source).toContain('    class A\n    A <|-- B\n')
  })

  it('class 手写非法取值：如实回显原文 + 无效提示，并作为额外选项出现', async () => {
    const source = 'classDiagram\ndirection XY\n    class A\n'
    resetEditorHistory(source)
    await renderPanel(classProjectionOf(source))
    const input = directionInput()
    expect(input.value).toBe('XY')
    expect((host as HTMLDivElement).textContent).toContain(INVALID_HINT)

    const options = await openOptions(input)
    expect(options).toHaveLength(1 + 4 + 1)
    expect(options).toContain('XY')
  })

  it('linkStyle / cssClass 仍逐字保留（本票不动样式语法）', async () => {
    const source = 'classDiagram\n    class A\nlinkStyle 0 stroke:red\ncssClass "A" styled\n'
    resetEditorHistory(source)
    await renderPanel(classProjectionOf(source))
    await openOptions(directionInput())
    await clickOption(directionInput(), LR_LABEL)

    const next = useEditorStore.getState().source
    expect(next).toContain('linkStyle 0 stroke:red')
    expect(next).toContain('cssClass "A" styled')
  })

  it('flowchart 复用同一组件：没有「跟随默认」项，选 LR 改表头 token', async () => {
    const source = 'flowchart TD\n    A --> B\n'
    resetEditorHistory(source)
    await renderPanel(flowchartProjectionOf(source))

    const options = await openOptions(directionInput())
    expect(options).toHaveLength(4)
    expect(options).not.toContain(FOLLOW_LABEL)
    // TD 是 TB 的合法别名：不应被当成「手写非法值」
    expect((host as HTMLDivElement).textContent).not.toContain(INVALID_HINT)

    await clickOption(directionInput(), LR_LABEL)
    expect(useEditorStore.getState().source.startsWith('flowchart LR')).toBe(true)
  })

  it('flowchart TD：下拉应有选中项（TD 归一化显示为 TB，browser-findings 2026-10-02 #4）', async () => {
    const source = 'flowchart TD\n    A --> B\n'
    resetEditorHistory(source)
    await renderPanel(flowchartProjectionOf(source))
    expect(directionInput().value).toBe('从上到下（TB）')
  })
})
