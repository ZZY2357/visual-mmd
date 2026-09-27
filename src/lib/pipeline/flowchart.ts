import { assembleDocument, getElementById, type AnyElement, type SourceDocument } from './document'
import type { DiagramParser, EditIntent, ParseResult, SourceParseError } from './parser'
import { frontmatterEnd } from './frontmatter'
import { lineAtOffset, type Span } from './span'

/**
 * flowchart 完整解析器（工单 03，语法范围以 ADR-0005 清单为准）：
 * 手写、逐行、带 span（ADR-0004）。可测试承诺：解析后不做修改再重组装，
 * 输出与输入逐字相同（verbatim identity）。
 *
 * 覆盖（ADR-0005）：
 * - 全部节点形状：矩形/圆角/体育场/子程序/圆柱/圆/双圆/旗形/菱形/六边形/平行四边形×2/梯形×2
 * - 全部连线类型：线型（实/虚/粗/不可见）、箭头（无/箭头/圆 o/叉 x）、双向（<-->、o/x 端点）、
 *   标签（行内 `-- 标签 -->` 与管道 `|标签|`）、长度（重复符号加长）、链式连线（A --> B --> C）
 * - subgraph（含嵌套与标题）与 subgraph 内 direction
 * - classDef（属性逐项解析：fill/stroke/stroke-width/stroke-dasharray/color 等任意 k:v）
 * - 图方向声明（flowchart TD / graph LR 等）
 *
 * 不解析、原样保留（清单外语法不报错，ADR-0008）：linkStyle、click 回调、class 语句、
 * 注释、空行、以及一切无法识别的行。
 *
 * span 约定：元素 span 从该行首个非空白字符（或行内 token）起、到行尾（不含换行）；
 * 行首缩进与换行永远留在 verbatim，手术式改写不触碰用户的缩进习惯。
 * 一行内链式语句拆成多个元素（节点出现 / 连线 token），各自独立 span。
 */

interface ParseFailure extends Error {
  line: number
}

function parseFailure(line: number, message: string): ParseFailure {
  const error = new Error(message) as ParseFailure
  error.line = line
  return error
}

// ---------- 节点形状 ----------

export type NodeShapeType =
  | 'rectangle'
  | 'rounded'
  | 'stadium'
  | 'subroutine'
  | 'cylinder'
  | 'circle'
  | 'double-circle'
  | 'asymmetric'
  | 'rhombus'
  | 'hexagon'
  | 'parallelogram'
  | 'parallelogram-alt'
  | 'trapezoid'
  | 'trapezoid-alt'

export const NODE_SHAPES: Record<NodeShapeType, { open: string; close: string }> = {
  rectangle: { open: '[', close: ']' },
  rounded: { open: '(', close: ')' },
  stadium: { open: '([', close: '])' },
  subroutine: { open: '[[', close: ']]' },
  cylinder: { open: '[(', close: ')]' },
  circle: { open: '((', close: '))' },
  'double-circle': { open: '(((', close: ')))' },
  asymmetric: { open: '>', close: ']' },
  rhombus: { open: '{', close: '}' },
  hexagon: { open: '{{', close: '}}' },
  parallelogram: { open: '[/', close: '/]' },
  'parallelogram-alt': { open: '[\\', close: '\\]' },
  trapezoid: { open: '[/', close: '\\]' },
  'trapezoid-alt': { open: '[\\', close: '/]' },
}

/** 形状匹配表：长 opener 在前；[/ 与 [\ 的实际形状由更近出现的闭合符决定 */
const SHAPE_DEFS: Array<{
  open: string
  closers: Array<{ close: string; type: NodeShapeType }>
}> = [
  { open: '(((', closers: [{ close: ')))', type: 'double-circle' }] },
  { open: '[[', closers: [{ close: ']]', type: 'subroutine' }] },
  { open: '[(', closers: [{ close: ')]', type: 'cylinder' }] },
  { open: '([', closers: [{ close: '])', type: 'stadium' }] },
  { open: '{{', closers: [{ close: '}}', type: 'hexagon' }] },
  { open: '((', closers: [{ close: '))', type: 'circle' }] },
  {
    open: '[/',
    closers: [
      { close: '/]', type: 'parallelogram' },
      { close: '\\]', type: 'trapezoid' },
    ],
  },
  {
    open: '[\\',
    closers: [
      { close: '\\]', type: 'parallelogram-alt' },
      { close: '/]', type: 'trapezoid-alt' },
    ],
  },
  { open: '[', closers: [{ close: ']', type: 'rectangle' }] },
  { open: '(', closers: [{ close: ')', type: 'rounded' }] },
  { open: '{', closers: [{ close: '}', type: 'rhombus' }] },
  { open: '>', closers: [{ close: ']', type: 'asymmetric' }] },
]

const ID_RE = /[A-Za-z0-9_\u00C0-\uFFFF-]+/y
const VALID_NEW_ID_RE = /^[A-Za-z0-9_\u00C0-\uFFFF-]+$/

export interface NodeOccData {
  kind: 'node'
  nodeId: string
  /** 形状；null = 仅 id 引用（无形状写法） */
  shapeType: NodeShapeType | null
  /** 形状内文本；无形状时为 null */
  text: string | null
  gapAfterId: string
  openRaw: string
  closeRaw: string
  /** 行尾残留（空白/注释）；仅当本元素是该行最后一个元素时非空 */
  trailing: string
  /** 本节点单独成行（行内只有它自己，没有连线） */
  standalone: boolean
}

type NodeOccCore = Omit<NodeOccData, 'trailing' | 'standalone'>

function renderNodeOcc(
  d: NodeOccData,
  changes: { newId?: string; text?: string; shape?: NodeShapeType } = {},
): string {
  const id = changes.newId ?? d.nodeId
  const adoptingShape = changes.shape !== undefined || changes.text !== undefined
  if (d.shapeType === null && !adoptingShape) {
    return id + d.trailing
  }
  const spec = changes.shape !== undefined ? NODE_SHAPES[changes.shape] : { open: d.openRaw, close: d.closeRaw }
  const text = changes.text !== undefined ? changes.text : d.text !== null ? d.text : id
  return id + d.gapAfterId + spec.open + text + spec.close + d.trailing
}

