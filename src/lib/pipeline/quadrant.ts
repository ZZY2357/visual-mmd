import { assembleDocument, getElementById, type ElementPart, type SourceDocument } from './document'
import { frontmatterEnd } from './frontmatter'
import { insertAfter } from './insert'
import type { DiagramParser, EditIntent, ParseResult, SourceParseError } from './parser'
import type { Span } from './span'

/**
 * quadrantChart（象限图）完整解析器（more-diagrams 工单 12，语法事实以 spec 的
 * research/data-display.md quadrant 节 + mermaid 12.0.0 quadrantDiagram 词法为准）：
 * 手写、逐行、带 span（ADR-0004）。可测试承诺：解析后不做修改再重组装，
 * 输出与输入逐字相同（verbatim identity）。
 *
 * 覆盖（分层对齐，工单定案）：
 * - 声明头 `quadrantChart`、`title 标题文本`（文档级，rest-of-line 原文）
 * - `x-axis <左段> --> <右段>` / `y-axis <下段> --> <上段>`（分隔符可缺省 = 单段；
 *   mermaid 词法没有 `x-axis --> 右段` 产生式——分隔符前必须有文本，此类行逐字保留）
 * - `quadrant-1..4 <标题文本>`（象限标题，文档级属性元素）
 * - 点行 `<文本>: [x, y]`（节点级）+ 可选 `:::class` 内联标注 + 可选内联样式段
 *   `color: #xx, radius: n, stroke-color: #xx, stroke-width: npx`（逐字段手术改写）
 *
 * 词法与校验边界（mermaid 12 quadrant.jison 实证，工单 Comments 记录证据）：
 * - 坐标 token = `(1)|(0(.\d+)?)`：**只有 `1`、`0`、`0.<数字>` 三种词法形态**——
 *   `2` / `1.5` / `.5` / `0.` 都不是合法坐标（越界/畸形坐标 mermaid 直接 lexer 报错，
 *   整图渲染失败）。工单定案「坐标 0–1 越界拒绝落码（源码始终合法）」由此而来：
 *   表单与落码只接受 isQuadrantCoordinate 为真的值。
 * - 点文本：引号（STR，内容 `[^"]*`，**无转义机制**）或裸文本（textNoTagsToken 连接，
 *   可含空格/#/逗号等）。裸文本不可含 `:`（点冒号是分界）、`-->`、引号、`[`/`]`、
 *   `<`/`>`、`;`、`%%`，也不能以保留关键字开头（词法在行首优先认关键字 token）。
 * - 内联样式值（quadrantDb.parseStyles 对非法值**抛错**，落码必须校验）：color /
 *   stroke-color = `#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})`；radius = `\d+`；
 *   stroke-width = `\d+px`。未知键（fill 等）mermaid 静默忽略——解析照常保留原文，
 *   改写已知字段时不触碰。
 * - 轴/象限文本：裸段不可含 `:`（COLON 不在 text 延续集）、引号、`-->`、`<`/`>`、
 *   `;`；引号段（STR）内容任意（与词法一致）。
 * - `classDef` 行**不做编辑**（工单定案：逐字保留）——classDef 语句整行不进投影，
 *   编辑器不产出任何触及它的重写。
 * - config（frontmatter / `%%{init}%%`）整块逐字保留（工单明确不做 config 编辑）。
 *
 * span 约定（与 pie/journey 同口径，行级）：行首缩进与换行留在 verbatim；元素 span
 * 不跨行；行尾空白 / `%%` 注释归 tail 字段逐字保留。不解析、原样保留（清单外语法
 * 不报错，ADR-0008）：frontmatter、`%%` 注释、accTitle / accDescr（含多行 accDescr {}）、
 * section 行（词法可认领但渲染不用，工单不做编辑）、无法识别的行。
 *
 * 身份（ADR-0012 位置序 + 字面量）：点 `point:N` 按文档序 1 基编号（quadrant 语法里
 * 点没有 id，位置序是唯一可行身份）；轴是文档级单例 `x-axis` / `y-axis`；
 * 象限标题 `quadrant:1..4`（与 mermaid 的 quadrant-N 编号一致）。
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

export interface QuadrantHeaderData {
  kind: 'quadrant-header'
}

export interface QuadrantTitleData {
  kind: 'quadrant-title'
  /** `title` 与标题之间的空白原文 */
  gap: string
  /** 标题文本（到 `%%` 注释起点，去尾空白）；改写时行尾注释不保留（与 pie 同口径） */
  text: string
}

