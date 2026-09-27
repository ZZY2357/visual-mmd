import { assembleDocument, getElementById, type SourceDocument } from './document'
import type { DiagramParser, EditIntent, ParseResult, SourceParseError } from './parser'
import type { Span } from './span'
import {
  parseClassDefLine,
  renderClassDef,
  renderClassDefRaw,
  type ClassDefData,
} from './flowchart'

/**
 * class 完整解析器（工单 07，语法范围以 ADR-0005 清单为准）：
 * 手写、逐行、带 span（ADR-0004）。可测试承诺：解析后不做修改再重组装，
 * 输出与输入逐字相同（verbatim identity）。
 *
 * 覆盖（ADR-0005）：
 * - 类声明（class X / class X~泛型~ / 花括号成员块）
 * - 成员（属性/方法，可见性 + - # ~、泛型 ~T~）：一行式 `X : +成员` 与块内成员
 * - 全部关系类型：<|--（继承）、<|..（实现）、*--（组合）、o--（聚合）、
 *   -->（关联）、..>（依赖），含标签与 "基数"
 * - note for X "文本" / note "浮动文本"
 * - classDef（与 flowchart 同语法，复用其解析与渲染）
 *
 * 不解析、原样保留（清单外语法不报错，ADR-0008）：linkStyle、CSS 注入
 * （cssClass / style）、direction、注释、空行、以及一切无法识别的行。
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

export interface ClassHeaderData {
  kind: 'class-header'
  keyword: string
  trailing: string
}

export interface ClassDeclData {
  kind: 'class'
  name: string
  gap: string
  /** 泛型原文（含两侧 ~，如 `~Shape~`）；无泛型时 null */
  genericRaw: string | null
  /** 名字（含泛型）之后到行尾的原文（如 ` {` 或 `{`）；逐字保留 */
  tail: string
  /** 是否以 { 开块（tail 含 {） */
  openBrace: boolean
}

export function renderClassDecl(
  d: ClassDeclData,
  changes: { name?: string; generic?: string | null } = {},
): string {
  const name = changes.name ?? d.name
  const generic =
    changes.generic === undefined
      ? d.genericRaw
      : changes.generic === null || changes.generic === ''
        ? null
        : `~${changes.generic}~`
  return `class${d.gap}${name}${generic ?? ''}${d.tail}`
}

/** 可见性标记：+ 公有 / - 私有 / # 受保护 / ~ 包内 / '' 未标注 */
export type Visibility = '+' | '-' | '#' | '~' | ''

export interface MemberData {
  kind: 'member'
  /** 一行式（`X : 成员`）时为宿主类名；块内成员为 null（宿主由块决定） */
  ownerName: string | null
  /** 'line' = 一行式；'block' = 花括号块内成员行 */
  form: 'line' | 'block'
  /** 一行式时冒号及其两侧空白的原文（如 ` : `）；块内为 '' */
  colonRaw: string
  vis: Visibility
  /** 可见性之后的空白（可为 ''） */
  gap: string
  /** 成员正文（可见性之后的部分，原样） */
  raw: string
}

export function renderMember(m: MemberData, changes: { ownerName?: string; vis?: Visibility; text?: string } = {}): string {
  const owner = changes.ownerName ?? m.ownerName
  const vis = changes.vis ?? m.vis
  const raw = changes.text ?? m.raw
  const core = `${vis}${m.gap}${raw}`
  return m.form === 'line' ? `${owner}${m.colonRaw}${core}` : core
}

export type RelationKind = '<|--' | '<|..' | '*--' | 'o--' | '-->' | '..>'

export const RELATION_KINDS: RelationKind[] = ['<|--', '<|..', '*--', 'o--', '-->', '..>']

export interface RelationData {
  kind: 'relation'
  from: string
  /** 起点类泛型原文（含 ~）；无则 null */
  fromGenericRaw: string | null
  /** 起点名字之后到箭头之前的原文（含基数引号与空白），逐字保留 */
  preArrowRaw: string
  arrow: RelationKind
  /** 箭头之后到终点名字之前的原文（含基数引号与空白），逐字保留 */
  postArrowRaw: string
  to: string
  /** 终点类泛型原文；无则 null */
  toGenericRaw: string | null
  /** 冒号及其前空白的原文（无标签时为 ''） */
  colonRaw: string
  /** 标签正文（冒号之后原样） */
  label: string
}