/** 新建节点行的规范渲染（add-node 意图用） */
function buildNodeLine(nodeId: string, text: string, shape: NodeShapeType): string {
  const spec = NODE_SHAPES[shape]
  return `${nodeId}${spec.open}${text}${spec.close}`
}

function parseNodeToken(line: string, start: number, lineNo: number): { data: NodeOccCore; end: number } | null {
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

  let sawOpener = false
  for (const def of SHAPE_DEFS) {
    if (!line.startsWith(def.open, pos)) continue
    sawOpener = true
    let best: { close: string; type: NodeShapeType; idx: number } | null = null
    for (const c of def.closers) {
      const idx = line.indexOf(c.close, pos + def.open.length)
      if (idx !== -1 && (best === null || idx < best.idx)) best = { ...c, idx }
    }
    if (best !== null) {
      return {
        data: {
          kind: 'node',
          nodeId,
          shapeType: best.type,
          text: line.slice(pos + def.open.length, best.idx),
          gapAfterId,
          openRaw: def.open,
          closeRaw: best.close,
        },
        end: best.idx + best.close.length,
      }
    }
  }
  if (sawOpener) {
    // '>' 旗形开括号与箭头 '>' 同形：找不到闭合时不报错，视为无形状节点
    if (line.startsWith('>', pos)) {
      return { data: { kind: 'node', nodeId, shapeType: null, text: null, gapAfterId: '', openRaw: '', closeRaw: '' }, end: idEnd }
    }
    throw parseFailure(lineNo, `节点 "${nodeId}" 的形状括号未闭合`)
  }

  // 无形状节点：token 止于 id；id 后的空白不属于 token
  return { data: { kind: 'node', nodeId, shapeType: null, text: null, gapAfterId: '', openRaw: '', closeRaw: '' }, end: idEnd }
}

// ---------- 连线 ----------

export type LinkLineStyle = 'solid' | 'dotted' | 'thick' | 'invisible'
export type ArrowMarker = 'none' | 'arrow' | 'circle' | 'cross'
export type EndMarker = 'none' | 'circle' | 'cross'

export interface LinkSpec {
  lineStyle: LinkLineStyle
  /** 终点端装饰：无 / 箭头 > / 圆 o / 叉 x */
  head: ArrowMarker
  /** 起点端装饰（o/x），配合双向或多向连线 */
  tail: EndMarker
  /** 双向（< 在线型符号前，如 <--> / o<-->o） */
  bidirectional: boolean
  length: number
  label: string | null
  /** 行内（`-- 标签 -->`）或管道（`|标签|`）；无标签时 null */
  labelForm: 'inline' | 'pipe' | null
}

export interface LinkOccData {
  kind: 'link'
  fromNodeId: string
  toNodeId: string
  spec: LinkSpec
  /** 行内标签两侧的原始空白（labelForm === 'inline' 时用于保真重写） */
  gapBeforeLabel: string
  gapAfterLabel: string
}

export type LinkChanges = {
  lineStyle?: LinkLineStyle
  head?: ArrowMarker
  tail?: EndMarker
  bidirectional?: boolean
  length?: number
  /** null/空串 = 去掉标签 */
  label?: string | null
}

function renderArrowCore(s: LinkSpec): string {
  if (s.lineStyle === 'invisible') {
    return '~'.repeat(2 + Math.max(1, s.length))
  }
  const core =
    s.lineStyle === 'solid'
      ? '-'.repeat(1 + s.length)
      : s.lineStyle === 'dotted'
        ? '-' + '.'.repeat(s.length) + '-'
        : '='.repeat(1 + s.length)
  const headChar = s.head === 'arrow' ? '>' : s.head === 'circle' ? 'o' : s.head === 'cross' ? 'x' : ''
  const tailChar = s.tail === 'circle' ? 'o' : s.tail === 'cross' ? 'x' : ''
  if (s.bidirectional) {
    // 双向规范化为 <--> 形式；起点端 o/x 写在 < 前，终点端跟在 > 后
    return tailChar + '<' + core + '>' + (tailChar !== '' ? tailChar : '')
  }
  return tailChar + core + headChar
}

/** 行内标签只对经典的 `-->`/`==>`/`-.->` 单长度写法可用 */
function inlineCapable(s: LinkSpec): boolean {
  return (
    s.lineStyle !== 'invisible' &&
    s.length === 1 &&
    s.head === 'arrow' &&
    s.tail === 'none' &&
    !s.bidirectional
  )
}

/** 渲染连线 token（不含两侧空白；span 恰为 token 本身） */
export function renderLinkArrow(d: LinkOccData, changes: LinkChanges = {}): string {
  const s: LinkSpec = {
    lineStyle: changes.lineStyle ?? d.spec.lineStyle,
    head: changes.head ?? d.spec.head,
    tail: changes.tail ?? d.spec.tail,
    bidirectional: changes.bidirectional ?? d.spec.bidirectional,
    length: Math.max(1, changes.length ?? d.spec.length),
    label: changes.label !== undefined ? changes.label : d.spec.label,
    labelForm: d.spec.labelForm,
  }
  if (s.lineStyle === 'invisible' || s.label === null || s.label === '') {
    return renderArrowCore({ ...s, label: null, labelForm: null })
  }
  let form = s.labelForm ?? (inlineCapable(s) ? 'inline' : 'pipe')
  if (form === 'inline' && !inlineCapable(s)) form = 'pipe'
  if (form === 'inline') {
    const open = s.lineStyle === 'dotted' ? '-.' : s.lineStyle === 'thick' ? '==' : '--'
    const close = s.lineStyle === 'dotted' ? '.->' : s.lineStyle === 'thick' ? '==>' : '-->'
    return open + d.gapBeforeLabel + s.label + d.gapAfterLabel + close
  }
  return renderArrowCore(s) + '|' + s.label + '|'
}

/** 新建连线的规范渲染（add-edge 意图用；标签走管道写法） */
function buildEdgeLine(
  from: string,
  to: string,
  spec: Pick<LinkSpec, 'lineStyle' | 'head' | 'tail' | 'bidirectional' | 'length' | 'label'>,
): string {
  const hasLabel = spec.label !== null && spec.label !== ''
  const data: LinkOccData = {
    kind: 'link',
    fromNodeId: from,
    toNodeId: to,
    spec: { ...spec, labelForm: hasLabel ? 'pipe' : null },
    gapBeforeLabel: ' ',
    gapAfterLabel: ' ',
  }
  return `${from} ${renderLinkArrow(data)} ${to}`
}

