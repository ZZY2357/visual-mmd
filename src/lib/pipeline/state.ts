import { assembleDocument, getElementById, type SourceDocument } from './document'
import type { DiagramParser, EditIntent, ParseResult, SourceParseError } from './parser'
import { frontmatterEnd } from './frontmatter'
import { stateDescElementId, stateElementId } from './element-id'
import type { Span } from './span'
import { indentLines, insertAfter } from './insert'

/**
 * stateDiagram-v2 完整解析器（more-diagrams 工单 02，语法事实以
 * spec 的 research/state-er-gitgraph.md 为准）：手写、逐行、带 span（ADR-0004）。
 * 可测试承诺：解析后不做修改再重组装，输出与输入逐字相同（verbatim identity）。
 *
 * 覆盖（分层对齐，spec 决策）：
 * - 简单状态：裸 id（可在转移中引用自动创建）、`state "desc" as id`、`id : desc`
 * - 复合状态：`state X { ... }`（可嵌套）与并发分区 `--`
 * - 起止伪状态 `[*]`（只出现在转移端点）；choice/fork/join 伪状态（`<<choice>>` 等标注）
 * - 转移 `A --> B`（含 ` : 标签`）
 * - direction（图表级或复合内部）
 * - note 块（`note left|right of X ... end note`，仅 left/right）
 *
 * 不解析、原样保留（清单外语法不报错，ADR-0008）：classDef / class / ::: 样式语句、
 * frontmatter、`%%` 注释、单行 note 写法、无法识别的行。
 * v1 `stateDiagram` 头同样接受（mermaid 两个关键字都渲染），按 v2 解析、
 * 解析不了的行逐字保留，不主动迁移用户源码。
 *
 * span 约定（与 class 解析器同口径）：元素 span 从该行首个非空白字符起、到行尾
 * （不含换行）；行首缩进与换行留在 verbatim。note 块的 span 从 note 行起、
 * 到 `end note` 行止（含中间的行，删除时整块干净移除）。
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

export interface StateHeaderData {
  kind: 'state-header'
  /** 原文关键字（stateDiagram 或 stateDiagram-v2），逐字保留 */
  keyword: string
  trailing: string
}

/**
 * `state ...` 声明行。四种形态：
 * - `state id`（bare）
 * - `state "desc" as id`（引号描述 + as 别名）
 * - `state id <<choice>>` 等伪状态标注（tail 内）
 * - `state id {`（复合状态开行，tail 含 `{`）
 * tail 是 id 之后到行尾的原文（含 `<<...>>` 与/或 `{`），逐字保留。
 */
export interface StateDeclData {
  kind: 'state-decl'
  /** `state` 与后文之间的空白 */
  gap: string
  /** 引号描述；bare 形态为 null */
  desc: string | null
  /** 引号字符（" 或 '） */
  quote: string | null
  /** 闭引号与 `as` 之间的空白 */
  descAfter: string
  /** `as` 之后的空白；非引号形态为 null */
  asGap: string | null
  id: string
  /** id 之后到行尾的原文（` <<choice>>`、` {` 等），逐字保留 */
  tail: string
  /** tail 是否含 `{`（复合状态开行） */
  openBrace: boolean
  /** `<<...>>` 内的标注原文（choice / fork / join）；无标注 null。仅投影语义用 */
  pseudo: string | null
}

export function renderStateDecl(d: StateDeclData, changes: { desc?: string | null } = {}): string {
  const desc = changes.desc !== undefined ? changes.desc : d.desc
  let s = `state${d.gap}`
  if (d.quote !== null && desc !== null && desc !== '') {
    s += `${d.quote}${desc}${d.quote}${d.descAfter}as${d.asGap ?? ' '}`
  }
  return s + `${d.id}${d.tail}`
}

/** `id : desc` 描述行 */
export interface StateDescData {
  kind: 'state-desc'
  id: string
  /** id 与 `:` 之间的空白 */
  colonRaw: string
  /** 冒号之后的描述原文 */
  desc: string
}

export function renderStateDesc(d: StateDescData, changes: { desc?: string } = {}): string {
  return `${d.id}${d.colonRaw}:${changes.desc ?? d.desc}`
}

