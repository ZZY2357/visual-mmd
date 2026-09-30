import { assembleDocument, getElementById, type SourceDocument } from './document'
import type { DiagramParser, EditIntent, ParseResult, SourceParseError } from './parser'
import { frontmatterEnd } from './frontmatter'
import {
  requirementBlockElementId,
  requirementElemBlockElementId,
  requirementFieldElementId,
} from './element-id'
import type { Span } from './span'
import { indentLines, insertAfter, resolveAnchor } from './insert'

/**
 * requirementDiagram 完整解析器（more-diagrams 工单 07，语法事实以
 * spec 的 research/timeline-kanban-requirement.md requirementDiagram 部分为准，
 * 并已用 mermaid 12.0.0 的 `mermaid.parse` 逐条实测复核——见工单 Comments）。
 * 手写、逐行、带 span（ADR-0004）。可测试承诺：解析后不做修改再重组装，
 * 输出与输入逐字相同（verbatim identity）。
 *
 * 覆盖（分层对齐，spec 决策）：
 * - requirement 块：`<type> <name> {`（6 种 type，大小写不敏感匹配、原文逐字保留）
 *   + `id` / `text` / `risk` / `verifymethod` 字段行 + `}`
 * - element 块：`element <name> {` + `type` / `docref` 字段行 + `}`
 * - 关系全家族：7 种 kind（contains / copies / derives / satisfies / verifies /
 *   refines / traces）的正向 `{src} - kind -> {dst}` 与反向 `{dst} <- kind - {src}`
 *   两种书写方向（反向解析后归一为正向语义，落码保留原书写方向）
 * - `direction`（图表级）、`:::` 样式简写（随块声明行逐字保留）
 *
 * 不解析、原样保留（清单外语法不报错，ADR-0008）：`style` / `classDef` / `class`
 * 样式语句、`title` / `accTitle` / `accDescr`、frontmatter、`%%` 注释、块内清单外字段、
 * 无法识别的行。注：`doc` / `author` / `creationDate` 在 v12 的 requirementDiagram 里
 * **不存在**（lexer 关键字只有 id/text/risk/verifyMethod/type/docref）——本票不为它们建规则。
 *
 * 坑（勘察第 1 条，实测复核）：**未加引号的字段值里出现 `-` `=` `,` `:` `<` `>` `{`
 * 或关键字词，解析直接失败**；引号内则任意（markdown 也生效）。故本模块把「引号形态」
 * 作为字段的结构化事实存下来（`quoted`），编辑值变化时保持原形态，原本无引号的取值若
 * 编辑后不再能安全裸写，则**自动加引号**（`isSafelyUnquotedRequirementValue`）——
 * 守「源码始终是合法 mermaid」。
 *
 * span 约定（与 state / er 解析器同口径）：元素 span 从该行首个非空白字符起、到行尾
 * （不含换行）；行首缩进与换行留在 verbatim。块整体 = 声明行 + 各行字段 + `}` 行
 * （各自 span，删除块时按区间级联清理）。
 */

interface ParseFailure extends Error {
  line: number
}

function parseFailure(line: number, message: string): ParseFailure {
  const error = new Error(message) as ParseFailure
  error.line = line
  return error
}

// ---------- 枚举（表单零自由文本的唯一来源） ----------

/** requirement 块的 6 种 type（SysML 定义，研究结论） */
export const REQUIREMENT_TYPES = [
  'requirement',
  'functionalRequirement',
  'interfaceRequirement',
  'performanceRequirement',
  'physicalRequirement',
  'designConstraint',
] as const
export type RequirementType = (typeof REQUIREMENT_TYPES)[number]

/** risk 枚举 */
export const REQUIREMENT_RISKS = ['Low', 'Medium', 'High'] as const
export type RequirementRisk = (typeof REQUIREMENT_RISKS)[number]

/** verifymethod 枚举 */
export const REQUIREMENT_VERIFY_METHODS = ['Analysis', 'Inspection', 'Test', 'Demonstration'] as const
export type RequirementVerifyMethod = (typeof REQUIREMENT_VERIFY_METHODS)[number]

/** 关系 kind（7 种，图上渲染为标签） */
export const REQUIREMENT_RELATION_KINDS = [
  'contains',
  'copies',
  'derives',
  'satisfies',
  'verifies',
  'refines',
  'traces',
] as const
export type RequirementRelationKind = (typeof REQUIREMENT_RELATION_KINDS)[number]

/** 图表方向（与其余图种同表） */
export const REQUIREMENT_DIRECTIONS = ['TB', 'BT', 'LR', 'RL'] as const

