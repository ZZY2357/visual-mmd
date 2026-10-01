import { assembleDocument, getElementById, type ElementPart, type SourceDocument } from './document'
import { frontmatterEnd } from './frontmatter'
import { insertAfter } from './insert'
import type { DiagramParser, EditIntent, ParseResult, SourceParseError } from './parser'
import type { Span } from './span'

/**
 * venn-beta（韦恩图）完整解析器（more-diagrams 工单 21，语法事实以
 * .scratch/more-diagrams/research/venn.md 为准——jison 图种，工单 21 已实测复核）：
 * 手写、逐行、带 span（ADR-0004）。可测试承诺：解析后不做修改再重组装，
 * 输出与输入逐字相同（verbatim identity）。
 *
 * 覆盖（research §2 分层对齐）：
 * - 声明头：**只有小写 `venn-beta`**（检测器 `/^\s*venn-beta/` 大小写敏感，无 `(-beta)?`
 *   分支；裸 `venn` 不被识别——research 坑 1）。
 * - `set <id>["<label>"]`：单个集合圆；label 可选。`set <id>...: <size>` 集合尺寸。
 * - `union <id>,<id>[,…]["<label>"]`：交集区；≥2 个 id，且 id 必须此前被 `set` 声明过
 *   （research 坑 2）。`union ...: <size>` 交集尺寸。
 * - `title <文本>`：文档级标题（引号不剥离，research 坑 6——解析保留原文）。
 * - `text <集合id列表> <文本id>["<label>"]`（顶层）与缩进 `text <文本id>["<label>"]`
 *   （挂到最近 set/union，research 坑 5/8）：文本节点。
 * - `style <target>[,<target>…] <field>:<value>[,…]`：元素级样式（targets 是 id 列表）。
 *
 * 不解析、原样保留（清单外语法不报错，ADR-0008）：frontmatter、`%%` 注释（行首与行内，
 * research §2 已实测两者都被词法吞掉）、空行、缩进空白、无法识别的行（交由 mermaid 报错）。
 *
 * 身份（工单 21 定案）：集合是**名字即身份**（`venn-set:<id>`，id 是内容键，mermaid DB
 * 是一张按 id 的 Map——重名 set 后者覆盖前者）；交集走**位置序身份**（`venn-union:N`，
 * 1 基文档序——`data-venn-sets` 键是 id 列表字典序拼接，重复 id 列表会同键冲突，
 * 位置序才是唯一稳定身份，research §4/§8）。
 *
 * span 约定（与 pie 同口径，行级）：行首缩进与换行留在 verbatim；元素 span 不跨行；
 * 行尾空白 / `%%` 注释归 tail 字段逐字保留（改写时回写）。
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

export interface VennHeaderData {
  kind: 'venn-header'
  /** 声明行尾原文（尾随空白），逐字保留 */
  trailing: string
}

export interface VennTitleData {
  kind: 'venn-title'
  /** `title` 与标题之间的空白原文 */
  gap: string
  /** 标题文本（到 `%%` 注释起点，去尾空白）；引号不剥离（research 坑 6） */
  text: string
  /** 行尾残留（含 `%%` 注释），逐字保留 */
  tail: string
}

/**
 * `set` / `union` 共用的区域行数据。行形状：
 * `indent? keyword wsRefs [":" wsSize size] tail`
 * - `refs` 是 id / id 列表原文（含逗号分隔的中间空白），改写时逐字搬运
 * - `label` 是 `["…"]` 内的原文；`labelRaw` 是 `["…"]` 整段原文（无 label 为 null）
 * - `size` 是数值段原文（去外侧空白）；无尺寸为 null
 */
export interface VennAreaData {
  kind: 'venn-set' | 'venn-union'
  /** 行首缩进原文（属元素 span 的一部分，改写时原样搬运） */
  indent: string
  /** id / id 列表原文（set 单 id；union 逗号分隔，含中间空白） */
  refs: string
  /** 关键字与 refs 之间的空白原文 */
  gap: string
  /** `["…"]` 整段原文；无 label 为 null */
  labelRaw: string | null
  /** label 与 `:` 之间的空白原文（无 label 或尺寸时为空串） */
  sizeGap: string
  /** 尺寸段原文（去外侧空白）；无尺寸为 null */
  size: string | null
  /** 行尾残留（含尾随空白 / `%%` 注释），逐字保留 */
  tail: string
}

