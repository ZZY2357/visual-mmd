import { assembleDocument, getElementById, type ElementPart, type SourceDocument } from './document'
import { frontmatterEnd } from './frontmatter'
import { insertAfter } from './insert'
import type { DiagramParser, EditIntent, ParseResult, SourceParseError } from './parser'
import type { Span } from './span'

/**
 * xychart（xy 图表）完整解析器（more-diagrams 工单 14，语法事实以 spec 的
 * research/data-display.md xychart 节 + 离线核对
 * node_modules/mermaid/dist/chunks/mermaid.core/xychartDiagram-PMCCYNJV.mjs 的
 * jison 词法（728 行）与文法动作为准）：手写、逐行、带 span（ADR-0004）。
 * 可测试承诺：解析后不做修改再重组装，输出与输入逐字相同（verbatim identity）。
 *
 * 覆盖（分层对齐，工单范围）：
 * - 声明头 `xychart` / `xychart-beta`（同认，case-insensitive）+ 可选方向修饰符
 *   `horizontal` / `vertical`（独立词，空格分隔——jison 规则 `(?:vertical|horizontal)`）
 * - `title 标题`（引号包裹或裸词；裸词限 ASCII 词法片段，含空格/中文必须引号）
 * - `x-axis 标题 [类别, ...]`（类别数组形态）或 `x-axis 标题 min --> max`（数值 range 形态）
 * - `y-axis 标题 [min --> max]`（range 可省，自动推算——方括号是文档元语法非字面量）
 * - `line` / `bar` 系列：可选带名（引号/裸词）+ `[数值, ...]` 数组字面量；
 *   数值词法同 jison `[+-]?(?:\d+(?:\.\d+)?|\.\d+)`（负数/小数/无前导零的 `.98`）
 * - v11.16 点标签 `line [1 "a", 2]`：解析保留原文，**不在表单展开**（工单定案，
 *   带标签的系列 editable=false，值编辑意图被落码门拒绝）
 *
 * 词法与校验边界（mermaid 12 实证，工单 Comments 记录结论）：
 * - 裸文本 token 是 `[A-Za-z]+` 等 ASCII 片段的拼接——**非 ASCII（中文）裸词直接
 *   lexer 失败，必须引号包裹**。表单落码 encodeXychartText：纯 ASCII 词形走裸写，
 *   其余一律引号包裹（引号总是合法）；引号内不允许 `"` 与换行（STR = `[^"]*`，
 *   无转义机制）。
 * - 数值落码口径：严格数值词法（负号、小数、`.5` 形态）；**落码保留调用方给出的
 *   原字面格式（`45` 不写 `45.0`，工单定案）**；未触碰的数值 token 原文逐字回写。
 * - 清单外语法（无法识别的行、畸形行）不报错、逐字保留（ADR-0008）；frontmatter
 *   （含 xyChart config）与 `%%` 注释、accTitle/accDescr 整块逐字保留（工单明确
 *   不做 config 编辑）。
 *
 * span 约定（与 pie 同口径，行级）：行首缩进与换行留在 verbatim；元素 span 不跨行。
 * 身份（ADR-0012）：系列 `series:N` 按文档序 1 基编号（语法无元素 id，位置序是唯一
 * 可行身份）；标题与轴是文档级属性元素，固定 id `xychart-title` / `xychart-x-axis` /
 * `xychart-y-axis`（同 pie-title 的字面量口径）。
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

export interface XychartHeaderData {
  kind: 'xychart-header'
  /** 声明关键字原文（`xychart` / `xychart-beta`，保留用户写法） */
  keyword: string
  /** 方向修饰符；undefined = 未声明（mermaid 默认 vertical） */
  orientation?: 'horizontal' | 'vertical'
  /** 关键字与方向词之间的空白原文（无方向词时空串） */
  gap: string
  /** 声明行尾原文（尾随空白），逐字保留 */
  trailing: string
}

export interface XychartTitleData {
  kind: 'xychart-title'
  /** `title` 与标题之间的空白原文 */
  gap: string
  /** 标题段原文（引号包裹时含引号，去尾空白）；改写时行尾注释不保留（与 pie 同口径） */
  textRaw: string
}

/**
 * 轴行数据（文档级属性元素）。行形状：`indent? (x-axis|y-axis) gap title? sep rest? tail`
 * - `titleRaw`：引号包裹（含引号）或裸词原文；null = 无标题段
 * - `restRaw`：类别数组 `[...]` 或数值 range `min --> max` 段原文（去尾空白/注释）；
 *   null = 无后半段
 * - `sep`：标题段与后半段之间的空白原文（无后半段时为空串）
 */
export interface XychartAxisData {
  kind: 'xychart-axis'
  axis: 'x' | 'y'
  gap: string
  titleRaw: string | null
  sep: string
  restRaw: string | null
}

