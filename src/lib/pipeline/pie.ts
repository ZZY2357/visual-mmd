import { assembleDocument, getElementById, type ElementPart, type SourceDocument } from './document'
import { frontmatterEnd } from './frontmatter'
import { insertAfter } from './insert'
import type { DiagramParser, EditIntent, ParseResult, SourceParseError } from './parser'
import type { Span } from './span'

/**
 * pie（饼图）完整解析器（more-diagrams 工单 10，语法事实以 spec 的
 * research/data-display.md pie 节为准，勿重复调研）：
 * 手写、逐行、带 span（ADR-0004）。可测试承诺：解析后不做修改再重组装，
 * 输出与输入逐字相同（verbatim identity）。
 *
 * 覆盖（分层对齐，spec 决策）：
 * - 声明头 `pie [showData]`（可选 showData 标记）、`title 标题文本`（单行）
 * - 扇区行 `"label" : 数值`（引号必需——mermaid 12 的 langium 词法里 label 是
 *   STRING token，实测不带引号的裸词直接 lexer 报错，工单 Comments 记录证据）
 *
 * 词法与校验边界（mermaid 12 实证，工单 Comments 记录结论）：
 * - 数值 token NUMBER_PIE = FLOAT_PIE（`-?[0-9]+\.[0-9]+`）| INT_PIE（`-?(0|[1-9][0-9]*)`）：
 *   整数不认前导零、小数必须有整数位（`.5` 不合法）；`1.234` 三位小数词法可过。
 * - **负数是落码错误**（pieDb.addSection 对 value < 0 抛错，mermaid.parse 直接失败）；
 *   **零在词法/DB 层合法但渲染层被静默过滤**（renderer 的 filteredArcs 把 0% 扇区
 *   整个丢掉）。工单定案两者都按「非法数值」处理：解析保留原文、结构树/表单标注
 *   （不静默改写用户源码）；表单与落码只接受 >0 的数值。
 * - label 词法是 STRING（`"` 或 `'` 引号），引号内的 `\"` 是转义——为守住「落码必须
 *   合法」，表单/落码侧的标签拒绝引号、反斜杠与换行（引号会提前闭合字符串字面量，
 *   反斜杠会转义闭引号）；解析侧引号内的原文逐字保留。
 * - 重复 label 的扇区 mermaid 全部接受（DB 按 Map 只记首个数值）——解析照常逐行建元素，
 *   去重语义是 mermaid 的渲染侧事务，不在编辑器层做。
 *
 * span 约定（与 journey 同口径，行级）：行首缩进与换行留在 verbatim；元素 span 不跨行；
 * 行尾空白 / `%%` 注释归 tail 字段逐字保留。不解析、原样保留（清单外语法不报错，ADR-0008）：
 * frontmatter、`%%` 注释、`accTitle` / `accDescr`（含多行 `accDescr {}`，工单明确不做编辑）、
 * 无法识别的行（含裸 label 不带引号的扇区行——mermaid 12 本身就报错，逐字保留即可）。
 * frontmatter 里的 textPosition / donutHole / legendPosition / highlightSlice config
 * 整块逐字保留（工单明确不做 config 编辑）。
 *
 * 身份（ADR-0012 位置序）：`sector:N` 按文档序 1 基编号——pie 的语法里没有节点 id
 * （research 已核查），位置序是唯一可行身份；元素 id 走字面量，无需 element-id.ts 的
 * 名字编解码。
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

export interface PieHeaderData {
  kind: 'pie-header'
  /** `pie` 与 `showData` 之间的空白原文（无 showData 时空串） */
  gap: string
  /** 声明头是否带 showData 标记 */
  showData: boolean
  /** 声明行尾原文（尾随空白），逐字保留 */
  trailing: string
}

export interface PieTitleData {
  kind: 'pie-title'
  /** `title` 与标题之间的空白原文 */
  gap: string
  /** 标题文本（到 `%%` 注释起点，去尾空白）；改写时行尾注释不保留（与 journey 同口径） */
  text: string
}

