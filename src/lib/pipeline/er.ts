import { assembleDocument, getElementById, type SourceDocument } from './document'
import type { DiagramParser, EditIntent, ParseResult, SourceParseError } from './parser'
import { frontmatterEnd } from './frontmatter'
import { erEntityElementId } from './element-id'
import type { Span } from './span'
import { indentLines, insertAfter, resolveAnchor } from './insert'

/**
 * erDiagram 完整解析器（more-diagrams 工单 03，语法事实以
 * spec 的 research/state-er-gitgraph.md erDiagram 部分为准）：
 * 手写、逐行、带 span（ADR-0004）。可测试承诺：解析后不做修改再重组装，
 * 输出与输入逐字相同（verbatim identity）。
 *
 * 覆盖（分层对齐，spec 决策）：
 * - 实体：单独一行声明（裸名 / 引号名 `\"name with space\"` / `[alias]` 别名，
 *   任意组合）；关系引用自动创建（mermaid 语义，顶层裸行不解析为声明）
 * - 实体属性块：`ENTITY { ... }`（type / name / PK|FK|UK 键 / `?` 可空 / 行尾注释）
 * - 关系全家族：基数符号（|o o| || }o o{ }| |{）× 线型（-- identifying / .. non-identifying）
 *   任意组合 + 单向标签（`: label`，可为引号形式）
 * - direction（图表级）
 *
 * 不解析、原样保留（清单外语法不报错，ADR-0008）：style / classDef / class / :::
 * 样式语句、子图（v11.17 特性）、frontmatter、`%%` 注释、无法识别的行。
 *
 * span 约定（与 state 解析器同口径）：元素 span 从该行首个非空白字符起、到行尾
 * （不含换行）；行首缩进与换行留在 verbatim。属性块整体 = 实体声明行 + 各属性行 +
 * `}` 行（各自的 span，删除实体时按区间级联清理）。
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

export interface ErHeaderData {
  kind: 'er-header'
  trailing: string
}

export interface ErDirectionData {
  kind: 'er-direction'
  gap: string
  /** 取值原文（逐字记录；合法性由 set-direction 落地侧白名单把关） */
  value: string
}

export function renderErDirection(d: ErDirectionData, changes: { value?: string } = {}): string {
  return `direction${d.gap}${changes.value ?? d.value}`
}

/**
 * 实体声明行。四种形态（可组合）：
 * - `CAR` / `\"name with space\"`（quoted）
 * - `CAR[alias]` / `\"name\"[alias]`（别名）
 * - 行尾 ` {`（属性块开行，openBrace）
 * pre = 名字与 `[` 之间的原文（仅 hasBracket 时存在）；post = `]` 之后（或名字之后，
 * 无别名时）到行尾的原文（含 ` {` 与尾部空白），逐字保留。
 */
export interface ErEntityData {
  kind: 'er-entity'
  /** 去引号后的实体名（语法标识，画布 data-id 与编辑意图都用它） */
  name: string
  /** 源码里名字是否带引号 */
  quoted: boolean
  /** 是否带 `[alias]` 别名段 */
  hasBracket: boolean
  /** 名字与 `[` 之间的空白；无别名段 '' */
  pre: string
  /** 别名内容；无别名段 null */
  alias: string | null
  /** `]` 之后（无别名段时名字之后）到行尾的原文（` {`、尾部空白），逐字保留 */
  post: string
  /** post 是否含 `{`（属性块开行） */
  openBrace: boolean
}

/** 实体声明行的原文重建；changes.alias：改写 / 移除（null）/ 新增别名 */
export function renderErEntity(d: ErEntityData, changes: { alias?: string | null } = {}): string {
  const alias = changes.alias !== undefined ? changes.alias : d.alias
  const namePart = d.quoted ? `"${d.name}"` : d.name
  if (!d.hasBracket && alias === null) return namePart + d.post
  if (!d.hasBracket) return `${namePart}[${alias}]${d.post}`
  if (alias === null || alias === '') return namePart + d.post
  return `${namePart}${d.pre}[${alias}]${d.post}`
}

/**
 * 实体属性行：`type name keys "comment"`（keys 与 comment 可选，keys = PK/FK/UK 逗号组合，
 * `?` 类型后缀 = 可空，`*` 名字前缀 = 主键标记——全部原文保留，结构化字段只取语义位）。
 */