/** 轴行原文重建。changes 任一字段缺省 = 逐字保留原文 */
export function renderXychartAxis(
  d: XychartAxisData,
  changes: { titleRaw?: string | null; restRaw?: string | null } = {},
): string {
  const keyword = d.axis === 'x' ? 'x-axis' : 'y-axis'
  const titleRaw = changes.titleRaw !== undefined ? changes.titleRaw : d.titleRaw
  const restRaw = changes.restRaw !== undefined ? changes.restRaw : d.restRaw
  // 原本无标题段、补写标题时补一个分隔空格（原文 sep 为空串——标题是新增段，绝不产出 `x-axis 时间[...]`）
  const sep = changes.titleRaw !== undefined && d.titleRaw === null && titleRaw !== null ? ' ' : d.sep
  if (titleRaw === null) {
    // 无标题段：keyword + gap + rest（rest 为 null = 空轴行，不产出）
    return restRaw === null ? keyword : `${keyword}${d.gap}${restRaw}`
  }
  return restRaw === null
    ? `${keyword}${d.gap}${titleRaw}`
    : `${keyword}${d.gap}${titleRaw}${sep}${restRaw}`
}

/**
 * 系列行数据（节点级元素）。行形状：`indent? (line|bar) gap1 name? gap2 [...] tail`
 * - `nameRaw`：引号包裹（含引号）或裸词原文；null = 未命名系列
 * - `arrayRaw`：`[...]` 段原文（含括号），内部数值/标签 token 逐字保留
 * - `tail`：行尾空白 / `%%` 注释（改写时逐字回写）
 */
export interface XychartSeriesData {
  kind: 'xychart-series'
  seriesType: 'line' | 'bar'
  gap1: string
  nameRaw: string | null
  gap2: string
  arrayRaw: string
  tail: string
}

/** 系列行原文重建。changes 任一字段缺省 = 逐字保留原文 */
export function renderXychartSeries(
  d: XychartSeriesData,
  changes: { seriesType?: 'line' | 'bar'; nameRaw?: string | null; arrayRaw?: string } = {},
): string {
  const seriesType = changes.seriesType ?? d.seriesType
  const nameRaw = changes.nameRaw !== undefined ? changes.nameRaw : d.nameRaw
  const arrayRaw = changes.arrayRaw ?? d.arrayRaw
  if (nameRaw === null) return `${seriesType}${d.gap1}${arrayRaw}${d.tail}`
  return `${seriesType}${d.gap1}${nameRaw}${d.gap2}${arrayRaw}${d.tail}`
}

export type XychartElementData =
  | XychartHeaderData
  | XychartTitleData
  | XychartAxisData
  | XychartSeriesData

// ---------- 数组条目（系列数值 / 轴类别的 token 级表示） ----------

/** `[...]` 内的一个 token：lead 是它之前的分隔原文，token 是原文，tail 是裸 token 之后的尾部空白 */
export interface XychartArrayEntry {
  lead: string
  token: string
  /** 裸 token（轴类别）尾部空白原文——byte 级原位保留，不挪位 */
  tail?: string
}

/**
 * 扫描 `[...]` 内部为 token 列表：数值（kind 'number'，词法同 jison）或引号标签
 * （kind 'label'，v11.16 点标签）。其余内容（畸形引号、未知字符）→ null（整条
 * 记录不成元素，逐字保留）。tokenMatcher 判定裸 token 是否合法数值（系列用；
 * 轴类别用 anyToken）。
 */
function scanArrayEntries(
  inner: string,
  mode: 'numbers' | 'any',
): { entries: XychartArrayEntry[]; trailing: string } | null {
  const entries: XychartArrayEntry[] = []
  let lead = ''
  let i = 0
  for (;;) {
    // 收集分隔原文（空白与逗号）
    while (i < inner.length && (inner[i] === ' ' || inner[i] === '\t' || inner[i] === ',' || inner[i] === '\n' || inner[i] === '\r')) {
      lead += inner[i]
      i++
    }
    if (i >= inner.length) return { entries, trailing: lead }
    if (inner[i] === '"') {
      // 引号 token（点标签 / 引号类别）：STR = `[^"]*`，无转义——闭引号即止
      const close = inner.indexOf('"', i + 1)
      if (close === -1) return null
      entries.push({ lead, token: inner.slice(i, close + 1) })
      i = close + 1
      lead = ''
      continue
    }
    if (mode === 'numbers') {
      const m = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)/.exec(inner.slice(i))
      if (m === null) return null // 未知内容：整条不成元素
      entries.push({ lead, token: m[0] })
      i += m[0].length
      lead = ''
      continue
    }
    // 裸 token（轴类别）：取到下一个顶层逗号（裸 token 内不允许引号/换行）；
    // 尾部空白留在 token 之后的 tail（byte 级原位保留，不挪到下一 lead）
    let j = i
    while (j < inner.length && inner[j] !== ',' && inner[j] !== '"' && inner[j] !== '\n' && inner[j] !== '\r') j++
    const rawToken = inner.slice(i, j)
    const trimmed = rawToken.replace(/[ \t]+$/, '')
    if (trimmed === '') return null
    const tail = rawToken.slice(trimmed.length)
    entries.push({ lead, token: trimmed, ...(tail !== '' ? { tail } : {}) })
    i = j
    lead = ''
  }
}

/** 从 `[...]` 段原文取括号内原文；形态非法（无闭括号）→ null */
function arrayInnerOf(arrayRaw: string): string | null {
  if (!arrayRaw.startsWith('[') || !arrayRaw.endsWith(']') || arrayRaw.length < 2) return null
  return arrayRaw.slice(1, -1)
}

