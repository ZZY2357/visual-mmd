import { assembleDocument, getElementById, type AnyElement, type SourceDocument } from './document'
import type { DiagramParser, EditIntent, ParseResult, SourceParseError } from './parser'
import { lineAtOffset, type Span } from './span'

/**
 * sequence 完整解析器（工单 06，语法范围以 ADR-0005 清单为准）：
 * 手写、逐行、带 span（ADR-0004）。可测试承诺：解析后不做修改再重组装，
 * 输出与输入逐字相同（verbatim identity）。
 *
 * 覆盖（ADR-0005）：
 * - participant / actor 声明（含 `as` 别名）
 * - 四种消息箭头：->>（实线箭头）、-->（虚线）、-x（叉头）、--（无头）
 * - autonumber
 * - activate / deactivate（含消息简写 +/-：`A->>+B` 激活 B、`A-->>-B` 停用 B）
 * - note over / left of / right of
 * - 逻辑块：loop / alt-else / opt / par-and / critical / break（含嵌套）
 *
 * 不解析、原样保留（清单外语法不报错，ADR-0008）：create/destroy、rect、box、
 * 注释、空行、以及一切无法识别的行。
 *
 * span 约定：元素 span 从该行首个非空白字符起、到行尾（不含换行）；
 * 行首缩进与换行永远留在 verbatim。
 */

interface ParseFailure extends Error {
  line: number
}

function parseFailure(line: number, message: string): ParseFailure {
  const error = new Error(message) as ParseFailure
  error.line = line
  return error
}

// ---------- 元素数据 ----------

export interface SeqHeaderData {
  kind: 'seq-header'
  keyword: string
  trailing: string
}

export interface ParticipantData {
  kind: 'participant'
  keyword: 'participant' | 'actor'
  gap: string
  actorId: string
  /** `as` 之后的原始别名文本（含引号）；无别名时 null */
  aliasRaw: string | null
}

export type MessageArrow = '->>' | '-->' | '-x' | '--'
export type MessageAct = '+' | '-' | ''

export interface MessageData {
  kind: 'message'
  from: string
  gap1: string
  arrow: MessageArrow
  /** 源码中的原始箭头 token（如 `-->>`）；不改箭头时原样保留 */
  arrowRaw: string
  /** 消息简写激活标记（箭头与目标参与者之间的 + / -） */
  act: MessageAct
  gap2: string
  to: string
  colonGap: string
  text: string
}

export interface AutonumberData {
  kind: 'autonumber'
  raw: string
}

export interface ActivationData {
  kind: 'activation'
  keyword: 'activate' | 'deactivate'
  gap: string
  actorId: string
}

export type NotePos = 'over' | 'left' | 'right'

export interface NoteData {
  kind: 'note'
  gap1: string
  pos: NotePos
  /** pos 与冒号之间的原文（`over` 后是参与者列表，left/right 后是 ` of X`） */
  mid: string
  /** 参与者列表（over 可能有两个）；解析不出时为 null（mid 仍逐字保留） */
  actors: string[] | null
  colonGap: string
  text: string
}

export type BlockKeyword = 'loop' | 'alt' | 'opt' | 'par' | 'critical' | 'break'

export interface BlockOpenData {
  kind: 'block-open'
  keyword: BlockKeyword
  gap: string
  label: string | null
}

/** 块内的 else / and 分支行 */
export interface BlockElseData {
  kind: 'block-else'
  keyword: 'else' | 'and'
  gap: string
  label: string | null
}

export interface BlockEndData {
  kind: 'block-end'
}

export type SequenceElementData =
  | SeqHeaderData
  | ParticipantData
  | MessageData
  | AutonumberData
  | ActivationData
  | NoteData
  | BlockOpenData
  | BlockElseData
  | BlockEndData

// ---------- 渲染 ----------

export function renderParticipant(d: ParticipantData, changes: { actorId?: string; alias?: string | null } = {}): string {
  const actorId = changes.actorId ?? d.actorId
  if (changes.alias !== undefined) {
    return changes.alias === null || changes.alias === ''
      ? `${d.keyword}${d.gap}${actorId}`
      : `${d.keyword}${d.gap}${actorId} as ${quoteAlias(changes.alias)}`
  }
  return d.aliasRaw !== null ? `${d.keyword}${d.gap}${actorId} as ${d.aliasRaw}` : `${d.keyword}${d.gap}${actorId}`
}

