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

describe('editor store：LWW 打字中挂起外部写回（工单 09）', () => {
  beforeEach(() => {
    window.localStorage?.clear()
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
    useEditorStore.setState({ hasUnfinishedInput: false, pendingWriteback: null })
  })

  it('打字中表单意图被挂起：源码不变、pendingWriteback 记录外部版本', () => {
    const s = useEditorStore.getState()
    s.commitTypedSource(DEFAULT_DIAGRAM_SOURCE + '    X --> Y\n')
    expect(useEditorStore.getState().hasUnfinishedInput).toBe(true)

    const ok = useEditorStore.getState().commitIntent({ type: 'set-direction', direction: 'LR' })
    expect(ok).toBe(true)
    // 表单写回被挂起：源码仍是打字内容，未被静默覆盖
    expect(useEditorStore.getState().source).toBe(DEFAULT_DIAGRAM_SOURCE + '    X --> Y\n')
    const pending = useEditorStore.getState().pendingWriteback
    expect(pending).not.toBeNull()
    expect(pending?.origin).toBe('form')
    expect(pending?.source.startsWith('flowchart LR')).toBe(true)
  })

  it('打字中画布意图被挂起：来源标记为 canvas', () => {
    useEditorStore.getState().commitTypedSource(DEFAULT_DIAGRAM_SOURCE + '    X --> Y\n')
    const ok = useEditorStore.getState().commitIntents(
      [{ type: 'set-direction', direction: 'LR' }],
      'canvas',
    )
    expect(ok).toBe(true)
    expect(useEditorStore.getState().pendingWriteback?.origin).toBe('canvas')
    // 画布写回同样被挂起：打字内容未被覆盖
    expect(useEditorStore.getState().source).toContain('X --> Y')
    expect(useEditorStore.getState().source.startsWith('flowchart TD')).toBe(true)
  })

  it('代码面板来源（code-panel）与 system 永不挂起', () => {
    useEditorStore.getState().commitTypedSource(DEFAULT_DIAGRAM_SOURCE + '    X --> Y\n')
    // code-panel：直接提交（例如程序化回写）
    useEditorStore.getState().commitEdit('v-code', 'code-panel')
    expect(useEditorStore.getState().source).toBe('v-code')
    expect(useEditorStore.getState().pendingWriteback).toBeNull()
    // system：导入等显式动作也直接提交
    useEditorStore.getState().commitEdit('v-system', 'system')
    expect(useEditorStore.getState().source).toBe('v-system')
    expect(useEditorStore.getState().pendingWriteback).toBeNull()
  })

  it('输入完成（失焦）不自动应用挂起写回：仍待用户选择', () => {
    useEditorStore.getState().commitTypedSource(DEFAULT_DIAGRAM_SOURCE + '    X --> Y\n')
    useEditorStore.getState().commitIntent({ type: 'set-direction', direction: 'LR' })
    useEditorStore.getState().markInputFinished()
    expect(useEditorStore.getState().hasUnfinishedInput).toBe(false)
    // 挂起仍在，源码未被外部版本替换
    expect(useEditorStore.getState().pendingWriteback).not.toBeNull()
    expect(useEditorStore.getState().source).toBe(DEFAULT_DIAGRAM_SOURCE + '    X --> Y\n')
  })

  it('接受外部变更：以外部版本替换源码（可撤销），清空挂起', () => {
    useEditorStore.getState().commitTypedSource(DEFAULT_DIAGRAM_SOURCE + '    X --> Y\n')
    useEditorStore.getState().commitIntent({ type: 'set-direction', direction: 'LR' })
    const external = useEditorStore.getState().pendingWriteback?.source ?? ''

    useEditorStore.getState().acceptPendingWriteback()
    expect(useEditorStore.getState().source).toBe(external)
    expect(useEditorStore.getState().pendingWriteback).toBeNull()
    expect(useEditorStore.getState().hasUnfinishedInput).toBe(false)
    // 接受是一次可撤销编辑
    useEditorStore.getState().undo()
    expect(useEditorStore.getState().source).toBe(DEFAULT_DIAGRAM_SOURCE + '    X --> Y\n')
  })

  it('放弃外部变更：丢弃外部版本，本页源码获胜（LWW），清空挂起', () => {
    useEditorStore.getState().commitTypedSource(DEFAULT_DIAGRAM_SOURCE + '    X --> Y\n')
    useEditorStore.getState().commitIntent({ type: 'set-direction', direction: 'LR' })

    useEditorStore.getState().discardPendingWriteback()
    expect(useEditorStore.getState().source).toBe(DEFAULT_DIAGRAM_SOURCE + '    X --> Y\n')
    expect(useEditorStore.getState().pendingWriteback).toBeNull()
    expect(useEditorStore.getState().hasUnfinishedInput).toBe(false)
  })

  it('多个挂起写回只保留最新一条（含此前外部变更的累积）', () => {
    useEditorStore.getState().commitTypedSource(DEFAULT_DIAGRAM_SOURCE + '    X --> Y\n')
    useEditorStore.getState().commitIntent({ type: 'set-direction', direction: 'LR' })
    useEditorStore.getState().commitIntent({ type: 'set-theme', theme: 'dark' })
    const pending = useEditorStore.getState().pendingWriteback
    expect(pending).not.toBeNull()
    // 最新一条在挂起源码之上继续累积：既有方向改动，也有主题改动
    expect(pending?.source).toContain('flowchart LR')
    expect(pending?.source).toContain('theme: dark')
  })

  it('切换图表清空挂起写回与未完成输入', () => {
    useEditorStore.setState({
      diagrams: [
        { id: 'a', name: 'A', source: DEFAULT_DIAGRAM_SOURCE, savedAt: 1 },
        { id: 'b', name: 'B', source: 'flowchart LR\n  P --> Q\n', savedAt: 1 },
      ],
      activeId: 'a',
      source: DEFAULT_DIAGRAM_SOURCE,
    })
    useEditorStore.getState().commitTypedSource(DEFAULT_DIAGRAM_SOURCE + '    X --> Y\n')
    useEditorStore.getState().commitIntent({ type: 'set-direction', direction: 'LR' })
    expect(useEditorStore.getState().pendingWriteback).not.toBeNull()

    useEditorStore.getState().openDiagram('b')
    expect(useEditorStore.getState().pendingWriteback).toBeNull()
    expect(useEditorStore.getState().hasUnfinishedInput).toBe(false)
    expect(useEditorStore.getState().source).toBe('flowchart LR\n  P --> Q\n')
  })
})
