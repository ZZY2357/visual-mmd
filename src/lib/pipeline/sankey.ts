import { assembleDocument, getElementById, type ElementPart, type SourceDocument } from './document'
import { frontmatterEnd } from './frontmatter'
import { insertAfter } from './insert'
import type { DiagramParser, EditIntent, ParseResult, SourceParseError } from './parser'
import type { Span } from './span'

/**
 * sankey-beta（桑基图）完整解析器（more-diagrams 工单 13，语法事实以 spec 的
 * research/data-display.md sankey 节 + 离线核对
 * node_modules/mermaid/dist/chunks/mermaid.core/sankeyDiagram-IPEJSGJF.mjs 为准）：
 * 手写、带 span（ADR-0004）。可测试承诺：解析后不做修改再重组装，输出与输入
 * 逐字相同（verbatim identity）。
 *
 * **正文是 CSV 流**（全库语法最特殊的图，独立成文、不套行式语句框架）：
 * 逐条记录 `source,target,value` 三列，RFC-4180 变体——
 * - 字段可用 `"` 包裹（含逗号时必需）；引号内 `""` 是字面引号转义；mermaid 词法
 *   还允许引号内出现 CR/LF（记录跨物理行）——本解析器以**记录级扫描**（非逐行）
 *   忠实支持，元素 span 覆盖整条记录
 * - 空行无语义（mermaid parse 前 prepareTextForParsing 会折叠多换行）但原文
 *   逐字保留（ADR-0004）；无法识别的行（列数不为 3、引号畸形等）不报错、逐字保留
 *   （ADR-0008 清单外不吞）
 * - 声明头 `sankey-beta`（mermaid 12 同认 `sankey`，均 case-insensitive）；裸关键字行
 * - frontmatter（含 sankey config）与 `%%` 注释、accTitle/accDescr 整块逐字保留
 *   （工单明确不做 config 编辑）
 *
 * 词法边界（mermaid 12 实证，工单 Comments 记录结论）：
 * - **字段字符集限 `\u0020-\u007E` 可打印 ASCII——非 ASCII 名字（如中文）mermaid
 *   词法直接失败**。落码门 isValidSankeyName 拒收；手写源码里的非法名字解析保留
 *   原文、投影标注（不静默改写）
 * - value 走 mermaid 的 `parseFloat`（宽松），编辑器落码口径收紧为严格数值词法
 *   （非负整数/小数）——绝不产出非法 mermaid（ADR-0008 落码门）
 * - 节点**不落码**：节点 = 链路行 source/target 的去重派生（mermaid DB
 *   findOrCreateNode 按 Map 去重同款语义），名字只存在于链路行；节点重命名 =
 *   手术改写该节点参与的全部链路行对应列，未触碰行逐字保留
 *
 * span 约定：记录 span 覆盖整条 CSV 记录（可跨物理行，不含行尾换行）；声明头同。
 * 身份（ADR-0012 位置序）：链路 `link:N` 按文档序 1 基编号（CSV 无元素 id）；
 * 节点以名字为身份（名字即身份，与 block-node 同款）。
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

export interface SankeyHeaderData {
  kind: 'sankey-header'
}

/**
 * 链路行数据（一条 CSV 记录，三列）。各字段存**原文**（含引号包裹原样，
 * 引号内可含逗号 / 换行），改写时未触碰字段逐字回写（ADR-0004 手术式）。
 */
export interface SankeyLinkData {
  kind: 'sankey-link'
  sourceRaw: string
  targetRaw: string
  valueRaw: string
}

export type SankeyElementData = SankeyHeaderData | SankeyLinkData

// ---------- CSV 字段编解码与校验 ----------

/**
 * 字段原文 → 解码文本：`"` 包裹字段取引号内文并做 `""` → `"` 还原；
 * 裸字段原样返回。只对扫描器判定良构的原文调用（元素字段必然良构）。
 */
