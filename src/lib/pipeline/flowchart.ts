import { assembleDocument, getElementById, type AnyElement, type SourceDocument } from './document'
import type { DiagramParser, EditIntent, ParseResult, SourceParseError } from './parser'
import type { Span } from './span'

/**
 * 最小 flowchart 解析器（工单 02 的示例图种）：
 * 手写、逐行、带 span。元素：graph 声明行、节点声明行、连线行。
 * 注释（%%）、空行、无法识别的行不解析，作为 verbatim 逐字保留。
 *
 * 已知种子级限制（后续工单按图种扩展）：
 * - 不解析 subgraph / classDef / linkStyle（此类行原样保留，不算错误）
 * - 节点形状文本内不允许出现括号自身；连线标签内不允许出现箭头终止符
 * - 不支持链式连线（A --> B --> C 整行保留）
 */

interface ParseFailure extends Error {
  line: number
}

function parseFailure(line: number, message: string): ParseFailure {
  const error = new Error(message) as ParseFailure
  error.line = line
  return error
}

// ---------- 节点 token ----------

const OPENERS: Array<{ open: string; close: string }> = [
  { open: '((', close: '))' },
  { open: '[(', close: ')]' },
  { open: '[', close: ']' },
  { open: '(', close: ')' },
  { open: '{', close: '}' },
  { open: '>', close: ']' },
]

const ID_RE = /[A-Za-z0-9_\u00C0-\uFFFF-]+/y

export interface NodeToken {
  nodeId: string
  /** 形状内文本；无形状时为 null */
  text: string | null
  openRaw: string
  closeRaw: string
  /** nodeId 与形状括号之间的空白 */
  gapAfterId: string
}

/** 渲染节点 token；newText 提供时替换形状内文本，无形状节点采用 [] 形状 */
export function renderNodeToken(token: NodeToken, newText?: string): string {
  if (token.text === null && newText === undefined) {
    return token.nodeId
  }
  if (token.text === null) {
    return `${token.nodeId}[${newText}]`
  }
  return `${token.nodeId}${token.gapAfterId}${token.openRaw}${newText ?? token.text}${token.closeRaw}`
}

function parseNodeToken(
  line: string,
  start: number,
  lineNo: number,
): { token: NodeToken; end: number } | null {
  ID_RE.lastIndex = start
  const match = ID_RE.exec(line)
  if (match === null || match.index !== start) return null
  // 连字符同时是箭头字符：id 不贪婪吞掉箭头——
  // 在首个 "--" 处截断（mermaid id 习惯上不含 "--"），再去掉尾部残留的单个连字符
  const nodeId = match[0].split('--')[0].replace(/-+$/, '')
  if (nodeId === '') return null
  const idEnd = start + nodeId.length
  let pos = idEnd

  const gapMatch = /^[ \t]*/.exec(line.slice(pos))
  const gapAfterId = gapMatch !== null ? gapMatch[0] : ''
  pos += gapAfterId.length

  for (const { open, close } of OPENERS) {
    if (!line.startsWith(open, pos)) continue
    const textStart = pos + open.length
    const closeIdx = line.indexOf(close, textStart)
    if (closeIdx === -1) {
      // ">" 旗形开括号与箭头 ">" 同形：找不到闭合时不报错，视为无形状节点
      if (open !== '>') {
        throw parseFailure(lineNo, `节点 "${nodeId}" 的形状括号未闭合（缺少 "${close}"）`)
      }
      break
    }
    return {
      token: {
        nodeId,
        text: line.slice(textStart, closeIdx),
        openRaw: open,
        closeRaw: close,
        gapAfterId,
      },
      end: closeIdx + close.length,
    }
  }

  // 无形状节点：token 止于 id；id 后的空白不属于 token
  return {
    token: { nodeId, text: null, openRaw: '', closeRaw: '', gapAfterId: '' },
    end: idEnd,
  }
}

// ---------- 连线 ----------

/** 纯箭头 token，长 token 在前避免前缀误匹配 */
const PLAIN_ARROWS = [
  'x--x',
  'o--o',
  'x--o',
  'o--x',
  'x-->',
  'o-->',
  '--x',
  '--o',
  'x--',
  'o--',
  '-.->',
  '-.-',
  '==>',
  '-->',
  '~~~',
  '-x',
  '-o',
  '---',
  '--',
  '==',
] as const

