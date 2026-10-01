import { assembleDocument, getElementById, type ElementPart, type SourceDocument } from './document'
import { frontmatterEnd } from './frontmatter'
import { insertAfter } from './insert'
import type { DiagramParser, EditIntent, ParseResult, SourceParseError } from './parser'
import type { Span } from './span'

/**
 * eventmodeling 完整解析器（more-diagrams 工单 28，语法事实以
 * .scratch/more-diagrams/research/event-modeling.md 为准——工单 28 已实测复核，见 §8）：
 * 手写、逐行、带 span（ADR-0004）。可测试承诺：解析后不做修改再重组装，输出与输入逐字相同
 * （verbatim identity）。
 *
 * 覆盖（research §2 + §8 实测）：
 * - 声明头：**正文首行 `eventmodeling`**（唯一关键字，无 `-beta` 后缀；**不是 frontmatter
 *   声明式**——工单原假设作废，research §6 坑 1）。前导 frontmatter 由 `frontmatterEnd` 跳过，
 *   检测在剥离后的正文上匹配（与 mermaid 剥前导 frontmatter 再 detect 口径一致）。
 * - 时间帧（Time Frame）：`<tf|timeframe|rf|resetframe> <帧号> <实体类型> <实体标识>
 *   [->> 帧号…] [[数据块引用]] [内联数据]`。
 *   实体类型 `EmModelEntityType`：`ui`；`pcr`/`processor`；`cmd`/`command`；`rmo`/`readmodel`；
 *   `evt`/`event`。帧号 `EM_FID /\d{1,3}/`（**1–3 位**，research §8：4 位解析失败，本解析器
 *   只认 1–3 位，超出则整行不认、逐字保留）。`tf` 与 `rf` 仅关键字不同。
 * - 数据块 `data <Name> { … }`（多行，`{` 后紧跟换行；可加类型前缀，如 data X 后接反引号
 *   json 反引号再接 `{ … }`）；
 *   被 `[[Name]]` 引用。**块体是 opaque 文本**（research §5，渲染器原样当预格式化代码）。
 * - 命名空间 `Ns.Entity`（按首个点切分，仅用于泳道分组）。
 * - 边角（逐字保留即可；文档未载、仅语法支持）：`entity <QualifiedName>`、`note <帧号> { … }`、
 *   `gwt <帧号> given … when … then …`、注释（百分号注释 / 双斜杠行注释 / C 风格块注释）。
 *
 * **不解析、原样保留**（清单外语法不报错，ADR-0008）：空行、一切识别不了的行、
 * `title` / `accTitle:` / `accDescr:`（research §8.2 实测：12.0.0 文法虽声明但不**可达**，
 * 解析必失败——故不建模为支持语法，遇到时按未识别行逐字保留）。
 *
 * 身份（ADR-0012）：
 * - 帧 = **位置序身份** `frame:N`（文档序）——帧号可乱序/改动，位置序是唯一稳定身份；
 *   帧号 `frameId` 作为字段保留（`->>` 引用靠它解析）。
 * - 数据块 = **位置序身份** `data:N`（文档序）——数据块名可重复/改名，位置序唯一稳定。
 * - `->>` 显式来源 = 帧行内的一段（不是独立元素；落在帧元素的 `sourcesRaw` 字段）。
 * - 默认推断出的关系 = **派生连线、无源码语句**（research §3/§8.4）——不作为元素，
 *   由投影按同一规则推断（只读），不可编辑。
 */

interface ParseFailure extends Error {
  line: number
}

function parseFailure(line: number, message: string): ParseFailure {
  const error = new Error(message) as ParseFailure
  error.line = line
  return error
}

// ---------- 实体类型 ----------

/** 实体类型别名（research §2：`EmModelEntityType`）——原样保留用户书写的关键字 */
export const EM_ENTITY_TYPES = [
  'ui',
  'pcr',
  'processor',
  'cmd',
  'command',
  'rmo',
  'readmodel',
  'evt',
  'event',
] as const

