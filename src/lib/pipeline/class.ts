import { assembleDocument, getElementById, type SourceDocument } from './document'
import type { DiagramParser, EditIntent, ParseResult, SourceParseError } from './parser'
import { frontmatterEnd } from './frontmatter'
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
 * - namespace Foo { ... }（工单 06，ADR-0014）：渲染为视觉边框、不构成 DOM 包含
 *   （`childDataIds: []`），只做「解析 + 结构树可见 + 可改名」，不做分组编辑
 * - direction LR / RL / TB / BT（工单 07）：图表级方向声明，只做「解析 + 改写 / 删除」
 *   （删除 = 跟随 mermaid 默认）。mermaid 的 classDiagram 词法只认这四种取值，
 *   故落地侧按白名单校验（`direction TD` 不是合法别名）
 *
 * 不解析、原样保留（清单外语法不报错，ADR-0008）：linkStyle、CSS 注入
 * （cssClass / style）、注释、空行、以及一切无法识别的行。
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

/** 泛型新值的规范渲染（`~X~`；空 / null = 无泛型） */
function genericRaw(generic: string | null): string {
  return generic === null || generic === '' ? '' : `~${generic}~`
}

export function renderRelation(
  d: RelationData,
  changes: {
    from?: string
    to?: string
    fromGeneric?: string | null
    toGeneric?: string | null
    arrow?: RelationKind
    cardFrom?: string | null
    cardTo?: string | null
    label?: string | null
  } = {},
): string {
  const from = changes.from ?? d.from
  const to = changes.to ?? d.to
  const fromGeneric =
    changes.fromGeneric === undefined ? (d.fromGenericRaw ?? '') : genericRaw(changes.fromGeneric)
  const toGeneric = changes.toGeneric === undefined ? (d.toGenericRaw ?? '') : genericRaw(changes.toGeneric)
  const arrow = changes.arrow ?? d.arrow
  const preArrow = changes.cardFrom !== undefined ? cardRaw(changes.cardFrom) : d.preArrowRaw
  const postArrow = changes.cardTo !== undefined ? cardRaw(changes.cardTo) : d.postArrowRaw
  let tail = d.colonRaw + d.label
  if (changes.label !== undefined) {
    tail = changes.label === null || changes.label === '' ? '' : ` : ${changes.label}`
  }
  return `${from}${fromGeneric}${preArrow}${arrow}${postArrow}${to}${toGeneric}${tail}`
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

/**
 * `namespace <名字> { ... }` 的开行（工单 06）。实测渲染为 `<g class="cluster undefined">`、
 * 无 data-id，且内部的类**不在** cluster 内（`childDataIds: []`）——只是视觉边框，
 * 故只做可见与可改名，不做「把类移进 namespace」这类分组编辑。
 *
 * 与类的花括号块配对：namespace 开行与 class 开行分别压在**同类**的块栈上，
 * 收尾 `}` 按栈顶类型出 `namespace-end` / `class-end`（两类块各自闭合，互不串味）。
 * 只支持「`{` 在同一行」的写法（含单行 `namespace Foo { class A }`，整行原样保留、不拆内联类）；
 * `{` 换行的写法保持 verbatim 不解析。
 */
export interface NamespaceData {
  kind: 'namespace'
  /** `namespace` 与名字之间的空白 */
  gap: string
  name: string
  /** 名字之后到行尾的原文（如 ` {`、` { class A }`）；逐字保留 */
  tail: string
}

export function renderNamespace(d: NamespaceData, changes: { name?: string } = {}): string {
  return `namespace${d.gap}${changes.name ?? d.name}${d.tail}`
}

export interface NamespaceEndData {
  kind: 'namespace-end'
}

/**
 * 图表级方向声明 `direction LR|RL|TB|BT`（工单 07）。取值**原样记录**、不在此校验：
 * 解析层保持纯记录（verbatim 可回写），合法性由 `set-direction` 落地侧按白名单把关
 * （与 flowchart 的 `resolveSetDirection` 同口径）。
 */
export interface ClassDirectionData {
  kind: 'direction'
  /** `direction` 与取值之间的空白 */
  gap: string
  /** 取值原文（逐字保留） */
  value: string
}

export function renderDirection(d: ClassDirectionData, changes: { value?: string } = {}): string {
  return `direction${d.gap}${changes.value ?? d.value}`
}

export type ClassElementData =
  | ClassHeaderData
  | ClassDeclData
  | MemberData
  | RelationData
  | NoteData
  | NamespaceData
  | NamespaceEndData
  | ClassDirectionData
  | ClassDefData
  | { kind: 'class-end' }

// ---------- 行级解析 ----------

const HEADER_RE = /^([ \t]*)(classDiagram)([ \t\r]*)$/i
const CLASS_DECL_RE = /^class([ \t]+)([^\s~{]+)(~[^~]*~)?([ \t]*\{[ \t\r]*|[ \t\r]*)$/
/** namespace 开行：`namespace <名字> {`（`{` 必须与名字同行；其余形式保持 verbatim） */
const NAMESPACE_RE = /^namespace([ \t]+)(\S+)([\s\S]*)$/
const ONE_LINE_MEMBER_RE = /^([^\s~:{}]+)((?:[ \t]*):[ \t]*)((?:[+\-#~])?)([ \t]*)(.*)$/
const NOTE_FOR_RE = /^note([ \t]+)for([ \t]+)([^\s"']+)([ \t]+)(["'])(.*)\5([ \t\r]*)$/i
const NOTE_FLOAT_RE = /^note([ \t]+)(["'])(.*)\2([ \t\r]*)$/i
/** 图表级方向声明（工单 07）：`direction <取值>`；取值白名单见 CLASS_DIRECTIONS */
const DIRECTION_RE = /^direction([ \t]+)(\S+)[ \t\r]*$/

/** mermaid 的 classDiagram 词法只接受这四种方向（`TD` 不是别名） */
const CLASS_DIRECTIONS = ['TB', 'BT', 'RL', 'LR']

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

function parseNamespaceLine(line: string, start: number): NamespaceData | null {
  const m = NAMESPACE_RE.exec(line.slice(start))
  if (m === null) return null
  const tail = m[3]
  // 只认同一行开 `{` 的写法：`namespace Foo {`（多行）与 `namespace Foo { class A }`（单行）。
  // `{` 换行的写法（mermaid 也接受）保持 verbatim，不在此解析。
  if (!tail.trimStart().startsWith('{')) return null
  return { kind: 'namespace', gap: m[1], name: m[2], tail }
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

  const decl = parseClassDeclLine(line, firstChar)
  if (decl !== null) {
    counters.class.set(decl.name, (counters.class.get(decl.name) ?? 0) + 1)
    const count = counters.class.get(decl.name) as number
    entries.push({ span, id: `class:${decl.name}` + (count > 1 ? `#${count}` : ''), data: decl })
    return
  }

  const ns = parseNamespaceLine(line, firstChar)
  if (ns !== null) {
    counters.namespace.set(ns.name, (counters.namespace.get(ns.name) ?? 0) + 1)
    const count = counters.namespace.get(ns.name) as number
    entries.push({ span, id: `namespace:${ns.name}` + (count > 1 ? `#${count}` : ''), data: ns })
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

  // direction 只作图表级声明（mermaid 的 classDiagram 里它只在顶层语句位置合法）：
  // 花括号块内的一行不作为方向，仍按块内成员处理（保持既有口径）。
  // 整行必须恰好是 `direction <单个取值>`，否则落回后续解析（如名为 direction 的类的一行式成员）
  if (!inClassBlock) {
    const directionMatch = DIRECTION_RE.exec(line.slice(firstChar))
    if (directionMatch !== null) {
      counters.direction++
      entries.push({
        span,
        id: `direction:${counters.direction}`,
        data: { kind: 'direction', gap: directionMatch[1], value: directionMatch[2] },
      })
      return
    }
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

  // 其余（linkStyle、cssClass/style、注释、无法识别的指令）不解析，逐字保留
  void lineNo
}

interface Counters {
  class: Map<string, number>
  namespace: Map<string, number>
  classDef: Map<string, number>
  member: number
  relation: number
  note: number
  direction: number
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
      namespace: new Map(),
      classDef: new Map(),
      member: 0,
      relation: 0,
      note: 0,
      direction: 0,
      end: 0,
    }
    // 未闭合的 `{` 栈：类花括号块与 namespace 块分开记，收尾 `}` 按栈顶类型出对应 end
    // （题面要求「类声明也用 {}，正则要能区分」——靠这里的类型栈区分，两族块互不串味）。
    const blockStack: Array<{ lineNo: number; kind: 'class' | 'namespace' }> = []
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
          const top = blockStack.pop()
          if (top === undefined) {
            throw parseFailure(lineNo, '多余的 }（没有与之匹配的类花括号块）')
          }
          const firstChar = line.length - line.trimStart().length
          const span = { start: cursor + firstChar, end: cursor + line.length }
          if (top.kind === 'namespace') {
            entries.push({ span, id: `namespace-end:${lineNo}`, data: { kind: 'namespace-end' } })
          } else {
            counters.end++
            entries.push({ span, id: `class-end:${counters.end}`, data: { kind: 'class-end' } })
          }
        } else {
          // 只有「块栈顶是类块」时才把行当作块内成员——namespace 体内只允许类/嵌套 namespace
          const top = blockStack[blockStack.length - 1]
          classifyLine(line, cursor, lineNo, entries, counters, top?.kind === 'class')
          const last = entries[entries.length - 1]
          if (last !== undefined && last.span.start >= cursor) {
            if (last.data.kind === 'class' && (last.data as ClassDeclData).openBrace) {
              blockStack.push({ lineNo, kind: 'class' })
            } else if (
              last.data.kind === 'namespace' &&
              // 单行写法 `namespace Foo { class A }` 同行即闭合，不进栈
              (last.data as NamespaceData).tail.trimEnd().endsWith('{')
            ) {
              blockStack.push({ lineNo, kind: 'namespace' })
            }
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
      const open = blockStack[blockStack.length - 1]
      throw parseFailure(open.lineNo, open.kind === 'namespace' ? 'namespace 缺少匹配的 }' : '类花括号块缺少匹配的 }')
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
      case 'set-namespace-name':
        return this.resolveSetNamespaceName(doc, intent as never)
      case 'set-direction':
        return this.resolveSetDirection(doc, intent as never)
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
      fromGeneric?: string | null
      toGeneric?: string | null
      cardFrom?: string | null
      cardTo?: string | null
      label?: string | null
    } = {}
    if (intent.kind !== undefined) changes.arrow = intent.kind
    if (intent.fromGeneric !== undefined) changes.fromGeneric = intent.fromGeneric
    if (intent.toGeneric !== undefined) changes.toGeneric = intent.toGeneric
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

  // ----- namespace（工单 06：只做可见与可改名，不做分组编辑） -----

  private resolveSetNamespaceName(
    doc: SourceDocument,
    intent: Extract<ClassIntent, { type: 'set-namespace-name' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'namespace') return null
    if (intent.name === '') return null
    return new Map([[part.id, renderNamespace(part.element as NamespaceData, { name: intent.name })]])
  }

  // ----- direction（工单 07） -----

  /**
   * 设置图表方向：有 direction 行就原地改写，没有就插到表头之后（mermaid 文档的写法，
   * 也是 sequence `autonumber` 的锚点口径）；`direction: null` = 删除该行（跟随 mermaid 默认）。
   * 删除只清元素 span——行首缩进与换行留在 verbatim（全项目既有约定，spec 已记）。
   */
  private resolveSetDirection(
    doc: SourceDocument,
    intent: Extract<ClassIntent, { type: 'set-direction' }>,
  ): Map<string, string> | null {
    const existing = doc.elements.find((part) => part.element.kind === 'direction')
    if (intent.direction === null) {
      return existing === undefined ? new Map() : new Map([[existing.id, '']])
    }
    const value = intent.direction.toUpperCase()
    if (!CLASS_DIRECTIONS.includes(value)) return null
    if (existing !== undefined) {
      return new Map([[existing.id, renderDirection(existing.element as ClassDirectionData, { value })]])
    }
    const header = doc.elements.find((part) => part.element.kind === 'class-header')
    if (header === undefined) return null
    return this.insertAfter(doc, header.id, () => [`direction ${value}`])
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
  /** 改关系（类型 / 端点泛型 / 基数 / 标签）；未给出的字段保持不变 */
  | {
      type: 'set-relation'
      elementId: string
      kind?: RelationKind
      fromGeneric?: string | null
      toGeneric?: string | null
      cardFrom?: string | null
      cardTo?: string | null
      label?: string | null
    }
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
  /** 改 namespace 名（工单 06；行尾原文逐字保留） */
  | { type: 'set-namespace-name'; elementId: string; name: string }
  /** 设置图表方向（工单 07）；null = 删除 direction 行（跟随 mermaid 默认） */
  | { type: 'set-direction'; direction: string | null }

/** 源码里各 namespace 元素的 elementId，按出现顺序（解析失败时 null） */
function namespaceIdsOf(source: string): string[] | null {
  const parsed = classParser.parse(source)
  if (!parsed.ok) return null
  return parsed.doc.elements.filter((part) => part.element.kind === 'namespace').map((part) => part.id)
}

/**
 * 改名（set-namespace-name）落码后该 namespace 的真实 elementId（工单 02 / spec F2）。
 *
 * 重名序号（`namespace:<名>#N`）是解析器的知识，调用方不复刻：这里重新解析改名后的
 * 源码，由解析器给出 id。改名只替换行内文本，元素在 namespace 出现序列里的位置不变，
 * 故按位置在新旧源码间对齐。解析失败 / 找不到时返回 null（调用方保持原选中，不回落）。
 */
export function namespaceIdAfterRename(before: string, after: string, elementId: string): string | null {
  const beforeIds = namespaceIdsOf(before)
  if (beforeIds === null) return null
  const order = beforeIds.indexOf(elementId)
  if (order < 0) return null
  const afterIds = namespaceIdsOf(after)
  if (afterIds === null) return null
  return afterIds[order] ?? null
}

/** 元素所在行的行首缩进（插入新行时跟随用户缩进习惯） */
function lineIndent(source: string, offset: number): string {
  const lineStart = source.lastIndexOf('\n', Math.max(0, offset - 1)) + 1
  let i = lineStart
  while (i < offset && (source[i] === ' ' || source[i] === '\t')) i++
  return source.slice(lineStart, i)
}

export const classParser = new ClassParser()
