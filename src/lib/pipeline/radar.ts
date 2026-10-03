import { assembleDocument, getElementById, type ElementPart, type SourceDocument } from './document'
import { frontmatterEnd } from './frontmatter'
import { insertAfter } from './insert'
import type { DiagramParser, EditIntent, ParseResult, SourceParseError } from './parser'
import type { Span } from './span'
import { newElementName } from '../../i18n/domain-strings.ts'

/**
 * radar-beta（雷达图）完整解析器（more-diagrams 工单 15，语法事实以 spec 的
 * research/data-display.md radar 节 + mermaid 12 内嵌 RadarGrammar 为准，勿重复调研）：
 * 手写、逐行、带 span（ADR-0004）。可测试承诺：解析后不做修改再重组装，
 * 输出与输入逐字相同（verbatim identity）。
 *
 * 覆盖（分层对齐，工单定案）：
 * - 声明头 `radar-beta`（可带尾随 `:`——Langium 语法的关键字两形态）、`title 标题文本`
 * - `axis id["label"], ...` 行（一行多轴，逗号分隔；label 双引号或单引号、可省略——
 *   mermaid db 的 label = label ?? name，diagram-MPIPVDR6.mjs setAxes）
 * - `curve id["label"]{...}` 行（一行多曲线）：条目双形态——值列表（按轴声明序对应）
 *   与 `axisId: value` 键值（冒号可省：`a1 5` 也合法，DetailedEntry 的 `:` cardinality
 *   "?"）。**双形态归一**：投影统一成 `axisId → value`；落码保留原形态（值列表按轴
 *   声明序、键值按原键序，工单定案）
 * - `max` / `min` / `graticule circle|polygon` / `ticks` / `showLegend`（文档级属性元素，
 *   一行可多条逗号分隔）
 *
 * 词法边界（mermaid 12 RadarGrammar 实证，chunk-WLRJLAWP.mjs 32536 行起的内嵌语法 JSON，
 * 工单 Comments 记录结论）：
 * - ID = `[\w]([-\w]*\w)?`——轴/曲线 id 只能是 ASCII 字母数字下划线与内部连字符
 *   （中文只能进 label 的 STRING）；STRING = 双/单引号 + `\\.` 转义。
 * - NUMBER = INT（`0|[1-9][0-9]*`，不认前导零）| FLOAT（`[0-9]+\.[0-9]+`，必须带小数
 *   部分）——**无负号**（与 pie 不同：radar 的值/min 词法层就拒绝负数）。
 * - 键值条目引用的轴按**全文档**轴集合解析（db.computeCurveEntries，缺条目直接抛错
 *   "Missing entry for axis"）——所以「加轴 / 删轴」必须对键值曲线做条目联动，见
 *   resolveAddAxis / resolveDeleteAxis；曲线条目清空（0 条目）会让 computeCurveEntries
 *   解引用 undefined 崩溃（entries[0].axis），删轴级联时把空曲线一并删除。
 * - `%%` 注释与行尾空白是 hidden token，可跟在语句后，归 tail 逐字保留。
 *
 * span 约定（行内多段的拆分，radar 特有）：行首缩进与换行留在 verbatim；
 * - 行内**唯一**合法段：span = 整行（去缩进），keyword / gap / tail 都归元素所有；
 * - 行内多段：首段 span = 段文本，其余段 span = 前导分隔（`, `）+ 段文本——
 *   「段拥有自己的左分隔」使删除中间段不残留逗号；首段删除用「后段文本前移 +
 *   后段 span 删除」的组合重写（deleteSegment 的 shift 分支）。
 * 不解析、原样保留（清单外语法不报错，ADR-0008）：frontmatter、`%%` 注释、
 * `accTitle` / `accDescr`（含多行 `accDescr {}`）、无法识别的行/段（空段、条目双形态
 * 混杂的曲线——mermaid 语法本身不允许混写）。
 * config（frontmatter）整块逐字保留（工单明确不做 config 编辑）；
 * `axesFontSize` / `curvesFontSize` / `minScore` 文档中不存在（勿实现）。
 *
 * 身份（ADR-0012 位置序）：`axis:N` / `curve:N` / `option:N` 均按文档序 1 基编号。
 * 轴/曲线虽有语法 id，但 id 可改名（set-axis-id / set-curve-id 意图），位置序是唯一
 * 稳定身份；radar 渲染器不给任何 DOM id / data-id（renderer 全程只有 class：
 * diagram-MPIPVDR6.mjs 的 drawAxes / drawCurves / drawLegend，工单 Comments 记录证据），
 * 画布不可寻址——选中与编辑入口 = 结构树 + 表单 + 双击轴 label（class 文本匹配）。
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

export interface RadarHeaderData {
  kind: 'radar-header'
  /** `radar-beta` 后到行尾的原文（空白/可选 `:`），逐字保留 */
  trailing: string
}

export interface RadarTitleData {
  kind: 'radar-title'
  /** `title` 与标题之间的空白原文 */
  gap: string
  /** 标题文本（去尾空白）；改写时行尾空白不保留（与 journey/pie 同口径） */
  text: string
}

/**
 * 行内段信息（axis / curve / option 共用）：radar 一行可写多个同类元素。
 * 「段拥有自己的左分隔」（首段除外）——删除中间段不残留逗号；行内唯一段
 * 拥有整行（keyword / gap / tail 都归它）。
 */
export interface RadarSegmentInfo {
  /** 行内是否第一个合法段 */
  isFirst: boolean
  /** 行内是否最后一个合法段（tail 归它所有） */
  isLast: boolean
  /** 非首段：本段之前的分隔原文（含逗号与两侧空白）；首段 '' */
  lead: string
  /** 首段：语句关键词与本段之间的空白原文（重组整行用）；非首段 '' */
  keywordGap: string
  /** 末段：本段之后到行尾的原文（尾随空白 / `%%` 注释）；非末段 '' */
  tail: string
  /** 本段所在语句行的序号（同行兄弟段判定用，按语句行计数） */
  lineIndex: number
}

/** `axis id["label"]` 段数据；label 引号内原文逐字保留（含转义序列） */
export interface RadarAxisData extends RadarSegmentInfo {
  kind: 'radar-axis'
  id: string
  hasLabel: boolean
  label: string
  /** 原引号字符（`"` 或 `'`），原样保留（落码统一双引号，见 escapeRadarLabel） */
  quote: string
}

