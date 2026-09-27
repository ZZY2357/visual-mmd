import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_DIAGRAM_SOURCE } from '../../lib/storage'
import { DIAGRAM_TYPES } from '../../lib/diagram-registry'
import { DIAGRAM_SELECTION } from '../../lib/projection/flowchart-projection'
import { bootstrapEditorLibrary, useEditorStore } from '../editor'
import { saveLibrary } from '../../lib/library-storage'

/**
 * 图表库（工单 09）：多文档状态与活跃图表切换。
 * 切换图表时编辑器完整换装：源码、撤销栈、选中状态全部清空/切换。
 */

class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  clear() {
    this.map.clear()
  }
  getItem(key: string) {
    return this.map.get(key) ?? null
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null
  }
  removeItem(key: string) {
    this.map.delete(key)
  }
  setItem(key: string, value: string) {
    this.map.set(key, value)
  }
}

const storage = new MemoryStorage()

function reset(): void {
  storage.clear()
  bootstrapEditorLibrary(storage)
}

describe('bootstrapEditorLibrary（启动引导）', () => {
  beforeEach(reset)

  it('空 localStorage：以默认模板建一张起步图表并设为活跃', () => {
    const { diagrams, activeId, source } = useEditorStore.getState()
    expect(diagrams).toHaveLength(1)
    expect(activeId).toBe(diagrams[0]?.id ?? null)
    expect(source).toBe(DEFAULT_DIAGRAM_SOURCE)
  })

  it('localStorage 已有图表库：恢复库与最近打开的图表', () => {
    saveLibrary(
      {
        diagrams: [
          { id: 'a', name: '甲', source: 'flowchart TD\n    A --> B\n', savedAt: 1 },
          { id: 'b', name: '乙', source: 'sequenceDiagram\n    A->>B: hi\n', savedAt: 2 },
        ],
        activeId: 'b',
      },
      storage,
    )
    bootstrapEditorLibrary(storage)
    const { diagrams, activeId, source } = useEditorStore.getState()
    expect(diagrams).toHaveLength(2)
    expect(activeId).toBe('b')
    expect(source).toBe('sequenceDiagram\n    A->>B: hi\n')
  })
})

describe('图表库操作：新建 / 重命名 / 复制 / 删除', () => {
  beforeEach(reset)

  it('新建按类型模板起步并切换为活跃图表，重名自动编号', () => {
    const store = useEditorStore.getState()
    store.newDiagram('sequence', '时序图')
    let s = useEditorStore.getState()
    expect(s.source).toBe(DIAGRAM_TYPES.sequence.template)
    expect(s.diagrams).toHaveLength(2)
    expect(s.diagrams[1]?.name).toBe('时序图')
    store.newDiagram('sequence', '时序图')
    s = useEditorStore.getState()
    expect(s.diagrams[2]?.name).toBe('时序图 2')
    expect(s.activeId).toBe(s.diagrams[2]?.id ?? null)
  })

  it('重命名更新库中对应图表（去空白；空名忽略）', () => {
    const id = useEditorStore.getState().diagrams[0]?.id ?? ''
    useEditorStore.getState().renameDiagram(id, '  我的图  ')
    expect(useEditorStore.getState().diagrams[0]?.name).toBe('我的图')
    useEditorStore.getState().renameDiagram(id, '   ')
    expect(useEditorStore.getState().diagrams[0]?.name).toBe('我的图')
  })

  it('复制图表得到独立副本（同名加"副本"）并切换为活跃', () => {
    const s0 = useEditorStore.getState()
    const origin = s0.diagrams[0]!
    s0.commitEdit('flowchart TD\n    X --> Y\n')
    useEditorStore.getState().duplicateDiagram(origin.id)
    const s1 = useEditorStore.getState()
    const copy = s1.diagrams[1]!
    expect(copy.id).not.toBe(origin.id)
    expect(copy.name).toBe('未命名图表 副本')
    expect(copy.source).toBe('flowchart TD\n    X --> Y\n')
    expect(s1.activeId).toBe(copy.id)
    // 编辑副本不影响原图
    useEditorStore.getState().commitEdit('flowchart TD\n    Z\n')
    expect(useEditorStore.getState().diagrams[0]?.source).toBe('flowchart TD\n    X --> Y\n')
    expect(useEditorStore.getState().diagrams[1]?.source).toBe('flowchart TD\n    Z\n')
  })

  it('删除非活跃图表不影响活跃图表', () => {
    const s0 = useEditorStore.getState()
    s0.newDiagram('class', '类图')
    const first = useEditorStore.getState().diagrams[0]!
    const activeBefore = useEditorStore.getState().activeId
    useEditorStore.getState().deleteDiagram(first.id)
    const s1 = useEditorStore.getState()
    expect(s1.diagrams).toHaveLength(1)
    expect(s1.activeId).toBe(activeBefore)
  })

  it('删除活跃图表时切换到剩余第一张；删空后进入空状态', () => {
    const s0 = useEditorStore.getState()
    s0.newDiagram('mindmap', '思维导图')
    const second = useEditorStore.getState().diagrams[1]!
    useEditorStore.getState().deleteDiagram(second.id)
    let s1 = useEditorStore.getState()
    expect(s1.activeId).toBe(s1.diagrams[0]?.id ?? null)
    expect(s1.source).toBe(DEFAULT_DIAGRAM_SOURCE)
    useEditorStore.getState().deleteDiagram(s1.diagrams[0]!.id)
    s1 = useEditorStore.getState()
    expect(s1.diagrams).toHaveLength(0)
    expect(s1.activeId).toBeNull()
    expect(s1.source).toBe('')
  })
})