export interface ErAttributeData {
  kind: 'er-attribute'
  /** 基础类型（不含 `?` 后缀；原文其余部分逐字保留） */
  type: string
  nullable: boolean
  /** type 与 name 之间的空白（原文） */
  gap1: string
  /** 名字是否带 `*` 前缀（主键标记，原文保留） */
  star: boolean
  name: string
  /** name 与后段之间的空白（原文；无后段时即行尾空白） */
  gap2: string
  /** 键段原文（如 `PK, FK`）；无 '' */
  keysRaw: string
  /** keys 与 comment 之间的空白；无 keys 或无 comment 时 '' */
  gap3: string
  /** 行尾注释内容（去引号）；无 null */
  comment: string | null
  /** 行尾空白（最后一个分段之后），逐字保留 */
  tail: string
}

/** 键段原文 → 键列表（`PK, FK` → ['PK','FK']） */
export function parseErKeys(keysRaw: string): string[] {
  return keysRaw === '' ? [] : keysRaw.split(',').map((k) => k.trim()).filter((k) => k !== '')
}

/** 实体属性行的原文重建；changes 任意字段可改写 */
export function renderErAttribute(
  d: ErAttributeData,
  changes: {
    type?: string
    nullable?: boolean
    name?: string
    keys?: string[]
    comment?: string | null
  } = {},
): string {
  const type = changes.type ?? d.type
  const nullable = changes.nullable ?? d.nullable
  const name = changes.name ?? d.name
  const keys = changes.keys !== undefined ? changes.keys.join(', ') : d.keysRaw
  const comment = changes.comment !== undefined ? changes.comment : d.comment
  // 原行在名字之后是否已有后缀段（keys / 注释）；无后缀时 d.gap2 装的是行尾空白。
  const hadSuffix = d.keysRaw !== '' || d.comment !== null
  if (!hadSuffix) {
    // 名字与行尾之间原本没有分段：新增 keys/注释时以原文行尾空白作分隔（至少一个空格），
    // 否则会产出 `string fieldPK` 这样粘连的键段（工单 29 验收发现）。
    const sep = d.gap2 !== '' ? d.gap2 : ' '
    if (keys !== '' || comment !== null) {
      let suffix = keys
      if (comment !== null) suffix += (keys !== '' ? ' ' : '') + `"${comment}"`
      return `${type}${nullable ? '?' : ''}${d.gap1}${d.star ? '*' : ''}${name}${sep}${suffix}${d.tail}`
    }
    return `${type}${nullable ? '?' : ''}${d.gap1}${d.star ? '*' : ''}${name}${d.gap2}${d.tail}`
  }
  // 原文已有后缀段：沿用原文空白（gap2 名字后 / gap3 keys 后），逐字保留（ADR-0008）
  let s = `${type}${nullable ? '?' : ''}${d.gap1}${d.star ? '*' : ''}${name}${d.gap2}`
  if (keys !== '') s += keys
  if (comment !== null) s += (d.keysRaw !== '' ? d.gap3 : ' ') + `"${comment}"`
  return s + d.tail
}

/**
 * 关系行：`<左基数><线型><右基数> [实体2] [: 标签]`。
 * 线型 `--` = identifying（实线）、`..` = non-identifying（虚线）；
 * 标签为单向（第一实体视角），原文保留（含引号形态）。
 */
export interface ErRelationData {
  kind: 'er-relation'
  from: string
  fromQuoted: boolean
  /** from 与左基数之间的空白 */
  gap1: string
  cardLeft: string
  /** '--'（identifying）或 '..'（non-identifying） */
  line: string
  cardRight: string
  /** 右基数与实体 2 之间的空白 */
  gap2: string
  to: string
  toQuoted: boolean
  /** 实体 2 与标签之间的原文（含冒号）；无标签 '' */
  colonRaw: string
  /** 标签原文（冒号之后逐字，含引号） */
  label: string
}

/** 关系行的原文重建；changes 各字段可改写（label null = 去掉标签段） */
export function renderErRelation(
  d: ErRelationData,
  changes: { cardLeft?: string; line?: string; cardRight?: string; label?: string | null } = {},
): string {
  const cardLeft = changes.cardLeft ?? d.cardLeft
  const line = changes.line ?? d.line
  const cardRight = changes.cardRight ?? d.cardRight
  const name1 = d.fromQuoted ? `"${d.from}"` : d.from
  const name2 = d.toQuoted ? `"${d.to}"` : d.to
  const s = `${name1}${d.gap1}${cardLeft}${line}${cardRight}${d.gap2}${name2}`
  if (changes.label === null) return s
  if (changes.label !== undefined) {
    // 新标签：无原冒号段时补一段（保留 mermaid 惯用形态 ` : `）
    const needsQuotes = /[^\w\u00C0-\uFFFF-]/.test(changes.label)
    return `${s}${d.colonRaw !== '' ? d.colonRaw : ' : '}${needsQuotes ? `"${changes.label}"` : changes.label}`
  }
  return s + d.colonRaw + d.label
}

