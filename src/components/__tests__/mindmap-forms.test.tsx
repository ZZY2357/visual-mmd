import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, describe, expect, it } from 'vitest'
import { MantineProvider } from '@mantine/core'
import { MindmapNodeForm } from '../mindmap-forms'
import { initI18n } from '../../i18n'
import { mindmapParser } from '../../lib/pipeline/mindmap'
import {
  buildMindmapProjection,
  type ProjectionMindmapNode,
} from '../../lib/projection/mindmap-projection'
import { resetEditorHistory, useEditorStore } from '../../store/editor'

/**
 * MindmapNodeForm 交互（工单 05）：显示文本 + 节点 ID 双字段的取值与提交；
 * 非法 id 显示错误并阻止落码；清空 id 还原纯文本。
 */

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
initI18n()

const SOURCE = `mindmap
  root((圆))
  子节点
`

function nodeAt(source: string, index: number): ProjectionMindmapNode {
  const parsed = mindmapParser.parse(source)
  if (!parsed.ok) throw new Error('解析失败')
  const node = buildMindmapProjection(parsed.doc).nodes[index]
  if (node === undefined) throw new Error(`节点不存在：${index}`)
  return node
}

async function mount(node: ProjectionMindmapNode): Promise<{ host: HTMLElement; root: Root }> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      <MantineProvider>
        <MindmapNodeForm node={node} />
      </MantineProvider>,
    )
  })
  return { host, root }
}

/** 按 label 文案定位输入框（Mantine 的 label 通过 for/id 关联输入框） */
function inputByLabel(host: HTMLElement, labelText: string): HTMLInputElement {
  const label = Array.from(host.querySelectorAll('label')).find(
    (l) => l.textContent?.trim() === labelText,
  )
  if (label === undefined) throw new Error(`未找到标签：${labelText}`)
  const input = document.getElementById(label.htmlFor)
  if (!(input instanceof HTMLInputElement)) throw new Error(`标签未关联输入框：${labelText}`)
  return input
}

/** React 受控输入：必须走原生 setter 再派发 input 事件，onChange 才会触发 */
async function type(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function pressEnter(input: HTMLInputElement): Promise<void> {
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
}

describe('MindmapNodeForm：节点 ID 字段（工单 05）', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    resetEditorHistory(SOURCE)
  })

  it('两个字段分别回显显示文本与节点 ID（无 id 时为空）', async () => {
    const first = await mount(nodeAt(SOURCE, 0))
    expect(inputByLabel(first.host, '显示文本').value).toBe('圆')
    expect(inputByLabel(first.host, '节点 ID').value).toBe('root')

    const second = await mount(nodeAt(SOURCE, 1))
    expect(inputByLabel(second.host, '显示文本').value).toBe('子节点')
    expect(inputByLabel(second.host, '节点 ID').value).toBe('')
  })

  it('填入 ID 提交：纯文本节点落码为 id[显示文本]（无形状 → 方框）', async () => {
    const { host } = await mount(nodeAt(SOURCE, 1))
    const idInput = inputByLabel(host, '节点 ID')
    await type(idInput, 'NewId')
    await pressEnter(idInput)
    expect(useEditorStore.getState().source).toBe('mindmap\n  root((圆))\n  NewId[子节点]\n')
  })

  it('清空 ID 提交：还原纯文本节点', async () => {
    const src = 'mindmap\n  root[圆]\n  子节点\n'
    resetEditorHistory(src)
    const { host } = await mount(nodeAt(src, 0))
    const idInput = inputByLabel(host, '节点 ID')
    await type(idInput, '')
    await pressEnter(idInput)
    expect(useEditorStore.getState().source).toBe('mindmap\n  圆\n  子节点\n')
  })

  it('非法 ID：显示错误且提交不落码', async () => {
    const { host } = await mount(nodeAt(SOURCE, 1))
    const idInput = inputByLabel(host, '节点 ID')
    await type(idInput, 'Bad Id')
    expect(host.textContent).toContain('ID 不能包含空白、圆括号、方括号、花括号')
    await pressEnter(idInput)
    expect(useEditorStore.getState().source).toBe(SOURCE)
  })

  it('显示文本字段照旧只改文本（不引入 id）', async () => {
    const { host } = await mount(nodeAt(SOURCE, 1))
    const textInput = inputByLabel(host, '显示文本')
    await type(textInput, '新的子节点')
    await pressEnter(textInput)
    expect(useEditorStore.getState().source).toBe('mindmap\n  root((圆))\n  新的子节点\n')
  })
})