/** `curve id["label"]{...}` 段数据；花括号内原文逐字保留 */
export interface RadarCurveData extends RadarSegmentInfo {
  kind: 'radar-curve'
  id: string
  hasLabel: boolean
  label: string
  quote: string
  /** 花括号内原文（逐字；含两侧空白） */
  entriesRaw: string
  /** 条目形态：键值 / 值列表 / 清单外（混杂或空——条目不建模） */
  form: RadarCurveForm
  /** 条目分段（键值 / 值列表形态才有；raw + sepAfter 保分隔原文） */
  pieces: RadarEntryPiece[]
}

export type RadarCurveForm = 'keyed' | 'value-list' | 'raw'

/**
 * 条目分段：键值形态 raw = leadWs + ref + mid + num；值列表 raw = leadWs + num + trailWs。
 * raw / sepAfter 保原文；结构化字段只用于**定点改写**（改值 / 改引用 / 删条目），
 * 未触碰条目经 raw 逐字回写。
 */
export interface RadarEntryPiece {
  raw: string
  /** 本条目之后的分隔原文（最后一个条目 ''；含逗号与两侧空白） */
  sepAfter: string
  kind: 'keyed' | 'number'
  leadWs: string
  /** 键值形态：引用的轴 id */
  ref?: string
  /** 键值形态：ref 与数值之间的原文（可含冒号与空白，如 `: `） */
  mid?: string
  /** 数值 token 原文（INT/FLOAT 词法） */
  num: string
  /** 值列表形态：数值后的尾随空白 */
  trailWs?: string
}

/** `option value` 段数据（max / min / graticule / ticks / showLegend） */
export interface RadarOptionData extends RadarSegmentInfo {
  kind: 'radar-option'
  /** 选项名原文（首段 = 行关键词；后续段 = 段内自己的名字） */
  name: string
  /** 首段：行关键词与值之间的空白原文 */
  gap: string
  /** 非首段：名字与值之间的空白原文 */
  innerGap: string
  /** 值段原文（去外侧空白） */
  value: string
}

export type RadarElementData =
  | RadarHeaderData
  | RadarTitleData
  | RadarAxisData
  | RadarCurveData
  | RadarOptionData

// ---------- 词法助手与校验 ----------

/** ID 词法（RadarGrammar 的 ID terminal `/[\w]([-\w]*\w)?/`：\\w 词素（可数字开头），
 * 内部可含连字符、不以连字符结尾） */
const ID_RE = /^[\w]([-\w]*\w)?$/

/** id 合法性（表单/落码门）：ID 词法（字母数字下划线，可数字开头 + 内部连字符） */
export function isValidRadarId(id: string): boolean {
  return ID_RE.test(id)
}

/** NUMBER 词法（INT `0|[1-9][0-9]*` | FLOAT `[0-9]+\.[0-9]+`；无负号） */
const NUM_RE = /^(?:0|[1-9][0-9]*|[0-9]+\.[0-9]+)$/

/** 数值落码门（表单/落码侧）：NUMBER 词法。radar 无负号（与 pie 不同） */
export function isValidRadarNumber(value: string): boolean {
  return NUM_RE.test(value.trim())
}

/**
 * label 文本合法性（表单/落码侧，label 是**转义前**的纯文本）：
 * 非空、不含换行（单行语法）。引号与反斜杠**允许**——落码统一转义
 * （escapeRadarLabel），比 pie 的「直接拒绝」更宽松且同样安全。
 * label 传空串 = 移除 label（回退 name 展示，mermaid db 语义 label ?? name）。
 */
export function isValidRadarLabelText(text: string): boolean {
  return text.trim() !== '' && !/\n/.test(text)
}

/** 纯文本 → `[ STRING ]`（方括号必需，统一双引号落码；`\` 与 `"` 转义） */
function labelToken(text: string): string {
  return `[${escapeRadarLabel(text)}]`
}

/** 纯文本 → STRING 字面量（统一双引号落码；`\` 与 `"` 转义） */
export function escapeRadarLabel(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** STRING 字面量内原文 → 纯文本（显示用近似：反转义 `\\X`；奇异转义序列按字面展示） */
export function unescapeRadarLabel(raw: string): string {
  return raw.replace(/\\(.)/g, '$1')
}

/** 选项名集合（RadarGrammar Option 规则；axesFontSize/curvesFontSize/minScore 不存在，勿加） */
export const RADAR_OPTION_NAMES = ['showLegend', 'ticks', 'max', 'min', 'graticule'] as const
export type RadarOptionName = (typeof RADAR_OPTION_NAMES)[number]

/** 选项值词法（按名字）；解析段与落码门共用（避免第二份实现） */
export function isValidRadarOptionValue(name: string, value: string): boolean {
  const v = value.trim()
  switch (name) {
    case 'showLegend':
      return v === 'true' || v === 'false'
    case 'graticule':
      return v === 'circle' || v === 'polygon'
    case 'ticks':
    case 'max':
    case 'min':
      return NUM_RE.test(v)
    default:
      return false
  }
}

/** 缺省 id 派生：`base1` 起逐个试探，避开已占用 id（轴/曲线 id 是 ID 词法，天然避重） */
export function nextRadarId(base: string, existing: string[]): string {
  for (let n = 1; ; n++) {
    const candidate = `${base}${n}`
    if (!existing.includes(candidate)) return candidate
  }
}

// ---------- 行内段拆分 ----------

/** 顶层段：text = 段原文（trim 后），start/end = 在 rest 内的精确偏移 */
interface TopLevelSpan {
  text: string
  start: number
  end: number
}

/**
 * 按**顶层逗号**拆分：引号内（`"` / `'`，含 `\\.` 转义）与花括号内（曲线条目）的
 * 逗号不拆。空段（连续逗号 / 尾逗号，清单外形态）跳过不产出。
 */
function splitTopLevelSpans(rest: string): TopLevelSpan[] {
  const spans: TopLevelSpan[] = []
  let depth = 0
  let quote: string | null = null
  let segStart = -1
  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i]
    if (quote !== null) {
      if (ch === '\\') i++
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      if (segStart === -1) segStart = i
      quote = ch
    } else if (ch === '{') {
      if (segStart === -1) segStart = i
      depth++
    } else if (ch === '}') {
      if (segStart === -1) segStart = i
      depth = Math.max(0, depth - 1)
    } else if (ch === ',' && depth === 0) {
      if (segStart !== -1 && rest.slice(segStart, i).trim() !== '') {
        spans.push({ text: rest.slice(segStart, i).trim(), start: segStart, end: i })
      }
      segStart = -1
    } else if (ch !== ' ' && ch !== '\t' && segStart === -1) {
      segStart = i
    }
  }
  if (segStart !== -1 && rest.slice(segStart).trim() !== '') {
    spans.push({ text: rest.slice(segStart).trim(), start: segStart, end: rest.length })
  }
  return spans
}