/** 字段种类：requirement 块四字段 + element 块两字段 */
export type RequirementFieldKind = 'id' | 'text' | 'risk' | 'verifymethod' | 'type' | 'docref'

/** requirement 块可写的字段（顺序即表单展示顺序） */
export const REQUIREMENT_FIELDS = ['id', 'text', 'risk', 'verifymethod'] as const
/** element 块可写的字段 */
export const REQUIREMENT_ELEMENT_FIELDS = ['type', 'docref'] as const
/** 全部可识别字段（解析侧用；大小写不敏感匹配） */
const REQUIREMENT_FIELD_NAMES = ['id', 'text', 'risk', 'verifymethod', 'type', 'docref'] as const

function isOneOf<T extends string>(table: readonly T[], value: string): value is T {
  return (table as readonly string[]).includes(value)
}

export function isRequirementType(value: string): value is RequirementType {
  return REQUIREMENT_TYPES.some((t) => t.toLowerCase() === value.toLowerCase())
}

// ---------- 词法片段（mermaid 12.0.0 实测） ----------

/** 裸名字 token：不含空白、`-`（关系算子）、`:`（`:::name` 样式简写的分隔符）与 `{}`。
 * 引号形式见 `parseNameToken`。中文裸名实测失败（`requirement 中文` → Lexical error），
 * 引号形式可以（`requirement "中文"`）——引号形态因此逐字记录。 */
const BARE_NAME = '[^\\s\\-{}:]+'

const HEADER_RE = /^([ \t]*)requirementDiagram([ \t\r]*)$/
const DIRECTION_RE = /^direction([ \t]+)(\S+)[ \t\r]*$/
/** 块声明行：`<6 种 type> <name> [:::class] {`（type 大小写不敏感） */
const REQUIREMENT_OPEN_RE = new RegExp(`^(${REQUIREMENT_TYPES.join('|')})([ \\t]+)([\\s\\S]+)$`, 'i')
/** element 块声明行：`element <name> [:::class] {` */
const REQUIREMENT_ELEMENT_OPEN_RE = /^element([ \t]+)([\s\S]+)$/i
/** 字段行：`<field> : <value>`（field 大小写不敏感——实测 `verifyMethod:` 可解析） */
const FIELD_RE = new RegExp(`^(${REQUIREMENT_FIELD_NAMES.join('|')})([ \\t]*):([ \\t]*)([\\s\\S]*)$`, 'i')
/** 块声明行名字之后的部分：可选 `:::class`，然后必须是 `{` */
const BLOCK_TAIL_RE = /^[ \t]*(?:::[^ \t{]+)?[ \t]*\{[ \t\r]*$/

/**
 * 关系行（正向 / 反向共用一条）：`{L} - kind -> {R}` 或 `{L} <- kind - {R}`。
 * 名字不含 `-`（词法事实），故算子可无空白紧贴（实测 `a-satisfies->b` 可解析）。
 * kind 先按字母串捕获，再按 7 种枚举把关（不认识 → 整行不解析，逐字保留）。
 */
const RELATION_NAME = '("(?:[^"]*)"|[^\\s\\-{}:]+)'
const RELATION_RE = new RegExp(
  `^${RELATION_NAME}([ \\t]*)(<-|-)([ \\t]*)([A-Za-z]+)([ \\t]*)(->|-)([ \\t]*)${RELATION_NAME}([\\s\\S]*)$`,
)

/** 名字 token 解析：返回 { name, quoted, rest }；不是名字 token 时 null */
function parseNameToken(text: string): { name: string; quoted: boolean; rest: string } | null {
  const qm = /^"([^"]*)"([\s\S]*)$/.exec(text)
  if (qm !== null) return { name: qm[1], quoted: true, rest: qm[2] }
  const m = new RegExp(`^(${BARE_NAME})([\\s\\S]*)$`).exec(text)
  if (m === null) return null
  return { name: m[1], quoted: false, rest: m[2] }
}

function nameText(name: string, quoted: boolean): string {
  return quoted ? `"${name}"` : name
}

// ---------- 元素数据 ----------

export interface RequirementHeaderData {
  kind: 'requirement-header'
  trailing: string
}

export interface RequirementDirectionData {
  kind: 'requirement-direction'
  gap: string
  /** 取值原文（逐字记录；合法性由 set-direction 落地侧白名单把关） */
  value: string
}

export function renderRequirementDirection(
  d: RequirementDirectionData,
  changes: { value?: string } = {},
): string {
  return `direction${d.gap}${changes.value ?? d.value}`
}

