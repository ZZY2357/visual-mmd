import { describe, expect, it } from 'vitest'
import { SnapshotStack } from '../snapshot-stack'

function fixedNow(): () => number {
  let t = 0
  return () => t
}

describe('SnapshotStack：代码快照单栈', () => {
  it('离散编辑每次入栈，undo/redo 逐级回退', () => {
    const stack = new SnapshotStack('v0')
    stack.commit('v1')
    stack.commit('v2')
    expect(stack.current).toBe('v2')
    expect(stack.canUndo).toBe(true)
    expect(stack.canRedo).toBe(false)
    expect(stack.undo()).toBe('v1')
    expect(stack.undo()).toBe('v0')
    expect(stack.undo()).toBeNull()
    expect(stack.canUndo).toBe(false)
    expect(stack.redo()).toBe('v1')
    expect(stack.redo()).toBe('v2')
    expect(stack.redo()).toBeNull()
  })

  it('连续输入（coalesce）在会话窗口内合并为一个撤销步骤', () => {
    const now = fixedNow() // 时钟不动：所有提交都在窗口内
    const stack = new SnapshotStack('v0', { now, coalesceMs: 1000 })
    stack.commit('v2', { coalesce: true })
    stack.commit('v3', { coalesce: true })
    expect(stack.current).toBe('v3')
    expect(stack.undo()).toBe('v0') // 一个会话只算一步
    expect(stack.undo()).toBeNull()
    expect(stack.redo()).toBe('v3')
  })

  it('会话窗口超时后，下一次输入开新撤销步骤', () => {
    let t = 0
    const stack = new SnapshotStack('v0', { now: () => t, coalesceMs: 1000 })
    stack.commit('v1', { coalesce: true })
    t = 500
    stack.commit('v2', { coalesce: true })
    t = 1600 // 距上次提交超过窗口
    stack.commit('v3', { coalesce: true })
    expect(stack.undo()).toBe('v2')
    expect(stack.undo()).toBe('v0')
  })

  it('离散编辑打断合并会话', () => {
    let t = 0
    const stack = new SnapshotStack('v0', { now: () => t, coalesceMs: 1000 })
    stack.commit('v1', { coalesce: true })
    stack.commit('v2') // 离散
    stack.commit('v3', { coalesce: true })
    expect(stack.undo()).toBe('v2')
    expect(stack.undo()).toBe('v1')
    expect(stack.undo()).toBe('v0')
  })

  it('undo 之后 commit 丢弃重做分支', () => {
    const stack = new SnapshotStack('v0')
    stack.commit('v1')
    stack.undo()
    expect(stack.canRedo).toBe(true)
    stack.commit('v1-b')
    expect(stack.canRedo).toBe(false)
    expect(stack.redo()).toBeNull()
  })

  it('相同内容提交不产生快照', () => {
    const stack = new SnapshotStack('v0')
    stack.commit('v0')
    expect(stack.canUndo).toBe(false)
  })

  it('超过历史深度上限时丢弃最旧快照', () => {
    const stack = new SnapshotStack('v0', { maxDepth: 2 })
    stack.commit('v1')
    stack.commit('v2')
    stack.commit('v3')
    expect(stack.canUndo).toBe(true)
    expect(stack.undo()).toBe('v2')
    expect(stack.undo()).toBe('v1')
    expect(stack.undo()).toBeNull()
  })
})
