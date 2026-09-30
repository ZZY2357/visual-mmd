import { act, useEffect, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import mermaid from 'mermaid'
import { resetEditorHistory, useEditorStore } from '../../store/editor'
import { DEFAULT_DIAGRAM_SOURCE } from '../../lib/storage'
import { initI18n, zhDict } from '../../i18n'
import { JOURNEY_TEMPLATE } from '../../lib/diagram-registry'
import { journeyParser } from '../../lib/pipeline/journey'
import { buildJourneyProjection } from '../../lib/projection/journey-projection'
import { useCanvasContextMenu } from '../../lib/editing/use-canvas-context-menu'
import type { AnyProjection } from '../../lib/diagram-registry'
import { PropertyPanel } from '../PropertyPanel'

/**
 * journey 验收场景（工单 08）的**单测等价覆盖**（本轮未做真机端到端——仓库约定跳过真机验收）。
 *
 * 工单原文：新建 journey → 加 section → 加两个任务并填 score 与 actors → 改任务名 →
 * 把某任务 score 从 3 改 5 → 删除一个 section（连带其任务）。
 * 「双击改任务名」随画布无 data-id 一并降级（工单定案，记录在 Comments）——
 * 任务名改写在右侧属性表单等价覆盖（与内联编辑本是同一 set-task-name 意图）。
 *
 * 覆盖的链路（全部真实现，不 mock）：
 * `useCanvasContextMenu`（空白「添加任务 / 添加分组」经 MENU_ACTIONS 表分发）→
 * `PropertyPanel` 渲染真实 `JourneyTaskForm` / `JourneySectionForm` → 表单改名字 /
 * score 选择器 / actors → `commitIntent` 手术式落码 → `mermaid.parse` 通过（弱替代证据）。
 * journey 画布无 data-id（实测降级），右键空白即画布容器本身。
 */

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
initI18n()

type JourneyWrapper = Extract<AnyProjection, { type: 'journey' }>

function projectionOf(source: string): JourneyWrapper {
  const parsed = journeyParser.parse(source)
  if (!parsed.ok) throw new Error(`样例源码必须可解析：${parsed.error.message}`)
  return { type: 'journey', journey: buildJourneyProjection(parsed.doc) }
}

interface Api {
  addTask: () => void
  addSection: () => void
}

function Harness(props: { projection: JourneyWrapper; apiRef: { current: Api | null } }) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  // journey 无 data-id（实测降级）：resolver 永不命中，与 journey-adapter 的能力包同口径
  const ctx = useCanvasContextMenu({
    projection: props.projection,
    resolver: () => null,
    containerRef: menuRef,
  })
  props.apiRef.current = {
    addTask: () => ctx.onMenuItem('add-journey-task'),
    addSection: () => ctx.onMenuItem('add-journey-section'),
  }
  useEffect(() => {})
  return (
    <div ref={menuRef} tabIndex={0} onContextMenu={ctx.onContextMenu}>
      <MantineProvider>
        <PropertyPanel projection={props.projection} parseError={null} />
      </MantineProvider>
    </div>
  )
}

// ---------- 表单辅助（与 scenario-kanban.test.tsx 同款） ----------

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

describe('验收场景（journey，单测等价覆盖）', () => {
  let host: HTMLDivElement
  let root: Root
  let api: { current: Api | null }

  beforeEach(() => {
    window.localStorage?.clear()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
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
      root.render(<Harness projection={projection} apiRef={api} />)
    })
    return host.firstElementChild as HTMLDivElement
  }

  it('新建 journey → 加分组 → 加两任务并填 score 与 actors → 改任务名 → score 3→5 → 删分组（连带任务）', async () => {
    // ① 新建 journey（起步模板：title + 两个 section、各两个任务，score 与多 actor 各有示例）
    resetEditorHistory(JOURNEY_TEMPLATE)
    rerender()
    expect(projectionOf(useEditorStore.getState().source).journey.sections.map((s) => s.name)).toEqual([
      '发现',
      '决策',
    ])

    // ② 加一个分组：右键画布空白 → 添加分组（真实 hook）
    const container = rerender()
    act(() => {
      container.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    })
    act(() => api.current!.addSection())
    expect(useEditorStore.getState().source).toContain('section 新分组')
    expect(useEditorStore.getState().selection).toEqual({ kind: 'journey-section', elementId: 'section:3' })

    // ③ 加两个任务（空白 → 添加任务；锚到最后一个分组 = 新分组——mermaid 按书写位置归组）
    for (let i = 0; i < 2; i++) {
      const c = rerender()
      act(() => {
        c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
      })
      act(() => api.current!.addTask())
    }
    let projection = projectionOf(useEditorStore.getState().source)
    const section = projection.journey.sections.find((s) => s.name === '新分组')!
    expect(section.tasks.map((t) => t.name)).toEqual(['新任务', '新任务2'])

    // ④ 给第一个任务填 score 与 actors（右侧真实 JourneyTaskForm → set-task-score / set-task-actors）
    const firstTask = section.tasks[0]
    act(() => useEditorStore.getState().select({ kind: 'journey-task', elementId: firstTask.elementId }))
    let c = rerender()
    await selectOption(c, zhDict.app.propertyPanel.journeyScore, '4')
    c = rerender()
    await typeInto(inputByLabel(c, zhDict.app.propertyPanel.journeyActors), '用户, 客服')
    await pressEnter(inputByLabel(c, zhDict.app.propertyPanel.journeyActors))
    expect(useEditorStore.getState().source).toContain('新任务: 4: 用户, 客服')

    // ⑤ 改任务名（与内联编辑同一 set-task-name 意图；内联编辑随画布降级，表单等价覆盖）
    c = rerender()
    await typeInto(inputByLabel(c, zhDict.app.propertyPanel.journeyTaskName), '完成支付')
    await pressEnter(inputByLabel(c, zhDict.app.propertyPanel.journeyTaskName))
    expect(useEditorStore.getState().source).toContain('完成支付: 4: 用户, 客服')

    // ⑥ score 4 → 5（工单场景的 3→5 等价改法：选择器再选一档）
    c = rerender()
    await selectOption(c, zhDict.app.propertyPanel.journeyScore, '5')
    projection = projectionOf(useEditorStore.getState().source)
    const updated = projection.journey.tasks.find((t) => t.elementId === firstTask.elementId)!
    expect(updated).toMatchObject({ name: '完成支付', score: 5, actors: ['用户', '客服'] })

    // ⑦ 删除一个分组（连带其任务：JourneySectionForm 删除按钮 → delete-section 级联）
    const before = projectionOf(useEditorStore.getState().source).journey
    act(() => useEditorStore.getState().select({ kind: 'journey-section', elementId: 'section:1' }))
    c = rerender()
    await clickButton(c, zhDict.app.propertyPanel.deleteJourneySection)
    projection = projectionOf(useEditorStore.getState().source)
    expect(projection.journey.sections.map((s) => s.name)).toEqual(['决策', '新分组'])
    expect(projection.journey.tasks.length).toBe(before.tasks.length - 2)
    expect(useEditorStore.getState().source).not.toContain('访问首页')

    // 弱替代证据（代替真机渲染）：产物仍是合法 mermaid
    await expect(mermaid.parse(useEditorStore.getState().source)).resolves.toBeTruthy()
  })
})
