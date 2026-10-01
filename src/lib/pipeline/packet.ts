import { assembleDocument, getElementById, type ElementPart, type SourceDocument } from './document'
import { frontmatterEnd } from './frontmatter'
import { insertAfter } from './insert'
import type { DiagramParser, EditIntent, ParseResult, SourceParseError } from './parser'
import type { Span } from './span'

/**
 * packet（字节分包图）完整解析器（more-diagrams 工单 16，语法事实以 spec 的
 * research/data-display.md packet 节 + mermaid 12.0.0 实测为准）：手写、逐行、带 span
 * （ADR-0004）。可测试承诺：解析后不做修改再重组装，输出与输入逐字相同（verbatim identity）。
 *
 * 覆盖（分层对齐，工单定案）：
 * - 声明头 `packet` / `packet-beta`（两个关键字 mermaid 都渲染，detect 同认）
 * - 字段行三种形态：`start-end: "name"` / `start: "name"`（单 bit）/ `+count: "name"`
 *   （计数位，自前序字段结束位 +1 起）；名称必须带引号（STR，内容 `[^"]*`，可含冒号
 *   与空格，无转义机制——mermaid langium 词法实测）；行尾 `%%` 注释进 tail 逐字保留；
 *   数字两侧空白松散形态（`0 - 15 : "A"`、`+ 8 : "B"`）合法
 * - **位区间语义（工单定案）**：`+count` 与 `start:` 形态解析后由投影归一为绝对区间
 *   （依赖前序字段结束位）；落码保留原形态。改 name 不动位；改位区间用 start-end
 *   绝对形态落码
 * - **区间校验（工单定案「重叠/回退拒绝落码」的升格口径）**：mermaid 12 的 populate
 *   （diagram-MLGK6HIB.mjs `start !== lastBit + 1` 即抛错，实测）要求**全序列严格连续**——
 *   间隙 / 重叠 / 回退同样令整图渲染失败，故落码校验按全序列连续性执行（覆盖工单的
 *   重叠/回退，外加间隙；依据 research「位区间连续/递增由校验层负责」）。已存在的
 *   手写非法源码仍逐行解析为元素、由结构树标注（pie valuePositive 同口径），但任何
 *   落码编辑都会校验结果序列，绝不产出新的非法 mermaid
 *
 * 词法与校验边界（mermaid 12 实测，工单 Comments 记录证据）：
 * - 数字 = 非负整数（无前导零、无负号、无小数——`00` / `-1` 词法直接报错）
 * - `+0` / `end < start`（如 `5-3`）→ mermaid populate 抛错 → 整行不解析为元素
 *   （逐字保留；与 quadrant 越界坐标行同口径）
 * - 名称必须带引号；`0-15: "A";`（分号）与 `0-15: A`（裸名）词法报错 → 整行不解析
 * - config（frontmatter / `%%{init}%%`）与 `%%` 注释、accTitle / accDescr（含多行
 *   accDescr {}）逐字保留（工单明确不做 config 编辑）
 *
 * span 约定（与 pie/quadrant 同口径，行级）：行首缩进与换行留在 verbatim；元素 span
 * 不跨行。无法识别的行原样保留（清单外语法不报错，ADR-0008）。
 *
 * 身份（ADR-0012 位置序 + 字面量）：字段 `field:N` 按文档序 1 基编号（packet 语法里
 * 字段没有 id，位置序是唯一可行身份）。
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

export interface PacketHeaderData {
  kind: 'packet-header'
}

/**
 * 字段行的位形态（数字为原文——词法保证已是规范十进制，无前导零/负号/小数）：
 * - `range`：`start-end`（双段）
 * - `single`：`start`（单 bit，mermaid 语义 = end = start）
 * - `count`：`+count`（计数位，绝对起点依赖前序字段——由投影归一）
 */
export type PacketFieldForm =
  | { kind: 'range'; start: string; end: string }
  | { kind: 'single'; start: string }
  | { kind: 'count'; count: string }

/**
 * 字段行数据。行形状：`prefixRaw gap1 ':' gap2 '"' name '"' tail`。
 * 未触碰字段逐字保留；改动任一字段只重写该字段（ADR-0004 手术边界）。
 * - `prefixRaw` 是冒号前位前缀的**原文**（`0 - 15` / `+ 8` / `5`，松散空白原样）；
 *   改位区间时以 `start-end` 绝对形态整段重写（工单定案），改 name 时不触碰
 * - `tail` 是闭引号后的行尾（空白 + `%%` 注释），逐字保留
 */
export interface PacketFieldData {
  kind: 'packet-field'
  prefixRaw: string
  gap1: string
  gap2: string
  name: string
  form: PacketFieldForm
  tail: string
}