/** 条目列表 → `[...]` 段原文（未触碰 token 与分隔原文逐字回写；trailing 是末尾悬挂分隔原文） */
export function renderXychartArray(entries: readonly XychartArrayEntry[], trailing = ''): string {
  return `[${entries.map((e) => e.lead + e.token + (e.tail ?? '')).join('')}${trailing}]`
}

// ---------- 文本编解码与落码门 ----------

/**
 * 裸词合法性（jison TEXT = `[A-Za-z]+` 片段与 `_ . & # * = : + - , 数字` 等的拼接，
 * 且数值词法优先）：仅放行「字母开头 + 词形字符」的 ASCII 裸词，其余一律引号包裹
 * （引号 STR 总是合法——工单 Comments 记录口径）。空串非法（引号空串语义不明）。
 */
const BARE_TEXT_RE = /^[A-Za-z][A-Za-z0-9_\-]*$/

/** 文本 → 段原文：词形 ASCII 裸写，其余（含空格/中文/逗号）引号包裹 */
export function encodeXychartText(text: string): string {
  return BARE_TEXT_RE.test(text) ? text : `"${text}"`
}

/** 段原文 → 解码文本：引号包裹取引号内文，裸词原样。只对扫描器判定良构的原文调用 */
export function decodeXychartText(raw: string): string {
  if (raw.length < 2 || raw[0] !== '"' || raw[raw.length - 1] !== '"') return raw
  return raw.slice(1, -1)
}

/**
 * 文本落码合法性（表单/落码门共用）：非空、不含引号（STR 无转义，`"` 会提前闭合）、
 * 不含换行（单行语法）、不含 `%%`（TITLE/TEXT token 在 `%%` 处被当注释截断）。
 */
export function isValidXychartText(text: string): boolean {
  const trimmed = text.trim()
  return trimmed !== '' && !/["\n]/.test(trimmed) && !trimmed.includes('%%')
}

/** 数值词法（jison `[+-]?(?:\d+(?:\.\d+)?|\.\d+)`）：负号/小数/无前导零的 `.98` 合法 */
const XYCHART_NUMBER_RE = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/

/** 数值 token → 数值：符合词法时给出数值，否则 null */
export function parseXychartNumber(token: string): number | null {
  return XYCHART_NUMBER_RE.test(token) ? Number(token) : null
}

/**
 * 表单输入的数值落码口径：严格数值词法（不含前导 `+`——手写源码里 `+5` 保留原文，
 * 表单新值不产出生僻形态）。**落码保留输入的字面格式**（`45` 落 `45` 而非 `45.0`）。
 */
export function isValidXychartNumberInput(value: string): boolean {
  return /^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value.trim())
}

// ---------- 行解析 ----------

const HEADER_RE = /^xychart(?:-beta)?(?:[ \t]+(horizontal|vertical))?[ \t]*$/i
const ACC_PREFIX = /^acc(Title|Descr)\b/i

/** 系列数组条目：只认数值与引号标签 token（点标签）。存在任一标签 → 系列不可值编辑 */
function parseSeriesArray(
  arrayRaw: string,
): { entries: XychartArrayEntry[]; hasLabels: boolean; trailing: string } | null {
  const inner = arrayInnerOf(arrayRaw)
  if (inner === null) return null
  const scanned = scanArrayEntries(inner, 'numbers')
  if (scanned === null) return null
  const hasLabels = scanned.entries.some((e) => e.token.startsWith('"'))
  return { entries: scanned.entries, hasLabels, trailing: scanned.trailing }
}

/** 类别数组条目：裸词 / 引号皆可（token 原文保留，合法性在改写时把关） */
function parseCategoryEntries(arrayRaw: string): { entries: XychartArrayEntry[]; trailing: string } | null {
  const inner = arrayInnerOf(arrayRaw)
  if (inner === null) return null
  const scanned = scanArrayEntries(inner, 'any')
  if (scanned === null || scanned.entries.length === 0) return null
  return scanned
}

/** 数值 range 段解析：`min --> max`（两端都是数值 token）→ 原文段；否则 null */
function parseRangeRest(rest: string): string | null {
  const m = /^[ \t]*([+-]?(?:\d+(?:\.\d+)?|\.\d+))[ \t]*-->[ \t]*([+-]?(?:\d+(?:\.\d+)?|\.\d+))[ \t]*$/.exec(rest)
  return m === null ? null : rest.trim()
}

/**
 * 轴行解析（`x-axis` / `y-axis` 之后的正文）：
 * - 引号开头：引号段为标题，其余允许 range / 类别数组 / 空
 * - 裸词开头：标题 = `[` 或 range 之前的文本（trim）；之后允许类别数组 / range / 空
 * - 正文不合法（畸形引号、未知形态）→ null（整行逐字保留，不成元素）
 */
