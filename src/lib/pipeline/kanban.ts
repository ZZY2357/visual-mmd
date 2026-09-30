import { assembleDocument, getElementById, type ElementPart, type SourceDocument } from './document'
import type { DiagramParser, EditIntent, ParseResult, SourceParseError } from './parser'
import { frontmatterEnd } from './frontmatter'
import { kanbanCardElementId, kanbanColumnElementId } from './element-id'
import type { Span } from './span'
import { insertAfter, lineIndent } from './insert'

/**
 * kanban 完整解析器（more-diagrams 工单 06，语法事实以 spec 的
 * research/timeline-kanban-requirement.md 的 kanban 部分为准）：
 * 手写、逐行、带 span（ADR-0004）。可测试承诺：解析后不做修改再重组装，
 * 输出与输入逐字相同（verbatim identity）。
 *
 * 覆盖（分层对齐，spec 决策）：
 * - 列：`columnId[标题]`（分组元素）
 * - 卡片：缩进于列下，`taskId[描述]`（节点元素）
 * - 卡片元数据：`@{ assigned / ticket / priority }`（保留未托管键 icon / label / shape 逐字）
 *
 * 缩进即语法（mermaid kanbanDb.getSection 的事实）：**首个节点**的缩进宽度即「列层级」
 * （sectionLevel），与之等宽的节点是列，更深的节点是其上方最近一列的卡片；比 sectionLevel
 * 更浅的节点在 mermaid 里直接抛 `Items without section detected`，这里等价地解析失败。
 * 层级 = 行首空白字符数（mermaid SPACELIST.length，制表符按 1 计）。
 *
 * 行文法（mermaid 词法事实）：`ID` = 不含 `[ ] ( ) { } @` 与换行的串（这里额外禁空白）；
 * 描述 = `[...]` 内、不含 `] ( ) }` 与换行的文本（可含空格）；元数据段 `@{ ... }` 必须
 * **紧跟 `]`**（`] @{` 会被 mermaid 词法 lex 成 SPACELIST 而报错），其内引号成对出现、
 * `}` 只在引号外收尾。任一处不符即整行原样保留（清单外语法不报错，ADR-0008）。
 *
 * span 约定：span **含行首缩进与行尾换行**（缩进是语法的一部分，见 mindmap 解析器同口径），
 * 因此删除一行会连同缩进与换行一并干净移除；改写单行时原样回写缩进与换行。
 * 不解析（原样保留）：frontmatter、`%%` 注释、空行、无法识别的行。
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

export interface KanbanHeaderData {
  kind: 'kanban-header'
  /** 关键字之后的原文（尾部空白），逐字保留 */
  trailing: string
}

/**
 * 列 / 卡片共用的声明行数据。缩进与换行都属元素本身（缩进即语法）。
 * 词法约束：`@{` 必须紧跟 `]`（二者间不容空白），故无「间隔」字段；`metaRaw` = `@{ ... }`
 * 原文（含定界符）；`trailing` = 行尾空白。
 */
export interface KanbanNodeData {
  kind: 'kanban-column' | 'kanban-card'
  /** 行首缩进原文 */
  indent: string
  /** 层级 = 行首空白字符数（mermaid SPACELIST.length） */
  level: number
  /** 节点 id（语法标识 / 画布 data-id / 编辑意图寻址都用它） */
  id: string
  /** id 与 `[` 之间的空白 */
  gap: string
  /** 方括号内文本（列标题 / 卡片描述） */
  text: string
  /** `@{ ... }` 原文（含定界符）；无元数据 null */
  metaRaw: string | null
  /** 行尾空白 */
  trailing: string
  /** 行尾换行符（文档最后一行可能为空串） */
  eol: string
}

export type KanbanElementData = KanbanHeaderData | KanbanNodeData

// ---------- 元数据（`@{ ... }`） ----------

/** 卡片元数据（工单管理三字段）；未设置的字段为 null */
export interface KanbanMetadata {
  assigned: string | null
  ticket: string | null
  priority: string | null
}

/** mermaid 文档记载的 priority 取值（research 已核查；其余取值渲染时不着色） */
export const KANBAN_PRIORITIES = ['Very High', 'High', 'Low', 'Very Low'] as const

export type KanbanPriority = (typeof KANBAN_PRIORITIES)[number]