export type VennElementData = VennHeaderData | VennTitleData | VennAreaData

/** 区域行原文重建。changes.label 给出时替换 `["…"]` 整段（引号由调用方给全） */
export function renderVennArea(
  d: VennAreaData,
  changes: { refs?: string; labelRaw?: string | null; size?: string | null } = {},
): string {
  const refs = changes.refs ?? d.refs
  const labelRaw = changes.labelRaw !== undefined ? changes.labelRaw : d.labelRaw
  const size = changes.size !== undefined ? changes.size : d.size
  const labelPart = labelRaw !== null ? labelRaw : ''
  const sizePart = size !== null ? `${d.sizeGap}: ${size}` : ''
  return `${d.indent}${d.kind === 'venn-set' ? 'set' : 'union'} ${d.gap}${refs}${labelPart}${sizePart}${d.tail}`
}

// ---------- 词法助手与校验 ----------

/** 裸 id 词法（mermaid jison `[A-Za-z_][A-Za-z0-9\-_]*`；引号串另走 `["…"]`） */
const BARE_ID_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/
/** 数值词法（mermaid NUMERIC = `[+-]?(\d+(\.\d+)?|\.\d+)`；**不支持千分位逗号**，research 坑 7） */
const NUMERIC_RE = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/

/** 集合 / 交集身份 id 合法性（表单/落码侧）：裸词 id 形态，非空、无引号空格 */
export function isValidVennSetId(id: string): boolean {
  return BARE_ID_RE.test(id)
}

/** 标签合法性（表单/落码侧）：非空、不含引号与换行（落码总在 `["…"]` 内，含闭引号会提前闭合） */
export function isValidVennLabel(label: string): boolean {
  return label.trim() !== '' && !/["'\n]/.test(label)
}

/** 尺寸合法性（表单/落码侧）：mermaid NUMERIC（不含千分位逗号） */
export function isValidVennSize(size: string): boolean {
  return NUMERIC_RE.test(size.trim())
}

// ---------- 行级解析 ----------

const HEADER_RE = /^venn-beta[ \t]*$/
const TITLE_PREFIX = /^title[ \t]/
/** `set` / `union` 行前缀（区分 set 与 union 关键字，后随空白） */
const SET_PREFIX = /^set[ \t]/
const UNION_PREFIX = /^union[ \t]/

/** 引号内标签的闭引号位置（`\"` 等转义序列跳过）；无闭引号 -1 */
function findClosingQuote(s: string, quote: string): number {
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '\\') {
      i++
      continue
    }
    if (ch === quote) return i
  }
  return -1
}

/**
 * 摘取 `["…"]` 段：从 `from` 起的空白后必须是 `[` `"` … `"` `]`，返回整段原文与后续位置。
 * 不合形态返回 null（整行不认，逐字保留）。
 */
function takeLabel(s: string, from: number): { labelRaw: string; after: number } | null {
  let i = from
  while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i++
  if (s[i] !== '[') return null
  const bracketStart = i
  i++
  if (s[i] !== '"') return null
  const close = findClosingQuote(s.slice(i + 1), '"')
  if (close === -1) return null
  i = i + 1 + close + 1 // 跳过开引号与闭引号
  if (s[i] !== ']') return null
  i++
  return { labelRaw: s.slice(bracketStart, i), after: i }
}

/**
 * 区域行解析（`set` / `union` 共用）：
 * `refs [labelRaw] [: size] tail`
 * - refs 是关键字后的 id / id 列表原文（到 label / `:` / 行尾之间的原文，去外侧空白）
 * - tail 只允许尾随空白 / `%%` 注释——尺寸后跟别的 token 整行不认（逐字保留）
 * - 尺寸非法（如 `set A:1,5` 千分位逗号）整行不认（research 坑 7 已实测 parse error）
 */
