import { act, useEffect, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import mermaid from 'mermaid'
import { resetEditorHistory, useEditorStore } from '../../store/editor'
import { DEFAULT_DIAGRAM_SOURCE } from '../../lib/storage'
import { initI18n, zhDict } from '../../i18n'
import { PIE_TEMPLATE } from '../../lib/diagram-registry'
import { pieParser } from '../../lib/pipeline/pie'
import { buildPieProjection } from '../../lib/projection/pie-projection'
import { useCanvasContextMenu } from '../../lib/editing/use-canvas-context-menu'
import type { AnyProjection } from '../../lib/diagram-registry'
import { PropertyPanel } from '../PropertyPanel'

/**
 * pie 验收场景（工单 10）的**单测等价覆盖**（本轮未做真机端到端——仓库约定跳过真机验收）。
 *
 * 工单原文：新建 pie → 加扇区 → 改某扇区数值 → 双击结构树改 label → 删除一个扇区。
 * 「双击改 label」随画布无 data-id 一并降级（工单定案，记录在 Comments）——
 * 标签改写在右侧属性表单等价覆盖（内联编辑与表单本是同一 set-sector-label 意图）。
 *
 * 覆盖的链路（全部真实现，不 mock）：
 * `useCanvasContextMenu`（空白「添加扇区」经 MENU_ACTIONS 表分发）→
 * `PropertyPanel` 渲染真实 `PieSectorForm` → 表单改数值 / 标签 → `commitIntent`
 * 手术式落码 → `mermaid.parse` 通过（弱替代证据）。
 * pie 画布无 data-id（实测降级），右键空白即画布容器本身。
 */

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
initI18n()

type PieWrapper = Extract<AnyProjection, { type: 'pie' }>

function projectionOf(source: string): PieWrapper {
  const parsed = pieParser.parse(source)
  if (!parsed.ok) throw new Error(`样例源码必须可解析：${parsed.error.message}`)
  return { type: 'pie', pie: buildPieProjection(parsed.doc) }
}

interface Api {
  addSector: () => void
}

function Harness(props: { projection: PieWrapper; apiRef: { current: Api | null } }) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  // pie 无 data-id（实测降级）：resolver 永不命中，与 pie-adapter 的能力包同口径
  const ctx = useCanvasContextMenu({
    projection: props.projection,
    resolver: () => null,
    containerRef: menuRef,
  })
  props.apiRef.current = {
    addSector: () => ctx.onMenuItem('add-pie-sector'),
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

describe('验收场景（pie，单测等价覆盖）', () => {
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

  it('新建 pie → 加扇区 → 改某扇区数值 → 改 label → 删除一个扇区', async () => {
    // ① 新建 pie（起步模板：pie showData + title + 三个扇区）
    resetEditorHistory(PIE_TEMPLATE)
    rerender()
    expect(projectionOf(useEditorStore.getState().source).pie.sectors.map((s) => s.label)).toEqual([
      '研发',
      '市场',
      '运营',
    ])

    // ② 加一个扇区：右键画布空白 → 添加扇区（真实 hook；落 `"新扇区" : 1`）
    const container = rerender()
    act(() => {
      container.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    })
    act(() => api.current!.addSector())
    expect(useEditorStore.getState().source).toContain('"新扇区" : 1')
    expect(useEditorStore.getState().selection).toEqual({ kind: 'pie-sector', elementId: 'sector:4' })

    // ③ 改某扇区数值（右侧真实 PieSectorForm → set-sector-value；小数风格随输入）
    let c = rerender()
    await typeInto(inputByLabel(c, zhDict.app.propertyPanel.pieValue), '18.5')
    await pressEnter(inputByLabel(c, zhDict.app.propertyPanel.pieValue))
    expect(useEditorStore.getState().source).toContain('"新扇区" : 18.5')

    // ④ 改 label（与内联编辑同一 set-sector-label 意图；内联编辑随画布降级，表单等价覆盖）
    c = rerender()
    await typeInto(inputByLabel(c, zhDict.app.propertyPanel.pieLabel), '客服')
    await pressEnter(inputByLabel(c, zhDict.app.propertyPanel.pieLabel))
    expect(useEditorStore.getState().source).toContain('"客服" : 18.5')

    // ⑤ 删除一个扇区（PieSectorForm 删除按钮 → delete-sector）
    c = rerender()
    await clickButton(c, zhDict.app.propertyPanel.deletePieSector)
    const projection = projectionOf(useEditorStore.getState().source)
    expect(projection.pie.sectors.map((s) => s.label)).toEqual(['研发', '市场', '运营'])
    expect(useEditorStore.getState().source).not.toContain('"客服"')

    // 弱替代证据（代替真机渲染）：产物仍是合法 mermaid
    await expect(mermaid.parse(useEditorStore.getState().source)).resolves.toBeTruthy()
  })
})
