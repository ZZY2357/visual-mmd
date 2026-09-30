import { act, useEffect, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import mermaid from 'mermaid'
import { resetEditorHistory, useEditorStore } from '../../store/editor'
import { DEFAULT_DIAGRAM_SOURCE } from '../../lib/storage'
import { initI18n, zhDict } from '../../i18n'
import { QUADRANT_TEMPLATE } from '../../lib/diagram-registry'
import { quadrantParser } from '../../lib/pipeline/quadrant'
import { buildQuadrantProjection } from '../../lib/projection/quadrant-projection'
import { useCanvasContextMenu } from '../../lib/editing/use-canvas-context-menu'
import type { AnyProjection } from '../../lib/diagram-registry'
import { PropertyPanel } from '../PropertyPanel'

/**
 * quadrant 验收场景（工单 12）的**单测等价覆盖**（本轮未做真机端到端——仓库约定跳过真机验收）。
 *
 * 工单原文：新建 quadrant 图 → 加点 → 改点坐标 → 给点加 radius 样式 → 双击改点文本 →
 * 改 quadrant-2 标题 → 删除一个点。
 * 「双击改点文本」与右侧表单是**同一 `set-point-text` 意图**（内联编辑链路由
 * use-canvas-inline-edit 消费同一 store 意图通道，与 kanban/pie 场景测试同款等价覆盖）。
 *
 * 覆盖的链路（全部真实现，不 mock）：
 * `useCanvasContextMenu`（空白「添加点」经 MENU_ACTIONS 表分发）→
 * `PropertyPanel` 渲染真实 `QuadrantPointForm` / `QuadrantQuadrantForm` →
 * 表单改坐标 / 样式 / 文本 → `commitIntent` 手术式落码 → `mermaid.parse` 通过（弱替代证据）。
 * quadrant 点有 data-id 寻址（渲染后位置序反注），右键空白即画布容器本身。
 */

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
initI18n()

type QuadrantWrapper = Extract<AnyProjection, { type: 'quadrant' }>

function projectionOf(source: string): QuadrantWrapper {
  const parsed = quadrantParser.parse(source)
  if (!parsed.ok) throw new Error(`样例源码必须可解析：${parsed.error.message}`)
  return { type: 'quadrant', quadrant: buildQuadrantProjection(parsed.doc) }
}

interface Api {
  addPoint: () => void
}

function Harness(props: { projection: QuadrantWrapper; apiRef: { current: Api | null } }) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const ctx = useCanvasContextMenu({
    projection: props.projection,
    resolver: (dataId) => (dataId !== '' ? { kind: 'node', id: dataId } : null),
    containerRef: menuRef,
  })
  props.apiRef.current = {
    addPoint: () => ctx.onMenuItem('add-quadrant-point'),
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

// ---------- 表单辅助（与 scenario-pie.test.tsx 同款） ----------

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

describe('验收场景（quadrant，单测等价覆盖）', () => {
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

  it('新建 quadrant → 加点 → 改点坐标 → 加 radius 样式 → 改点文本 → 改 quadrant-2 标题 → 删除一个点', async () => {
    // ① 新建 quadrant（起步模板：title + 双段双轴 + quadrant-1..4 + 三个点 + classDef）
    resetEditorHistory(QUADRANT_TEMPLATE)
    rerender()
    expect(projectionOf(useEditorStore.getState().source).quadrant.points.map((p) => p.text)).toEqual([
      'Campaign A',
      'Campaign B',
      'Campaign C',
    ])

    // ② 加一个点：右键画布空白 → 添加点（真实 hook；落 `新点: [0.5, 0.5]` 并选中新点）
    const container = rerender()
    act(() => {
      container.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    })
    act(() => api.current!.addPoint())
    expect(useEditorStore.getState().source).toContain('新点: [0.5, 0.5]')
    expect(useEditorStore.getState().selection).toEqual({ kind: 'quadrant-point', elementId: 'point:4' })

    // ③ 改点坐标（右侧真实 QuadrantPointForm → set-point-coords；越界值被表单拒绝落码）
    let c = rerender()
    await typeInto(inputByLabel(c, zhDict.app.propertyPanel.quadrantPointX), '0.8')
    await pressEnter(inputByLabel(c, zhDict.app.propertyPanel.quadrantPointX))
    expect(useEditorStore.getState().source).toContain('新点: [0.8, 0.5]')
    // 越界坐标拒绝落码（工单定案：源码始终合法）
    await typeInto(inputByLabel(c, zhDict.app.propertyPanel.quadrantPointY), '1.5')
    await pressEnter(inputByLabel(c, zhDict.app.propertyPanel.quadrantPointY))
    expect(useEditorStore.getState().source).toContain('新点: [0.8, 0.5]')
    expect(useEditorStore.getState().source).not.toContain('[0.8, 1.5]')

    // ④ 给点加 radius 样式（QuadrantStyleInput → set-point-style，逐字段手术改写）
    c = rerender()
    await typeInto(inputByLabel(c, zhDict.app.propertyPanel.quadrantStyle_radius), '12')
    await pressEnter(inputByLabel(c, zhDict.app.propertyPanel.quadrantStyle_radius))
    expect(useEditorStore.getState().source).toContain('新点: [0.8, 0.5] radius: 12')

    // ⑤ 改点文本（与双击内联编辑同一 set-point-text 意图）
    c = rerender()
    await typeInto(inputByLabel(c, zhDict.app.propertyPanel.quadrantPointText), '重点项')
    await pressEnter(inputByLabel(c, zhDict.app.propertyPanel.quadrantPointText))
    expect(useEditorStore.getState().source).toContain('重点项: [0.8, 0.5] radius: 12')

    // ⑥ 改 quadrant-2 标题（QuadrantQuadrantForm → set-quadrant-text；轴/象限是文档级属性元素）
    c = rerender()
    act(() => {
      useEditorStore.getState().select({ kind: 'quadrant-quadrant', elementId: 'quadrant:2' })
    })
    c = rerender()
    await typeInto(inputByLabel(c, zhDict.app.propertyPanel.quadrantQuadrantText), '排期跟进')
    await pressEnter(inputByLabel(c, zhDict.app.propertyPanel.quadrantQuadrantText))
    expect(useEditorStore.getState().source).toContain('quadrant-2 排期跟进')

    // ⑦ 删除一个点（选中 point:1 → 删除按钮 → delete-point）
    c = rerender()
    act(() => {
      useEditorStore.getState().select({ kind: 'quadrant-point', elementId: 'point:1' })
    })
    c = rerender()
    await clickButton(c, zhDict.app.propertyPanel.deleteQuadrantPoint)
    const projection = projectionOf(useEditorStore.getState().source)
    expect(projection.quadrant.points.map((p) => p.text)).toEqual(['Campaign B', 'Campaign C', '重点项'])
    expect(useEditorStore.getState().source).not.toContain('Campaign A:')
    expect(useEditorStore.getState().source).toContain('classDef highlight color:#f08c00')

    // 弱替代证据（代替真机渲染）：产物仍是合法 mermaid
    await expect(mermaid.parse(useEditorStore.getState().source)).resolves.toBeTruthy()
  })
})
