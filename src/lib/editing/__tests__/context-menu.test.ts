import { describe, expect, it } from 'vitest'
import { contextMenuItems, contextMenuTargetFromSelection } from '../context-menu'

/**
 * 右键菜单目标解析（工单 07/04）：画布选中 + 图种 → 菜单目标 → 菜单项列表。
 * 空白处四种图种都有添加动作（工单 04：class/sequence/mindmap 不再是 null）；
 * sequence/class 的**节点**菜单见工单 06。
 */

describe('contextMenuTargetFromSelection（工单 07/04 菜单目标解析）', () => {
  it('flowchart 空白处 → blank（携带图种）', () => {
    expect(contextMenuTargetFromSelection(null, 'flowchart')).toEqual({ kind: 'blank', diagramType: 'flowchart' })
  })

  it('class/sequence/mindmap 空白处 → blank（工单 04，不再返回 null）', () => {
    expect(contextMenuTargetFromSelection(null, 'class')).toEqual({ kind: 'blank', diagramType: 'class' })
    expect(contextMenuTargetFromSelection(null, 'sequence')).toEqual({ kind: 'blank', diagramType: 'sequence' })
    expect(contextMenuTargetFromSelection(null, 'mindmap')).toEqual({ kind: 'blank', diagramType: 'mindmap' })
  })

  it('flowchart 节点 → flowchart-node', () => {
    expect(contextMenuTargetFromSelection({ kind: 'node', id: 'A' }, 'flowchart')).toEqual({
      kind: 'flowchart-node',
      nodeId: 'A',
    })
  })

  it('flowchart 连线 → flowchart-edge（occurrence 透传）', () => {
    expect(
      contextMenuTargetFromSelection({ kind: 'edge', from: 'A', to: 'B', occurrence: 2 }, 'flowchart'),
    ).toEqual({ kind: 'flowchart-edge', from: 'A', to: 'B', occurrence: 2 })
  })

  it('mindmap 节点（画布选中 id 即 elementId）→ mindmap-node', () => {
    expect(contextMenuTargetFromSelection({ kind: 'node', id: 'mindmap-node:2' }, 'mindmap')).toEqual({
      kind: 'mindmap-node',
      elementId: 'mindmap-node:2',
    })
  })

  it('sequence/class 节点本轮未定义菜单 → null', () => {
    expect(contextMenuTargetFromSelection({ kind: 'node', id: 'Alice' }, 'sequence')).toBeNull()
    expect(contextMenuTargetFromSelection({ kind: 'node', id: 'Foo' }, 'class')).toBeNull()
  })
})

describe('contextMenuItems（工单 07/04 菜单项）', () => {
  it('flowchart 空白处：添加节点 / 添加连线 / 添加样式 / 添加子图（不回归）', () => {
    expect(contextMenuItems({ kind: 'blank', diagramType: 'flowchart' })).toEqual([
      'add-node',
      'link-mode',
      'add-style',
      'add-subgraph',
    ])
  })

  it('class 空白处：添加类', () => {
    expect(contextMenuItems({ kind: 'blank', diagramType: 'class' })).toEqual(['add-class'])
  })

  it('sequence 空白处：添加参与者', () => {
    expect(contextMenuItems({ kind: 'blank', diagramType: 'sequence' })).toEqual(['add-participant'])
  })

  it('mindmap 空白处：添加根节点', () => {
    expect(contextMenuItems({ kind: 'blank', diagramType: 'mindmap' })).toEqual(['add-root'])
  })

  it('flowchart 节点：从这里连线 / 编辑文本 / 应用样式 / 删除', () => {
    expect(contextMenuItems({ kind: 'flowchart-node', nodeId: 'A' })).toEqual([
      'link-from-here',
      'edit-text',
      'apply-style',
      'delete',
    ])
  })

  it('flowchart 连线：编辑标签 / 删除', () => {
    expect(contextMenuItems({ kind: 'flowchart-edge', from: 'A', to: 'B', occurrence: 1 })).toEqual([
      'edit-label',
      'delete',
    ])
  })

  it('mindmap 节点：添加子节点 / 编辑文本 / 删除', () => {
    expect(contextMenuItems({ kind: 'mindmap-node', elementId: 'mindmap-node:1' })).toEqual([
      'add-child',
      'edit-text',
      'delete',
    ])
  })
})