function parseAreaLine(body: string): Omit<VennAreaData, 'indent' | 'kind'> | null {
  // body 已去行首关键字与一个分隔空白（见调用方）
  const comment = body.indexOf('%%')
  const hardEnd = comment === -1 ? body.length : comment
  // refs 结束位置 = label `[` 或尺寸 `:` 或行尾（去外侧空白）
  let refsEnd = hardEnd
  for (let j = 0; j < hardEnd; j++) {
    if (body[j] === '[' || body[j] === ':') {
      refsEnd = j
      break
    }
  }
  const refsRaw = body.slice(0, refsEnd)
  const refs = refsRaw.trim()
  if (refs === '') return null
  const gap = refsRaw.slice(0, refsRaw.length - refsRaw.trimStart().length)
  let cursor = refsEnd
  let labelRaw: string | null = null
  if (body[cursor] === '[') {
    const taken = takeLabel(body, cursor)
    if (taken === null) return null
    labelRaw = taken.labelRaw
    cursor = taken.after
  }
  // 尺寸段：空白后 `:` 空白 数值（到行尾）
  let size: string | null = null
  let sizeGap = ''
  const rest = body.slice(cursor, hardEnd)
  const sizeMatch = /^([ \t]*):([ \t]*)([^ \t]+)[ \t]*$/.exec(rest)
  if (sizeMatch !== null) {
    const numeric = sizeMatch[3]
    if (!NUMERIC_RE.test(numeric)) return null // 尺寸非法整行不认
    size = numeric
    sizeGap = sizeMatch[1]
  } else if (rest.trim() !== '') {
    return null // 标签后跟别的内容（非尺寸）：整行不认
  }
  // tail = `%%` 注释起（若有）到行尾原文
  const tail = comment === -1 ? body.slice(hardEnd) : body.slice(comment)
  return { refs, gap, labelRaw, sizeGap, size, tail }
}

export class VennParser implements DiagramParser {
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
    let unionCount = 0
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
        const indent = line.slice(0, firstChar)
        const spanOfLine = (): Span => ({ start: cursor + firstChar, end: lineEndAbs })
        const body = line.slice(firstChar)