export function isKanbanPriority(value: string): value is KanbanPriority {
  return (KANBAN_PRIORITIES as readonly string[]).includes(value)
}

/** 按顶层逗号切分（引号内的逗号不算分隔符） */
function splitTopLevel(text: string): string[] {
  const out: string[] = []
  let quote: string | null = null
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quote !== null) {
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === ',') {
      out.push(text.slice(start, i))
      start = i + 1
    }
  }
  out.push(text.slice(start))
  return out.map((entry) => entry.trim()).filter((entry) => entry !== '')
}

/** 去掉成对的起止引号（' 或 "） */
function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0]
    if ((first === "'" || first === '"') && value[value.length - 1] === first) {
      return value.slice(1, -1)
    }
  }
  return value
}

/**
 * 解析 `@{ ... }` 原文为三字段元数据；缺字段为 null，非托管键（icon / label / shape）忽略。
 * 无元数据段时返回全 null。
 */
export function parseKanbanMeta(metaRaw: string | null): KanbanMetadata {
  const result: KanbanMetadata = { assigned: null, ticket: null, priority: null }
  if (metaRaw === null) return result
  const inner = metaRaw.slice(2, -1) // 去掉 '@{' 与 '}'
  for (const entry of splitTopLevel(inner)) {
    const idx = entry.indexOf(':')
    if (idx === -1) continue
    const key = entry.slice(0, idx).trim()
    const value = unquote(entry.slice(idx + 1).trim())
    if (key === 'assigned') result.assigned = value
    else if (key === 'ticket') result.ticket = value
    else if (key === 'priority') result.priority = value
  }
  return result
}

/**
 * 重建 `@{ ... }` 段（含定界符），返回 '' 表示无元数据。
 * 手术式：非托管键（icon / label / shape 等）从 prevRaw 逐字保留，只增删改
 * assigned / ticket / priority 三项，顺序固定为 assigned → ticket → priority。
 */
export function renderKanbanMeta(prevRaw: string | null, meta: KanbanMetadata): string {
  const entries: string[] = []
  if (prevRaw !== null) {
    for (const entry of splitTopLevel(prevRaw.slice(2, -1))) {
      const idx = entry.indexOf(':')
      if (idx === -1) continue
      const key = entry.slice(0, idx).trim()
      if (key === 'assigned' || key === 'ticket' || key === 'priority') continue
      entries.push(entry)
    }
  }
  const add = (key: string, value: string | null): void => {
    if (value === null || value === '') return
    entries.push(`${key}: '${value}'`)
  }
  add('assigned', meta.assigned)
  add('ticket', meta.ticket)
  add('priority', meta.priority)
  return entries.length === 0 ? '' : `@{ ${entries.join(', ')} }`
}

// ---------- 行级解析 ----------

const HEADER_RE = /^([ \t]*)(kanban)([ \t\r]*)$/

interface ParsedNodeLine {
  indent: string
  level: number
  id: string
  gap: string
  text: string
  metaRaw: string | null
  trailing: string
}

/** 从 `@{` 起找配对的 `}`（引号内的 `}` 不算）；返回 `}` 的下标，找不到 -1。from 指向 '@' */
function scanMetaEnd(text: string, from: number): number {
  let quote: string | null = null
  for (let i = from + 2; i < text.length; i++) {
    const ch = text[i]
    if (quote !== null) {
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === '}') return i
  }
  return -1
}