// ---------- 行原文重建（resolveRewrites 的手术边界） ----------

/** 字段行原文重建。changes 任一字段缺省 = 逐字保留原文 */
export function renderPacketField(
  d: PacketFieldData,
  changes: { name?: string; prefixRaw?: string } = {},
): string {
  const prefixRaw = changes.prefixRaw ?? d.prefixRaw
  const name = changes.name ?? d.name
  return `${prefixRaw}${d.gap1}:${d.gap2}"${name}"${d.tail}`
}

// ---------- 词法助手与校验 ----------

/** 字段位数字原文（mermaid 词法：非负整数，无前导零） */
const PACKET_NUMBER_RE = /^(?:0|[1-9][0-9]*)$/

/** 位前缀形态（松散空白按 mermaid 词法容忍）：`start-end` / `start` / `+count` */
const FIELD_PREFIX_RE = /^(\d+[ \t]*-[ \t]*\d+|\+[ \t]*\d+|\d+)/

export function parsePacketNumber(value: string): number | null {
  return PACKET_NUMBER_RE.test(value) ? Number(value) : null
}

/**
 * 位前缀原文 → 形态（数字不合法 / 回退区间 / 零计数返回 null——这些形态 mermaid
 * populate 直接抛错，整行不解析为元素；与 quadrant 越界坐标行同口径）。
 */
export function parsePacketForm(prefixRaw: string): PacketFieldForm | null {
  const m = FIELD_PREFIX_RE.exec(prefixRaw)
  if (m === null || m[0].length !== prefixRaw.length) return null
  const raw = m[0]
  if (raw.includes('-')) {
    const [startRaw, endRaw] = raw.split('-').map((part) => part.trim())
    const start = parsePacketNumber(startRaw)
    const end = parsePacketNumber(endRaw)
    // 回退区间（end < start）mermaid 抛错 → 不解析
    if (start === null || end === null || end < start) return null
    return { kind: 'range', start: startRaw, end: endRaw }
  }
  if (raw.startsWith('+')) {
    const count = parsePacketNumber(raw.replace(/^[ \t]*\+[ \t]*/, '').trim())
    // 零计数 mermaid 抛错（Cannot have a zero bit field）→ 不解析
    if (count === null || count === 0) return null
    return { kind: 'count', count: raw.replace(/^[ \t]*\+[ \t]*/, '').trim() }
  }
  const start = parsePacketNumber(raw)
  if (start === null) return null
  return { kind: 'single', start: raw }
}

