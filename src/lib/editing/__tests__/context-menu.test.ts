import { describe, expect, it } from 'vitest'
import { contextMenuItems, contextMenuTargetFromSelection } from '../context-menu'

/**
 * 右键菜单目标解析（工单 07）：画布选中 + 图种 → 菜单目标 → 菜单项列表。
 * sequence/class 的节点本轮未定义菜单（返回 null）；flowchart 空白处有添加类动作。
 */

describe('contextMenuTargetFromSelection（工单 07 菜单目标解析）', () => {
  it('flowchart 空白处 → blank', () => {
    expect(contextMenuTargetFromSelection(null, 'flowchart')).toEqual({ kind: 'blank' })
  })

  it('其它图种空白处 → null（无菜单可弹）', () => {
    expect(contextMenuTargetFromSelection(null, 'mindmap')).toBeNull()
    expect(contextMenuTargetFromSelection(null, 'sequence')).toBeNull()
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

describe('contextMenuItems（工单 07 菜单项）', () => {
  it('空白处：添加节点 / 添加连线 / 添加样式 / 添加子图', () => {
    expect(contextMenuItems({ kind: 'blank' })).toEqual(['add-node', 'link-mode', 'add-style', 'add-subgraph'])
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