/** 解析 `id[text]` + 可选 `@{...}` 的节点行；不合文法返回 null（整行原样保留） */
function parseNodeLine(line: string): ParsedNodeLine | null {
  const indentM = /^[ \t]*/.exec(line)
  const indent = indentM !== null ? indentM[0] : ''
  const body = line.slice(indent.length)
  const idm = /^[^\[\n(){}@]+/.exec(body)
  if (idm === null) return null
  const rawId = idm[0]
  const id = rawId.replace(/[ \t]+$/, '')
  if (id === '') return null
  const gap = rawId.slice(id.length)
  let rest = body.slice(rawId.length)
  if (!rest.startsWith('[')) return null
  const close = rest.indexOf(']', 1)
  if (close === -1) return null
  const text = rest.slice(1, close)
  rest = rest.slice(close + 1)

  let metaRaw: string | null = null
  let trailing: string
  // mermaid 词法：`@{` 必须**紧跟** `]`（`] @{` 会 lex 成 SPACELIST，解析报错），
  // 故元数据段前不允许空白——否则解析出的行无法原样回写成合法 mermaid。
  if (rest.startsWith('@{')) {
    const end = scanMetaEnd(rest, 0)
    if (end === -1) return null
    metaRaw = rest.slice(0, end + 1)
    trailing = rest.slice(end + 1)
    if (!/^[ \t\r]*$/.test(trailing)) return null
  } else {
    if (!/^[ \t\r]*$/.test(rest)) return null
    trailing = rest
  }
  return { indent, level: indent.length, id, gap, text, metaRaw, trailing }
}

interface RawEntry {
  span: Span
  id: string
  data: KanbanElementData
}

export class KanbanParser implements DiagramParser {
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
    const columnOccurrence = new Map<string, number>()
    const cardOccurrence = new Map<string, number>()
    let seenHeader = false
    // 「列层级」= 首个节点的缩进宽度（mermaid getSection）；更深的节点是其上最近一列的卡片
    let sectionLevel: number | null = null
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

      if (trimmed !== '') {
        if (!seenHeader) {
          const header = HEADER_RE.exec(line)
          if (header === null) {
            throw parseFailure(lineNo, '图表必须以 kanban 声明开始')
          }
          seenHeader = true
          entries.push({
            span: { start: cursor, end: cursor + line.length + eol.length },
            id: 'kanban-header',
            data: { kind: 'kanban-header', trailing: (header[3] ?? '').replace(/\r$/, '') },
          })
        } else if (trimmed.startsWith('%%')) {
          // 注释行：逐字保留，不参与结构
        } else {
          const node = parseNodeLine(line)
          if (node !== null) {
            const span = { start: cursor, end: cursor + line.length + eol.length }
            if (sectionLevel === null) sectionLevel = node.level
            if (node.level < sectionLevel) {
              throw parseFailure(lineNo, '缺少列：卡片必须缩进于某一列之下')
            }
            // 与列层级等宽 = 列；更深 = 其上方最近一列的卡片
            const kind = node.level === sectionLevel ? 'kanban-column' : 'kanban-card'
            const occurrence = kind === 'kanban-column' ? columnOccurrence : cardOccurrence
            const n = (occurrence.get(node.id) ?? 0) + 1
            occurrence.set(node.id, n)
            const elementId =
              kind === 'kanban-column' ? kanbanColumnElementId(node.id, n) : kanbanCardElementId(node.id, n)
            entries.push({ span, id: elementId, data: { kind, ...node, eol } })
          }
          // 其余（无法识别的行）：不解析，逐字保留
        }
      }

      if (nl === -1) break
      cursor = nl + 1
    }

    if (!seenHeader) {
      throw parseFailure(1, '图表必须以 kanban 声明开始')
    }
    return assembleDocument(source, entries)
  }

  // ---------- 意图落地（resolveRewrites） ----------

  resolveRewrites(doc: SourceDocument, intent: EditIntent): ReadonlyMap<string, string> | null {
    switch (intent.type) {
      case 'add-column':
        return this.resolveAddColumn(doc, intent as never)
      case 'set-column-title':
        return this.resolveSetColumnTitle(doc, intent as never)
      case 'delete-column':
        return this.resolveDeleteColumn(doc, intent as never)
      case 'add-card':
        return this.resolveAddCard(doc, intent as never)
      case 'set-description':
        return this.resolveSetDescription(doc, intent as never)
      case 'set-metadata':
        return this.resolveSetMetadata(doc, intent as never)
      case 'delete-card':
        return this.resolveDeleteCard(doc, intent as never)
      default:
        return null
    }
  }

  private columnPart(doc: SourceDocument, elementId: string): ElementPart | null {
    const part = getElementById(doc, elementId)
    return part !== undefined && part.element.kind === 'kanban-column' ? part : null
  }

  private cardPart(doc: SourceDocument, elementId: string): ElementPart | null {
    const part = getElementById(doc, elementId)
    return part !== undefined && part.element.kind === 'kanban-card' ? part : null
  }

  /** 某列的卡片（文档序：该列行之后、下一列行之前的全部卡片） */
  private cardsOfColumn(doc: SourceDocument, columnElementId: string): ElementPart[] {
    const out: ElementPart[] = []
    let current: string | null = null
    for (const part of doc.elements) {
      if (part.element.kind === 'kanban-column') current = part.id
      else if (part.element.kind === 'kanban-card' && current === columnElementId) out.push(part)
    }
    return out
  }

  /** 在锚点元素之后插入整行（新行自带缩进与换行）：走共享内核，见 pipeline/insert.ts */
  private insertLinesAfter(doc: SourceDocument, anchorId: string | undefined, lines: string[]): Map<string, string> | null {
    return insertAfter(doc, {
      afterElementId: anchorId,
      render: (_indent, original) => (/[\n\r]$/.test(original) ? '' : '\n') + lines.join(''),
    })
  }

  /**
   * 新增列：缩进取现有首列，无列时取表头缩进 + 一档（默认 2 空格）。
   * 终场追加时 anchor 缺省 = 文档末尾（resolveAnchor 回退语义）。
   */
  private resolveAddColumn(
    doc: SourceDocument,
    intent: Extract<KanbanIntent, { type: 'add-column' }>,
  ): Map<string, string> | null {
    if (!isValidKanbanId(intent.id) || !isValidKanbanText(intent.title)) return null
    const firstColumn = doc.elements.find((part) => part.element.kind === 'kanban-column')
    let indent: string
    if (firstColumn !== undefined) {
      indent = (firstColumn.element as KanbanNodeData).indent
    } else {
      const header = doc.elements.find((part) => part.element.kind === 'kanban-header')
      indent = (header !== undefined ? lineIndent(doc.source, header.span.start) : '') + '  '
    }
    const line = renderKanbanNode({
      kind: 'kanban-column',
      indent,
      level: indent.length,
      id: intent.id,
      gap: '',
      text: intent.title,
      metaRaw: null,
      trailing: '',
      eol: '\n',
    })
    return this.insertLinesAfter(doc, intent.afterElementId, [line])
  }

  private resolveSetColumnTitle(
    doc: SourceDocument,
    intent: Extract<KanbanIntent, { type: 'set-column-title' }>,
  ): Map<string, string> | null {
    const part = this.columnPart(doc, intent.elementId)
    if (part === null || !isValidKanbanText(intent.title)) return null
    return new Map([[part.id, renderKanbanNode(part.element as KanbanNodeData, { text: intent.title })]])
  }

  private resolveDeleteColumn(
    doc: SourceDocument,
    intent: Extract<KanbanIntent, { type: 'delete-column' }>,
  ): Map<string, string> | null {
    const part = this.columnPart(doc, intent.elementId)
    if (part === null) return null
    const rewrites = new Map<string, string>()
    rewrites.set(part.id, '')
    for (const card of this.cardsOfColumn(doc, part.id)) rewrites.set(card.id, '')
    return rewrites
  }

  /**
   * 给列加卡片：落在该列已有卡片之后（无卡片则紧随列行）；缩进跟随已有的同类卡片，
   * 否则列缩进 + 一档（默认 2 空格）。
   */
  private resolveAddCard(
    doc: SourceDocument,
    intent: Extract<KanbanIntent, { type: 'add-card' }>,
  ): Map<string, string> | null {
    if (!isValidKanbanId(intent.id) || !isValidKanbanText(intent.description)) return null
    const columnPart = this.columnPart(doc, intent.columnElementId)
    if (columnPart === null) return null
    const column = columnPart.element as KanbanNodeData
    const cards = this.cardsOfColumn(doc, intent.columnElementId)
    const last = cards[cards.length - 1]
    const indent = last !== undefined ? (last.element as KanbanNodeData).indent : column.indent + '  '
    const anchorId = last !== undefined ? last.id : columnPart.id
    const line = renderKanbanNode({
      kind: 'kanban-card',
      indent,
      level: indent.length,
      id: intent.id,
      gap: '',
      text: intent.description,
      metaRaw: null,
      trailing: '',
      eol: '\n',
    })
    return this.insertLinesAfter(doc, anchorId, [line])
  }

  private resolveSetDescription(
    doc: SourceDocument,
    intent: Extract<KanbanIntent, { type: 'set-description' }>,
  ): Map<string, string> | null {
    const part = this.cardPart(doc, intent.elementId)
    if (part === null || !isValidKanbanText(intent.description)) return null
    return new Map([[part.id, renderKanbanNode(part.element as KanbanNodeData, { text: intent.description })]])
  }

  private resolveSetMetadata(
    doc: SourceDocument,
    intent: Extract<KanbanIntent, { type: 'set-metadata' }>,
  ): Map<string, string> | null {
    const part = this.cardPart(doc, intent.elementId)
    if (part === null) return null
    const meta = intent.metadata
    if (meta !== null) {
      for (const value of [meta.assigned, meta.ticket, meta.priority]) {
        if (value !== null && value !== '' && !isValidKanbanMetaValue(value)) return null
      }
      if (meta.priority !== null && meta.priority !== '' && !isKanbanPriority(meta.priority)) return null
    }
    return new Map([[part.id, renderKanbanNode(part.element as KanbanNodeData, { meta })]])
  }

  private resolveDeleteCard(
    doc: SourceDocument,
    intent: Extract<KanbanIntent, { type: 'delete-card' }>,
  ): Map<string, string> | null {
    const part = this.cardPart(doc, intent.elementId)
    if (part === null) return null
    return new Map([[part.id, '']])
  }
}

