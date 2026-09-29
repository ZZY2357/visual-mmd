import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MantineProvider } from '@mantine/core'
import { NoteForm, SequenceDiagramForm } from '../sequence-forms'
import { RelationForm } from '../class-forms'
import { initI18n } from '../../i18n'
import { sequenceParser } from '../../lib/pipeline/sequence'
import { buildSequenceProjection, type ProjectionNote } from '../../lib/projection/sequence-projection'
import { classParser } from '../../lib/pipeline/class'
import { buildClassProjection, type ProjectionRelation } from '../../lib/projection/class-projection'
import { resetEditorHistory, useEditorStore } from '../../store/editor'

/**
 * 工单 08：只读不可编的五处缺口，补齐写回后的表单交互。
 * 三个表单（autonumber 起始值/步长、note 参与者集合、关系端点泛型）的取值与提交，
 * 全部经 store.commitIntent → 管线手术式落码。
 */

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
initI18n()

let host: HTMLDivElement | null = null
let root: Root | null = null

async function mount(node: React.ReactNode): Promise<HTMLElement> {
  host = document.createElement('div')
  document.body.appendChild(host)
  await act(async () => {
    root = createRoot(host as HTMLDivElement)
    root.render(<MantineProvider>{node}</MantineProvider>)
  })
  return host
}

/** 按 label 文案定位输入框（Mantine 的 label 通过 for/id 关联输入框） */
function inputByLabel(container: HTMLElement, labelText: string): HTMLInputElement {
  const label = Array.from(container.querySelectorAll('label')).find((l) => l.textContent?.trim() === labelText)
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

function sequenceProjectionOf(source: string) {
  const parsed = sequenceParser.parse(source)
  if (!parsed.ok) throw new Error(`样例源码必须可解析：${parsed.error.message}`)
  return buildSequenceProjection(parsed.doc)
}

function classProjectionOf(source: string) {
  const parsed = classParser.parse(source)
  if (!parsed.ok) throw new Error(`样例源码必须可解析：${parsed.error.message}`)
  return buildClassProjection(parsed.doc)
}

describe('autonumber 起始值 / 步长表单（工单 08）', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    resetEditorHistory('sequenceDiagram\n    autonumber\n    A->>B: hi\n')
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    host = null
    document.body.innerHTML = ''
  })

  it('开状态才显示起始值 / 步长输入，初始为空（无参数）', async () => {
    const source = 'sequenceDiagram\n    autonumber\n    A->>B: hi\n'
    const container = await mount(<SequenceDiagramForm projection={sequenceProjectionOf(source)} />)
    expect(inputByLabel(container, '起始值（默认 1）').value).toBe('')
    expect(inputByLabel(container, '步长（默认 1）').value).toBe('')
  })

  it('填起始值 + 步长 → 落码为 `autonumber 10 10`', async () => {
    const source = 'sequenceDiagram\n    autonumber\n    A->>B: hi\n'
    const container = await mount(<SequenceDiagramForm projection={sequenceProjectionOf(source)} />)
    const start = inputByLabel(container, '起始值（默认 1）')
    await type(start, '10')
    await pressEnter(start)
    expect(useEditorStore.getState().source).toContain('autonumber 10')

    const step = inputByLabel(container, '步长（默认 1）')
    await type(step, '10')
    await pressEnter(step)
    expect(useEditorStore.getState().source).toContain('autonumber 10 10')
  })

  it('非法起始值（非整数）不落码并提示', async () => {
    const source = 'sequenceDiagram\n    autonumber\n    A->>B: hi\n'
    const container = await mount(<SequenceDiagramForm projection={sequenceProjectionOf(source)} />)
    const start = inputByLabel(container, '起始值（默认 1）')
    await type(start, '1.5')
    expect(container.textContent).toContain('必须是非负整数')
    await pressEnter(start)
    expect(useEditorStore.getState().source).toBe(source)
  })
})

describe('note 参与者集合表单（工单 08）', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    host = null
    document.body.innerHTML = ''
  })

  function noteOf(source: string): ProjectionNote {
    const note = sequenceProjectionOf(source).notes[0]
    if (note === undefined) throw new Error('note 不存在')
    return note
  }

  it('回显当前参与者集合；改集合落码正确（其余逐字保留）', async () => {
    const source = 'sequenceDiagram\n    Note over A,B: 说明\n'
    resetEditorHistory(source)
    const container = await mount(<NoteForm note={noteOf(source)} />)
    expect(inputByLabel(container, '参与者（逗号分隔）').value).toBe('A, B')

    const actors = inputByLabel(container, '参与者（逗号分隔）')
    await type(actors, 'A, C')
    await pressEnter(actors)
    expect(useEditorStore.getState().source).toBe('sequenceDiagram\n    Note over A,C: 说明\n')
  })

  it('解析不出参与者（null）时也能改成集合', async () => {
    const source = 'sequenceDiagram\n    Note over A B C: 说明\n'
    resetEditorHistory(source)
    const container = await mount(<NoteForm note={noteOf(source)} />)
    expect(inputByLabel(container, '参与者（逗号分隔）').value).toBe('')
    expect(container.textContent).toContain('（参与者无法解析，可在下方编辑）')

    const actors = inputByLabel(container, '参与者（逗号分隔）')
    await type(actors, 'A, B')
    await pressEnter(actors)
    expect(useEditorStore.getState().source).toBe('sequenceDiagram\n    Note over A,B: 说明\n')
  })
})

describe('关系端点泛型表单（工单 08）', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    host = null
    document.body.innerHTML = ''
  })

  function relationOf(source: string): ProjectionRelation {
    const relation = classProjectionOf(source).relations[0]
    if (relation === undefined) throw new Error('关系不存在')
    return relation
  }

  it('回显端点泛型；改起点泛型落码正确', async () => {
    const source = 'classDiagram\n    Foo~T~ --> Bar\n'
    resetEditorHistory(source)
    const container = await mount(<RelationForm relation={relationOf(source)} />)
    expect(inputByLabel(container, '起点泛型（可选）').value).toBe('T')
    expect(inputByLabel(container, '终点泛型（可选）').value).toBe('')

    const fromGeneric = inputByLabel(container, '起点泛型（可选）')
    await type(fromGeneric, 'U')
    await pressEnter(fromGeneric)
    expect(useEditorStore.getState().source).toBe('classDiagram\n    Foo~U~ --> Bar\n')
  })

  it('给无泛型的终点补泛型', async () => {
    const source = 'classDiagram\n    Foo --> Bar\n'
    resetEditorHistory(source)
    const container = await mount(<RelationForm relation={relationOf(source)} />)

    const toGeneric = inputByLabel(container, '终点泛型（可选）')
    await type(toGeneric, 'T')
    await pressEnter(toGeneric)
    expect(useEditorStore.getState().source).toBe('classDiagram\n    Foo --> Bar~T~\n')
  })

  it('清空终点泛型即去掉泛型', async () => {
    const source = 'classDiagram\n    Foo --> Bar~T~\n'
    resetEditorHistory(source)
    const container = await mount(<RelationForm relation={relationOf(source)} />)
    expect(inputByLabel(container, '终点泛型（可选）').value).toBe('T')

    const toGeneric = inputByLabel(container, '终点泛型（可选）')
    await type(toGeneric, '')
    await pressEnter(toGeneric)
    expect(useEditorStore.getState().source).toBe('classDiagram\n    Foo --> Bar\n')
  })
})
