import { describe, expect, it } from 'vitest'
import { SnapshotStack } from '../snapshot-stack'

function fixedNow(): () => number {
  const t = 0
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
    const t = 0
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

describe('SnapshotStack：泛型载荷（工单 12 撤销快照携带选中）', () => {
  interface Payload {
    source: string
    selection: string | null
  }
  const equals = (a: Payload, b: Payload) =>
    a.source === b.source && a.selection === b.selection

  it('undo/redo 连同载荷（source + selection）一并还原', () => {
    const stack = new SnapshotStack<Payload>(
      { source: 'v0', selection: null },
      { equals },
    )
    stack.commit({ source: 'v1', selection: 'node:A' })
    stack.commit({ source: 'v2', selection: 'node:B' })
    expect(stack.undo()).toEqual({ source: 'v1', selection: 'node:A' })
    expect(stack.undo()).toEqual({ source: 'v0', selection: null })
    expect(stack.redo()).toEqual({ source: 'v1', selection: 'node:A' })
  })

  it('amend 只更新当前载荷的选中，不产生撤销步骤也不丢重做分支', () => {
    const stack = new SnapshotStack<Payload>(
      { source: 'v0', selection: null },
      { equals },
    )
    stack.commit({ source: 'v1', selection: null })
    stack.undo() // 现在 current = v0，future = [v1]
    expect(stack.canRedo).toBe(true)
    stack.amend({ source: 'v0', selection: 'edge:0' })
    expect(stack.canRedo).toBe(true) // 重做分支保留
    expect(stack.canUndo).toBe(false) // 没多出历史
    expect(stack.current).toEqual({ source: 'v0', selection: 'edge:0' })
    expect(stack.redo()).toEqual({ source: 'v1', selection: null })
  })

  it('coalesce 会话合并时，撤销回到会话开始前的载荷（含选中）', () => {
    const now = fixedNow()
    const stack = new SnapshotStack<Payload>(
      { source: 'v0', selection: 'edge:0' },
      { now, coalesceMs: 1000, equals },
    )
    stack.commit({ source: 'v1', selection: 'edge:0' }, { coalesce: true })
    stack.commit({ source: 'v2', selection: 'edge:0' }, { coalesce: true })
    expect(stack.undo()).toEqual({ source: 'v0', selection: 'edge:0' })
  })

  it('自定义 equals：仅选中不同也算新快照', () => {
    const stack = new SnapshotStack<Payload>(
      { source: 'v0', selection: null },
      { equals },
    )
    stack.commit({ source: 'v0', selection: 'node:A' })
    expect(stack.canUndo).toBe(true)
    expect(stack.undo()).toEqual({ source: 'v0', selection: null })
  })
})