/** 转移 `A --> B : label`；端点可为 `[*]` */
export interface StateTransitionData {
  kind: 'state-transition'
  from: string
  /** from 与 `-->` 之间的空白 */
  gap1: string
  /** `-->` 与 to 之间的空白 */
  gap2: string
  to: string
  /** 冒号段原文（含前置空白与 `:`）；无标签时 '' */
  colonRaw: string
  /** 标签正文（冒号之后原样） */
  label: string
}

export function renderStateTransition(d: StateTransitionData, changes: { label?: string | null } = {}): string {
  let tail = d.colonRaw + d.label
  if (changes.label !== undefined) {
    tail = changes.label === null || changes.label === '' ? '' : `${d.colonRaw !== '' ? d.colonRaw : ' : '}${changes.label}`
  }
  return `${d.from}${d.gap1}-->${d.gap2}${d.to}${tail}`
}

export interface StateDirectionData {
  kind: 'state-direction'
  gap: string
  /** 取值原文（逐字记录；合法性由 set-direction 落地侧白名单把关） */
  value: string
}

export function renderStateDirection(d: StateDirectionData, changes: { value?: string } = {}): string {
  return `direction${d.gap}${changes.value ?? d.value}`
}

/** 并发分区行（`--`，复合状态内部） */
export interface StatePartitionData {
  kind: 'state-partition'
}

/** note 块：span 覆盖 note 行到 end note 行（含中间行） */
export interface StateNoteData {
  kind: 'state-note'
  /** note 行的行首缩进（重建块时跟随） */
  indent: string
  side: 'left' | 'right'
  target: string
  /** note 行与 end note 行之间的原文（含各行换行） */
  body: string
}

export function renderStateNote(d: StateNoteData, changes: { text?: string } = {}): string {
  const body = changes.text !== undefined ? changes.text : d.body
  return `${d.indent}note ${d.side} of ${d.target}\n${body}${d.indent}end note`
}

export interface StateEndData {
  kind: 'state-end'
}

export type StateElementData =
  | StateHeaderData
  | StateDeclData
  | StateDescData
  | StateTransitionData
  | StateDirectionData
  | StatePartitionData
  | StateNoteData
  | StateEndData

// ---------- 行级解析 ----------

