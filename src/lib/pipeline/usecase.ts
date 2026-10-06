import { assembleDocument, getElementById, type ElementPart, type SourceDocument } from './document'
import { frontmatterEnd } from './frontmatter'
import { insertAfter } from './insert'
import type { DiagramParser, EditIntent, ParseResult, SourceParseError } from './parser'
import type { Span } from './span'

/**
 * usecase-beta（用例图）完整解析器（more-diagrams 工单 26，语法事实以
 * .scratch/more-diagrams/research/usecase.md 为准——工单 26 已实测复核：
 * Langium 词法层 + 自绘渲染器，**DOM 可寻址**）。
 *
 * 手写、逐行、带 span（ADR-0004）。可测试承诺：解析后不做修改再重组装，输出与输入逐字相同
 * （verbatim identity）。
 *
 * 覆盖（research §2/§3）：
 * - 声明头：**只有 `usecase-beta`**（单 token，`mermaid.core.mjs:592-595` 检测器
 *   `/^\s*usecase-beta(?:\s|$)/`；词法 `Usecase = keyword("USECASE", /usecase-beta/)`。
 *   裸 `usecase` 不被识别——research 坑 1；journey-block-catalog.md 第 37 行写成 `usecase`
 *   是笔误）。同行可带 `direction`（TB|TD|BT|LR|RL）。
 * - actor 声明 `actor <id>["<标签>"]?`（id 即标签；圆括号为别名标签）。
 * - 用例声明：裸 `Login` / `Login("Sign in")`（椭圆）/ `Report[Generate report]`（矩形）。
 * - 系统边界 `systemBoundary <id>["<标题>"]?` … `end`（一层分组，两行 span 各算一个元素）。
 * - 关系行 `源 [边id@] <算子> [标签] 目标`（**唯一**连线语句；端点可先于声明出现）：
 *   7 种实心关联 `-->` `<--` `--` `--o` `o--` `--x` `x--`；语义 `..>`（include/extend）、
 *   `--|>`（generalization）。label 形态：裸词 / `"普通"` / `` "`Markdown`" ``。
 * - `note for <target> "<文本>"`：注释节点（+ 内部虚线连接边，internal，不作独立选中）。
 * - 文档级：`direction` / `accTitle:` / `accDescr: …`（含 `accDescr { … }` 多行块）。
 * - 边角（逐字保留，清单外不报错，ADR-0008）：`classDef` / `class` / `style` / `@{…}` 元数据 /
 *   `<<构造型>>` / `json <id>@{…}` / `%%` 注释 / 空行 / 缩进 / 额外横线（`--->` 请求更大 minlen）。
 *
 * 身份（研究定案，ADR-0012）：
 * - actor / 用例 / 边界 / json / note = **名字即身份**（`actor:<id>` / `usecase:<id>` /
 *   `boundary:<id>` / `json:<id>` / `note:<n>`）——mermaid 内部用一张共享命名空间的 DB
 *   （actor/用例/边界/json 标识符全图同一命名空间），引号声明无 id 时由渲染器推导确定性串
 *   （`"Reset password"` → `Reset_password`），本解析器照抄同一推导口径。
 * - 关系 = **位置序身份**（`relation:N`，1 基文档序——显式边 id 可省略/可重复，位置序是唯一
 *   稳定身份；mermaid 内部匿名 id `edge-${k}` 与位置序一一对应，research §4）。
 *
 * span 约定（与 venn 同口径，行级）：行首缩进与换行留在 verbatim；元素 span 不跨行；
 * 行尾空白 / `%%` 注释归 tail 字段逐字保留（改写时回写）。`systemBoundary…end` 是**跨行单位**：
 * 开行与 `end` 行各是一个元素（`boundary:<id>` 与 `boundary-end:<id>`），中间逐字保留。
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

export interface UsecaseHeaderData {
  kind: 'usecase-header'
  /** 声明行尾原文（含同行 `direction` 与尾随空白），逐字保留 */
  trailing: string
}

