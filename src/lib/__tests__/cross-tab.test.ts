import { describe, expect, it } from 'vitest'
import { LIBRARY_STORAGE_KEY } from '../library-storage'
import {
  decideCrossTabAction,
  detectRemoteChange,
  parseLibraryValue,
  type CrossTabContext,
} from '../cross-tab'

/**
 * 跨标签页修改识别（工单 11）：纯函数层。
 * 用字符串构造 storage 事件负载（真实浏览器里由他页写入产生），无需 DOM。
 */

const ACTIVE = 'd1'

function libraryValue(
  diagrams: Array<{ id: string; source: string; savedAt?: number }>,
  activeId: string | null = ACTIVE,
): string {
  return JSON.stringify({
    version: 2,
    activeId,
    diagrams: diagrams.map((d) => ({
      id: d.id,
      name: d.id,
      source: d.source,
      savedAt: d.savedAt ?? 0,
    })),
  })
}

function event(newValue: string | null, key: string = LIBRARY_STORAGE_KEY) {
  return { key, newValue }
}

const context: CrossTabContext = { activeId: ACTIVE, source: 'flowchart TD\n  A --> B\n', hasUnfinishedInput: false }

describe('parseLibraryValue', () => {
  it('解析带版本号的图表库记录', () => {
    const lib = parseLibraryValue(libraryValue([{ id: ACTIVE, source: 'x' }]))
    expect(lib?.diagrams).toHaveLength(1)
  })

  it('旧版（无 version 字段）记录经迁移仍可解析（复用工单 07 链路）', () => {
    const raw = JSON.stringify({ activeId: ACTIVE, diagrams: [{ id: ACTIVE, name: 'n', source: 'x' }] })
    expect(parseLibraryValue(raw)?.diagrams[0]?.source).toBe('x')
  })

  it('null（被清除）与损坏内容返回 null', () => {
    expect(parseLibraryValue(null)).toBeNull()
    expect(parseLibraryValue('{not json')).toBeNull()
    expect(parseLibraryValue('{"diagrams": "nope"}')).toBeNull()
  })
})

describe('detectRemoteChange', () => {
  it('他页改动当前活跃图表 → 识别出变更', () => {
    const change = detectRemoteChange(
      event(libraryValue([{ id: ACTIVE, source: 'flowchart TD\n  A --> C\n', savedAt: 42 }])),
      context,
    )
    expect(change).toEqual({ diagramId: ACTIVE, source: 'flowchart TD\n  A --> C\n', savedAt: 42 })
  })

  it('非本库 key → 忽略', () => {
    expect(detectRemoteChange(event(libraryValue([{ id: ACTIVE, source: 'y' }]), 'other:key'), context)).toBeNull()
  })

  it('他页改的是别的图 → 忽略', () => {
    expect(
      detectRemoteChange(event(libraryValue([{ id: 'd2', source: 'y' }])), context),
    ).toBeNull()
  })

  it('源码未变（仅重命名 / 切页）→ 忽略', () => {
    const same = libraryValue([{ id: ACTIVE, source: context.source }])
    expect(detectRemoteChange(event(same), context)).toBeNull()
  })

  it('本页无活跃图表 → 忽略', () => {
    expect(
      detectRemoteChange(event(libraryValue([{ id: ACTIVE, source: 'y' }])), { activeId: null, source: '' }),
    ).toBeNull()
  })

  it('他页删除了当前图表 → 忽略（不误报源码变更）', () => {
    expect(detectRemoteChange(event(libraryValue([{ id: 'd2', source: 'y' }])), context)).toBeNull()
  })
})

describe('decideCrossTabAction', () => {
  const changed = event(libraryValue([{ id: ACTIVE, source: 'changed\n' }]))

  it('有未完成输入 → 始终弹提示，绝不自动载入（工单 09 语义）', () => {
    const decision = decideCrossTabAction(
      changed,
      { ...context, hasUnfinishedInput: true },
      { autoLoadWhenIdle: true },
    )
    expect(decision.kind).toBe('notice')
  })

  it('无未完成输入且未开启自动载入（默认）→ 弹提示', () => {
    expect(decideCrossTabAction(changed, context).kind).toBe('notice')
  })

  it('无未完成输入且显式开启自动载入 → auto-load', () => {
    const decision = decideCrossTabAction(changed, context, { autoLoadWhenIdle: true })
    expect(decision.kind).toBe('auto-load')
  })

  it('无变更 → ignore', () => {
    const unchanged = event(libraryValue([{ id: ACTIVE, source: context.source }]))
    expect(decideCrossTabAction(unchanged, context).kind).toBe('ignore')
  })
})