/**
 * 扇区行数据。行形状：`indent? quote label quote gap1 ':' gap2 value tail`
 * - `label` 是引号内原文（含转义序列，逐字保留）；`quote` 是原引号字符（`"` 或 `'`），
 *   改写沿用原样
 * - `value` 是数值段原文（去外侧空白）；**负数/零原样保留**（结构树/表单标注，不静默改写）
 * - 行尾空白 / `%%` 注释记进 `tail`（改写时逐字回写）
 */
export interface PieSectorData {
  kind: 'pie-sector'
  quote: string
  label: string
  gap1: string
  gap2: string
  value: string
  tail: string
}

/** 扇区行原文重建。changes 任一字段缺省 = 逐字保留原文 */
export function renderPieSector(d: PieSectorData, changes: { label?: string; value?: string } = {}): string {
  const label = changes.label ?? d.label
  const value = changes.value ?? d.value
  return `${d.quote}${label}${d.quote}${d.gap1}:${d.gap2}${value}${d.tail}`
}

export type PieElementData = PieHeaderData | PieTitleData | PieSectorData

// ---------- 词法助手与校验 ----------

/**
 * 数值段词法（mermaid 12 NUMBER_PIE）：整数（无前导零）或带小数部分的小数
 * （负号合法——负数在 DB 层才报错，词法先放行才能被解析保留并标注）。
 */
const PIE_VALUE_RE = /^-?(?:[1-9][0-9]*|0|[0-9]+\.[0-9]+)$/

/** 数值段原文 → 数值：符合 NUMBER_PIE 词法时给出数值，否则 null */
export function parsePieValue(value: string): number | null {
  return PIE_VALUE_RE.test(value) ? Number(value) : null
}

/**
 * 数值是否合法（工单定案：>0）。负数是 mermaid 落码错误（pieDb.addSection 抛错）、
 * 零被渲染层静默过滤（filteredArcs 丢掉 0% 扇区）——两者都视为非法。
 * 表单校验与 resolveRewrites 落码门共用本函数（避免第二份实现）。
 */
export function isPieValuePositive(value: string): boolean {
  const n = parsePieValue(value)
  return n !== null && n > 0
}

/**
 * 标签合法性（表单/落码侧）：非空、不含引号（`"` / `'` 都拒——落码总在引号字面量内，
 * 含闭引号字符会提前终止字符串）、不含反斜杠（会转义闭引号，如 `a\` 落成 `"a\""`
 * 是 lexer 错误）、不含换行（单行语法）。
 */