const INLINE_ARROWS: Array<{ open: string; close: string; lineStyle: Exclude<LinkLineStyle, 'invisible'> }> = [
  { open: '--', close: '-->', lineStyle: 'solid' },
  { open: '-.', close: '.->', lineStyle: 'dotted' },
  { open: '==', close: '==>', lineStyle: 'thick' },
]

function parsePipeLabel(line: string, pos: number): { label: string; end: number } | null {
  if (line[pos] !== '|') return null
  const closeIdx = line.indexOf('|', pos + 1)
  if (closeIdx === -1) return null
  return { label: line.slice(pos + 1, closeIdx), end: closeIdx + 1 }
}

/**
 * 在 pos 处解析连线 token。先尝试纯箭头（含 o/x 端点、双向、长度、可选管道标签），
 * 再尝试行内标签；仅当行内标签匹配的区间比纯箭头更长时才采用（避免 `---->` 被
 * 拆成 `--` + 空 `-->` 之类的误判）。
 */
function parseArrowAt(
  line: string,
  pos: number,
): { spec: LinkSpec; gapBeforeLabel: string; gapAfterLabel: string; end: number } | null {
  let p = pos
  let tail: EndMarker = 'none'
  const c0 = line[p]
  if ((c0 === 'o' || c0 === 'x') && '-=<.~'.includes(line[p + 1] ?? '')) {
    tail = c0 === 'o' ? 'circle' : 'cross'
    p++
  }
  let bidirectional = false
  if (line[p] === '<') {
    bidirectional = true
    p++
  }

  const rest = line.slice(p)
  let lineStyle: LinkLineStyle | null = null
  let coreLen = 0
  let m: RegExpExecArray | null
  if ((m = /^(~{3,})/.exec(rest))) {
    lineStyle = 'invisible'
    coreLen = m[1].length
  } else if ((m = /^(-\.+-)/.exec(rest))) {
    lineStyle = 'dotted'
    coreLen = m[1].length
  } else if ((m = /^(-{2,})/.exec(rest))) {
    lineStyle = 'solid'
    coreLen = m[1].length
  } else if ((m = /^(={2,})/.exec(rest))) {
    lineStyle = 'thick'
    coreLen = m[1].length
  }
  if (lineStyle === null) {
    // 纯箭头解析失败：整体可能是 `-. 标签 .->` 行内标签形式（点线行内标签没有
    // 纯箭头前缀），仅尝试行内标签分支
    return tryInlineLabel(line, pos) ?? null
  }
  p += coreLen

  let head: ArrowMarker = 'none'
  const ch = line[p]
  if (ch === '>') {
    head = 'arrow'
    p++
  } else if (ch === 'o') {
    head = 'circle'
    p++
  } else if (ch === 'x') {
    head = 'cross'
    p++
  }

  const pipe = parsePipeLabel(line, p)
  const plainEnd = pipe !== null ? pipe.end : p
  const plainSpec: LinkSpec = {
    lineStyle,
    head,
    tail,
    bidirectional,
    length: lineStyle === 'solid' || lineStyle === 'thick' ? coreLen - 1 : coreLen - 2,
    label: pipe !== null ? pipe.label : null,
    labelForm: pipe !== null ? 'pipe' : null,
  }

  // 行内标签：仅当整体区间比纯箭头更长时采用
  const inline = tryInlineLabel(line, pos)
  if (inline !== null && inline.end > plainEnd) return inline
  return { spec: plainSpec, gapBeforeLabel: ' ', gapAfterLabel: ' ', end: plainEnd }
}

/** 在 pos 处尝试行内标签连线（`-- 文字 -->` / `-. 文字 .->` / `== 文字 ==>`） */
function tryInlineLabel(
  line: string,
  pos: number,
): { spec: LinkSpec; gapBeforeLabel: string; gapAfterLabel: string; end: number } | null {
  for (const { open, close, lineStyle: ls } of INLINE_ARROWS) {
    if (!line.startsWith(open, pos)) continue
    // open 后紧跟箭头头（如 `-->` 的 '>'）：这是纯箭头而非行内标签
    if (line[pos + open.length] === '>') continue
    const closeIdx = line.indexOf(close, pos + open.length)
    if (closeIdx === -1 || closeIdx === pos + open.length) continue // 空标签区 = 纯箭头
    const labelRaw = line.slice(pos + open.length, closeIdx)
    // 标签只剩线型符号残段（如 `----->` 的后半）：这是加长箭头而非标签
    if (/^[-=.]*>?$/.test(labelRaw.trim())) continue
    const gapBeforeLabel = /^[ \t]*/.exec(labelRaw)?.[0] ?? ''
    const gapAfterLabel = /[ \t]*$/.exec(labelRaw)?.[0] ?? ''
    return {
      spec: {
        lineStyle: ls,
        head: 'arrow',
        tail: 'none',
        bidirectional: false,
        length: 1,
        label: labelRaw.slice(gapBeforeLabel.length, labelRaw.length - gapAfterLabel.length),
        labelForm: 'inline',
      },
      gapBeforeLabel,
      gapAfterLabel,
      end: closeIdx + close.length,
    }
  }
  return null
}

// ---------- 行级元素：header / subgraph / direction / classDef ----------

export interface HeaderData {
  kind: 'header'
  keyword: string
  gap: string
  direction: string
}

function renderHeader(d: HeaderData, changes: { direction?: string } = {}): string {
  return d.keyword + d.gap + (changes.direction ?? d.direction)
}

export interface SubgraphOpenData {
  kind: 'subgraph-open'
  id: string | null
  title: string | null
  titleBracketed: boolean
  quote: string
  gap1: string
  gap2: string
}

function renderSubgraphOpen(d: SubgraphOpenData, newTitle: string): string {
  if (d.titleBracketed) {
    const idPart = d.id !== null ? d.id + d.gap2 : ''
    const q = d.quote
    return `subgraph${d.gap1}${idPart}[${q}${newTitle}${q}]`
  }
  if (d.id !== null) {
    return `subgraph${d.gap1}${d.id}["${newTitle}"]`
  }
  return `subgraph${d.gap1}${newTitle}`
}