/** 属性块结束行（`}`）；无负载，删除实体块时按区间级联清理 */
export interface ErEndData {
  kind: 'er-end'
}

export type ErElementData =
  | ErHeaderData
  | ErDirectionData
  | ErEntityData
  | ErAttributeData
  | ErRelationData
  | ErEndData

// ---------- 词法片段 ----------

/** 实体/属性名 token（不含空白、引号、方括号、花括号、冒号、逗号） */
const NAME_TOKEN = '[^\\s"\'\\[\\]{}:,]+'
const ER_DIRECTIONS = ['TB', 'BT', 'RL', 'LR']

/** 左基数符号（外侧=最大，内侧=最小） */
export const ER_CARD_LEFT = ['|o', '||', '}o', '}|'] as const
/** 右基数符号 */
export const ER_CARD_RIGHT = ['o|', '||', 'o{', '|{'] as const

const CARD_LEFT_RE = /^\|o|^\|\||^\}o|^\}\|/
const CARD_RIGHT_RE = /^o\||^\|\||^o\{|^\|\{/

/** 关系线型 → 投影语义（实线 identifying / 虚线 non-identifying） */
export function erLineKindOf(line: string): 'identifying' | 'non-identifying' | null {
  if (line === '--') return 'identifying'
  if (line === '..') return 'non-identifying'
  return null
}

// ---------- 行级解析 ----------

const HEADER_RE = /^([ \t]*)erDiagram([ \t\r]*)$/
const DIRECTION_RE = /^direction([ \t]+)(\S+)[ \t\r]*$/

/** 实体名（含引号名）解析：返回 { name, quoted, rest }；不是实体名 token 时 null */
function parseNameToken(text: string): { name: string; quoted: boolean; rest: string } | null {
  const qm = /^"([^"]*)"(.*)$/.exec(text)
  if (qm !== null) return { name: qm[1], quoted: true, rest: qm[2] }
  const m = new RegExp(`^(${NAME_TOKEN})(.*)$`).exec(text)
  if (m === null) return null
  return { name: m[1], quoted: false, rest: m[2] }
}

function parseEntityLine(line: string, firstChar: number): ErEntityData | null {
  const body = line.slice(firstChar)
  const head = parseNameToken(body)
  if (head === null) return null
  let rest = head.rest
  let hasBracket = false
  let pre = ''
  let alias: string | null = null
  if (rest.startsWith('[')) {
    const cm = /^\[([^\]]*)\](.*)$/.exec(rest)
    if (cm === null) return null
    hasBracket = true
    pre = ''
    alias = cm[1]
    rest = cm[2]
  }
  // post：` {` 开属性块，或纯尾部空白；其余（`:::`、行尾注释等）不解析，保持 verbatim
  if (/^[ \t\r]*\{[ \t\r]*$/.test(rest)) {
    return { kind: 'er-entity', name: head.name, quoted: head.quoted, hasBracket, pre, alias, post: rest, openBrace: true }
  }
  if (/^[ \t\r]*$/.test(rest)) {
    return { kind: 'er-entity', name: head.name, quoted: head.quoted, hasBracket, pre, alias, post: rest, openBrace: false }
  }
  return null
}

