import { describe, expect, it } from 'vitest'
import { contextMenuItems, contextMenuTargetFromSelection } from '../context-menu'

/**
 * 右键菜单目标解析（工单 07/04/06/03）：画布选中 + 图种 → 菜单目标 → 菜单项列表。
 * 空白处四种图种都有添加动作（工单 04）；节点菜单四种图种齐备（工单 06 补齐
 * class/sequence 的节点）；位置序连线（工单 03 补齐 class/sequence）也齐备，
 * 而 flowchart 形态的 kind:edge 在 class/sequence 仍返回 null（不回归）。
 *
 * 本批工单 04 追加：`add-note` / `add-block` 两类添加动作落进菜单（sequence 空白的注释与
 * 逻辑块、sequence 参与者的逻辑块、class 空白与类节点的注释）——补全
 * `CONTEXT.md` 的「右键菜单是元素添加的唯一入口」。
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

  it('flowchart 节点 → node 选中（元素目标 = 选中本身）', () => {
    expect(contextMenuTargetFromSelection({ kind: 'node', id: 'A' }, 'flowchart')).toEqual({
      kind: 'element',
      selection: { kind: 'node', nodeId: 'A' },
    })
  })

  it('flowchart 连线 → flowchart-edge（occurrence 透传）', () => {
    expect(
      contextMenuTargetFromSelection({ kind: 'edge', from: 'A', to: 'B', occurrence: 2 }, 'flowchart'),
    ).toEqual({ kind: 'element', selection: { kind: 'edge', from: 'A', to: 'B', occurrence: 2 } })
  })

  it('mindmap 节点（画布选中 id 即 elementId）→ mindmap-node 选中', () => {
    expect(contextMenuTargetFromSelection({ kind: 'node', id: 'mindmap-node:2' }, 'mindmap')).toEqual({
      kind: 'element',
      selection: { kind: 'mindmap-node', elementId: 'mindmap-node:2' },
    })
  })

  it('class 节点（画布选中 id 即类名）→ class 选中（工单 06）', () => {
    expect(contextMenuTargetFromSelection({ kind: 'node', id: 'Foo' }, 'class')).toEqual({
      kind: 'element',
      selection: { kind: 'class', name: 'Foo' },
    })
  })

  it('sequence 节点（画布选中 id 即 actorId）→ participant 选中（工单 06）', () => {
    expect(contextMenuTargetFromSelection({ kind: 'node', id: 'Alice' }, 'sequence')).toEqual({
      kind: 'element',
      selection: { kind: 'participant', actorId: 'Alice' },
    })
  })

  // 工单 03 保留此断言：class/sequence 的连线走位置序（kind:element），flowchart 形态的
  // kind:edge 在这两个图种上仍不产生目标——避免节点对寻址被误当成连线寻址。
  it('sequence/class 的 flowchart 形态边（旧 kind:edge）→ null（不回归）', () => {
    const edge = { kind: 'edge' as const, from: 'A', to: 'B', occurrence: 1 }
    expect(contextMenuTargetFromSelection(edge, 'sequence')).toBeNull()
    expect(contextMenuTargetFromSelection(edge, 'class')).toBeNull()
  })

  it('class 关系边（工单 02 位置序身份）→ class-relation', () => {
    expect(
      contextMenuTargetFromSelection({ kind: 'element', elementId: 'relation:2' }, 'class'),
    ).toEqual({ kind: 'element', selection: { kind: 'class-relation', elementId: 'relation:2' } })
  })

  it('sequence 连线（工单 02 位置序身份）→ message / note / block 各自的目标', () => {
    expect(contextMenuTargetFromSelection({ kind: 'element', elementId: 'message:3' }, 'sequence')).toEqual({
      kind: 'element',
      selection: { kind: 'message', elementId: 'message:3' },
    })
    expect(contextMenuTargetFromSelection({ kind: 'element', elementId: 'note:1' }, 'sequence')).toEqual({
      kind: 'element',
      selection: { kind: 'note', elementId: 'note:1' },
    })
    expect(contextMenuTargetFromSelection({ kind: 'element', elementId: 'block:1' }, 'sequence')).toEqual({
      kind: 'element',
      selection: { kind: 'block', elementId: 'block:1' },
    })
  })

  it('位置序身份按图种收窄：class 不认消息，sequence 不认关系 → null', () => {
    expect(contextMenuTargetFromSelection({ kind: 'element', elementId: 'message:1' }, 'class')).toBeNull()
    expect(contextMenuTargetFromSelection({ kind: 'element', elementId: 'relation:1' }, 'sequence')).toBeNull()
    expect(contextMenuTargetFromSelection({ kind: 'element', elementId: 'i1' }, 'sequence')).toBeNull()
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

  it('class 空白处：添加类 / 添加注释（工单 04 补注入口）', () => {
    expect(contextMenuItems({ kind: 'blank', diagramType: 'class' })).toEqual(['add-class', 'add-note'])
  })

  it('sequence 空白处：添加参与者 / 添加注释 / 添加逻辑块（工单 04 补注入口）', () => {
    expect(contextMenuItems({ kind: 'blank', diagramType: 'sequence' })).toEqual([
      'add-participant',
      'add-note',
      'add-block',
    ])
  })

  it('mindmap 空白处：添加根节点', () => {
    expect(contextMenuItems({ kind: 'blank', diagramType: 'mindmap' })).toEqual(['add-root'])
  })

  it('flowchart 节点：从这里连线 / 编辑文本 / 应用样式 / 删除', () => {
    expect(contextMenuItems({ kind: 'element', selection: { kind: 'node', nodeId: 'A' } })).toEqual([
      'link-from-here',
      'edit-text',
      'apply-style',
      'delete',
    ])
  })

  it('flowchart 连线：在属性面板中编辑 / 删除', () => {
    expect(contextMenuItems({ kind: 'element', selection: { kind: 'edge', from: 'A', to: 'B', occurrence: 1 } })).toEqual([
      'edit-label',
      'delete',
    ])
  })

  it('mindmap 节点：添加子节点 / 编辑文本 / 删除', () => {
    expect(contextMenuItems({ kind: 'element', selection: { kind: 'mindmap-node', elementId: 'mindmap-node:1' } })).toEqual([
      'add-child',
      'edit-text',
      'delete',
    ])
  })

  it('class 节点：添加成员 / 添加关系 / 添加注释 / 删除类（工单 06，工单 04 补注释）', () => {
    expect(contextMenuItems({ kind: 'element', selection: { kind: 'class', name: 'Foo' } })).toEqual([
      'add-member',
      'add-relation',
      'add-note',
      'delete-class',
    ])
  })

  it('sequence 参与者：添加消息 / 添加逻辑块 / 删除参与者（工单 06，工单 04 补块）', () => {
    expect(contextMenuItems({ kind: 'element', selection: { kind: 'participant', actorId: 'Alice' } })).toEqual([
      'add-message',
      'add-block',
      'delete-participant',
    ])
  })

  // 工单 04：两个新菜单项只在它们各自的合法目标上出现——mindmap / flowchart 与
  // 已存在的连线目标都不该多出添加动作（「菜单内容随目标变化」要真的随目标变）
  it('add-note / add-block 不出现在无此动作的目标上（工单 04）', () => {
    const withoutAdditions = [
      contextMenuItems({ kind: 'blank', diagramType: 'flowchart' }),
      contextMenuItems({ kind: 'blank', diagramType: 'mindmap' }),
      contextMenuItems({ kind: 'element', selection: { kind: 'node', nodeId: 'A' } }),
      contextMenuItems({ kind: 'element', selection: { kind: 'edge', from: 'A', to: 'B', occurrence: 1 } }),
      contextMenuItems({ kind: 'element', selection: { kind: 'mindmap-node', elementId: 'mindmap-node:1' } }),
      contextMenuItems({ kind: 'element', selection: { kind: 'class-relation', elementId: 'relation:1' } }),
      contextMenuItems({ kind: 'element', selection: { kind: 'message', elementId: 'message:1' } }),
      contextMenuItems({ kind: 'element', selection: { kind: 'note', elementId: 'note:1' } }),
      contextMenuItems({ kind: 'element', selection: { kind: 'block', elementId: 'block:1' } }),
    ]
    for (const items of withoutAdditions) {
      expect(items).not.toContain('add-note')
      expect(items).not.toContain('add-block')
    }
  })

  it('连线目标（工单 03）：class 关系边与 sequence 消息各有编辑 + 删除动作', () => {
    expect(contextMenuItems({ kind: 'element', selection: { kind: 'class-relation', elementId: 'relation:1' } })).toEqual([
      'cycle-relation-kind',
      'edit-relation',
      'delete-relation',
    ])
    expect(contextMenuItems({ kind: 'element', selection: { kind: 'message', elementId: 'message:1' } })).toEqual([
      'cycle-message-arrow',
      'edit-message',
      'delete-message',
    ])
  })

  it('sequence 注释与逻辑块：工单 03 只补删除（不做编辑动作，不扩大改造面）', () => {
    expect(contextMenuItems({ kind: 'element', selection: { kind: 'note', elementId: 'note:1' } })).toEqual(['delete-note'])
    expect(contextMenuItems({ kind: 'element', selection: { kind: 'block', elementId: 'block:1' } })).toEqual(['delete-block'])
  })
})
