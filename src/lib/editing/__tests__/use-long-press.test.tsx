import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLongPress, type LongPressPoint } from '../use-long-press'

/**
 * 触屏长按（工单 15）：触摸主指针按下 500ms 触发；移动超容差 / 抬起 / 取消都撤销；
 * 鼠标指针不触发（桌面右键行为不受影响）；触发后紧随的 click 被抑制一次。
 */

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

function pointer(
  type: string,
  init: Partial<PointerEventInit> & { pointerType?: string } = {},
): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerType: 'touch',
    isPrimary: true,
    pointerId: 1,
    clientX: 0,
    clientY: 0,
    ...init,
  })
}

describe('useLongPress（工单 15）', () => {
  let host: HTMLDivElement
  let root: Root
  let events: LongPressPoint[]
  let api: ReturnType<typeof useLongPress> | null

  beforeEach(() => {
    vi.useFakeTimers()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    events = []
    api = null
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    vi.useRealTimers()
  })

  function Harness() {
    api = useLongPress((point) => events.push(point))
    return (
      <div {...api.handlers}>
        <span data-id="A">A</span>
      </div>
    )
  }

  async function render() {
    await act(async () => {
      root.render(<Harness />)
    })
  }

  function span() {
    return host.querySelector('[data-id="A"]')!
  }

  it('触摸主指针按下 500ms 触发，回调收到触点坐标与目标', async () => {
    await render()
    await act(async () => {
      span().dispatchEvent(pointer('pointerdown', { clientX: 12, clientY: 34 }))
    })
    expect(events).toHaveLength(0)
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    expect(events).toHaveLength(1)
    expect(events[0].x).toBe(12)
    expect(events[0].y).toBe(34)
    expect((events[0].target as Element).getAttribute('data-id')).toBe('A')
  })

  it('提前抬起不触发', async () => {
    await render()
    await act(async () => {
      span().dispatchEvent(pointer('pointerdown'))
    })
    await act(async () => {
      vi.advanceTimersByTime(200)
      span().dispatchEvent(pointer('pointerup'))
      vi.advanceTimersByTime(500)
    })
    expect(events).toHaveLength(0)
  })

  it('移动超过容差撤销（背景拖拽与长按共存）', async () => {
    await render()
    await act(async () => {
      span().dispatchEvent(pointer('pointerdown', { clientX: 0, clientY: 0 }))
      span().dispatchEvent(pointer('pointermove', { clientX: 40, clientY: 0 }))
    })
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    expect(events).toHaveLength(0)
  })

  it('小幅移动（容差内）仍触发', async () => {
    await render()
    await act(async () => {
      span().dispatchEvent(pointer('pointerdown', { clientX: 0, clientY: 0 }))
      span().dispatchEvent(pointer('pointermove', { clientX: 5, clientY: 4 }))
    })
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    expect(events).toHaveLength(1)
  })

  it('鼠标指针按下不触发（桌面行为不变）', async () => {
    await render()
    await act(async () => {
      span().dispatchEvent(pointer('pointerdown', { pointerType: 'mouse' }))
    })
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(events).toHaveLength(0)
  })

  it('pointercancel 撤销', async () => {
    await render()
    await act(async () => {
      span().dispatchEvent(pointer('pointerdown'))
      span().dispatchEvent(pointer('pointercancel'))
    })
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    expect(events).toHaveLength(0)
  })

  it('触发后紧随的 click 被抑制一次，第二次不抑制', async () => {
    await render()
    await act(async () => {
      span().dispatchEvent(pointer('pointerdown'))
      vi.advanceTimersByTime(500)
    })
    expect(events).toHaveLength(1)
    expect(api!.consumeSuppressedClick()).toBe(true)
    expect(api!.consumeSuppressedClick()).toBe(false)
  })
})