/** 基数引号段原文 → 基数值；不含引号时 null */
export function cardOf(raw: string): string | null {
  const m = /^\s*"([^"]*)"\s*$/.exec(raw)
  return m !== null ? m[1] : null
}

/** 基数新值的规范渲染（mermaid 要求引号两侧留空白） */
function cardRaw(card: string | null): string {
  return card === null || card === '' ? ' ' : ` "${card}" `
}

export function renderRelation(
  d: RelationData,
  changes: { from?: string; to?: string; arrow?: RelationKind; cardFrom?: string | null; cardTo?: string | null; label?: string | null } = {},
): string {
  const from = changes.from ?? d.from
  const to = changes.to ?? d.to
  const arrow = changes.arrow ?? d.arrow
  const preArrow = changes.cardFrom !== undefined ? cardRaw(changes.cardFrom) : d.preArrowRaw
  const postArrow = changes.cardTo !== undefined ? cardRaw(changes.cardTo) : d.postArrowRaw
  let tail = d.colonRaw + d.label
  if (changes.label !== undefined) {
    tail = changes.label === null || changes.label === '' ? '' : ` : ${changes.label}`
  }
  return `${from}${d.fromGenericRaw ?? ''}${preArrow}${arrow}${postArrow}${to}${d.toGenericRaw ?? ''}${tail}`
}

export interface NoteData {
  kind: 'note'
  /** note 与后文之间的空白 */
  gap: string
  /** 'for' 之后的空白；null = 浮动 note（无 for 段） */
  forGap: string | null
  /** 目标类名；浮动 note 为 null */
  forClass: string | null
  /** 类名与引号之间的空白 */
  gap2: string
  /** 引号字符（" 或 '） */
  quote: string
  text: string
  /** 闭引号之后的行尾残留（逐字保留） */
  trailing: string
}

export function renderNote(d: NoteData, changes: { forClass?: string | null; text?: string } = {}): string {
  const forClass = changes.forClass !== undefined ? changes.forClass : d.forClass
  const text = changes.text ?? d.text
  if (forClass === null || forClass === '') {
    return `note${d.gap}${d.quote}${text}${d.quote}${d.trailing}`
  }
  return `note${d.gap}for${d.forGap ?? ' '}${forClass}${d.gap2}${d.quote}${text}${d.quote}${d.trailing}`
}

export type ClassElementData =
  | ClassHeaderData
  | ClassDeclData
  | MemberData
  | RelationData
  | NoteData
  | ClassDefData
  | { kind: 'class-end' }

// ---------- 行级解析 ----------

