import { act, useEffect, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import mermaid from 'mermaid'
import { ERROR_NOTICE_DELAY_MS, useMermaidPreview, type MermaidPreview } from '../use-mermaid-preview'

/**
 * 工单 13 last good render：useMermaidPreview 的渲染失败语义。
 * - 失败不换 svg（保留上一次合法渲染）
 * - error 即时（代码面板用）；errorNotice 去抖（画布角标用）
 * - 修正（成功渲染）→ errorNotice 立即清空
 * - 去抖窗口内连续失败只浮出一份角标（只发生一次 null→非 null 跃迁）
 * mermaid 整体 mock 掉：这里测的是 hook 的状态机，不测 mermaid 本身。
 */

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    parse: vi.fn(),
    render: vi.fn(),
    registerExternalDiagrams: vi.fn(),
  },
}))

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const mocked = mermaid as unknown as {
  parse: ReturnType<typeof vi.fn>
  render: ReturnType<typeof vi.fn>
}

interface HarnessProps {
  source: string
  onState: (state: MermaidPreview) => void
}

function Harness({ source, onState }: HarnessProps): ReactNode {
  const preview = useMermaidPreview(source)
  useEffect(() => {
    onState(preview)
  })
  return null
}

describe('useMermaidPreview（工单 13 last good render）', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    mocked.parse.mockReset()
    mocked.render.mockReset()
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  /** 渲染一次源码并收集 hook 每次产出的状态快照 */
  async function renderSource(
    source: string,
    snapshots: MermaidPreview[],
  ): Promise<void> {
    await act(async () => {
      root.render(<Harness source={source} onState={(s) => snapshots.push(s)} />)
    })
  }

  it('成功渲染 → svg 更新，error 与 errorNotice 均为 null', async () => {
    mocked.parse.mockResolvedValue(undefined)
    mocked.render.mockResolvedValue({ svg: '<svg>GOOD</svg>' })
    const snaps: MermaidPreview[] = []
    await renderSource('flowchart TD\n  A-->B', snaps)

    const last = snaps[snaps.length - 1]
    expect(last.svg).toBe('<svg>GOOD</svg>')
    expect(last.error).toBeNull()
    expect(last.errorNotice).toBeNull()
    expect(last.rendering).toBe(false)
  })

  it('渲染失败 → 保留上一次合法 svg，error 即时置位', async () => {
    mocked.parse.mockResolvedValue(undefined)
    mocked.render.mockResolvedValue({ svg: '<svg>GOOD</svg>' })
    const snaps: MermaidPreview[] = []
    await renderSource('flowchart TD\n  A-->B', snaps)

    mocked.parse.mockRejectedValue(new Error('Parse error on line 2: unexpected'))
    await renderSource('flowchart TD\n  A-->', snaps)

    const last = snaps[snaps.length - 1]
    expect(last.svg).toBe('<svg>GOOD</svg>')
    expect(last.error?.message).toContain('Parse error')
    expect(last.error?.line).toBe(2)
    // 去抖未到，角标还没浮出
    expect(last.errorNotice).toBeNull()
  })

  it('失败持续超过去抖窗口 → 浮出一份 errorNotice（携带最新错误）', async () => {
    mocked.parse.mockResolvedValue(undefined)
    mocked.render.mockResolvedValue({ svg: '<svg>GOOD</svg>' })
    const snaps: MermaidPreview[] = []
    await renderSource('flowchart TD\n  A-->B', snaps)

    mocked.parse.mockRejectedValue(new Error('Parse error on line 3: bad'))
    await renderSource('flowchart TD\n  A-->', snaps)
    await act(async () => {
      vi.advanceTimersByTime(ERROR_NOTICE_DELAY_MS)
    })

    const last = snaps[snaps.length - 1]
    expect(last.errorNotice?.line).toBe(3)
    expect(last.svg).toBe('<svg>GOOD</svg>')
  })

  it('修正后成功渲染 → errorNotice 立即清空（画布自动恢复）', async () => {
    mocked.parse.mockResolvedValue(undefined)
    mocked.render.mockResolvedValue({ svg: '<svg>GOOD</svg>' })
    const snaps: MermaidPreview[] = []
    await renderSource('flowchart TD\n  A-->B', snaps)

    mocked.parse.mockRejectedValue(new Error('Parse error on line 2: bad'))
    await renderSource('flowchart TD\n  A-->', snaps)
    await act(async () => {
      vi.advanceTimersByTime(ERROR_NOTICE_DELAY_MS)
    })
    expect(snaps[snaps.length - 1].errorNotice).not.toBeNull()

    mocked.parse.mockResolvedValue(undefined)
    mocked.render.mockResolvedValue({ svg: '<svg>FIXED</svg>' })
    await renderSource('flowchart TD\n  A-->B', snaps)

    const last = snaps[snaps.length - 1]
    expect(last.svg).toBe('<svg>FIXED</svg>')
    expect(last.error).toBeNull()
    expect(last.errorNotice).toBeNull()
  })

  it('去抖窗口内连续失败 → 只浮出一份 errorNotice（一次 null→非 null 跃迁）', async () => {
    mocked.parse.mockResolvedValue(undefined)
    mocked.render.mockResolvedValue({ svg: '<svg>GOOD</svg>' })
    const snaps: MermaidPreview[] = []
    await renderSource('flowchart TD\n  A-->B', snaps)

    mocked.parse.mockRejectedValue(new Error('Parse error on line 2: bad'))
    // 连续三次失败，每次都在去抖窗口内（不推进时钟）
    await renderSource('flowchart TD\n  A--', snaps)
    await renderSource('flowchart TD\n  A-', snaps)
    await renderSource('flowchart TD\n  A', snaps)

    // 窗口内没有任何 errorNotice
    expect(snaps.every((s) => s.errorNotice === null)).toBe(true)

    await act(async () => {
      vi.advanceTimersByTime(ERROR_NOTICE_DELAY_MS)
    })

    // 统计 errorNotice 从 null 变非 null 的跃迁次数 —— 恰好一次
    let rises = 0
    let prev: MermaidPreview['errorNotice'] = null
    for (const s of snaps) {
      if (prev === null && s.errorNotice !== null) rises += 1
      prev = s.errorNotice
    }
    expect(rises).toBe(1)
    expect(snaps[snaps.length - 1].errorNotice?.message).toContain('Parse error')
  })
})