/**
 * requirement 块声明行：`<type> <name> [:::class] {`。
 * - `type` 逐字保留（大小写不敏感匹配 6 种枚举）
 * - `gap` = type 与 name 之间的空白
 * - `post` = name 之后到行尾的原文（含 `:::class`、` {`、尾部空白），逐字保留
 */
export interface RequirementBlockData {
  kind: 'requirement'
  /** 原文 type 字面（6 种枚举之一） */
  type: string
  gap: string
  /** 名字（语法标识：画布 data-id、关系端点、编辑意图都用它） */
  name: string
  quoted: boolean
  post: string
}

export function renderRequirementBlock(d: RequirementBlockData, changes: { name?: string } = {}): string {
  return `${d.type}${d.gap}${nameText(changes.name ?? d.name, d.quoted)}${d.post}`
}

/** element 块声明行：`element <name> [:::class] {`；`keyword` 逐字保留原大小写 */
export interface RequirementElementBlockData {
  kind: 'requirement-element'
  keyword: string
  gap: string
  name: string
  quoted: boolean
  post: string
}

export function renderRequirementElementBlock(
  d: RequirementElementBlockData,
  changes: { name?: string } = {},
): string {
  return `${d.keyword}${d.gap}${nameText(changes.name ?? d.name, d.quoted)}${d.post}`
}

/**
 * 字段行：`<field>: <value>`。
 * - `keyRaw` / `gap` / `tail` 逐字保留（改值只替换 value 段）
 * - `value` = 去引号后的语义值；`quoted` = 源码里是否带引号
 */
export interface RequirementFieldData {
  kind: 'requirement-field'
  /** 归一小写的字段名（分发表单/投影；`keyRaw` 才是原文） */
  field: RequirementFieldKind
  keyRaw: string
  gap: string
  value: string
  quoted: boolean
  tail: string
}

/**
 * 字段行的原文重建（changes.value = 新语义值）。
 *
 * **引号形态契约**：值未变时逐字回放原形态（verbatim identity）；值变了则保持原形态——
 * 原本带引号的仍带引号；原本无引号的，若新值不能再安全裸写（含 `-` `=` `,` `:` `<` `>`
 * `{`、以 `#`/`%` 开头、或恰是关键字词）则**自动加引号**（守「源码始终是合法 mermaid」）。
 */
export function renderRequirementField(d: RequirementFieldData, changes: { value?: string } = {}): string {
  if (changes.value === undefined) {
    return `${d.keyRaw}:${d.gap}${nameText(d.value, d.quoted)}${d.tail}`
  }
  const value = changes.value
  const emit = d.quoted || !isSafelyUnquotedRequirementValue(d.field, value) ? `"${value}"` : value
  return `${d.keyRaw}:${d.gap}${emit}${d.tail}`
}

/** 块结束行（`}`）；无负载，删除块时按区间级联清理 */
export interface RequirementCloseData {
  kind: 'requirement-end'
}

/**
 * 关系行：`{left} <leftOp> kind <rightOp> {right}`（leftOp/rightOp 二选一组合）。
 * 语义归一由消费方做：`reversed === false` → from=left / to=right；
 * `reversed === true`（源码写 `{right} <- kind - {left}`）→ from=right / to=left。
 * 各片段逐字保留，改 kind / 反转方向都只替换对应槽位。
 */
export interface RequirementRelationData {
  kind: 'requirement-relation'
  left: string
  leftQuoted: boolean
  preLeft: string
  /** `-`（正向）或 `<-`（反向） */
  leftOp: string
  mid1: string
  relationKind: string
  mid2: string
  /** `->`（正向）或 `-`（反向） */
  rightOp: string
  preRight: string
  right: string
  rightQuoted: boolean
  tail: string
}

/** 关系行的原文重建；changes.relationKind 改 kind、changes.reversed 反转书写方向 */
export function renderRequirementRelation(
  d: RequirementRelationData,
  changes: { relationKind?: string; reversed?: boolean } = {},
): string {
  const reversed = changes.reversed ?? d.leftOp === '<-'
  const leftOp = reversed ? '<-' : '-'
  const rightOp = reversed ? '-' : '->'
  return (
    `${nameText(d.left, d.leftQuoted)}${d.preLeft}${leftOp}${d.mid1}` +
    `${changes.relationKind ?? d.relationKind}${d.mid2}${rightOp}${d.preRight}` +
    `${nameText(d.right, d.rightQuoted)}${d.tail}`
  )
}

