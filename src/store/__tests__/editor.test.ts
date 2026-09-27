import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_DIAGRAM_SOURCE } from '../../lib/storage'
import { resetEditorHistory, useEditorStore } from '../editor'

/**
 * store 集成：撤销/重做以代码快照形式接入应用状态，
 * 连续代码输入按输入会话合并为一个快照。
 */
describe('editor store：快照栈接入', () => {
  beforeEach(() => {
    // happy-dom 的 localStorage 为空 → 初始源码为默认模板；重置历史栈
    window.localStorage?.clear()
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
  })

  it('离散编辑各自成为撤销步骤', () => {
    const { commitEdit } = useEditorStore.getState()
    commitEdit('v1')
    commitEdit('v2')
    expect(useEditorStore.getState().source).toBe('v2')
    expect(useEditorStore.getState().canUndo).toBe(true)
    useEditorStore.getState().undo()
    expect(useEditorStore.getState().source).toBe('v1')
    useEditorStore.getState().undo()
    expect(useEditorStore.getState().source).toBe(DEFAULT_DIAGRAM_SOURCE)
    expect(useEditorStore.getState().canUndo).toBe(false)
    useEditorStore.getState().redo()
    expect(useEditorStore.getState().source).toBe('v1')
  })

  it('连续输入在会话窗口内合并为一个撤销步骤', () => {
    const base = Date.now()
    const nowSpy = vi.spyOn(Date, 'now')
    try {
      // 模拟连续打字：每次间隔 200ms（< 1000ms 窗口）
      let t = base
      const { commitTypedSource } = useEditorStore.getState()
      const typed = ['A', 'AB', 'AB\n', 'AB\nC']
      for (const source of typed) {
        nowSpy.mockImplementation(() => t)
        commitTypedSource(source)
        t += 200
      }
      expect(useEditorStore.getState().source).toBe('AB\nC')
      useEditorStore.getState().undo()
      expect(useEditorStore.getState().source).toBe(DEFAULT_DIAGRAM_SOURCE)
    } finally {
      nowSpy.mockRestore()
    }
  })

  it('输入间隔超过会话窗口后开新撤销步骤', () => {
    const base = Date.now()
    const nowSpy = vi.spyOn(Date, 'now')
    try {
      let t = base
      const { commitTypedSource } = useEditorStore.getState()
      nowSpy.mockImplementation(() => t)
      commitTypedSource('第一段')
      t += 5000 // 超出 1000ms 会话窗口
      commitTypedSource('第一段\n第二段')
      useEditorStore.getState().undo()
      expect(useEditorStore.getState().source).toBe('第一段')
    } finally {
      nowSpy.mockRestore()
    }
  })
})

describe('editor store：commitIntent 表单意图落码', () => {
  beforeEach(() => {
    window.localStorage?.clear()
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
  })

  it('意图经管线落码并成为独立撤销步骤', () => {
    const source = DEFAULT_DIAGRAM_SOURCE
    const ok = useEditorStore.getState().commitIntent({ type: 'set-direction', direction: 'LR' })
    expect(ok).toBe(true)
    expect(useEditorStore.getState().source.startsWith('flowchart LR')).toBe(true)
    // 表单操作 = 离散快照：一次撤销即回到操作前
    useEditorStore.getState().undo()
    expect(useEditorStore.getState().source).toBe(source)
  })

  it('意图不可应用时返回 false 且源码不变', () => {
    const source = useEditorStore.getState().source
    const ok = useEditorStore.getState().commitIntent({ type: 'set-node-text', nodeId: '不存在', text: 'x' })
    expect(ok).toBe(false)
    expect(useEditorStore.getState().source).toBe(source)
  })

  it('select 更新选中状态', () => {
    useEditorStore.getState().select({ kind: 'node', nodeId: 'A' })
    expect(useEditorStore.getState().selection).toEqual({ kind: 'node', nodeId: 'A' })
  })
})
