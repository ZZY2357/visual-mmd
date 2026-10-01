import { assembleDocument, getElementById, type SourceDocument } from './document'
import type { DiagramParser, EditIntent, ParseResult, SourceParseError } from './parser'
import { frontmatterEnd } from './frontmatter'
import type { Span } from './span'
import { insertAfter } from './insert'

/**
 * cynefin 完整解析器（more-diagrams 工单 25，语法事实以
 * .scratch/more-diagrams/research/cynefin.md 为准——Langium 图种，非 jison）：
 * 手写、逐行、带 span（ADR-0004）。可测试承诺：解析后不做修改再重组装，
 * 输出与输入逐字相同（verbatim identity）。
 *
 * 覆盖（research §2 核心）：
 * - 声明行：`cynefin-beta`（唯一关键字，**无裸名**；语法允许尾冒号变体 `cynefin-beta:`；
 *   检测与语法**均大小写敏感**——见 registry）
 * - 域名词行：五个固定域之一独占一行（`complex` / `complicated` / `chaotic` / `clear` /
 *   `confusion`），可缩进——该行是**分组声明语句**（可寻址，作为新增条目/转移的插入锚点）
 * - 条目行：域名词行下方的**引号字符串**行（`DomainItem = label: STRING`，双/单引号皆可）；
 *   **必须加引号**（research 坑 1）；归属**纯由位置决定**——紧跟在最近一个前序域名词行下方
 *   的条目归该域（research §8.2：**没有 `in domain` 类锚点语法**，工单假设已更正）
 * - 转移行：`域A --> 域B (":" "标签")?`，单行、顶层；`from`/`to` 只能是域名词
 *   （不能是任意标签/条目，research 坑 6）；位置序身份 `cynefin-transition:N`（ADR-0012）
 * - 文档级：`title` / `accTitle:` / `accDescr:` —— 整行可寻址（表单/删除），逐字保留
 *
 * 不解析、原样保留（清单外语法不报错，ADR-0008）：frontmatter（隐藏 YAML）、
 * `%%` 注释与 `%%{init}%%` 指令（隐藏 DIRECTIVE）、空行、一切识别不了的行。
 *
 * 暂不建模、逐字保留（不做 + 理由见工单交付清单）：重复域名词块（mermaid DB 层后者整体
 * 覆盖前者，research 坑 4——本解析器按位置如实解析出两个同域块，不做合并/报错）。
 */

interface ParseFailure extends Error {
  line: number
}

function parseFailure(line: number, message: string): ParseFailure {
  const error = new Error(message) as ParseFailure
  error.line = line
  return error
}

// ---------- 固定域（硬编码关键字，research §2/§3） ----------

/** 五个固定域关键字（文案域名词，顺序无关；画布位置固定） */
export const CYNEFIN_DOMAINS = ['complex', 'complicated', 'chaotic', 'clear', 'confusion'] as const

export type CynefinDomainName = (typeof CYNEFIN_DOMAINS)[number]

const DOMAIN_SET: ReadonlySet<string> = new Set(CYNEFIN_DOMAINS)

export function isCynefinDomain(name: string): name is CynefinDomainName {
  return DOMAIN_SET.has(name)
}

// ---------- 元素数据 ----------

export interface CynefinHeaderData {
  kind: 'cynefin-header'
  /** 原文关键字（`cynefin-beta` 或 `cynefin-beta:`，保留用户书写） */
  keyword: string
  trailing: string
}

/** 域名词行：五个固定域之一独占一行（分组声明语句，可寻址） */
export interface CynefinDomainData {
  kind: 'cynefin-domain'
  /** 行首缩进原文（span 的一部分，改写相邻行时原样搬运） */
  indent: string
  /** 域名词（五个之一） */
  domain: CynefinDomainName
  /** 行尾残留空白 */
  trailing: string
  /** 换行符（文档最后一行可能为空串） */
  eol: string
}

