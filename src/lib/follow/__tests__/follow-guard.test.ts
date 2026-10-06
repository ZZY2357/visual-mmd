import { describe, expect, it } from 'vitest'
import { createFollowGuard } from '../follow-guard'
import { useCursorHintStore } from '../hint-store'

describe('follow/follow-guard（工单 16：反馈循环守卫）', () => {
  it('默认非程序化；runProgrammatic 期间为程序化，退出后复原', () => {
    const guard = createFollowGuard()
    expect(guard.isProgrammatic()).toBe(false)
    guard.runProgrammatic(() => {
      expect(guard.isProgrammatic()).toBe(true)
    })
    expect(guard.isProgrammatic()).toBe(false)
  })

  it('嵌套 runProgrammatic 内层退出不提前解除外层标记', () => {
    const guard = createFollowGuard()
    guard.runProgrammatic(() => {
      guard.runProgrammatic(() => {})
      expect(guard.isProgrammatic()).toBe(true)
    })
    expect(guard.isProgrammatic()).toBe(false)
  })

  it('fn 抛错也保证解除标记（finally）', () => {
    const guard = createFollowGuard()
    expect(() =>
      guard.runProgrammatic(() => {
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(guard.isProgrammatic()).toBe(false)
  })
})

describe('follow/hint-store（工单 16）', () => {
  it('setHint 写入提示，值未变时不重复置位（同引用）', () => {
    const store = useCursorHintStore
    store.getState().setHint(null)
    store.getState().setHint({ kind: 'node', nodeId: 'A' })
    expect(store.getState().hint).toEqual({ kind: 'node', nodeId: 'A' })
    // 相同选中（不同对象但语义相等）不触发新状态对象
    const before = store.getState().hint
    store.getState().setHint({ kind: 'node', nodeId: 'A' })
    expect(store.getState().hint).toBe(before)
  })
})