export const kanbanParser = new KanbanParser()

/**
 * 节点行原文重建。`changes.text` 改方括号内文本；`changes.meta`：
 * - 省略（undefined）= 元数据段逐字保留
 * - null = 移除元数据段
 * - 对象 = 按三字段重建（未托管键从 metaRaw 逐字保留）
 * 缩进、id、间隔、行尾空白与换行都逐字保留。
 */
export function renderKanbanNode(
  d: KanbanNodeData,
  changes: { text?: string; meta?: KanbanMetadata | null } = {},
): string {
  const text = changes.text !== undefined ? changes.text : d.text
  const metaPart =
    changes.meta === undefined
      ? (d.metaRaw ?? '')
      : changes.meta === null
        ? ''
        : renderKanbanMeta(d.metaRaw, changes.meta)
  // 词法约束：`@{` 紧跟 `]`——不注入空白（否则产出非法 mermaid）。
  return d.indent + d.id + d.gap + '[' + text + ']' + metaPart + d.trailing + d.eol
}

// ---------- 校验（表单层复用，与落地侧同一规则） ----------

/** 新建列 / 卡片 id 的合法性：不能为空，不能含空白与 `[ ] ( ) { } @`（mermaid 词法事实 + 无空白约束） */
export function isValidKanbanId(id: string): boolean {
  return id !== '' && !/[\s[\](){}@]/.test(id)
}

