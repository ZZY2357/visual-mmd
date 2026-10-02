import {
  resolveSequenceSelection,
  type SequenceProjection,
} from '../projection/sequence-projection'
import { sequenceDeleteIntent, sequenceKeyPlan } from '../pipeline/sequence-keyboard'
import { elementDataIdResolver, nodeDataIdResolver, type DataIdResolver } from './data-id'
import { edgeSelectionOf } from './edge-adapter'
import { annotateSequenceIdentities } from './edge-locate'
import type { CanvasCapabilities, ProjectionOf } from './capabilities'

/**
 * sequence 适配器（工单 04）：把 sequence 投影接到画布能力包上（ADR-0015）。
 * 此前的 sequence resolver 在 CanvasPanel.resolverOf 里现场拼——本工单把它连同
 * 导航 / 键盘 / 选中映射 / 连线标注 / 选中回落一起收进能力包实例。
 *
 * data-id 约定（承 CanvasPanel.resolverOf 的 sequence 分支）：参与者的 data-id 即
 * actorId；消息 / 注释 / 逻辑块按**位置序**寻址（ADR-0012），data-id 为投影 elementId
 * （`message:2` / `note:1` / `block:1`…）。
 */

export function sequenceDataIdResolver(projection: SequenceProjection): DataIdResolver {
  const nodes = nodeDataIdResolver(projection.participants.map((p) => p.actorId))
  const edges = elementDataIdResolver([
    ...projection.messages.map((m) => m.elementId),
    ...projection.notes.map((n) => n.elementId),
    ...projection.blocks.map((b) => b.elementId),
  ])
  return (dataId) => nodes(dataId) ?? edges(dataId)
}

/** sequence 位置序标注的条数（工单 02）：块只数 block-open——`else`/`and` 是分支行，
 * 画布上不构成独立元素（其 elementId 是 `else:N`，不是位置序身份）。 */
function sequenceEdgeCounts(projection: SequenceProjection): { messages: number; notes: number; blocks: number } {
  return {
    messages: projection.messages.length,
    notes: projection.notes.length,
    blocks: projection.blocks.filter((b) => b.keyword !== 'else' && b.keyword !== 'and').length,
  }
}

/** sequence 画布能力包（工单 04，ADR-0015）：实例挂在 DiagramTypeRegistration.canvas 上。
 * 有位置序连线（消息/注释/块）→ 实现 edgeAnnotator。 */
export const sequenceCanvasCapabilities: CanvasCapabilities<ProjectionOf<'sequence'>> = {
  dataIdResolver: (projection) => sequenceDataIdResolver(projection.sequence),
  toSelection: (canvas) => {
    // 位置序连线（工单 02）：经 edgeSelectionOf 收窄到本图种可寻址的种类
    if (canvas.kind === 'element') return edgeSelectionOf('sequence', canvas.elementId)
    if (canvas.kind === 'node') return { kind: 'participant', actorId: canvas.id }
    return null
  },
  // 参与者与消息/注释/块可寻址；seq-region 无 data-id（安静地不高亮）
  canvasIdOf: (_projection, selection) => {
    if (selection.kind === 'participant') return selection.actorId
    if (selection.kind === 'message' || selection.kind === 'note' || selection.kind === 'block') {
      return selection.elementId
    }
    return null
  },
  navigationIds: (projection) => projection.sequence.participants.map((p) => p.actorId),
  keyboardProjection: (projection) => ({ kind: 'sequence', projection: projection.sequence }),
  edgeAnnotator: (projection) => (root) => annotateSequenceIdentities(root, sequenceEdgeCounts(projection.sequence)),
  resolveSelection: (projection, selection) => resolveSequenceSelection(projection.sequence, selection),
  // 删除意图（architecture-deepening-2 工单 03）：唯一映射在 pipeline/sequence-keyboard 的 sequenceDeleteIntent
  deleteIntent: (projection, selection) => sequenceDeleteIntent(projection.sequence, selection),
  // 键位语义（architecture-deepening-2 工单 02）：唯一映射在 pipeline/sequence-keyboard 的 sequenceKeyPlan
  keyHandler: (projection) => (input) => sequenceKeyPlan(projection.sequence, input),
}