/** 别名含空白/逗号时用双引号包起来（mermaid 要求） */
function quoteAlias(alias: string): string {
  return /[\s,]/.test(alias) ? `"${alias}"` : alias
}

export function stripAliasQuotes(aliasRaw: string): string {
  const trimmed = aliasRaw.trim()
  if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

export function renderMessage(d: MessageData, changes: Partial<Pick<MessageData, 'from' | 'arrow' | 'act' | 'to' | 'text'>> = {}): string {
  const from = changes.from ?? d.from
  // 未改箭头时用源码原始 token（-->> 等扩展写法逐字保留）；改箭头时用规范四种之一
  const arrowToken = changes.arrow !== undefined ? changes.arrow : (d.arrowRaw ?? d.arrow)
  const act = changes.act ?? d.act
  const to = changes.to ?? d.to
  const text = changes.text ?? d.text
  return `${from}${d.gap1}${arrowToken}${act}${d.gap2}${to}:${d.colonGap}${text}`
}

export function renderActivation(d: ActivationData, changes: { keyword?: 'activate' | 'deactivate' } = {}): string {
  const keyword = changes.keyword ?? d.keyword
  return `${keyword}${d.gap}${d.actorId}`
}

export function renderNote(d: NoteData, changes: Partial<Pick<NoteData, 'pos' | 'actors' | 'text'>> = {}): string {
  const pos = changes.pos ?? d.pos
  const text = changes.text ?? d.text
  let mid = d.mid
  if (changes.pos !== undefined || changes.actors !== undefined) {
    const actors = (changes.actors ?? d.actors ?? []).join(',')
    mid = pos === 'over' ? ` ${actors}` : ` of ${actors}`
  }
  return `Note${d.gap1}${pos}${mid}:${d.colonGap}${text}`
}

export function renderBlockOpen(d: BlockOpenData, changes: { label?: string | null } = {}): string {
  const label = changes.label !== undefined ? changes.label : d.label
  return label === null || label === '' ? d.keyword : `${d.keyword}${d.gap}${label}`
}

export function renderBlockElse(d: BlockElseData, changes: { label?: string | null } = {}): string {
  const label = changes.label !== undefined ? changes.label : d.label
  return label === null || label === '' ? d.keyword : `${d.keyword}${d.gap}${label}`
}

// ---------- 行级解析 ----------

const HEADER_RE = /^([ \t]*)(sequenceDiagram)([ \t\r]*)$/i

interface RawEntry {
  span: Span
  id: string
  data: SequenceElementData
}

const PARTICIPANT_RE = /^(participant|actor)([ \t]+)(\S+)([ \t]+as[ \t]+(.+?))?[ \t]*$/i
const ACTIVATION_RE = /^(activate|deactivate)([ \t]+)(\S+)[ \t]*$/i
const AUTONUMBER_RE = /^autonumber([ \t]+.*)?[ \t]*$/i
const BLOCK_OPEN_RE = /^(loop|alt|opt|par|critical|break)(?:[ \t]+(.*?))?[ \t]*$/i
const BLOCK_ELSE_RE = /^(else|and)(?:[ \t]+(.*?))?[ \t]*$/i
/**
 * 消息：from 箭头 [act] to : 文本（from 懒惰匹配，避免吞掉箭头字符）。
 * 箭头按最长优先：`-->>`（虚线+箭头头，mermaid 亦接受）归一为 `-->` 语义；
 * 箭头后禁止紧跟 `>` / `x`，防止 `--x`（清单外的叉头虚线）被误拆成 `--` 消息。
 */
const MESSAGE_RE = /^(\S+?)([ \t]*)(->>|-->>?|-x|->|--)(?![>x])([+\-]?)([ \t]*)(\S+?)([ \t]*):(.*)$/

function parseNoteLine(raw: string): NoteData | null {
  // raw 是去缩进后的行文本，start（行内偏移）只对 line 有效，这里直接跳过 'Note' 关键字
  const body = raw.slice('Note'.length)
  const m = /^([ \t]+)(over|left of|right of)(.*?):(.*)$/i.exec(body)
  if (m === null) return null
  const posRaw = m[2].toLowerCase() as 'over' | 'left of' | 'right of'
  const pos: NotePos = posRaw === 'over' ? 'over' : posRaw === 'left of' ? 'left' : 'right'
  const midRaw = m[3]
  const actors = pos === 'over' ? parseOverActorList(midRaw) : parseAfterOf(midRaw)
  return {
    kind: 'note',
    gap1: m[1],
    pos,
    mid: midRaw,
    actors,
    colonGap: /^[ \t]*/.exec(m[4])?.[0] ?? '',
    text: m[4].replace(/^[ \t]*/, ''),
  }
}

/** `Note over A,B` → ['A','B']；`Note over A` → ['A']；解析不出时 null */
function parseOverActorList(mid: string): string[] | null {
  const parts = mid.split(',').map((p) => p.trim())
  if (parts.some((p) => p === '' || /\s/.test(p))) return null
  return parts
}

/** `Note right of A` → ['A']；解析不出时 null */
function parseAfterOf(mid: string): string[] | null {
  const m = /^[ \t]+of[ \t]+([^\s:,]+)[ \t]*$/i.exec(mid)
  if (m === null) return null
  return [m[1]]
}

function classifyLine(line: string, lineStart: number, lineNo: number, entries: RawEntry[], counters: Counters): void {
  const firstChar = line.length - line.trimStart().length
  const raw = line.trim()
  const span = { start: lineStart + firstChar, end: lineStart + line.length }

  // header 单独在外层判定

  const autonumber = AUTONUMBER_RE.exec(raw)
  if (autonumber !== null) {
    counters.autonumber++
    entries.push({
      span,
      id: counters.autonumber > 1 ? `autonumber#${counters.autonumber}` : 'autonumber',
      data: { kind: 'autonumber', raw },
    })
    return
  }

  const activation = ACTIVATION_RE.exec(raw)
  if (activation !== null) {
    counters.activation++
    entries.push({
      span,
      id: `act:${counters.activation}`,
      data: { kind: 'activation', keyword: activation[1].toLowerCase() as 'activate' | 'deactivate', gap: activation[2], actorId: activation[3] },
    })
    return
  }

  if (/^note([ \t])/i.test(raw)) {
    const note = parseNoteLine(raw)
    if (note !== null) {
      counters.note++
      entries.push({ span, id: `note:${counters.note}`, data: note })
      return
    }
    return // 解析不了：原样保留
  }

  const participant = PARTICIPANT_RE.exec(raw)
  if (participant !== null) {
    const actorId = participant[3]
    counters.participant.set(actorId, (counters.participant.get(actorId) ?? 0) + 1)
    const count = counters.participant.get(actorId) as number
    entries.push({
      span,
      id: `participant:${actorId}` + (count > 1 ? `#${count}` : ''),
      data: {
        kind: 'participant',
        keyword: participant[1].toLowerCase() as 'participant' | 'actor',
        gap: participant[2],
        actorId,
        aliasRaw: participant[5] ?? null,
      },
    })
    return
  }

  const blockOpen = BLOCK_OPEN_RE.exec(raw)
  if (blockOpen !== null) {
    counters.block++
    entries.push({
      span,
      id: `block:${counters.block}`,
      data: { kind: 'block-open', keyword: blockOpen[1].toLowerCase() as BlockKeyword, gap: ' ', label: blockOpen[2] ?? null },
    })
    return
  }

  const blockElse = BLOCK_ELSE_RE.exec(raw)
  if (blockElse !== null) {
    counters.else++
    entries.push({
      span,
      id: `else:${counters.else}`,
      data: { kind: 'block-else', keyword: blockElse[1].toLowerCase() as 'else' | 'and', gap: ' ', label: blockElse[2] ?? null },
    })
    return
  }

  const message = MESSAGE_RE.exec(raw)
  // from 以 - / > 结尾说明把箭头字符吃进了 from（如清单外的 `A--xB`），不按消息解析
  if (message !== null && !/[->]$/.test(message[1])) {
    counters.message++
    entries.push({
      span,
      id: `message:${counters.message}`,
      data: {
        kind: 'message',
        from: message[1],
        gap1: message[2],
        arrow: (message[3] === '-->>' ? '-->' : message[3]) as MessageArrow,
      arrowRaw: message[3],
        act: message[4] as MessageAct,
        gap2: message[5],
        to: message[6],
        colonGap: /^[ \t]*/.exec(message[8])?.[0] ?? '',
        text: message[8].replace(/^[ \t]*/, ''),
      },
    })
    return
  }

  // 其余（create/destroy、rect、box、注释、无法识别的指令）不解析，verbatim 逐字保留
  void lineNo
}

interface Counters {
  message: number
  note: number
  activation: number
  block: number
  else: number
  autonumber: number
  participant: Map<string, number>
}

// ---------- 解析器 ----------

export class SequenceParser implements DiagramParser {
  parse(source: string): ParseResult {
    try {
      return { ok: true, doc: this.parseDocument(source) }
    } catch (error) {
      if (typeof (error as ParseFailure).line === 'number') {
        const failure = error as ParseFailure
        const err: SourceParseError = { line: failure.line, message: failure.message }
        return { ok: false, error: err }
      }
      throw error
    }
  }

  private parseDocument(source: string): ReturnType<typeof assembleDocument> {
    const entries: RawEntry[] = []
    const counters: Counters = {
      message: 0,
      note: 0,
      activation: 0,
      block: 0,
      else: 0,
      autonumber: 0,
      participant: new Map(),
    }
    const blockStack: number[] = []
    let seenHeader = false
    let lineNo = 0
    let cursor = 0

    for (;;) {
      const nl = source.indexOf('\n', cursor)
      const lineEnd = nl === -1 ? source.length : nl
      const line = source.slice(cursor, lineEnd)
      lineNo++
      const trimmed = line.trim()

      if (trimmed !== '') {
        if (!seenHeader) {
          const header = HEADER_RE.exec(line)
          if (header === null) {
            throw parseFailure(lineNo, '图表必须以 sequenceDiagram 声明开始')
          }
          seenHeader = true
          entries.push({
            span: { start: cursor, end: cursor + line.length },
            id: 'header',
            data: { kind: 'seq-header', keyword: header[2], trailing: header[3] ?? '' },
          })
        } else if (trimmed === 'end') {
          if (blockStack.length === 0) {
            // 清单外块（rect/box）的 end：不解析，原样保留
          } else {
            blockStack.pop()
            const firstChar = line.length - line.trimStart().length
            entries.push({ span: { start: cursor + firstChar, end: cursor + line.length }, id: `end:${lineNo}`, data: { kind: 'block-end' } })
          }
        } else {
          classifyLine(line, cursor, lineNo, entries, counters)
          const last = entries[entries.length - 1]
          if (last !== undefined && last.span.start >= cursor && last.data.kind === 'block-open') {
            blockStack.push(lineNo)
          }
        }
      }

      if (nl === -1) break
      cursor = nl + 1
    }

    if (!seenHeader) {
      throw parseFailure(1, '图表必须以 sequenceDiagram 声明开始')
    }
    if (blockStack.length > 0) {
      throw parseFailure(blockStack[blockStack.length - 1], '逻辑块缺少匹配的 end')
    }
    return assembleDocument(source, entries)
  }

  // ---------- 意图落地（resolveRewrites） ----------

  resolveRewrites(doc: SourceDocument, intent: EditIntent): ReadonlyMap<string, string> | null {
    switch (intent.type) {
      case 'add-participant':
        return this.resolveAddParticipant(doc, intent as never)
      case 'set-participant':
        return this.resolveSetParticipant(doc, intent as never)
      case 'rename-participant':
        return this.resolveRenameParticipant(doc, intent as never)
      case 'delete-participant':
        return this.resolveDeleteParticipant(doc, intent as never)
      case 'toggle-activation':
        return this.resolveToggleActivation(doc, intent as never)
      case 'add-message':
        return this.resolveAddMessage(doc, intent as never)
      case 'set-message':
        return this.resolveSetMessage(doc, intent as never)
      case 'delete-message':
        return this.resolveDeleteMessage(doc, intent as never)
      case 'add-note':
        return this.resolveAddNote(doc, intent as never)
      case 'set-note':
        return this.resolveSetNote(doc, intent as never)
      case 'delete-note':
        return this.resolveDeleteNote(doc, intent as never)
      case 'set-autonumber':
        return this.resolveSetAutonumber(doc, intent as never)
      case 'add-block':
        return this.resolveAddBlock(doc, intent as never)
      case 'set-block-label':
        return this.resolveSetBlockLabel(doc, intent as never)
      case 'add-else':
        return this.resolveAddElse(doc, intent as never)
      case 'set-else-label':
        return this.resolveSetElseLabel(doc, intent as never)
      case 'delete-else':
        return this.resolveDeleteElse(doc, intent as never)
      case 'delete-block':
        return this.resolveDeleteBlock(doc, intent as never)
      default:
        return null
    }
  }

  /** 插入新行：重写锚点元素 span = 原文 + '\n' + 锚点行缩进 + 新行内容 */
  private insertAfter(
    doc: SourceDocument,
    afterElementId: string | undefined,
    newLines: (indent: string) => string[],
  ): Map<string, string> | null {
    const anchor =
      (afterElementId !== undefined ? getElementById(doc, afterElementId) : undefined) ??
      doc.elements[doc.elements.length - 1]
    if (anchor === undefined) return null
    const indent = lineIndent(doc.source, anchor.span.start)
    const inserted = newLines(indent)
      .map((l) => '\n' + indent + l)
      .join('')
    return new Map([[anchor.id, doc.source.slice(anchor.span.start, anchor.span.end) + inserted]])
  }

  // ----- participant -----

  private resolveAddParticipant(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'add-participant' }>,
  ): Map<string, string> | null {
    if (!isValidParticipantId(intent.actorId)) return null
    const keyword = intent.isActor === true ? 'actor' : 'participant'
    const alias = intent.alias !== undefined && intent.alias !== '' ? ` as ${quoteAlias(intent.alias)}` : ''
    return this.insertAfter(doc, intent.afterElementId, () => [`${keyword} ${intent.actorId}${alias}`])
  }

  private resolveSetParticipant(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'set-participant' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, `participant:${intent.actorId}`)
    if (part === undefined || part.element.kind !== 'participant') return null
    const changes: { alias?: string | null } = {}
    if (intent.alias !== undefined) changes.alias = intent.alias
    return new Map([[part.id, renderParticipant(part.element as ParticipantData, changes)]])
  }

  /** 改参与者 id：声明行 + 全部引用它的消息 / note / activate 行 */
  private resolveRenameParticipant(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'rename-participant' }>,
  ): Map<string, string> | null {
    if (!isValidParticipantId(intent.newId)) return null
    const decl = getElementById(doc, `participant:${intent.actorId}`)
    if (decl === undefined || decl.element.kind !== 'participant') return null
    const rewrites = new Map<string, string>([
      [decl.id, renderParticipant(decl.element as ParticipantData, { actorId: intent.newId })],
    ])
    for (const part of doc.elements) {
      const data = part.element
      if (data.kind === 'message') {
        const msg = data as MessageData
        if (msg.from === intent.actorId || msg.to === intent.actorId) {
          rewrites.set(part.id, renderMessage(msg, { from: msg.from === intent.actorId ? intent.newId : undefined, to: msg.to === intent.actorId ? intent.newId : undefined }))
        }
      } else if (data.kind === 'note') {
        const note = data as NoteData
        if (note.actors !== null && note.actors.includes(intent.actorId)) {
          rewrites.set(part.id, renderNote(note, { actors: note.actors.map((a) => (a === intent.actorId ? intent.newId : a)) }))
        }
      } else if (data.kind === 'activation') {
        const act = data as ActivationData
        if (act.actorId === intent.actorId) {
          rewrites.set(part.id, renderActivation(act, {}))
          // renderActivation 不支持改 id：手工拼
          rewrites.set(part.id, `${act.keyword}${act.gap}${intent.newId}`)
        }
      }
    }
    return rewrites
  }

  private referencesActor(part: { element: AnyElement }, actorId: string): boolean {
    const data = part.element
    if (data.kind === 'message') {
      const msg = data as MessageData
      return msg.from === actorId || msg.to === actorId
    }
    if (data.kind === 'note') {
      return (data as NoteData).actors?.includes(actorId) === true
    }
    if (data.kind === 'activation') {
      return (data as ActivationData).actorId === actorId
    }
    return false
  }

  /** 删除参与者：声明与全部引用它的消息 / note / activate 行删除 */
  private resolveDeleteParticipant(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'delete-participant' }>,
  ): Map<string, string> | null {
    const decl = getElementById(doc, `participant:${intent.actorId}`)
    if (decl === undefined || decl.element.kind !== 'participant') return null
    const rewrites = new Map<string, string>([[decl.id, '']])
    for (const part of doc.elements) {
      if (this.referencesActor(part, intent.actorId)) rewrites.set(part.id, '')
    }
    return rewrites
  }

  /** 计算参与者当前净激活状态（+ / activate 计为开，- / deactivate 计为关） */
  private isActive(doc: SourceDocument, actorId: string): boolean {
    let active = false
    for (const part of doc.elements) {
      const data = part.element
      if (data.kind === 'message') {
        const msg = data as MessageData
        if (msg.to === actorId && msg.act === '+') active = true
        if (msg.to === actorId && msg.act === '-') active = false
      } else if (data.kind === 'activation' && (data as ActivationData).actorId === actorId) {
        active = (data as ActivationData).keyword === 'activate'
      }
    }
    return active
  }

  /** 切换参与者生命线激活状态：追加一行 activate/deactivate 到最后一次引用之后 */
  private resolveToggleActivation(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'toggle-activation' }>,
  ): Map<string, string> | null {
    const decl = getElementById(doc, `participant:${intent.actorId}`)
    if (decl === undefined || decl.element.kind !== 'participant') return null
    const active = this.isActive(doc, intent.actorId)
    const referencing = doc.elements.filter((part) => this.referencesActor(part, intent.actorId))
    const last = referencing[referencing.length - 1] ?? decl
    const line = lineAtOffset(doc.source, last.span.start)
    const anchor =
      doc.elements
        .filter((part) => lineAtOffset(doc.source, part.span.start) === line)
        .sort((a, b) => b.span.end - a.span.end)[0] ?? last
    const indent = lineIndent(doc.source, anchor.span.start)
    const keyword = active ? 'deactivate' : 'activate'
    return new Map([[anchor.id, doc.source.slice(anchor.span.start, anchor.span.end) + `\n${indent}${keyword} ${intent.actorId}`]])
  }

  // ----- message -----

  private resolveAddMessage(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'add-message' }>,
  ): Map<string, string> | null {
    if (intent.from === '' || intent.to === '') return null
    const data: MessageData = {
      kind: 'message',
      from: intent.from,
      gap1: '',
      arrow: intent.arrow ?? '->>',
      arrowRaw: intent.arrow ?? '->>',
      act: intent.act ?? '',
      gap2: '',
      to: intent.to,
      colonGap: ' ',
      text: intent.text ?? '',
    }
    return this.insertAfter(doc, intent.afterElementId, () => [renderMessage(data)])
  }

  private resolveSetMessage(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'set-message' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'message') return null
    const changes: Partial<Pick<MessageData, 'from' | 'arrow' | 'act' | 'to' | 'text'>> = {}
    if (intent.arrow !== undefined) changes.arrow = intent.arrow
    if (intent.act !== undefined) changes.act = intent.act
    if (intent.text !== undefined) changes.text = intent.text
    return new Map([[part.id, renderMessage(part.element as MessageData, changes)]])
  }

  private resolveDeleteMessage(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'delete-message' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'message') return null
    return new Map([[part.id, '']])
  }

  // ----- note -----

  private resolveAddNote(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'add-note' }>,
  ): Map<string, string> | null {
    const actors = intent.actors.filter((a) => a !== '')
    if (actors.length === 0) return null
    if (intent.pos !== 'over' && actors.length !== 1) return null
    const data: NoteData = {
      kind: 'note',
      gap1: ' ',
      pos: intent.pos,
      mid: '',
      actors,
      colonGap: ' ',
      text: intent.text ?? '',
    }
    return this.insertAfter(doc, intent.afterElementId, () => [renderNote(data, { actors })])
  }

  private resolveSetNote(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'set-note' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'note') return null
    const note = part.element as NoteData
    const changes: Partial<Pick<NoteData, 'pos' | 'actors' | 'text'>> = {}
    if (intent.pos !== undefined) changes.pos = intent.pos
    if (intent.actors !== undefined) {
      const actors = intent.actors.filter((a) => a !== '')
      if (actors.length === 0) return null
      if (changes.pos ?? note.pos) {
        if ((changes.pos ?? note.pos) !== 'over' && actors.length !== 1) return null
      }
      changes.actors = actors
    }
    // over（两个参与者）改为 left/right 时只保留第一个参与者
    const pos = changes.pos ?? note.pos
    if (pos !== 'over') {
      const actors = changes.actors ?? note.actors
      if (actors !== null && actors.length > 1) changes.actors = [actors[0]]
    }
    if (intent.text !== undefined) changes.text = intent.text
    return new Map([[part.id, renderNote(note, changes)]])
  }

  private resolveDeleteNote(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'delete-note' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'note') return null
    return new Map([[part.id, '']])
  }

  // ----- autonumber -----

  private resolveSetAutonumber(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'set-autonumber' }>,
  ): Map<string, string> | null {
    const existing = doc.elements.find((part) => part.element.kind === 'autonumber')
    if (intent.enabled) {
      if (existing !== undefined) return new Map()
      const header = doc.elements.find((part) => part.element.kind === 'seq-header')
      if (header === undefined) return null
      return new Map([[header.id, doc.source.slice(header.span.start, header.span.end) + '\nautonumber']])
    }
    if (existing === undefined) return new Map()
    return new Map([[existing.id, '']])
  }

  // ----- 逻辑块 -----

  private resolveAddBlock(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'add-block' }>,
  ): Map<string, string> | null {
    const keyword = intent.keyword
    const label = intent.label !== undefined && intent.label !== '' ? ` ${intent.label}` : ''
    return this.insertAfter(doc, intent.afterElementId, () => [`${keyword}${label}`, 'end'])
  }

  /** 块的匹配 end（按 open/end 深度计数） */
  private matchingEnd(doc: SourceDocument, open: { span: Span }): { id: string; span: Span } | null {
    let depth = 1
    for (const part of doc.elements) {
      if (part.span.start <= open.span.start) continue
      if (part.element.kind === 'block-open') depth++
      if (part.element.kind === 'block-end') {
        depth--
        if (depth === 0) return { id: part.id, span: part.span }
      }
    }
    return null
  }

  private resolveSetBlockLabel(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'set-block-label' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'block-open') return null
    return new Map([[part.id, renderBlockOpen(part.element as BlockOpenData, { label: intent.label })]])
  }

  /** 在块的匹配 end 前插入 else/and 行（继承 end 行缩进） */
  private resolveAddElse(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'add-else' }>,
  ): Map<string, string> | null {
    const block = getElementById(doc, intent.blockId)
    if (block === undefined || block.element.kind !== 'block-open') return null
    const end = this.matchingEnd(doc, block)
    if (end === null) return null
    const keyword = intent.keyword ?? 'else'
    const label = intent.label !== undefined && intent.label !== '' ? ` ${intent.label}` : ''
    const indent = lineIndent(doc.source, end.span.start)
    // end 元素 span 不含行首缩进（缩进属于 verbatim），改写体不需要前导换行：
    // 原缩进 + `else 行\n缩进 + end` 恰好接在原缩进之后
    return new Map([[end.id, `${keyword}${label}\n${indent}${doc.source.slice(end.span.start, end.span.end)}`]])
  }

  private resolveSetElseLabel(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'set-else-label' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'block-else') return null
    return new Map([[part.id, renderBlockElse(part.element as BlockElseData, { label: intent.label })]])
  }

  private resolveDeleteElse(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'delete-else' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'block-else') return null
    return new Map([[part.id, '']])
  }

  private resolveDeleteBlock(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'delete-block' }>,
  ): Map<string, string> | null {
    const open = getElementById(doc, intent.elementId)
    if (open === undefined || open.element.kind !== 'block-open') return null
    const end = this.matchingEnd(doc, open)
    if (end === null) return null
    const rewrites = new Map<string, string>()
    for (const part of doc.elements) {
      if (part.span.start >= open.span.start && part.span.end <= end.span.end) {
        rewrites.set(part.id, '')
      }
    }
    return rewrites
  }
}