export interface SubgraphEndData {
  kind: 'subgraph-end'
}

export interface DirectionData {
  kind: 'direction'
  gap: string
  direction: string
}

export interface ClassDefItem {
  /** 本项之前的分隔符原文（首项为名字与首项之间的空白，其余如 ',' 或 ', '） */
  sep: string
  key: string
  value: string
}

export interface ClassDefData {
  kind: 'classdef'
  name: string
  gap: string
  items: ClassDefItem[]
}

export function renderClassDefRaw(d: ClassDefData): string {
  return `classDef${d.gap}${d.name}${d.items.map((i) => `${i.sep}${i.key}:${i.value}`).join('')}`
}

export function renderClassDef(d: ClassDefData, changes: { prop: string; value: string }): string {
  if (changes.prop === '') return renderClassDefRaw(d)
  const firstSep = d.items[0]?.sep ?? ' '
  const items = d.items.map((i) => ({ ...i })).filter((i) => !(i.key === changes.prop && changes.value === ''))
  const exists = d.items.some((i) => i.key === changes.prop)
  if (!exists && changes.value !== '') {
    items.push({ sep: items.length === 0 ? firstSep : ',', key: changes.prop, value: changes.value })
  } else {
    for (const item of items) {
      if (item.key === changes.prop) item.value = changes.value
    }
  }
  if (items.length > 0) items[0].sep = firstSep
  return renderClassDefRaw({ ...d, items })
}

type FlowchartElementData =
  | HeaderData
  | NodeOccData
  | LinkOccData
  | SubgraphOpenData
  | SubgraphEndData
  | DirectionData
  | ClassDefData

// ---------- 语句行解析 ----------

const HEADER_RE = /^([ \t]*)(flowchart|graph)([ \t]+)(\S+)([ \t\r]*)$/i
const DIRECTION_RE = /^direction([ \t]+)(\S+)([ \t]*)$/
const WS_RE = /[ \t\r]*/y

function skipWs(line: string, pos: number): number {
  WS_RE.lastIndex = pos
  const match = WS_RE.exec(line)
  return pos + (match !== null ? match[0].length : 0)
}

interface RawEntry {
  /** 相对行首的区间（classifyLine 再加行偏移） */
  span: Span
  data: FlowchartElementData
}

/** 解析一行语句（节点行 / 连线行 / 链式连线），失败返回 null（整行原样保留） */
function tryStatement(line: string, start: number, lineNo: number): RawEntry[] | null {
  const first = parseNodeToken(line, start, lineNo)
  if (first === null) return null

  const entries: RawEntry[] = [
    {
      span: { start, end: first.end },
      data: { ...first.data, trailing: '', standalone: true },
    },
  ]
  let lastEnd = first.end

  for (;;) {
    if (skipWs(line, lastEnd) >= line.length) {
      // 行以节点结尾：行尾残留（空白/注释）归最后一个节点元素，其 span 延至行尾
      const lastEntry = entries[entries.length - 1]
      const rawTrailing = line.slice(lastEnd)
      if (/[^\s]/.test(rawTrailing.replace(/%%.*/, ''))) return null
      lastEntry.span.end = line.length
      if (lastEntry.data.kind === 'node') {
        lastEntry.data.trailing = rawTrailing
        lastEntry.data.standalone = entries.length === 1
      }
      return entries
    }
    const arrowPos = skipWs(line, lastEnd)
    const arrow = parseArrowAt(line, arrowPos)
    if (arrow === null) return null
    const nextPos = skipWs(line, arrow.end)
    const next = parseNodeToken(line, nextPos, lineNo)
    if (next === null) return null

    entries.push({
      span: { start: arrowPos, end: arrow.end },
      data: {
        kind: 'link',
        fromNodeId: nodeOf(entries, entries.length - 1).nodeId,
        toNodeId: next.data.nodeId,
        spec: arrow.spec,
        gapBeforeLabel: arrow.gapBeforeLabel,
        gapAfterLabel: arrow.gapAfterLabel,
      },
    })
    entries.push({
      span: { start: nextPos, end: next.end },
      data: { ...next.data, trailing: '', standalone: false },
    })
    lastEnd = next.end
  }
}

function nodeOf(entries: RawEntry[], index: number): NodeOccData {
  for (let i = index; i >= 0; i--) {
    const data = entries[i].data
    if (data.kind === 'node') return data
  }
  throw new Error('解析器内部错误：连线缺少起点节点')
}