/** 字段名合法性（表单/落码侧）：非空、不含引号（STR 无转义）与换行 */
export function isValidPacketFieldName(name: string): boolean {
  const trimmed = name.trim()
  return trimmed !== '' && !/["\n]/.test(trimmed)
}

/** 加字段 / Tab 加点的缺省位宽（一个字节，8 位——场景「+count 形态」的合理缺省） */
export const PACKET_DEFAULT_FIELD_COUNT = 8

// ---------- 区间归一与连续性校验（工单定案：校验层负责连续/递增） ----------

/** 归一后的绝对位区间 */
export interface PacketAbsoluteRange {
  start: number
  end: number
}

/**
 * 单个字段的绝对区间（不计序列上下文）：range = [start, end]；single = [start, start]；
 * count 依赖前序字段结束位（context），无上下文时 null。
 */
export function absoluteRangeOf(form: PacketFieldForm, previousEnd: number): PacketAbsoluteRange | null {
  switch (form.kind) {
    case 'range': {
      const start = parsePacketNumber(form.start)
      const end = parsePacketNumber(form.end)
      if (start === null || end === null) return null
      return { start, end }
    }
    case 'single': {
      const start = parsePacketNumber(form.start)
      if (start === null) return null
      return { start, end: start }
    }
    case 'count': {
      const count = parsePacketNumber(form.count)
      if (count === null || count === 0) return null
      return { start: previousEnd + 1, end: previousEnd + count }
    }
  }
}

/** 位形态 → 绝对 start-end 前缀落码文本（工单定案：改位区间用绝对形态） */
export function renderRangePrefix(range: PacketAbsoluteRange): string {
  return `${range.start}-${range.end}`
}

/**
 * 序列连续性校验（工单 16 落码门，覆盖重叠/回退/间隙——mermaid 12 populate 实测
 * 三者同样抛错）：按顺序归一每个字段的绝对区间，显式起点（range/single）必须恰好
 * 接在前序结束位 +1 上（首个字段必须从 0 开始）；count 形态自动衔接。任一字段
 * 违反 → false。`fields` 传归一前的形态序列（允许以 { form } 最小形状参与校验）。
 */
export function isContiguousFieldSequence(
  fields: ReadonlyArray<{ form: PacketFieldForm }>,
): boolean {
  let previousEnd = -1
  for (const { form } of fields) {
    if (form.kind !== 'count') {
      // 显式起点必须精确衔接（首个字段从 0 起）——间隙/重叠/回退在此拦截
      const explicitStart =
        form.kind === 'range' ? parsePacketNumber(form.start) : parsePacketNumber(form.start)
      if (explicitStart === null || explicitStart !== previousEnd + 1) return false
    }
    const range = absoluteRangeOf(form, previousEnd)
    if (range === null || range.end < range.start) return false
    previousEnd = range.end
  }
  return true
}

// ---------- 解析器 ----------

interface RawEntry {
  span: Span
  id: string
  data: PacketHeaderData | PacketFieldData
}

const HEADER_RE = /^packet(?:-beta)?[ \t]*$/i
const ACC_PREFIX = /^acc(?:Title|Descr)\b/i

/**
 * 字段行解析：`prefix gap1 ':' gap2 '"' name '"' tail`。
 * 形态非法（回退区间 / 零计数 / 前导零 / 负数 / 裸名 / 分号 / 闭引号后残留）→ null
 * （整行原样保留——这些形态 mermaid 词法或 populate 本身就报错，不产出幽灵元素）。
 */
function parseFieldLine(body: string): PacketFieldData | null {
  const prefix = FIELD_PREFIX_RE.exec(body)
  if (prefix === null) return null
  const prefixRaw = prefix[0]
  const form = parsePacketForm(prefixRaw)
  if (form === null) return null
  const rest = body.slice(prefixRaw.length)
  const m = /^([ \t]*):([ \t]*)"([^"]*)"(.*)$/.exec(rest)
  if (m === null) return null
  const [, gap1, gap2, name, tail] = m
  // 闭引号后只允许空白与 `%%` 注释（其余残留 mermaid 词法报错）
  if (!/^[ \t]*(?:%%.*)?$/.test(tail)) return null
  return { kind: 'packet-field', prefixRaw, gap1, gap2, name, form, tail }
}