export type RequirementData =
  | RequirementHeaderData
  | RequirementDirectionData
  | RequirementBlockData
  | RequirementElementBlockData
  | RequirementFieldData
  | RequirementRelationData
  | RequirementCloseData

// ---------- 行级解析 ----------

function parseRequirementOpen(line: string, firstChar: number): RequirementBlockData | null {
  const m = REQUIREMENT_OPEN_RE.exec(line.slice(firstChar))
  if (m === null) return null
  const head = parseNameToken(m[3])
  if (head === null || !BLOCK_TAIL_RE.test(head.rest)) return null
  return { kind: 'requirement', type: m[1], gap: m[2], name: head.name, quoted: head.quoted, post: head.rest }
}

function parseElementOpen(line: string, firstChar: number): RequirementElementBlockData | null {
  const m = REQUIREMENT_ELEMENT_OPEN_RE.exec(line.slice(firstChar))
  if (m === null) return null
  const head = parseNameToken(m[2])
  if (head === null || !BLOCK_TAIL_RE.test(head.rest)) return null
  return {
    kind: 'requirement-element',
    keyword: line.slice(firstChar, firstChar + 'element'.length),
    gap: m[1],
    name: head.name,
    quoted: head.quoted,
    post: head.rest,
  }
}

function parseFieldLine(line: string, firstChar: number): RequirementFieldData | null {
  const m = FIELD_RE.exec(line.slice(firstChar))
  if (m === null) return null
  const keyRaw = m[1]
  const field = keyRaw.toLowerCase() as RequirementFieldKind
  const rest = m[4]
  if (rest.startsWith('"')) {
    const qm = /^"([^"]*)"([\s\S]*)$/.exec(rest)
    if (qm === null) return null
    return { kind: 'requirement-field', field, keyRaw, gap: m[3], value: qm[1], quoted: true, tail: qm[2] }
  }
  const trailing = /[ \t\r]*$/.exec(rest)?.[0] ?? ''
  return {
    kind: 'requirement-field',
    field,
    keyRaw,
    gap: m[3],
    value: rest.slice(0, rest.length - trailing.length),
    quoted: false,
    tail: trailing,
  }
}

function parseRelationLine(line: string, firstChar: number): RequirementRelationData | null {
  const m = RELATION_RE.exec(line.slice(firstChar))
  if (m === null) return null
  const leftOp = m[3]
  const rightOp = m[7]
  // 两种书写方向各有一对固定算子；混搭（`- ... -`、`<- ... ->`）不是语法
  if (leftOp === '<-' ? rightOp !== '-' : leftOp === '-' ? rightOp !== '->' : true) return null
  if (!isOneOf(REQUIREMENT_RELATION_KINDS, m[5])) return null
  const left = parseNameToken(m[1])
  const right = parseNameToken(m[9])
  if (left === null || right === null) return null
  return {
    kind: 'requirement-relation',
    left: left.name,
    leftQuoted: left.quoted,
    preLeft: m[2],
    leftOp,
    mid1: m[4],
    relationKind: m[5],
    mid2: m[6],
    rightOp,
    preRight: m[8],
    right: right.name,
    rightQuoted: right.quoted,
    tail: m[10],
  }
}

interface RawEntry {
  span: Span
  id: string
  data: RequirementData
}

interface Counters {
  field: number
  relation: number
  direction: number
  end: number
  requirementOccurrence: Map<string, number>
  elementOccurrence: Map<string, number>
}

/** 打开的块：`requirement <name> {` / `element <name> {` 压栈（块内字段行归栈顶） */
interface OpenBlock {
  lineNo: number
  kind: 'requirement' | 'element'
}