/** 轴的一段（first = x 左段 / y 下段；second = x 右段 / y 上段） */
export interface QuadrantAxisSegment {
  /** 原引号形态：'' = 裸文本，'"' = STR（内容原样，无转义） */
  quote: string
  /** 段文本原文（引号内原文或裸段原文；未 trim，改写时才规范化） */
  text: string
}

/**
 * 轴行数据。行形状：`keyword gap first? delim? second? tail`
 * - `delimRaw` 是 `--+>` 分隔符原文（**含紧贴两侧的空白**——mermaid 词法 token
 *   ` *--+> *` 连空白一起吃）；null = 无分隔符（单段形态）
 * - mermaid 词法没有「分隔符前无文本」的产生式（`x-axis --> 右` 直接报错），
 *   first 为空段的行不解析
 */
export interface QuadrantAxisData {
  kind: 'quadrant-axis'
  axis: 'x' | 'y'
  /** 关键字原文（`x-axis` / `X-Axis` 等，大小写原样） */
  keyword: string
  /** 关键字与第一段之间的空白原文 */
  gapAfterKeyword: string
  first: QuadrantAxisSegment
  delimRaw: string | null
  /** null = 无右段（无分隔符，或分隔符悬空形态 `x-axis 左 -->`）；text 为空串 = 悬空 */
  second: QuadrantAxisSegment | null
  /** 行尾空白 / `%%` 注释原文，逐字保留 */
  tail: string
}

export interface QuadrantQuadrantData {
  kind: 'quadrant-quadrant'
  /** 1..4（与 mermaid quadrant-N 编号一致） */
  index: 1 | 2 | 3 | 4
  /** 关键字原文（`quadrant-1` 等，大小写原样） */
  keyword: string
  /** 关键字与文本之间的空白原文 */
  gap: string
  /** 标题文本原文（未 trim；改写时规范化） */
  text: string
  /** 行尾空白 / `%%` 注释原文，逐字保留 */
  tail: string
}

/** 内联样式段的一个条目（`color: #ff3300` 之类） */
export interface QuadrantStyleEntry {
  /** 条目原文（第 2 条起含逗号后的前导空白）；改写该条目时内部空白规范化 */
  raw: string
  /** 已知样式键（精确小写匹配 mermaid parseStyles 的分支）；未知键 null（原样保留） */
  key: QuadrantStyleField | null
}

/**
 * 点行数据。行形状：`quote text quote classAnn? gapColon ':' gapBracket '[' gapX x
 * gapComma ',' gapComma2 y gapEnd ']' 样式段 tail`。
 * 未触碰字段逐字保留；改动任一字段只重写该字段（ADR-0004 手术边界）。
 */
export interface QuadrantPointData {
  kind: 'quadrant-point'
  /** 点文本原文（引号内原文或裸文本；裸文本的尾随空白已归 gapColon） */
  text: string
  /** 原引号形态：'' = 裸文本，'"' = STR */
  quote: string
  /** `:::` 类标注的类名（`\w+`，原样；null = 无） */
  classAnn: string | null
  /** 文本/闭引号/类标注之后到 `:` 的空白原文（裸文本形态 = 原文本的尾随空白） */
  gapColon: string
  /** `:` 之后到 `[` 的空白原文 */
  gapBracket: string
  /** `[` 之后到 x 的空白原文 */
  gapX: string
  /** x 坐标原文（合法词法：`1` / `0` / `0.<数字>`） */
  x: string
  /** x 与 `,` 之间的空白原文 */
  gapComma: string
  /** `,` 与 y 之间的空白原文 */
  gapComma2: string
  /** y 坐标原文 */
  y: string
  /** y 之后到 `]` 的空白原文 */
  gapEnd: string
  /** `]` 之后到首个样式条目的空白原文（无条目时为 `]` 后剩余空白） */
  stylesLead: string
  /** 样式条目（原文原样；未知键的条目改写任何字段都不触碰） */
  styles: QuadrantStyleEntry[]
  /** 样式段之后的行尾（`%%` 注释原文；逐字保留） */
  styleTail: string
}

// ---------- 行原文重建（resolveRewrites 的手术边界） ----------

/** 轴行原文重建。changes 任一字段缺省 = 逐字保留原文 */
export function renderQuadrantAxis(
  d: QuadrantAxisData,
  changes: { firstText?: string; secondText?: string } = {},
): string {
  const firstQuote = d.first.quote
  const firstText = changes.firstText ?? d.first.text
  let out = `${d.keyword}${d.gapAfterKeyword}${firstQuote}${firstText}${firstQuote}`
  // 有分隔符 → 保留右段（含悬空形态）；原无分隔符但显式设置右段 → 追加 ` --> `（单段升级为双段）
  if (d.delimRaw !== null || changes.secondText !== undefined) {
    out += d.delimRaw ?? ' --> '
    const secondText = changes.secondText ?? d.second?.text ?? ''
    const secondQuote = d.second?.quote ?? ''
    out += `${secondQuote}${secondText}${secondQuote}`
  }
  return out + d.tail
}