/** 引号内标签的闭引号位置（`\"` 等转义序列跳过）；无闭引号 -1 */
function findClosingQuote(text: string, quote: string, from: number): number {
  for (let i = from + 1; i < text.length; i++) {
    const ch = text[i]
    if (ch === '\\') {
      i++
      continue
    }
    if (ch === quote) return i
  }
  return -1
}

/** 段前缀解析：`id` + 可选 `["label"]` / `['label']`（方括号必需——RadarGrammar 的
 * label 形态；label 前后允许空白）；不匹配返回 null */
function parseIdLabel(
  seg: string,
): { id: string; hasLabel: boolean; label: string; quote: string; rest: string } | null {
  const idMatch = /^([\w-]+)/.exec(seg)
  if (idMatch === null) return null
  const id = idMatch[1]
  if (!ID_RE.test(id)) return null
  let pos = id.length
  while (pos < seg.length && (seg[pos] === ' ' || seg[pos] === '\t')) pos++
  if (pos >= seg.length) {
    return { id, hasLabel: false, label: '', quote: '"', rest: '' }
  }
  if (seg[pos] !== '[') return null
  pos++
  while (pos < seg.length && (seg[pos] === ' ' || seg[pos] === '\t')) pos++
  const quote = seg[pos]
  if (quote !== '"' && quote !== "'") return null
  const close = findClosingQuote(seg, quote, pos)
  if (close === -1) return null
  const label = seg.slice(pos + 1, close)
  pos = close + 1
  while (pos < seg.length && (seg[pos] === ' ' || seg[pos] === '\t')) pos++
  if (seg[pos] !== ']') return null
  const rest = seg.slice(pos + 1)
  return { id, hasLabel: true, label, quote, rest }
}

// ---------- 条目（曲线花括号内） ----------

/** 键值条目：`ref :? num`（冒号可省——RadarGrammar DetailedEntry 的 `:` cardinality "?"） */
const KEYED_ENTRY_RE = /^([ \t]*)([\w-]+)([ \t]*:?[ \t]*)([0-9]+(?:\.[0-9]+)?)([ \t]*)$/
/** 值列表条目：纯数值 */
const NUMBER_ENTRY_RE = /^([ \t]*)([0-9]+(?:\.[0-9]+)?)([ \t]*)$/

/** piece.raw 的唯一重组公式（= leadWs + (ref+mid) + num + trailWs）：
 * 解析与定点改写共用，保证 raw 与结构化字段永远一致 */
function normalizePieceRaw(p: RadarEntryPiece): string {
  return `${p.leadWs}${p.kind === 'keyed' ? `${p.ref}${p.mid}` : ''}${p.num}${p.trailWs ?? ''}`
}

/** 花括号内原文 → 条目分段（双形态判定：全键值或全数值；混杂/空 = 清单外 'raw'）。
 * 花括号内外侧空白并进首末 piece（leadWs 前置 / trailWs 后置），重建时逐字回写。 */
function parseEntries(entriesRaw: string): { form: RadarCurveForm; pieces: RadarEntryPiece[] } {
  const spans = splitTopLevelSpans(entriesRaw)
  if (spans.length === 0) return { form: 'raw', pieces: [] }
  const sepAfterOf = (i: number): string =>
    i < spans.length - 1 ? entriesRaw.slice(spans[i]!.end, spans[i + 1]!.start) : ''
  const keyed = spans.map((s) => KEYED_ENTRY_RE.exec(s.text))
  const outerLead = entriesRaw.slice(0, spans[0]!.start)
  // 末段 span.end 记到 entriesRaw 末尾（含尾随空白），尾空白要按 text 结束处取回
  const lastSpan = spans[spans.length - 1]!
  const outerTrail = entriesRaw.slice(lastSpan.start + lastSpan.text.length)
  let pieces: RadarEntryPiece[]
  if (keyed.every((m) => m !== null)) {
    pieces = spans.map((s, i) => {
      const m = keyed[i]!
      return {
        raw: s.text,
        sepAfter: sepAfterOf(i),
        kind: 'keyed',
        leadWs: m[1],
        ref: m[2],
        mid: m[3],
        num: m[4],
        trailWs: m[5],
      }
    })
  } else {
    const numbers = spans.map((s) => NUMBER_ENTRY_RE.exec(s.text))
    if (!numbers.every((m) => m !== null)) {
      // 双形态混杂（mermaid 语法不允许）或含怪 token：清单外，条目不建模
      return { form: 'raw', pieces: [] }
    }
    pieces = spans.map((s, i) => {
      const m = numbers[i]!
      return { raw: s.text, sepAfter: sepAfterOf(i), kind: 'number', leadWs: m[1], num: m[2], trailWs: m[3] }
    })
  }
  pieces[0]!.leadWs = outerLead + pieces[0]!.leadWs
  const last = pieces[pieces.length - 1]!
  last.trailWs = (last.trailWs ?? '') + outerTrail
  for (const p of pieces) p.raw = normalizePieceRaw(p)
  return { form: keyed.every((m) => m !== null) ? 'keyed' : 'value-list', pieces }
}

/** 条目原文重建（未触碰条目 raw 逐字回写；最后一段不带 sepAfter） */
export function renderRadarEntries(pieces: RadarEntryPiece[]): string {
  let out = ''
  for (let i = 0; i < pieces.length; i++) {
    out += pieces[i].raw
    if (i < pieces.length - 1) out += pieces[i].sepAfter
  }
  return out
}

/** 在条目集末尾插入新条目（保留尾随空白；空条目集直接落新条目） */
export function appendRadarEntry(entriesRaw: string, entryText: string): string {
  const head = entriesRaw.trimEnd()
  const tailWs = entriesRaw.slice(head.length)
  if (head === '') return `${entryText}${tailWs}`
  return `${head}, ${entryText}${tailWs}`
}

// ---------- 段重建（重写文本的唯一出口；未触碰字段逐字保留） ----------

/**
 * 轴段重建。changes：
 * - id：改语法 id；label：纯文本（null = 移除 label；undefined = 原样）
 * - appendSegment：在本段之后追加一个新段（加轴落到本行行尾时用——插在本段 tail
 *   之前，不吞行尾注释）
 * 段 span 约定见文件头：唯一段重建整行；首段只重建段文本；其余段重建 lead + 段文本。
 */