function parseAxisBody(axis: 'x' | 'y', body: string): XychartAxisData | null {
  if (body.trim() === '') return null
  const gap = body.slice(0, body.length - body.trimStart().length)
  const rest = body.slice(gap.length)
  if (rest.startsWith('"')) {
    const close = rest.indexOf('"', 1)
    if (close === -1) return null
    const titleRaw = rest.slice(0, close + 1)
    const after = rest.slice(close + 1)
    const sep = /^[ \t]*/.exec(after)?.[0] ?? ''
    const restTrimmed = after.slice(sep.length).replace(/[ \t]+$/, '')
    let restRaw: string | null = null
    if (restTrimmed !== '' && !restTrimmed.startsWith('%%')) {
      if (restTrimmed.startsWith('[')) {
        if (!restTrimmed.endsWith(']') || restTrimmed.slice(restTrimmed.indexOf(']') + 1).trim() !== '') return null
        restRaw = restTrimmed
      } else {
        restRaw = parseRangeRest(restTrimmed)
        if (restRaw === null) return null
      }
    }
    return { kind: 'xychart-axis', axis, gap, titleRaw, sep, restRaw }
  }
  // 裸词/无标题形态：先按顶层 `[`（裸词段不含引号）切
  const bracket = rest.indexOf('[')
  const arrow = rest.lastIndexOf('-->')
  if (bracket !== -1 && (arrow === -1 || bracket < arrow)) {
    const titlePart = rest.slice(0, bracket)
    const titleRaw = titlePart.trim()
    const restRaw = rest.slice(bracket).replace(/[ \t]+$/, '')
    if (!restRaw.endsWith(']')) return null
    if (restRaw.slice(restRaw.indexOf(']') + 1).trim() !== '') return null // `]` 后还有内容
    return {
      kind: 'xychart-axis',
      axis,
      gap,
      titleRaw: titleRaw === '' ? null : titleRaw,
      sep: titleRaw === '' ? '' : titlePart.slice(titlePart.trimEnd().length) || ' ',
      restRaw,
    }
  }
  if (arrow !== -1) {
    const left = rest.slice(0, arrow)
    const right = rest.slice(arrow + 3)
    const minMatch = /^([\s\S]*?)([+-]?(?:\d+(?:\.\d+)?|\.\d+))$/.exec(left.trimEnd())
    if (minMatch === null || parseRangeRest(`0 --> ${right.trim()}`) === null) return null
    const titlePart = minMatch[1]!.trim()
    return {
      kind: 'xychart-axis',
      axis,
      gap,
      titleRaw: titlePart === '' ? null : titlePart,
      sep: titlePart === '' ? '' : ' ',
      restRaw: `${minMatch[2]} --> ${right.trim()}`,
    }
  }
  // 只有标题段
  return { kind: 'xychart-axis', axis, gap, titleRaw: rest.trim(), sep: '', restRaw: null }
}

// ---------- 解析器 ----------

interface RawEntry {
  span: Span
  id: string
  data: XychartElementData
}

export class XychartParser implements DiagramParser {
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
    let seriesCount = 0
    let seenHeader = false
    // 文首 frontmatter 块不参与解析，整体 verbatim 保留
    const bodyStart = frontmatterEnd(source)
    let lineNo = bodyStart === 0 ? 0 : source.slice(0, bodyStart).split('\n').length - 1
    let cursor = bodyStart

    for (;;) {
      const nl = source.indexOf('\n', cursor)
      const lineEndAbs = nl === -1 ? source.length : nl
      // \r\n 行：\r 属于换行符而非行内容（元素 span 不含 \r，原文由重组装逐字保留）
      const contentEnd =
        lineEndAbs > cursor && source.charCodeAt(lineEndAbs - 1) === 13 ? lineEndAbs - 1 : lineEndAbs
      const line = source.slice(cursor, contentEnd)
      lineNo++
      const trimmed = line.trim()

      if (trimmed !== '') {
        const firstChar = line.length - line.trimStart().length
        const spanOfLine = (): Span => ({ start: cursor + firstChar, end: contentEnd })

        if (!seenHeader) {
          const header = HEADER_RE.exec(trimmed)
          if (header === null) {
            throw parseFailure(lineNo, '图表必须以 xychart 声明开始')
          }
          seenHeader = true
          const orientation = header[1] as 'horizontal' | 'vertical' | undefined
          const keyword = /^xychart-beta/i.test(trimmed) ? 'xychart-beta' : 'xychart'
          entries.push({
            span: spanOfLine(),
            id: 'xychart-header',
            data: {
              kind: 'xychart-header',
              keyword,
              ...(orientation !== undefined ? { orientation } : {}),
              gap: orientation !== undefined ? trimmed.slice(keyword.length, trimmed.length - header[1]!.length) : '',
              trailing: line.slice(firstChar + trimmed.length),
            },
          })
        } else if (trimmed.startsWith('%%') || ACC_PREFIX.test(trimmed)) {
          // 注释 / 可访问性语句（工单明确不做编辑）：逐字保留
        } else if (/^title[ \t]/.test(trimmed)) {
          const raw = line.slice(firstChar + 'title'.length)
          const text = raw.trim()
          if (text !== '') {
            entries.push({
              span: spanOfLine(),
              id: 'xychart-title',
              data: { kind: 'xychart-title', gap: raw.slice(0, raw.length - raw.trimStart().length), textRaw: text },
            })
          }
          // 空标题等清单外形态：不解析，逐字保留
        } else if (/^x-axis[ \t]/.test(trimmed)) {
          const axis = parseAxisBody('x', line.slice(firstChar + 'x-axis'.length).replace(/[ \t]+$/, ''))
          if (axis !== null) entries.push({ span: spanOfLine(), id: 'xychart-x-axis', data: axis })
        } else if (/^y-axis[ \t]/.test(trimmed)) {
          const axis = parseAxisBody('y', line.slice(firstChar + 'y-axis'.length).replace(/[ \t]+$/, ''))
          if (axis !== null) entries.push({ span: spanOfLine(), id: 'xychart-y-axis', data: axis })
        } else if (/^(?:line|bar)[ \t]/.test(trimmed)) {
          const series = parseSeriesBody(line.slice(firstChar))
          if (series !== null) {
            seriesCount++
            entries.push({ span: spanOfLine(), id: `series:${seriesCount}`, data: series })
          }
        }
        // 其余（无法识别的行 / `line` 后无空白的怪行）：不解析，逐字保留
      }

      if (nl === -1) break
      cursor = nl + 1
    }

