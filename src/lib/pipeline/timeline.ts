import { assembleDocument, getElementById, type ElementPart, type SourceDocument } from './document'
import { frontmatterEnd } from './frontmatter'
import { indentLines, insertAfter } from './insert'
import type { DiagramParser, EditIntent, ParseResult, SourceParseError } from './parser'
import type { Span } from './span'
import type { AnyElement } from './document'
import { newElementName } from '../../i18n/domain-strings.ts'

/**
 * timeline 完整解析器（more-diagrams 工单 05，语法事实以
 * spec 的 research/timeline-kanban-requirement.md 的 timeline 部分为准，勿重复调研）：
 * 手写、逐行、带 span（ADR-0004）。可测试承诺：解析后不做修改再重组装，
 * 输出与输入逐字相同（verbatim identity）。
 *
 * 覆盖（分层对齐，spec 决策）：
 * - 声明头 `timeline`，可带方向 `timeline LR` / `timeline TD`（v11.14+）
 * - `title 标题文本`（单行）、`section 名称`（之后时期归入该 section）
 * - 时期（period）：行首文本；事件（event）：冒号后文本，两种**等价写法**都认：
 *   单行冒号串联 `Day 1 : A : B`（拆成多个 span 段）与续行 `: B`（整行一个元素）
 *
 * 不解析、原样保留（清单外语法不报错，ADR-0008）：样式（timeline 无 classDef/style）、
 * frontmatter config、`%%` 注释、`accTitle` / `accDescr`、无法识别的行。
 *
 * span 约定（与 state / er 同口径，行级）：行首缩进与换行留在 verbatim；元素 span 不跨行。
 * 时期行的「单行冒号串联」把一行拆成**不重叠的多个 span 段**（时期段 + 各事件段，
 * 段间的 ` : ` 分隔原文归前一段的 sep 字段），从而让每个事件可被单独寻址与手术改写——
 * 删除/改写一个事件只动它自己的段，其余段逐字不动（工单 05 的续行事件手术边界）。
 *
 * 身份（ADR-0012 位置序）：`period:N` / `event:N` / `section:N` 均按文档序 1 基编号
 * （位置序身份无需走 element-id.ts 的编解码，故直接写字面量）。
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

export interface TimelineHeaderData {
  kind: 'timeline-header'
  /** `timeline` 之后到行尾的原文（含空白与方向 token），逐字保留 */
  trailing: string
}

/** mermaid 的 timeline 只接受这两个方向 token（缺省 LR）；大小写不敏感 */
export const TIMELINE_DIRECTIONS = ['LR', 'TD'] as const

/** 头部原文的 direction token（` LR` / ` TD`）；无方向时 null */
export function timelineDirectionOf(trailing: string): string | null {
  const m = /^[ \t]+(LR|TD)[ \t]*$/i.exec(trailing)
  return m === null ? null : m[1].toUpperCase()
}

/** 头部行重建；changes.direction 缺省 = 保持原样，null = 去掉方向 token（跟随默认 LR） */
export function renderTimelineHeader(d: TimelineHeaderData, changes: { direction?: string | null } = {}): string {
  if (changes.direction === undefined) return `timeline${d.trailing}`
  return changes.direction === null ? 'timeline' : `timeline ${changes.direction}`
}

export interface TimelineTitleData {
  kind: 'timeline-title'
  /** `title` 与标题之间的空白原文 */
  gap: string
  /** 标题文本（gap 之后到行尾，逐字保留） */
  text: string
}

/** `section 名称` 行；名称内不允许含 `:`（mermaid 词法 `section\s[^:\n]+`） */
export interface TimelineSectionData {
  kind: 'timeline-section'
  /** `section` 与名称之间的空白原文 */
  gap: string
  /** 名称文本（gap 之后到行尾，逐字保留） */
  name: string
}

export function renderTimelineSection(d: TimelineSectionData, changes: { name?: string } = {}): string {
  return `section${d.gap}${changes.name ?? d.name}`
}

/**
 * 时期段。`tail` 只在**该时期行没有事件**时非空（行尾空白与 `#` 注释原文），
 * 使 `set-period-text` 改写时期文本时能逐字保留它们；有事件时时期段以文本结尾，
 * 后续 ` : ` 分隔原文归第一个事件段的 `sep`。
 */
