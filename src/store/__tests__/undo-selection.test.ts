import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetEditorHistory, useEditorStore } from '../editor'

/**
 * 工单 12：撤销/重做把选中随模型一并还原。
 * 连线身份是位置序（ADR-0012，不要求跨编辑稳定）；快照携带选中，
 * 使「undo 后选中回到操作前的元素」成为可验证的体验。
 *
 * 这些用例在改造前会失败：旧实现 undo/redo 只还原 source，选中状态原样不动
 * （删除类操作会先清空选中，撤销后选中丢失；会话内改选后撤销也回不到会话起点）。
 */

/** 一条含多条连线的 flowchart：便于按位置序选中某条连线 */
const EDGE_SOURCE = `flowchart TD
    A[开始] --> B{判断}
    B -- 是 --> C[结果]
    B -- 否 --> D[备选]
`

const EDGE = { kind: 'edge', from: 'B', to: 'C', occurrence: 1 } as const

describe('editor store：撤销快照携带选中（工单 12）', () => {
  beforeEach(() => {
    window.localStorage?.clear()
    resetEditorHistory(EDGE_SOURCE)
  })

  it('连线删除后撤销：选中回到被删的那条连线（不是被清空）', () => {
    const { select, commitIntent } = useEditorStore.getState()
    select(EDGE)
    // 属性面板删除连线成功后清空选中（既有行为）
    expect(commitIntent({ type: 'delete-edge', from: 'B', to: 'C', occurrence: 1 })).toBe(true)
    useEditorStore.getState().select(null)
    expect(useEditorStore.getState().selection).toBeNull()

    useEditorStore.getState().undo()
    // 源码还原（连线回来）且选中回到该连线
    expect(useEditorStore.getState().source).toContain('B -- 是 --> C')
    expect(useEditorStore.getState().selection).toEqual(EDGE)
  })

  it('节点删除后撤销：选中回到被删的那个节点', () => {
    const { select, commitIntent } = useEditorStore.getState()
    select({ kind: 'node', nodeId: 'C' })
    expect(commitIntent({ type: 'delete-node', nodeId: 'C' })).toBe(true)
    useEditorStore.getState().select(null)

    useEditorStore.getState().undo()
    expect(useEditorStore.getState().source).toContain('C[结果]')
    expect(useEditorStore.getState().selection).toEqual({ kind: 'node', nodeId: 'C' })
  })

  it('编辑后改选别的元素，撤销仍回到「操作前的选中」', () => {
    const { select, commitIntent } = useEditorStore.getState()
    select(EDGE)
    // 对选中的连线做编辑（改标签）：快照记下「操作前选中 = 该连线」
    expect(commitIntent({ type: 'set-edge-label', from: 'B', to: 'C', occurrence: 1, label: 'X' })).toBe(true)
    // 操作后用户又点了别的元素
    useEditorStore.getState().select({ kind: 'node', nodeId: 'A' })

    useEditorStore.getState().undo()
    // 撤销回编辑前：选中回到当时被操作的连线
    expect(useEditorStore.getState().selection).toEqual(EDGE)
  })

  it('撤销后重做：选中回到重做目标状态时的选中', () => {
    const { select, commitIntent } = useEditorStore.getState()
    select(EDGE)
    expect(commitIntent({ type: 'set-edge-label', from: 'B', to: 'C', occurrence: 1, label: 'X' })).toBe(true)
    useEditorStore.getState().undo()
    expect(useEditorStore.getState().selection).toEqual(EDGE)
    // 重做：回到编辑后的源码，选中为编辑当时的选中
    useEditorStore.getState().redo()
    expect(useEditorStore.getState().source).toContain('B -- X --> C')
    expect(useEditorStore.getState().selection).toEqual(EDGE)
  })

  it('连续输入合并会话：撤销回到会话开始时的选中（含会话中改选）', () => {
    const base = Date.now()
    const nowSpy = vi.spyOn(Date, 'now')
    try {
      let t = base
      nowSpy.mockImplementation(() => t)
      const { select, commitTypedSource } = useEditorStore.getState()
      // 会话开始前选中连线
      select(EDGE)
      commitTypedSource(EDGE_SOURCE + '    X --> Y\n')
      t += 200
      commitTypedSource(EDGE_SOURCE + '    X --> Y\n    Y --> Z\n')
      // 会话进行中用户改选了节点（amend 当前快照，不产生新撤销步骤）
      useEditorStore.getState().select({ kind: 'node', nodeId: 'A' })
      t += 200
      commitTypedSource(EDGE_SOURCE + '    X --> Y\n    Y --> Z\n    Z --> W\n')
      expect(useEditorStore.getState().selection).toEqual({ kind: 'node', nodeId: 'A' })

      // 一个会话 = 一步撤销：源码回到会话前，选中回到会话开始时的连线
      useEditorStore.getState().undo()
      expect(useEditorStore.getState().source).toBe(EDGE_SOURCE)
      expect(useEditorStore.getState().selection).toEqual(EDGE)
    } finally {
      nowSpy.mockRestore()
    }
  })
})

describe('editor store：编辑器换装仍清空选中（工单 12 不回退既有语义）', () => {
  beforeEach(() => {
    window.localStorage?.clear()
    resetEditorHistory(EDGE_SOURCE)
  })

  it('resetEditorHistory 清空选中并丢弃历史', () => {
    useEditorStore.getState().select(EDGE)
    resetEditorHistory(EDGE_SOURCE)
    const s = useEditorStore.getState()
    expect(s.selection).toEqual({ kind: 'diagram' })
    expect(s.canUndo).toBe(false)
  })
})