const HEADER_RE = /^([ \t]*)(stateDiagram(?:-v2)?)([ \t\r]*)$/
const DIRECTION_RE = /^direction([ \t]+)(\S+)[ \t\r]*$/
const NOTE_OPEN_RE = /^note([ \t]+)(left|right)([ \t]+)of([ \t]+)([^\s:{}"<>]+)[ \t\r]*$/
const NOTE_CLOSE_RE = /^end([ \t]+)note[ \t\r]*$/i
/** 进入解析的伪状态标注集合（mermaid 实际支持的三个；其余 `<<...>>` 行保持 verbatim） */
const PSEUDO_KINDS = ['choice', 'fork', 'join']
/** mermaid 的 stateDiagram 词法只接受这四种方向 */
const STATE_DIRECTIONS = ['TB', 'BT', 'RL', 'LR']

/** 转移端点：`[*]` 或 id（字母数字下划线连字符点 + 拉丁扩展/Unicode） */
export function isStateEndpoint(text: string): boolean {
  return text === '[*]' || /^[A-Za-z0-9_.\u00C0-\uFFFF-]+$/.test(text)
}

function parseStateDeclLine(line: string, firstChar: number): StateDeclData | null {
  const m = /^state([ \t]+)(.*)$/.exec(line.slice(firstChar))
  if (m === null) return null
  let rest = m[2]
  // tail：id（或 desc-as 头）之后到行尾（逐字保留；` {` 开复合）
  let tail = ''
  const braceAt = rest.indexOf('{')
  if (braceAt !== -1) {
    // `{` 之后必须只有尾部空白：单行复合 `state a { b }` 不拆解，保持 verbatim
    if (/[^\s\r]/.test(rest.slice(braceAt + 1))) return null
    const before = rest.slice(0, braceAt)
    // `{` 前的空白并入 tail（原文保留），头部位只剩 id / desc-as
    const preWs = before.slice(before.trimEnd().length)
    tail = preWs + rest.slice(braceAt)
    rest = before.trimEnd()
  } else {
    const trailing = /[ \t\r]+$/.exec(rest)?.[0] ?? ''
    tail = trailing
    rest = rest.slice(0, rest.length - trailing.length)
  }
  // 伪状态标注：`<<choice>>` 结尾（摘出来放回 tail 前段，保持原文可重组装）
  let pseudo: string | null = null
  const pm = /^(.*?)([ \t]*)<<([a-zA-Z]+)>>$/.exec(rest)
  if (pm !== null) {
    if (!PSEUDO_KINDS.includes(pm[3].toLowerCase())) return null
    pseudo = pm[3].toLowerCase()
    rest = pm[1]
    tail = `${pm[2]}<<${pm[3]}>>` + tail
  }
  // 引号描述 + as 别名：`state "desc" as id`
  const qm = /^"([^]*)"([ \t]+)as([ \t]+)([^\s{}"<>:]+)[ \t\r]*$/.exec(rest)
  if (qm !== null) {
    if (!isStateEndpoint(qm[4]) || qm[4] === '[*]') return null
    return {
      kind: 'state-decl',
      gap: m[1],
      desc: qm[1],
      quote: '"',
      descAfter: qm[2],
      asGap: qm[3],
      id: qm[4],
      tail,
      openBrace: braceAt !== -1,
      pseudo,
    }
  }
  // bare：`state id`
  if (/^[^\s{}"<>:]+$/.test(rest)) {
    if (!isStateEndpoint(rest) || rest === '[*]') return null
    return { kind: 'state-decl', gap: m[1], desc: null, quote: null, descAfter: '', asGap: null, id: rest, tail, openBrace: braceAt !== -1, pseudo }
  }
  return null
}

function parseTransitionLine(line: string, firstChar: number): StateTransitionData | null {
  const arrow = line.indexOf('-->', firstChar)
  if (arrow === -1) return null
  const fromRaw = line.slice(firstChar, arrow)
  const gap1 = fromRaw.slice(fromRaw.trimEnd().length)
  const from = fromRaw.trimEnd()
  if (!isStateEndpoint(from)) return null
  const rest = line.slice(arrow + 3)
  const colonAt = rest.indexOf(':')
  if (colonAt !== -1) {
    const head = rest.slice(0, colonAt)
    const gap2 = head.slice(0, head.length - head.trimStart().length)
    const to = head.trim()
    if (!isStateEndpoint(to)) return null
    const colonRaw = head.slice(head.trimEnd().length) + ':'
    return { kind: 'state-transition', from, gap1, gap2, to, colonRaw, label: rest.slice(colonAt + 1) }
  }
  // 无标签：to 必须是单个端点 token，其后只能是尾部空白，否则整行原样保留
  const gap2 = rest.slice(0, rest.length - rest.trimStart().length)
  const to = rest.trim()
  if (!isStateEndpoint(to) || /[ \t]/.test(to)) return null
  return { kind: 'state-transition', from, gap1, gap2, to, colonRaw: '', label: '' }
}

function parseDescLine(line: string, firstChar: number): StateDescData | null {
  const m = /^([^\s:{}"<>]+)([ \t]*):(.*)$/.exec(line.slice(firstChar))
  if (m === null) return null
  if (!isStateEndpoint(m[1]) || m[1] === '[*]') return null
  return { kind: 'state-desc', id: m[1], colonRaw: m[2], desc: m[3] }
}

interface RawEntry {
  span: Span
  id: string
  data: StateElementData
}

interface Counters {
  transition: number
  direction: number
  partition: number
  note: number
  end: number
  declOccurrence: Map<string, number>
  descOccurrence: Map<string, number>
}

export class StateParser implements DiagramParser {
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
      transition: 0,
      direction: 0,
      partition: 0,
      note: 0,
      end: 0,
      declOccurrence: new Map(),
      descOccurrence: new Map(),
    }
    // 未闭合的复合状态块：`state X {` 压栈，`}` 出栈
    const blockStack: Array<{ lineNo: number }> = []
    // 打开的 note 块（note 内的行不参与解析）
    let noteOpen: {
      lineNo: number
      start: number
      indent: string
      side: 'left' | 'right'
      target: string
      bodyStart: number
    } | null = null
    let seenHeader = false
    // 文首 frontmatter 块（主题等配置）不参与解析，整体 verbatim 保留（工单 11）
    const bodyStart = frontmatterEnd(source)
    let lineNo = bodyStart === 0 ? 0 : source.slice(0, bodyStart).split('\n').length - 1
    let cursor = bodyStart

    for (;;) {
      const nl = source.indexOf('\n', cursor)
      const lineEnd = nl === -1 ? source.length : nl
      const line = source.slice(cursor, lineEnd)
      lineNo++
      const trimmed = line.trim()

      if (noteOpen !== null) {
        if (NOTE_CLOSE_RE.test(trimmed)) {
          const firstChar = line.length - line.trimStart().length
          counters.note++
          entries.push({
            span: { start: noteOpen.start, end: cursor + firstChar + line.slice(firstChar).length },
            id: `note:${counters.note}`,
            data: {
              kind: 'state-note',
              indent: noteOpen.indent,
              side: noteOpen.side,
              target: noteOpen.target,
              body: source.slice(noteOpen.bodyStart, cursor),
            },
          })
          noteOpen = null
        }
        // note 体内的其它行并入 body（含空行与换行），不再参与解析
        if (nl === -1) break
        cursor = nl + 1
        continue
      }

      if (trimmed !== '') {
        if (!seenHeader) {
          const header = HEADER_RE.exec(line)
          if (header === null) {
            throw parseFailure(lineNo, '图表必须以 stateDiagram-v2 声明开始')
          }
          seenHeader = true
          entries.push({
            span: { start: cursor, end: cursor + line.length },
            id: 'header',
            data: { kind: 'state-header', keyword: header[2], trailing: header[3] ?? '' },
          })
        } else if (trimmed === '}') {
          const top = blockStack.pop()
          if (top === undefined) {
            throw parseFailure(lineNo, '多余的 }（没有与之匹配的复合状态块）')
          }
          const firstChar = line.length - line.trimStart().length
          counters.end++
          entries.push({
            span: { start: cursor + firstChar, end: cursor + line.length },
            id: `state-end:${counters.end}`,
            data: { kind: 'state-end' },
          })
        } else {
          const firstChar = line.length - line.trimStart().length
          const span = { start: cursor + firstChar, end: cursor + line.length }

          if (trimmed === '--') {
            counters.partition++
            entries.push({ span, id: `partition:${counters.partition}`, data: { kind: 'state-partition' } })
          } else {
            const noteOpenMatch = NOTE_OPEN_RE.exec(line.slice(firstChar))
            if (noteOpenMatch !== null) {
              noteOpen = {
                lineNo,
                start: span.start,
                indent: line.slice(0, firstChar),
                side: noteOpenMatch[2] as 'left' | 'right',
                target: noteOpenMatch[5],
                bodyStart: cursor + line.length + 1,
              }
            } else {
              const decl = parseStateDeclLine(line, firstChar)
              if (decl !== null) {
                const n = (counters.declOccurrence.get(decl.id) ?? 0) + 1
                counters.declOccurrence.set(decl.id, n)
                entries.push({ span, id: stateElementId(decl.id, n), data: decl })
                if (decl.openBrace) blockStack.push({ lineNo })
              } else {
                const transition = parseTransitionLine(line, firstChar)
                if (transition !== null) {
                  counters.transition++
                  entries.push({ span, id: `transition:${counters.transition}`, data: transition })
                } else {
                  const direction = DIRECTION_RE.exec(line.slice(firstChar))
                  if (direction !== null) {
                    counters.direction++
                    entries.push({
                      span,
                      id: `direction:${counters.direction}`,
                      data: { kind: 'state-direction', gap: direction[1], value: direction[2] },
                    })
                  } else {
                    const desc = parseDescLine(line, firstChar)
                    if (desc !== null) {
                      const n = (counters.descOccurrence.get(desc.id) ?? 0) + 1
                      counters.descOccurrence.set(desc.id, n)
                      entries.push({ span, id: stateDescElementId(desc.id, n), data: desc })
                    } else if (blockStack.length > 0 && /^[^\s{}"<>:]+$/.test(trimmed) && isStateEndpoint(trimmed)) {
                      // 复合状态内部的裸 id 行 = 内部状态声明（mermaid 语义）；
                      // 解析成元素才能被选中 / 删除复合时整体清理。顶层的裸 id 保持
                      // 「由转移引用自动创建」的隐式状态语义，不在此解析。
                      const n = (counters.declOccurrence.get(trimmed) ?? 0) + 1
                      counters.declOccurrence.set(trimmed, n)
                      entries.push({
                        span,
                        id: stateElementId(trimmed, n),
                        data: { kind: 'state-decl', gap: '', desc: null, quote: null, descAfter: '', asGap: null, id: trimmed, tail: '', openBrace: false, pseudo: null },
                      })
                    }
                    // 其余（classDef / class / ::: / 单行 note / 注释 / 生僻语法）不解析，逐字保留
                  }
                }
              }
            }
          }
        }
      }

      if (nl === -1) break
      cursor = nl + 1
    }

    if (!seenHeader) {
      throw parseFailure(1, '图表必须以 stateDiagram-v2 声明开始')
    }
    if (noteOpen !== null) {
      throw parseFailure(noteOpen.lineNo, 'note 缺少 end note')
    }
    if (blockStack.length > 0) {
      throw parseFailure(blockStack[blockStack.length - 1].lineNo, '复合状态块缺少匹配的 }')
    }
    return assembleDocument(source, entries)
  }

  // ---------- 意图落地（resolveRewrites） ----------

  resolveRewrites(doc: SourceDocument, intent: EditIntent): ReadonlyMap<string, string> | null {
    switch (intent.type) {
      case 'add-state':
        return this.resolveAddState(doc, intent as never)
      case 'set-state-desc':
        return this.resolveSetStateDesc(doc, intent as never)
      case 'delete-state':
        return this.resolveDeleteState(doc, intent as never)
      case 'add-transition':
        return this.resolveAddTransition(doc, intent as never)
      case 'set-transition-label':
        return this.resolveSetTransitionLabel(doc, intent as never)
      case 'delete-transition':
        return this.resolveDeleteTransition(doc, intent as never)
      case 'add-note':
        return this.resolveAddNote(doc, intent as never)
      case 'set-note-text':
        return this.resolveSetNoteText(doc, intent as never)
      case 'delete-note':
        return this.resolveDeleteNote(doc, intent as never)
      case 'set-direction':
        return this.resolveSetDirection(doc, intent as never)
      default:
        return null
    }
  }

  private declPart(doc: SourceDocument, elementId: string) {
    const part = getElementById(doc, elementId)
    if (part === undefined || part.element.kind !== 'state-decl') return null
    return part
  }

  /** 复合状态开行的匹配 `}`（按 state-decl(openBrace) / state-end 深度计数） */
  private matchingEnd(doc: SourceDocument, decl: { span: Span }): { id: string; span: Span } | null {
    let depth = 1
    for (const part of doc.elements) {
      if (part.span.start <= decl.span.start) continue
      if (part.element.kind === 'state-decl' && (part.element as StateDeclData).openBrace) depth++
      if (part.element.kind === 'state-end') {
        depth--
        if (depth === 0) return { id: part.id, span: part.span }
      }
    }
    return null
  }

  /** 复合 `}` 行的行首缩进（新状态行跟随） */
  private endIndentOf(doc: SourceDocument, endSpan: Span): string {
    const lineStart = doc.source.lastIndexOf('\n', Math.max(0, endSpan.start - 1)) + 1
    return /^[ \t]*/.exec(doc.source.slice(lineStart, endSpan.start))?.[0] ?? ''
  }

  private resolveAddState(
    doc: SourceDocument,
    intent: Extract<StateIntent, { type: 'add-state' }>,
  ): Map<string, string> | null {
    if (!isValidStateId(intent.id)) return null
    const line =
      intent.desc !== undefined && intent.desc !== '' ? `state "${intent.desc}" as ${intent.id}` : `state ${intent.id}`
    if (intent.parentElementId !== undefined) {
      // 进复合状态：插到其匹配 } 之前，缩进跟随 } 行
      const decl = this.declPart(doc, intent.parentElementId)
      if (decl === null || !(decl.element as StateDeclData).openBrace) return null
      const end = this.matchingEnd(doc, decl)
      if (end === null) return null
      const indent = this.endIndentOf(doc, end.span)
      return new Map([[end.id, `${line}\n${indent}${doc.source.slice(end.span.start, end.span.end)}`]])
    }
    return insertAfter(doc, { afterElementId: intent.afterElementId, render: (indent) => indentLines(indent, [line]) })
  }

  private resolveSetStateDesc(
    doc: SourceDocument,
    intent: Extract<StateIntent, { type: 'set-state-desc' }>,
  ): Map<string, string> | null {
    const next = intent.desc === null ? '' : intent.desc.replace(/[\r\n]+/g, ' ')
    // 已有 `id : desc` 行 → 原地改写（或删除）
    const descPart = [...doc.elements]
      .reverse()
      .find((p) => p.element.kind === 'state-desc' && (p.element as StateDescData).id === intent.id)
    if (descPart !== undefined) {
      if (next === '') return new Map([[descPart.id, '']])
      // 保留原文冒号后的前导空白习惯（`idle : x` 的冒号后空格存在 desc 原文里）
      const lead = /^[ \t]*/.exec((descPart.element as StateDescData).desc)?.[0] ?? ''
      return new Map([[descPart.id, renderStateDesc(descPart.element as StateDescData, { desc: lead + next })]])
    }
    // 引号描述形态 → 原地改写（清空 = 还原 bare 声明）
    const declPart = doc.elements.find(
      (p) => p.element.kind === 'state-decl' && (p.element as StateDeclData).id === intent.id,
    )
    if (declPart !== undefined) {
      const decl = declPart.element as StateDeclData
      if (decl.desc !== null) {
        return new Map([[declPart.id, renderStateDecl(decl, { desc: next === '' ? null : next })]])
      }
      if (next === '') return new Map()
      // bare 声明：在声明行后补一行 `id : desc`（缩进跟声明行）
      const lineStart = doc.source.lastIndexOf('\n', Math.max(0, declPart.span.start - 1)) + 1
      const indent = /^[ \t]*/.exec(doc.source.slice(lineStart, declPart.span.start))?.[0] ?? ''
      // 冒号后的空格属 desc 原文（`id : x` 的 desc 以空格开头），构造行随此口径
      const descLine = renderStateDesc({ kind: 'state-desc', id: intent.id, colonRaw: ' ', desc: ` ${next}` })
      return new Map([[declPart.id, doc.source.slice(declPart.span.start, declPart.span.end) + `\n${indent}${descLine}`]])
    }
    if (next === '') return new Map()
    // 仅被转移引用的隐式状态：在文档末尾补声明 + 描述行
    return insertAfter(doc, {
      render: (indent) => indentLines(indent, [`state ${intent.id}`, `${intent.id} : ${next}`]),
    })
  }

  private resolveDeleteState(
    doc: SourceDocument,
    intent: Extract<StateIntent, { type: 'delete-state' }>,
  ): Map<string, string> | null {
    const rewrites = new Map<string, string>()
    const declPart = doc.elements.find(
      (p) => p.element.kind === 'state-decl' && (p.element as StateDeclData).id === intent.id,
    )
    if (declPart !== undefined) {
      rewrites.set(declPart.id, '')
      if ((declPart.element as StateDeclData).openBrace) {
        const end = this.matchingEnd(doc, declPart)
        if (end === null) return null
        for (const part of doc.elements) {
          if (part.span.start >= declPart.span.start && part.span.end <= end.span.end) rewrites.set(part.id, '')
        }
        rewrites.set(end.id, '')
      }
    }
    for (const part of doc.elements) {
      const data = part.element
      if (data.kind === 'state-desc') {
        if ((data as StateDescData).id === intent.id) rewrites.set(part.id, '')
      } else if (data.kind === 'state-transition') {
        const t = data as StateTransitionData
        if (t.from === intent.id || t.to === intent.id) rewrites.set(part.id, '')
      } else if (data.kind === 'state-note') {
        if ((data as StateNoteData).target === intent.id) rewrites.set(part.id, '')
      }
    }
    return rewrites.size > 0 ? rewrites : null
  }

  private resolveAddTransition(
    doc: SourceDocument,
    intent: Extract<StateIntent, { type: 'add-transition' }>,
  ): Map<string, string> | null {
    if (!isValidStateEndpoint(intent.from) || !isValidStateEndpoint(intent.to)) return null
    const data: StateTransitionData = {
      kind: 'state-transition',
      from: intent.from,
      gap1: ' ',
      gap2: ' ',
      to: intent.to,
      colonRaw: intent.label !== undefined && intent.label !== '' ? ' : ' : '',
      label: intent.label ?? '',
    }
    return insertAfter(doc, { afterElementId: intent.afterElementId, render: (indent) => indentLines(indent, [renderStateTransition(data)]) })
  }

  private resolveSetTransitionLabel(
    doc: SourceDocument,
    intent: Extract<StateIntent, { type: 'set-transition-label' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'state-transition') return null
    return new Map([[part.id, renderStateTransition(part.element as StateTransitionData, { label: intent.label })]])
  }

  private resolveDeleteTransition(
    doc: SourceDocument,
    intent: Extract<StateIntent, { type: 'delete-transition' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'state-transition') return null
    return new Map([[part.id, '']])
  }

  private resolveAddNote(
    doc: SourceDocument,
    intent: Extract<StateIntent, { type: 'add-note' }>,
  ): Map<string, string> | null {
    const text = (intent.text ?? '').trim()
    if (text === '') return null
    if (intent.side !== 'left' && intent.side !== 'right') return null
    if (!isValidStateId(intent.target)) return null
    const lines = [`note ${intent.side} of ${intent.target}`, `    ${text}`, 'end note']
    return insertAfter(doc, { afterElementId: intent.afterElementId, render: (indent) => indentLines(indent, lines) })
  }

  private resolveSetNoteText(
    doc: SourceDocument,
    intent: Extract<StateIntent, { type: 'set-note-text' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'state-note') return null
    const note = part.element as StateNoteData
    const text = intent.text.replace(/[\r\n]+/g, ' ').trim()
    if (text === '') return null
    // body 段以换行收尾（renderStateNote 直接拼接 end note 行）
    return new Map([[part.id, renderStateNote(note, { text: `    ${text}\n` })]])
  }

  private resolveDeleteNote(
    doc: SourceDocument,
    intent: Extract<StateIntent, { type: 'delete-note' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'state-note') return null
    return new Map([[part.id, '']])
  }

  /**
   * 设置图表方向：有 direction 行就原地改写，没有就插到表头之后；`null` = 删除该行
   * （跟随 mermaid 默认）。取值按 mermaid 词法白名单把关（TB/BT/RL/LR，`TD` 不是合法别名）。
   */
  private resolveSetDirection(
    doc: SourceDocument,
    intent: Extract<StateIntent, { type: 'set-direction' }>,
  ): Map<string, string> | null {
    const existing = doc.elements.find((part) => part.element.kind === 'state-direction')
    if (intent.direction === null) {
      return existing === undefined ? new Map() : new Map([[existing.id, '']])
    }
    const value = intent.direction.toUpperCase()
    if (!STATE_DIRECTIONS.includes(value)) return null
    if (existing !== undefined) {
      return new Map([[existing.id, renderStateDirection(existing.element as StateDirectionData, { value })]])
    }
    const header = doc.elements.find((part) => part.element.kind === 'state-header')
    if (header === undefined) return null
    return insertAfter(doc, { afterElementId: header.id, render: (indent) => indentLines(indent, [`direction ${value}`]) })
  }
}

export const stateParser = new StateParser()

// ---------- 校验（表单层复用，与落地侧同一规则） ----------

/** 新建状态 id 的合法性：不能为空，不能含空白、冒号、引号、花括号、尖括号 */
export function isValidStateId(id: string): boolean {
  return id !== '' && !/[\s:{}"<>]/.test(id) && id !== '[*]'
}

/** 转移端点合法性：状态 id 或起止伪状态 `[*]` */
export function isValidStateEndpoint(endpoint: string): boolean {
  return endpoint === '[*]' || isValidStateId(endpoint)
}

// ---------- 编辑意图（工单 02 表单/画布所需集合） ----------

export type StateIntent =
  /** 新增状态行；parentElementId = 复合状态的声明 elementId（插进该复合内部） */
  | { type: 'add-state'; id: string; desc?: string; parentElementId?: string; afterElementId?: string }
  /** 改状态描述（`id : desc` 的 desc 段 / 引号描述）；null/空 = 删除描述 */
  | { type: 'set-state-desc'; id: string; desc: string | null }
  /** 删除状态（声明、描述、复合块整体、触及转移与 note 由管线级联清理） */
  | { type: 'delete-state'; id: string }
  /** 新增转移行（端点可为 `[*]`） */
  | { type: 'add-transition'; from: string; to: string; label?: string; afterElementId?: string }
  /** 改转移标签；null/空 = 去掉标签 */
  | { type: 'set-transition-label'; elementId: string; label: string | null }
  | { type: 'delete-transition'; elementId: string }
  /** 新增 note 块（仅 left / right，目标状态必填） */
  | { type: 'add-note'; side: 'left' | 'right'; target: string; text: string; afterElementId?: string }
  | { type: 'set-note-text'; elementId: string; text: string }
  | { type: 'delete-note'; elementId: string }
  /** 设置图表方向；null = 删除 direction 行（跟随 mermaid 默认） */
  | { type: 'set-direction'; direction: string | null }
