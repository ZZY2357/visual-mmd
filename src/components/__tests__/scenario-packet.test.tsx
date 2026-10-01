import { act, useEffect, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import mermaid from 'mermaid'
import { resetEditorHistory, useEditorStore } from '../../store/editor'
import { DEFAULT_DIAGRAM_SOURCE } from '../../lib/storage'
import { initI18n, zhDict } from '../../i18n'
import { PACKET_TEMPLATE } from '../../lib/diagram-registry'
import { packetParser } from '../../lib/pipeline/packet'
import { buildPacketProjection } from '../../lib/projection/packet-projection'
import { useCanvasContextMenu } from '../../lib/editing/use-canvas-context-menu'
import { packetDataIdResolver } from '../../lib/canvas-selection/packet-adapter'
import type { AnyProjection } from '../../lib/diagram-registry'
import { PropertyPanel } from '../PropertyPanel'

/**
 * packet 验收场景（工单 16）的**单测等价覆盖**（仓库约定跳过真机端到端）。
 *
 * 工单原文：新建 packet 图 → 加字段（Tab / 空白菜单，+count 形态）→ 改字段名（双击
 * 内联编辑）→ 改字段位区间（start-end 绝对形态落码）→ 删除一个字段。
 * 「双击改字段名」与右侧表单是**同一 `set-field-name` 意图**（内联编辑链路由
 * use-canvas-inline-edit 消费同一 store 意图通道，与 quadrant/kanban 场景测试同款
 * 等价覆盖）。
 *
 * 覆盖的链路（全部真实现，不 mock）：
 * `useCanvasContextMenu`（空白「添加字段」经 MENU_ACTIONS 表分发，真 packetDataIdResolver）→
 * `PropertyPanel` 渲染真实 `PacketFieldForm` → 表单改名称 / 位区间 → `commitIntent`
 * 手术式落码 → mermaid.parse 通过（弱替代证据）。
 * packet 字段有 data-id 寻址（渲染后按 start-bit 映射反注），右键空白即画布容器本身。
 * 区间校验（mermaid 12 全序列严格连续）：不衔接 / 重叠的落码意图被管线拒绝，源码不变。
 */

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
initI18n()

type PacketWrapper = Extract<AnyProjection, { type: 'packet' }>

function projectionOf(source: string): PacketWrapper {
  const parsed = packetParser.parse(source)
  if (!parsed.ok) throw new Error(`样例源码必须可解析：${parsed.error.message}`)
  return { type: 'packet', packet: buildPacketProjection(parsed.doc) }
}

interface Api {
  addField: () => void
}

function Harness(props: { projection: PacketWrapper; apiRef: { current: Api | null } }) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const ctx = useCanvasContextMenu({
    projection: props.projection,
    resolver: packetDataIdResolver(props.projection.packet),
    containerRef: menuRef,
  })
  props.apiRef.current = {
    addField: () => ctx.onMenuItem('add-packet-field'),
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

// ---------- 表单辅助（与 scenario-quadrant.test.tsx 同款） ----------

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

describe('验收场景（packet，单测等价覆盖）', () => {
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

  it('新建 packet → 加字段 → 改字段名 → 改位区间（绝对形态落码）→ 非法区间拒绝 → 删除一个字段', async () => {
    // ① 新建 packet（起步模板：0-15 / 16-31 / +16 三个字段）
    resetEditorHistory(PACKET_TEMPLATE)
    rerender()
    expect(projectionOf(useEditorStore.getState().source).packet.fields.map((f) => f.name)).toEqual([
      'Source Port',
      'Destination Port',
      'Flags',
    ])

    // ② 加一个字段：右键画布空白 → 添加字段（真实 hook；+count 形态衔接前序，
    //    落 `+8: "新字段"` 并选中新字段、进入内联命名）
    const container = rerender()
    act(() => {
      container.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    })
    act(() => api.current!.addField())
    expect(useEditorStore.getState().source).toContain('+8: "新字段"')
    expect(useEditorStore.getState().selection).toEqual({ kind: 'packet-field', elementId: 'field:4' })

    // ③ 改字段名（右侧真实 PacketFieldForm → set-field-name；+count 原形态保留）
    let c = rerender()
    await typeInto(inputByLabel(c, zhDict.app.propertyPanel.packetFieldName), '重点项')
    await pressEnter(inputByLabel(c, zhDict.app.propertyPanel.packetFieldName))
    expect(useEditorStore.getState().source).toContain('+8: "重点项"')

    // ④ 删除一个字段（选中 field:2 → 删除按钮 → delete-field；后续 +count 字段自动
    //    衔接——显式起点字段被删后仍连续，Flags 原形态 +16 保留、绝对区间前移）
    c = rerender()
    act(() => {
      useEditorStore.getState().select({ kind: 'packet-field', elementId: 'field:2' })
    })
    c = rerender()
    await clickButton(c, zhDict.app.propertyPanel.deletePacketField)
    const projection = projectionOf(useEditorStore.getState().source)
    expect(projection.packet.fields.map((f) => f.name)).toEqual(['Source Port', 'Flags', '重点项'])
    expect(useEditorStore.getState().source).not.toContain('Destination Port')
    expect(useEditorStore.getState().source).toContain('+16: "Flags"')
    expect(projection.packet.fields[1]).toMatchObject({ absStart: 16, absEnd: 31 })
    expect(projection.packet.fields[2]).toMatchObject({ absStart: 32, absEnd: 39 })

    // ⑤ 改位区间（结束位 39 → 46：以 start-end 绝对形态落码，工单定案）
    //    （④删除后选中已清空，先重新选中新序的 field:3 = 重点项）
    c = rerender()
    act(() => {
      useEditorStore.getState().select({ kind: 'packet-field', elementId: 'field:3' })
    })
    c = rerender()
    await typeInto(inputByLabel(c, zhDict.app.propertyPanel.packetFieldEnd), '46')
    await pressEnter(inputByLabel(c, zhDict.app.propertyPanel.packetFieldEnd))
    expect(useEditorStore.getState().source).toContain('32-46: "重点项"')
    expect(useEditorStore.getState().source).not.toContain('+8: "重点项"')

    // ⑥ 非法区间拒绝落码（工单定案：源码始终合法）：起始位 24 与前序字段间隙
    //    （前序结束 31，显式起点必须 32）→ 管线拒绝，源码不变
    c = rerender()
    await typeInto(inputByLabel(c, zhDict.app.propertyPanel.packetFieldStart), '24')
    await pressEnter(inputByLabel(c, zhDict.app.propertyPanel.packetFieldStart))
    expect(useEditorStore.getState().source).toContain('32-46: "重点项"')
    expect(useEditorStore.getState().source).not.toContain('24-')

    // 弱替代证据（代替真机渲染）：产物仍是合法 mermaid
    await expect(mermaid.parse(useEditorStore.getState().source)).resolves.toBeTruthy()
  })
})