export class RequirementParser implements DiagramParser {
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
      field: 0,
      relation: 0,
      direction: 0,
      end: 0,
      requirementOccurrence: new Map(),
      elementOccurrence: new Map(),
    }
    const blockStack: OpenBlock[] = []
    let seenHeader = false
    // 文首 frontmatter 块不参与解析，整体 verbatim 保留
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
            throw parseFailure(lineNo, '图表必须以 requirementDiagram 声明开始')
          }
          seenHeader = true
          entries.push({
            span: { start: cursor, end: cursor + line.length },
            id: 'header',
            data: { kind: 'requirement-header', trailing: header[2] ?? '' },
          })
        } else {
          const firstChar = line.length - line.trimStart().length
          const span = { start: cursor + firstChar, end: cursor + line.length }

          if (trimmed === '}') {
            const top = blockStack.pop()
            if (top === undefined) {
              throw parseFailure(lineNo, '多余的 }（没有与之匹配的块声明行）')
            }
            counters.end++
            entries.push({ span, id: `requirement-end:${counters.end}`, data: { kind: 'requirement-end' } })
          } else if (blockStack.length > 0) {
            // 块内部：只认字段行；其余（注释、清单外字段）逐字保留
            const field = parseFieldLine(line, firstChar)
            if (field !== null) {
              counters.field++
              entries.push({
                span,
                id: requirementFieldElementId(counters.field),
                data: field,
              })
            }
          } else {
            const direction = DIRECTION_RE.exec(line.slice(firstChar))
            if (direction !== null) {
              counters.direction++
              entries.push({
                span,
                id: `direction:${counters.direction}`,
                data: { kind: 'requirement-direction', gap: direction[1], value: direction[2] },
              })
            } else {
              const requirement = parseRequirementOpen(line, firstChar)
              if (requirement !== null) {
                const n = (counters.requirementOccurrence.get(requirement.name) ?? 0) + 1
                counters.requirementOccurrence.set(requirement.name, n)
                entries.push({ span, id: requirementBlockElementId(requirement.name, n), data: requirement })
                blockStack.push({ lineNo, kind: 'requirement' })
              } else {
                const element = parseElementOpen(line, firstChar)
                if (element !== null) {
                  const n = (counters.elementOccurrence.get(element.name) ?? 0) + 1
                  counters.elementOccurrence.set(element.name, n)
                  entries.push({ span, id: requirementElemBlockElementId(element.name, n), data: element })
                  blockStack.push({ lineNo, kind: 'element' })
                } else {
                  const relation = parseRelationLine(line, firstChar)
                  if (relation !== null) {
                    counters.relation++
                    entries.push({ span, id: `relation:${counters.relation}`, data: relation })
                  }
                  // 其余（style / classDef / class / ::: 独立行 / title / 注释 / 生僻语法）逐字保留
                }
              }
            }
          }
        }
      }

      if (nl === -1) break
      cursor = nl + 1
    }

    if (!seenHeader) {
      throw parseFailure(1, '图表必须以 requirementDiagram 声明开始')
    }
    if (blockStack.length > 0) {
      throw parseFailure(blockStack[blockStack.length - 1].lineNo, '块声明行缺少匹配的 }')
    }
    return assembleDocument(source, entries)
  }

  // ---------- 意图落地（resolveRewrites） ----------

  resolveRewrites(doc: SourceDocument, intent: EditIntent): ReadonlyMap<string, string> | null {
    switch (intent.type) {
      case 'add-requirement':
        return this.resolveAddRequirement(doc, intent as never)
      case 'add-element':
        return this.resolveAddElement(doc, intent as never)
      case 'delete-requirement':
        return this.resolveDeleteBlock(doc, intent as never)
      case 'delete-element':
        return this.resolveDeleteBlock(doc, intent as never)
      case 'set-requirement-field':
        return this.resolveSetField(doc, intent as never, 'requirement')
      case 'set-element-field':
        return this.resolveSetField(doc, intent as never, 'element')
      case 'add-relation':
        return this.resolveAddRelation(doc, intent as never)
      case 'set-relation':
        return this.resolveSetRelation(doc, intent as never)
      case 'delete-relation':
        return this.resolveDeleteRelation(doc, intent as never)
      case 'set-direction':
        return this.resolveSetDirection(doc, intent as never)
      default:
        return null
    }
  }

  /** 块声明行的匹配 `}`（按块声明 / requirement-end 深度计数） */
  private matchingEnd(doc: SourceDocument, decl: { span: Span }): { id: string; span: Span } | null {
    let depth = 1
    for (const part of doc.elements) {
      if (part.span.start <= decl.span.start) continue
      const data = part.element as RequirementData
      if (data.kind === 'requirement' || data.kind === 'requirement-element') depth++
      if (data.kind === 'requirement-end') {
        depth--
        if (depth === 0) return { id: part.id, span: part.span }
      }
    }
    return null
  }

  /** 某元素所在行的行首缩进 */
  private indentOf(doc: SourceDocument, span: Span): string {
    const lineStart = doc.source.lastIndexOf('\n', Math.max(0, span.start - 1)) + 1
    return /^[ \t]*/.exec(doc.source.slice(lineStart, span.start))?.[0] ?? ''
  }

  /** 按名字找块声明行（同名多块取首个，与 mermaid 的 Map 语义不同——但 mermaid 只渲染最后一个；
   * 本票与 er 的 ensure* 同口径：声明行先见者承担编辑入口）。 */
  private findBlockDecl(
    doc: SourceDocument,
    name: string,
    kind: 'requirement' | 'element',
  ): { id: string; span: Span; data: RequirementData } | null {
    const wanted = kind === 'requirement' ? 'requirement' : 'requirement-element'
    for (const part of doc.elements) {
      const data = part.element as RequirementData
      if (data.kind === wanted && (data as RequirementBlockData | RequirementElementBlockData).name === name) {
        return { id: part.id, span: part.span, data }
      }
    }
    return null
  }

  private resolveAddRequirement(
    doc: SourceDocument,
    intent: Extract<RequirementIntent, { type: 'add-requirement' }>,
  ): Map<string, string> | null {
    if (!isRequirementType(intent.requirementType) || !isValidRequirementName(intent.name)) return null
    // 名字在 requirement / element 两类块里都必须没撞过：mermaid 按 name 建 Map（后写覆盖），
    // 且两类节点在画布 DOM 上只有名字（点选按投影消歧），同名会让编辑寻址歧义
    if (this.findBlockDecl(doc, intent.name, 'requirement') !== null) return null
    if (this.findBlockDecl(doc, intent.name, 'element') !== null) return null
    const data: RequirementBlockData = {
      kind: 'requirement',
      type: intent.requirementType,
      gap: ' ',
      name: intent.name,
      quoted: false,
      post: ' {',
    }
    return insertAfter(doc, {
      afterElementId: this.reanchorPastBlockEnd(doc, intent.afterElementId),
      render: (indent) => indentLines(indent, [renderRequirementBlock(data), '}']),
    })
  }

  private resolveAddElement(
    doc: SourceDocument,
    intent: Extract<RequirementIntent, { type: 'add-element' }>,
  ): Map<string, string> | null {
    if (!isValidRequirementName(intent.name)) return null
    // 与 add-requirement 同口径：两类块共享名字空间，重名拒绝（见上）
    if (this.findBlockDecl(doc, intent.name, 'requirement') !== null) return null
    if (this.findBlockDecl(doc, intent.name, 'element') !== null) return null
    const data: RequirementElementBlockData = {
      kind: 'requirement-element',
      keyword: 'element',
      gap: ' ',
      name: intent.name,
      quoted: false,
      post: ' {',
    }
    return insertAfter(doc, {
      afterElementId: this.reanchorPastBlockEnd(doc, intent.afterElementId),
      render: (indent) => indentLines(indent, [renderRequirementElementBlock(data), '}']),
    })
  }

  /** 块声明锚点 → 块闭合行（新块要插在块**外**：锚到声明行会把新块插进块体内部）。
   * 其余锚点（关系 / direction / 块闭合行本身）原样透传。 */
  private reanchorPastBlockEnd(doc: SourceDocument, afterElementId: string | undefined): string | undefined {
    const anchor = resolveAnchor(doc, afterElementId)
    if (anchor === null) return afterElementId
    const kind = (anchor.element as RequirementData).kind
    if (kind !== 'requirement' && kind !== 'requirement-element') return afterElementId
    const end = this.matchingEnd(doc, anchor)
    return end === null ? afterElementId : end.id
  }

  /** 删除 requirement / element 块（声明行、块内字段、`}` 整体，触及关系，按区间级联清理） */
  private resolveDeleteBlock(
    doc: SourceDocument,
    intent: Extract<RequirementIntent, { type: 'delete-requirement' | 'delete-element' }>,
  ): Map<string, string> | null {
    const blockKind = intent.type === 'delete-requirement' ? 'requirement' : 'element'
    const decl = this.findBlockDecl(doc, intent.name, blockKind)
    if (decl === null) return null
    const end = this.matchingEnd(doc, decl)
    if (end === null) return null
    const rewrites = new Map<string, string>()
    for (const part of doc.elements) {
      if (part.span.start >= decl.span.start && part.span.end <= end.span.end) rewrites.set(part.id, '')
      const data = part.element as RequirementData
      if (data.kind === 'requirement-relation') {
        const rel = normalizeRelation(data)
        if (rel.from === intent.name || rel.to === intent.name) rewrites.set(part.id, '')
      }
    }
    return rewrites
  }

  /**
   * 设置 / 新增 / 删除一个字段：
   * - 已有该字段行 → 原地改写（value null = 删除该行）
   * - 没有该字段行 → 在块的 `}` 之前插入一行（缩进跟随 `}`）；value null 时不落码
   */
  private resolveSetField(
    doc: SourceDocument,
    intent: Extract<RequirementIntent, { type: 'set-requirement-field' | 'set-element-field' }>,
    blockKind: 'requirement' | 'element',
  ): Map<string, string> | null {
    const name = intent.type === 'set-requirement-field' ? intent.requirement : intent.element
    const field = intent.field as RequirementFieldKind
    if (!isOneOf(REQUIREMENT_FIELD_NAMES, field)) return null
    if (blockKind === 'requirement' && !isOneOf(REQUIREMENT_FIELDS, field)) return null
    if (blockKind === 'element' && !isOneOf(REQUIREMENT_ELEMENT_FIELDS, field)) return null
    if (intent.value !== null && !isValidRequirementFieldValue(intent.value)) return null

    const decl = this.findBlockDecl(doc, name, blockKind)
    if (decl === null) return null
    const end = this.matchingEnd(doc, decl)
    if (end === null) return null

    for (const part of doc.elements) {
      if (part.span.start <= decl.span.start || part.span.end >= end.span.end) continue
      const data = part.element as RequirementData
      if (data.kind === 'requirement-field' && data.field === field) {
        return intent.value === null
          ? new Map([[part.id, '']])
          : new Map([[part.id, renderRequirementField(data, { value: intent.value })]])
      }
    }
    if (intent.value === null) return new Map()
    const fresh: RequirementFieldData = {
      kind: 'requirement-field',
      field,
      keyRaw: field,
      gap: ' ',
      value: intent.value,
      quoted: !isSafelyUnquotedRequirementValue(field, intent.value),
      tail: '',
    }
    // 插到 `}` 之前：`}` 行缩进 + 新字段行 + 原 `}` 原文
    const indent = this.indentOf(doc, end.span)
    return new Map([[end.id, `${indent}${renderRequirementField(fresh)}\n${doc.source.slice(end.span.start, end.span.end)}`]])
  }

  private resolveAddRelation(
    doc: SourceDocument,
    intent: Extract<RequirementIntent, { type: 'add-relation' }>,
  ): Map<string, string> | null {
    if (!isOneOf(REQUIREMENT_RELATION_KINDS, intent.relationKind)) return null
    if (!isValidRequirementName(intent.from) || !isValidRequirementName(intent.to)) return null
    const reversed = intent.reversed === true
    const data: RequirementRelationData = {
      kind: 'requirement-relation',
      left: reversed ? intent.to : intent.from,
      leftQuoted: false,
      preLeft: ' ',
      leftOp: reversed ? '<-' : '-',
      mid1: ' ',
      relationKind: intent.relationKind,
      mid2: ' ',
      rightOp: reversed ? '-' : '->',
      preRight: ' ',
      right: reversed ? intent.from : intent.to,
      rightQuoted: false,
      tail: '',
    }
    return insertAfter(doc, {
      afterElementId: intent.afterElementId,
      render: (indent) => indentLines(indent, [renderRequirementRelation(data)]),
    })
  }

  private resolveSetRelation(
    doc: SourceDocument,
    intent: Extract<RequirementIntent, { type: 'set-relation' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'requirement-relation') return null
    const changes = intent.changes
    if (changes.relationKind !== undefined && !isOneOf(REQUIREMENT_RELATION_KINDS, changes.relationKind)) return null
    return new Map([
      [part.id, renderRequirementRelation(part.element as RequirementRelationData, changes)],
    ])
  }

  private resolveDeleteRelation(
    doc: SourceDocument,
    intent: Extract<RequirementIntent, { type: 'delete-relation' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'requirement-relation') return null
    return new Map([[part.id, '']])
  }

  /** 设置图表方向：有 direction 行就原地改写，没有就插到表头之后；null = 删除该行 */
  private resolveSetDirection(
    doc: SourceDocument,
    intent: Extract<RequirementIntent, { type: 'set-direction' }>,
  ): Map<string, string> | null {
    const existing = doc.elements.find((part) => (part.element as RequirementData).kind === 'requirement-direction')
    if (intent.direction === null) {
      return existing === undefined ? new Map() : new Map([[existing.id, '']])
    }
    const value = intent.direction.toUpperCase()
    if (!isOneOf(REQUIREMENT_DIRECTIONS, value)) return null
    if (existing !== undefined) {
      return new Map([
        [existing.id, renderRequirementDirection(existing.element as RequirementDirectionData, { value })],
      ])
    }
    const header = doc.elements.find((part) => (part.element as RequirementData).kind === 'requirement-header')
    if (header === undefined) return null
    return insertAfter(doc, {
      afterElementId: header.id,
      render: (indent) => indentLines(indent, [`direction ${value}`]),
    })
  }
}