export interface PlainArrow {
  kind: 'plain'
  raw: string
}

export interface LabelledArrow {
  kind: 'labelled'
  style: 'solid' | 'dotted' | 'thick'
  openRaw: string
  closeRaw: string
  /** 标签核心文本（不含两侧空白） */
  label: string
  gapBeforeLabel: string
  gapAfterLabel: string
}

export type ArrowSpec = PlainArrow | LabelledArrow

export interface EdgeData {
  kind: 'edge'
  from: NodeToken
  to: NodeToken
  arrow: ArrowSpec
  gapBeforeArrow: string
  gapAfterArrow: string
}

export function renderEdgeLine(
  edge: EdgeData,
  changes: { fromText?: string; toText?: string; label?: string } = {},
): string {
  let arrowText: string
  if (edge.arrow.kind === 'plain') {
    const label = changes.label ?? null
    if (label === null || label === '') {
      arrowText = edge.arrow.raw
    } else {
      // 纯箭头加标签：映射为带标签的等价写法
      if (edge.arrow.raw.startsWith('==')) {
        arrowText = `== ${label} ==>`
      } else if (edge.arrow.raw.startsWith('-.')) {
        arrowText = `-. ${label} .->`
      } else {
        arrowText = `-- ${label} -->`
      }
    }
  } else {
    const label = changes.label ?? edge.arrow.label
    arrowText =
      label === ''
        ? `${edge.arrow.openRaw}${edge.arrow.closeRaw}`
        : `${edge.arrow.openRaw}${edge.arrow.gapBeforeLabel}${label}${edge.arrow.gapAfterLabel}${edge.arrow.closeRaw}`
  }
  return (
    renderNodeToken(edge.from, changes.fromText) +
    edge.gapBeforeArrow +
    arrowText +
    edge.gapAfterArrow +
    renderNodeToken(edge.to, changes.toText)
  )
}

/** 解析带标签箭头；rest 是从 open 起始的行尾片段 */
function parseLabelledArrow(
  line: string,
  pos: number,
  open: string,
  close: string,
  style: LabelledArrow['style'],
): { arrow: LabelledArrow; end: number } | null {
  if (!line.startsWith(open, pos)) return null
  const closeIdx = line.indexOf(close, pos + open.length)
  if (closeIdx === -1) return null
  if (closeIdx === pos + open.length) return null // 空标签区 = 纯箭头（如 -->）
  const labelRaw = line.slice(pos + open.length, closeIdx)
  const gapBeforeLabel = /^[ \t]*/.exec(labelRaw)?.[0] ?? ''
  const gapAfterLabel = /[ \t]*$/.exec(labelRaw)?.[0] ?? ''
  return {
    arrow: {
      kind: 'labelled',
      style,
      openRaw: open,
      closeRaw: close,
      label: labelRaw.slice(gapBeforeLabel.length, labelRaw.length - gapAfterLabel.length),
      gapBeforeLabel,
      gapAfterLabel,
    },
    end: closeIdx + close.length,
  }
}

const WS_RE = /[ \t\r]*/y

function skipWs(line: string, pos: number): { text: string; end: number } {
  WS_RE.lastIndex = pos
  const match = WS_RE.exec(line)
  const text = match !== null ? match[0] : ''
  return { text, end: pos + text.length }
}

function parsePlainArrow(line: string, pos: number): { arrow: PlainArrow; end: number } | null {
  for (const raw of PLAIN_ARROWS) {
    if (line.startsWith(raw, pos)) {
      return { arrow: { kind: 'plain', raw }, end: pos + raw.length }
    }
  }
  return null
}

function parseArrow(line: string, pos: number): { arrow: ArrowSpec; end: number } | null {
  // 带标签箭头优先于纯箭头（否则 "-- 标签 -->" 会被 "--" 截断）
  const labelled =
    parseLabelledArrow(line, pos, '--', '-->', 'solid') ??
    parseLabelledArrow(line, pos, '-.', '.->', 'dotted') ??
    parseLabelledArrow(line, pos, '==', '==>', 'thick')
  if (labelled !== null) return labelled
  const plain = parsePlainArrow(line, pos)
  if (plain !== null) return plain
  // "-->"/"-.->"/"==>" 本身：open 与 close 相邻时上面返回 null，落到纯箭头列表
  return parsePlainArrow(line, pos)
}