function parseSubgraphLine(line: string, start: number): SubgraphOpenData | null {
  const rest = line.slice(start + 'subgraph'.length)
  if (rest !== '' && !/^[ \t]/.test(rest)) return null
  const gap1 = /^[ \t]*/.exec(rest)?.[0] ?? ''
  const body = rest.slice(gap1.length)

  let id: string | null = null
  let title: string | null = null
  let titleBracketed = false
  let quote = ''
  let gap2 = ''

  if (body !== '') {
    if (body.startsWith('[')) {
      const m = /^\[(["']?)(.*)\1\][ \t\r]*$/.exec(body)
      if (m === null) return null
      titleBracketed = true
      quote = m[1]
      title = m[2]
    } else {
      const idMatch = /^[^\s[]+/.exec(body)
      if (idMatch === null) return null
      const after = body.slice(idMatch[0].length)
      const bracket = /^[ \t]*(\[(["']?)(.*)\2\])[ \t\r]*$/.exec(after)
      if (after.trim() === '') {
        id = idMatch[0]
      } else if (bracket !== null) {
        id = idMatch[0]
        gap2 = /^[ \t]*/.exec(after)?.[0] ?? ''
        titleBracketed = true
        quote = bracket[2]
        title = bracket[3]
      } else {
        // 整体作为标题（如 `subgraph one two`）
        title = body.replace(/[ \t\r]+$/, '')
      }
    }
  }

  return { kind: 'subgraph-open', id, title, titleBracketed, quote, gap1, gap2 }
}

export function parseClassDefLine(line: string, start: number): ClassDefData | null {
  const rest = line.slice(start + 'classDef'.length)
  if (rest !== '' && !/^[ \t]/.test(rest)) return null
  const gap = /^[ \t]*/.exec(rest)?.[0] ?? ''
  const body = rest.slice(gap.length)
  const nameMatch = /^[^\s,]+/.exec(body)
  if (nameMatch === null) return null
  const name = nameMatch[0]
  const propsRaw = body.slice(name.length)
  const items: ClassDefItem[] = []
  const segments = propsRaw.split(',')
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const kv = seg.trim()
    if (kv === '') continue
    const colonIdx = kv.indexOf(':')
    if (colonIdx === -1) return null
    const leadWs = /^[ \t]*/.exec(seg)?.[0] ?? ''
    const sep = i === 0 ? leadWs : ',' + leadWs
    items.push({ sep, key: kv.slice(0, colonIdx).trim(), value: kv.slice(colonIdx + 1).trim() })
  }
  return { kind: 'classdef', name, gap, items }
}

export const linkElementId = (from: string, to: string, occurrence: number): string =>
  occurrence <= 1 ? `link:${from}:${to}` : `link:${from}:${to}#${occurrence}`

export const nodeElementId = (nodeId: string, occurrence: number): string =>
  occurrence <= 1 ? `node:${nodeId}` : `node:${nodeId}#${occurrence}`

// ---------- 编辑意图（工单 04 表单所需的最小完备集合） ----------

export type FlowchartIntent =
  /** 改节点显示文本（更新全部带形状的出现；全无形状时首个出现获得矩形形状） */
  | { type: 'set-node-text'; nodeId: string; text: string }
  /** 改节点 id（文档中全部出现） */
  | { type: 'rename-node'; nodeId: string; newId: string }
  /** 换节点形状 */
  | { type: 'set-node-shape'; nodeId: string; shape: NodeShapeType }
  /** 新增节点声明行（afterElementId 缺省时追加到文档末尾元素之后；缩进跟随锚点行） */
  | { type: 'add-node'; nodeId: string; text?: string; shape?: NodeShapeType; afterElementId?: string }
  /** 删除节点：其全部出现与触及的连线（链中删除后两端自动合并） */
  | { type: 'delete-node'; nodeId: string }
  /** 改连线标签（occurrence 缺省 1；null/空串 = 去标签） */
  | { type: 'set-edge-label'; from: string; to: string; occurrence?: number; label: string | null }
  /** 改连线类型/标签的统一意图；未给出的字段保持不变 */
  | {
      type: 'set-edge'
      from: string
      to: string
      occurrence?: number
      lineStyle?: LinkLineStyle
      head?: ArrowMarker
      tail?: EndMarker
      bidirectional?: boolean
      length?: number
      label?: string | null
    }
  /** 删除连线（链中按相邻语义收缩；单连线行整行删除） */
  | { type: 'delete-edge'; from: string; to: string; occurrence?: number }
  /** 新增连线行（标签走管道写法） */
  | {
      type: 'add-edge'
      from: string
      to: string
      lineStyle?: LinkLineStyle
      head?: ArrowMarker
      tail?: EndMarker
      bidirectional?: boolean
      length?: number
      label?: string | null
      afterElementId?: string
    }
  /** 改图方向（TB/TD/BT/RL/LR） */
  | { type: 'set-direction'; direction: string }
  /** 设置 classDef 属性；value 空串 = 删除该属性 */
  | { type: 'set-classdef-prop'; name: string; prop: string; value: string }
  /** 新增 classDef 行 */
  | { type: 'add-classdef'; name: string; props?: Record<string, string>; afterElementId?: string }
  /** 改 subgraph 标题（elementId = `subgraph:N`） */
  | { type: 'set-subgraph-title'; elementId: string; title: string }
  /** 新增空 subgraph（open + end 两行） */
  | { type: 'add-subgraph'; title?: string; afterElementId?: string }
  /** 删除 subgraph（open 到 end 之间的全部元素，含内容） */
  | { type: 'delete-subgraph'; elementId: string }

const DIRECTIONS = ['TB', 'TD', 'BT', 'RL', 'LR']

function isValidNodeId(id: string): boolean {
  return VALID_NEW_ID_RE.test(id) && !id.includes('--') && id !== 'end'
}

/** 新建节点/连线 id 的合法性校验（表单层复用，与意图落地侧同一规则） */
export function isValidNewNodeId(id: string): boolean {
  return isValidNodeId(id)
}

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
    const nodeCounts = new Map<string, number>()
    const linkCounts = new Map<string, number>()
    const classDefCounts = new Map<string, number>()
    const subgraphStack: Array<number> = [] // 未闭合 subgraph 的行号
    const counters = { subgraph: 0 }
    let seenHeader = false
    // 文首 frontmatter 块（主题等配置）不参与解析，整体 verbatim 保留（工单 11）
    const bodyStart = frontmatterEnd(source)
    let lineNo = bodyStart === 0 ? 0 : source.slice(0, bodyStart).split('\n').length - 1
    let cursor = bodyStart

    for (;;) {
      const nl = source.indexOf('\n', cursor)
      const lineEnd = nl === -1 ? source.length : nl
      const line = source.slice(cursor, lineEnd)
      lineNo++

      if (line.trim() !== '') {
        this.classifyLine(line, cursor, lineNo, seenHeader, entries, nodeCounts, linkCounts, classDefCounts, subgraphStack, counters)
        const last = entries[entries.length - 1]
        if (last !== undefined && last.span.start === cursor && last.data.kind === 'header') {
          seenHeader = true
        }
      }

      if (nl === -1) break
      cursor = nl + 1
    }

    if (!seenHeader) {
      throw parseFailure(1, '图表必须以 flowchart/graph 声明开始')
    }
    if (subgraphStack.length > 0) {
      throw parseFailure(subgraphStack[subgraphStack.length - 1], 'subgraph 缺少匹配的 end')
    }
    return assembleDocument(source, entries)
  }

  private classifyLine(
    line: string,
    lineStart: number,
    lineNo: number,
    seenHeader: boolean,
    entries: Array<{ span: Span; id: string; data: AnyElement }>,
    nodeCounts: Map<string, number>,
    linkCounts: Map<string, number>,
    classDefCounts: Map<string, number>,
    subgraphStack: number[],
    counters: { subgraph: number },
  ): void {
    const firstChar = line.length - line.trimStart().length
    const trimmed = line.trim()

    const headerMatch = HEADER_RE.exec(line)
    if (headerMatch !== null) {
      const headerData: HeaderData = {
        kind: 'header',
        keyword: headerMatch[2],
        gap: headerMatch[3],
        direction: headerMatch[4],
      }
      entries.push({
        span: { start: lineStart, end: lineStart + line.length },
        id: entries.some((e) => e.id === 'header') ? `header#${entries.length}` : 'header',
        data: headerData,
      })
      return
    }

    if (trimmed === 'end') {
      if (!seenHeader || subgraphStack.length === 0) {
        throw parseFailure(lineNo, '多余的 end（没有与之匹配的 subgraph）')
      }
      subgraphStack.pop()
      const endData: SubgraphEndData = { kind: 'subgraph-end' }
      entries.push({
        span: { start: lineStart + firstChar, end: lineStart + line.length },
        id: `end#${entries.length}`,
        data: endData,
      })
      return
    }

    if (trimmed === 'subgraph' || trimmed.startsWith('subgraph ') || trimmed.startsWith('subgraph\t')) {
      if (!seenHeader) throw parseFailure(lineNo, '图表必须以 flowchart/graph 声明开始')
      const data = parseSubgraphLine(line, firstChar)
      if (data !== null) {
        subgraphStack.push(lineNo)
        counters.subgraph++
        entries.push({ span: { start: lineStart + firstChar, end: lineStart + line.length }, id: `subgraph:${counters.subgraph}`, data })
        return
      }
      return // 解析不了：原样保留
    }

    const directionMatch = DIRECTION_RE.exec(trimmed)
    if (directionMatch !== null && subgraphStack.length > 0) {
      const directionData: DirectionData = {
        kind: 'direction',
        gap: directionMatch[1],
        direction: directionMatch[2],
      }
      entries.push({
        span: { start: lineStart + firstChar, end: lineStart + line.length },
        id: `direction#${entries.length}`,
        data: directionData,
      })
      return
    }

    if (trimmed === 'classDef' || trimmed.startsWith('classDef ') || trimmed.startsWith('classDef\t')) {
      const data = parseClassDefLine(line, firstChar)
      if (data !== null) {
        const count = (classDefCounts.get(data.name) ?? 0) + 1
        classDefCounts.set(data.name, count)
        const id = `classdef:${data.name}` + (count > 1 ? `#${count}` : '')
        entries.push({ span: { start: lineStart + firstChar, end: lineStart + line.length }, id, data })
        return
      }
      return
    }

    // 语句行（节点 / 连线 / 链式）
    const statement = tryStatement(line, firstChar, lineNo)
    if (statement !== null) {
      if (!seenHeader) throw parseFailure(lineNo, '图表必须以 flowchart/graph 声明开始')
      for (const raw of statement) {
        const span: Span = { start: lineStart + raw.span.start, end: lineStart + raw.span.end }
        if (raw.data.kind === 'node') {
          const count = (nodeCounts.get(raw.data.nodeId) ?? 0) + 1
          nodeCounts.set(raw.data.nodeId, count)
          entries.push({ span, id: nodeElementId(raw.data.nodeId, count), data: raw.data })
        } else if (raw.data.kind === 'link') {
          const key = `${raw.data.fromNodeId}->${raw.data.toNodeId}`
          const count = (linkCounts.get(key) ?? 0) + 1
          linkCounts.set(key, count)
          entries.push({ span, id: linkElementId(raw.data.fromNodeId, raw.data.toNodeId, count), data: raw.data })
        }
      }
      return
    }

    // 注释、空行已在上层过滤；其余行（linkStyle、click、class、看不懂的语法）不解析，
    // 作为 verbatim 逐字保留（ADR-0008）
  }

  // ---------- 意图落地（resolveRewrites） ----------

  resolveRewrites(doc: SourceDocument, intent: EditIntent): ReadonlyMap<string, string> | null {
    switch (intent.type) {
      case 'set-node-text':
        return this.resolveSetNodeText(doc, intent as Extract<FlowchartIntent, { type: 'set-node-text' }>)
      case 'rename-node':
        return this.resolveRenameNode(doc, intent as Extract<FlowchartIntent, { type: 'rename-node' }>)
      case 'set-node-shape':
        return this.resolveSetNodeShape(doc, intent as Extract<FlowchartIntent, { type: 'set-node-shape' }>)
      case 'add-node':
        return this.resolveAddNode(doc, intent as Extract<FlowchartIntent, { type: 'add-node' }>)
      case 'delete-node':
        return this.resolveDeleteNode(doc, intent as Extract<FlowchartIntent, { type: 'delete-node' }>)
      case 'set-edge-label':
        return this.resolveSetEdgeLabel(doc, intent as Extract<FlowchartIntent, { type: 'set-edge-label' }>)
      case 'set-edge':
        return this.resolveSetEdge(doc, intent as Extract<FlowchartIntent, { type: 'set-edge' }>)
      case 'delete-edge':
        return this.resolveDeleteEdge(doc, intent as Extract<FlowchartIntent, { type: 'delete-edge' }>)
      case 'add-edge':
        return this.resolveAddEdge(doc, intent as Extract<FlowchartIntent, { type: 'add-edge' }>)
      case 'set-direction':
        return this.resolveSetDirection(doc, intent as Extract<FlowchartIntent, { type: 'set-direction' }>)
      case 'set-classdef-prop':
        return this.resolveSetClassDefProp(doc, intent as Extract<FlowchartIntent, { type: 'set-classdef-prop' }>)
      case 'add-classdef':
        return this.resolveAddClassDef(doc, intent as Extract<FlowchartIntent, { type: 'add-classdef' }>)
      case 'set-subgraph-title':
        return this.resolveSetSubgraphTitle(doc, intent as Extract<FlowchartIntent, { type: 'set-subgraph-title' }>)
      case 'add-subgraph':
        return this.resolveAddSubgraph(doc, intent as Extract<FlowchartIntent, { type: 'add-subgraph' }>)
      case 'delete-subgraph':
        return this.resolveDeleteSubgraph(doc, intent as Extract<FlowchartIntent, { type: 'delete-subgraph' }>)
      default:
        return null
    }
  }

  private nodeOccs(doc: SourceDocument, nodeId: string) {
    return doc.elements.filter((part) => part.element.kind === 'node' && (part.element as NodeOccData).nodeId === nodeId)
  }

  private resolveSetNodeText(
    doc: SourceDocument,
    intent: Extract<FlowchartIntent, { type: 'set-node-text' }>,
  ): Map<string, string> | null {
    const occs = this.nodeOccs(doc, intent.nodeId)
    if (occs.length === 0) return null
    const shaped = occs.filter((part) => (part.element as NodeOccData).shapeType !== null)
    if (shaped.length > 0) {
      const rewrites = new Map<string, string>()
      for (const part of shaped) {
        rewrites.set(part.id, renderNodeOcc(part.element as NodeOccData, { text: intent.text }))
      }
      return rewrites
    }
    const target = occs.find((part) => (part.element as NodeOccData).standalone) ?? occs[0]
    return new Map([[target.id, renderNodeOcc(target.element as NodeOccData, { text: intent.text, shape: 'rectangle' })]])
  }

  private resolveRenameNode(
    doc: SourceDocument,
    intent: Extract<FlowchartIntent, { type: 'rename-node' }>,
  ): Map<string, string> | null {
    if (!isValidNodeId(intent.newId)) return null
    const occs = this.nodeOccs(doc, intent.nodeId)
    if (occs.length === 0) return null
    const rewrites = new Map<string, string>()
    for (const part of occs) {
      rewrites.set(part.id, renderNodeOcc(part.element as NodeOccData, { newId: intent.newId }))
    }
    return rewrites
  }

  private resolveSetNodeShape(
    doc: SourceDocument,
    intent: Extract<FlowchartIntent, { type: 'set-node-shape' }>,
  ): Map<string, string> | null {
    const occs = this.nodeOccs(doc, intent.nodeId)
    if (occs.length === 0) return null
    const shaped = occs.find((part) => (part.element as NodeOccData).shapeType !== null)
    const target = shaped ?? occs.find((part) => (part.element as NodeOccData).standalone) ?? occs[0]
    return new Map([[target.id, renderNodeOcc(target.element as NodeOccData, { shape: intent.shape })]])
  }

  /**
   * 插入新行：重写锚点元素 span = 原文 + 每行 '\n' + 锚点行缩进 + 新行内容。
   * 锚点缺省取文档最后一个元素。
   */
  private insertAfter(
    doc: SourceDocument,
    afterElementId: string | undefined,
    newLines: (indent: string) => string[],
  ): Map<string, string> | null {
    const requested =
      (afterElementId !== undefined ? getElementById(doc, afterElementId) : undefined) ??
      doc.elements[doc.elements.length - 1]
    if (requested === undefined) return null
    // 新行插在锚点所在行的行尾：锚点取该行 span 最靠后的元素（链式语句的行末节点）
    const line = lineAtOffset(doc.source, requested.span.start)
    const anchor =
      doc.elements
        .filter((part) => lineAtOffset(doc.source, part.span.start) === line)
        .sort((a, b) => b.span.end - a.span.end)[0] ?? requested
    const indent = lineIndent(doc.source, requested.span.start)
    const inserted = newLines(indent)
      .map((l) => '\n' + indent + l)
      .join('')
    return new Map([[anchor.id, doc.source.slice(anchor.span.start, anchor.span.end) + inserted]])
  }

  private resolveAddNode(
    doc: SourceDocument,
    intent: Extract<FlowchartIntent, { type: 'add-node' }>,
  ): Map<string, string> | null {
    if (!isValidNodeId(intent.nodeId)) return null
    return this.insertAfter(doc, intent.afterElementId, () => [
      buildNodeLine(intent.nodeId, intent.text ?? intent.nodeId, intent.shape ?? 'rectangle'),
    ])
  }

  private resolveDeleteNode(
    doc: SourceDocument,
    intent: Extract<FlowchartIntent, { type: 'delete-node' }>,
  ): Map<string, string> | null {
    const occs = this.nodeOccs(doc, intent.nodeId)
    if (occs.length === 0) return null
    const rewrites = new Map<string, string>()
    for (const part of occs) rewrites.set(part.id, '')

    // 触及该节点的连线：终点为其的连线删除；起点为其的连线仅当同线没有“终点为其”的连线时才删除
    // （链中 X --> B --> Y 删 B 合并为 X --> Y，保留一条连线）
    const links = doc.elements.filter(
      (part) =>
        part.element.kind === 'link' &&
        ((part.element as LinkOccData).fromNodeId === intent.nodeId ||
          (part.element as LinkOccData).toNodeId === intent.nodeId),
    )
    const hasIncomingOn = (line: number) =>
      links.some(
        (part) =>
          (part.element as LinkOccData).toNodeId === intent.nodeId &&
          lineAtOffset(doc.source, part.span.start) === line,
      )
    for (const part of links) {
      const link = part.element as LinkOccData
      const line = lineAtOffset(doc.source, part.span.start)
      if (link.toNodeId === intent.nodeId || !hasIncomingOn(line)) {
        rewrites.set(part.id, '')
      }
    }
    return rewrites
  }

  private linkPart(doc: SourceDocument, from: string, to: string, occurrence: number | undefined) {
    const part = getElementById(doc, linkElementId(from, to, occurrence ?? 1))
    if (part === undefined || part.element.kind !== 'link') return null
    return part
  }

  private resolveSetEdgeLabel(
    doc: SourceDocument,
    intent: Extract<FlowchartIntent, { type: 'set-edge-label' }>,
  ): Map<string, string> | null {
    const part = this.linkPart(doc, intent.from, intent.to, intent.occurrence)
    if (part === null) return null
    return new Map([[part.id, renderLinkArrow(part.element as LinkOccData, { label: intent.label })]])
  }

  private resolveSetEdge(
    doc: SourceDocument,
    intent: Extract<FlowchartIntent, { type: 'set-edge' }>,
  ): Map<string, string> | null {
    const part = this.linkPart(doc, intent.from, intent.to, intent.occurrence)
    if (part === null) return null
    const changes: LinkChanges = {}
    if (intent.lineStyle !== undefined) changes.lineStyle = intent.lineStyle
    if (intent.head !== undefined) changes.head = intent.head
    if (intent.tail !== undefined) changes.tail = intent.tail
    if (intent.bidirectional !== undefined) changes.bidirectional = intent.bidirectional
    if (intent.length !== undefined) changes.length = intent.length
    if (intent.label !== undefined) changes.label = intent.label
    return new Map([[part.id, renderLinkArrow(part.element as LinkOccData, changes)]])
  }

  private resolveDeleteEdge(
    doc: SourceDocument,
    intent: Extract<FlowchartIntent, { type: 'delete-edge' }>,
  ): Map<string, string> | null {
    const part = this.linkPart(doc, intent.from, intent.to, intent.occurrence)
    if (part === null) return null
    const line = lineAtOffset(doc.source, part.span.start)
    const sameLine = <T extends { span: Span }>(parts: T[]) =>
      parts.filter((p) => lineAtOffset(doc.source, p.span.start) === line)
    const lineLinks = sameLine(doc.elements.filter((p) => p.element.kind === 'link')).sort((a, b) => a.span.start - b.span.start)
    const idx = lineLinks.indexOf(part)
    if (idx === -1) return null
    const rewrites = new Map<string, string>([[part.id, '']])
    const removeNode = (which: 'before' | 'after') => {
      const candidates = sameLine(doc.elements.filter((p) => p.element.kind === 'node'))
      const target =
        which === 'before'
          ? candidates.filter((p) => p.span.end <= part.span.start).sort((a, b) => b.span.end - a.span.end)[0]
          : candidates.filter((p) => p.span.start >= part.span.end).sort((a, b) => a.span.start - b.span.start)[0]
      if (target !== undefined) rewrites.set(target.id, '')
    }
    if (idx === 0 && lineLinks.length === 1) {
      removeNode('before')
      removeNode('after')
    } else if (idx === 0) {
      removeNode('before')
    } else if (idx === lineLinks.length - 1) {
      removeNode('after')
    } else {
      // 链中间：删除两端节点出现与后一条相邻连线，前一条连线把两侧剩余节点接起来
      removeNode('before')
      removeNode('after')
      rewrites.set(lineLinks[idx + 1].id, '')
    }
    return rewrites
  }

  private resolveAddEdge(
    doc: SourceDocument,
    intent: Extract<FlowchartIntent, { type: 'add-edge' }>,
  ): Map<string, string> | null {
    if (!isValidNodeId(intent.from) || !isValidNodeId(intent.to)) return null
    return this.insertAfter(doc, intent.afterElementId, () => [
      buildEdgeLine(intent.from, intent.to, {
        lineStyle: intent.lineStyle ?? 'solid',
        head: intent.head ?? 'arrow',
        tail: intent.tail ?? 'none',
        bidirectional: intent.bidirectional ?? false,
        length: intent.length ?? 1,
        label: intent.label ?? null,
      }),
    ])
  }

  private resolveSetDirection(
    doc: SourceDocument,
    intent: Extract<FlowchartIntent, { type: 'set-direction' }>,
  ): Map<string, string> | null {
    const dir = intent.direction.toUpperCase()
    if (!DIRECTIONS.includes(dir)) return null
    const header = doc.elements.find((part) => part.element.kind === 'header')
    if (header === undefined) return null
    return new Map([[header.id, renderHeader(header.element as HeaderData, { direction: dir })]])
  }

  private classDefPart(doc: SourceDocument, name: string) {
    return doc.elements.find((part) => part.element.kind === 'classdef' && (part.element as ClassDefData).name === name)
  }

  private resolveSetClassDefProp(
    doc: SourceDocument,
    intent: Extract<FlowchartIntent, { type: 'set-classdef-prop' }>,
  ): Map<string, string> | null {
    const part = this.classDefPart(doc, intent.name)
    if (part === undefined) return null
    return new Map([[part.id, renderClassDef(part.element as ClassDefData, { prop: intent.prop, value: intent.value })]])
  }

  private resolveAddClassDef(
    doc: SourceDocument,
    intent: Extract<FlowchartIntent, { type: 'add-classdef' }>,
  ): Map<string, string> | null {
    if (intent.name === '' || /[\s,]/.test(intent.name)) return null
    const items: ClassDefItem[] = Object.entries(intent.props ?? {}).map(([key, value], i) => ({
      sep: i === 0 ? ' ' : ',',
      key,
      value,
    }))
    return this.insertAfter(doc, intent.afterElementId, () => [
      renderClassDefRaw({ kind: 'classdef', name: intent.name, gap: ' ', items }),
    ])
  }

  private resolveSetSubgraphTitle(
    doc: SourceDocument,
    intent: Extract<FlowchartIntent, { type: 'set-subgraph-title' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'subgraph-open') return null
    return new Map([[part.id, renderSubgraphOpen(part.element as SubgraphOpenData, intent.title)]])
  }

  private resolveAddSubgraph(
    doc: SourceDocument,
    intent: Extract<FlowchartIntent, { type: 'add-subgraph' }>,
  ): Map<string, string> | null {
    const title = intent.title ?? ''
    const open = title === '' ? 'subgraph' : `subgraph ${title}`
    return this.insertAfter(doc, intent.afterElementId, () => [open, 'end'])
  }

  private resolveDeleteSubgraph(
    doc: SourceDocument,
    intent: Extract<FlowchartIntent, { type: 'delete-subgraph' }>,
  ): Map<string, string> | null {
    const open = getElementById(doc, intent.elementId)
    if (open === undefined || open.element.kind !== 'subgraph-open') return null
    let depth = 1
    let end: (typeof doc.elements)[number] | null = null
    for (const part of doc.elements) {
      if (part.span.start <= open.span.start) continue
      if (part.element.kind === 'subgraph-open') depth++
      if (part.element.kind === 'subgraph-end') {
        depth--
        if (depth === 0) {
          end = part
          break
        }
      }
    }
    if (end === null) return null
    const rewrites = new Map<string, string>()
    for (const part of doc.elements) {
      if (part.span.start >= open.span.start && part.span.end <= end.span.end) {
        rewrites.set(part.id, '')
      }
    }
    return rewrites
  }
}

/** 元素所在行的行首缩进（插入新行时跟随用户缩进习惯） */
function lineIndent(source: string, offset: number): string {
  const lineStart = source.lastIndexOf('\n', Math.max(0, offset - 1)) + 1
  let i = lineStart
  while (i < offset && (source[i] === ' ' || source[i] === '\t')) i++
  return source.slice(lineStart, i)
}

export const flowchartParser = new FlowchartParser()