/** 条目行：域名词行下方的引号字符串（归属由「最近前序域名词行」决定） */
export interface CynefinItemData {
  kind: 'cynefin-item'
  /** 行首缩进原文（span 的一部分） */
  indent: string
  /** 引号原文（`"` / `'`） */
  quote: string
  /** 去引号后的文本 */
  text: string
  /** 引号之后到行尾（含残留空白） */
  trailing: string
  /** 换行符 */
  eol: string
  /** 归属域（最近一个前序域名词行；research §8.2——归属纯由位置决定） */
  domain: CynefinDomainName
}

/** 转移行：`域A --> 域B (":" "标签")?`（位置序身份 `cynefin-transition:N`） */
export interface CynefinTransitionData {
  kind: 'cynefin-transition'
  indent: string
  from: CynefinDomainName
  /** from 与箭头之间的空白 */
  arrowLead: string
  /** 箭头原文（`-->`） */
  arrow: string
  /** 箭头与 to 之间的空白 */
  arrowAfter: string
  to: CynefinDomainName
  /** ` --> to` 与标签之间（含 `:` 前空白） */
  labelLead: string
  /** 冒号原文（`:`；无标签时为空串） */
  colon: string
  /** 冒号与标签之间空白 */
  labelSpace: string
  /** 标签引号原文（无标签时为空串） */
  labelQuote: string
  /** 去引号后的标签（无标签时为空串） */
  label: string
  /** 标签之后到行尾 */
  trailing: string
  eol: string
}

/** 文档级属性行（`title` / `accTitle:` / `accDescr:`；整行可寻址、可删除） */
export interface CynefinDocLineData {
  kind: 'cynefin-doc'
  docKind: 'title' | 'accTitle' | 'accDescr'
  /** 原行文本（不含 eol） */
  text: string
  eol: string
}

export type CynefinElementData =
  | CynefinHeaderData
  | CynefinDomainData
  | CynefinItemData
  | CynefinTransitionData
  | CynefinDocLineData

// ---------- 渲染 ----------

/** 渲染域名词行（域名词行本身不改名——五域固定；仅供整行重建时使用） */
export function renderCynefinDomain(d: CynefinDomainData): string {
  return d.indent + d.domain + d.trailing + d.eol
}

/** 渲染条目行（改文本后；保留原缩进、引号风格、残留空白与 eol） */
export function renderCynefinItem(d: CynefinItemData, changes: { text?: string } = {}): string {
  const text = changes.text !== undefined ? changes.text : d.text
  return d.indent + d.quote + text + d.quote + d.trailing + d.eol
}

/** 渲染转移行（改 from/to/标签后；各部分原文逐字保留） */
export function renderCynefinTransition(
  d: CynefinTransitionData,
  changes: { from?: string; to?: string; label?: string } = {},
): string {
  const from = changes.from !== undefined ? changes.from : d.from
  const to = changes.to !== undefined ? changes.to : d.to
  let labelPart = ''
  if (changes.label !== undefined) {
    // 改标签：保留原冒号/引号风格；原无标签则补 ` : "标签"`
    const quote = d.labelQuote !== '' ? d.labelQuote : '"'
    labelPart = (d.colon !== '' ? d.labelLead + d.colon + d.labelSpace : ' : ') + quote + changes.label + quote
  } else if (d.colon !== '') {
    labelPart = d.labelLead + d.colon + d.labelSpace + d.labelQuote + d.label + d.labelQuote
  }
  return d.indent + from + d.arrowLead + d.arrow + d.arrowAfter + to + labelPart + d.trailing + d.eol
}

// ---------- 渲染（新建行） ----------