function parseAttributeLine(line: string, firstChar: number): ErAttributeData | null {
  const body = line.slice(firstChar)
  // 1) 类型（首字符须字母，mermaid 词法事实；`?` 后缀 = 可空）
  const tm = /^([A-Za-z][^\s"{}]*)/.exec(body)
  if (tm === null) return null
  let typeRaw = tm[1]
  let nullable = false
  if (typeRaw.endsWith('?')) {
    nullable = true
    typeRaw = typeRaw.slice(0, -1)
  }
  let rest = body.slice(tm[1].length)
  // 2) 类型与名字之间的空白
  const gap1 = rest.slice(0, rest.length - rest.trimStart().length)
  rest = rest.trimStart()
  if (gap1 === '') return null // type 与 name 之间必须有空白
  // 3) 名字（可选 `*` 前缀 = 主键标记）
  const nm = /^(\*?)([^\s"{}]*)/.exec(rest)
  if (nm === null || nm[2] === '') return null
  const star = nm[1] === '*'
  const name = nm[2]
  rest = rest.slice(nm[0].length)
  // 4) 尾段：keys（PK/FK/UK 逗号组合）与行尾引号注释（可独立出现）
  let keysRaw = ''
  let gap3 = ''
  let comment: string | null = null
  if (/^[ \t\r]*$/.test(rest)) {
    return { kind: 'er-attribute', type: typeRaw, nullable, gap1, star, name, gap2: rest, keysRaw, gap3, comment, tail: '' }
  }
  const gap2 = rest.slice(0, rest.length - rest.trimStart().length)
  rest = rest.trimStart()
  if (rest.startsWith('"')) {
    const cm = /^"([^"]*)"([ \t\r]*)$/.exec(rest)
    if (cm === null) return null
    comment = cm[1]
    return { kind: 'er-attribute', type: typeRaw, nullable, gap1, star, name, gap2, keysRaw, gap3, comment, tail: '' }
  }
  const km = /^((?:PK|FK|UK)(?:[ \t]*,[ \t]*(?:PK|FK|UK))*)([\s\S]*)$/.exec(rest)
  if (km === null) return null
  keysRaw = km[1]
  const rest2 = km[2]
  if (rest2.trimStart().startsWith('"')) {
    gap3 = rest2.slice(0, rest2.length - rest2.trimStart().length)
    const cm = /^"([^"]*)"([ \t\r]*)$/.exec(rest2.trimStart())
    if (cm === null) return null
    comment = cm[1]
    return { kind: 'er-attribute', type: typeRaw, nullable, gap1, star, name, gap2, keysRaw, gap3, comment, tail: '' }
  }
  if (/^[ \t\r]*$/.test(rest2)) {
    // keys 后的尾部空白记入 gap3（重建时仍跟在 keys 之后，位置不变）
    return { kind: 'er-attribute', type: typeRaw, nullable, gap1, star, name, gap2, keysRaw, gap3: rest2, comment, tail: '' }
  }
  return null
}

function parseRelationLine(line: string, firstChar: number): ErRelationData | null {
  const body = line.slice(firstChar)
  const head = parseNameToken(body)
  if (head === null) return null
  const gap1 = head.rest.slice(0, head.rest.length - head.rest.trimStart().length)
  let rest = head.rest.trimStart()
  if (gap1 === '') return null
  const cardLeft = CARD_LEFT_RE.exec(rest)?.[0]
  if (cardLeft === undefined) return null
  rest = rest.slice(cardLeft.length)
  const line2 = rest.startsWith('--') ? '--' : rest.startsWith('..') ? '..' : null
  if (line2 === null) return null
  rest = rest.slice(2)
  const cardRight = CARD_RIGHT_RE.exec(rest)?.[0]
  if (cardRight === undefined) return null
  rest = rest.slice(cardRight.length)
  const gap2 = rest.slice(0, rest.length - rest.trimStart().length)
  rest = rest.trimStart()
  if (gap2 === '') return null
  const tail = parseNameToken(rest)
  if (tail === null) return null
  const after = tail.rest
  let colonRaw = ''
  let label = ''
  if (/^[ \t\r]*$/.test(after)) {
    return {
      kind: 'er-relation',
      from: head.name,
      fromQuoted: head.quoted,
      gap1,
      cardLeft,
      line: line2,
      cardRight,
      gap2,
      to: tail.name,
      toQuoted: tail.quoted,
      colonRaw,
      label,
    }
  }
  // 标签段：`:` 后到行尾逐字保留（含引号形态）；冒号后的空白并入 colonRaw（正文从非空白起）
  const cm = /^([ \t]*:[ \t]*)([\s\S]*)$/.exec(after)
  if (cm === null) return null
  colonRaw = cm[1]
  label = cm[2]
  return {
    kind: 'er-relation',
    from: head.name,
    fromQuoted: head.quoted,
    gap1,
    cardLeft,
    line: line2,
    cardRight,
    gap2,
    to: tail.name,
    toQuoted: tail.quoted,
    colonRaw,
    label,
  }
}

interface RawEntry {
  span: Span
  id: string
  data: ErElementData
}

interface Counters {
  relation: number
  attribute: number
  direction: number
  end: number
  entityOccurrence: Map<string, number>
}