export function decodeSankeyField(raw: string): string {
  if (raw.length < 2 || raw[0] !== '"' || raw[raw.length - 1] !== '"') return raw
  let text = ''
  for (let i = 1; i < raw.length - 1; i++) {
    const ch = raw[i]
    if (ch === '"' && raw[i + 1] === '"') {
      text += '"'
      i++
      continue
    }
    text += ch
  }
  return text
}

/** 名字 → 字段原文：含逗号或双引号时用 `"` 包裹（`""` 转义），否则裸写 */
export function encodeSankeyField(name: string): string {
  return name.includes('"') || name.includes(',') ? `"${name.replace(/"/g, '""')}"` : name
}

/**
 * 名字落码合法性（表单/落码门共用）：非空、全部字符为可打印 ASCII
 * （mermaid sankey 词法限 `\u0020-\u007E`，非 ASCII 名字词法直接失败）。
 */
const FIELD_CHAR_RE = /^[\u0020-\u007E]+$/

export function isValidSankeyName(name: string): boolean {
  return name !== '' && FIELD_CHAR_RE.test(name)
}

/** value 落码口径：非负整数或小数（mermaid 的 parseFloat 宽松口径在编辑器侧收紧） */
const SANKEY_VALUE_RE = /^\d+(?:\.\d+)?$/

/** value 段文本 → 数值：符合落码词法时给出数值，否则 null（去外侧空白） */
export function parseSankeyValue(value: string): number | null {
  const trimmed = value.trim()
  return SANKEY_VALUE_RE.test(trimmed) ? Number(trimmed) : null
}

/** 链路行原文重建（未触碰列逐字回写）。changes 缺省 = 逐字保留 */
export function renderSankeyLink(
  d: SankeyLinkData,
  changes: { sourceRaw?: string; targetRaw?: string; valueRaw?: string } = {},
): string {
  const source = changes.sourceRaw ?? d.sourceRaw
  const target = changes.targetRaw ?? d.targetRaw
  const value = changes.valueRaw ?? d.valueRaw
  return `${source},${target},${value}`
}

// ---------- CSV 记录扫描（RFC-4180 变体） ----------

interface CsvRecord {
  /** 记录内容起点（含行首缩进） */
  start: number
  /** 记录内容终点（不含行尾换行符） */
  end: number
  /** 各字段原文（含引号包裹原样）；空行 = [''] */
  fields: string[]
  /** 引号形态畸形（裸字段中出现引号 / 引号未闭合 / 闭引号后跟其他字符） */
  malformed: boolean
}

/**
 * 在 [start, end) 区间扫描 CSV 记录流：记录以 `,` 分列、以 `\n`（或 `\r\n`）结束。
 * 引号内允许逗号 / CR / LF / 成对 `""`——记录可跨物理行。闭引号之后只允许
 * `,`、换行或记录结束（RFC-4180 严格口径），否则整条记录标 malformed（原文保留、
 * 不成元素）。\r\n 文件兼容：`\r\n` 整体作为记录分隔符；孤立 `\r` 按普通字符处理。
 */