export const requirementParser = new RequirementParser()

// ---------- 关系语义归一（正向 / 反向写法 → from/to + kind） ----------

export interface NormalizedRequirementRelation {
  from: string
  to: string
  relationKind: string
  /** 源码书写方向：true = `{to} <- kind - {from}` */
  reversed: boolean
}

/**
 * 关系行的语义归一（唯一实现，投影与删除级联共用）：反向写法 `{right} <- kind - {left}`
 * 归一为 from=right / to=left（箭头起点是 from），书写方向由 `reversed` 如实保留。
 */
export function normalizeRelation(d: RequirementRelationData): NormalizedRequirementRelation {
  const reversed = d.leftOp === '<-'
  return {
    from: reversed ? d.right : d.left,
    to: reversed ? d.left : d.right,
    relationKind: d.relationKind,
    reversed,
  }
}

// ---------- 校验（表单层复用，与落地侧同一规则） ----------

/** 新建 requirement / element 名字的合法性：ASCII 字母数字与 `_` `.`（实测裸名不允许 `-` 与中文） */
export function isValidRequirementName(name: string): boolean {
  return /^[A-Za-z0-9_.]+$/.test(name)
}

/** 字段值合法性：非空、不含 `"`、不含换行（含则无法用引号形式安全承载） */
export function isValidRequirementFieldValue(value: string): boolean {
  return value.trim() !== '' && !value.includes('"') && !/[\r\n]/.test(value)
}