export interface TimelinePeriodData {
  kind: 'timeline-period'
  /** 时期文本（去首尾空白后的原文） */
  text: string
  /** 行尾原文（仅无事件形态非空） */
  tail: string
}

export function renderTimelinePeriod(d: TimelinePeriodData, changes: { text?: string } = {}): string {
  return `${changes.text ?? d.text}${d.tail}`
}

/**
 * 事件段。两种写法共用本数据：
 * - `inline`：单行冒号串联的一段；`sep` = 本段之前的 ` : ` 分隔原文，`tail` = 行尾原文（仅最后一段可能非空）
 * - `continuation`：续行 `: Event` 整行一个元素；`sep` = `:` 与文本之间的空白
 * 元素 span 不含行首缩进与换行（verbatim 保留）。
 */
export interface TimelineEventData {
  kind: 'timeline-event'
  text: string
  form: 'inline' | 'continuation'
  /** inline：分隔原文（如 ` : `）；continuation：冒号后的空白（如 ` `） */
  sep: string
  /** 行尾原文（尾随空白 / `#` 注释），逐字保留 */
  tail: string
}

export function renderTimelineEvent(d: TimelineEventData, changes: { text?: string } = {}): string {
  const text = changes.text ?? d.text
  return d.form === 'inline' ? `${d.sep}${text}${d.tail}` : `:${d.sep}${text}${d.tail}`
}

export type TimelineElementData =
  | TimelineHeaderData
  | TimelineTitleData
  | TimelineSectionData
  | TimelinePeriodData
  | TimelineEventData

// ---------- 词法助手 ----------

const WS = /[ \t\r]/
const HEADER_RE = /^timeline(?:[ \t]+(?:LR|TD))?[ \t\r]*$/i
const TITLE_RE = /^title([ \t]+)(.+)$/
const SECTION_RE = /^section([ \t]+)([^:\n]+)$/