export function isValidPieLabel(label: string): boolean {
  return label.trim() !== '' && !/["'\\\n]/.test(label)
}

/**
 * 标题合法性（表单/落码侧）：非空、不含换行与 `%%`（TITLE token 在 `%%` 处截断，
 * 落码含 `%%` 会被当注释切开标题）。
 */
export function isValidPieTitle(text: string): boolean {
  const trimmed = text.trim()
  return trimmed !== '' && !/\n/.test(trimmed) && !trimmed.includes('%%')
}

// ---------- 解析器 ----------

interface RawEntry {
  span: Span
  id: string
  data: PieElementData
}

const HEADER_RE = /^pie(?:[ \t]+(showData))?[ \t]*$/i
const TITLE_PREFIX = /^title[ \t]/
const ACC_PREFIX = /^acc(Title|Descr)\b/i

/** 引号内标签的闭引号位置（`\"` 等转义序列跳过）；无闭引号 -1 */
function findClosingQuote(line: string, quote: string): number {
  for (let i = 1; i < line.length; i++) {
    const ch = line[i]
    if (ch === '\\') {
      i++
      continue
    }
    if (ch === quote) return i
  }
  return -1
}

/**
 * 扇区行解析：`"label" gap1 : gap2 value tail`（或单引号形态）。
 * - label 是闭引号之前的引号内原文（转义序列逐字保留）
 * - 数值 token 与 mermaid 词法同款（负号放行、整数无前导零、小数必须带整数位）
 * - tail 只允许尾随空白 / `%%` 注释——数值后面跟别的 token（如 `5 abc`）在 mermaid
 *   是 lexer 错误，这里整行不认（逐字保留，结构树不出现幽灵扇区）
 * - 不合文法返回 null（整行原样保留）
 */
function parseSectorLine(line: string): PieSectorData | null {
  const quote = line[0]
  if (quote !== '"' && quote !== "'") return null
  const close = findClosingQuote(line, quote)
  if (close === -1) return null
  const label = line.slice(1, close)
  const colon = line.indexOf(':', close + 1)
  if (colon === -1) return null
  const gap1 = line.slice(close + 1, colon)
  if (/[^ \t]/.test(gap1)) return null
  const rest = line.slice(colon + 1)
  const valueMatch = /^[ \t]*(-?[0-9]+(?:\.[0-9]+)?)(.*)$/.exec(rest)
  if (valueMatch === null) return null
  const value = valueMatch[1]
  const tail = valueMatch[2]
  if (!/^[ \t]*(?:%%.*)?$/.test(tail)) return null
  const gap2 = rest.slice(0, rest.length - value.length - tail.length)
  return { kind: 'pie-sector', quote, label, gap1, gap2, value, tail }
}

export class PieParser implements DiagramParser {
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
    let sectorCount = 0
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

        if (!seenHeader) {
          const header = HEADER_RE.exec(trimmed)
          if (header === null) {
            throw parseFailure(lineNo, '图表必须以 pie 声明开始')
          }
          seenHeader = true
          const showData = header[1] !== undefined
          entries.push({
            span: spanOfLine(),
            id: 'pie-header',
            data: {
              kind: 'pie-header',
              // `pie` 与 `showData` 之间的空白原文（无 showData 时空串）
              gap: showData ? trimmed.slice('pie'.length, trimmed.length - header[1].length) : '',
              showData,
              trailing: line.slice(firstChar + trimmed.length),
            },
          })
        } else if (trimmed.startsWith('%%') || ACC_PREFIX.test(trimmed)) {
          // 注释 / 可访问性语句（含多行 accDescr {} 的花括号行，工单明确不做编辑）：逐字保留
        } else if (TITLE_PREFIX.test(trimmed)) {
          const rest = line.slice(firstChar + 'title'.length)
          const bodyEnd = (() => { const c = rest.indexOf('%%'); return c === -1 ? rest.length : c })()
          const raw = rest.slice(0, bodyEnd)
          const text = raw.trim()
          if (text !== '') {
            entries.push({
              span: spanOfLine(),
              id: 'pie-title',
              data: { kind: 'pie-title', gap: raw.slice(0, raw.length - raw.trimStart().length), text },
            })
          }
          // 空标题等清单外形态：不解析，逐字保留
        } else {
          const sector = parseSectorLine(line.slice(firstChar))
          if (sector !== null) {
            sectorCount++
            entries.push({
              span: spanOfLine(),
              id: `sector:${sectorCount}`,
              data: sector,
            })
          }
          // 清单外 / 无法识别（含裸 label 不带引号的扇区行）：不解析，逐字保留
        }
      }

      if (nl === -1) break
      cursor = nl + 1
    }

    if (!seenHeader) {
      throw parseFailure(1, '图表必须以 pie 声明开始')
    }
    return assembleDocument(source, entries)
  }

  // ---------- 意图落地（resolveRewrites） ----------

  resolveRewrites(doc: SourceDocument, intent: EditIntent): ReadonlyMap<string, string> | null {
    switch (intent.type) {
      case 'add-sector':
        return this.resolveAddSector(doc, intent as never)
      case 'set-sector-label':
        return this.resolveSetSectorLabel(doc, intent as never)
      case 'set-sector-value':
        return this.resolveSetSectorValue(doc, intent as never)
      case 'delete-sector':
        return this.resolveDeleteSector(doc, intent as never)
      case 'set-title':
        return this.resolveSetTitle(doc, intent as never)
      default:
        return null
    }
  }

  private sectorPart(doc: SourceDocument, elementId: string): ElementPart | null {
    const part = getElementById(doc, elementId)
    return part !== undefined && part.element.kind === 'pie-sector' ? part : null
  }

  /** 新增扇区：追加在锚点行之后（缺省 = 文档末尾）；label 与数值必须合法（绝不产出非法 mermaid） */
  private resolveAddSector(
    doc: SourceDocument,
    intent: Extract<PieIntent, { type: 'add-sector' }>,
  ): Map<string, string> | null {
    const label = intent.label.trim()
    const value = intent.value.trim()
    if (!isValidPieLabel(label) || !isPieValuePositive(value)) return null
    return insertAfter(doc, {
      afterElementId: intent.afterElementId,
      anchor: 'line-end',
      render: (indent) => `\n${indent}"${label}" : ${value}`,
    })
  }

  /** 改标签（菜单/表单共用）；引号 / 反斜杠 / 空白等非法输入拒绝（见 isValidPieLabel） */
  private resolveSetSectorLabel(
    doc: SourceDocument,
    intent: Extract<PieIntent, { type: 'set-sector-label' }>,
  ): Map<string, string> | null {
    const part = this.sectorPart(doc, intent.elementId)
    const label = intent.label.trim()
    if (part === null || !isValidPieLabel(label)) return null
    return new Map([[part.id, renderPieSector(part.element as PieSectorData, { label })]])
  }

  /** 改数值：仅 >0 的合法数值（表单强制；负数/零只能来自手写源码，改写必须落回合法值）。
   * 落码保留调用方给出的小数风格（`5` 落 `5` 而非 `5.00`，工单定案） */
  private resolveSetSectorValue(
    doc: SourceDocument,
    intent: Extract<PieIntent, { type: 'set-sector-value' }>,
  ): Map<string, string> | null {
    const part = this.sectorPart(doc, intent.elementId)
    const value = intent.value.trim()
    if (part === null || !isPieValuePositive(value)) return null
    return new Map([[part.id, renderPieSector(part.element as PieSectorData, { value })]])
  }

  private resolveDeleteSector(
    doc: SourceDocument,
    intent: Extract<PieIntent, { type: 'delete-sector' }>,
  ): Map<string, string> | null {
    const part = this.sectorPart(doc, intent.elementId)
    if (part === null) return null
    return new Map([[part.id, '']])
  }

  /** 设置图表标题（`title 文本`）：已有标题行则原地改；无则紧随声明头插入一行。
   * 空文本 / 含 `%%` 不落码（返回 null 由调用方放弃） */
  private resolveSetTitle(
    doc: SourceDocument,
    intent: Extract<PieIntent, { type: 'set-title' }>,
  ): Map<string, string> | null {
    const text = intent.text.trim()
    if (!isValidPieTitle(text)) return null
    const existing = doc.elements.find((p) => p.element.kind === 'pie-title')
    if (existing !== undefined) {
      return new Map([[existing.id, `title${(existing.element as PieTitleData).gap}${text}`]])
    }
    const header = doc.elements.find((p) => p.element.kind === 'pie-header')
    if (header === undefined) return null
    return insertAfter(doc, {
      afterElementId: header.id,
      anchor: 'self',
      render: (indent) => `\n${indent}title ${text}`,
    })
  }
}

export const pieParser = new PieParser()

// ---------- 编辑意图（工单 10 表单 / 画布所需集合） ----------

export type PieIntent =
  /** 新增扇区（label 合法标签；value 是数值原文，>0 校验在落码门做——小数风格随调用方）；
   * 锚点缺省 = 文档末尾 */
  | { type: 'add-sector'; label: string; value: string; afterElementId?: string }
  /** 改标签（elementId = `sector:N`）；引号/反斜杠等非法输入拒绝 */
  | { type: 'set-sector-label'; elementId: string; label: string }
  /** 改数值（value 是数值原文，须 >0；`5` 落 `5`、`42.96` 落 `42.96`——小数风格保留） */
  | { type: 'set-sector-value'; elementId: string; value: string }
  /** 删除扇区 */
  | { type: 'delete-sector'; elementId: string }
  /** 设置图表标题（`title 文本`）；无标题行时紧随声明头插入一行 */
  | { type: 'set-title'; text: string }
