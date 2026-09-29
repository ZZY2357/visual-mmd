import type {
  BlockKeyword,
  MessageAct,
  MessageArrow,
  NotePos,
  SequenceIntent,
} from '../pipeline/sequence'
import { isValidParticipantId } from '../pipeline/sequence'

/**
 * sequence 表单值 → 编辑意图 的纯映射（工单 06）。
 * 本模块不做任何解析或落码：产出意图后由管线 applyEdit 执行。
 * 意图集合与语义见 src/lib/pipeline/sequence.ts。
 */

// ---------- 选项表（供表单控件与 i18n key 使用） ----------

export const MESSAGE_ARROW_OPTIONS: MessageArrow[] = ['->>', '-->', '-x', '--']

export const MESSAGE_ACT_OPTIONS: Array<{ value: MessageAct; labelKey: string }> = [
  { value: '', labelKey: 'none' },
  { value: '+', labelKey: 'activate' },
  { value: '-', labelKey: 'deactivate' },
]

export const NOTE_POS_OPTIONS: NotePos[] = ['over', 'left', 'right']

export const BLOCK_KEYWORD_OPTIONS: BlockKeyword[] = ['loop', 'alt', 'opt', 'par', 'critical', 'break']

// ---------- participant 表单 → 意图 ----------

export interface AddParticipantForm {
  actorId: string
  isActor: boolean
  alias: string
}

/** 新增参与者表单值 → add-participant 意图；id 非法时返回 null */
export function addParticipantIntent(form: AddParticipantForm): SequenceIntent | null {
  if (!isValidParticipantId(form.actorId)) return null
  return {
    type: 'add-participant',
    actorId: form.actorId,
    isActor: form.isActor,
    alias: form.alias !== '' ? form.alias : undefined,
  }
}

export function setParticipantAliasIntent(actorId: string, alias: string): SequenceIntent {
  return { type: 'set-participant', actorId, alias: alias !== '' ? alias : null }
}

export function renameParticipantIntent(actorId: string, newId: string): SequenceIntent | null {
  if (!isValidParticipantId(newId) || newId === actorId) return null
  return { type: 'rename-participant', actorId, newId }
}

export function deleteParticipantIntent(actorId: string): SequenceIntent {
  return { type: 'delete-participant', actorId }
}

export function toggleActivationIntent(actorId: string): SequenceIntent {
  return { type: 'toggle-activation', actorId }
}

// ---------- message 表单 → 意图 ----------

export interface MessageSpecForm {
  arrow?: MessageArrow
  act?: MessageAct
  text?: string
}

/** 消息属性表单值 → set-message 意图（未给出的字段保持不变） */
export function setMessageIntent(elementId: string, form: MessageSpecForm): SequenceIntent {
  return { type: 'set-message', elementId, ...form }
}

export function deleteMessageIntent(elementId: string): SequenceIntent {
  return { type: 'delete-message', elementId }
}

export interface AddMessageForm {
  from: string
  to: string
  arrow: MessageArrow
  act: MessageAct
  text: string
}

/** 新增消息表单值 → add-message 意图；端点为空时返回 null */
export function addMessageIntent(form: AddMessageForm): SequenceIntent | null {
  if (form.from === '' || form.to === '') return null
  return {
    type: 'add-message',
    from: form.from,
    to: form.to,
    arrow: form.arrow,
    act: form.act,
    text: form.text !== '' ? form.text : undefined,
  }
}

// ---------- note 表单 → 意图 ----------

export function setNoteIntent(
  elementId: string,
  form: { pos?: NotePos; text?: string },
): SequenceIntent {
  return { type: 'set-note', elementId, ...form }
}

export function deleteNoteIntent(elementId: string): SequenceIntent {
  return { type: 'delete-note', elementId }
}

export interface AddNoteForm {
  pos: NotePos
  actorA: string
  actorB: string
  text: string
}

/** 新增 note 表单值 → add-note 意图；over 可选第二个参与者，left/right 只取第一个 */
export function addNoteIntent(form: AddNoteForm): SequenceIntent | null {
  const actors = form.pos === 'over' ? [form.actorA, form.actorB] : [form.actorA]
  const filtered = actors.filter((a) => a !== '')
  if (filtered.length === 0) return null
  return {
    type: 'add-note',
    pos: form.pos,
    actors: filtered,
    text: form.text !== '' ? form.text : undefined,
  }
}

// ---------- autonumber / 逻辑块表单 → 意图 ----------

export function setAutonumberIntent(enabled: boolean): SequenceIntent {
  return { type: 'set-autonumber', enabled }
}

export interface AddBlockForm {
  keyword: BlockKeyword
  label: string
}

export function addBlockIntent(form: AddBlockForm): SequenceIntent {
  return {
    type: 'add-block',
    keyword: form.keyword,
    label: form.label !== '' ? form.label : undefined,
  }
}

export function setBlockLabelIntent(elementId: string, label: string): SequenceIntent {
  return { type: 'set-block-label', elementId, label: label !== '' ? label : null }
}

export function deleteBlockIntent(elementId: string): SequenceIntent {
  return { type: 'delete-block', elementId }
}

export function setElseLabelIntent(elementId: string, label: string): SequenceIntent {
  return { type: 'set-else-label', elementId, label: label !== '' ? label : null }
}

export function deleteElseIntent(elementId: string): SequenceIntent {
  return { type: 'delete-else', elementId }
}

// ---------- rect / box 区域块（工单 06：只改名，不做分组编辑） ----------

/** 改 rect 区域块的色值（原样写回，不校验颜色合法性——mermaid 侧自行处理） */
export function setRectColorIntent(elementId: string, color: string): SequenceIntent {
  return { type: 'set-rect-color', elementId, color }
}

/** 改 box 分组框的标签文本（空串 = 去掉标签；颜色 token 由管线原样保留） */
export function setBoxLabelIntent(elementId: string, label: string): SequenceIntent {
  return { type: 'set-box-label', elementId, label: label !== '' ? label : null }
}