export type EmEntityType = (typeof EM_ENTITY_TYPES)[number]

const EM_TYPE_SET: ReadonlySet<string> = new Set(EM_ENTITY_TYPES)

export function isEmEntityType(word: string): word is EmEntityType {
  return EM_TYPE_SET.has(word)
}

/** 类型归一（泳道分组用）：`processor`→`pcr`、`command`→`cmd`、`readmodel`→`rmo`、`event`→`evt` */
export type EmEntityGroup = 'ui' | 'pcr' | 'cmd' | 'rmo' | 'evt'

export function emEntityGroupOf(type: EmEntityType): EmEntityGroup {
  switch (type) {
    case 'ui':
      return 'ui'
    case 'pcr':
    case 'processor':
      return 'pcr'
    case 'cmd':
    case 'command':
      return 'cmd'
    case 'rmo':
    case 'readmodel':
      return 'rmo'
    case 'evt':
    case 'event':
      return 'evt'
  }
}

/** 泳道带（research §8.5：ui/pcr→UI/Automation；cmd/rmo→Command/Read Model；evt→Events） */
export type EmSwimlane = 'ui' | 'crm' | 'events'

export function emSwimlaneOfGroup(group: EmEntityGroup): EmSwimlane {
  switch (group) {
    case 'ui':
    case 'pcr':
      return 'ui'
    case 'cmd':
    case 'rmo':
      return 'crm'
    case 'evt':
      return 'events'
  }
}

// ---------- 元素数据 ----------

export interface EventModelingHeaderData {
  kind: 'eventmodeling-header'
  /** 原文关键字（恒 `eventmodeling`，保留用户书写） */
  keyword: string
  trailing: string
}

/** 时间帧行：`<tf|rf> <帧号> <实体类型> <实体标识> [->> 帧号…] [[数据块引用]] [内联数据]` */
export interface EmFrameData {
  kind: 'em-frame'
  /** 行首缩进原文（span 的一部分，改写相邻行时原样搬运） */
  indent: string
  /** 帧关键字原文（`tf` / `timeframe` / `rf` / `resetframe`） */
  keyword: string
  /** 帧号原文（1–3 位数字；`->>` 引用靠它解析） */
  frameId: string
  /** 实体类型原文（`EmModelEntityType` 之一） */
  entityType: EmEntityType
  /** 实体标识原文（可含命名空间 `Ns.Entity`；不含引号——EM_ID 词法） */
  entityIdentifier: string
  /** 显式来源帧号列表（`->>` 引用；原文，按出现序）；无显式来源为空数组 */
  sourceFrames: string[]
  /** 数据块引用名（`[[Name]]`；无引用为 null） */
  dataReference: string | null
  /** 内联数据整段原文（`{ … }` / `"…"` / `'…'`；无内联数据为 null） */
  inlineDataRaw: string | null
  /** 行尾残留空白与行尾注释（`%%` / `//`），逐字保留 */
  trailing: string
}

/** 数据块（多行）：data <Name> 可带反引号类型前缀再接 { … } */
export interface EmDataBlockData {
  kind: 'em-data'
  /** 数据块名原文（EM_ID） */
  name: string
  /** 类型前缀原文（不带反引号；无类型前缀为 null） */
  dataType: string | null
  /** 整块原文（从 `data` 起含尾换行），逐字保留（**opaque**——不解析块体） */
  raw: string
}

/** `entity <QualifiedName>` 声明行 */
export interface EmEntityDeclData {
  kind: 'em-entity'
  indent: string
  /** 限定的实体名原文 */
  name: string
  trailing: string
}

/** `note <帧号> { … }` 注释块（多行） */
export interface EmNoteData {
  kind: 'em-note'
  /** 所注帧号原文 */
  frameId: string
  /** 整块原文（从 `note` 起含尾换行），逐字保留 */
  raw: string
}

