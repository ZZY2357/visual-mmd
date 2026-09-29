import { describe, expect, it } from 'vitest'
import { MENU_ACTIONS } from '../menu-actions'
import { contextMenuItems, type ContextMenuTarget } from '../context-menu'

describe('MENU_ACTIONS 穷尽性（工单 05）', () => {
  it('MENU_ACTIONS 键集合与 contextMenuItems 能返回的全部 id 并集一致（防止菜单能显示但点了没反应）', () => {
    // 穷举 contextMenuItems 定义里出现过的全部目标形状（blank 按四种图种各来一次）
    const allTargets: ContextMenuTarget[] = [
      { kind: 'blank', diagramType: 'flowchart' },
      { kind: 'blank', diagramType: 'sequence' },
      { kind: 'blank', diagramType: 'class' },
      { kind: 'blank', diagramType: 'mindmap' },
      { kind: 'flowchart-node', nodeId: 'n1' },
      { kind: 'flowchart-edge', from: 'a', to: 'b', occurrence: 0 },
      { kind: 'mindmap-node', elementId: 'm1' },
      { kind: 'class-node', name: 'A' },
      { kind: 'sequence-participant', actorId: 'p1' },
      { kind: 'class-relation', elementId: 'relation:1' },
      { kind: 'sequence-message', elementId: 'message:1' },
      { kind: 'sequence-note', elementId: 'note:1' },
      { kind: 'sequence-block', elementId: 'block:1' },
    ]
    const reachableIds = new Set(allTargets.flatMap((target) => contextMenuItems(target)))
    const actionIds = new Set(Object.keys(MENU_ACTIONS))

    expect(actionIds).toEqual(reachableIds)
  })

  it('apply-style 虽在菜单表里，但不经 onMenuItem 分发（CanvasPanel 渲染成子菜单开关，见该文件）', () => {
    expect(contextMenuItems({ kind: 'flowchart-node', nodeId: 'n1' })).toContain('apply-style')
    expect(Object.keys(MENU_ACTIONS)).toContain('apply-style')
  })
})