/** 象限标题行原文重建 */
export function renderQuadrantQuadrant(
  d: QuadrantQuadrantData,
  changes: { text?: string } = {},
): string {
  return `${d.keyword}${d.gap}${changes.text ?? d.text}${d.tail}`
}

/** 点行的 `]` 之后原文重建：lead + entries（逗号分隔）+ tail */
function renderStyles(d: QuadrantPointData, lead: string, styles: QuadrantStyleEntry[]): string {
  if (styles.length === 0) {
    // 条目清空后只剩段首空白与行尾注释（逐字保留；删空样式段会留下无害尾随空白）
    return lead + d.styleTail
  }
  return lead + styles.map((e, i) => (i === 0 ? e.raw : `,${e.raw}`)).join('') + d.styleTail
}

/** 点行原文重建。changes 任一字段缺省 = 逐字保留原文 */
export function renderQuadrantPoint(
  d: QuadrantPointData,
  changes: { text?: string; x?: string; y?: string; styles?: QuadrantStyleEntry[]; stylesLead?: string } = {},
): string {
  const text = changes.text ?? d.text
  const x = changes.x ?? d.x
  const y = changes.y ?? d.y
  const classPart = d.classAnn !== null ? `:::${d.classAnn}` : ''
  const lead = changes.stylesLead ?? d.stylesLead
  const styles = changes.styles ?? d.styles
  return (
    `${d.quote}${text}${d.quote}${classPart}${d.gapColon}:${d.gapBracket}` +
    `[${d.gapX}${x}${d.gapComma},${d.gapComma2}${y}${d.gapEnd}]` +
    renderStyles(d, lead, styles)
  )
}

// ---------- 词法助手与校验 ----------

/** mermaid 12 坐标 token：`1`、`0`、`0.<数字>` 三种形态（越界/畸形坐标词法直接报错） */
const QUADRANT_COORD_RE = /^(?:1|0(?:\.[0-9]+)?)$/

/** 坐标原文 → 数值：符合坐标词法时给出数值，否则 null */
export function parseQuadrantCoordinate(value: string): number | null {
  return QUADRANT_COORD_RE.test(value) ? Number(value) : null
}

/**
 * 坐标是否可落码（工单定案：0–1 之外拒绝落码，源码始终合法）。
 * 表单校验与 resolveRewrites 落码门共用本函数（避免第二份实现）。
 */
export function isQuadrantCoordinate(value: string): boolean {
  return QUADRANT_COORD_RE.test(value)
}

export type QuadrantStyleField = 'color' | 'radius' | 'stroke-color' | 'stroke-width'

/** 已知内联样式字段（与 mermaid quadrantDb.parseStyles 的分支一一对应） */
export const QUADRANT_STYLE_FIELDS: readonly QuadrantStyleField[] = [
  'color',
  'radius',
  'stroke-color',
  'stroke-width',
]

// 各字段值的合法性（mermaid parseStyles 对非法值抛 InvalidStyleError → mermaid.parse
// 直接失败，故落码必须逐一校验；正则与 validateHexCode / validateNumber /
// validateSizeInPixels 同源）
const STYLE_VALUE_RE: Record<QuadrantStyleField, RegExp> = {
  color: /^#?(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/,
  'stroke-color': /^#?(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/,
  radius: /^\d+$/,
  'stroke-width': /^\d+px$/,
}

/** 内联样式值是否可落码（field 为已知键时校验值形态） */
export function isValidQuadrantStyleValue(field: QuadrantStyleField, value: string): boolean {
  return STYLE_VALUE_RE[field].test(value.trim())
}

/**
 * 点文本合法性（表单/落码侧）：非空；不含冒号（点是 `文本: [x, y]`，冒号提前截断）、
 * 引号与反引号（会切入/切出 STR token）、方括号（无词法 token，直接 lexer 错误）、
 * `<`/`>`（无词法 token）、分号（eol token）、`%%`（注释）与换行；
 * 不以保留关键字开头（行首关键字 token 优先，会把点行吞成轴/象限/标题行）。
 */
