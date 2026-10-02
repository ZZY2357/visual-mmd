import type {
  CanvasInlineEditTarget,
  DiagramInlineEditDefinition,
  InlineEditCommitFn,
  InlineEditDiagramKind,
} from '../inline-edit'
import { architectureInlineEdit } from './architecture'
import { blockInlineEdit } from './block'
import { classInlineEdit } from './class'
import { erInlineEdit } from './er'
import { flowchartInlineEdit } from './flowchart'
import { ganttInlineEdit } from './gantt'
import { kanbanInlineEdit } from './kanban'
import { mindmapInlineEdit } from './mindmap'
import { packetInlineEdit } from './packet'
import { quadrantInlineEdit } from './quadrant'
import { radarInlineEdit } from './radar'
import { requirementInlineEdit } from './requirement'
import { sequenceInlineEdit } from './sequence'
import { stateInlineEdit } from './state'
import { xychartInlineEdit } from './xychart'
import { zenumlInlineEdit } from './zenuml'

/**
 * 内联编辑图种表（architecture-deepening-3 工单 07）：每图种「双击哪个文本能编辑
 * 哪个字段」的匹配范式与「提交落什么意图」的规则就近 `<id>.ts` 一个文件（与
 * menu/<id>.ts、partitions/<id>.ts 同范式）。两张实参表对图种 / target kind 穷尽，
 * 漏挂 tsc 红，另有穷尽性测试逼答（`__tests__/inline-edit-tables.test.ts`）。
 */

/** 双击可编辑图种 → 该图种的内联编辑定义 */
export const diagramInlineEdits: Record<InlineEditDiagramKind, DiagramInlineEditDefinition> = {
  flowchart: flowchartInlineEdit,
  mindmap: mindmapInlineEdit,
  class: classInlineEdit,
  sequence: sequenceInlineEdit,
  state: stateInlineEdit,
  er: erInlineEdit,
  kanban: kanbanInlineEdit,
  requirement: requirementInlineEdit,
  block: blockInlineEdit,
  gantt: ganttInlineEdit,
  quadrant: quadrantInlineEdit,
  packet: packetInlineEdit,
  xychart: xychartInlineEdit,
  radar: radarInlineEdit,
  architecture: architectureInlineEdit,
  zenuml: zenumlInlineEdit,
}

/** 编辑目标 kind → 提交规则。每个 target kind 全仓库唯一归属一个图种（sequence 产
 * sequence / sequence-alias 两个、kanban 产 card / column 两个），键穷尽由注解钉死。 */
export const inlineEditCommitOfByKind: { [T in CanvasInlineEditTarget['kind']]-?: InlineEditCommitFn<T> } = {
  flowchart: flowchartInlineEdit.commitOf.flowchart!,
  mindmap: mindmapInlineEdit.commitOf.mindmap!,
  class: classInlineEdit.commitOf.class!,
  sequence: sequenceInlineEdit.commitOf.sequence!,
  'sequence-alias': sequenceInlineEdit.commitOf['sequence-alias']!,
  state: stateInlineEdit.commitOf.state!,
  er: erInlineEdit.commitOf.er!,
  'kanban-card': kanbanInlineEdit.commitOf['kanban-card']!,
  'kanban-column': kanbanInlineEdit.commitOf['kanban-column']!,
  requirement: requirementInlineEdit.commitOf.requirement!,
  'block-node': blockInlineEdit.commitOf['block-node']!,
  'gantt-task': ganttInlineEdit.commitOf['gantt-task']!,
  'quadrant-point': quadrantInlineEdit.commitOf['quadrant-point']!,
  'packet-field': packetInlineEdit.commitOf['packet-field']!,
  'xychart-series': xychartInlineEdit.commitOf['xychart-series']!,
  'radar-axis': radarInlineEdit.commitOf['radar-axis']!,
  architecture: architectureInlineEdit.commitOf.architecture!,
  'zenuml-participant': zenumlInlineEdit.commitOf['zenuml-participant']!,
}