export function renderRadarAxis(
  d: RadarAxisData,
  changes: { id?: string; label?: string | null; appendSegment?: string } = {},
): string {
  const id = changes.id ?? d.id
  let seg: string
  if (changes.label !== undefined) {
    seg = changes.label === null ? id : `${id}${labelToken(changes.label)}`
  } else if (d.hasLabel) {
    seg = `${id}[${d.quote}${d.label}${d.quote}]`
  } else {
    seg = id
  }
  if (changes.appendSegment !== undefined) seg = `${seg}, ${changes.appendSegment}`
  if (d.isFirst && d.isLast) return `axis${d.keywordGap}${seg}${d.tail}`
  if (d.isFirst) return seg
  return `${d.lead}${seg}`
}

/** 曲线段重建。changes：id / label（null = 移除）/ entriesRaw（花括号内原文）/ appendSegment */
export function renderRadarCurve(
  d: RadarCurveData,
  changes: { id?: string; label?: string | null; entriesRaw?: string; appendSegment?: string } = {},
): string {
  const id = changes.id ?? d.id
  let labelPart = ''
  if (changes.label !== undefined) {
    if (changes.label !== null) labelPart = labelToken(changes.label)
  } else if (d.hasLabel) {
    labelPart = `[${d.quote}${d.label}${d.quote}]`
  }
  const entries = changes.entriesRaw ?? d.entriesRaw
  let seg = `${id}${labelPart}{${entries}}`
  if (changes.appendSegment !== undefined) seg = `${seg}, ${changes.appendSegment}`
  if (d.isFirst && d.isLast) return `curve${d.keywordGap}${seg}${d.tail}`
  if (d.isFirst) return seg
  return `${d.lead}${seg}`
}

/**
 * 选项段重建。changes：value（原文）/ appendSegment。
 * 位置语义与轴/曲线一致：唯一段 = 整行（含关键词）；首段 = 值（关键词在 span 外）；
 * 其余段 = lead + 名字 + 值。
 */
export function renderRadarOption(
  d: RadarOptionData,
  changes: { value?: string; appendSegment?: string } = {},
): string {
  const value = changes.value ?? d.value
  if (d.isFirst && d.isLast) {
    let seg = `${d.name}${d.gap}${value}`
    if (changes.appendSegment !== undefined) seg = `${seg}, ${changes.appendSegment}`
    return `${seg}${d.tail}`
  }
  if (d.isFirst) {
    let seg = value
    if (changes.appendSegment !== undefined) seg = `${seg}, ${changes.appendSegment}`
    return seg
  }
  let seg = `${d.lead}${d.name}${d.innerGap}${value}`
  if (changes.appendSegment !== undefined) seg = `${seg}, ${changes.appendSegment}`
  return seg
}

// ---------- 解析器 ----------

interface RawEntry {
  span: Span
  id: string
  data: RadarElementData
}

const HEADER_RE = /^radar-beta[ \t]*:?[ \t]*$/
const TITLE_PREFIX = /^title[ \t]/
const ACC_PREFIX = /^acc(Title|Descr)/
// 关键词与内容之间的空白用捕获组留下（[ \t]+ 会把分隔空白吞掉，render 时必须原样回写）
const AXIS_PREFIX = /^axis([ \t]+)(.+)$/
const CURVE_PREFIX = /^curve([ \t]+)(.+)$/
const OPTION_LINE_RE = /^(showLegend|ticks|max|min|graticule)([ \t]+)(.+)$/
const OPTION_SEG_RE = /^(showLegend|ticks|max|min|graticule)([ \t]+)(.+)$/

interface SegmentCounters {
  axis: number
  curve: number
  option: number
}

export class RadarParser implements DiagramParser {
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

  /** 意图落地（唯一入口：表单 / 画布键盘 / 右键菜单共用） */
  resolveRewrites(doc: SourceDocument, intent: EditIntent): ReadonlyMap<string, string> | null {
    return resolveRadarRewrites(doc, intent)
  }

  private parseDocument(source: string): SourceDocument {
    const entries: RawEntry[] = []
    const counters: SegmentCounters = { axis: 0, curve: 0, option: 0 }
    let seenHeader = false
    let lineIndex = 0
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

        if (!seenHeader) {
          if (!HEADER_RE.test(trimmed)) {
            throw parseFailure(lineNo, '图表必须以 radar-beta 声明开始')
          }
          seenHeader = true
          entries.push({
            span: spanOfLine(),
            id: 'radar-header',
            data: { kind: 'radar-header', trailing: line.slice(firstChar + 'radar-beta'.length) },
          })
        } else if (trimmed.startsWith('%%') || ACC_PREFIX.test(trimmed)) {
          // 注释 / 可访问性语句（含多行 accDescr {} 的花括号行）：逐字保留
        } else if (TITLE_PREFIX.test(trimmed)) {
          const rest = line.slice(firstChar + 'title'.length)
          // TITLE terminal 到 %% 截断（Langium lookahead `(?=%%)`），%% 后是注释
          const raw = rest.trim()
          const cut = raw.indexOf('%%')
          const text = (cut === -1 ? raw : raw.slice(0, cut)).trim()
          if (text !== '') {
            entries.push({
              span: spanOfLine(),
              id: 'radar-title',
              data: {
                kind: 'radar-title',
                gap: rest.slice(0, rest.length - rest.trimStart().length),
                text,
              },
            })
          }
          // 空标题等清单外形态：不解析，逐字保留
        } else {
          const body = line.slice(firstChar)
          const absBase = cursor + firstChar
          const produced =
            this.parseAxisLine(body, absBase, lineIndex, counters) ??
            this.parseCurveLine(body, absBase, lineIndex, counters) ??
            this.parseOptionLine(body, absBase, lineIndex, counters)
          if (produced !== null) entries.push(...produced)
          // 无法识别的行（不带花括号的曲线、值词法不合的选项等清单外）：逐字保留
        }
      }