/** 裸写不安全的关键字词（实测：`text: risk` / `text: satisfies` / `text: Test` 等解析失败） */
const UNQUOTABLE_WORDS = new Set<string>([
  ...REQUIREMENT_TYPES,
  ...REQUIREMENT_RISKS,
  ...REQUIREMENT_VERIFY_METHODS,
  ...REQUIREMENT_RELATION_KINDS,
  ...REQUIREMENT_FIELD_NAMES,
])

/**
 * 该值能否**不加引号**写在源码里（mermaid 12.0.0 实测口径）：
 * - 禁字符：`-` `=` `,` `:` `<` `>` `{`（`-` 是关系算子、`:` 是字段分隔、`{}` 是块定界）
 * - 禁首字符：`#` `%`（行首会被当作指令/注释记号）
 * - 禁关键字词：6 种 type / 3 种 risk / 4 种 verifymethod / 7 种关系 kind / 6 个字段名
 *   ——但字段自身的枚举取值天然就是关键字（`risk: High` / `verifymethod: Test`），故放行
 */
export function isSafelyUnquotedRequirementValue(field: RequirementFieldKind, value: string): boolean {
  if (value === '' || /[\-:,<>{}=]/.test(value) || /^[#%]/.test(value)) return false
  if (!UNQUOTABLE_WORDS.has(value)) return true
  if (field === 'risk') return isOneOf(REQUIREMENT_RISKS, value)
  if (field === 'verifymethod') return isOneOf(REQUIREMENT_VERIFY_METHODS, value)
  return false
}

// ---------- 编辑意图（工单 07 表单/画布所需集合） ----------

export interface RequirementRelationChanges {
  relationKind?: string
  /** 反转书写方向（语义随之反转：from/to 交换） */
  reversed?: boolean
}

export type RequirementIntent =
  /** 新增 requirement 块（type 六选一；块体为空，字段随后经 set-requirement-field 写入） */
  | { type: 'add-requirement'; requirementType: string; name: string; afterElementId?: string }
  /** 新增 element 块 */
  | { type: 'add-element'; name: string; afterElementId?: string }
  /** 删除 requirement 块（连同块内字段与触及关系） */
  | { type: 'delete-requirement'; name: string }
  /** 删除 element 块（连同块内字段与触及关系） */
  | { type: 'delete-element'; name: string }
  /** 设置 / 新增 / 删除 requirement 的字段（value null = 删除该字段行） */
  | { type: 'set-requirement-field'; requirement: string; field: string; value: string | null }
  /** 设置 / 新增 / 删除 element 的字段（value null = 删除该字段行） */
  | { type: 'set-element-field'; element: string; field: string; value: string | null }
  /** 新增关系行（reversed = 写反向形式） */
  | { type: 'add-relation'; from: string; to: string; relationKind: string; reversed?: boolean; afterElementId?: string }
  /** 改关系（kind / 书写方向；elementId 为 `relation:N`） */
  | { type: 'set-relation'; elementId: string; changes: RequirementRelationChanges }
  | { type: 'delete-relation'; elementId: string }
  /** 设置图表方向；null = 删除 direction 行（跟随 mermaid 默认） */
  | { type: 'set-direction'; direction: string | null }