    if (!seenHeader) {
      throw parseFailure(1, '图表必须以 xychart 声明开始')
    }
    return assembleDocument(source, entries)
  }

  // ---------- 意图落地（resolveRewrites） ----------

  resolveRewrites(doc: SourceDocument, intent: EditIntent): ReadonlyMap<string, string> | null {
    switch (intent.type) {
      case 'add-series':
        return this.resolveAddSeries(doc, intent as never)
      case 'set-series-name':
        return this.resolveSetSeriesName(doc, intent as never)
      case 'set-series-type':
        return this.resolveSetSeriesType(doc, intent as never)
      case 'set-series-value':
        return this.resolveSetSeriesValue(doc, intent as never)
      case 'add-series-value':
        return this.resolveAddSeriesValue(doc, intent as never)
      case 'delete-series-value':
        return this.resolveDeleteSeriesValue(doc, intent as never)
      case 'delete-series':
        return this.resolveDeleteSeries(doc, intent as never)
      case 'set-title':
        return this.resolveSetTitle(doc, intent as never)
      case 'set-axis-title':
        return this.resolveSetAxisTitle(doc, intent as never)
      case 'set-axis-category':
        return this.resolveSetAxisCategory(doc, intent as never)
      case 'add-axis-category':
        return this.resolveAddAxisCategory(doc, intent as never)
      case 'delete-axis-category':
        return this.resolveDeleteAxisCategory(doc, intent as never)
      case 'set-axis-range':
        return this.resolveSetAxisRange(doc, intent as never)
      case 'remove-axis-range':
        return this.resolveRemoveAxisRange(doc, intent as never)
      default:
        return null
    }
  }

  private seriesPart(doc: SourceDocument, elementId: string): ElementPart | null {
    const part = getElementById(doc, elementId)
    return part !== undefined && part.element.kind === 'xychart-series' ? part : null
  }

  private axisPart(doc: SourceDocument, axis: 'x' | 'y'): ElementPart | null {
    const part = getElementById(doc, axis === 'x' ? 'xychart-x-axis' : 'xychart-y-axis')
    return part !== undefined && part.element.kind === 'xychart-axis' ? part : null
  }

  /**
   * 系列数组 → 可编辑条目（全数值、无点标签才可编辑——点标签系列工单定案不在表单
   * 展开，值编辑意图整体拒绝，绝不改写标签 token）
   */
  private editableEntries(data: XychartSeriesData): { entries: XychartArrayEntry[]; trailing: string } | null {
    const parsed = parseSeriesArray(data.arrayRaw)
    if (parsed === null || parsed.hasLabels) return null
    if (parsed.entries.length === 0) return null
    return { entries: parsed.entries, trailing: parsed.trailing }
  }

  /** 新增系列：追加在锚点行之后（缺省 = 文档末尾）；名字/数值全部过落码门 */
  private resolveAddSeries(
    doc: SourceDocument,
    intent: Extract<XychartIntent, { type: 'add-series' }>,
  ): Map<string, string> | null {
    if (intent.seriesType !== 'line' && intent.seriesType !== 'bar') return null
    const name = intent.name?.trim() ?? null
    if (name !== null && !isValidXychartText(name)) return null
    const values = intent.values.map((v) => v.trim())
    if (values.length === 0 || values.some((v) => !isValidXychartNumberInput(v))) return null
    const arrayRaw = `[${values.join(', ')}]`
    return insertAfter(doc, {
      afterElementId: intent.afterElementId,
      anchor: 'line-end',
      render: (indent) => `\n${indent}${intent.seriesType} ${name === null ? '' : `${encodeXychartText(name)} `}${arrayRaw}`,
    })
  }

  /** 改系列名：null = 去掉名字变未命名系列；非 null 须过文本落码门 */
  private resolveSetSeriesName(
    doc: SourceDocument,
    intent: Extract<XychartIntent, { type: 'set-series-name' }>,
  ): Map<string, string> | null {
    const part = this.seriesPart(doc, intent.elementId)
    if (part === null) return null
    const data = part.element as XychartSeriesData
    if (intent.name === null) {
      if (data.nameRaw === null) return null // 本就未命名，no-op 拒绝
      return new Map([[part.id, renderXychartSeries(data, { nameRaw: null })]])
    }
    const name = intent.name.trim()
    if (!isValidXychartText(name)) return null
    return new Map([[part.id, renderXychartSeries(data, { nameRaw: encodeXychartText(name) })]])
  }

  /** 改系列类型（line↔bar）：只换关键字，名字与数组逐字保留 */
  private resolveSetSeriesType(
    doc: SourceDocument,
    intent: Extract<XychartIntent, { type: 'set-series-type' }>,
  ): Map<string, string> | null {
    const part = this.seriesPart(doc, intent.elementId)
    if (part === null) return null
    const data = part.element as XychartSeriesData
    if (intent.seriesType !== 'line' && intent.seriesType !== 'bar') return null
    if (data.seriesType === intent.seriesType) return null // no-op 拒绝
    return new Map([[part.id, renderXychartSeries(data, { seriesType: intent.seriesType })]])
  }

  /** 改第 index（0 基）个数值：新值过落码门；其余 token 与分隔原文逐字保留 */
  private resolveSetSeriesValue(
    doc: SourceDocument,
    intent: Extract<XychartIntent, { type: 'set-series-value' }>,
  ): Map<string, string> | null {
    const part = this.seriesPart(doc, intent.elementId)
    const value = intent.value.trim()
    if (part === null || !isValidXychartNumberInput(value)) return null
    const arr = this.editableEntries(part.element as XychartSeriesData)
    if (arr === null || intent.index < 0 || intent.index >= arr.entries.length) return null
    arr.entries[intent.index] = { ...arr.entries[intent.index]!, token: value }
    return new Map([
      [part.id, renderXychartSeries(part.element as XychartSeriesData, { arrayRaw: renderXychartArray(arr.entries, arr.trailing) })],
    ])
  }

  /** 追加数值：分隔沿用最后一个条目的风格（含逗号 → `, `，纯空白 → 空格）；数组尾部的悬挂分隔原文回收为新增条目的 lead */
  private resolveAddSeriesValue(
    doc: SourceDocument,
    intent: Extract<XychartIntent, { type: 'add-series-value' }>,
  ): Map<string, string> | null {
    const part = this.seriesPart(doc, intent.elementId)
    const value = intent.value.trim()
    if (part === null || !isValidXychartNumberInput(value)) return null
    const data = part.element as XychartSeriesData
    const arr = this.editableEntries(data)
    if (arr === null) return null
    const lead =
      arr.trailing !== ''
        ? arr.trailing
        : arr.entries[arr.entries.length - 1]!.lead.includes(',')
          ? ', '
          : ' '
    arr.entries.push({ lead, token: value })
    return new Map([[part.id, renderXychartSeries(data, { arrayRaw: renderXychartArray(arr.entries) })]])
  }

  /** 删除第 index（0 基）个数值：其与前驱之间的分隔顶替后继条目原 lead（两个分隔只留一个，绝不产出双逗号/前导逗号） */
  private resolveDeleteSeriesValue(
    doc: SourceDocument,
    intent: Extract<XychartIntent, { type: 'delete-series-value' }>,
  ): Map<string, string> | null {
    const part = this.seriesPart(doc, intent.elementId)
    if (part === null) return null
    const data = part.element as XychartSeriesData
    const arr = this.editableEntries(data)
    if (arr === null || intent.index < 0 || intent.index >= arr.entries.length) return null
    if (arr.entries.length === 1) return null // 至少保留一个数值（空数组 mermaid 渲染无意义）
    const removed = arr.entries.splice(intent.index, 1)[0]!
    if (intent.index < arr.entries.length) {
      arr.entries[intent.index] = { lead: removed.lead, token: arr.entries[intent.index]!.token }
    }
    return new Map([[part.id, renderXychartSeries(data, { arrayRaw: renderXychartArray(arr.entries, arr.trailing) })]])
  }

  private resolveDeleteSeries(
    doc: SourceDocument,
    intent: Extract<XychartIntent, { type: 'delete-series' }>,
  ): Map<string, string> | null {
    const part = this.seriesPart(doc, intent.elementId)
    if (part === null) return null
    return new Map([[part.id, '']])
  }

  /** 设置图表标题（`title 文本`）：已有标题行则原地改；无则紧随声明头插入一行 */
  private resolveSetTitle(
    doc: SourceDocument,
    intent: Extract<XychartIntent, { type: 'set-title' }>,
  ): Map<string, string> | null {
    const text = intent.text.trim()
    if (!isValidXychartText(text)) return null
    const existing = doc.elements.find((p) => p.element.kind === 'xychart-title')
    if (existing !== undefined) {
      return new Map([[existing.id, `title${(existing.element as XychartTitleData).gap}${encodeXychartText(text)}`]])
    }
    const header = doc.elements.find((p) => p.element.kind === 'xychart-header')
    if (header === undefined) return null
    return insertAfter(doc, {
      afterElementId: header.id,
      anchor: 'self',
      render: (indent) => `\n${indent}title ${encodeXychartText(text)}`,
    })
  }

  /** 改轴标题（标题是必选段——research 两种形态都带标题；去掉标题不提供，记录在案） */
  private resolveSetAxisTitle(
    doc: SourceDocument,
    intent: Extract<XychartIntent, { type: 'set-axis-title' }>,
  ): Map<string, string> | null {
    if (intent.axis !== 'x' && intent.axis !== 'y') return null
    const part = this.axisPart(doc, intent.axis)
    const title = intent.title.trim()
    if (part === null || !isValidXychartText(title)) return null
    const data = part.element as XychartAxisData
    if (decodeXychartText(data.titleRaw ?? '') === title && data.titleRaw !== null) {
      const encoded = encodeXychartText(title)
      if (encoded === data.titleRaw) return null // 原样 no-op 拒绝
    }
    return new Map([[part.id, renderXychartAxis(data, { titleRaw: encodeXychartText(title) })]])
  }

  /** 类别条目（x 轴专用——y 轴是数值轴，无类别形态） */
  private categoryEntries(data: XychartAxisData): { entries: XychartArrayEntry[]; trailing: string } | null {
    if (data.axis !== 'x' || data.restRaw === null || !data.restRaw.startsWith('[')) return null
    return parseCategoryEntries(data.restRaw)
  }

  /** 改第 index（0 基）个类别（token 级手术改写，未触碰类别原文逐字保留） */
  private resolveSetAxisCategory(
    doc: SourceDocument,
    intent: Extract<XychartIntent, { type: 'set-axis-category' }>,
  ): Map<string, string> | null {
    const part = this.axisPart(doc, 'x')
    const text = intent.text.trim()
    if (part === null || !isValidXychartText(text)) return null
    const data = part.element as XychartAxisData
    const arr = this.categoryEntries(data)
    if (arr === null || intent.index < 0 || intent.index >= arr.entries.length) return null
    arr.entries[intent.index] = { ...arr.entries[intent.index]!, token: encodeXychartText(text) }
    return new Map([[part.id, renderXychartAxis(data, { restRaw: renderXychartArray(arr.entries, arr.trailing) })]])
  }

  /** 追加类别：轴在 range 形态时直接转换为单类别数组形态（形态切换的第一步）；尾部悬挂分隔原文回收为新增条目的 lead */
  private resolveAddAxisCategory(
    doc: SourceDocument,
    intent: Extract<XychartIntent, { type: 'add-axis-category' }>,
  ): Map<string, string> | null {
    const part = this.axisPart(doc, 'x')
    const text = intent.text.trim()
    if (part === null || !isValidXychartText(text)) return null
    const data = part.element as XychartAxisData
    const arr = this.categoryEntries(data)
    if (arr === null) {
      // range 形态或无后半段：转换为类别形态（新增即首个类别）
      if (data.axis !== 'x') return null
      return new Map([[part.id, renderXychartAxis(data, { restRaw: `[${encodeXychartText(text)}]` })]])
    }
    const lead =
      arr.trailing !== ''
        ? arr.trailing
        : arr.entries[arr.entries.length - 1]!.lead.includes(',')
          ? ', '
          : ' '
    arr.entries.push({ lead, token: encodeXychartText(text) })
    return new Map([[part.id, renderXychartAxis(data, { restRaw: renderXychartArray(arr.entries) })]])
  }

  /** 删除第 index（0 基）个类别：最后一个不可删（空类别数组渲染无意义，绝不产出）；与前驱之间的分隔顶替后继条目原 lead */
  private resolveDeleteAxisCategory(
    doc: SourceDocument,
    intent: Extract<XychartIntent, { type: 'delete-axis-category' }>,
  ): Map<string, string> | null {
    const part = this.axisPart(doc, 'x')
    if (part === null) return null
    const data = part.element as XychartAxisData
    const arr = this.categoryEntries(data)
    if (arr === null || intent.index < 0 || intent.index >= arr.entries.length) return null
    if (arr.entries.length === 1) return null
    const removed = arr.entries.splice(intent.index, 1)[0]!
    if (intent.index < arr.entries.length) {
      arr.entries[intent.index] = { lead: removed.lead, token: arr.entries[intent.index]!.token }
    }
    return new Map([[part.id, renderXychartAxis(data, { restRaw: renderXychartArray(arr.entries, arr.trailing) })]])
  }

  /** 设置数值 range（`min --> max`）：x 轴在类别形态时直接转换为 range 形态 */
  private resolveSetAxisRange(
    doc: SourceDocument,
    intent: Extract<XychartIntent, { type: 'set-axis-range' }>,
  ): Map<string, string> | null {
    if (intent.axis !== 'x' && intent.axis !== 'y') return null
    const part = this.axisPart(doc, intent.axis)
    if (part === null) return null
    const min = intent.min.trim()
    const max = intent.max.trim()
    if (!isValidXychartNumberInput(min) || !isValidXychartNumberInput(max)) return null
    const data = part.element as XychartAxisData
    return new Map([[part.id, renderXychartAxis(data, { restRaw: `${min} --> ${max}` })]])
  }

  /** 移除 y 轴 range（可省——自动推算）；x 轴无此操作（改类别形态走 add-axis-category） */
  private resolveRemoveAxisRange(
    doc: SourceDocument,
    intent: Extract<XychartIntent, { type: 'remove-axis-range' }>,
  ): Map<string, string> | null {
    if (intent.axis !== 'y') return null
    const part = this.axisPart(doc, 'y')
    if (part === null) return null
    const data = part.element as XychartAxisData
    if (data.restRaw === null) return null // 本就没有 range，no-op 拒绝
    return new Map([[part.id, renderXychartAxis(data, { restRaw: null })]])
  }
}