      if (nl === -1) break
      cursor = nl + 1
    }

    if (!seenHeader) {
      throw parseFailure(1, '图表必须以 radar-beta 声明开始')
    }
    return assembleDocument(source, entries)
  }

  /**
   * 行内段 span 计算（三个 line parser 共用几何）：
   * - 唯一合法段：span = 整行（去缩进）；
   * - 首段：span = 段文本；其余段：span = lead + 段文本（lead = 与上一段之间的原文，
   *   含逗号——即使上一段是清单外被跳过的段，lead 也一并覆盖，保持切片互不重叠）。
   * validFlags 与 spans 一一对应；首段（validFlags[0]）必须为 true（首段不合法的行
   * 在 mermaid 本身报错，整行清单外由调用方先行排除）。
   */
  private segmentGeometry(
    body: string,
    absBase: number,
    keywordGap: string,
    rest: string,
    spans: TopLevelSpan[],
    validFlags: boolean[],
    lineIndex: number,
  ): { span: Span; info: RadarSegmentInfo }[] {
    const indent = body.length - body.trimStart().length
    const restStart = body.length - rest.length
    const validTotal = validFlags.filter(Boolean).length
    const out: { span: Span; info: RadarSegmentInfo }[] = []
    let validSeen = 0
    for (let i = 0; i < spans.length; i++) {
      if (!validFlags[i]) continue
      validSeen++
      const isFirst = validSeen === 1
      const isLast = validSeen === validTotal
      const prevEnd = i > 0 ? spans[i - 1]!.end : spans[i]!.start
      const lead = isFirst ? '' : rest.slice(prevEnd, spans[i]!.start)
      const tail = isLast ? rest.slice(spans[i]!.end) : ''
      const segStartAbs = absBase + restStart + spans[i]!.start
      const segEndAbs = absBase + restStart + spans[i]!.end
      const span: Span = isFirst && isLast
        ? { start: absBase + indent, end: absBase + body.length }
        : isFirst
          ? { start: segStartAbs, end: segEndAbs }
          : { start: segStartAbs - lead.length, end: segEndAbs }
      out.push({
        span,
        info: { isFirst, isLast, lead, keywordGap: isFirst ? keywordGap : '', tail, lineIndex },
      })
    }
    return out
  }

  private parseAxisLine(
    body: string,
    absBase: number,
    lineIndex: number,
    counters: SegmentCounters,
  ): RawEntry[] | null {
    const m = AXIS_PREFIX.exec(body)
    if (m === null) return null
    const keywordGap = m[1]
    const rest = m[2]
    const spans = splitTopLevelSpans(rest)
    const parsed = spans.map((s) => parseIdLabel(s.text))
    if (parsed[0] === undefined || parsed[0] === null) return null // 首段不合法 = mermaid 该行报错，整行清单外
    const geometry = this.segmentGeometry(
      body, absBase, keywordGap, rest, spans, parsed.map((p) => p !== null), lineIndex,
    )
    const valid = parsed.filter((p) => p !== null)
    const out: RawEntry[] = []
    geometry.forEach((g, i) => {
      const p = valid[i]!
      counters.axis++
      const data: RadarAxisData = {
        kind: 'radar-axis',
        ...g.info,
        id: p.id,
        hasLabel: p.hasLabel,
        label: p.label,
        quote: p.quote,
      }
      out.push({ span: g.span, id: `axis:${counters.axis}`, data })
    })
    return out
  }

  private parseCurveLine(
    body: string,
    absBase: number,
    lineIndex: number,
    counters: SegmentCounters,
  ): RawEntry[] | null {
    const m = CURVE_PREFIX.exec(body)
    if (m === null) return null
    const keywordGap = m[1]
    const rest = m[2]
    const spans = splitTopLevelSpans(rest)
    const parsed = spans.map((s) => this.parseCurveSegment(s.text))
    if (parsed[0] === undefined || parsed[0] === null) return null
    const geometry = this.segmentGeometry(
      body, absBase, keywordGap, rest, spans, parsed.map((p) => p !== null), lineIndex,
    )
    const valid = parsed.filter((p) => p !== null)
    const out: RawEntry[] = []
    geometry.forEach((g, i) => {
      const p = valid[i]!
      counters.curve++
      const data: RadarCurveData = {
        kind: 'radar-curve',
        ...g.info,
        id: p.id,
        hasLabel: p.hasLabel,
        label: p.label,
        quote: p.quote,
        entriesRaw: p.entriesRaw,
        form: p.form,
        pieces: p.pieces,
      }
      out.push({ span: g.span, id: `curve:${counters.curve}`, data })
    })
    return out
  }

  /** 曲线段：`id["label"]{entries}`——花括号必需（无花括号 = mermaid 语法错误，跳过） */
  private parseCurveSegment(
    seg: string,
  ): {
    id: string
    hasLabel: boolean
    label: string
    quote: string
    entriesRaw: string
    form: RadarCurveForm
    pieces: RadarEntryPiece[]
  } | null {
    const open = seg.indexOf('{')
    if (open === -1 || !seg.endsWith('}')) return null
    const head = parseIdLabel(seg.slice(0, open))
    if (head === null) return null
    // label 与 { 之间只允许空白（花括号紧随 id/label——RadarGrammar）
    if (head.rest.trim() !== '') return null
    const entriesRaw = seg.slice(open + 1, seg.length - 1)
    const { form, pieces } = parseEntries(entriesRaw)
    return { id: head.id, hasLabel: head.hasLabel, label: head.label, quote: head.quote, entriesRaw, form, pieces }
  }

  /**
   * option 行：`name value`（一行可多条逗号分隔）。首段名 = 行关键词、值 = 首段文本
   * （首段值必须词法合法，否则整行清单外）；后续段自带名字与间隔空白。
   * 首段 span：唯一段 = 整行；多段 = 值文本（关键词在 span 外）。
   */
  private parseOptionLine(
    body: string,
    absBase: number,
    lineIndex: number,
    counters: SegmentCounters,
  ): RawEntry[] | null {
    const m = OPTION_LINE_RE.exec(body)
    if (m === null) return null
    const firstName = m[1]
    const gap = m[2]
    const rest = m[3]
    const spans = splitTopLevelSpans(rest)
    if (spans.length === 0) return null
    if (!isValidRadarOptionValue(firstName, spans[0]!.text)) return null
    const parsed = spans.map((s, i): { name: string; innerGap: string; value: string; valid: boolean } => {
      if (i === 0) return { name: firstName, innerGap: gap, value: s.text, valid: true }
      const segM = OPTION_SEG_RE.exec(s.text)
      if (segM === null) return { name: '', innerGap: '', value: s.text, valid: false }
      return {
        name: segM[1],
        innerGap: segM[2],
        value: segM[3].trim(),
        valid: isValidRadarOptionValue(segM[1], segM[3].trim()),
      }
    })
    const geometry = this.segmentGeometry(
      body, absBase, gap, rest, spans, parsed.map((p) => p.valid), lineIndex,
    )
    const valid = parsed.filter((p) => p.valid)
    const out: RawEntry[] = []
    geometry.forEach((g, i) => {
      const p = valid[i]!
      counters.option++
      const data: RadarOptionData = {
        kind: 'radar-option',
        ...g.info,
        name: p.name,
        gap,
        innerGap: p.innerGap,
        value: p.value,
      }
      out.push({ span: g.span, id: `option:${counters.option}`, data })
    })
    return out
  }
}