export class ErParser implements DiagramParser {
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
      relation: 0,
      attribute: 0,
      direction: 0,
      end: 0,
      entityOccurrence: new Map(),
    }
    // 打开的属性块：`ENTITY {` 压栈（块内的属性行归栈顶实体）
    const blockStack: Array<{ lineNo: number }> = []
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
            throw parseFailure(lineNo, '图表必须以 erDiagram 声明开始')
          }
          seenHeader = true
          entries.push({
            span: { start: cursor, end: cursor + line.length },
            id: 'header',
            data: { kind: 'er-header', trailing: header[2] ?? '' },
          })
        } else if (trimmed === '}') {
          const top = blockStack.pop()
          if (top === undefined) {
            throw parseFailure(lineNo, '多余的 }（没有与之匹配的实体属性块）')
          }
          const firstChar = line.length - line.trimStart().length
          counters.end++
          entries.push({
            span: { start: cursor + firstChar, end: cursor + line.length },
            id: `er-end:${counters.end}`,
            data: { kind: 'er-end' },
          })
        } else {
          const firstChar = line.length - line.trimStart().length
          const span = { start: cursor + firstChar, end: cursor + line.length }

          const direction = DIRECTION_RE.exec(line.slice(firstChar))
          if (direction !== null && blockStack.length === 0) {
            counters.direction++
            entries.push({
              span,
              id: `direction:${counters.direction}`,
              data: { kind: 'er-direction', gap: direction[1], value: direction[2] },
            })
          } else if (blockStack.length > 0) {
            // 属性块内部：只认属性行；其余（注释等）逐字保留
            const attr = parseAttributeLine(line, firstChar)
            if (attr !== null) {
              counters.attribute++
              entries.push({ span, id: `attr:${counters.attribute}`, data: attr })
            }
          } else {
            const entity = parseEntityLine(line, firstChar)
            if (entity !== null) {
              const n = (counters.entityOccurrence.get(entity.name) ?? 0) + 1
              counters.entityOccurrence.set(entity.name, n)
              entries.push({ span, id: erEntityElementId(entity.name, n), data: entity })
              if (entity.openBrace) blockStack.push({ lineNo })
            } else {
              const relation = parseRelationLine(line, firstChar)
              if (relation !== null) {
                counters.relation++
                entries.push({ span, id: `relation:${counters.relation}`, data: relation })
              }
              // 其余（style / classDef / class / ::: / 子图 / 注释 / 生僻语法）不解析，逐字保留
            }
          }
        }
      }

      if (nl === -1) break
      cursor = nl + 1
    }

    if (!seenHeader) {
      throw parseFailure(1, '图表必须以 erDiagram 声明开始')
    }
    if (blockStack.length > 0) {
      throw parseFailure(blockStack[blockStack.length - 1].lineNo, '实体属性块缺少匹配的 }')
    }
    return assembleDocument(source, entries)
  }

  // ---------- 意图落地（resolveRewrites） ----------

  resolveRewrites(doc: SourceDocument, intent: EditIntent): ReadonlyMap<string, string> | null {
    switch (intent.type) {
      case 'add-entity':
        return this.resolveAddEntity(doc, intent as never)
      case 'set-alias':
        return this.resolveSetAlias(doc, intent as never)
      case 'delete-entity':
        return this.resolveDeleteEntity(doc, intent as never)
      case 'add-attribute':
        return this.resolveAddAttribute(doc, intent as never)
      case 'set-attribute':
        return this.resolveSetAttribute(doc, intent as never)
      case 'delete-attribute':
        return this.resolveDeleteAttribute(doc, intent as never)
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


  /** 实体属性块开行的匹配 `}`（按 er-entity(openBrace) / er-end 深度计数） */
  private matchingEnd(doc: SourceDocument, decl: { span: Span }): { id: string; span: Span } | null {
    let depth = 1
    for (const part of doc.elements) {
      if (part.span.start <= decl.span.start) continue
      const data = part.element as ErElementData
      if (data.kind === 'er-entity' && data.openBrace) depth++
      if (data.kind === 'er-end') {
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

  private resolveAddEntity(
    doc: SourceDocument,
    intent: Extract<ErIntent, { type: 'add-entity' }>,
  ): Map<string, string> | null {
    if (!isValidErName(intent.name)) return null
    const data: ErEntityData = {
      kind: 'er-entity',
      name: intent.name,
      quoted: false,
      hasBracket: intent.alias !== undefined && intent.alias !== '',
      pre: '',
      alias: intent.alias !== undefined && intent.alias !== '' ? intent.alias : null,
      post: '',
      openBrace: false,
    }
    return insertAfter(doc, {
      afterElementId: intent.afterElementId,
      render: (indent) => indentLines(indent, [renderErEntity(data)]),
    })
  }

  /** 改实体别名（双击内联编辑 / 右键「改别名」）；实体没有声明行时在文档末尾补一行声明 */
  private resolveSetAlias(
    doc: SourceDocument,
    intent: Extract<ErIntent, { type: 'set-alias' }>,
  ): Map<string, string> | null {
    const decl = doc.elements.find(
      (p) => p.element.kind === 'er-entity' && (p.element as ErEntityData).name === intent.name,
    )
    const alias = intent.alias === null ? null : intent.alias.trim() === '' ? null : intent.alias
    if (decl !== undefined) {
      return new Map([[decl.id, renderErEntity(decl.element as ErEntityData, { alias })]])
    }
    if (alias === null || !isValidErName(intent.name)) return new Map()
    const data: ErEntityData = {
      kind: 'er-entity',
      name: intent.name,
      quoted: false,
      hasBracket: true,
      pre: '',
      alias,
      post: '',
      openBrace: false,
    }
    return insertAfter(doc, { render: (indent) => indentLines(indent, [renderErEntity(data)]) })
  }

  private resolveDeleteEntity(
    doc: SourceDocument,
    intent: Extract<ErIntent, { type: 'delete-entity' }>,
  ): Map<string, string> | null {
    const rewrites = new Map<string, string>()
    for (const part of doc.elements) {
      const data = part.element as ErElementData
      if (data.kind === 'er-entity' && data.name === intent.name) {
        rewrites.set(part.id, '')
        if (data.openBrace) {
          const end = this.matchingEnd(doc, part)
          if (end === null) return null
          for (const inner of doc.elements) {
            if (inner.span.start >= part.span.start && inner.span.end <= end.span.end) rewrites.set(inner.id, '')
          }
          rewrites.set(end.id, '')
        }
      } else if (data.kind === 'er-relation') {
        const rel = data
        if (rel.from === intent.name || rel.to === intent.name) rewrites.set(part.id, '')
      }
    }
    return rewrites.size > 0 ? rewrites : null
  }

  /**
   * 加属性：实体有属性块 → 插到匹配 `}` 之前（缩进跟随 `}` 行）；实体无块 → 原地把声明行
   * 改写成「声明 + 单属性块」；隐式实体（仅被关系引用）→ 在文档末尾补声明 + 属性块。
   */
  private resolveAddAttribute(
    doc: SourceDocument,
    intent: Extract<ErIntent, { type: 'add-attribute' }>,
  ): Map<string, string> | null {
    if (!isValidErAttrType(intent.attrType) || !isValidErAttrName(intent.name)) return null
    const data: ErAttributeData = {
      kind: 'er-attribute',
      type: intent.attrType,
      nullable: intent.nullable ?? false,
      gap1: ' ',
      star: false,
      name: intent.name,
      gap2: '',
      keysRaw: (intent.keys ?? []).join(', '),
      gap3: '',
      comment: intent.comment !== undefined && intent.comment !== '' ? intent.comment : null,
      tail: '',
    }
    const line = renderErAttribute(data)
    const decl = doc.elements.find(
      (p) => p.element.kind === 'er-entity' && (p.element as ErEntityData).name === intent.entity,
    )
    if (decl === undefined) {
      // 隐式实体：文档末尾补声明 + 属性块
      if (!isValidErName(intent.entity)) return null
      return insertAfter(doc, {
        afterElementId: intent.afterElementId,
        render: (indent) => indentLines(indent, [`${intent.entity} {`, `    ${line}`, '}']),
      })
    }
    const entity = decl.element as ErEntityData
    if (entity.openBrace) {
      const end = this.matchingEnd(doc, decl)
      if (end === null) return null
      const indent = this.indentOf(doc, end.span)
      return new Map([[end.id, `${indent}${line}\n${doc.source.slice(end.span.start, end.span.end)}`]])
    }
    // 无块实体：声明行原地把尾部空白前的部分补出 ` {` 与块体（post 是纯尾部空白）
    const declIndent = this.indentOf(doc, decl.span)
    const original = doc.source.slice(decl.span.start, decl.span.end)
    const head = original.slice(0, original.length - entity.post.length)
    return new Map([
      [decl.id, `${head} {\n${declIndent}    ${line}\n${declIndent}}`],
    ])
  }

  private resolveSetAttribute(
    doc: SourceDocument,
    intent: Extract<ErIntent, { type: 'set-attribute' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'er-attribute') return null
    const changes = intent.changes
    if (changes.type !== undefined && !isValidErAttrType(changes.type)) return null
    if (changes.name !== undefined && !isValidErAttrName(changes.name)) return null
    return new Map([[part.id, renderErAttribute(part.element as ErAttributeData, changes)]])
  }

  private resolveDeleteAttribute(
    doc: SourceDocument,
    intent: Extract<ErIntent, { type: 'delete-attribute' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'er-attribute') return null
    return new Map([[part.id, '']])
  }

  private resolveAddRelation(
    doc: SourceDocument,
    intent: Extract<ErIntent, { type: 'add-relation' }>,
  ): Map<string, string> | null {
    if (!isValidErCard(intent.cardLeft, 'left') || !isValidErCard(intent.cardRight, 'right')) return null
    if (!isValidErLine(intent.line)) return null
    if (!isValidErName(intent.from) || !isValidErName(intent.to)) return null
    const data: ErRelationData = {
      kind: 'er-relation',
      from: intent.from,
      fromQuoted: false,
      gap1: ' ',
      cardLeft: intent.cardLeft,
      line: intent.line,
      cardRight: intent.cardRight,
      gap2: ' ',
      to: intent.to,
      toQuoted: false,
      colonRaw: intent.label !== undefined && intent.label !== '' ? ' : ' : '',
      label: intent.label ?? '',
    }
    // 锚点是「属性块开行」的实体时，关系必须落在块闭合 `}` 之后——否则会插进块体，
    // 产出 mermaid 拒绝的语法（工单 29 验收发现）。无开行的实体（裸声明）锚点即行末。
    const anchor = resolveAnchor(doc, intent.afterElementId)
    let afterElementId = intent.afterElementId
    if (anchor !== null) {
      const anchorData = anchor.element as ErElementData
      // 锚点是「属性块开行」的实体时，关系必须落在块闭合 `}` 之后——否则会插进块体，
      // 产出 mermaid 拒绝的语法（工单 29 验收发现）。无开行的实体（裸声明）锚点即行末。
      if (anchorData.kind === 'er-entity' && anchorData.openBrace) {
        const end = this.matchingEnd(doc, anchor)
        if (end !== null) afterElementId = end.id
      }
    }
    return insertAfter(doc, {
      afterElementId,
      anchor: 'line-end',
      render: (indent) => indentLines(indent, [renderErRelation(data)]),
    })
  }

  private resolveSetRelation(
    doc: SourceDocument,
    intent: Extract<ErIntent, { type: 'set-relation' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'er-relation') return null
    const changes = intent.changes
    if (changes.cardLeft !== undefined && !isValidErCard(changes.cardLeft, 'left')) return null
    if (changes.cardRight !== undefined && !isValidErCard(changes.cardRight, 'right')) return null
    if (changes.line !== undefined && !isValidErLine(changes.line)) return null
    return new Map([[part.id, renderErRelation(part.element as ErRelationData, changes)]])
  }

  private resolveDeleteRelation(
    doc: SourceDocument,
    intent: Extract<ErIntent, { type: 'delete-relation' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'er-relation') return null
    return new Map([[part.id, '']])
  }

  /** 设置图表方向：有 direction 行就原地改写，没有就插到表头之后；null = 删除该行 */
  private resolveSetDirection(
    doc: SourceDocument,
    intent: Extract<ErIntent, { type: 'set-direction' }>,
  ): Map<string, string> | null {
    const existing = doc.elements.find((part) => (part.element as ErElementData).kind === 'er-direction')
    if (intent.direction === null) {
      return existing === undefined ? new Map() : new Map([[existing.id, '']])
    }
    const value = intent.direction.toUpperCase()
    if (!ER_DIRECTIONS.includes(value)) return null
    if (existing !== undefined) {
      return new Map([[existing.id, renderErDirection(existing.element as ErDirectionData, { value })]])
    }
    const header = doc.elements.find((part) => (part.element as ErElementData).kind === 'er-header')
    if (header === undefined) return null
    return insertAfter(doc, {
      afterElementId: header.id,
      render: (indent) => indentLines(indent, [`direction ${value}`]),
    })
  }
}

export const erParser = new ErParser()

// ---------- 校验（表单层复用，与落地侧同一规则） ----------

/** 新建实体名的合法性：不能为空，不能含空白、引号、方括号、花括号、冒号、逗号 */
export function isValidErName(name: string): boolean {
  return name !== '' && !/[\s"'[\]{}:,]/.test(name)
}

/** 属性类型合法性：首字符须字母（mermaid 词法事实），不能含空白与引号 */
export function isValidErAttrType(type: string): boolean {
  return /^[A-Za-z][^\s"{}]*$/.test(type)
}

/** 属性名合法性：不能为空，不能含空白与引号 */
export function isValidErAttrName(name: string): boolean {
  return name !== '' && !/[\s"{}]/.test(name)
}

/** 基数符号合法性（按左右两侧的符号表把关） */
export function isValidErCard(card: string, side: 'left' | 'right'): boolean {
  return side === 'left' ? (ER_CARD_LEFT as readonly string[]).includes(card) : (ER_CARD_RIGHT as readonly string[]).includes(card)
}

/** 线型合法性：'--'（identifying）或 '..'（non-identifying） */
export function isValidErLine(line: string): boolean {
  return line === '--' || line === '..'
}

// ---------- 基数符号 ↔ 语义值（表单枚举用，零自由文本） ----------

/** 基数语义值（表单枚举）：零或一 / 恰一 / 零或多 / 一或多 */
export type ErCardinality = 'zero-one' | 'one' | 'zero-many' | 'one-many'

/** 表单枚举的固定顺序 */
export const ER_CARDINALITIES: readonly ErCardinality[] = ['zero-one', 'one', 'zero-many', 'one-many']

export const ER_CARD_LEFT_OF: Record<ErCardinality, string> = {
  'zero-one': '|o',
  one: '||',
  'zero-many': '}o',
  'one-many': '}|',
}

export const ER_CARD_RIGHT_OF: Record<ErCardinality, string> = {
  'zero-one': 'o|',
  one: '||',
  'zero-many': 'o{',
  'one-many': '|{',
}

/** 基数符号 → 语义枚举；解析不出（清单外原文）时 null（表单回落恰一显示） */
export function erCardinalityOf(card: string, side: 'left' | 'right'): ErCardinality | null {
  const table = side === 'left' ? ER_CARD_LEFT_OF : ER_CARD_RIGHT_OF
  for (const [semantic, token] of Object.entries(table)) {
    if (token === card) return semantic as ErCardinality
  }
  return null
}

// ---------- 编辑意图（工单 03 表单/画布所需集合） ----------

export interface ErAttributeChanges {
  type?: string
  nullable?: boolean
  name?: string
  keys?: string[]
  comment?: string | null
}

export interface ErRelationChanges {
  cardLeft?: string
  cardRight?: string
  line?: string
  label?: string | null
}

export type ErIntent =
  /** 新增实体声明行（可带别名） */
  | { type: 'add-entity'; name: string; alias?: string; afterElementId?: string }
  /** 改实体别名（双击内联编辑的 set-alias 意图）；null/空 = 去掉别名 */
  | { type: 'set-alias'; name: string; alias: string | null }
  /** 删除实体（声明、属性块整体、触及关系，由管线级联清理） */
  | { type: 'delete-entity'; name: string }
  /** 给实体加属性（实体无块时自动创建块；隐式实体在文档末尾补声明 + 块） */
  | {
      type: 'add-attribute'
      entity: string
      /** 属性类型（意图字段名避开判别字段 type） */
      attrType: string
      name: string
      keys?: string[]
      nullable?: boolean
      comment?: string
      /** 隐式实体落码锚点（实体无声明行时 insertAfter 的锚点；缺省 = 文档末尾） */
      afterElementId?: string
    }
  /** 改属性（按 changes 增量改写；elementId 为 `attr:N`） */
  | { type: 'set-attribute'; elementId: string; changes: ErAttributeChanges }
  | { type: 'delete-attribute'; elementId: string }
  /** 新增关系行（基数符号 × 线型 + 单向标签） */
  | {
      type: 'add-relation'
      from: string
      to: string
      cardLeft: string
      line: string
      cardRight: string
      label?: string
      afterElementId?: string
    }
  /** 改关系（基数 / 线型 / 标签；label null = 去掉标签） */
  | { type: 'set-relation'; elementId: string; changes: ErRelationChanges }
  | { type: 'delete-relation'; elementId: string }
  /** 设置图表方向；null = 删除 direction 行（跟随 mermaid 默认） */
  | { type: 'set-direction'; direction: string | null }