/** 列标题 / 卡片描述合法性：不能为空白，不能含 `] ( ) }` 与换行（mermaid NODE_DESCR 词法事实） */
export function isValidKanbanText(text: string): boolean {
  return text.trim() !== '' && !/[\]()}\r\n]/.test(text)
}

/** 元数据取值合法性：不能含单引号（渲染时以单引号包裹）与换行 */
export function isValidKanbanMetaValue(value: string): boolean {
  return !/['\r\n]/.test(value)
}

// ---------- 编辑意图（工单 06 表单 / 画布所需集合） ----------

export type KanbanIntent =
  /** 新增列；afterElementId 缺省 = 文档末尾追加（空白右键「加列」） */
  | { type: 'add-column'; id: string; title: string; afterElementId?: string }
  /** 改列标题（双击内联编辑 / 右键「改标题」） */
  | { type: 'set-column-title'; elementId: string; title: string }
  /** 删除列：连同其全部卡片一起移除 */
  | { type: 'delete-column'; elementId: string }
  /** 给某列加卡片（键盘 Tab / 右键「加卡片」）；落在该列已有卡片之后 */
  | { type: 'add-card'; columnElementId: string; id: string; description: string }
  /** 改卡片描述（双击内联编辑）；elementId 为 `kanban-card:<id>` */
  | { type: 'set-description'; elementId: string; description: string }
  /** 改卡片元数据（assigned / ticket / priority）；null = 移除元数据段 */
  | { type: 'set-metadata'; elementId: string; metadata: KanbanMetadata | null }
  /** 删除卡片（键盘 Delete / 右键「删除」） */
  | { type: 'delete-card'; elementId: string }