export const radarParser = new RadarParser()

// ---------- 意图落地（resolveRadarRewrites：RadarParser.resolveRewrites 的唯一实现） ----------

function axisParts(doc: SourceDocument): ElementPart[] {
  return doc.elements.filter((p) => p.element.kind === 'radar-axis')
}

function curveParts(doc: SourceDocument): ElementPart[] {
  return doc.elements.filter((p) => p.element.kind === 'radar-curve')
}

/** 编辑意图（工单 15 表单 / 画布键盘 / 右键菜单所需集合） */
export type RadarIntent =
  /** 新增轴（id 缺省 axisN 避重、label 缺省「新轴」；有轴时追加到最后一条轴行行尾，
   * 并对全部键值曲线联动补 `id: 0` 条目——缺条目会让 mermaid computeCurveEntries 抛错） */
  | { type: 'add-axis'; id?: string; label?: string; afterElementId?: string }
  /** 改轴语法 id（ID 词法 + 不与其他轴重名；键值曲线里的引用同步改名） */
  | { type: 'set-axis-id'; elementId: string; id: string }
  /** 改轴 label（纯文本，落码转义；'' = 移除 label，展示回退轴 id） */
  | { type: 'set-axis-label'; elementId: string; label: string }
  /** 删除轴（键值曲线删其条目、值列表曲线删其位序值；空曲线一并删除——0 条目会让
   * mermaid computeCurveEntries 崩溃） */
  | { type: 'delete-axis'; elementId: string }
  /** 新增曲线（键值形态、全轴补值 values?.[axisId] ?? '0'；无轴时拒绝——0 条目非法） */
  | { type: 'add-curve'; id?: string; label?: string; values?: Record<string, string>; afterElementId?: string }
  /** 改曲线语法 id（ID 词法 + 不与其他曲线重名；曲线 id 无引用方，无需级联） */
  | { type: 'set-curve-id'; elementId: string; id: string }
  /** 改曲线 label（纯文本，落码转义；'' = 移除 label） */
  | { type: 'set-curve-label'; elementId: string; label: string }
  /** 改曲线在某轴上的值（NUMBER 词法；键值形态改其条目、值列表形态改轴声明位的值） */
  | { type: 'set-curve-value'; elementId: string; axisId: string; value: string }
  /** 删除曲线 */
  | { type: 'delete-curve'; elementId: string }
  /** 改选项值（showLegend true|false、graticule circle|polygon、ticks/max/min NUMBER） */
  | { type: 'set-option-value'; elementId: string; value: string }
  /** 设置图表标题（`title 文本`）；无标题行时紧随声明头插入一行 */
  | { type: 'set-title'; text: string }

function resolveRadarRewrites(doc: SourceDocument, intent: EditIntent): ReadonlyMap<string, string> | null {
  switch (intent.type) {
    case 'add-axis':
      return resolveAddAxis(doc, intent as Extract<RadarIntent, { type: 'add-axis' }>)
    case 'set-axis-id':
      return resolveSetAxisId(doc, intent as Extract<RadarIntent, { type: 'set-axis-id' }>)
    case 'set-axis-label':
      return resolveSetAxisLabel(doc, intent as Extract<RadarIntent, { type: 'set-axis-label' }>)
    case 'delete-axis':
      return resolveDeleteAxis(doc, intent as Extract<RadarIntent, { type: 'delete-axis' }>)
    case 'add-curve':
      return resolveAddCurve(doc, intent as Extract<RadarIntent, { type: 'add-curve' }>)
    case 'set-curve-id':
      return resolveSetCurveId(doc, intent as Extract<RadarIntent, { type: 'set-curve-id' }>)
    case 'set-curve-label':
      return resolveSetCurveLabel(doc, intent as Extract<RadarIntent, { type: 'set-curve-label' }>)
    case 'set-curve-value':
      return resolveSetCurveValue(doc, intent as Extract<RadarIntent, { type: 'set-curve-value' }>)
    case 'delete-curve':
      return resolveDeleteCurve(doc, intent as Extract<RadarIntent, { type: 'delete-curve' }>)
    case 'set-option-value':
      return resolveSetOptionValue(doc, intent as Extract<RadarIntent, { type: 'set-option-value' }>)
    case 'set-title':
      return resolveSetTitle(doc, intent as Extract<RadarIntent, { type: 'set-title' }>)
    default:
      return null
  }
}

/** 段的「纯段文本」（去 lead / 整行包装）——首段删除的 shift 技巧用（后段文本前移） */
function segmentOnlyText(part: ElementPart): string {
  const data = part.element as RadarAxisData | RadarCurveData
  const shifted = { ...data, isFirst: true, isLast: false, lead: '', keywordGap: '', tail: '' }
  return data.kind === 'radar-axis'
    ? renderRadarAxis(shifted as RadarAxisData)
    : renderRadarCurve(shifted as RadarCurveData)
}

/**
 * 删除一个行内段（axis / curve 共用的行几何）：
 * - 行内唯一段 → span 是整行，删除 = ''（整行消失，缩进与换行留 verbatim）；
 * - 首段且有后继 → 「后段纯段文本前移 + 后段 span 删除」组合（后段 span 含 lead，
 *   删除它恰好带走分隔逗号）；
 * - 其余段 → span（lead + 段文本）删除 = ''，不残留逗号。
 */
function deleteSegment(parts: ElementPart[], index: number, rewrites: Map<string, string>): void {
  const part = parts[index]!
  const data = part.element as unknown as RadarSegmentInfo
  if (data.isFirst && data.isLast) {
    rewrites.set(part.id, '')
    return
  }
  const next = parts[index + 1]
  if (data.isFirst && next !== undefined && (next.element as unknown as RadarSegmentInfo).lineIndex === data.lineIndex) {
    rewrites.set(part.id, segmentOnlyText(next))
    rewrites.set(next.id, '')
    return
  }
  rewrites.set(part.id, '')
}

/** 改值后 / 改引用后的条目重建（未触碰条目 raw 逐字保留） */
function withPiece(pieces: RadarEntryPiece[], index: number, next: RadarEntryPiece): RadarEntryPiece[] {
  return pieces.map((p, i) => (i === index ? next : p))
}