/** `gwt <帧号> given … when … then …` Given/When/Then 行 */
export interface EmGwtData {
  kind: 'em-gwt'
  indent: string
  /** 帧号原文 */
  frameId: string
  /** 语句体原文（`given` 之后到行尾），逐字保留 */
  body: string
}

export type EventModelingElementData =
  | EventModelingHeaderData
  | EmFrameData
  | EmDataBlockData
  | EmEntityDeclData
  | EmNoteData
  | EmGwtData

// ---------- 词法助手与校验 ----------

/** 帧号词法（EM_FID：1 到 3 位数字） */
const FRAME_ID_RE = /^\d{1,3}$/

/** 实体标识词法（EM_ID：下划线或字母开头后接词字符，可带命名空间 Ns.Entity，按首个点切分） */
const ENTITY_ID_RE = /^[_a-zA-Z]\w*(?:\.[_a-zA-Z]\w*)*$/

/** 数据块名 / 引用名词法（`EM_ID`，无命名空间） */
const DATA_NAME_RE = /^[_a-zA-Z]\w*$/

export function isValidEmFrameId(id: string): boolean {
  return FRAME_ID_RE.test(id)
}

export function isValidEmEntityIdentifier(id: string): boolean {
  return ENTITY_ID_RE.test(id)
}

export function isValidEmDataName(name: string): boolean {
  return DATA_NAME_RE.test(name)
}

/** 命名空间（首个点之前的部分）；无命名空间返回空串（research §6 坑 8：按**首个点**切分） */
export function emNamespaceOf(identifier: string): string {
  const idx = identifier.indexOf('.')
  return idx === -1 ? '' : identifier.slice(0, idx)
}

/** 名字（最后一个点之后的部分） */
export function emNameOf(identifier: string): string {
  const idx = identifier.lastIndexOf('.')
  return idx === -1 ? identifier : identifier.slice(idx + 1)
}

// ---------- 行级解析 ----------