export function isValidQuadrantPointText(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed === '') return false
  if (/[\n:;[\]<>`"']/.test(trimmed)) return false
  if (trimmed.includes('%%') || trimmed.includes('-->')) return false
  return !/^(?:quadrantChart|x-axis|y-axis|quadrant-[1-4]|classDef|title|accTitle|accDescr|section)\b/i.test(
    trimmed,
  )
}

/**
 * 轴/象限文本合法性（表单/落码侧）：非空；裸文本形态不可含冒号（COLON 不在 text
 * 延续集，落码必报错）、引号、`-->`、`<`/`>`、分号、`%%` 与换行。
 */
export function isValidQuadrantSegmentText(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed === '') return false
  if (/[\n:;[\]<>`"']/.test(trimmed)) return false
  return !trimmed.includes('%%') && !trimmed.includes('-->')
}

/** 图表标题合法性（表单/落码侧）：非空、不含换行与 `%%`（title_value 到行尾/注释为止） */
export function isValidQuadrantTitle(text: string): boolean {
  const trimmed = text.trim()
  return trimmed !== '' && !/\n/.test(trimmed) && !trimmed.includes('%%')
}

// ---------- 解析器 ----------

interface RawEntry {
  span: Span
  id: string
  data:
    | QuadrantHeaderData
    | QuadrantTitleData
    | QuadrantAxisData
    | QuadrantQuadrantData
    | QuadrantPointData
}

const HEADER_RE = /^quadrantChart[ \t]*$/i
const TITLE_PREFIX = /^title\b/i
const ACC_PREFIX = /^acc(?:Title|Descr)\b/i

/**
 * 「行尾注释」切分：第一个 `%%` 起（含）为 tail。只能用于**已确定区间内无引号包裹**
 * 的文本——引号内 `%%` 是字面内容（string condition 无注释规则），调用方需先处理引号。
 */
function splitComment(s: string): { body: string; tail: string } {
  const idx = s.indexOf('%%')
  if (idx === -1) return { body: s, tail: '' }
  return { body: s.slice(0, idx), tail: s.slice(idx) }
}

/** 裸段非法字符：COLON 不在 text 延续集；`"`/`` ` `` 切入 STR；`[`/`]`/`<`/`>` 无 token；`;` 是 eol */
const BARE_SEGMENT_FORBIDDEN = /["'`:;[\]<>]/

/** 轴段是否可解析为元素（第一段语法上必须有文本） */
function hasSegmentText(s: QuadrantAxisSegment | null): boolean {
  return s !== null && s.text.trim() !== ''
}

/**
 * 轴行解析（x/y 共用）：`keyword 段1? 分隔符? 段2? tail`。
 * 返回 null = 不合文法（整行原样保留，不进投影——mermaid 对这些形态同样报错）。
 */
function parseAxisBody(axis: 'x' | 'y', keyword: string, rest: string): QuadrantAxisData | null {
  const gapAfterKeyword = /^[ \t]*/.exec(rest)![0]
  let body = rest.slice(gapAfterKeyword.length)
  if (body.trim() === '') return null

  let first: QuadrantAxisSegment
  let delimRaw: string | null = null
  let second: QuadrantAxisSegment | null = null
  let tail = ''

  // 第一段：引号段（STR，内容任意）或裸段
  if (body.startsWith('"')) {
    const close = body.indexOf('"', 1)
    if (close === -1) return null
    first = { quote: '"', text: body.slice(1, close) }
    body = body.slice(close + 1)
  } else {
    const delim = /--+>/.exec(body)
    const { body: noComment, tail: commentTail } = splitComment(body)
    // 分隔符只有在注释之前才算数（注释 token 吃到行尾）
    const delimFirst = delim !== null && delim.index <= noComment.length
    const stop = delimFirst ? delim.index : noComment.length
    let text = noComment.slice(0, stop)
    if (BARE_SEGMENT_FORBIDDEN.test(text)) return null
    if (delimFirst) {
      // 紧贴分隔符的前导空白归分隔符 token（词法 ` *--+> *`）
      const leadWs = /[ \t]*$/.exec(text)![0]
      text = text.slice(0, text.length - leadWs.length)
      const token = /--+>[ \t]*/.exec(body.slice(stop))![0]
      delimRaw = leadWs + token
      body = body.slice(stop + token.length)
    } else {
      // 注释 / 行尾：段文本保留尾随空白（SPACE 属于 text token），注释归 tail
      tail = commentTail
      body = ''
    }
    first = { quote: '', text }
  }
  if (!hasSegmentText(first)) return null

  // 分隔符（引号第一段之后才可能还有）
  if (delimRaw === null && body !== '') {
    const token = /^[ \t]*--+>[ \t]*/.exec(body)
    if (token !== null) {
      delimRaw = token[0]
      body = body.slice(delimRaw.length)
    }
  }

  // 第二段（仅有分隔符时）；引号段后的残余与裸段注释统一进 tail 由行尾校验收口
  if (delimRaw !== null) {
    if (body.startsWith('"')) {
      const close = body.indexOf('"', 1)
      if (close === -1) return null
      second = { quote: '"', text: body.slice(1, close) }
      body = body.slice(close + 1)
    } else {
      const { body: text, tail: commentTail } = splitComment(body)
      if (BARE_SEGMENT_FORBIDDEN.test(text)) return null
      second = { quote: '', text }
      body = commentTail
    }
  }
  tail += body
  if (!/^[ \t]*(?:%%.*)?$/.test(tail)) return null

  return { kind: 'quadrant-axis', axis, keyword, gapAfterKeyword, first, delimRaw, second, tail }
}

/** 象限标题行解析：`quadrant-N 文本`（引号或裸段） */
function parseQuadrantBody(
  index: 1 | 2 | 3 | 4,
  keyword: string,
  rest: string,
): QuadrantQuadrantData | null {
  const gap = /^[ \t]*/.exec(rest)![0]
  const body = rest.slice(gap.length)
  if (body.trim() === '') return null

  let text: string
  let tail: string
  if (body.startsWith('"')) {
    const close = body.indexOf('"', 1)
    if (close === -1) return null
    text = body.slice(1, close)
    tail = body.slice(close + 1)
    if (!/^[ \t]*(?:%%.*)?$/.test(tail)) return null
  } else {
    const { body: bare, tail: commentTail } = splitComment(body)
    if (BARE_SEGMENT_FORBIDDEN.test(bare)) return null
    text = bare
    tail = commentTail
  }
  return { kind: 'quadrant-quadrant', index, keyword, gap, text, tail }
}

/** 点行的坐标 + 样式段解析（文本、类标注与点冒号已就位） */
function parsePointCoordsAndStyles(
  quote: string,
  text: string,
  classAnn: string | null,
  gapColon: string,
  rest: string,
): QuadrantPointData | null {
  if (text.trim() === '') return null
  const m =
    /^([ \t]*)\[([ \t]*)(1|0(?:\.[0-9]+)?)([ \t]*),([ \t]*)(1|0(?:\.[0-9]+)?)([ \t]*)\](.*)$/.exec(rest)
  if (m === null) return null
  const [, gapBracket, gapX, x, gapComma, gapComma2, y, gapEnd, after] = m
  // 样式段与行尾注释切分（样式值不含 %%，第一个 %% 起是注释——与词法注释规则一致）
  const cm = after.indexOf('%%')
  const styleRegion = cm === -1 ? after : after.slice(0, cm)
  const styleTail = cm === -1 ? '' : after.slice(cm)
  const lead = /^[ \t]*/.exec(styleRegion)![0]
  const entriesPart = styleRegion.slice(lead.length)
  const styles: QuadrantStyleEntry[] =
    entriesPart === ''
      ? []
      : entriesPart.split(',').map((raw) => {
          // 第 2 条起 raw 自带逗号后的前导空白（重建时逗号补回）
          const ki = raw.indexOf(':')
          if (ki === -1) return { raw, key: null }
          const key = raw.slice(0, ki).trim()
          return {
            raw,
            key: (QUADRANT_STYLE_FIELDS as readonly string[]).includes(key)
              ? (key as QuadrantStyleField)
              : null,
          }
        })
  return {
    kind: 'quadrant-point',
    text,
    quote,
    classAnn,
    gapColon,
    gapBracket,
    gapX,
    x,
    gapComma,
    gapComma2,
    y,
    gapEnd,
    stylesLead: lead,
    styles,
    styleTail,
  }
}

/**
 * 点行解析：`文本[:::类][: [x, y]][样式段][tail]`。
 * 坐标不合词法 / 文本为空 / 引号不闭合 → null（整行原样保留——坐标越界的源码
 * mermaid 本身就渲染失败，不产出幽灵元素）。
 */
function parsePointLine(line: string): QuadrantPointData | null {
  if (line.startsWith('"')) {
    // 引号形态：先找闭引号（内容 `[^"]*` 可含冒号，无转义），再看类标注与点冒号
    const close = line.indexOf('"', 1)
    if (close === -1) return null
    const text = line.slice(1, close)
    const rest = line.slice(close + 1)
    // 类标注 = `:::`（三冒号，词法 rule 27 `(?::::)`）+ `\w+`（class_name 状态）
    const m = /^(?:[:]{3}(\w+))?([ \t]*):/.exec(rest)
    if (m === null) return null
    return parsePointCoordsAndStyles('"', text, m[1] ?? null, m[2], rest.slice(m[0].length))
  }
  // 裸文本：到第一个 `:` 为止（::: 的第一个冒号也是它）；文本不可含 `%%`（会变注释）
  const colonIdx = line.indexOf(':')
  if (colonIdx === -1) return null
  const raw = line.slice(0, colonIdx)
  if (raw.includes('%%')) return null
  // 尾随空白归 gapColon（SPACE 属于 text token，原样保留；改写文本时作为分隔符沿用）
  const trailing = /[ \t]*$/.exec(raw)![0]
  const text = raw.slice(0, raw.length - trailing.length)
  const rest = line.slice(colonIdx)
  const m = /^(?:[:]{3}(\w+))?([ \t]*):/.exec(rest)
  if (m === null) return null
  return parsePointCoordsAndStyles('', text, m[1] ?? null, trailing + m[2], rest.slice(m[0].length))
}

export class QuadrantParser implements DiagramParser {
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
    let pointCount = 0
    let seenHeader = false
    // 文首 frontmatter 块不参与解析，整体 verbatim 保留
    const bodyStart = frontmatterEnd(source)
    let lineNo = bodyStart === 0 ? 0 : source.slice(0, bodyStart).split('\n').length - 1
    let cursor = bodyStart

    for (;;) {
      const nl = source.indexOf('\n', cursor)
      const lineEndAbs = nl === -1 ? source.length : nl
      const line = source.slice(cursor, lineEndAbs)
      lineNo++
      const trimmed = line.trim()

      if (trimmed !== '') {
        const firstChar = line.length - line.trimStart().length
        const spanOfLine = (): Span => ({ start: cursor + firstChar, end: lineEndAbs })
        const body = line.slice(firstChar)

        if (!seenHeader) {
          if (HEADER_RE.exec(trimmed) === null) {
            throw parseFailure(lineNo, '图表必须以 quadrantChart 声明开始')
          }
          seenHeader = true
          entries.push({
            span: spanOfLine(),
            id: 'quadrant-header',
            data: { kind: 'quadrant-header' },
          })
        } else if (trimmed.startsWith('%%') || ACC_PREFIX.test(trimmed)) {
          // 注释 / 可访问性语句（含多行 accDescr {} 的花括号行，工单明确不做编辑）：逐字保留
        } else if (TITLE_PREFIX.test(trimmed)) {
          // title_value = rest-of-line 原文（词法 title 条件吞到行尾），%% 注释截断
          const { body: raw } = splitComment(body.slice('title'.length))
          const gap = /^[ \t]*/.exec(raw)![0]
          const text = raw.slice(gap.length).replace(/[ \t]+$/, '')
          if (text !== '') {
            entries.push({
              span: spanOfLine(),
              id: 'quadrant-title',
              data: { kind: 'quadrant-title', gap, text },
            })
          }
          // 空标题等清单外形态：不解析，逐字保留
        } else {
          const axis = /^(x-axis|y-axis)(.*)$/i.exec(body)
          const quadrantM = /^(quadrant-[1-4])(.*)$/i.exec(body)
          if (axis !== null) {
            const data = parseAxisBody(axis[1].toLowerCase() === 'x-axis' ? 'x' : 'y', axis[1], axis[2])
            if (data !== null) {
              entries.push({ span: spanOfLine(), id: data.axis === 'x' ? 'x-axis' : 'y-axis', data })
            }
            // 不合文法的轴行：不解析，逐字保留（mermaid 本身会报错）
          } else if (quadrantM !== null) {
            const index = Number(quadrantM[1].slice('quadrant-'.length)) as 1 | 2 | 3 | 4
            const data = parseQuadrantBody(index, quadrantM[1], quadrantM[2])
            if (data !== null) {
              entries.push({ span: spanOfLine(), id: `quadrant:${index}`, data })
            }
          } else {
            const point = parsePointLine(body)
            if (point !== null) {
              pointCount++
              entries.push({ span: spanOfLine(), id: `point:${pointCount}`, data: point })
            }
            // classDef / section / 清单外行：不解析，逐字保留（工单定案 classDef 不编辑）
          }
        }
      }

      if (nl === -1) break
      cursor = nl + 1
    }

    if (!seenHeader) {
      throw parseFailure(1, '图表必须以 quadrantChart 声明开始')
    }
    return assembleDocument(source, entries)
  }

  // ---------- 意图落地（resolveRewrites） ----------

  resolveRewrites(doc: SourceDocument, intent: EditIntent): ReadonlyMap<string, string> | null {
    switch (intent.type) {
      case 'add-point':
        return this.resolveAddPoint(doc, intent as never)
      case 'set-point-text':
        return this.resolveSetPointText(doc, intent as never)
      case 'set-point-coords':
        return this.resolveSetPointCoords(doc, intent as never)
      case 'set-point-style':
        return this.resolveSetPointStyle(doc, intent as never)
      case 'delete-point':
        return this.resolveDeletePoint(doc, intent as never)
      case 'set-title':
        return this.resolveSetTitle(doc, intent as never)
      case 'set-axis':
        return this.resolveSetAxis(doc, intent as never)
      case 'set-quadrant-text':
        return this.resolveSetQuadrantText(doc, intent as never)
      default:
        return null
    }
  }

  private pointPart(doc: SourceDocument, elementId: string): ElementPart | null {
    const part = getElementById(doc, elementId)
    return part !== undefined && part.element.kind === 'quadrant-point' ? part : null
  }

  /** 新增点：追加在锚点行之后（缺省 = 文档末尾）；文本与坐标必须可落码（绝不产出非法 mermaid） */
  private resolveAddPoint(
    doc: SourceDocument,
    intent: Extract<QuadrantIntent, { type: 'add-point' }>,
  ): Map<string, string> | null {
    const text = intent.text.trim()
    const x = intent.x.trim()
    const y = intent.y.trim()
    if (!isValidQuadrantPointText(text) || !isQuadrantCoordinate(x) || !isQuadrantCoordinate(y)) {
      return null
    }
    return insertAfter(doc, {
      afterElementId: intent.afterElementId,
      anchor: 'line-end',
      render: (indent) => `\n${indent}${text}: [${x}, ${y}]`,
    })
  }

  /** 改点文本（双击内联编辑 / 表单 / 菜单共用）；引号形态沿用原样 */
  private resolveSetPointText(
    doc: SourceDocument,
    intent: Extract<QuadrantIntent, { type: 'set-point-text' }>,
  ): Map<string, string> | null {
    const part = this.pointPart(doc, intent.elementId)
    const text = intent.text.trim()
    if (part === null || !isValidQuadrantPointText(text)) return null
    return new Map([[part.id, renderQuadrantPoint(part.element as QuadrantPointData, { text })]])
  }

  /** 改坐标：仅 0–1 的合法坐标词法（表单强制；越界值拒绝落码——工单定案源码始终合法） */
  private resolveSetPointCoords(
    doc: SourceDocument,
    intent: Extract<QuadrantIntent, { type: 'set-point-coords' }>,
  ): Map<string, string> | null {
    const part = this.pointPart(doc, intent.elementId)
    const x = intent.x.trim()
    const y = intent.y.trim()
    if (part === null || !isQuadrantCoordinate(x) || !isQuadrantCoordinate(y)) return null
    return new Map([[part.id, renderQuadrantPoint(part.element as QuadrantPointData, { x, y })]])
  }

  /**
   * 改/增/删一个内联样式字段（工单定案的逐字段手术边界）：只重写目标条目，
   * 未触碰条目（含未知键条目）逐字保留。value = null 为删除字段；字段不存在时
   * 删除返回 null（无可做之事）。值合法性按 mermaid parseStyles 的校验规则
   * （非法值 mermaid.parse 直接失败）。
   */
  private resolveSetPointStyle(
    doc: SourceDocument,
    intent: Extract<QuadrantIntent, { type: 'set-point-style' }>,
  ): Map<string, string> | null {
    const part = this.pointPart(doc, intent.elementId)
    if (part === null) return null
    const d = part.element as QuadrantPointData
    const idx = d.styles.findIndex((e) => e.key === intent.field)
    if (intent.value === null) {
      if (idx === -1) return null
      const styles = d.styles.filter((_, i) => i !== idx)
      // 被删的是首条目时，后继条目的前导空白随之成为新的段首（分隔规范化，值原文不动）
      if (idx === 0 && styles.length > 0) {
        styles[0] = { ...styles[0], raw: styles[0].raw.replace(/^[ \t]+/, '') }
      }
      return new Map([
        [part.id, renderQuadrantPoint(d, { styles, stylesLead: styles.length === 0 ? '' : d.stylesLead })],
      ])
    }
    const value = intent.value.trim()
    if (!isValidQuadrantStyleValue(intent.field, value)) return null
    const entryRaw = `${intent.field}: ${value}`
    const styles = [...d.styles]
    let stylesLead = d.stylesLead
    if (idx === -1) {
      // 新字段追加在末尾：样式段为空时落一个空格起步（词法 `\s*\] *` 允许任意空白），
      // 非空时段首空白沿用、新条目以一个空格与前条目分隔
      if (styles.length === 0 && stylesLead === '') stylesLead = ' '
      styles.push({ raw: (styles.length > 0 ? ' ' : '') + entryRaw, key: intent.field })
    } else {
      const lead = idx > 0 ? (/^[ \t]*/.exec(styles[idx].raw)![0] ?? '') : ''
      styles[idx] = { raw: lead + entryRaw, key: intent.field }
    }
    return new Map([[part.id, renderQuadrantPoint(d, { styles, stylesLead })]])
  }

  private resolveDeletePoint(
    doc: SourceDocument,
    intent: Extract<QuadrantIntent, { type: 'delete-point' }>,
  ): Map<string, string> | null {
    const part = this.pointPart(doc, intent.elementId)
    if (part === null) return null
    return new Map([[part.id, '']])
  }

  /** 设置图表标题（`title 文本`）：已有标题行则原地改；无则紧随声明头插入一行 */
  private resolveSetTitle(
    doc: SourceDocument,
    intent: Extract<QuadrantIntent, { type: 'set-title' }>,
  ): Map<string, string> | null {
    const text = intent.text.trim()
    if (!isValidQuadrantTitle(text)) return null
    const existing = doc.elements.find((p) => p.element.kind === 'quadrant-title')
    if (existing !== undefined) {
      return new Map([[existing.id, `title${(existing.element as QuadrantTitleData).gap}${text}`]])
    }
    const header = doc.elements.find((p) => p.element.kind === 'quadrant-header')
    if (header === undefined) return null
    return insertAfter(doc, {
      afterElementId: header.id,
      anchor: 'self',
      render: (indent) => `\n${indent}title ${text}`,
    })
  }

  /**
   * 改轴段文本（轴 = 文档级属性元素，工单定案）：first 段（x 左 / y 下）必须非空；
   * second 段（x 右 / y 上）非空时落码——原行为悬空分隔符则填充右段，原行无分隔符
   * 则升级为双段（` --> ` 落码）。轴段的落码拒绝清空（清空语义不在工单范围）。
   */
  private resolveSetAxis(
    doc: SourceDocument,
    intent: Extract<QuadrantIntent, { type: 'set-axis' }>,
  ): Map<string, string> | null {
    const part = doc.elements.find(
      (p) =>
        p.element.kind === 'quadrant-axis' && (p.element as QuadrantAxisData).axis === intent.axis,
    )
    if (part === undefined) return null
    const d = part.element as QuadrantAxisData
    const text = intent.text.trim()
    if (!isValidQuadrantSegmentText(text)) return null
    if (intent.segment === 'first') {
      return new Map([[part.id, renderQuadrantAxis(d, { firstText: text })]])
    }
    return new Map([[part.id, renderQuadrantAxis(d, { secondText: text })]])
  }

  /** 改象限标题文本（`quadrant-N 文本`） */
  private resolveSetQuadrantText(
    doc: SourceDocument,
    intent: Extract<QuadrantIntent, { type: 'set-quadrant-text' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'quadrant-quadrant') return null
    const text = intent.text.trim()
    if (!isValidQuadrantSegmentText(text)) return null
    return new Map([
      [part.id, renderQuadrantQuadrant(part.element as QuadrantQuadrantData, { text })],
    ])
  }
}

export const quadrantParser = new QuadrantParser()

// ---------- 编辑意图（工单 12 表单 / 画布所需集合） ----------

export type QuadrantIntent =
  /** 新增点（text 合法文本；x/y 为 0–1 坐标原文；锚点缺省 = 文档末尾） */
  | { type: 'add-point'; text: string; x: string; y: string; afterElementId?: string }
  /** 改点文本（elementId = `point:N`）；引号形态沿用原样 */
  | { type: 'set-point-text'; elementId: string; text: string }
  /** 改坐标（x/y 为 0–1 坐标原文；越界拒绝落码） */
  | { type: 'set-point-coords'; elementId: string; x: string; y: string }
  /** 改/增/删一个内联样式字段（value = null 删除字段）；未触碰字段逐字保留 */
  | { type: 'set-point-style'; elementId: string; field: QuadrantStyleField; value: string | null }
  /** 删除点 */
  | { type: 'delete-point'; elementId: string }
  /** 设置图表标题（`title 文本`）；无标题行时紧随声明头插入一行 */
  | { type: 'set-title'; text: string }
  /** 改轴段文本（axis = x/y；segment：first = x 左段 / y 下段，second = x 右段 / y 上段） */
  | { type: 'set-axis'; axis: 'x' | 'y'; segment: 'first' | 'second'; text: string }
  /** 改象限标题文本（elementId = `quadrant:1..4`） */
  | { type: 'set-quadrant-text'; elementId: string; text: string }
