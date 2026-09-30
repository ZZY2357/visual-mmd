import { act, useEffect, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import mermaid from 'mermaid'
import { resetEditorHistory, useEditorStore } from '../../store/editor'
import { DEFAULT_DIAGRAM_SOURCE } from '../../lib/storage'
import { initI18n, zhDict } from '../../i18n'
import { KANBAN_TEMPLATE } from '../../lib/diagram-registry'
import { kanbanParser } from '../../lib/pipeline/kanban'
import { buildKanbanProjection } from '../../lib/projection/kanban-projection'
import { kanbanDataIdResolver } from '../../lib/canvas-selection/kanban-adapter'
import { useCanvasContextMenu, type NodeFormState } from '../../lib/editing/use-canvas-context-menu'
import type { AnyProjection } from '../../lib/diagram-registry'
import { PropertyPanel } from '../PropertyPanel'

/**
 * kanban 验收场景（工单 06）的**单测等价覆盖**（本轮未做真机端到端——用户指示跳过真机验收）。
 *
 * 工单原文：新建 kanban → 加一列 → 给列加两张卡片 → 给卡片填 assigned/ticket/priority →
 * 双击改卡片描述 → 把 priority 改 Low → 删除一张卡片。
 *
 * 覆盖的链路（全部真实现，不 mock）：
 * `useCanvasContextMenu`（空白「添加列」/ 列上「添加卡片」经 MENU_ACTIONS 表分发）→
 * `PropertyPanel` 渲染真实 `KanbanCardForm` / `KanbanColumnForm` → 表单改元数据 / 描述 →
 * `commitIntent` 手术式落码 → `mermaid.parse` 通过（弱替代证据，代替真机渲染）。
 * 「双击改卡片描述」与属性面板描述字段是**同一 `set-description` 意图**（内联编辑链路由
 * `use-canvas-inline-edit` 的单测覆盖），此处在右侧表单等价覆盖。
 */

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
initI18n()

type KanbanWrapper = Extract<AnyProjection, { type: 'kanban' }>

function projectionOf(source: string): KanbanWrapper {
  const parsed = kanbanParser.parse(source)
  if (!parsed.ok) throw new Error(`样例源码必须可解析：${parsed.error.message}`)
  return { type: 'kanban', kanban: buildKanbanProjection(parsed.doc) }
}

/** 与 mermaid v12 kanban 渲染产物同构：列在 g.sections > g.cluster、卡片在 g.items > g.node，
 * data-id 由渲染后处理反注为节点 id（node-data-ids.annotateKanbanDataIds） */
function svgOf(p: KanbanWrapper): string {
  const clusters = p.kanban.columns.map((c) => `<g class="cluster" data-id="${c.id}"></g>`).join('')
  const nodes = p.kanban.cards.map((c) => `<g class="node" data-id="${c.id}"></g>`).join('')
  return `<svg id="mmd-kanban"><g class="sections">${clusters}</g><g class="items">${nodes}</g></svg>`
}

interface MenuSnapshot {
  nodeForm: NodeFormState | null
  menuOpen: boolean
}

interface Api {
  addColumn: () => void
  addCard: () => void
}

function Harness(props: {
  projection: KanbanWrapper
  svg: string
  onState: (s: MenuSnapshot) => void
  apiRef: { current: Api | null }
}) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const ctx = useCanvasContextMenu({
    projection: props.projection,
    resolver: kanbanDataIdResolver(props.projection.kanban),
    containerRef: menuRef,
  })
  props.apiRef.current = {
    addColumn: () => ctx.onMenuItem('add-column'),
    addCard: () => ctx.onMenuItem('add-card'),
  }
  useEffect(() => {
    props.onState({ nodeForm: ctx.nodeForm, menuOpen: ctx.menu !== null })
  })
  return (
    <div ref={menuRef} tabIndex={0} onContextMenu={ctx.onContextMenu}>
      <div dangerouslySetInnerHTML={{ __html: props.svg }} />
      <MantineProvider>
        <PropertyPanel projection={props.projection} parseError={null} />
      </MantineProvider>
    </div>
  )
}

// ---------- 表单辅助（与 scenario-a-class-relation.test.tsx 同款） ----------

function inputByLabel(host: HTMLElement, labelText: string): HTMLInputElement {
  const label = Array.from(host.querySelectorAll('label')).find((l) => l.textContent?.trim() === labelText)
  if (label === undefined) throw new Error(`未找到标签：${labelText}`)
  const input = document.getElementById(label.htmlFor)
  if (!(input instanceof HTMLInputElement)) throw new Error(`标签未关联输入框：${labelText}`)
  return input
}

async function typeInto(input: HTMLInputElement, value: string): Promise<void> {
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

async function clickButton(host: HTMLElement, text: string): Promise<void> {
  const button = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === text)
  if (button === undefined) throw new Error(`未找到按钮：${text}`)
  await act(async () => button.click())
}

async function selectOption(host: HTMLElement, labelText: string, optionText: string): Promise<void> {
  const input = inputByLabel(host, labelText)
  await act(async () => {
    input.click()
  })
  const options = Array.from(document.querySelectorAll('[role="option"]'))
  const index = options.findIndex((o) => o.textContent?.trim() === optionText)
  if (index === -1) throw new Error(`未找到选项：${optionText}`)
  await act(async () => {
    ;(options[index] as HTMLElement).click()
  })
}