/** 新建参与者 id 的合法性校验（表单层复用，与意图落地侧同一规则） */
export function isValidParticipantId(id: string): boolean {
  return /^[^\s:,]+$/.test(id) && id !== 'end'
}

export function isValidMessageArrow(arrow: string): arrow is MessageArrow {
  return arrow === '->>' || arrow === '-->' || arrow === '-x' || arrow === '--'
}

// ---------- 编辑意图（工单 06 表单所需集合） ----------

export type SequenceIntent =
  /** 新增参与者声明行 */
  | { type: 'add-participant'; actorId: string; isActor?: boolean; alias?: string; afterElementId?: string }
  /** 改参与者别名；null = 去掉 as 别名 */
  | { type: 'set-participant'; actorId: string; alias?: string | null }
  /** 改参与者 id（声明 + 全部引用） */
  | { type: 'rename-participant'; actorId: string; newId: string }
  /** 删除参与者（声明 + 全部引用它的行） */
  | { type: 'delete-participant'; actorId: string }
  /** 切换参与者生命线激活状态（追加 activate/deactivate 行） */
  | { type: 'toggle-activation'; actorId: string }
  /** 新增消息行 */
  | { type: 'add-message'; from: string; to: string; arrow?: MessageArrow; act?: MessageAct; text?: string; afterElementId?: string }
  /** 改消息（箭头 / 激活简写 / 文本）；未给出的字段保持不变 */
  | { type: 'set-message'; elementId: string; arrow?: MessageArrow; act?: MessageAct; text?: string }
  | { type: 'delete-message'; elementId: string }
  /** 新增 note 行 */
  | { type: 'add-note'; pos: NotePos; actors: string[]; text?: string; afterElementId?: string }
  /** 改 note（位置 / 参与者 / 文本） */
  | { type: 'set-note'; elementId: string; pos?: NotePos; actors?: string[]; text?: string }
  | { type: 'delete-note'; elementId: string }
  /** 开/关 autonumber（开：header 后插入；关：删除 autonumber 行） */
  | { type: 'set-autonumber'; enabled: boolean }
  /** 新增逻辑块（open + end 两行） */
  | { type: 'add-block'; keyword: BlockKeyword; label?: string; afterElementId?: string }
  /** 改逻辑块标签 */
  | { type: 'set-block-label'; elementId: string; label: string | null }
  /** 在块内追加 else/and 分支（插到匹配 end 之前） */
  | { type: 'add-else'; blockId: string; keyword?: 'else' | 'and'; label?: string }
  /** 改 else/and 分支标签 */
  | { type: 'set-else-label'; elementId: string; label: string | null }
  /** 删除 else/and 分支行 */
  | { type: 'delete-else'; elementId: string }
  /** 删除逻辑块（open 到匹配 end 的全部元素） */
  | { type: 'delete-block'; elementId: string }

/** 元素所在行的行首缩进（插入新行时跟随用户缩进习惯） */
function lineIndent(source: string, offset: number): string {
  const lineStart = source.lastIndexOf('\n', Math.max(0, offset - 1)) + 1
  let i = lineStart
  while (i < offset && (source[i] === ' ' || source[i] === '\t')) i++
  return source.slice(lineStart, i)
}

export const sequenceParser = new SequenceParser()