/** 系列行解析：`line|bar` + 可选名字（引号/裸词）+ `[...]` 数组 + 行尾 */
function parseSeriesBody(body: string): XychartSeriesData | null {
  const m = /^(line|bar)([\s\S]*)$/.exec(body)
  if (m === null) return null
  const seriesType = m[1] as 'line' | 'bar'
  const rest = m[2]!
  const gap1Match = /^[ \t]*/.exec(rest)
  const gap1 = gap1Match?.[0] ?? ''
  const afterGap1 = rest.slice(gap1.length)
  if (afterGap1.startsWith('[')) {
    return seriesWithArray(seriesType, gap1, null, '', afterGap1)
  }
  if (afterGap1.startsWith('"')) {
    const close = afterGap1.indexOf('"', 1)
    if (close === -1) return null
    const nameRaw = afterGap1.slice(0, close + 1)
    const tailPart = afterGap1.slice(close + 1)
    const gap2Match = /^[ \t]*/.exec(tailPart)
    const gap2 = gap2Match?.[0] ?? ''
    return seriesWithArray(seriesType, gap1, nameRaw, gap2, tailPart.slice(gap2.length))
  }
  // 裸词名字：到 `[` 为止（裸词内无空白——含空格的名字 mermaid 本就要求引号）
  const bracket = afterGap1.indexOf('[')
  if (bracket === -1) return null
  const nameRaw = afterGap1.slice(0, bracket).trimEnd()
  if (nameRaw === '' || /\s/.test(nameRaw)) return null
  return seriesWithArray(seriesType, gap1, nameRaw, ' ', afterGap1.slice(bracket))
}