/** `actor <id>["<标签>"]?` 与用例声明共用（keyword 区分：`actor` / 空 keyword） */
export interface UsecaseNodeData {
  kind: 'usecase-actor' | 'usecase-usecase'
  /** 行首缩进原文（属元素 span，改写时原样搬运） */
  indent: string
  /** 源码标识符原文（引号形式为**推导出的** id，如 `Reset_password`） */
  id: string
  /** 圆括号 / 方括号整段原文；无标签为 null（`Login` 裸声明） */
  labelRaw: string | null
  /** 用例形状：椭圆（圆括号 / 裸）/ 矩形（方括号）；actor 恒 'ellipse' */
  shape: 'ellipse' | 'rect'
  /** 行尾残留（含 `@{…}` 元数据 / `<<构造型>>` / `%%` 注释 / 尾随空白），逐字保留 */
  tail: string
}

export interface UsecaseBoundaryData {
  kind: 'usecase-boundary'
  indent: string
  /** 边界标识符（可省——缺省按 `boundary-<序号>` 生成确定性 id） */
  id: string
  /** `["…"]` / `("…")` 整段原文；无标题为 null */
  labelRaw: string | null
  tail: string
}

export interface UsecaseBoundaryEndData {
  kind: 'usecase-boundary-end'
  indent: string
  /** 所闭合边界的标识符（与开行一致） */
  id: string
  tail: string
}

/** 关系行 `源 [边id@] 算子 [标签] 目标`；位置序身份 `relation:N` */
export interface UsecaseRelationData {
  kind: 'usecase-relation'
  indent: string
  /** 源端原文（标识符，改写时逐字搬运） */
  source: string
  /** 算子原文（`-->` / `..>` / `--|>` …，含 `[边id@]` 前缀与额外横线） */
  operator: string
  /** 标签整段原文（裸词 / `"…"` / `` "`…`" ``）；无标签为 null */
  labelRaw: string | null
  /** 目标端原文（含引号串形式） */
  target: string
  tail: string
}

/** `note for <target> "<文本>"`：注释节点 */
export interface UsecaseNoteData {
  kind: 'usecase-note'
  indent: string
  /** 所注释目标标识符原文 */
  target: string
  /** 文本整段原文（含引号） */
  textRaw: string
  tail: string
}

/** 文档级属性行（`direction` / `accTitle:` / `accDescr: …`） */
export interface UsecaseMetaData {
  kind: 'usecase-meta'
  indent: string
  /** 关键字原文（`direction` / `accTitle` / `accDescr`） */
  keyword: string
  /** 关键字与值之间的原文（含 `:` 与空白） */
  gap: string
  /** 值原文（去尾空白） */
  value: string
  tail: string
}

export type UsecaseElementData =
  | UsecaseHeaderData
  | UsecaseNodeData
  | UsecaseBoundaryData
  | UsecaseBoundaryEndData
  | UsecaseRelationData
  | UsecaseNoteData
  | UsecaseMetaData

// ---------- 词法助手与校验 ----------

/** 裸标识符词法（mermaid `[A-Za-z_][A-Za-z0-9_-]*`） */
const BARE_ID_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/

/**
 * 引号串推导 id 的口径（research §2：首引号声明无 id 时把非单词字符换 `_`）。
 * 与渲染器 `usecaseNodeDomId` 的推导一致——投影 / 反注都靠它对齐 DOM。
 */
export function deriveUsecaseId(label: string): string {
  return label.replace(/[^\w]/g, '_')
}

/** actor / 用例 id 合法性（表单/落码侧）：裸词形态 */
export function isValidUsecaseId(id: string): boolean {
  return BARE_ID_RE.test(id)
}