const HEADER_RE = /^([ \t]*)(classDiagram)([ \t\r]*)$/i
const CLASS_DECL_RE = /^class([ \t]+)([^\s~{]+)(~[^~]*~)?([ \t]*\{[ \t\r]*|[ \t\r]*)$/
const ONE_LINE_MEMBER_RE = /^([^\s~:{}]+)((?:[ \t]*):[ \t]*)((?:[+\-#~])?)([ \t]*)(.*)$/
const NOTE_FOR_RE = /^note([ \t]+)for([ \t]+)([^\s"']+)([ \t]+)(["'])(.*)\5([ \t\r]*)$/i
const NOTE_FLOAT_RE = /^note([ \t]+)(["'])(.*)\2([ \t\r]*)$/i

const NAME_RE = /^[A-Za-z0-9_\u00C0-\uFFFF]+/

interface RawEntry {
  span: Span
  id: string
  data: ClassElementData
}

/** 在行内找最早出现的关系箭头 token；同位置取最长 */
function findArrow(line: string, from: number): { token: RelationKind; index: number } | null {
  let best: { token: RelationKind; index: number } | null = null
  for (const token of RELATION_KINDS) {
    const idx = line.indexOf(token, from)
    if (idx === -1) continue
    if (best === null || idx < best.index || (idx === best.index && token.length > best.token.length)) {
      best = { token, index: idx }
    }
  }
  return best
}

/** 名字 + 可选泛型（`Foo~T~`）→ { name, genericRaw, end } */
function parseNameWithGeneric(line: string, start: number): { name: string; genericRaw: string | null; end: number } | null {
  const m = NAME_RE.exec(line.slice(start))
  if (m === null) return null
  let pos = start + m[0].length
  let genericRaw: string | null = null
  if (line[pos] === '~') {
    const close = line.indexOf('~', pos + 1)
    if (close === -1) return null
    genericRaw = line.slice(pos, close + 1)
    pos = close + 1
  }
  return { name: m[0], genericRaw, end: pos }
}

function parseRelationLine(line: string, start: number): RelationData | null {
  const arrow = findArrow(line, start)
  if (arrow === null) return null
  const from = parseNameWithGeneric(line, start)
  if (from === null || from.end > arrow.index) return null
  const preArrowRaw = line.slice(from.end, arrow.index)
  if (!/^\s*("[^"]*")?\s*$/.test(preArrowRaw)) return null

  const postStart = arrow.index + arrow.token.length
  // 箭头与终点名之间可能先有基数引号（`*-- "0..*" Bone`），一并跳过
  let toNameStart = postStart + (/^[ \t]*/.exec(line.slice(postStart))?.[0] ?? '').length
  if (line[toNameStart] === '"') {
    const closeQuote = line.indexOf('"', toNameStart + 1)
    if (closeQuote === -1) return null
    toNameStart = closeQuote + 1 + (/^[ \t]*/.exec(line.slice(closeQuote + 1))?.[0] ?? '').length
  }
  const post = parseNameWithGeneric(line, toNameStart)
  if (post === null) return null
  const postArrowRaw = line.slice(postStart, toNameStart)
  if (!/^\s*("[^"]*")?\s*$/.test(postArrowRaw)) return null

  let colonRaw = ''
  let label = ''
  const rest = line.slice(post.end)
  const colonMatch = /^[ \t]*:[ \t]?(.*)$/.exec(rest)
  if (colonMatch !== null) {
    colonRaw = rest.slice(0, rest.length - colonMatch[1].length)
    label = colonMatch[1]
  } else if (/[^\s]/.test(rest)) {
    return null // 终点后跟了看不懂的内容：整行原样保留
  }

  return {
    kind: 'relation',
    from: from.name,
    fromGenericRaw: from.genericRaw,
    preArrowRaw,
    arrow: arrow.token,
    postArrowRaw,
    to: post.name,
    toGenericRaw: post.genericRaw,
    colonRaw,
    label,
  }
}

/** 成员正文 → 可见性 + 空白 + 正文 */
function parseMemberCore(text: string): { vis: Visibility; gap: string; raw: string } {
  const m = /^([+\-#~])([ \t]*)(.*)$/.exec(text)
  if (m !== null) {
    return { vis: m[1] as Visibility, gap: m[2], raw: m[3] }
  }
  return { vis: '', gap: '', raw: text }
}

function parseOneLineMember(line: string, start: number): MemberData | null {
  const m = ONE_LINE_MEMBER_RE.exec(line.slice(start))
  if (m === null) return null
  if (m[3] === '' && m[5] === '') return null // 只有宿主名没有成员正文
  const core = parseMemberCore(m[5])
  return {
    kind: 'member',
    ownerName: m[1],
    form: 'line',
    colonRaw: m[2],
    vis: (m[3] || core.vis) as Visibility,
    gap: m[3] !== '' ? m[4] : core.gap,
    raw: m[3] !== '' ? m[5].slice(m[4].length) : core.raw,
  }
}

function parseClassDeclLine(line: string, start: number): ClassDeclData | null {
  const m = CLASS_DECL_RE.exec(line.slice(start))
  if (m === null) return null
  const tail = m[4] ?? ''
  return {
    kind: 'class',
    name: m[2],
    gap: m[1],
    genericRaw: m[3] ?? null,
    tail,
    openBrace: tail.includes('{'),
  }
}

function parseNoteLine(line: string, start: number): NoteData | null {
  const forMatch = NOTE_FOR_RE.exec(line.slice(start))
  if (forMatch !== null) {
    return {
      kind: 'note',
      gap: forMatch[1],
      forGap: forMatch[2],
      forClass: forMatch[3],
      gap2: forMatch[4],
      quote: forMatch[5],
      text: forMatch[6],
      trailing: forMatch[7] ?? '',
    }
  }
  const floatMatch = NOTE_FLOAT_RE.exec(line.slice(start))
  if (floatMatch !== null) {
    return {
      kind: 'note',
      gap: floatMatch[1],
      forGap: null,
      forClass: null,
      gap2: '',
      quote: floatMatch[2],
      text: floatMatch[3],
      trailing: floatMatch[4] ?? '',
    }
  }
  return null
}

function classifyLine(line: string, lineStart: number, lineNo: number, entries: RawEntry[], counters: Counters, inClassBlock: boolean): void {
  const firstChar = line.length - line.trimStart().length
  const trimmed = line.trim()
  const span = { start: lineStart + firstChar, end: lineStart + line.length }

  if (trimmed === '}') {
    counters.end++
    entries.push({ span, id: `class-end:${counters.end}`, data: { kind: 'class-end' } })
    return
  }

  const decl = parseClassDeclLine(line, firstChar)
  if (decl !== null) {
    counters.class.set(decl.name, (counters.class.get(decl.name) ?? 0) + 1)
    const count = counters.class.get(decl.name) as number
    entries.push({ span, id: `class:${decl.name}` + (count > 1 ? `#${count}` : ''), data: decl })
    return
  }

  const relation = parseRelationLine(line, firstChar)
  if (relation !== null) {
    counters.relation++
    entries.push({ span, id: `relation:${counters.relation}`, data: relation })
    return
  }

  if (trimmed === 'note' || trimmed.startsWith('note ') || trimmed.startsWith('note\t')) {
    const note = parseNoteLine(line, firstChar)
    if (note !== null) {
      counters.note++
      entries.push({ span, id: `note:${counters.note}`, data: note })
      return
    }
    return // 解析不了：原样保留
  }

  if (trimmed === 'classDef' || trimmed.startsWith('classDef ') || trimmed.startsWith('classDef\t')) {
    const data = parseClassDefLine(line, firstChar)
    if (data !== null) {
      counters.classDef.set(data.name, (counters.classDef.get(data.name) ?? 0) + 1)
      const count = counters.classDef.get(data.name) as number
      entries.push({ span, id: `classdef:${data.name}` + (count > 1 ? `#${count}` : ''), data })
    }
    return
  }

  const member = parseOneLineMember(line, firstChar)
  if (member !== null) {
    counters.member++
    entries.push({ span, id: `member:${counters.member}`, data: member })
    return
  }

  if (inClassBlock) {
    // 花括号块内的成员行（如 `+int age` / `fly()`）
    const core = parseMemberCore(trimmed)
    counters.member++
    entries.push({
      span,
      id: `member:${counters.member}`,
      data: { kind: 'member', ownerName: null, form: 'block', colonRaw: '', vis: core.vis, gap: core.gap, raw: core.raw },
    })
    return
  }

  // 其余（linkStyle、cssClass/style、direction、注释、无法识别的指令）不解析，逐字保留
  void lineNo
}

interface Counters {
  class: Map<string, number>
  classDef: Map<string, number>
  member: number
  relation: number
  note: number
  end: number
}

// ---------- 解析器 ----------

export class ClassParser implements DiagramParser {
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
      class: new Map(),
      classDef: new Map(),
      member: 0,
      relation: 0,
      note: 0,
      end: 0,
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
            throw parseFailure(lineNo, '图表必须以 classDiagram 声明开始')
          }
          seenHeader = true
          entries.push({
            span: { start: cursor, end: cursor + line.length },
            id: 'header',
            data: { kind: 'class-header', keyword: header[2], trailing: header[3] ?? '' },
          })
        } else if (trimmed === '}') {
          if (blockStack.length === 0) {
            throw parseFailure(lineNo, '多余的 }（没有与之匹配的类花括号块）')
          }
          blockStack.pop()
          classifyLine(line, cursor, lineNo, entries, counters, blockStack.length > 0)
        } else {
          classifyLine(line, cursor, lineNo, entries, counters, blockStack.length > 0)
          const last = entries[entries.length - 1]
          if (last !== undefined && last.span.start >= cursor && last.data.kind === 'class' && (last.data as ClassDeclData).openBrace) {
            blockStack.push(lineNo)
          }
        }
      }

      if (nl === -1) break
      cursor = nl + 1
    }

    if (!seenHeader) {
      throw parseFailure(1, '图表必须以 classDiagram 声明开始')
    }
    if (blockStack.length > 0) {
      throw parseFailure(blockStack[blockStack.length - 1], '类花括号块缺少匹配的 }')
    }
    return assembleDocument(source, entries)
  }

  // ---------- 意图落地（resolveRewrites） ----------

  resolveRewrites(doc: SourceDocument, intent: EditIntent): ReadonlyMap<string, string> | null {
    switch (intent.type) {
      case 'add-class':
        return this.resolveAddClass(doc, intent as never)
      case 'rename-class':
        return this.resolveRenameClass(doc, intent as never)
      case 'set-class-generic':
        return this.resolveSetClassGeneric(doc, intent as never)
      case 'delete-class':
        return this.resolveDeleteClass(doc, intent as never)
      case 'add-member':
        return this.resolveAddMember(doc, intent as never)
      case 'set-member':
        return this.resolveSetMember(doc, intent as never)
      case 'delete-member':
        return this.resolveDeleteMember(doc, intent as never)
      case 'add-relation':
        return this.resolveAddRelation(doc, intent as never)
      case 'set-relation':
        return this.resolveSetRelation(doc, intent as never)
      case 'delete-relation':
        return this.resolveDeleteRelation(doc, intent as never)
      case 'add-note':
        return this.resolveAddNote(doc, intent as never)
      case 'set-note':
        return this.resolveSetNote(doc, intent as never)
      case 'delete-note':
        return this.resolveDeleteNote(doc, intent as never)
      case 'set-classdef-prop':
        return this.resolveSetClassDefProp(doc, intent as never)
      case 'add-classdef':
        return this.resolveAddClassDef(doc, intent as never)
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

  private classDecl(doc: SourceDocument, name: string) {
    return doc.elements.find((part) => part.element.kind === 'class' && (part.element as ClassDeclData).name === name)
  }

  /** 类的匹配花括号块 end（按 class / class-end 深度计数） */
  private matchingEnd(doc: SourceDocument, decl: { span: Span }): { id: string; span: Span } | null {
    let depth = 1
    for (const part of doc.elements) {
      if (part.span.start <= decl.span.start) continue
      if (part.element.kind === 'class' && (part.element as ClassDeclData).openBrace) depth++
      if (part.element.kind === 'class-end') {
        depth--
        if (depth === 0) return { id: part.id, span: part.span }
      }
    }
    return null
  }

  /** 类的最后归属元素（声明、块内成员、一行式成员），新成员插到它之后 */
  private lastPartOfClass(doc: SourceDocument, name: string) {
    const decl = this.classDecl(doc, name)
    if (decl === undefined) return null
    const end = (decl.element as ClassDeclData).openBrace ? this.matchingEnd(doc, decl) : null
    let anchor = decl
    for (const part of doc.elements) {
      if (part === decl) continue
      if (end !== null) {
        if (part.span.start > decl.span.start && part.span.end <= end.span.end && part.element.kind === 'member') {
          anchor = part
        }
        continue
      }
      const data = part.element as MemberData
      if (part.span.start > decl.span.start && part.element.kind === 'member' && data.form === 'line' && data.ownerName === name) {
        anchor = part
      } else if (part.span.start > decl.span.start && part.element.kind === 'class') {
        break // 遇到下一个类声明即止
      }
    }
    return anchor
  }

  // ----- class -----

  private resolveAddClass(
    doc: SourceDocument,
    intent: Extract<ClassIntent, { type: 'add-class' }>,
  ): Map<string, string> | null {
    if (!isValidClassName(intent.name)) return null
    const generic = intent.generic !== undefined && intent.generic !== '' ? `~${intent.generic}~` : ''
    return this.insertAfter(doc, intent.afterElementId, () => [`class ${intent.name}${generic}`])
  }

  private resolveRenameClass(
    doc: SourceDocument,
    intent: Extract<ClassIntent, { type: 'rename-class' }>,
  ): Map<string, string> | null {
    if (!isValidClassName(intent.newName)) return null
    const decl = this.classDecl(doc, intent.name)
    if (decl === undefined) return null
    const rewrites = new Map<string, string>([
      [decl.id, renderClassDecl(decl.element as ClassDeclData, { name: intent.newName })],
    ])
    for (const part of doc.elements) {
      const data = part.element
      if (data.kind === 'member') {
        const m = data as MemberData
        if (m.form === 'line' && m.ownerName === intent.name) {
          rewrites.set(part.id, renderMember(m, { ownerName: intent.newName }))
        }
      } else if (data.kind === 'relation') {
        const r = data as RelationData
        if (r.from === intent.name || r.to === intent.name) {
          rewrites.set(
            part.id,
            renderRelation(r, {
              from: r.from === intent.name ? intent.newName : undefined,
              to: r.to === intent.name ? intent.newName : undefined,
            }),
          )
        }
      } else if (data.kind === 'note') {
        const n = data as NoteData
        if (n.forClass === intent.name) {
          rewrites.set(part.id, renderNote(n, { forClass: intent.newName }))
        }
      }
    }
    return rewrites
  }

  private resolveSetClassGeneric(
    doc: SourceDocument,
    intent: Extract<ClassIntent, { type: 'set-class-generic' }>,
  ): Map<string, string> | null {
    const decl = this.classDecl(doc, intent.name)
    if (decl === undefined) return null
    return new Map([[decl.id, renderClassDecl(decl.element as ClassDeclData, { generic: intent.generic })]])
  }

  private resolveDeleteClass(
    doc: SourceDocument,
    intent: Extract<ClassIntent, { type: 'delete-class' }>,
  ): Map<string, string> | null {
    const decl = this.classDecl(doc, intent.name)
    if (decl === undefined) return null
    const rewrites = new Map<string, string>([[decl.id, '']])
    if ((decl.element as ClassDeclData).openBrace) {
      const end = this.matchingEnd(doc, decl)
      if (end === null) return null
      for (const part of doc.elements) {
        if (part.span.start >= decl.span.start && part.span.end <= end.span.end) {
          rewrites.set(part.id, '')
        }
      }
      rewrites.set(end.id, '')
    }
    for (const part of doc.elements) {
      const data = part.element
      if (data.kind === 'member') {
        const m = data as MemberData
        if (m.form === 'line' && m.ownerName === intent.name) rewrites.set(part.id, '')
      } else if (data.kind === 'relation') {
        const r = data as RelationData
        if (r.from === intent.name || r.to === intent.name) rewrites.set(part.id, '')
      } else if (data.kind === 'note') {
        if ((data as NoteData).forClass === intent.name) rewrites.set(part.id, '')
      }
    }
    return rewrites
  }

  // ----- member -----

  private resolveAddMember(
    doc: SourceDocument,
    intent: Extract<ClassIntent, { type: 'add-member' }>,
  ): Map<string, string> | null {
    const decl = this.classDecl(doc, intent.className)
    if (decl === undefined) return null
    const vis = intent.vis ?? ''
    const text = intent.text ?? ''
    if (text === '') return null
    const anchor = this.lastPartOfClass(doc, intent.className)
    if (anchor === null) return null
    if ((decl.element as ClassDeclData).openBrace) {
      const end = this.matchingEnd(doc, decl)
      if (end === null) return null
      const line = `${vis}${text}`
      // 块内已有成员：追加到最后一个成员行的 span 内（保持其缩进习惯）
      const lastBlockMember = [...doc.elements]
        .reverse()
        .find(
          (part) =>
            part.element.kind === 'member' &&
            (part.element as MemberData).form === 'block' &&
            part.span.start > decl.span.start &&
            part.span.end <= end.span.end,
        )
      if (lastBlockMember !== undefined) {
        const indent = lineIndent(doc.source, lastBlockMember.span.start)
        return new Map([
          [lastBlockMember.id, doc.source.slice(lastBlockMember.span.start, lastBlockMember.span.end) + `\n${indent}${line}`],
        ])
      }
      // 空块：插到 } 之前，缩进跟随 } 行
      const indent = lineIndent(doc.source, end.span.start)
      return new Map([[end.id, `${line}\n${indent}${doc.source.slice(end.span.start, end.span.end)}`]])
    }
    return this.insertAfter(doc, anchor.id, () => [`${intent.className} : ${vis}${text}`])
  }

  private resolveSetMember(
    doc: SourceDocument,
    intent: Extract<ClassIntent, { type: 'set-member' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'member') return null
    const m = part.element as MemberData
    const changes: { vis?: Visibility; text?: string } = {}
    if (intent.vis !== undefined) changes.vis = intent.vis
    if (intent.text !== undefined) changes.text = intent.text
    return new Map([[part.id, renderMember(m, changes)]])
  }

  private resolveDeleteMember(
    doc: SourceDocument,
    intent: Extract<ClassIntent, { type: 'delete-member' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'member') return null
    return new Map([[part.id, '']])
  }

  // ----- relation -----

  private resolveAddRelation(
    doc: SourceDocument,
    intent: Extract<ClassIntent, { type: 'add-relation' }>,
  ): Map<string, string> | null {
    if (!isValidClassName(intent.from) || !isValidClassName(intent.to)) return null
    if (!RELATION_KINDS.includes(intent.kind)) return null
    const data: RelationData = {
      kind: 'relation',
      from: intent.from,
      fromGenericRaw: null,
      preArrowRaw: cardRaw(intent.cardFrom ?? null),
      arrow: intent.kind,
      postArrowRaw: cardRaw(intent.cardTo ?? null),
      to: intent.to,
      toGenericRaw: null,
      colonRaw: intent.label !== undefined && intent.label !== '' ? ' : ' : '',
      label: intent.label ?? '',
    }
    return this.insertAfter(doc, intent.afterElementId, () => [renderRelation(data)])
  }

  private resolveSetRelation(
    doc: SourceDocument,
    intent: Extract<ClassIntent, { type: 'set-relation' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'relation') return null
    const r = part.element as RelationData
    const changes: {
      arrow?: RelationKind
      cardFrom?: string | null
      cardTo?: string | null
      label?: string | null
    } = {}
    if (intent.kind !== undefined) changes.arrow = intent.kind
    if (intent.cardFrom !== undefined) changes.cardFrom = intent.cardFrom
    if (intent.cardTo !== undefined) changes.cardTo = intent.cardTo
    if (intent.label !== undefined) changes.label = intent.label
    return new Map([[part.id, renderRelation(r, changes)]])
  }

  private resolveDeleteRelation(
    doc: SourceDocument,
    intent: Extract<ClassIntent, { type: 'delete-relation' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'relation') return null
    return new Map([[part.id, '']])
  }

  // ----- note -----

  private resolveAddNote(
    doc: SourceDocument,
    intent: Extract<ClassIntent, { type: 'add-note' }>,
  ): Map<string, string> | null {
    const text = intent.text ?? ''
    if (text === '') return null
    if (intent.className !== undefined && intent.className !== null && intent.className !== '') {
      if (!isValidClassName(intent.className)) return null
      return this.insertAfter(doc, intent.afterElementId, () => [`note for ${intent.className} "${text}"`])
    }
    return this.insertAfter(doc, intent.afterElementId, () => [`note "${text}"`])
  }

  private resolveSetNote(
    doc: SourceDocument,
    intent: Extract<ClassIntent, { type: 'set-note' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'note') return null
    const n = part.element as NoteData
    const changes: { forClass?: string | null; text?: string } = {}
    if (intent.className !== undefined) changes.forClass = intent.className
    if (intent.text !== undefined) changes.text = intent.text
    return new Map([[part.id, renderNote(n, changes)]])
  }

  private resolveDeleteNote(
    doc: SourceDocument,
    intent: Extract<ClassIntent, { type: 'delete-note' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'note') return null
    return new Map([[part.id, '']])
  }

  // ----- classDef -----

  private resolveSetClassDefProp(
    doc: SourceDocument,
    intent: Extract<ClassIntent, { type: 'set-classdef-prop' }>,
  ): Map<string, string> | null {
    const part = doc.elements.find(
      (p) => p.element.kind === 'classdef' && (p.element as ClassDefData).name === intent.name,
    )
    if (part === undefined) return null
    return new Map([[part.id, renderClassDef(part.element as ClassDefData, { prop: intent.prop, value: intent.value })]])
  }

  private resolveAddClassDef(
    doc: SourceDocument,
    intent: Extract<ClassIntent, { type: 'add-classdef' }>,
  ): Map<string, string> | null {
    if (intent.name === '' || /[\s,]/.test(intent.name)) return null
    const items = Object.entries(intent.props ?? {}).map(([key, value], i) => ({
      sep: i === 0 ? ' ' : ',',
      key,
      value,
    }))
    return this.insertAfter(doc, intent.afterElementId, () => [
      renderClassDefRaw({ kind: 'classdef', name: intent.name, gap: ' ', items }),
    ])
  }
}

/** 新建类名的合法性校验（表单层复用，与意图落地侧同一规则） */
export function isValidClassName(name: string): boolean {
  return /^[A-Za-z0-9_\u00C0-\uFFFF]+$/.test(name)
}

// ---------- 编辑意图（工单 07 表单所需集合） ----------

export type ClassIntent =
  /** 新增类声明行 */
  | { type: 'add-class'; name: string; generic?: string; afterElementId?: string }
  /** 改类名（声明 + 一行式成员 + 关系端点 + note 目标） */
  | { type: 'rename-class'; name: string; newName: string }
  /** 改类泛型；null = 去掉泛型 */
  | { type: 'set-class-generic'; name: string; generic: string | null }
  /** 删除类（声明、成员块、全部成员/触及关系/note） */
  | { type: 'delete-class'; name: string }
  /** 新增成员（块内类插到 } 前；否则追加一行式成员） */
  | { type: 'add-member'; className: string; vis?: Visibility; text?: string; afterElementId?: string }
  /** 改成员（可见性 / 正文）；未给出的字段保持不变 */
  | { type: 'set-member'; elementId: string; vis?: Visibility; text?: string }
  | { type: 'delete-member'; elementId: string }
  /** 新增关系行 */
  | {
      type: 'add-relation'
      from: string
      to: string
      kind: RelationKind
      cardFrom?: string | null
      cardTo?: string | null
      label?: string
      afterElementId?: string
    }
  /** 改关系（类型 / 基数 / 标签）；未给出的字段保持不变 */
  | { type: 'set-relation'; elementId: string; kind?: RelationKind; cardFrom?: string | null; cardTo?: string | null; label?: string | null }
  | { type: 'delete-relation'; elementId: string }
  /** 新增 note（className 缺省为浮动 note） */
  | { type: 'add-note'; className?: string | null; text?: string; afterElementId?: string }
  /** 改 note（目标类 / 文本） */
  | { type: 'set-note'; elementId: string; className?: string | null; text?: string }
  | { type: 'delete-note'; elementId: string }
  /** 设置 classDef 属性；value 空串 = 删除该属性（与 flowchart 同语义） */
  | { type: 'set-classdef-prop'; name: string; prop: string; value: string }
  /** 新增 classDef 行 */
  | { type: 'add-classdef'; name: string; props?: Record<string, string>; afterElementId?: string }

/** 元素所在行的行首缩进（插入新行时跟随用户缩进习惯） */
function lineIndent(source: string, offset: number): string {
  const lineStart = source.lastIndexOf('\n', Math.max(0, offset - 1)) + 1
  let i = lineStart
  while (i < offset && (source[i] === ' ' || source[i] === '\t')) i++
  return source.slice(lineStart, i)
}

export const classParser = new ClassParser()