function parseEdgeLine(
  line: string,
  start: number,
  lineNo: number,
): { edge: EdgeData; end: number } | null {
  const from = parseNodeToken(line, start, lineNo)
  if (from === null) return null
  const gapBeforeArrow = skipWs(line, from.end)
  const arrow = parseArrow(line, gapBeforeArrow.end)
  if (arrow === null) return null
  const gapAfterArrow = skipWs(line, arrow.end)
  const to = parseNodeToken(line, gapAfterArrow.end, lineNo)
  if (to === null) return null
  const trailing = skipWs(line, to.end)
  if (trailing.end !== line.length) return null // 行尾还有内容（链式连线等）→ 整行不解析
  return {
    edge: {
      kind: 'edge',
      from: from.token,
      to: to.token,
      arrow: arrow.arrow,
      gapBeforeArrow: gapBeforeArrow.text,
      gapAfterArrow: gapAfterArrow.text,
    },
    end: to.end,
  }
}

// ---------- 行级元素 ----------

export interface HeaderData {
  kind: 'header'
  keyword: string
  direction: string
}

export interface NodeLineData {
  kind: 'node'
  token: NodeToken
  trailing: string
}

export type FlowchartElement = HeaderData | NodeLineData | EdgeData

const HEADER_RE = /^([ \t]*)(flowchart|graph)([ \t]+)([A-Za-z0-9]+)([ \t\r]*)$/i

export const edgeElementId = (from: string, to: string, occurrence: number): string =>
  occurrence <= 1 ? `edge:${from}:${to}` : `edge:${from}:${to}#${occurrence}`

const nodeElementId = (nodeId: string, occurrence: number): string =>
  occurrence <= 1 ? `node:${nodeId}` : `node:${nodeId}#${occurrence}`

// ---------- 解析器 ----------

export type FlowchartIntent =
  | { type: 'set-node-text'; nodeId: string; text: string }
  | { type: 'set-edge-label'; from: string; to: string; occurrence?: number; label: string }

export class FlowchartParser implements DiagramParser {
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
    const entries: Array<{ span: Span; id: string; data: AnyElement }> = []
    const nodeLineCounts = new Map<string, number>()
    const edgeCounts = new Map<string, number>()
    let seenHeader = false
    let lineNo = 0
    let cursor = 0

    for (;;) {
      const nl = source.indexOf('\n', cursor)
      const lineEnd = nl === -1 ? source.length : nl
      const line = source.slice(cursor, lineEnd)
      lineNo++

      if (line.trim() !== '') {
        this.classifyLine(line, cursor, lineNo, seenHeader, entries, nodeLineCounts, edgeCounts)
        const last = entries[entries.length - 1]
        if (last !== undefined && last.span.start === cursor) {
          seenHeader = seenHeader || last.data.kind === 'header'
        }
      }

      if (nl === -1) break
      cursor = nl + 1
    }