const HEADER_RE = /^eventmodeling\b([^\S\n\r]*)$/
const FRAME_KEYWORD_RE = /^(tf|timeframe|rf|resetframe)[ \t]+/
// 类型前缀的反引号用 \u0060 表示（TS 不允许正则字面量里出现裸反引号）
// 块体起始约束（`{` 后紧跟换行）由 scanDataBlock 在实际源码上校验——行文本不含换行
const DATA_BLOCK_RE = /^data[ \t]+([_a-zA-Z]\w*)(?:[ \t]*\u0060([^\u0060]*)\u0060)?[ \t]*\{[ \t]*$/
const ENTITY_DECL_RE = /^entity[ \t]+([_a-zA-Z]\w*(?:\.[_a-zA-Z]\w*)*)([^\S\n\r]*)$/
const NOTE_BLOCK_RE = /^note[ \t]+(\d{1,3})[ \t]*\{[ \t]*$/
const GWT_RE = /^gwt[ \t]+(\d{1,3})[ \t]+given[ \t]+(.*)$/
const INLINE_DATA_RE = /^(?:\{(.*)\}|"(.*)"|'(.*)')$/

/** 行尾注释起点（百分号注释或双斜杠行注释的首次出现；C 风格块注释不在此列，单行内少见） */
function trailingCommentIndex(s: string): number {
  const pct = s.indexOf('%%')
  const slash = s.indexOf('//')
  const candidates = [pct, slash].filter((i) => i !== -1)
  return candidates.length === 0 ? -1 : Math.min(...candidates)
}

/** 帧行解析结果（不含 indent / kind 之外的派生） */
interface ParsedFrame {
  keyword: string
  frameId: string
  entityType: EmEntityType
  entityIdentifier: string
  sourceFrames: string[]
  dataReference: string | null
  inlineDataRaw: string | null
  trailing: string
}

/**
 * 时间帧行解析：`<kw> <帧号> <类型> <标识> [->> 帧号…] [[数据块引用]] [内联数据]`。
 * 不合形态返回 null（整行不认，逐字保留）。
 *
 * 字段顺序由 Langium `EmTimeFrame` 文法固定（research §2 + §8）：`->>` 组在
 * `[[ ]]` 引用之前，`[[ ]]` 引用在末尾可选内联数据（`EmDataInline`）之前。
 */
function parseFrameLine(body: string): ParsedFrame | null {
  const kwMatch = FRAME_KEYWORD_RE.exec(body)
  if (kwMatch === null) return null
  const commentIdx = trailingCommentIndex(body)
  const hard = commentIdx === -1 ? body : body.slice(0, commentIdx)
  const trailing = commentIdx === -1 ? '' : body.slice(commentIdx)
  let rest = hard.slice(kwMatch[0].length)

  // 1) 帧号
  const fidMatch = /^(\d{1,3})([ \t]+)/.exec(rest)
  if (fidMatch === null) return null
  const frameId = fidMatch[1]
  rest = rest.slice(fidMatch[0].length)

  // 2) 实体类型
  const typeMatch = /^([_a-zA-Z]+)([ \t]+)/.exec(rest)
  if (typeMatch === null || !isEmEntityType(typeMatch[1])) return null
  const entityType = typeMatch[1]
  rest = rest.slice(typeMatch[0].length)

  // 3) 实体标识（到空白 / `-` / `[` 为止）
  const idMatch = /^([_a-zA-Z]\w*(?:\.[_a-zA-Z]\w*)*)/.exec(rest)
  if (idMatch === null) return null
  const entityIdentifier = idMatch[1]
  rest = rest.slice(idMatch[0].length)

  // 4) `->>` 显式来源（可多段，空格分隔）
  const sourceFrames: string[] = []
  for (;;) {
    const arrow = /^([ \t]+)->>[ \t]*(\d{1,3})/.exec(rest)
    if (arrow === null) break
    sourceFrames.push(arrow[2])
    rest = rest.slice(arrow[0].length)
  }

  // 5) `[[数据块引用]]`（可选）
  let dataReference: string | null = null
  const refMatch = /^([ \t]*)\[\[([_a-zA-Z]\w*)\]\]/.exec(rest)
  if (refMatch !== null) {
    dataReference = refMatch[2]
    rest = rest.slice(refMatch[0].length)
  }

  // 6) 内联数据（可选；`{ … }` / `"…"` / `'…'`）
  let inlineDataRaw: string | null = null
  const inlineMatch = /^([ \t]*)(\{(.*)\}|"(.*)"|'(.*)')[ \t]*$/.exec(rest)
  if (inlineMatch !== null && INLINE_DATA_RE.test(inlineMatch[2])) {
    inlineDataRaw = inlineMatch[2]
    rest = ''
  }

  // 残余必须只剩空白（否则整行不认）
  if (rest.trim() !== '') return null

  return {
    keyword: kwMatch[1],
    frameId,
    entityType,
    entityIdentifier,
    sourceFrames,
    dataReference,
    inlineDataRaw,
    trailing,
  }
}

interface RawEntry {
  span: Span
  id: string
  data: EventModelingElementData
}

export class EventModelingParser implements DiagramParser {
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
    let frameCount = 0
    let dataCount = 0
    let seenHeader = false
    const bodyStart = frontmatterEnd(source)
    let lineNo = bodyStart === 0 ? 0 : source.slice(0, bodyStart).split('\n').length - 1
    let cursor = bodyStart

    for (;;) {
      const nl = source.indexOf('\n', cursor)
      const lineEndAbs = nl === -1 ? source.length : nl
      const line = source.slice(cursor, lineEndAbs)
      lineNo++
      const trimmed = line.trim()
      const body = line.replace(/\r$/, '')

      if (trimmed !== '') {
        const firstChar = line.length - line.trimStart().length
        const indent = line.slice(0, firstChar)
        const spanOfLine = (): Span => ({ start: cursor + firstChar, end: lineEndAbs })
        const content = body.slice(firstChar)

        if (!seenHeader) {
          const header = HEADER_RE.exec(content)
          if (header === null) {
            throw parseFailure(lineNo, '图表必须以 eventmodeling 声明开始')
          }
          seenHeader = true
          entries.push({
            span: spanOfLine(),
            id: 'eventmodeling-header',
            data: { kind: 'eventmodeling-header', keyword: 'eventmodeling', trailing: header[1] ?? '' },
          })
        } else if (content.startsWith('%%') || content.startsWith('//')) {
          // 行注释：逐字保留
        } else if (content.startsWith('/*')) {
          // 块注释起行：逐字保留（不跨行扫描——块体不是可寻址元素）
        } else if (DATA_BLOCK_RE.test(content)) {
          // 数据块（多行）：从本行 `data` 起找到闭合 `}` 行（含 `{` 后紧跟换行的约束）
          const block = this.scanDataBlock(source, cursor + firstChar, content)
          if (block !== null) {
            dataCount++
            entries.push({ span: block.span, id: `data:${dataCount}`, data: block.data })
            cursor = block.span.end
            lineNo = source.slice(0, cursor).split('\n').length - 1
            continue
          }
        } else if (NOTE_BLOCK_RE.test(content)) {
          const block = this.scanNoteBlock(source, cursor + firstChar, content)
          if (block !== null) {
            entries.push({ span: block.span, id: `note:${lineNo}`, data: block.data })
            cursor = block.span.end
            lineNo = source.slice(0, cursor).split('\n').length - 1
            continue
          }
        } else {
          const frame = parseFrameLine(content)
          if (frame !== null) {
            frameCount++
            entries.push({
              span: spanOfLine(),
              id: `frame:${frameCount}`,
              data: { kind: 'em-frame', indent, ...frame },
            })
          } else {
            const decl = ENTITY_DECL_RE.exec(content)
            if (decl !== null) {
              entries.push({
                span: spanOfLine(),
                id: `entity:${lineNo}`,
                data: {
                  kind: 'em-entity',
                  indent,
                  name: decl[1],
                  trailing: decl[2] ?? '',
                },
              })
            } else {
              const gwt = GWT_RE.exec(content)
              if (gwt !== null) {
                entries.push({
                  span: spanOfLine(),
                  id: `gwt:${lineNo}`,
                  data: { kind: 'em-gwt', indent, frameId: gwt[1], body: gwt[2] },
                })
              }
              // 其余（含 title / accTitle / accDescr / 识别不了的行）：逐字保留
            }
          }
        }
      }

      if (nl === -1) break
      cursor = nl + 1
    }

    if (!seenHeader) {
      throw parseFailure(1, '图表必须以 eventmodeling 声明开始')
    }
    return assembleDocument(source, entries)
  }

  /**
   * 扫描多行数据块：从 `data <Name>[\`type\`]{` 行起，块体直到「独占一行的 `}`」。
   * 块体是 opaque 文本（research §5）——只定位边界，不解析内容。
   */
  private scanDataBlock(
    source: string,
    start: number,
    firstLine: string,
  ): { span: Span; data: EmDataBlockData } | null {
    const m = DATA_BLOCK_RE.exec(firstLine)
    if (m === null) return null
    const name = m[1]
    const dataType = m[2] ?? null
    // 块体起始约束：`{` 后必须紧跟换行（`EM_DATA_BLOCK` 要求 `\{[\t ]*\r?\n`）
    const braceAt = start + firstLine.lastIndexOf('{')
    const afterBrace = source.slice(braceAt + 1)
    if (!/^[ \t]*\r?\n/.test(afterBrace)) return null
    // 从首行之后逐行找闭合 `}`（允许尾随空白）
    let cursor = start + firstLine.length
    if (cursor < source.length && source[cursor] === '\n') cursor++
    for (;;) {
      const nl = source.indexOf('\n', cursor)
      const lineEnd = nl === -1 ? source.length : nl
      const line = source.slice(cursor, lineEnd)
      if (/^[ \t]*\}[ \t]*\r?$/.test(line)) {
        const end = nl === -1 ? source.length : nl + 1
        return {
          span: { start, end },
          data: { kind: 'em-data', name, dataType, raw: source.slice(start, end) },
        }
      }
      if (nl === -1) return null // 未闭合：不是数据块（整块逐字保留）
      cursor = nl + 1
    }
  }

  /** 扫描 `note <帧号> { … }` 块（边界同上：独占一行的 `}`） */
  private scanNoteBlock(
    source: string,
    start: number,
    firstLine: string,
  ): { span: Span; data: EmNoteData } | null {
    const m = NOTE_BLOCK_RE.exec(firstLine)
    if (m === null) return null
    const frameId = m[1]
    const braceAt = start + firstLine.lastIndexOf('{')
    if (!/^[ \t]*\r?\n/.test(source.slice(braceAt + 1))) return null
    let cursor = start + firstLine.length
    if (cursor < source.length && source[cursor] === '\n') cursor++
    for (;;) {
      const nl = source.indexOf('\n', cursor)
      const lineEnd = nl === -1 ? source.length : nl
      const line = source.slice(cursor, lineEnd)
      if (/^[ \t]*\}[ \t]*\r?$/.test(line)) {
        const end = nl === -1 ? source.length : nl + 1
        return {
          span: { start, end },
          data: { kind: 'em-note', frameId, raw: source.slice(start, end) },
        }
      }
      if (nl === -1) return null
      cursor = nl + 1
    }
  }

  // ---------- 意图落地（resolveRewrites） ----------

  resolveRewrites(doc: SourceDocument, intent: EditIntent): ReadonlyMap<string, string> | null {
    switch (intent.type) {
      case 'set-em-frame':
        return this.resolveSetFrame(doc, intent as Extract<EventModelingIntent, { type: 'set-em-frame' }>)
      case 'add-em-frame':
        return this.resolveAddFrame(doc, intent as Extract<EventModelingIntent, { type: 'add-em-frame' }>)
      case 'delete-em-frame':
        return this.removeLine(doc, intent.elementId as string, 'em-frame')
      case 'set-em-data-name':
        return this.resolveSetDataName(doc, intent as Extract<EventModelingIntent, { type: 'set-em-data-name' }>)
      case 'add-em-data':
        return this.resolveAddData(doc, intent as Extract<EventModelingIntent, { type: 'add-em-data' }>)
      case 'delete-em-data':
        return this.removeLine(doc, intent.elementId as string, 'em-data')
      default:
        return null
    }
  }

  private partOf(doc: SourceDocument, elementId: string, kind: EventModelingElementData['kind']) {
    const part: ElementPart | undefined = getElementById(doc, elementId)
    if (part === undefined || part.element.kind !== kind) return null
    return part
  }

  private removeLine(
    doc: SourceDocument,
    elementId: string,
    kind: EventModelingElementData['kind'],
  ): Map<string, string> | null {
    const part = this.partOf(doc, elementId, kind)
    return part === null ? null : new Map([[part.id, '']])
  }

  /** 渲染帧行（**原地改写**）：不含缩进——元素 span 从首个非空字符起，缩进属前一段 verbatim。 */
  private renderFrame(data: EmFrameData): string {
    const sourcePart = data.sourceFrames.map((f) => ` ->> ${f}`).join('')
    const refPart = data.dataReference !== null ? ` [[${data.dataReference}]]` : ''
    const inlinePart = data.inlineDataRaw !== null ? ` ${data.inlineDataRaw}` : ''
    return `${data.keyword} ${data.frameId} ${data.entityType} ${data.entityIdentifier}${sourcePart}${refPart}${inlinePart}${data.trailing}`
  }

  /**
   * 改帧字段（帧号 / 实体类型 / 实体标识 / 显式来源）。改动会**连带重写引用它的
   * `->>` 端点**（帧号即引用键）与 `note`/`gwt` 的帧号引用——名字即引用。
   */
  private resolveSetFrame(
    doc: SourceDocument,
    intent: Extract<EventModelingIntent, { type: 'set-em-frame' }>,
  ): Map<string, string> | null {
    const part = this.partOf(doc, intent.elementId, 'em-frame')
    if (part === null) return null
    const data = part.element as EmFrameData
    const next: EmFrameData = { ...data }

    // 无变化护栏：所有字段都与现状相同（含空数组等同省略）→ 不产生空重写
    const noChange =
      (intent.frameId === undefined || intent.frameId === data.frameId) &&
      (intent.entityType === undefined || intent.entityType === data.entityType) &&
      (intent.entityIdentifier === undefined || intent.entityIdentifier === data.entityIdentifier) &&
      (intent.sourceFrames === undefined ||
        intent.sourceFrames.join('\u0000') === data.sourceFrames.join('\u0000')) &&
      (intent.dataReference === undefined || intent.dataReference === data.dataReference)
    if (noChange) return null

    let frameIdChanged = false
    if (intent.frameId !== undefined) {
      if (!isValidEmFrameId(intent.frameId)) return null
      if (intent.frameId !== data.frameId) {
        next.frameId = intent.frameId
        frameIdChanged = true
      }
    }
    if (intent.entityType !== undefined) {
      if (!isEmEntityType(intent.entityType)) return null
      next.entityType = intent.entityType
    }
    if (intent.entityIdentifier !== undefined) {
      if (!isValidEmEntityIdentifier(intent.entityIdentifier)) return null
      next.entityIdentifier = intent.entityIdentifier
    }
    if (intent.sourceFrames !== undefined) {
      for (const f of intent.sourceFrames) {
        if (!isValidEmFrameId(f)) return null
      }
      next.sourceFrames = intent.sourceFrames
    }
    if (intent.dataReference !== undefined) {
      if (intent.dataReference !== null && !isValidEmDataName(intent.dataReference)) return null
      next.dataReference = intent.dataReference
    }
    const rewrites = new Map<string, string>([[part.id, this.renderFrame(next)]])
    if (frameIdChanged) {
      const oldId = data.frameId
      const newId = next.frameId
      // 其他帧的 `->>` 引用重写
      for (const other of doc.elements) {
        if (other.id === part.id || other.element.kind !== 'em-frame') continue
        const otherFrame = other.element as EmFrameData
        if (!otherFrame.sourceFrames.includes(oldId)) continue
        const updated: EmFrameData = {
          ...otherFrame,
          sourceFrames: otherFrame.sourceFrames.map((f) => (f === oldId ? newId : f)),
        }
        rewrites.set(other.id, this.renderFrame(updated))
      }
      // note / gwt 帧号引用重写（整块/整行重建，保留其余原文）
      for (const other of doc.elements) {
        if (other.element.kind === 'em-note') {
          const note = other.element as EmNoteData
          if (note.frameId === oldId) {
            rewrites.set(other.id, note.raw.replace(`note ${oldId}`, `note ${newId}`))
          }
        } else if (other.element.kind === 'em-gwt') {
          const gwt = other.element as EmGwtData
          if (gwt.frameId === oldId) {
            rewrites.set(other.id, gwt.indent + `gwt ${newId} given ${gwt.body}`)
          }
        }
      }
    }
    return rewrites
  }

  /** 新增帧（追加到文档末尾；缩进跟随文档首个帧行或空） */
  private resolveAddFrame(
    doc: SourceDocument,
    intent: Extract<EventModelingIntent, { type: 'add-em-frame' }>,
  ): Map<string, string> | null {
    if (!isValidEmFrameId(intent.frameId)) return null
    if (!isEmEntityType(intent.entityType)) return null
    if (!isValidEmEntityIdentifier(intent.entityIdentifier)) return null
    const keyword = intent.keyword ?? 'tf'
    if (keyword !== 'tf' && keyword !== 'timeframe' && keyword !== 'rf' && keyword !== 'resetframe') return null
    const sourcePart = (intent.sourceFrames ?? []).map((f) => ` ->> ${f}`).join('')
    const refPart = intent.dataReference !== undefined && intent.dataReference !== null ? ` [[${intent.dataReference}]]` : ''
    const line = `${keyword} ${intent.frameId} ${intent.entityType} ${intent.entityIdentifier}${sourcePart}${refPart}\n`
    return insertAfter(doc, {
      afterElementId: intent.afterElementId,
      anchor: 'line-end',
      render: (ind, original) => (/[\n\r]$/.test(original) ? '' : '\n') + ind + line,
    })
  }

  /** 改数据块名（只动名字 token，块体逐字保留——research §5） */
  private resolveSetDataName(
    doc: SourceDocument,
    intent: Extract<EventModelingIntent, { type: 'set-em-data-name' }>,
  ): Map<string, string> | null {
    const part = this.partOf(doc, intent.elementId, 'em-data')
    if (part === null || !isValidEmDataName(intent.name)) return null
    const data = part.element as EmDataBlockData
    if (intent.name === data.name) return null
    // 只替换 `data <old>` 里的名字 token（保留类型前缀与块体）
    const replaced = data.raw.replace(new RegExp(`^data[ \\t]+${data.name}\\b`), `data ${intent.name}`)
    return new Map([[part.id, replaced]])
  }

  /** 新增数据块（追加到文档末尾；落 `data <name> {` + 空体 + `}` 三行，块体 opaque 逐字保留） */
  private resolveAddData(
    doc: SourceDocument,
    intent: Extract<EventModelingIntent, { type: 'add-em-data' }>,
  ): Map<string, string> | null {
    if (!isValidEmDataName(intent.name)) return null
    const line = `data ${intent.name} {\n}\n`
    return insertAfter(doc, {
      afterElementId: intent.afterElementId,
      anchor: 'line-end',
      render: (ind, original) => (/[\n\r]$/.test(original) ? '' : '\n') + ind + line,
    })
  }
}