/** period 段文本的合法性（mermaid 词法 `[^#:\n]+`）：非空、不含 `:` / `#` / 换行 */
export function isValidTimelinePeriodText(text: string): boolean {
  const t = text.trim()
  return t !== '' && !/[#:\n]/.test(t)
}

/**
 * 事件文本的合法性（mermaid 词法 `:\s(?:[^:\n]|:(?!\s))+`）：非空、不含换行、
 * 且不含「冒号紧跟空白」（那会被 lexer 当作下一个事件的分隔）。
 */
export function isValidTimelineEventText(text: string): boolean {
  const t = text.trim()
  return t !== '' && !/\n/.test(t) && !/:[ \t\r]/.test(t)
}

/** section 名称的合法性（mermaid 词法 `section\s[^:\n]+`）：非空、不含 `:` / 换行 */
export function isValidTimelineSectionName(name: string): boolean {
  const n = name.trim()
  return n !== '' && !/[:\n]/.test(n)
}

/** 方向 token 合法性（仅 LR / TD，大小写不敏感） */
export function isValidTimelineDirection(direction: string): boolean {
  return (TIMELINE_DIRECTIONS as readonly string[]).includes(direction.toUpperCase())
}

const SECTION_PREFIX = /^section[ \t]/
const TITLE_PREFIX = /^title[ \t]/
const ACC_PREFIX = /^acc(Title|Descr)\b/i

/** 单行冒号串联的拆分结果：时期段 + 各事件段（相对行首的偏移） */
interface InlineSegment {
  /** 本段元素 span 的起点（相对行首偏移） */
  start: number
  /** 分隔原文（上一段结束 → 本段文本起点），逐字保留 */
  sep: string
  text: string
  tail: string
}

function splitPeriodLine(
  line: string,
  firstChar: number,
): { text: string; periodEnd: number; segments: InlineSegment[] } | null {
  const lineEnd = line.length
  // `#` 起注释：mermaid 的 period 词法 `[^#:\n]+` 在 `#` 处停止（注释部分逐字保留）
  const hashAt = line.indexOf('#', firstChar)
  const regionEnd = hashAt === -1 ? lineEnd : hashAt

  // 行内事件边界：`:` 且其后紧跟空白（mermaid 的 event 词法要求 `:` 后有空白）
  const boundaries: number[] = []
  for (let i = firstChar; i < regionEnd; i++) {
    if (line[i] === ':' && i + 1 < regionEnd && WS.test(line[i + 1])) boundaries.push(i)
  }

  const firstBoundary = boundaries.length > 0 ? boundaries[0] : null
  // 无事件时时期段止于注释起点（`#`），使尾随空白与注释归入 tail 逐字保留
  const periodSegmentEnd = firstBoundary ?? regionEnd
  const rawPeriod = line.slice(firstChar, periodSegmentEnd)
  const text = rawPeriod.trimEnd()
  // 时期文本不得为空或缺席（空行已被调用方过滤）；含 `:` 说明该行不是合法时期（逐字保留）
  if (text === '' || text.includes(':')) return null
  const periodEnd = firstChar + text.length

  const segments: InlineSegment[] = []
  for (let k = 0; k < boundaries.length; k++) {
    const colonAt = boundaries[k]
    const start = k === 0 ? periodEnd : segments[k - 1].start + segments[k - 1].sep.length + segments[k - 1].text.length + segments[k - 1].tail.length
    let textStart = colonAt + 1
    while (textStart < regionEnd && WS.test(line[textStart])) textStart++
    const isLast = k === boundaries.length - 1
    // 文本的结束：下一段的分隔起点 / 行尾（或 `#` 注释起点），右裁空白
    let limit = isLast ? regionEnd : boundaries[k + 1]
    // 行尾原文（尾随空白 + `#` 注释）只归最后一段，便于插入新行落在行尾之后
    const tailEnd = isLast ? lineEnd : limit
    while (limit > textStart && WS.test(line[limit - 1])) limit--
    const segmentText = line.slice(textStart, limit)
    if (segmentText === '') return null
    const tail = isLast ? line.slice(limit, tailEnd) : ''
    segments.push({
      start,
      sep: line.slice(start, textStart),
      text: segmentText,
      tail,
    })
  }

  // 无事件形态：时期段一直占到行尾（含尾随空白与 `#` 注释），供插入新行落在行尾之后
  if (segments.length === 0) {
    return { text, periodEnd, segments }
  }
  return { text, periodEnd, segments }
}

/** 续行事件 `: Event` 行解析：返回 sep / text / tail；不是续行事件行时 null */
function parseEventLine(line: string, firstChar: number): { sep: string; text: string; tail: string } | null {
  if (line[firstChar] !== ':') return null
  const lineEnd = line.length
  let i = firstChar + 1
  if (i >= lineEnd || !WS.test(line[i])) return null
  const gapStart = i
  while (i < lineEnd && WS.test(line[i])) i++
  let e = lineEnd
  while (e > i && WS.test(line[e - 1])) e--
  const text = line.slice(i, e)
  if (text === '') return null
  return { sep: line.slice(gapStart, i), text, tail: line.slice(e, lineEnd) }
}

// ---------- 解析器 ----------

interface RawEntry {
  span: Span
  id: string
  data: TimelineElementData
}

export class TimelineParser implements DiagramParser {
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

  private parseDocument(source: string): SourceDocument {
    const entries: RawEntry[] = []
    let periodCount = 0
    let eventCount = 0
    let sectionCount = 0
    let seenHeader = false
    // 文首 frontmatter 块不参与解析，整体 verbatim 保留
    const bodyStart = frontmatterEnd(source)
    let lineNo = bodyStart === 0 ? 0 : source.slice(0, bodyStart).split('\n').length - 1
    let cursor = bodyStart

    for (;;) {
      const nl = source.indexOf('\n', cursor)
      // lineEndAbs：绝对偏移（算 span）；line 内部一律用 line.length（相对）
      const lineEndAbs = nl === -1 ? source.length : nl
      const line = source.slice(cursor, lineEndAbs)
      lineNo++
      const trimmed = line.trim()

      if (trimmed !== '') {
        const firstChar = line.length - line.trimStart().length
        const spanOfLine = (): Span => ({ start: cursor + firstChar, end: lineEndAbs })

        if (!seenHeader) {
          if (!HEADER_RE.test(trimmed)) {
            throw parseFailure(lineNo, '图表必须以 timeline 声明开始')
          }
          seenHeader = true
          entries.push({
            span: spanOfLine(),
            id: 'timeline-header',
            data: { kind: 'timeline-header', trailing: line.slice(firstChar + 'timeline'.length) },
          })
        } else if (trimmed.startsWith('%%') || ACC_PREFIX.test(trimmed) || line[firstChar] === '#' || line[firstChar] === '{' || line[firstChar] === '}') {
          // 注释 / 可访问性语句 / 生僻符号行：不解析，逐字保留
        } else if (TITLE_PREFIX.test(trimmed)) {
          const m = TITLE_RE.exec(trimmed)!
          entries.push({
            span: spanOfLine(),
            id: 'timeline-title',
            data: { kind: 'timeline-title', gap: m[1], text: m[2].trimEnd() },
          })
        } else if (SECTION_PREFIX.test(trimmed)) {
          const m = SECTION_RE.exec(trimmed)
          if (m !== null) {
            sectionCount++
            entries.push({
              span: spanOfLine(),
              id: `section:${sectionCount}`,
              data: { kind: 'timeline-section', gap: m[1], name: m[2].trimEnd() },
            })
          }
          // 名称含 `:` 等清单外形态：不解析，逐字保留
        } else if (line[firstChar] === ':') {
          const event = parseEventLine(line, firstChar)
          // 续行事件必须依附于已出现的时期（mermaid 语义）；无时期时逐字保留
          if (event !== null && periodCount > 0) {
            eventCount++
            entries.push({
              span: spanOfLine(),
              id: `event:${eventCount}`,
              data: { kind: 'timeline-event', text: event.text, form: 'continuation', sep: event.sep, tail: event.tail },
            })
          }
        } else {
          const parsed = splitPeriodLine(line, firstChar)
          if (parsed !== null) {
            periodCount++
            const periodId = `period:${periodCount}`
            const tail = parsed.segments.length === 0 ? line.slice(parsed.periodEnd) : ''
            entries.push({
              span:
                parsed.segments.length === 0
                  ? spanOfLine()
                  : { start: cursor + firstChar, end: cursor + parsed.periodEnd },
              id: periodId,
              data: { kind: 'timeline-period', text: parsed.text, tail },
            })
            for (const segment of parsed.segments) {
              eventCount++
              entries.push({
                span: { start: cursor + segment.start, end: cursor + segment.start + segment.sep.length + segment.text.length + segment.tail.length },
                id: `event:${eventCount}`,
                data: { kind: 'timeline-event', text: segment.text, form: 'inline', sep: segment.sep, tail: segment.tail },
              })
            }
          }
          // 清单外 / 无法识别：不解析，逐字保留
        }
      }

      if (nl === -1) break
      cursor = nl + 1
    }

    if (!seenHeader) {
      throw parseFailure(1, '图表必须以 timeline 声明开始')
    }
    return assembleDocument(source, entries)
  }

  // ---------- 意图落地（resolveRewrites） ----------

  resolveRewrites(doc: SourceDocument, intent: EditIntent): ReadonlyMap<string, string> | null {
    switch (intent.type) {
      case 'add-period':
        return this.resolveAddPeriod(doc, intent as never)
      case 'set-period-text':
        return this.resolveSetPeriodText(doc, intent as never)
      case 'delete-period':
        return this.resolveDeletePeriod(doc, intent as never)
      case 'add-event':
        return this.resolveAddEvent(doc, intent as never)
      case 'set-event-text':
        return this.resolveSetEventText(doc, intent as never)
      case 'delete-event':
        return this.resolveDeleteEvent(doc, intent as never)
      case 'add-section':
        return this.resolveAddSection(doc, intent as never)
      case 'set-section-name':
        return this.resolveSetSectionName(doc, intent as never)
      case 'set-title':
        return this.resolveSetTitle(doc, intent as never)
      case 'set-direction':
        return this.resolveSetDirection(doc, intent as never)
      default:
        return null
    }
  }

  /**
   * 某时期自身的元素序列（时期段 + 其后**连续**的事件段）。
   * 时期的事件在文档序上紧跟在时期段之后（先是同行 inline 段，再是续行段），
   * 遇到非事件元素即中止——这就是「续行事件只动自己那一行」的边界所在。
   */
  private periodElements(doc: SourceDocument, periodElementId: string): ElementPart[] | null {
    const index = doc.elements.findIndex((part) => part.id === periodElementId)
    if (index === -1 || doc.elements[index].element.kind !== 'timeline-period') return null
    const run: ElementPart[] = [doc.elements[index]]
    for (let i = index + 1; i < doc.elements.length; i++) {
      if (doc.elements[i].element.kind !== 'timeline-event') break
      run.push(doc.elements[i])
    }
    return run
  }

  /** 新增时期行（缺省锚点回退文档末尾）；文本非法时不落码 */
  private resolveAddPeriod(
    doc: SourceDocument,
    intent: Extract<TimelineIntent, { type: 'add-period' }>,
  ): Map<string, string> | null {
    const text = (intent.text ?? newElementName('period')).trim()
    if (!isValidTimelinePeriodText(text)) return null
    return insertAfter(doc, {
      afterElementId: intent.afterElementId,
      anchor: 'line-end',
      render: (indent) => indentLines(indent, [text]),
    })
  }

  /** 改时期文本：只重写时期段（其后的 ` : 事件...` 逐字保留） */
  private resolveSetPeriodText(
    doc: SourceDocument,
    intent: Extract<TimelineIntent, { type: 'set-period-text' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'timeline-period') return null
    const text = intent.text.trim()
    if (!isValidTimelinePeriodText(text)) return null
    return new Map([[part.id, renderTimelinePeriod(part.element as TimelinePeriodData, { text })]])
  }

  /** 删除时期：连同其同行 inline 事件段与后续续行事件行一起清理 */
  private resolveDeletePeriod(
    doc: SourceDocument,
    intent: Extract<TimelineIntent, { type: 'delete-period' }>,
  ): Map<string, string> | null {
    const run = this.periodElements(doc, intent.elementId)
    if (run === null) return null
    return new Map(run.map((part) => [part.id, '']))
  }

  /** 给时期加事件：落一条续行 `: 文本`，插在该时期最后一个事件行（或时期行）之后 */
  private resolveAddEvent(
    doc: SourceDocument,
    intent: Extract<TimelineIntent, { type: 'add-event' }>,
  ): Map<string, string> | null {
    const text = intent.text.trim()
    if (!isValidTimelineEventText(text)) return null
    const run = this.periodElements(doc, intent.periodElementId)
    if (run === null) return null
    const anchor = run[run.length - 1]
    return insertAfter(doc, {
      afterElementId: anchor.id,
      anchor: 'line-end',
      render: (indent) => indentLines(indent, [`: ${text}`]),
    })
  }

  /** 改事件文本：inline 段按冒号分段手术改写（只动本段），续行段只动自己那行 */
  private resolveSetEventText(
    doc: SourceDocument,
    intent: Extract<TimelineIntent, { type: 'set-event-text' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'timeline-event') return null
    const text = intent.text.trim()
    if (!isValidTimelineEventText(text)) return null
    return new Map([[part.id, renderTimelineEvent(part.element as TimelineEventData, { text })]])
  }

  /** 删除事件：inline 段摘掉自己的 ` : xxx`，续行段整行内容清空（级联归零，逐字保留其余） */
  private resolveDeleteEvent(
    doc: SourceDocument,
    intent: Extract<TimelineIntent, { type: 'delete-event' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'timeline-event') return null
    return new Map([[part.id, '']])
  }

  /** 新增 section 行（缺省锚点回退文档末尾） */
  private resolveAddSection(
    doc: SourceDocument,
    intent: Extract<TimelineIntent, { type: 'add-section' }>,
  ): Map<string, string> | null {
    const name = (intent.name ?? newElementName('section')).trim()
    if (!isValidTimelineSectionName(name)) return null
    return insertAfter(doc, {
      afterElementId: intent.afterElementId,
      anchor: 'line-end',
      render: (indent) => indentLines(indent, [`section ${name}`]),
    })
  }

  /** 改 section 名称 */
  private resolveSetSectionName(
    doc: SourceDocument,
    intent: Extract<TimelineIntent, { type: 'set-section-name' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'timeline-section') return null
    const name = intent.name.trim()
    if (!isValidTimelineSectionName(name)) return null
    return new Map([[part.id, renderTimelineSection(part.element as TimelineSectionData, { name })]])
  }

  /** 设置图表标题（`title 文本`）：已有标题行则原地改；无则紧随声明头插入一行。
   * 空文本不落码（删标题属改结构，未定义——清单外，返回 null 由调用方放弃） */
  private resolveSetTitle(
    doc: SourceDocument,
    intent: Extract<TimelineIntent, { type: 'set-title' }>,
  ): Map<string, string> | null {
    const text = intent.text.trim()
    if (text === '') return null
    const existing = doc.elements.find((p) => p.element.kind === 'timeline-title')
    if (existing !== undefined) {
      return new Map([[existing.id, `title${(existing.element as TimelineTitleData).gap}${text}`]])
    }
    const header = doc.elements.find((p) => p.element.kind === 'timeline-header')
    if (header === undefined) return null
    return insertAfter(doc, {
      afterElementId: header.id,
      anchor: 'self',
      render: (indent) => indentLines(indent, [`title ${text}`]),
    })
  }

  /** 设置图表方向：改写头部 token；null = 去掉方向（跟随 mermaid 默认 LR） */
  private resolveSetDirection(
    doc: SourceDocument,
    intent: Extract<TimelineIntent, { type: 'set-direction' }>,
  ): Map<string, string> | null {
    const part = doc.elements.find((p) => p.element.kind === 'timeline-header')
    if (part === undefined) return null
    if (intent.direction === null) {
      return new Map([[part.id, renderTimelineHeader(part.element as TimelineHeaderData, { direction: null })]])
    }
    const value = intent.direction.toUpperCase()
    if (!isValidTimelineDirection(value)) return null
    return new Map([[part.id, renderTimelineHeader(part.element as TimelineHeaderData, { direction: value })]])
  }
}

export const timelineParser = new TimelineParser()

/** 位置序身份的序号解析（`period:3` → 3）；形态不符 null（不凭空造身份） */
export function parseTimelineOrdinal(elementId: string, prefix: 'period' | 'event' | 'section'): number | null {
  const head = `${prefix}:`
  if (!elementId.startsWith(head)) return null
  const m = /^([1-9][0-9]*)$/.exec(elementId.slice(head.length))
  return m === null ? null : Number(m[1])
}

// ---------- 编辑意图（工单 05 表单 / 画布所需集合） ----------

export type TimelineIntent =
  /** 新增时期行（缺省锚点 = 文档末尾）；text 缺省「新阶段」 */
  | { type: 'add-period'; text?: string; afterElementId?: string }
  /** 改时期文本（elementId = `period:N`） */
  | { type: 'set-period-text'; elementId: string; text: string }
  /** 删除时期（连同其事件） */
  | { type: 'delete-period'; elementId: string }
  /** 给时期加事件（落续行 `: 文本`，锚点 = 该时期最后一个事件行 / 时期行） */
  | { type: 'add-event'; periodElementId: string; text: string }
  /** 改事件文本（elementId = `event:N`；inline 段手术改写本段） */
  | { type: 'set-event-text'; elementId: string; text: string }
  /** 删除事件 */
  | { type: 'delete-event'; elementId: string }
  /** 新增 section 行；name 缺省「新分组」 */
  | { type: 'add-section'; name?: string; afterElementId?: string }
  /** 改 section 名称 */
  | { type: 'set-section-name'; elementId: string; name: string }
  /** 设置图表标题（`title 文本`）；无标题行时紧随声明头插入一行 */
  | { type: 'set-title'; text: string }
  /** 设置图表方向；null = 去掉方向 token（跟随 mermaid 默认 LR） */
  | { type: 'set-direction'; direction: string | null }

// 显式引用 AnyElement，保证元素数据类型与 assembleDocument 的 AnyElement 约束一致
const _elementKindCheck: AnyElement = {} as TimelineElementData
void _elementKindCheck