    if (!seenHeader) {
      throw parseFailure(1, '图表必须以 flowchart/graph 声明开始')
    }
    return assembleDocument(source, entries)
  }

  private classifyLine(
    line: string,
    lineStart: number,
    lineNo: number,
    seenHeader: boolean,
    entries: Array<{ span: Span; id: string; data: AnyElement }>,
    nodeLineCounts: Map<string, number>,
    edgeCounts: Map<string, number>,
  ): void {
    const headerMatch = HEADER_RE.exec(line)
    if (headerMatch !== null) {
      const data: HeaderData = {
        kind: 'header',
        keyword: headerMatch[2],
        direction: headerMatch[4],
      }
      entries.push({
        span: { start: lineStart, end: lineStart + line.length },
        id: seenHeader ? `header#${entries.length}` : 'header',
        data,
      })
      return
    }

    const firstChar = line.length - line.trimStart().length
    const nodeLine = this.tryNodeLine(line, firstChar, lineNo)
    const edgeLine = nodeLine === null ? this.tryEdgeLine(line, firstChar, lineNo) : null

    if ((nodeLine !== null || edgeLine !== null) && !seenHeader) {
      throw parseFailure(lineNo, '图表必须以 flowchart/graph 声明开始')
    }

    if (nodeLine !== null) {
      const count = (nodeLineCounts.get(nodeLine.token.nodeId) ?? 0) + 1
      nodeLineCounts.set(nodeLine.token.nodeId, count)
      const data: NodeLineData = {
        kind: 'node',
        token: nodeLine.token,
        trailing: nodeLine.trailing,
      }
      entries.push({
        // 缩进留给 verbatim；元素 span 从 token 起，改写不触碰缩进
        span: { start: lineStart + firstChar, end: lineStart + line.length },
        id: nodeElementId(nodeLine.token.nodeId, count),
        data,
      })
      return
    }

    if (edgeLine !== null) {
      const key = `${edgeLine.edge.from.nodeId}->${edgeLine.edge.to.nodeId}`
      const count = (edgeCounts.get(key) ?? 0) + 1
      edgeCounts.set(key, count)
      const data: EdgeData = edgeLine.edge
      entries.push({
        span: { start: lineStart + firstChar, end: lineStart + line.length },
        id: edgeElementId(edgeLine.edge.from.nodeId, edgeLine.edge.to.nodeId, count),
        data,
      })
      return
    }

    // 注释、空行已在上层过滤；其余行（linkStyle、classDef、看不懂的语法）不解析，
    // 作为 verbatim 逐字保留（ADR-0008）
  }

  private tryNodeLine(
    line: string,
    start: number,
    lineNo: number,
  ): { token: NodeToken; trailing: string } | null {
    const parsed = parseNodeToken(line, start, lineNo)
    if (parsed === null) return null
    const trailing = line.slice(parsed.end)
    if (trailing.trim() !== '') return null
    return { token: parsed.token, trailing }
  }

  private tryEdgeLine(
    line: string,
    start: number,
    lineNo: number,
  ): { edge: EdgeData } | null {
    const parsed = parseEdgeLine(line, start, lineNo)
    return parsed !== null ? { edge: parsed.edge } : null
  }

  resolveRewrites(doc: SourceDocument, intent: EditIntent): ReadonlyMap<string, string> | null {
    switch (intent.type) {
      case 'set-node-text':
        return this.resolveSetNodeText(doc, intent as FlowchartIntent & { type: 'set-node-text' })
      case 'set-edge-label':
        return this.resolveSetEdgeLabel(doc, intent as FlowchartIntent & { type: 'set-edge-label' })
      default:
        return null
    }
  }

  private resolveSetNodeText(
    doc: SourceDocument,
    intent: Extract<FlowchartIntent, { type: 'set-node-text' }>,
  ): Map<string, string> | null {
    // 声明行优先；否则取文档顺序中首个包含该节点 id 的连线
    const declaration = doc.elements.find(
      (part) =>
        part.element.kind === 'node' &&
        (part.element as NodeLineData).token.nodeId === intent.nodeId,
    )
    if (declaration !== undefined) {
      const data = declaration.element as NodeLineData
      return new Map([[declaration.id, renderNodeToken(data.token, intent.text) + data.trailing]])
    }
    const edgePart = doc.elements.find((part) => {
      if (part.element.kind !== 'edge') return false
      const edge = part.element as EdgeData
      return edge.from.nodeId === intent.nodeId || edge.to.nodeId === intent.nodeId
    })
    if (edgePart !== undefined) {
      const edge = edgePart.element as EdgeData
      const fromText = edge.from.nodeId === intent.nodeId ? intent.text : undefined
      const toText = edge.to.nodeId === intent.nodeId ? intent.text : undefined
      return new Map([[edgePart.id, renderEdgeLine(edge, { fromText, toText })]])
    }
    return null
  }

  private resolveSetEdgeLabel(
    doc: SourceDocument,
    intent: Extract<FlowchartIntent, { type: 'set-edge-label' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, edgeElementId(intent.from, intent.to, intent.occurrence ?? 1))
    if (part === undefined || part.element.kind !== 'edge') return null
    const edge = part.element as EdgeData
    return new Map([[part.id, renderEdgeLine(edge, { label: intent.label })]])
  }
}

export const flowchartParser = new FlowchartParser()