function withoutPiece(pieces: RadarEntryPiece[], index: number): RadarEntryPiece[] {
  const next = pieces.filter((_, i) => i !== index)
  // 删首条目时把它的 leadWs（花括号外侧空白并进了首 piece）转移给新首条目，否则前导空白丢失
  if (index === 0 && next.length > 0) {
    const first = next[0]!
    next[0] = { ...first, leadWs: pieces[0]!.leadWs + first.leadWs, raw: '' }
    next[0].raw = normalizePieceRaw(next[0])
  }
  return next
}

/** 新增轴：有轴 → 追加到最后一条轴行行尾 + 键值曲线联动补条目；无轴 → 新行（锚点缺省文档末尾） */
function resolveAddAxis(doc: SourceDocument, intent: Extract<RadarIntent, { type: 'add-axis' }>): Map<string, string> | null {
  const axes = axisParts(doc)
  const existingIds = axes.map((p) => (p.element as RadarAxisData).id)
  const givenId = intent.id?.trim() ?? ''
  const id = givenId !== '' ? givenId : nextRadarId('axis', existingIds)
  if (!isValidRadarId(id) || existingIds.includes(id)) return null
  const labelText = intent.label?.trim() ?? newElementName('axis')
  if (labelText !== '' && !isValidRadarLabelText(labelText)) return null
  const seg = labelText === '' ? id : `${id}${labelToken(labelText)}`

  if (axes.length === 0) {
    return insertAfter(doc, {
      afterElementId: intent.afterElementId,
      anchor: 'line-end',
      render: (indent) => `\n${indent}axis ${seg}`,
    })
  }
  const rewrites = new Map<string, string>()
  const last = axes[axes.length - 1]!
  rewrites.set(last.id, renderRadarAxis(last.element as RadarAxisData, { appendSegment: seg }))
  // 键值曲线联动：新轴必须有值（mermaid computeCurveEntries 缺条目抛错）
  for (const part of curveParts(doc)) {
    const data = part.element as RadarCurveData
    if (data.form !== 'keyed') continue
    rewrites.set(part.id, renderRadarCurve(data, { entriesRaw: appendRadarEntry(data.entriesRaw, `${id}: 0`) }))
  }
  return rewrites
}

/** 改轴 id：ID 词法 + 不与其他轴重名；键值曲线里的引用同步改名（值列表曲线按位序，无需动） */
function resolveSetAxisId(doc: SourceDocument, intent: Extract<RadarIntent, { type: 'set-axis-id' }>): Map<string, string> | null {
  const part = getElementById(doc, intent.elementId)
  if (part === undefined || part.element.kind !== 'radar-axis') return null
  const id = intent.id.trim()
  if (!isValidRadarId(id)) return null
  const others = axisParts(doc).filter((p) => p.id !== part.id)
  if (others.some((p) => (p.element as RadarAxisData).id === id)) return null
  const data = part.element as RadarAxisData
  const oldId = data.id
  const rewrites = new Map<string, string>([[part.id, renderRadarAxis(data, { id })]])
  for (const curve of curveParts(doc)) {
    const c = curve.element as RadarCurveData
    if (c.form !== 'keyed') continue
    let changed = false
    const pieces = c.pieces.map((piece) => {
      if (piece.kind !== 'keyed' || piece.ref !== oldId) return piece
      changed = true
      return { ...piece, ref: id, raw: `${piece.leadWs}${id}${piece.mid}${piece.num}${piece.trailWs ?? ''}` }
    })
    if (changed) rewrites.set(curve.id, renderRadarCurve(c, { entriesRaw: renderRadarEntries(pieces) }))
  }
  return rewrites
}

/** 改轴 label：'' = 移除（回退轴 id 展示）；非空纯文本落码转义 */
function resolveSetAxisLabel(doc: SourceDocument, intent: Extract<RadarIntent, { type: 'set-axis-label' }>): Map<string, string> | null {
  const part = getElementById(doc, intent.elementId)
  if (part === undefined || part.element.kind !== 'radar-axis') return null
  const label = intent.label.trim()
  if (label === '') {
    return new Map([[part.id, renderRadarAxis(part.element as RadarAxisData, { label: null })]])
  }
  if (!isValidRadarLabelText(label)) return null
  return new Map([[part.id, renderRadarAxis(part.element as RadarAxisData, { label })]])
}

/** 删除轴：行几何删除 + 曲线条目级联（键值删条目、值列表删位序值；空曲线一并删除） */
function resolveDeleteAxis(doc: SourceDocument, intent: Extract<RadarIntent, { type: 'delete-axis' }>): Map<string, string> | null {
  const axes = axisParts(doc)
  const index = axes.findIndex((p) => p.id === intent.elementId)
  if (index === -1) return null
  const rewrites = new Map<string, string>()
  deleteSegment(axes, index, rewrites)
  const deletedId = (axes[index]!.element as RadarAxisData).id
  const curves = curveParts(doc)
  curves.forEach((curve, curveIndex) => {
    const c = curve.element as RadarCurveData
    if (c.form === 'keyed') {
      const at = c.pieces.findIndex((p) => p.kind === 'keyed' && p.ref === deletedId)
      if (at === -1) return
      applyCurveCascade(rewrites, curves, curveIndex, c, withoutPiece(c.pieces, at))
    } else if (c.form === 'value-list') {
      // 值列表按轴声明序对应：删第 index 个轴 = 删第 index 个值
      if (index >= c.pieces.length) return
      applyCurveCascade(rewrites, curves, curveIndex, c, withoutPiece(c.pieces, index))
    }
    // 'raw'（清单外条目）：不动（用户源码该曲线本就渲染失败，不静默改写）
  })
  return rewrites.size === 0 ? null : rewrites
}

/** 曲线级联的落码：条目剩余 > 0 → 重写条目；= 0 → 删除整条曲线（0 条目让 mermaid 崩溃） */
function applyCurveCascade(
  rewrites: Map<string, string>,
  curves: ElementPart[],
  curveIndex: number,
  data: RadarCurveData,
  remaining: RadarEntryPiece[],
): void {
  if (remaining.length > 0) {
    rewrites.set(curves[curveIndex]!.id, renderRadarCurve(data, { entriesRaw: renderRadarEntries(remaining) }))
  } else {
    deleteSegment(curves, curveIndex, rewrites)
  }
}