/** 条目文本校验（表单层复用）：非空、单行、不含引号与换行（引号会破坏字符串语法） */
export function isValidCynefinItemText(text: string): boolean {
  return text !== '' && !/["'\r\n]/.test(text)
}

/** 转移标签校验：空串（清除标签）或非空且单行、不含引号与换行 */
export function isValidCynefinLabel(label: string): boolean {
  return label === '' || !/["'\r\n]/.test(label)
}

// ---------- 编辑意图 ----------

export type CynefinIntent =
  /** 改条目文本（保留缩进与引号风格） */
  | { type: 'set-item-text'; elementId: string; text: string }
  /** 在某域下加条目（afterElementId 为域名词行或该域既有条目行的解析期 id；缺省落文档末尾） */
  | { type: 'add-item'; domain: CynefinDomainName; text: string; afterElementId?: string }
  /** 删除条目行 */
  | { type: 'delete-item'; elementId: string }
  /** 加转移（from/to 为域名词） */
  | { type: 'add-transition'; from: CynefinDomainName; to: CynefinDomainName; label?: string; afterElementId?: string }
  /** 改转移端点 / 标签 */
  | { type: 'set-transition'; elementId: string; from?: CynefinDomainName; to?: CynefinDomainName; label?: string }
  /** 删除转移行 */
  | { type: 'delete-transition'; elementId: string }
  /** 删除一条文档级属性行 */
  | { type: 'delete-doc-line'; elementId: string }

// ---------- 行级解析 ----------

const HEADER_RE = /^([ \t]*)(cynefin-beta:?)([ \t\r]*)$/
const DOMAIN_LINE_RE = /^([ \t]*)([A-Za-z]+)([ \t\r]*)$/
const DOC_KINDS: ReadonlyArray<{ kind: CynefinDocLineData['docKind']; re: RegExp }> = [
  { kind: 'title', re: /^[ \t]*title\b/ },
  { kind: 'accTitle', re: /^[ \t]*accTitle[ \t]*:/ },
  { kind: 'accDescr', re: /^[ \t]*accDescr[ \t]*:/ },
]

/** 解析一行引号字符串条目：`[缩进]"文本"[残留]`；非引号行返回 null */
function parseItemLine(
  line: string,
  eol: string,
  domain: CynefinDomainName,
): CynefinItemData | null {
  const m = /^([ \t]*)(["'])(.*)$/.exec(line)
  if (m === null) return null
  const quote = m[2]
  const closeIdx = m[3].indexOf(quote)
  if (closeIdx === -1) return null // 引号未闭合：不是可寻址条目行（逐字保留）
  const text = m[3].slice(0, closeIdx)
  const trailing = m[3].slice(closeIdx + 1)
  // 引号后只允许残留空白
  if (/[^ \t\r]/.test(trailing)) return null
  return { kind: 'cynefin-item', indent: m[1], quote, text, trailing, eol, domain }
}

/** 解析转移行：`域A --> 域B (":" "标签")?`；端点非域名词返回 null */
function parseTransitionLine(
  indent: string,
  body: string,
  eol: string,
): CynefinTransitionData | null {
  const m = /^([A-Za-z]+)([ \t]*)(-->)([ \t]*)([A-Za-z]+)(.*)$/.exec(body)
  if (m === null) return null
  const from = m[1]
  const to = m[5]
  if (!isCynefinDomain(from) || !isCynefinDomain(to)) return null
  const rest = m[6]
  // 无标签：rest 只允许空白
  if (rest.trim() === '') {
    return {
      kind: 'cynefin-transition',
      indent,
      from,
      arrowLead: m[2],
      arrow: m[3],
      arrowAfter: m[4],
      to,
      labelLead: rest,
      colon: '',
      labelSpace: '',
      labelQuote: '',
      label: '',
      trailing: '',
      eol,
    }
  }
  // 带标签：`[空白]:[空白]"标签"[残留]`
  const lm = /^([ \t]*)(:)([ \t]*)(["'])(.*)$/.exec(rest)
  if (lm === null) return null
  const labelQuote = lm[4]
  const closeIdx = lm[5].indexOf(labelQuote)
  if (closeIdx === -1) return null
  const label = lm[5].slice(0, closeIdx)
  const trailing = lm[5].slice(closeIdx + 1)
  if (/[^ \t\r]/.test(trailing)) return null
  return {
    kind: 'cynefin-transition',
    indent,
    from,
    arrowLead: m[2],
    arrow: m[3],
    arrowAfter: m[4],
    to,
    labelLead: lm[1],
    colon: lm[2],
    labelSpace: lm[3],
    labelQuote,
    label,
    trailing,
    eol,
  }
}

interface RawEntry {
  span: Span
  id: string
  data: CynefinElementData
}

export class CynefinParser implements DiagramParser {
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
    let itemCount = 0
    let transitionCount = 0
    let docCount = 0
    let seenHeader = false
    /** 当前归属域（最近一个前序域名词行）；条目归属纯由位置决定（research §8.2） */
    let currentDomain: CynefinDomainName | null = null
    const bodyStart = frontmatterEnd(source)
    let lineNo = bodyStart === 0 ? 0 : source.slice(0, bodyStart).split('\n').length - 1
    let cursor = bodyStart

    for (;;) {
      const nl = source.indexOf('\n', cursor)
      const lineEnd = nl === -1 ? source.length : nl
      const line = source.slice(cursor, lineEnd)
      const eol = nl === -1 ? '' : '\n'
      lineNo++
      const trimmed = line.trim()
      const span: Span = { start: cursor, end: cursor + line.length + eol.length }

      if (trimmed !== '') {
        const headerMatch = HEADER_RE.exec(line)
        if (headerMatch !== null) {
          seenHeader = true
          entries.push({
            span,
            id: 'header',
            data: {
              kind: 'cynefin-header',
              keyword: headerMatch[2],
              trailing: (headerMatch[3] ?? '').replace(/\r$/, ''),
            },
          })
        } else if (trimmed.startsWith('%%')) {
          // 注释行（含 %%{init}%% 指令）：逐字保留
        } else if (seenHeader) {
          const body = line.replace(/\r$/, '')
          // 文档级属性行（优先于域名词行：`title` 不是域名词，但 `accTitle:` 等含冒号）
          const docKind = DOC_KINDS.find((d) => d.re.test(body))
          if (docKind !== undefined) {
            docCount++
            entries.push({
              span,
              id: `cynefin-doc:${docCount}`,
              data: { kind: 'cynefin-doc', docKind: docKind.kind, text: body, eol },
            })
          } else {
            // 域名词行（五固定域独占一行）——命中则更新归属域
            const domainMatch = DOMAIN_LINE_RE.exec(body)
            if (domainMatch !== null && isCynefinDomain(domainMatch[2])) {
              currentDomain = domainMatch[2]
              entries.push({
                span,
                id: `cynefin-domain:${currentDomain}`,
                data: {
                  kind: 'cynefin-domain',
                  indent: domainMatch[1],
                  domain: currentDomain,
                  trailing: (domainMatch[3] ?? '').replace(/\r$/, ''),
                  eol,
                },
              })
            } else {
              // 条目行（须引号 + 有归属域）
              const item = currentDomain !== null ? parseItemLine(body, eol, currentDomain) : null
              if (item !== null) {
                itemCount++
                entries.push({ span, id: `cynefin-item:${itemCount}`, data: item })
              } else {
                // 转移行（顶层单行；from/to 须域名词）
                const indent = /^[ \t]*/.exec(body)?.[0] ?? ''
                const transition = parseTransitionLine(indent, body.replace(/^[ \t]+/, ''), eol)
                if (transition !== null) {
                  transitionCount++
                  entries.push({ span, id: `cynefin-transition:${transitionCount}`, data: transition })
                }
                // 其余（识别不了的行）逐字保留
              }
            }
          }
        }
        // header 之前的非注释行：不解析，逐字保留
      }

      if (nl === -1) break
      cursor = nl + 1
    }

    if (!seenHeader) {
      throw parseFailure(1, '图表必须以 cynefin-beta 声明开始')
    }
    return assembleDocument(source, entries)
  }

  // ---------- 意图落地（resolveRewrites） ----------

  resolveRewrites(doc: SourceDocument, intent: EditIntent): ReadonlyMap<string, string> | null {
    switch (intent.type) {
      case 'set-item-text':
        return this.resolveSetItemText(doc, intent as Extract<CynefinIntent, { type: 'set-item-text' }>)
      case 'add-item':
        return this.resolveAddItem(doc, intent as Extract<CynefinIntent, { type: 'add-item' }>)
      case 'delete-item':
        return this.removeLine(doc, intent.elementId as string, 'cynefin-item')
      case 'add-transition':
        return this.resolveAddTransition(doc, intent as Extract<CynefinIntent, { type: 'add-transition' }>)
      case 'set-transition':
        return this.resolveSetTransition(doc, intent as Extract<CynefinIntent, { type: 'set-transition' }>)
      case 'delete-transition':
        return this.removeLine(doc, intent.elementId as string, 'cynefin-transition')
      case 'delete-doc-line':
        return this.removeLine(doc, intent.elementId as string, 'cynefin-doc')
      default:
        return null
    }
  }

  private partOf(doc: SourceDocument, elementId: string, kind: CynefinElementData['kind']) {
    const part = getElementById(doc, elementId)
    if (part === undefined || part.element.kind !== kind) return null
    return part
  }

  /** 通用单行移除：把该元素的 span 清空（逐字保留其余） */
  private removeLine(
    doc: SourceDocument,
    elementId: string,
    kind: CynefinElementData['kind'],
  ): Map<string, string> | null {
    const part = this.partOf(doc, elementId, kind)
    return part === null ? null : new Map([[part.id, '']])
  }

  private resolveSetItemText(
    doc: SourceDocument,
    intent: Extract<CynefinIntent, { type: 'set-item-text' }>,
  ): Map<string, string> | null {
    const part = this.partOf(doc, intent.elementId, 'cynefin-item')
    if (part === null || !isValidCynefinItemText(intent.text)) return null
    return new Map([[part.id, renderCynefinItem(part.element as CynefinItemData, { text: intent.text })]])
  }

  /** 在某域下加条目：落在该域既有条目之后（无则紧跟域名词行），缩进跟随域名词行 */
  private resolveAddItem(
    doc: SourceDocument,
    intent: Extract<CynefinIntent, { type: 'add-item' }>,
  ): Map<string, string> | null {
    if (!isValidCynefinItemText(intent.text)) return null
    if (!isCynefinDomain(intent.domain)) return null
    const line = `"${intent.text}"\n`
    return insertAfter(doc, {
      afterElementId: intent.afterElementId,
      render: (_indent, original) => (/[\n\r]$/.test(original) ? '' : '\n') + '  ' + line,
    })
  }

  private resolveAddTransition(
    doc: SourceDocument,
    intent: Extract<CynefinIntent, { type: 'add-transition' }>,
  ): Map<string, string> | null {
    if (!isCynefinDomain(intent.from) || !isCynefinDomain(intent.to)) return null
    if (intent.label !== undefined && !isValidCynefinLabel(intent.label)) return null
    const labelPart = intent.label !== undefined && intent.label !== '' ? ` : "${intent.label}"` : ''
    const line = `${intent.from} --> ${intent.to}${labelPart}\n`
    return insertAfter(doc, {
      afterElementId: intent.afterElementId,
      render: (_indent, original) => (/[\n\r]$/.test(original) ? '' : '\n') + line,
    })
  }

  private resolveSetTransition(
    doc: SourceDocument,
    intent: Extract<CynefinIntent, { type: 'set-transition' }>,
  ): Map<string, string> | null {
    const part = this.partOf(doc, intent.elementId, 'cynefin-transition')
    if (part === null) return null
    if (intent.from !== undefined && !isCynefinDomain(intent.from)) return null
    if (intent.to !== undefined && !isCynefinDomain(intent.to)) return null
    if (intent.label !== undefined && !isValidCynefinLabel(intent.label)) return null
    if (intent.from === undefined && intent.to === undefined && intent.label === undefined) return null
    // 自环转移（from === to）被 mermaid DB 层静默丢弃（research 坑 5）——拒绝落码
    const nextFrom = intent.from ?? (part.element as CynefinTransitionData).from
    const nextTo = intent.to ?? (part.element as CynefinTransitionData).to
    if (nextFrom === nextTo) return null
    return new Map([
      [
        part.id,
        renderCynefinTransition(part.element as CynefinTransitionData, {
          from: intent.from,
          to: intent.to,
          label: intent.label,
        }),
      ],
    ])
  }
}

export const cynefinParser = new CynefinParser()