function scanCsvRecords(source: string, start: number, end: number): CsvRecord[] {
  const records: CsvRecord[] = []
  let i = start
  while (i < end) {
    const recStart = i
    const fields: string[] = []
    let fieldStart = i
    let inQuote = false
    let malformed = false
    let contentEnd = -1
    for (;;) {
      if (i >= end) {
        // EOF 收尾字段；引号未闭合也算 malformed
        if (inQuote) malformed = true
        fields.push(source.slice(fieldStart, end))
        contentEnd = end
        break
      }
      const ch = source[i]
      if (inQuote) {
        if (ch === '"') {
          if (i + 1 < end && source[i + 1] === '"') {
            i += 2 // 成对 "" 转义
            continue
          }
          inQuote = false
          i++
          // 闭引号后只允许 `,` / `\n` / `\r\n` / 记录结束
          if (i < end) {
            const nc = source[i]
            if (nc !== ',' && nc !== '\n' && !(nc === '\r' && i + 1 < end && source[i + 1] === '\n')) {
              malformed = true
            }
          }
          continue
        }
        i++
        continue
      }
      if (ch === '"') {
        if (i === fieldStart) {
          inQuote = true
          i++
          continue
        }
        malformed = true // 裸字段中间出现引号
        i++
        continue
      }
      if (ch === ',') {
        fields.push(source.slice(fieldStart, i))
        fieldStart = i + 1
        i++
        continue
      }
      if (ch === '\n') {
        fields.push(source.slice(fieldStart, i))
        contentEnd = i
        i++
        break
      }
      if (ch === '\r' && i + 1 < end && source[i + 1] === '\n') {
        fields.push(source.slice(fieldStart, i))
        contentEnd = i
        i += 2
        break
      }
      i++
    }
    records.push({ start: recStart, end: contentEnd, fields, malformed })
  }
  return records
}

// ---------- 解析器 ----------

interface RawEntry {
  span: Span
  id: string
  data: SankeyElementData
}

const HEADER_RE = /^sankey(-beta)?$/i

export class SankeyParser implements DiagramParser {
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
    // 文首 frontmatter 块不参与解析，整体 verbatim 保留
    const bodyStart = frontmatterEnd(source)
    let linkCount = 0
    let seenHeader = false

    const records = scanCsvRecords(source, bodyStart, source.length)
    for (const record of records) {
      const recordText = source.slice(record.start, record.end)
      if (!seenHeader) {
        // 头之前的空行 / 纯空白行跳过；首个非空记录必须是裸关键字声明头
        if (recordText.trim() === '') continue
        if (!record.malformed && record.fields.length === 1 && HEADER_RE.test(record.fields[0])) {
          seenHeader = true
          entries.push({
            span: { start: record.start, end: record.end },
            id: 'sankey-header',
            data: { kind: 'sankey-header' },
          })
          continue
        }
        throw parseFailure(
          source.slice(0, record.start).split('\n').length,
          '图表必须以 sankey-beta 声明开始',
        )
      }
      if (record.malformed || record.fields.length !== 3) continue // 空行 / 注释 / 清单外：逐字保留
      linkCount++
      entries.push({
        span: { start: record.start, end: record.end },
        id: `link:${linkCount}`,
        data: {
          kind: 'sankey-link',
          sourceRaw: record.fields[0],
          targetRaw: record.fields[1],
          valueRaw: record.fields[2],
        },
      })
    }