/** 标签合法性（表单/落码侧）：非空、不含引号与换行 */
export function isValidUsecaseLabel(label: string): boolean {
  return label.trim() !== '' && !/["'\n]/.test(label)
}

// ---------- 行级解析 ----------

const HEADER_RE = /^usecase-beta(?:[ \t]+(?:TB|TD|BT|LR|RL))?[ \t]*$/
const ACTOR_PREFIX = /^actor[ \t]/
const BOUNDARY_PREFIX = /^systemBoundary(?:[ \t]|$)/
const BOUNDARY_END_RE = /^end[ \t]*$/
const NOTE_PREFIX = /^note[ \t]+for[ \t]+/
/** 关系算子（含 `[边id@]` 前缀与额外横线由调用方剥离后判定） */
const OPERATOR_RE = /^(?:<--|-->|--o|o--|--x|x--|--\|>|\.\.>|--)(?:-*>?)?$/
/** 关系行的算子扫描正则：可选的 `id@` 前缀，再是算子主体 */
const RELATION_SCAN_RE =
  /^(?:(?<edgeid>[A-Za-z_][A-Za-z0-9_-]*)@)?(?<operator>(?:<--|-->|--o|o--|--x|x--|--\|>|\.\.>|--)(?:-*>?)?)/

const META_KEYWORDS = ['direction', 'accTitle', 'accDescr'] as const

/** 引号内闭引号位置（跳过 `\"` 转义）；无闭引号 -1 */
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
 * 摘取标签段：`(` / `[` 起，内层 `"…"` 或 `` `…` `` 或裸词，闭合 `)` / `]`。
 * 返回整段原文与后续位置；不合形态返回 null（整行不认，逐字保留）。
 */
function takeLabel(s: string, from: number): { labelRaw: string; after: number } | null {
  let i = from
  while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i++
  const open = s[i]
  if (open !== '(' && open !== '[') return null
  const close = open === '(' ? ')' : ']'
  const inner = s[i + 1]
  if (inner === '"' || inner === '`') {
    const quote = inner
    const rel = findClosingQuote(s.slice(i + 2), quote)
    if (rel === -1) return null
    i = i + 2 + rel + 1
    if (s[i] !== close) return null
    i++
    return { labelRaw: s.slice(from, i).trimStart(), after: i }
  }
  // 裸词标签
  const end = s.indexOf(close, i + 1)
  if (end === -1) return null
  return { labelRaw: s.slice(from, end + 1).trimStart(), after: end + 1 }
}

/**
 * 节点声明行解析（`actor` 与用例共用）：`<id>? [labelRaw] tail`（id 可省）。
 *
 * id 归属规则（对照 mermaid 实测 DB，research §2）：
 * - 有前导标识符 → **id = 前导标识符**，标签为别名（`actor Admin("Main administrator")`
 *   → id `Admin`）；标签段可有可无。
 * - 无前导标识符、只有引号 / 方括号标签 → **id = 标签推导串**（`"Reset password"`
 *   → `Reset_password`）；仅用例允许此形态（actor 必须带 id）。
 * 形状：圆括号 = 椭圆、方括号 = 矩形；actor 恒椭圆。
 */
function parseNodeLine(
  body: string,
  indent: string,
  kind: 'usecase-actor' | 'usecase-usecase',
): Omit<UsecaseNodeData, 'kind'> | null {
  const comment = body.indexOf('%%')
  const hardEnd = comment === -1 ? body.length : comment
  const hard = body.slice(0, hardEnd)
  let id: string
  let cursor: number
  let labelRaw: string | null = null
  let shape: 'ellipse' | 'rect' = 'ellipse'
  const idMatch = /^[A-Za-z_][A-Za-z0-9_-]*/.exec(hard)
  if (idMatch !== null) {
    // 前导标识符在 → 它就是 id；随后若还有标签段，仅作显示别名（不改 id）
    id = idMatch[0]
    cursor = id.length
    const taken = takeLabel(hard, cursor)
    if (taken !== null) {
      labelRaw = taken.labelRaw
      shape = labelRaw.startsWith('[') ? 'rect' : 'ellipse'
      cursor = taken.after
    }
  } else if (hard.startsWith('"') || hard.startsWith('`')) {
    // 无前导标识符的**裸引号声明**（仅用例）：id 由引号内文本推导（`"Reset password"` → `Reset_password`）
    const quote = hard[0]
    const rel = findClosingQuote(hard.slice(1), quote)
    if (rel === -1) return null
    labelRaw = hard.slice(0, rel + 2)
    const inner = labelRaw.slice(1, -1)
    if (inner === '') return null
    id = deriveUsecaseId(inner)
    cursor = labelRaw.length
  } else {
    // 无前导标识符：仅允许「括号标签推导 id」形态（首括号声明无 id 时把非单词字符换 `_`）
    const taken = takeLabel(hard, 0)
    if (taken === null) return null
    labelRaw = taken.labelRaw
    shape = labelRaw.startsWith('[') ? 'rect' : 'ellipse'
    const inner = labelRaw.replace(/^[([]\s*/, '').replace(/\s*[)\]]$/, '')
    const stripped = inner.replace(/^["`]|["`]$/g, '')
    if (stripped === '') return null
    id = deriveUsecaseId(stripped)
    cursor = taken.after
  }
  const tail = body.slice(cursor)
  // 尾段必须是空白 / `@{…}` / `<<…>>` / `%%` 注释（可交错、可多个）——含别的 token 整行不认（逐字保留）
  const rest = tail.slice(0, tail.indexOf('%%') === -1 ? tail.length : tail.indexOf('%%'))
  if (!/^[ \t]*(?:(?:@\{[\s\S]*\}|<<[^>]*>>)[ \t]*)*$/.test(rest)) return null
  return {
    indent,
    id,
    labelRaw,
    shape: kind === 'usecase-actor' ? 'ellipse' : shape,
    tail,
  }
}

/** 边界开行解析：`systemBoundary [id] [labelRaw] tail`（id 可省） */
function parseBoundaryLine(
  body: string,
  indent: string,
  ordinal: number,
): Omit<UsecaseBoundaryData, 'kind'> | null {
  const after = body.slice('systemBoundary'.length)
  const comment = after.indexOf('%%')
  const hard = comment === -1 ? after : after.slice(0, comment)
  const trimmed = hard.trim()
  let id = `boundary-${ordinal}`
  let labelRaw: string | null = null
  let tail = after.slice(hard.length)
  if (trimmed !== '') {
    const idMatch = /^[A-Za-z_][A-Za-z0-9_-]*/.exec(trimmed)
    if (idMatch === null) return null
    id = idMatch[0]
    const taken = takeLabel(hard, hard.indexOf(id) + id.length)
    if (taken !== null) {
      labelRaw = taken.labelRaw
      tail = after.slice(taken.after)
    } else {
      tail = after.slice(hard.indexOf(id) + id.length)
    }
  }
  return { indent, id, labelRaw, tail }
}

/** 关系行解析：`<source> [edgeid@] <operator> [label] <target>`（缺 `@` 时边 id 前缀不成立） */
function parseRelationLine(
  body: string,
): { source: string; operator: string; labelRaw: string | null; target: string; tail: string } | null {
  const comment = body.indexOf('%%')
  const hard = comment === -1 ? body : body.slice(0, comment)
  const tail = comment === -1 ? '' : body.slice(comment)
  const srcMatch = /^([A-Za-z_][A-Za-z0-9_-]*)[ \t]*/.exec(hard)
  if (srcMatch === null) return null
  const source = srcMatch[1]
  const scan = RELATION_SCAN_RE.exec(hard.slice(srcMatch[0].length))
  if (scan === null || scan.groups === undefined) return null
  const operator = scan[0]
  const cursor = srcMatch[0].length + operator.length
  // 已知算子校验（防止 `--` 吞掉 `--|>` / `..>`）
  if (!OPERATOR_RE.test(operator)) return null
  const rest = hard.slice(cursor)
  // 端词形态：裸标识符或引号串（引号串作目标时 mermaid 推导 id；这里原样保留端点）
  const END_POINT = '(?:`[^`]*`|"[^"]*"|[A-Za-z_][A-Za-z0-9_-]*)'
  // 目标端（无标签）：仅一个端点
  const targetQuoted = new RegExp(`^\\s*(${END_POINT})\\s*$`).exec(rest)
  if (targetQuoted !== null) {
    return { source, operator, labelRaw: null, target: targetQuoted[1], tail }
  }
  // 语义标签（research §43）：`: include` / `: extend` / `:include`——可选前导 `:`，
  // 标签在目标之前；也接受引号 / 裸词标签（`"starts"` / `starts`）
  const withColon = new RegExp(`^\\s*:\\s*(${END_POINT})\\s+(${END_POINT})\\s*$`).exec(rest)
  if (withColon !== null) {
    return { source, operator, labelRaw: withColon[1], target: withColon[2], tail }
  }
  const withLabel = new RegExp(`^\\s*(${END_POINT})\\s+(${END_POINT})\\s*$`).exec(rest)
  if (withLabel !== null) {
    return { source, operator, labelRaw: withLabel[1], target: withLabel[2], tail }
  }
  return null
}

/** `note for <target> "<文本>"` 解析 */
function parseNoteLine(body: string, indent: string): Omit<UsecaseNoteData, 'kind'> | null {
  const rest = body.slice('note for'.length)
  const comment = rest.indexOf('%%')
  const hard = comment === -1 ? rest : rest.slice(0, comment)
  const m = /^[ \t]+([A-Za-z_][A-Za-z0-9_-]*)[ \t]+(`[^`]*`|"[^"]*")[ \t]*$/.exec(hard)
  if (m === null) return null
  return { indent, target: m[1], textRaw: m[2], tail: comment === -1 ? '' : rest.slice(comment) }
}

/** 文档级属性行解析（`keyword [:] value tail`） */
function parseMetaLine(body: string, indent: string): Omit<UsecaseMetaData, 'kind'> | null {
  for (const keyword of META_KEYWORDS) {
    if (body === keyword || body.startsWith(`${keyword} `) || body.startsWith(`${keyword}:`)) {
      const after = body.slice(keyword.length)
      const comment = after.indexOf('%%')
      const hard = comment === -1 ? after : after.slice(0, comment)
      const m = /^([ \t]*:?[ \t]*)(.*)$/.exec(hard)
      if (m === null) return null
      const value = m[2].trim()
      if (keyword !== 'direction' && value === '') return null
      return {
        indent,
        keyword,
        gap: m[1],
        value,
        tail: comment === -1 ? '' : after.slice(comment),
      }
    }
  }
  return null
}

export class UsecaseParser implements DiagramParser {
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
    let relationCount = 0
    let noteCount = 0
    let boundaryCount = 0
    let seenHeader = false
    const openBoundaries: string[] = []
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
            throw parseFailure(lineNo, '图表必须以 usecase-beta 声明开始')
          }
          seenHeader = true
          entries.push({
            span: spanOfLine(),
            id: 'usecase-header',
            data: { kind: 'usecase-header', trailing: '' },
          })
        } else if (body.startsWith('%%')) {
          // 注释行：逐字保留
        } else if (BOUNDARY_END_RE.test(body)) {
          const id = openBoundaries.pop()
          if (id === undefined) {
            // 无匹配开行的 `end`：不解析，逐字保留（交由 mermaid 报错）
          } else {
            entries.push({
              span: spanOfLine(),
              id: `boundary-end:${id}`,
              data: { kind: 'usecase-boundary-end', indent, id, tail: '' },
            })
          }
        } else if (BOUNDARY_PREFIX.test(body)) {
          boundaryCount++
          const parsed = parseBoundaryLine(body, indent, boundaryCount)
          if (parsed !== null) {
            openBoundaries.push(parsed.id)
            entries.push({
              span: spanOfLine(),
              id: `boundary:${parsed.id}`,
              data: { kind: 'usecase-boundary', ...parsed },
            })
          }
        } else if (ACTOR_PREFIX.test(body)) {
          const parsed = parseNodeLine(body.slice('actor'.length + 1), indent, 'usecase-actor')
          if (parsed !== null) {
            entries.push({
              span: spanOfLine(),
              id: `actor:${parsed.id}`,
              data: { kind: 'usecase-actor', ...parsed },
            })
          }
        } else if (NOTE_PREFIX.test(body)) {
          const parsed = parseNoteLine(body, indent)
          if (parsed !== null) {
            noteCount++
            entries.push({
              span: spanOfLine(),
              id: `note:${noteCount}`,
              data: { kind: 'usecase-note', ...parsed },
            })
          }
        } else {
          const meta = parseMetaLine(body, indent)
          if (meta !== null) {
            entries.push({
              span: spanOfLine(),
              id: `usecase-meta:${meta.keyword}`,
              data: { kind: 'usecase-meta', ...meta },
            })
          } else {
            const relation = parseRelationLine(body)
            if (relation !== null) {
              relationCount++
              entries.push({
                span: spanOfLine(),
                id: `relation:${relationCount}`,
                data: { kind: 'usecase-relation', indent, ...relation },
              })
            } else {
              const node = parseNodeLine(body, indent, 'usecase-usecase')
              if (node !== null) {
                entries.push({
                  span: spanOfLine(),
                  id: `usecase:${node.id}`,
                  data: { kind: 'usecase-usecase', ...node },
                })
              }
              // 其余（classDef / class / style / `@{…}` 裸行 / 无法识别的行）：不解析，逐字保留
            }
          }
        }
      }

      if (nl === -1) break
      cursor = nl + 1
    }

    if (!seenHeader) {
      throw parseFailure(1, '图表必须以 usecase-beta 声明开始')
    }
    return assembleDocument(source, entries)
  }

  // ---------- 意图落地（resolveRewrites） ----------

  resolveRewrites(doc: SourceDocument, intent: EditIntent): ReadonlyMap<string, string> | null {
    switch (intent.type) {
      case 'set-usecase-label':
        return this.resolveSetLabel(doc, intent as Extract<UsecaseIntent, { type: 'set-usecase-label' }>)
      case 'add-usecase':
        return this.resolveAddUsecase(doc, intent as Extract<UsecaseIntent, { type: 'add-usecase' }>)
      case 'add-actor':
        return this.resolveAddActor(doc, intent as Extract<UsecaseIntent, { type: 'add-actor' }>)
      case 'add-boundary':
        return this.resolveAddBoundary(doc, intent as Extract<UsecaseIntent, { type: 'add-boundary' }>)
      case 'rename-usecase-id':
        return this.resolveRenameId(doc, intent as Extract<UsecaseIntent, { type: 'rename-usecase-id' }>)
      case 'set-usecase-title':
        return this.resolveSetTitle(doc, intent as Extract<UsecaseIntent, { type: 'set-usecase-title' }>)
      case 'delete-usecase-element':
        return this.resolveDeleteElement(doc, intent as Extract<UsecaseIntent, { type: 'delete-usecase-element' }>)
      case 'set-relation-label':
        return this.resolveSetRelationLabel(doc, intent as Extract<UsecaseIntent, { type: 'set-relation-label' }>)
      case 'delete-usecase-relation':
        return this.resolveDeleteRelation(doc, intent as Extract<UsecaseIntent, { type: 'delete-usecase-relation' }>)
      default:
        return null
    }
  }

  private nodePart(doc: SourceDocument, elementId: string): ElementPart | null {
    const part = getElementById(doc, elementId)
    if (part === undefined) return null
    const kind = part.element.kind
    return kind === 'usecase-actor' || kind === 'usecase-usecase' ? part : null
  }

  /**
   * 渲染节点行（**原地改写**）：不含缩进——元素 span 从首个非空字符起，缩进属前一段 verbatim
   * （见 document.spanOfLine 口径），若再前置 indent 会重复缩进。插入路径另用 render(ind)。
   */
  private renderNode(data: UsecaseNodeData, changes: { labelRaw?: string | null; id?: string } = {}): string {
    const id = changes.id ?? data.id
    const labelRaw = changes.labelRaw !== undefined ? changes.labelRaw : data.labelRaw
    const keyword = data.kind === 'usecase-actor' ? 'actor ' : ''
    return `${keyword}${id}${labelRaw ?? ''}${data.tail}`
  }

  /** 改标签（actor 圆括号 / 用例圆括号或方括号）；label 为 null = 删除标签段 */
  private resolveSetLabel(
    doc: SourceDocument,
    intent: Extract<UsecaseIntent, { type: 'set-usecase-label' }>,
  ): Map<string, string> | null {
    const part = this.nodePart(doc, intent.elementId)
    if (part === null) return null
    const data = part.element as UsecaseNodeData
    if (intent.label === null) {
      return new Map([[part.id, this.renderNode(data, { labelRaw: null })]])
    }
    if (!isValidUsecaseLabel(intent.label)) return null
    const open = data.shape === 'rect' ? '[' : '('
    const close = data.shape === 'rect' ? ']' : ')'
    return new Map([[part.id, this.renderNode(data, { labelRaw: `${open}"${intent.label}"${close}` })]])
  }

  /** 改标识符（改名会连带重写引用它的关系端点；名字即身份） */
  private resolveRenameId(
    doc: SourceDocument,
    intent: Extract<UsecaseIntent, { type: 'rename-usecase-id' }>,
  ): Map<string, string> | null {
    const part = this.nodePart(doc, intent.elementId)
    if (part === null) return null
    const oldId = (part.element as UsecaseNodeData).id
    const newId = intent.id.trim()
    if (!isValidUsecaseId(newId)) return null
    if (newId === oldId) return null
    const rewrites = new Map<string, string>([[part.id, this.renderNode(part.element as UsecaseNodeData, { id: newId })]])
    // 关系端点引用改写（源 / 目标为裸标识符时）
    for (const other of doc.elements) {
      if (other.element.kind !== 'usecase-relation') continue
      const rel = other.element as UsecaseRelationData
      const source = rel.source === oldId ? newId : rel.source
      const target = rel.target === oldId ? newId : rel.target
      if (source === rel.source && target === rel.target) continue
      rewrites.set(other.id, this.renderRelation({ ...rel, source, target }))
    }
    // note for 引用改写
    for (const other of doc.elements) {
      if (other.element.kind !== 'usecase-note') continue
      const note = other.element as UsecaseNoteData
      if (note.target === oldId) {
        rewrites.set(other.id, this.renderNote({ ...note, target: newId }))
      }
    }
    return rewrites
  }

  private renderRelation(data: UsecaseRelationData): string {
    return `${data.source} ${data.operator} ${data.labelRaw !== null ? `${data.labelRaw} ` : ''}${data.target}${data.tail}`
  }

  private renderNote(data: UsecaseNoteData): string {
    return `note for ${data.target} ${data.textRaw}${data.tail}`
  }

  /** 设置图表标题（`accTitle:`）：已有则原地改，无则紧随声明头插入一行 */
  private resolveSetTitle(
    doc: SourceDocument,
    intent: Extract<UsecaseIntent, { type: 'set-usecase-title' }>,
  ): Map<string, string> | null {
    const text = intent.text.trim()
    if (text === '' || /[\n]/.test(text) || text.includes('%%')) return null
    const existing = doc.elements.find(
      (p) => p.element.kind === 'usecase-meta' && (p.element as UsecaseMetaData).keyword === 'accTitle',
    )
    if (existing !== undefined) {
      const data = existing.element as UsecaseMetaData
      return new Map([[existing.id, `accTitle${data.gap}${text}${data.tail}`]])
    }
    const header = doc.elements.find((p) => p.element.kind === 'usecase-header')
    if (header === undefined) return null
    return insertAfter(doc, {
      afterElementId: header.id,
      anchor: 'self',
      render: (ind) => `\n${ind}accTitle: ${text}`,
    })
  }

  /**
   * 新增 actor（`actor <id>["<label>"]`）；锚点缺省 = 文档末尾。
   * 系统边界内只允许 actor/用例声明 —— 若锚点落在边界内，缺省追加会破坏语法边界，
   * 此处一律追加到**文档末尾**（顶层），保证语法安全（工单 26 定案）。
   */
  private resolveAddActor(
    doc: SourceDocument,
    intent: Extract<UsecaseIntent, { type: 'add-actor' }>,
  ): Map<string, string> | null {
    const id = intent.id.trim()
    if (!isValidUsecaseId(id)) return null
    if (intent.label !== undefined && !isValidUsecaseLabel(intent.label)) return null
    const labelPart = intent.label !== undefined ? `("${intent.label}")` : ''
    return insertAfter(doc, {
      anchor: 'line-end',
      render: (ind) => `\n${ind}actor ${id}${labelPart}`,
    })
  }

  /** 新增用例（`<id>("<label>")` 或 `<id>["<label>"]`）；矩形由 shape 指定 */
  private resolveAddUsecase(
    doc: SourceDocument,
    intent: Extract<UsecaseIntent, { type: 'add-usecase' }>,
  ): Map<string, string> | null {
    const id = intent.id.trim()
    if (!isValidUsecaseId(id)) return null
    if (intent.label !== undefined && !isValidUsecaseLabel(intent.label)) return null
    const open = intent.shape === 'rect' ? '[' : '('
    const close = intent.shape === 'rect' ? ']' : ')'
    const labelPart = intent.label !== undefined ? `${open}"${intent.label}"${close}` : ''
    return insertAfter(doc, {
      anchor: 'line-end',
      render: (ind) => `\n${ind}${id}${labelPart}`,
    })
  }

  /** 新增系统边界（`systemBoundary <id>["<标题>"]` … `end`，两行一次写入） */
  private resolveAddBoundary(
    doc: SourceDocument,
    intent: Extract<UsecaseIntent, { type: 'add-boundary' }>,
  ): Map<string, string> | null {
    const id = intent.id.trim()
    if (!isValidUsecaseId(id)) return null
    if (intent.label !== undefined && !isValidUsecaseLabel(intent.label)) return null
    const labelPart = intent.label !== undefined ? `["${intent.label}"]` : ''
    return insertAfter(doc, {
      anchor: 'line-end',
      render: (ind, original) => {
        const nl = /[\n\r]$/.test(original) ? '' : '\n'
        return `${nl}${ind}systemBoundary ${id}${labelPart}\n${ind}end`
      },
    })
  }

  /** 改关系标签（裸词 / `"…"` / `` "`…`" ``）；label 为 null = 删除标签段 */
  private resolveSetRelationLabel(
    doc: SourceDocument,
    intent: Extract<UsecaseIntent, { type: 'set-relation-label' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'usecase-relation') return null
    const data = part.element as UsecaseRelationData
    if (intent.label === null) {
      return new Map([[part.id, this.renderRelation({ ...data, labelRaw: null })]])
    }
    if (!isValidUsecaseLabel(intent.label)) return null
    return new Map([[part.id, this.renderRelation({ ...data, labelRaw: `"${intent.label}"` })]])
  }

  /**
   * 删除节点 / 边界 / 注释。节点删除时**级联删去引用它的关系与 note**（留下悬空引用
   * 会让 mermaid 静默创建椭圆用例，research 坑 11 —— 来源语义漂移，故级联在本解析器内一次完成）。
   * 删边界时级联删掉它的 `end` 行。
   */
  private resolveDeleteElement(
    doc: SourceDocument,
    intent: Extract<UsecaseIntent, { type: 'delete-usecase-element' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined) return null
    const kind = part.element.kind
    const rewrites = new Map<string, string>([[part.id, '']])
    if (kind === 'usecase-actor' || kind === 'usecase-usecase') {
      const id = (part.element as UsecaseNodeData).id
      for (const other of doc.elements) {
        if (other.element.kind === 'usecase-relation') {
          const rel = other.element as UsecaseRelationData
          if (rel.source === id || rel.target === id) rewrites.set(other.id, '')
        } else if (other.element.kind === 'usecase-note') {
          if ((other.element as UsecaseNoteData).target === id) rewrites.set(other.id, '')
        }
      }
    } else if (kind === 'usecase-boundary') {
      const id = (part.element as UsecaseBoundaryData).id
      const end = doc.elements.find(
        (p) => p.element.kind === 'usecase-boundary-end' && (p.element as UsecaseBoundaryEndData).id === id,
      )
      if (end !== undefined) rewrites.set(end.id, '')
    }
    return rewrites
  }

  /** 删除关系行 */
  private resolveDeleteRelation(
    doc: SourceDocument,
    intent: Extract<UsecaseIntent, { type: 'delete-usecase-relation' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'usecase-relation') return null
    return new Map([[part.id, '']])
  }
}

interface RawEntry {
  span: Span
  id: string
  data: UsecaseElementData
}

export const usecaseParser = new UsecaseParser()

// ---------- 编辑意图（工单 26 表单 / 画布所需集合） ----------

export type UsecaseIntent =
  /** 改标签（含形状保持）；label 为 null = 删除标签段 */
  | { type: 'set-usecase-label'; elementId: string; label: string | null }
  /** 改标识符（连带重写关系端点与 note 引用） */
  | { type: 'rename-usecase-id'; elementId: string; id: string }
  /** 新增 actor；锚点缺省 = 顶层文档末尾 */
  | { type: 'add-actor'; id: string; label?: string }
  /** 新增用例（shape 缺省 ellipse） */
  | { type: 'add-usecase'; id: string; label?: string; shape?: 'ellipse' | 'rect' }
  /** 新增系统边界（`systemBoundary … end` 两行） */
  | { type: 'add-boundary'; id: string; label?: string }
  /** 设置图表标题（`accTitle:`） */
  | { type: 'set-usecase-title'; text: string }
  /** 删除节点 / 边界 / 注释（节点级联删关系与 note；边界级联删 end） */
  | { type: 'delete-usecase-element'; elementId: string }
  /** 改关系标签；label 为 null = 删除标签段 */
  | { type: 'set-relation-label'; elementId: string; label: string | null }
  /** 删除关系行（elementId = `relation:N`） */
  | { type: 'delete-usecase-relation'; elementId: string }
