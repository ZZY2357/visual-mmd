import { act, useEffect, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import mermaid from 'mermaid'
import { resetEditorHistory, useEditorStore } from '../../store/editor'
import { DEFAULT_DIAGRAM_SOURCE } from '../../lib/storage'
import { initI18n, zhDict } from '../../i18n'
import { GANTT_TEMPLATE } from '../../lib/diagram-registry'
import { ganttParser } from '../../lib/pipeline/gantt'
import { buildGanttProjection } from '../../lib/projection/gantt-projection'
import { useCanvasContextMenu } from '../../lib/editing/use-canvas-context-menu'
import type { AnyProjection } from '../../lib/diagram-registry'
import { PropertyPanel } from '../PropertyPanel'

/**
 * gantt 验收场景（more-diagrams 工单 11）的**单测等价覆盖**（仓库约定跳过真机端到端）。
 *
 * 工单场景：新建 gantt → 加 section → 加 after 任务 → 改名 → 加 crit 标签 → 删除。
 * 「加 after 任务」经任务表单等价覆盖：新任务先以缺省时长落码，再在形态化元数据表单里
 * 把形态切成 after-end 并填依赖 id（set-task-meta 按形态拼回逗号序）——与手写
 * `after a1, 4d` 落同一份源码。改名走 set-task-name（与内联编辑同一意图）。
 *
 * 覆盖的链路（全部真实现，不 mock）：
 * `useCanvasContextMenu`（空白「添加任务 / 添加分组」经 MENU_ACTIONS 表分发）→
 * `PropertyPanel` 渲染真实 `GanttTaskForm` / `GanttSectionForm` → 表单改名 / 形态切换 /
 * 标签选择 → `commitIntent` 手术式落码 → `mermaid.parse` 通过（弱替代证据）。
 */

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
initI18n()

type GanttWrapper = Extract<AnyProjection, { type: 'gantt' }>

function projectionOf(source: string): GanttWrapper {
  const parsed = ganttParser.parse(source)
  if (!parsed.ok) throw new Error(`样例源码必须可解析：${parsed.error.message}`)
  return { type: 'gantt', gantt: buildGanttProjection(parsed.doc) }
}

interface Api {
  addTask: () => void
  addSection: () => void
}

function Harness(props: { projection: GanttWrapper; apiRef: { current: Api | null } }) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  // 本场景只走空白菜单（添加任务 / 添加分组）：resolver 不命中即可，与能力包同口径
  const ctx = useCanvasContextMenu({
    projection: props.projection,
    resolver: () => null,
    containerRef: menuRef,
  })
  props.apiRef.current = {
    addTask: () => ctx.onMenuItem('add-gantt-task'),
    addSection: () => ctx.onMenuItem('add-gantt-section'),
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

// ---------- 表单辅助（与 scenario-journey.test.tsx 同款） ----------

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

describe('验收场景（gantt，单测等价覆盖）', () => {
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

  it('新建 gantt → 加分组 → 加任务 → 改名 → 形态切 after 并填依赖 → 加 crit 标签 → 删分组（连带任务）', async () => {
    // ① 新建 gantt（起步模板：dateFormat/axisFormat/title、两个 section、三个任务，
    //    done / active 标签与 after 依赖各有示例）
    resetEditorHistory(GANTT_TEMPLATE)
    rerender()
    let projection = projectionOf(useEditorStore.getState().source)
    expect(projection.gantt.sections.map((s) => s.name)).toEqual(['调研', '开发'])
    expect(projection.gantt.tasks.map((t) => t.taskId)).toEqual(['a1', 'a2', 'task1'])

    // ② 加一个分组：右键画布空白 → 添加分组（真实 hook）
    const container = rerender()
    act(() => {
      container.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    })
    act(() => api.current!.addSection())
    expect(useEditorStore.getState().source).toContain('section 新分组')
    expect(useEditorStore.getState().selection).toEqual({ kind: 'gantt-section', elementId: 'section:3' })

    // ③ 加一个任务（空白 → 添加任务；锚到最后一个分组 = 新分组——mermaid 按书写位置归组，
    //    元数据缺省时长 1d）
    let c = rerender()
    act(() => {
      c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    })
    act(() => api.current!.addTask())
    projection = projectionOf(useEditorStore.getState().source)
    const section = projection.gantt.sections.find((s) => s.name === '新分组')!
    expect(section.tasks.map((t) => t.name)).toEqual(['新任务'])

    // ④ 改任务名（右侧真实 GanttTaskForm → set-task-name，与内联编辑同一意图）
    const newTask = section.tasks[0]
    act(() => useEditorStore.getState().select({ kind: 'gantt-task', elementId: newTask.elementId }))
    c = rerender()
    await typeInto(inputByLabel(c, zhDict.app.propertyPanel.ganttTaskName), '联调测试')
    await pressEnter(inputByLabel(c, zhDict.app.propertyPanel.ganttTaskName))
    expect(useEditorStore.getState().source).toContain('联调测试: 1d')

    // ⑤ 元数据形态切 after-end 并填依赖 id（清单外 1 字段形态先选形态——工单定案）：
    //    set-task-meta 按形态拼回逗号序，落 `联调测试: after a1, 4d`
    c = rerender()
    await selectOption(c, zhDict.app.propertyPanel.ganttTaskShape, zhDict.app.propertyPanel.ganttShapeAfterEnd)
    c = rerender()
    await typeInto(inputByLabel(c, zhDict.app.propertyPanel.ganttTaskAfterIds), 'a1')
    await typeInto(inputByLabel(c, zhDict.app.propertyPanel.ganttTaskEnd), '4d')
    await pressEnter(inputByLabel(c, zhDict.app.propertyPanel.ganttTaskEnd))
    expect(useEditorStore.getState().source).toContain('联调测试: after a1, 4d')

    // ⑥ 加 crit 标签（MultiSelect → set-task-meta，字段原样保留）
    c = rerender()
    await selectOption(c, zhDict.app.propertyPanel.ganttTaskTags, 'crit')
    expect(useEditorStore.getState().source).toContain('联调测试: crit, after a1, 4d')

    // ⑦ 删除一个分组（连带其任务：GanttSectionForm 删除按钮 → delete-section 级联）。
    //    删新增的「新分组」（无任务依赖它），调研/开发两分组与模板任务不受影响
    const before = projectionOf(useEditorStore.getState().source).gantt
    act(() => useEditorStore.getState().select({ kind: 'gantt-section', elementId: 'section:3' }))
    c = rerender()
    await clickButton(c, zhDict.app.propertyPanel.deleteGanttSection)
    projection = projectionOf(useEditorStore.getState().source)
    expect(projection.gantt.sections.map((s) => s.name)).toEqual(['调研', '开发'])
    expect(projection.gantt.tasks.length).toBe(before.tasks.length - 1)
    expect(useEditorStore.getState().source).not.toContain('联调测试')
    expect(useEditorStore.getState().source).toContain('编码实现 :after a2, 4d')

    // 弱替代证据（代替真机渲染）：产物仍是合法 mermaid
    await expect(mermaid.parse(useEditorStore.getState().source)).resolves.toBeTruthy()
  })
})
