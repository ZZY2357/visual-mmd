import type { DiagramTypeId } from '../diagram-registry'
import type { Selection } from '../projection/selection'
import { edgeOrdinalOf } from './edge-identity'

/**
 * 连线适配器（工单 02，沿 flowchart-adapter 的分层）：把位置序身份接到编辑器的 `Selection`。
 *
 * 身份 → 选中的映射**只认位置序身份**（`edgeOrdinalOf` 能解析出来的形态），并且按图种收窄：
 * class 只认关系边，sequence 只认消息 / 注释 / 块。其余（mermaid 的 `id_A_B_1` / `i1` /
 * `L_A_B_0`、class 的成员与注释——本票未纳入）一律 null，不产生选中。
 *
 * 本票只做**寻址**：选中后右侧表单沿用既有 `RelationForm` / `MessageForm` / `NoteForm` /
 * `BlockForm`（`PropertyPanel` 已按 `Selection.kind` 分发），不新建表单。
 */
export function edgeSelectionOf(diagramType: DiagramTypeId, elementId: string): Selection | null {
  const parsed = edgeOrdinalOf(elementId)
  if (parsed === null) return null
  if (diagramType === 'class') {
    return parsed.kind === 'relation' ? { kind: 'class-relation', elementId } : null
  }
  if (diagramType === 'sequence') {
    if (parsed.kind === 'message') return { kind: 'message', elementId }
    if (parsed.kind === 'note') return { kind: 'note', elementId }
    if (parsed.kind === 'block') return { kind: 'block', elementId }
  }
  return null
}