describe('切换图表：编辑器完整换装，无残留状态', () => {
  beforeEach(reset)

  it('切换后源码、撤销栈、选中状态全部切换', () => {
    const s0 = useEditorStore.getState()
    // 在第一张图上积累撤销历史与选中状态
    s0.commitEdit('flowchart TD\n    A --> B\n')
    s0.commitEdit('flowchart TD\n    A --> B --> C\n')
    s0.select({ kind: 'node', nodeId: 'A' })
    expect(useEditorStore.getState().canUndo).toBe(true)

    s0.newDiagram('sequence', '时序图')
    const seq = useEditorStore.getState()
    expect(seq.source).toBe(DIAGRAM_TYPES.sequence.template)
    expect(seq.canUndo).toBe(false)
    expect(seq.canRedo).toBe(false)
    expect(seq.selection).toEqual(DIAGRAM_SELECTION)

    // 新图上的撤销栈独立：编辑后撤销回到新图模板，而不是第一张图的内容
    useEditorStore.getState().commitEdit(DIAGRAM_TYPES.sequence.template + '    A->>B: x\n')
    useEditorStore.getState().undo()
    expect(useEditorStore.getState().source).toBe(DIAGRAM_TYPES.sequence.template)

    // 切回第一张图：源码恢复，撤销栈重新开始（不残留新图历史）
    const firstId = useEditorStore.getState().diagrams[0]!.id
    useEditorStore.getState().openDiagram(firstId)
    const back = useEditorStore.getState()
    expect(back.source).toBe('flowchart TD\n    A --> B --> C\n')
    expect(back.canUndo).toBe(false)
    expect(back.selection).toEqual(DIAGRAM_SELECTION)
    expect(back.gotoLine).toBeNull()
  })

  it('打开同一张图表或未知 id 时状态不变', () => {
    const s0 = useEditorStore.getState()
    const activeId = s0.activeId
    s0.openDiagram(activeId!)
    s0.openDiagram('ghost')
    const s1 = useEditorStore.getState()
    expect(s1.activeId).toBe(activeId)
    expect(s1.source).toBe(DEFAULT_DIAGRAM_SOURCE)
  })
})

describe('多文档编辑与持久化数据一致性', () => {
  beforeEach(reset)

  it('commit 只更新活跃图表，其余图表源码不受影响', () => {
    const s0 = useEditorStore.getState()
    s0.newDiagram('flowchart', '第二张')
    useEditorStore.getState().commitEdit('flowchart LR\n    A --> B\n')
    const s1 = useEditorStore.getState()
    expect(s1.diagrams[0]?.source).toBe(DEFAULT_DIAGRAM_SOURCE)
    expect(s1.diagrams[1]?.source).toBe('flowchart LR\n    A --> B\n')
    expect(s1.source).toBe('flowchart LR\n    A --> B\n')
  })

  it('替换图表库（模拟刷新恢复）：源码与活跃 id 一致切换', () => {
    useEditorStore.getState().replaceLibrary({
      diagrams: [{ id: 'x', name: '外部的图', source: 'mindmap\n  root((A))\n', savedAt: 9 }],
      activeId: null,
    })
    const s = useEditorStore.getState()
    expect(s.activeId).toBe('x')
    expect(s.source).toBe('mindmap\n  root((A))\n')
    expect(s.canUndo).toBe(false)
  })
})