function seriesWithArray(
  seriesType: 'line' | 'bar',
  gap1: string,
  nameRaw: string | null,
  gap2: string,
  tailWithArray: string,
): XychartSeriesData | null {
  const close = tailWithArray.indexOf(']')
  if (close === -1) return null
  const arrayRaw = tailWithArray.slice(0, close + 1)
  const tail = tailWithArray.slice(close + 1)
  if (!/^[ \t]*(?:%%.*)?$/.test(tail)) return null // `]` 后跟别的 token：mermaid 是 lexer 错误
  const parsed = parseSeriesArray(arrayRaw)
  if (parsed === null || parsed.entries.length === 0) return null
  return { kind: 'xychart-series', seriesType, gap1, nameRaw, gap2, arrayRaw, tail }
}

export const xychartParser = new XychartParser()

// ---------- 编辑意图（工单 14 表单 / 画布所需集合） ----------

export type XychartIntent =
  /** 新增系列（名字可 null = 未命名；values 是数值原文数组，落码门逐个校验、字面格式保留）；
   * 锚点缺省 = 文档末尾 */
  | { type: 'add-series'; seriesType: 'line' | 'bar'; name: string | null; values: string[]; afterElementId?: string }
  /** 改系列名（null = 去掉名字变未命名） */
  | { type: 'set-series-name'; elementId: string; name: string | null }
  /** 改系列类型（line↔bar，只换关键字） */
  | { type: 'set-series-type'; elementId: string; seriesType: 'line' | 'bar' }
  /** 改第 index（0 基）个数值（未触碰 token 原文逐字保留） */
  | { type: 'set-series-value'; elementId: string; index: number; value: string }
  /** 追加数值（分隔沿用既有风格） */
  | { type: 'add-series-value'; elementId: string; value: string }
  /** 删除第 index（0 基）个数值（至少保留一个） */
  | { type: 'delete-series-value'; elementId: string; index: number }
  /** 删除系列 */
  | { type: 'delete-series'; elementId: string }
  /** 设置图表标题（`title 文本`）；无标题行时紧随声明头插入一行 */
  | { type: 'set-title'; text: string }
  /** 改轴标题（x / y） */
  | { type: 'set-axis-title'; axis: 'x' | 'y'; title: string }
  /** 改第 index（0 基）个 x 轴类别（token 级手术改写） */
  | { type: 'set-axis-category'; index: number; text: string }
  /** 追加 x 轴类别（range 形态时转换为类别形态） */
  | { type: 'add-axis-category'; text: string }
  /** 删除第 index（0 基）个 x 轴类别（最后一个不可删） */
  | { type: 'delete-axis-category'; index: number }
  /** 设置轴数值 range（`min --> max`；x 轴在类别形态时转换为 range 形态） */
  | { type: 'set-axis-range'; axis: 'x' | 'y'; min: string; max: string }
  /** 移除 y 轴 range（自动推算） */
  | { type: 'remove-axis-range'; axis: 'y' }