export const eventModelingParser = new EventModelingParser()

// ---------- 编辑意图（工单 28 表单 / 画布所需集合） ----------

export type EventModelingIntent =
  /** 改帧字段（帧号 / 类型 / 标识 / 显式来源 / 数据块引用）；改帧号连带重写引用它的 `->>` 与 note/gwt */
  | {
      type: 'set-em-frame'
      elementId: string
      frameId?: string
      entityType?: EmEntityType
      entityIdentifier?: string
      sourceFrames?: string[]
      dataReference?: string | null
    }
  /** 新增帧（追加到文档末尾；keyword 缺省 `tf`） */
  | {
      type: 'add-em-frame'
      frameId: string
      entityType: EmEntityType
      entityIdentifier: string
      keyword?: string
      sourceFrames?: string[]
      dataReference?: string
      afterElementId?: string
    }
  /** 删除帧行（其派生连线随投影重算） */
  | { type: 'delete-em-frame'; elementId: string }
  /** 改数据块名（只动名字 token，块体逐字保留） */
  | { type: 'set-em-data-name'; elementId: string; name: string }
  /** 新增数据块（追加到文档末尾；空块体占位） */
  | { type: 'add-em-data'; name: string; afterElementId?: string }
  /** 删除数据块（整块） */
  | { type: 'delete-em-data'; elementId: string }
