import { describe, expect, it } from 'vitest'
import type { CanvasInlineEditTarget, InlineEditDiagramKind } from '../inline-edit'
import { diagramInlineEdits, inlineEditCommitOfByKind } from '../inline-edit/index'

/**
 * 内联编辑图种表穷尽性（architecture-deepening-3 工单 07）：两张实参表的键穷尽由
 * 类型注解钉死（漏挂 tsc 红），这里测试逼答（与 diagram-registry / menu-actions
 * 同范式）——若有人放宽注解，测试兜底。
 */

const ALL_DIAGRAM_KINDS: InlineEditDiagramKind[] = [
  'flowchart',
  'mindmap',
  'class',
  'sequence',
  'state',
  'er',
  'kanban',
  'requirement',
  'block',
  'gantt',
  'quadrant',
  'packet',
  'xychart',
  'radar',
  'architecture',
  'zenuml',
]

const ALL_TARGET_KINDS: CanvasInlineEditTarget['kind'][] = [
  'flowchart',
  'mindmap',
  'class',
  'sequence',
  'sequence-alias',
  'state',
  'er',
  'kanban-card',
  'kanban-column',
  'requirement',
  'block-node',
  'gantt-task',
  'quadrant-point',
  'packet-field',
  'xychart-series',
  'radar-axis',
  'architecture',
  'zenuml-participant',
]

describe('inline-edit 图种表穷尽性（工单 07）', () => {
  it('每个双击可编辑图种都有定义', () => {
    expect(Object.keys(diagramInlineEdits).sort()).toEqual([...ALL_DIAGRAM_KINDS].sort())
  })

  it('每个编辑目标 kind 都有提交规则', () => {
    expect(Object.keys(inlineEditCommitOfByKind).sort()).toEqual([...ALL_TARGET_KINDS].sort())
  })
})