describe('验收场景（kanban，单测等价覆盖）', () => {
  let host: HTMLDivElement
  let root: Root
  let snapshots: MenuSnapshot[]
  let api: { current: Api | null }

  beforeEach(() => {
    window.localStorage?.clear()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    snapshots = []
    api = { current: null }
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.restoreAllMocks()
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
    useEditorStore.getState().select(null)
  })

  function rerender(): HTMLDivElement {
    const projection = projectionOf(useEditorStore.getState().source)
    act(() => {
      root.render(
        <Harness projection={projection} svg={svgOf(projection)} onState={(s) => snapshots.push(s)} apiRef={api} />,
      )
    })
    return host.firstElementChild as HTMLDivElement
  }

  function contextMenuOn(container: Element, selector: string): void {
    act(() => {
      const el = container.querySelector(selector)
      if (el === null) throw new Error(`未找到元素：${selector}`)
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    })
  }

  it('新建 kanban → 加列 → 加两卡 → 填元数据 → 改描述 → priority 改 Low → 删卡', async () => {
    // ① 新建 kanban（起步模板：三列 Todo/Doing/Done，其一卡片带完整元数据）
    resetEditorHistory(KANBAN_TEMPLATE)
    rerender()
    expect(projectionOf(useEditorStore.getState().source).kanban.columns.map((c) => c.id)).toEqual([
      'Todo',
      'Doing',
      'Done',
    ])

    // ② 加一列：右键画布空白 → 添加列（真实 hook），默认 id「col」
    contextMenuOn(host.firstElementChild as Element, 'svg')
    act(() => api.current!.addColumn())
    expect(useEditorStore.getState().source).toContain('col[新列]')
    expect(useEditorStore.getState().selection).toEqual({ kind: 'kanban-column', elementId: 'kanban-column:col' })

    // ③ 给新列加两张卡片：右键该列 → 添加卡片（每次后按 store 源码重投影）
    for (let i = 0; i < 2; i++) {
      const container = rerender()
      contextMenuOn(container, '[data-id="col"]')
      act(() => api.current!.addCard())
    }
    let projection = projectionOf(useEditorStore.getState().source)
    const col = projection.kanban.columns.find((c) => c.id === 'col')!
    expect(col.cards).toHaveLength(2)

    // ④ 给第一张卡片填 assigned / ticket / priority（右侧真实 KanbanCardForm → set-metadata）
    const firstCard = col.cards[0]
    act(() => useEditorStore.getState().select({ kind: 'kanban-card', elementId: firstCard.elementId }))
    let container = rerender()
    await typeInto(inputByLabel(container, zhDict.app.propertyPanel.kanbanAssigned), '张三')
    await pressEnter(inputByLabel(container, zhDict.app.propertyPanel.kanbanAssigned))
    container = rerender()
    await typeInto(inputByLabel(container, zhDict.app.propertyPanel.kanbanTicket), 'VMMD-200')
    await pressEnter(inputByLabel(container, zhDict.app.propertyPanel.kanbanTicket))
    container = rerender()
    await selectOption(container, zhDict.app.propertyPanel.kanbanPriority, zhDict.app.kanbanPriorities.High)
    const source = useEditorStore.getState().source
    expect(source).toContain("assigned: '张三'")
    expect(source).toContain("ticket: 'VMMD-200'")
    expect(source).toContain("priority: 'High'")

    // ⑤ 改卡片描述（与双击内联编辑同一 set-description 意图）
    container = rerender()
    await typeInto(inputByLabel(container, zhDict.app.propertyPanel.kanbanCardDescription), '改后的卡片')
    await pressEnter(inputByLabel(container, zhDict.app.propertyPanel.kanbanCardDescription))
    expect(useEditorStore.getState().source).toContain('[改后的卡片]')

    // ⑥ priority 改 Low
    container = rerender()
    await selectOption(container, zhDict.app.propertyPanel.kanbanPriority, zhDict.app.kanbanPriorities.Low)
    projection = projectionOf(useEditorStore.getState().source)
    const updatedCard = projection.kanban.cards.find((c) => c.elementId === firstCard.elementId)!
    expect(updatedCard.priority).toBe('Low')
    expect(updatedCard.assigned).toBe('张三')
    expect(updatedCard.ticket).toBe('VMMD-200')
    expect(updatedCard.description).toBe('改后的卡片')

    // ⑦ 删除一张卡片（属性面板删除按钮 → delete-card；级联不改其它元素）
    const cardsBefore = projectionOf(useEditorStore.getState().source).kanban.cards.length
    container = rerender()
    await clickButton(container, zhDict.app.propertyPanel.deleteKanbanCard)
    projection = projectionOf(useEditorStore.getState().source)
    expect(projection.kanban.cards.length).toBe(cardsBefore - 1)

    // 弱替代证据（代替真机渲染）：产物仍是合法 mermaid
    await expect(mermaid.parse(useEditorStore.getState().source)).resolves.toBeTruthy()
  })
})