/** 新增曲线：键值形态、全轴补值（values?.[axisId] ?? '0'）；无轴拒绝（0 条目非法） */
function resolveAddCurve(doc: SourceDocument, intent: Extract<RadarIntent, { type: 'add-curve' }>): Map<string, string> | null {
  const axes = axisParts(doc)
  if (axes.length === 0) return null
  const curves = curveParts(doc)
  const existingIds = curves.map((p) => (p.element as RadarCurveData).id)
  const givenId = intent.id?.trim() ?? ''
  const id = givenId !== '' ? givenId : nextRadarId('curve', existingIds)
  if (!isValidRadarId(id) || existingIds.includes(id)) return null
  const labelText = intent.label?.trim() ?? newElementName('curve')
  if (labelText !== '' && !isValidRadarLabelText(labelText)) return null
  const entries: string[] = []
  for (const p of axes) {
    const axisId = (p.element as RadarAxisData).id
    const value = intent.values?.[axisId]?.trim() ?? '0'
    if (!isValidRadarNumber(value)) return null
    entries.push(`${axisId}: ${value}`)
  }
  const labelPart = labelText === '' ? '' : labelToken(labelText)
  const line = `curve ${id}${labelPart}{ ${entries.join(', ')} }`
  // 锚点缺省 = 追加到文档末尾（接线指南 §2：不传锚点）；显式 afterElementId 优先
  return insertAfter(doc, {
    afterElementId: intent.afterElementId,
    anchor: 'line-end',
    render: (indent) => `\n${indent}${line}`,
  })
}

/** 改曲线 id：ID 词法 + 不与其他曲线重名；曲线 id 无引用方，无需级联 */
function resolveSetCurveId(doc: SourceDocument, intent: Extract<RadarIntent, { type: 'set-curve-id' }>): Map<string, string> | null {
  const part = getElementById(doc, intent.elementId)
  if (part === undefined || part.element.kind !== 'radar-curve') return null
  const id = intent.id.trim()
  if (!isValidRadarId(id)) return null
  const others = curveParts(doc).filter((p) => p.id !== part.id)
  if (others.some((p) => (p.element as RadarCurveData).id === id)) return null
  return new Map([[part.id, renderRadarCurve(part.element as RadarCurveData, { id })]])
}

/** 改曲线 label：'' = 移除；非空纯文本落码转义 */
function resolveSetCurveLabel(doc: SourceDocument, intent: Extract<RadarIntent, { type: 'set-curve-label' }>): Map<string, string> | null {
  const part = getElementById(doc, intent.elementId)
  if (part === undefined || part.element.kind !== 'radar-curve') return null
  const label = intent.label.trim()
  if (label === '') {
    return new Map([[part.id, renderRadarCurve(part.element as RadarCurveData, { label: null })]])
  }
  if (!isValidRadarLabelText(label)) return null
  return new Map([[part.id, renderRadarCurve(part.element as RadarCurveData, { label })]])
}

/** 改曲线某轴的值：键值形态改其条目数值、值列表形态改轴声明位的数值（未触碰条目逐字保留） */
function resolveSetCurveValue(doc: SourceDocument, intent: Extract<RadarIntent, { type: 'set-curve-value' }>): Map<string, string> | null {
  const part = getElementById(doc, intent.elementId)
  if (part === undefined || part.element.kind !== 'radar-curve') return null
  const value = intent.value.trim()
  if (!isValidRadarNumber(value)) return null
  const c = part.element as RadarCurveData
  if (c.form === 'keyed') {
    const at = c.pieces.findIndex((p) => p.kind === 'keyed' && p.ref === intent.axisId)
    if (at === -1) return null
    const piece = c.pieces[at]!
    const next: RadarEntryPiece = {
      ...piece,
      num: value,
      raw: `${piece.leadWs}${piece.ref}${piece.mid}${value}${piece.trailWs ?? ''}`,
    }
    return new Map([[part.id, renderRadarCurve(c, { entriesRaw: renderRadarEntries(withPiece(c.pieces, at, next)) })]])
  }
  if (c.form === 'value-list') {
    const axisIndex = axisParts(doc).findIndex((p) => (p.element as RadarAxisData).id === intent.axisId)
    if (axisIndex === -1 || axisIndex >= c.pieces.length) return null
    const piece = c.pieces[axisIndex]!
    const next: RadarEntryPiece = { ...piece, num: value, raw: `${piece.leadWs}${value}${piece.trailWs ?? ''}` }
    return new Map([[part.id, renderRadarCurve(c, { entriesRaw: renderRadarEntries(withPiece(c.pieces, axisIndex, next)) })]])
  }
  return null // 'raw'：清单外条目不建模，不静默改写
}

/** 删除曲线（行几何删除；轴不受影响） */
function resolveDeleteCurve(doc: SourceDocument, intent: Extract<RadarIntent, { type: 'delete-curve' }>): Map<string, string> | null {
  const curves = curveParts(doc)
  const index = curves.findIndex((p) => p.id === intent.elementId)
  if (index === -1) return null
  const rewrites = new Map<string, string>()
  deleteSegment(curves, index, rewrites)
  return rewrites
}

/** 改选项值：按名字校验词法（showLegend true|false、graticule circle|polygon、ticks/max/min NUMBER） */
function resolveSetOptionValue(doc: SourceDocument, intent: Extract<RadarIntent, { type: 'set-option-value' }>): Map<string, string> | null {
  const part = getElementById(doc, intent.elementId)
  if (part === undefined || part.element.kind !== 'radar-option') return null
  const data = part.element as RadarOptionData
  const value = intent.value.trim()
  if (!isValidRadarOptionValue(data.name, value)) return null
  return new Map([[part.id, renderRadarOption(data, { value })]])
}

/** 设置图表标题（`title 文本`）：已有标题行则原地改；无则紧随声明头插入一行 */
function resolveSetTitle(doc: SourceDocument, intent: Extract<RadarIntent, { type: 'set-title' }>): Map<string, string> | null {
  const text = intent.text.trim()
  if (text === '' || /\n/.test(text) || text.includes('%%')) return null
  const existing = doc.elements.find((p) => p.element.kind === 'radar-title')
  if (existing !== undefined) {
    return new Map([[existing.id, `title${(existing.element as RadarTitleData).gap}${text}`]])
  }
  const header = doc.elements.find((p) => p.element.kind === 'radar-header')
  if (header === undefined) return null
  return insertAfter(doc, {
    afterElementId: header.id,
    anchor: 'self',
    render: (indent) => `\n${indent}title ${text}`,
  })
}