export class PacketParser implements DiagramParser {
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
    let fieldCount = 0
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
            throw parseFailure(lineNo, '图表必须以 packet / packet-beta 声明开始')
          }
          seenHeader = true
          entries.push({
            span: spanOfLine(),
            id: 'packet-header',
            data: { kind: 'packet-header' },
          })
        } else if (trimmed.startsWith('%%') || ACC_PREFIX.test(trimmed)) {
          // 注释 / 可访问性语句（含多行 accDescr {} 的花括号行，工单不做编辑）：逐字保留
        } else {
          const field = parseFieldLine(body)
          if (field !== null) {
            fieldCount++
            entries.push({ span: spanOfLine(), id: `field:${fieldCount}`, data: field })
          }
          // config / 清单外行：不解析，逐字保留（工单定案不做 config 编辑）
        }
      }

      if (nl === -1) break
      cursor = nl + 1
    }

    if (!seenHeader) {
      throw parseFailure(1, '图表必须以 packet / packet-beta 声明开始')
    }
    return assembleDocument(source, entries)
  }

  // ---------- 意图落地（resolveRewrites） ----------

  resolveRewrites(doc: SourceDocument, intent: EditIntent): ReadonlyMap<string, string> | null {
    switch (intent.type) {
      case 'add-field':
        return this.resolveAddField(doc, intent as never)
      case 'set-field-name':
        return this.resolveSetFieldName(doc, intent as never)
      case 'set-field-range':
        return this.resolveSetFieldRange(doc, intent as never)
      case 'delete-field':
        return this.resolveDeleteField(doc, intent as never)
      default:
        return null
    }
  }

  private fieldPart(doc: SourceDocument, elementId: string): ElementPart | null {
    const part = getElementById(doc, elementId)
    return part !== undefined && part.element.kind === 'packet-field' ? part : null
  }

  /** 按文档序收集全部字段的 (id, data)；用于序列级校验 */
  private fieldsOf(doc: SourceDocument): Array<{ id: string; form: PacketFieldForm }> {
    return doc.elements
      .filter((p) => p.element.kind === 'packet-field')
      .map((p) => ({ id: p.id, form: (p.element as PacketFieldData).form }))
  }

  /**
   * 新增字段（+count 形态，自动衔接前序——工单定案 Tab/空白加字的形态）：追加在锚点
   * 字段之后（缺省 = 文档末尾）；名称与计数必须可落码。count 形态恒连续，但结果
   * 序列仍过全序列校验（锚点后若存在显式起点字段会因位移被拒——绝不产出非法 mermaid）。
   */
  private resolveAddField(
    doc: SourceDocument,
    intent: Extract<PacketIntent, { type: 'add-field' }>,
  ): Map<string, string> | null {
    const name = intent.name.trim()
    const count = intent.count.trim()
    if (!isValidPacketFieldName(name)) return null
    if (parsePacketNumber(count) === null || Number(count) === 0) return null
    const afterForm: PacketFieldForm = { kind: 'count', count }
    // 结果序列校验：新增字段插在锚点（或末尾）之后
    const fields = this.fieldsOf(doc)
    const anchorIndex =
      intent.afterElementId === undefined
        ? fields.length
        : fields.findIndex((f) => f.id === intent.afterElementId) + 1
    if (anchorIndex === 0 && intent.afterElementId !== undefined) return null
    const sequence = [...fields.slice(0, anchorIndex), { id: '', form: afterForm }, ...fields.slice(anchorIndex)]
    if (!isContiguousFieldSequence(sequence)) return null
    return insertAfter(doc, {
      afterElementId: intent.afterElementId,
      anchor: 'line-end',
      render: (indent) => `\n${indent}+${count}: "${name}"`,
    })
  }

  /** 改字段名（双击内联编辑 / 表单 / 菜单共用）：位前缀与形态逐字保留 */
  private resolveSetFieldName(
    doc: SourceDocument,
    intent: Extract<PacketIntent, { type: 'set-field-name' }>,
  ): Map<string, string> | null {
    const part = this.fieldPart(doc, intent.elementId)
    const name = intent.name.trim()
    if (part === null || !isValidPacketFieldName(name)) return null
    return new Map([[part.id, renderPacketField(part.element as PacketFieldData, { name })]])
  }

  /**
   * 改位区间（工单定案：以 start-end 绝对形态落码）：start/end 为非负整数且 end >= start；
   * 结果全序列必须连续（间隙/重叠/回退拒绝落码——mermaid 12 实测整图渲染失败）。
   */
  private resolveSetFieldRange(
    doc: SourceDocument,
    intent: Extract<PacketIntent, { type: 'set-field-range' }>,
  ): Map<string, string> | null {
    const part = this.fieldPart(doc, intent.elementId)
    const start = intent.start.trim()
    const end = intent.end.trim()
    const startNum = parsePacketNumber(start)
    const endNum = parsePacketNumber(end)
    if (part === null || startNum === null || endNum === null || endNum < startNum) return null
    const fields = this.fieldsOf(doc)
    const sequence = fields.map((f) =>
      f.id === intent.elementId ? { ...f, form: { kind: 'range', start, end } as PacketFieldForm } : f,
    )
    if (!isContiguousFieldSequence(sequence)) return null
    return new Map([
      [part.id, renderPacketField(part.element as PacketFieldData, { prefixRaw: `${start}-${end}` })],
    ])
  }

  /**
   * 删除字段：结果全序列必须连续（后续 +count 形态自动衔接因此可删；后续显式起点
   * 字段会因位移被拒——绝不产出非法 mermaid）。
   */
  private resolveDeleteField(
    doc: SourceDocument,
    intent: Extract<PacketIntent, { type: 'delete-field' }>,
  ): Map<string, string> | null {
    const part = this.fieldPart(doc, intent.elementId)
    if (part === null) return null
    const fields = this.fieldsOf(doc)
    if (!fields.some((f) => f.id === intent.elementId)) return null
    const sequence = fields.filter((f) => f.id !== intent.elementId)
    if (!isContiguousFieldSequence(sequence)) return null
    return new Map([[part.id, '']])
  }
}

export const packetParser = new PacketParser()

// ---------- 编辑意图（工单 16 表单 / 画布所需集合） ----------

export type PacketIntent =
  /**
   * 新增字段（+count 形态，自动衔接前序——工单定案 Tab/空白菜单的加字形态）；
   * name 合法字段名；count 为正整数原文；锚点缺省 = 文档末尾
   */
  | { type: 'add-field'; name: string; count: string; afterElementId?: string }
  /** 改字段名（elementId = `field:N`）；位前缀与形态逐字保留 */
  | { type: 'set-field-name'; elementId: string; name: string }
  /**
   * 改位区间（start/end 为非负整数原文，end >= start；以 start-end 绝对形态落码）；
   * 结果全序列连续才落码（间隙/重叠/回退拒绝）
   */
  | { type: 'set-field-range'; elementId: string; start: string; end: string }
  /** 删除字段；结果全序列连续才落码 */
  | { type: 'delete-field'; elementId: string }
