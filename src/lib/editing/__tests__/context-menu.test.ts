import { describe, expect, it } from 'vitest'
import { contextMenuItems, contextMenuTargetFromSelection } from '../context-menu'

/**
 * 右键菜单目标解析（工单 07/04/06）：画布选中 + 图种 → 菜单目标 → 菜单项列表。
 * 空白处四种图种都有添加动作（工单 04）；节点菜单四种图种齐备（工单 06 补齐
 * class/sequence 的节点），连线本轮仅 flowchart 有定义（其余返回 null）。
 */

describe('contextMenuTargetFromSelection（工单 07/04/06 菜单目标解析）', () => {
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

  it('class 节点（画布选中 id 即类名）→ class-node（工单 06）', () => {
    expect(contextMenuTargetFromSelection({ kind: 'node', id: 'Foo' }, 'class')).toEqual({
      kind: 'class-node',
      name: 'Foo',
    })
  })

  it('sequence 节点（画布选中 id 即 actorId）→ sequence-participant（工单 06）', () => {
    expect(contextMenuTargetFromSelection({ kind: 'node', id: 'Alice' }, 'sequence')).toEqual({
      kind: 'sequence-participant',
      actorId: 'Alice',
    })
  })

  it('sequence/class 的连线本轮未定义 → null', () => {
    const edge = { kind: 'edge' as const, from: 'A', to: 'B', occurrence: 1 }
    expect(contextMenuTargetFromSelection(edge, 'sequence')).toBeNull()
    expect(contextMenuTargetFromSelection(edge, 'class')).toBeNull()
  })
})

describe('contextMenuItems（工单 07/04/06 菜单项）', () => {
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

  it('class 节点：添加成员 / 添加关系 / 删除类（工单 06）', () => {
    expect(contextMenuItems({ kind: 'class-node', name: 'Foo' })).toEqual([
      'add-member',
      'add-relation',
      'delete-class',
    ])
  })

  it('sequence 参与者：添加消息 / 删除参与者（工单 06）', () => {
    expect(contextMenuItems({ kind: 'sequence-participant', actorId: 'Alice' })).toEqual([
      'add-message',
      'delete-participant',
    ])
  })
})
