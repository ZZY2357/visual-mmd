import type { SourceDocument } from '../pipeline/document'
import {
  type ActivationData,
  type BlockElseData,
  type BlockKeyword,
  type BlockOpenData,
  type MessageArrow,
  type MessageData,
  type MessageAct,
  type NoteData,
  type NotePos,
  type ParticipantData,
  stripAliasQuotes,
} from '../pipeline/sequence'
import { type Selection } from './selection'

/**
 * sequence 投影（ADR-0008）：从解析产物派生的只读结构视图，
 * 驱动结构树与属性表单。投影不持久化、不参与撤销。
 */

export interface ProjectionParticipant {
  actorId: string
  /** as 别名（去引号后）；无别名时 null */
  alias: string | null
  keyword: 'participant' | 'actor'
  /** 声明元素 id（`participant:X`），编辑意图据此寻址 */
  elementId: string
  /** 当前净激活状态（+ / activate 开，- / deactivate 关） */
  active: boolean
}

export interface ProjectionMessage {
  /** `message:N`，编辑意图据此寻址 */
  elementId: string
  from: string
  to: string
  arrow: MessageArrow
  /** 消息简写激活标记 */
  act: MessageAct
  text: string
}

export interface ProjectionNote {
  elementId: string
  pos: NotePos
  /** 解析不出的参与者列表为 null（mid 原样保留，只能编辑文本） */
  actors: string[] | null
  text: string
}

export interface ProjectionBlock {
  /** `block:N`，编辑意图据此寻址 */
  elementId: string
  keyword: BlockKeyword
  label: string | null
  /** 嵌套深度（1 起） */
  depth: number
}

export interface ProjectionElse {
  elementId: string
  keyword: 'else' | 'and'
  label: string | null
  /** 分支行的展示深度（树形缩进用） */
  depth: number
}

export interface SequenceProjection {
  autonumber: boolean
  participants: ProjectionParticipant[]
  messages: ProjectionMessage[]
  notes: ProjectionNote[]
  /** open 与 else 分支按文档顺序混排（depth 供树形展示） */
  blocks: Array<ProjectionBlock | ProjectionElse>
}

/** 从解析产物构建 sequence 投影（纯函数） */
export function buildSequenceProjection(doc: SourceDocument): SequenceProjection {
  const autonumber = doc.elements.some((part) => part.element.kind === 'autonumber')

  const declared = new Map<string, ProjectionParticipant>()
  const referenced: string[] = []
  const messages: ProjectionMessage[] = []
  const notes: ProjectionNote[] = []
  const blocks: Array<ProjectionBlock | ProjectionElse> = []
  const depthStack: number[] = []
  const activeDelta = new Map<string, boolean>()

  const touch = (actorId: string) => {
    if (!declared.has(actorId) && !referenced.includes(actorId)) referenced.push(actorId)
  }

  for (const part of doc.elements) {
    const data = part.element
    if (data.kind === 'participant') {
      const p = data as ParticipantData
      declared.set(p.actorId, {
        actorId: p.actorId,
        alias: p.aliasRaw !== null ? stripAliasQuotes(p.aliasRaw) : null,
        keyword: p.keyword,
        elementId: part.id,
        active: false,
      })
    } else if (data.kind === 'message') {
      const m = data as MessageData
      touch(m.from)
      touch(m.to)
      if (m.act !== '') touch(m.to)
      messages.push({ elementId: part.id, from: m.from, to: m.to, arrow: m.arrow, act: m.act, text: m.text })
      if (m.act !== '') activeDelta.set(m.to, m.act === '+')
    } else if (data.kind === 'note') {
      const n = data as NoteData
      for (const a of n.actors ?? []) touch(a)
      notes.push({ elementId: part.id, pos: n.pos, actors: n.actors, text: n.text })
    } else if (data.kind === 'activation') {
      const a = data as ActivationData
      touch(a.actorId)
      activeDelta.set(a.actorId, a.keyword === 'activate')
    } else if (data.kind === 'block-open') {
      const b = data as BlockOpenData
      const depth = depthStack.length + 1
      depthStack.push(depth)
      blocks.push({ elementId: part.id, keyword: b.keyword, label: b.label, depth })
    } else if (data.kind === 'block-else') {
      const e = data as BlockElseData
      blocks.push({ elementId: part.id, keyword: e.keyword, label: e.label, depth: depthStack.length })
    } else if (data.kind === 'block-end') {
      depthStack.pop()
    }
  }

  const participants: ProjectionParticipant[] = [...declared.values()]
  for (const actorId of referenced) {
    participants.push({
      actorId,
      alias: null,
      keyword: 'participant',
      elementId: `participant:${actorId}`,
      active: activeDelta.get(actorId) ?? false,
    })
  }
  for (const p of participants) {
    p.active = activeDelta.get(p.actorId) ?? false
  }

  return { autonumber, participants, messages, notes, blocks }
}

// ---------- 选中回落 ----------

/**
 * 选中目标在投影中仍存在则原样返回，否则回落到图表级（diagram）。
 */
export function resolveSequenceSelection(
  projection: SequenceProjection,
  selection: Selection | null,
): Selection | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'diagram':
      return selection
    case 'participant':
      return projection.participants.some((p) => p.actorId === selection.actorId) ? selection : null
    case 'message':
      return projection.messages.some((m) => m.elementId === selection.elementId) ? selection : null
    case 'note':
      return projection.notes.some((n) => n.elementId === selection.elementId) ? selection : null
    case 'block':
      return projection.blocks.some((b) => b.elementId === selection.elementId) ? selection : null
    default:
      return null
  }
}