        if (!seenHeader) {
          if (!HEADER_RE.test(body)) {
            throw parseFailure(lineNo, '图表必须以 venn-beta 声明开始')
          }
          seenHeader = true
          entries.push({
            span: spanOfLine(),
            id: 'venn-header',
            data: { kind: 'venn-header', trailing: '' },
          })
        } else if (body.startsWith('%%')) {
          // 注释行：逐字保留
        } else if (TITLE_PREFIX.test(body)) {
          const rest = body.slice('title'.length)
          const comment = rest.indexOf('%%')
          const raw = comment === -1 ? rest : rest.slice(0, comment)
          const text = raw.trim()
          if (text !== '') {
            entries.push({
              span: spanOfLine(),
              id: 'venn-title',
              data: {
                kind: 'venn-title',
                gap: raw.slice(0, raw.length - raw.trimStart().length),
                text,
                tail: comment === -1 ? '' : rest.slice(comment),
              },
            })
          }
          // 空标题：不解析，逐字保留
        } else if (SET_PREFIX.test(body)) {
          // `set` 可顶格或缩进（research §2 模板即 2 空格缩进）；缩进量不影响语义，
          // 只区分顶层 / 缩进 text（本解析器不解析 text）
          const parsed = parseAreaLine(body.slice('set'.length + 1))
          if (parsed !== null) {
            entries.push({
              span: spanOfLine(),
              id: `venn-set:${parsed.refs.split(',')[0].trim()}`,
              data: { kind: 'venn-set', indent, ...parsed },
            })
          }
        } else if (UNION_PREFIX.test(body)) {
          const parsed = parseAreaLine(body.slice('union'.length + 1))
          if (parsed !== null) {
            unionCount++
            entries.push({
              span: spanOfLine(),
              id: `venn-union:${unionCount}`,
              data: { kind: 'venn-union', indent, ...parsed },
            })
          }
        }
        // 其余（`text` / `style` 行 / 无法识别的行）：不解析，逐字保留
        //（text 节点与单条 style 画布不可寻址——工单 21 定案两者降级，见 research §4/§8）
      }

      if (nl === -1) break
      cursor = nl + 1
    }

    if (!seenHeader) {
      throw parseFailure(1, '图表必须以 venn-beta 声明开始')
    }
    return assembleDocument(source, entries)
  }

  // ---------- 意图落地（resolveRewrites） ----------

  resolveRewrites(doc: SourceDocument, intent: EditIntent): ReadonlyMap<string, string> | null {
    switch (intent.type) {
      case 'set-label':
        return this.resolveSetLabel(doc, intent as Extract<VennIntent, { type: 'set-label' }>)
      case 'set-size':
        return this.resolveSetSize(doc, intent as Extract<VennIntent, { type: 'set-size' }>)
      case 'set-title':
        return this.resolveSetTitle(doc, intent as Extract<VennIntent, { type: 'set-title' }>)
      case 'add-set':
        return this.resolveAddSet(doc, intent as Extract<VennIntent, { type: 'add-set' }>)
      case 'add-union':
        return this.resolveAddUnion(doc, intent as Extract<VennIntent, { type: 'add-union' }>)
      case 'delete-area':
        return this.resolveDeleteArea(doc, intent as Extract<VennIntent, { type: 'delete-area' }>)
      default:
        return null
    }
  }

  private areaPart(doc: SourceDocument, elementId: string): ElementPart | null {
    const part = getElementById(doc, elementId)
    return part !== undefined && (part.element.kind === 'venn-set' || part.element.kind === 'venn-union')
      ? part
      : null
  }

  /** 改标签（`["…"]` 整段替换，引号由表单给全；label 为空串 = 删除标签段） */
  private resolveSetLabel(
    doc: SourceDocument,
    intent: Extract<VennIntent, { type: 'set-label' }>,
  ): Map<string, string> | null {
    const part = this.areaPart(doc, intent.elementId)
    if (part === null) return null
    const data = part.element as VennAreaData
    if (intent.label === null) {
      return new Map([[part.id, renderVennArea(data, { labelRaw: null })]])
    }
    if (!isValidVennLabel(intent.label)) return null
    // 保留原有引号风格（无 label 时缺省双引号）
    const quote = data.labelRaw !== null ? data.labelRaw[1] : '"'
    return new Map([[part.id, renderVennArea(data, { labelRaw: `[${quote}${intent.label}${quote}]` })]])
  }

  /** 改尺寸（size 为 null = 删除尺寸段）；非法尺寸拒绝落码 */
  private resolveSetSize(
    doc: SourceDocument,
    intent: Extract<VennIntent, { type: 'set-size' }>,
  ): Map<string, string> | null {
    const part = this.areaPart(doc, intent.elementId)
    if (part === null) return null
    if (intent.size !== null && !isValidVennSize(intent.size)) return null
    return new Map([[part.id, renderVennArea(part.element as VennAreaData, { size: intent.size })]] )
  }

  /** 设置图表标题（`title 文本`）：已有标题行则原地改，无则紧随声明头插入一行 */
  private resolveSetTitle(
    doc: SourceDocument,
    intent: Extract<VennIntent, { type: 'set-title' }>,
  ): Map<string, string> | null {
    const text = intent.text.trim()
    if (text === '' || /[\n]/.test(text) || text.includes('%%')) return null
    const existing = doc.elements.find((p) => p.element.kind === 'venn-title')
    if (existing !== undefined) {
      const data = existing.element as VennTitleData
      return new Map([[existing.id, `title${data.gap}${text}${data.tail}`]])
    }
    const header = doc.elements.find((p) => p.element.kind === 'venn-header')
    if (header === undefined) return null
    return insertAfter(doc, {
      afterElementId: header.id,
      anchor: 'self',
      render: (ind) => `\n${ind}title ${text}`,
    })
  }

  /** 新增集合：追加一行 `set <id>["<label>"]`（锚点缺省 = 文档末尾）；id 与标签必须合法 */
  private resolveAddSet(
    doc: SourceDocument,
    intent: Extract<VennIntent, { type: 'add-set' }>,
  ): Map<string, string> | null {
    const id = intent.id.trim()
    if (!isValidVennSetId(id)) return null
    if (intent.label !== undefined && !isValidVennLabel(intent.label)) return null
    const labelPart = intent.label !== undefined ? `["${intent.label}"]` : ''
    return insertAfter(doc, {
      afterElementId: intent.afterElementId,
      anchor: 'line-end',
      render: (ind) => `\n${ind}set ${id}${labelPart}`,
    })
  }

  /** 新增交集：追加一行 `union <id1>,<id2>[,"<label>"]`；≥2 个合法 id */
  private resolveAddUnion(
    doc: SourceDocument,
    intent: Extract<VennIntent, { type: 'add-union' }>,
  ): Map<string, string> | null {
    const ids = intent.ids.map((x) => x.trim()).filter((x) => x !== '')
    if (ids.length < 2 || !ids.every(isValidVennSetId)) return null
    if (intent.label !== undefined && !isValidVennLabel(intent.label)) return null
    const labelPart = intent.label !== undefined ? `["${intent.label}"]` : ''
    return insertAfter(doc, {
      afterElementId: intent.afterElementId,
      anchor: 'line-end',
      render: (ind) => `\n${ind}union ${ids.join(',')}${labelPart}`,
    })
  }

  /**
   * 删除区域：删一行。删**集合**时**级联删去引用它的交集**——union 的 id 必须此前被 set
   * 声明（research 坑 2：`validateUnionIdentifiers` 抛 `unknown set identifier`），留下
   * 悬空引用会让 mermaid 整图 parse 失败，故级联在本解析器内一次完成（工单 21 定案）。
   */
  private resolveDeleteArea(
    doc: SourceDocument,
    intent: Extract<VennIntent, { type: 'delete-area' }>,
  ): Map<string, string> | null {
    const part = this.areaPart(doc, intent.elementId)
    if (part === null) return null
    const rewrites = new Map<string, string>([[part.id, '']])
    if (part.element.kind === 'venn-set') {
      const deletedId = (part.element as VennAreaData).refs.split(',')[0].trim()
      for (const other of doc.elements) {
        if (other.element.kind !== 'venn-union') continue
        const ids = (other.element as VennAreaData).refs.split(',').map((x) => x.trim())
        if (ids.includes(deletedId)) rewrites.set(other.id, '')
      }
    }
    return rewrites
  }
}

interface RawEntry {
  span: Span
  id: string
  data: VennElementData
}

export const vennParser = new VennParser()

// ---------- 编辑意图（工单 21 表单 / 画布所需集合） ----------

export type VennIntent =
  /** 改标签（`["…"]`；label 为 null = 删除标签段）；引号/换行等非法输入拒绝 */
  | { type: 'set-label'; elementId: string; label: string | null }
  /** 改尺寸（`size` 为 null = 删除尺寸段；mermaid NUMERIC，无千分位逗号） */
  | { type: 'set-size'; elementId: string; size: string | null }
  /** 设置图表标题（`title 文本`）；无标题行时紧随声明头插入一行 */
  | { type: 'set-title'; text: string }
  /** 新增集合（`set <id>["<label>"]`）；锚点缺省 = 文档末尾 */
  | { type: 'add-set'; id: string; label?: string; afterElementId?: string }
  /** 新增交集（`union <id1>,<id2>…["<label>"]`；≥2 个合法 id） */
  | { type: 'add-union'; ids: string[]; label?: string; afterElementId?: string }
  /** 删除集合 / 交集行（elementId = `venn-set:<id>` / `venn-union:N`） */
  | { type: 'delete-area'; elementId: string }