    if (!seenHeader) {
      throw parseFailure(1, '图表必须以 sankey-beta 声明开始')
    }
    return assembleDocument(source, entries)
  }

  // ---------- 意图落地（resolveRewrites） ----------

  resolveRewrites(doc: SourceDocument, intent: EditIntent): ReadonlyMap<string, string> | null {
    switch (intent.type) {
      case 'add-link':
        return this.resolveAddLink(doc, intent as never)
      case 'set-link':
        return this.resolveSetLink(doc, intent as never)
      case 'delete-link':
        return this.resolveDeleteLink(doc, intent as never)
      case 'rename-node':
        return this.resolveRenameNode(doc, intent as never)
      default:
        return null
    }
  }

  private linkPart(doc: SourceDocument, elementId: string): ElementPart | null {
    const part = getElementById(doc, elementId)
    return part !== undefined && part.element.kind === 'sankey-link' ? part : null
  }

  /** 新增链路：追加在锚点记录之后（缺省 = 文档末尾，含只剩声明头的情形）；
   * 三列全部过落码门（名字非空可打印 ASCII、value 严格数值）——绝不产出非法 mermaid */
  private resolveAddLink(
    doc: SourceDocument,
    intent: Extract<SankeyIntent, { type: 'add-link' }>,
  ): Map<string, string> | null {
    const source = intent.source.trim()
    const target = intent.target.trim()
    const value = intent.value.trim()
    if (!isValidSankeyName(source) || !isValidSankeyName(target) || parseSankeyValue(value) === null) {
      return null
    }
    return insertAfter(doc, {
      afterElementId: intent.afterElementId,
      anchor: 'line-end',
      render: (indent) => `\n${indent}${encodeSankeyField(source)},${encodeSankeyField(target)},${value}`,
    })
  }

  /** 改链路（三列任意子集）：名字/value 过落码门，未触碰列逐字回写 */
  private resolveSetLink(
    doc: SourceDocument,
    intent: Extract<SankeyIntent, { type: 'set-link' }>,
  ): Map<string, string> | null {
    const part = this.linkPart(doc, intent.elementId)
    if (part === null) return null
    const data = part.element as SankeyLinkData
    const changes: { sourceRaw?: string; targetRaw?: string; valueRaw?: string } = {}
    if (intent.changes.source !== undefined) {
      const source = intent.changes.source.trim()
      if (!isValidSankeyName(source)) return null
      changes.sourceRaw = encodeSankeyField(source)
    }
    if (intent.changes.target !== undefined) {
      const target = intent.changes.target.trim()
      if (!isValidSankeyName(target)) return null
      changes.targetRaw = encodeSankeyField(target)
    }
    if (intent.changes.value !== undefined) {
      const value = intent.changes.value.trim()
      if (parseSankeyValue(value) === null) return null
      changes.valueRaw = value
    }
    return new Map([[part.id, renderSankeyLink(data, changes)]])
  }

  /** 删除链路：整条记录移除 */
  private resolveDeleteLink(
    doc: SourceDocument,
    intent: Extract<SankeyIntent, { type: 'delete-link' }>,
  ): Map<string, string> | null {
    const part = this.linkPart(doc, intent.elementId)
    if (part === null) return null
    return new Map([[part.id, '']])
  }

  /**
   * 节点重命名（节点不落码，名字即身份）：手术改写该节点参与的全部链路行
   * 对应列（source 列或 target 列），未触碰行/列逐字保留。新名过落码门；
   * 改成已有节点名 = 自然合并（mermaid DB 按 Map 去重的同名语义），放行。
   */
  private resolveRenameNode(
    doc: SourceDocument,
    intent: Extract<SankeyIntent, { type: 'rename-node' }>,
  ): Map<string, string> | null {
    const name = intent.name
    const newName = intent.newName.trim()
    if (newName === name || !isValidSankeyName(newName)) return null
    const rewrites = new Map<string, string>()
    for (const part of doc.elements) {
      if (part.element.kind !== 'sankey-link') continue
      const data = part.element as SankeyLinkData
      const isSource = decodeSankeyField(data.sourceRaw) === name
      const isTarget = decodeSankeyField(data.targetRaw) === name
      if (!isSource && !isTarget) continue
      rewrites.set(
        part.id,
        renderSankeyLink(data, {
          ...(isSource ? { sourceRaw: encodeSankeyField(newName) } : {}),
          ...(isTarget ? { targetRaw: encodeSankeyField(newName) } : {}),
        }),
      )
    }
    // 目标节点不存在 → 意图不可应用
    return rewrites.size > 0 ? rewrites : null
  }
}

export const sankeyParser = new SankeyParser()

// ---------- 编辑意图（工单 13 表单 / 画布所需集合） ----------

export type SankeyIntent =
  /** 新增链路（三列均须过落码门；锚点缺省 = 文档末尾） */
  | { type: 'add-link'; source: string; target: string; value: string; afterElementId?: string }
  /** 改链路三列的任意子集（elementId = `link:N`；未触碰列逐字保留） */
  | { type: 'set-link'; elementId: string; changes: { source?: string; target?: string; value?: string } }
  /** 删除链路 */
  | { type: 'delete-link'; elementId: string }
  /** 节点重命名（改写该节点参与的全部链路行对应列；名字即身份） */
  | { type: 'rename-node'; name: string; newName: string }
