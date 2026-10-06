import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_DIAGRAM_SOURCE } from '../../lib/storage'
import { DIAGRAM_TYPES } from '../../lib/diagram-registry'
import { DIAGRAM_SELECTION } from '../../lib/projection/flowchart-projection'
import { SAMPLE_DIAGRAMS } from '../../lib/sample-library'
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

/**
 * 多数库操作测试需要稳定的「一张起步图」基线；首启动示例播种（工单 17）
 * 会预置多张图，故这里显式写入一张图再引导，把播种行为留给专门的用例覆盖。
 */
function reset(): void {
  storage.clear()
  saveLibrary(
    {
      diagrams: [{ id: 'seed', name: '未命名图表', source: DEFAULT_DIAGRAM_SOURCE, savedAt: 0 }],
      activeId: null,
    },
    storage,
  )
  bootstrapEditorLibrary(storage)
}

describe('bootstrapEditorLibrary（启动引导）', () => {
  it('真·首次启动（空 localStorage）：预置示例图表库并设为活跃（工单 17）', () => {
    storage.clear()
    bootstrapEditorLibrary(storage)
    const { diagrams, activeId, source } = useEditorStore.getState()
    expect(diagrams).toHaveLength(SAMPLE_DIAGRAMS.length)
    expect(activeId).toBe(diagrams[0]?.id ?? null)
    expect(source).toBe(SAMPLE_DIAGRAMS[0]?.source ?? '')
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
    const origin = s0.diagrams[0]
    s0.commitEdit('flowchart TD\n    X --> Y\n')
    useEditorStore.getState().duplicateDiagram(origin.id)
    const s1 = useEditorStore.getState()
    const copy = s1.diagrams[1]
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
    const first = useEditorStore.getState().diagrams[0]
    const activeBefore = useEditorStore.getState().activeId
    useEditorStore.getState().deleteDiagram(first.id)
    const s1 = useEditorStore.getState()
    expect(s1.diagrams).toHaveLength(1)
    expect(s1.activeId).toBe(activeBefore)
  })

  it('删除活跃图表时切换到剩余第一张；删空后进入空状态', () => {
    const s0 = useEditorStore.getState()
    s0.newDiagram('mindmap', '思维导图')
    const second = useEditorStore.getState().diagrams[1]
    useEditorStore.getState().deleteDiagram(second.id)
    let s1 = useEditorStore.getState()
    expect(s1.activeId).toBe(s1.diagrams[0]?.id ?? null)
    expect(s1.source).toBe(DEFAULT_DIAGRAM_SOURCE)
    useEditorStore.getState().deleteDiagram(s1.diagrams[0].id)
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
    const firstId = useEditorStore.getState().diagrams[0].id
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

/** 可开关写入失败的存储：setItem 抛异常模拟 quota 满 / 隐私模式 */
class ThrowingStorage extends MemoryStorage {
  failing = true
  override setItem(key: string, value: string): void {
    if (this.failing) throw new DOMException('QuotaExceededError', 'QuotaExceededError')
    super.setItem(key, value)
  }
}

describe('存储降级状态（工单 07）', () => {
  it('bootstrapEditorLibrary：存储不可用时一次性置位 unavailable', () => {
    const throwing = new ThrowingStorage()
    bootstrapEditorLibrary(throwing)
    expect(useEditorStore.getState().storageIssue).toBe('unavailable')
    // 内存态照常可用（仍能编辑与新建）
    expect(useEditorStore.getState().diagrams.length).toBeGreaterThan(0)
  })

  it('存储可用时 storageIssue 为 null', () => {
    storage.clear()
    bootstrapEditorLibrary(storage)
    expect(useEditorStore.getState().storageIssue).toBeNull()
  })

  it('quota 失败置位、成功保存后自动清除；可手动消除', () => {
    storage.clear()
    bootstrapEditorLibrary(storage)
    const store = useEditorStore.getState()
    store.reportSaveResult({ ok: false, reason: 'quota' })
    expect(useEditorStore.getState().storageIssue).toBe('quota')
    store.reportSaveResult({ ok: true })
    expect(useEditorStore.getState().storageIssue).toBeNull()

    store.reportSaveResult({ ok: false, reason: 'quota' })
    expect(useEditorStore.getState().storageIssue).toBe('quota')
    store.dismissStorageIssue()
    expect(useEditorStore.getState().storageIssue).toBeNull()
  })

  it('unavailable 只明示一次：确认后再次失败不再重复置位', () => {
    const throwing = new ThrowingStorage()
    bootstrapEditorLibrary(throwing)
    const store = useEditorStore.getState()
    expect(store.storageIssue).toBe('unavailable')
    store.dismissStorageIssue()
    expect(useEditorStore.getState().storageIssue).toBeNull()
    // 后续每次保存都失败（unavailable），但不再重复提示
    store.reportSaveResult({ ok: false, reason: 'unavailable' })
    expect(useEditorStore.getState().storageIssue).toBeNull()
  })

  it('quota 与 unavailable 之间切换：quota 之后再次 unavailable 仍会提示', () => {
    storage.clear()
    bootstrapEditorLibrary(storage)
    const store = useEditorStore.getState()
    store.reportSaveResult({ ok: false, reason: 'quota' })
    store.reportSaveResult({ ok: false, reason: 'unavailable' })
    expect(useEditorStore.getState().storageIssue).toBe('unavailable')
  })
})

describe('跨标签页变更状态（工单 11）', () => {
  beforeEach(() => reset())

  it('loadCrossTabChange：以他页源码替换本页，且可撤销', () => {
    const activeId = useEditorStore.getState().activeId
    if (activeId === null) throw new Error('应有活跃图表')
    const before = useEditorStore.getState().source
    useEditorStore.getState().noteCrossTabChange({ diagramId: activeId, source: 'flowchart TD\n  X --> Y\n', savedAt: 9 })
    expect(useEditorStore.getState().crossTabChange).not.toBeNull()

    useEditorStore.getState().loadCrossTabChange()
    expect(useEditorStore.getState().source).toBe('flowchart TD\n  X --> Y\n')
    expect(useEditorStore.getState().crossTabChange).toBeNull()
    // 载入是一次可撤销编辑
    expect(useEditorStore.getState().canUndo).toBe(true)
    useEditorStore.getState().undo()
    expect(useEditorStore.getState().source).toBe(before)
  })

  it('载入时图表已切换 → 丢弃待处理变更，不误改当前图表', () => {
    useEditorStore.getState().newDiagram('sequence')
    const otherId = useEditorStore.getState().activeId
    const otherSource = useEditorStore.getState().source
    if (otherId === null) throw new Error('应有活跃图表')
    // 待处理变更指向已被切走的图表
    useEditorStore.getState().noteCrossTabChange({ diagramId: 'seed', source: 'stale\n', savedAt: 1 })
    useEditorStore.getState().loadCrossTabChange()
    expect(useEditorStore.getState().source).toBe(otherSource)
    expect(useEditorStore.getState().crossTabChange).toBeNull()
  })

  it('dismissCrossTabChange：清除提示但不改源码', () => {
    const activeId = useEditorStore.getState().activeId
    if (activeId === null) throw new Error('应有活跃图表')
    const before = useEditorStore.getState().source
    useEditorStore.getState().noteCrossTabChange({ diagramId: activeId, source: 'x\n', savedAt: 1 })
    useEditorStore.getState().dismissCrossTabChange()
    expect(useEditorStore.getState().crossTabChange).toBeNull()
    expect(useEditorStore.getState().source).toBe(before)
  })
})
