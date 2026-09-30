import { assembleDocument, getElementById, type ElementPart, type SourceDocument } from './document'
import type { DiagramParser, EditIntent, ParseResult, SourceParseError } from './parser'
import { frontmatterEnd } from './frontmatter'
import type { Span } from './span'
import { indentLines, insertAfter, resolveAnchor } from './insert'
import { blockGroupElementId, blockNodeElementId } from './element-id'

/**
 * block(-beta) 完整解析器（more-diagrams 工单 09，语法事实以
 * spec 的 research/journey-block-catalog.md B2 部分为准，并已对 mermaid 12.0.0
 * 的 blockDiagram chunk（jison 编译产物）逐条核对词法——见工单 Comments）。
 * 手写、逐行、带 span（ADR-0004）。可测试承诺：解析后不做修改再重组装，
 * 输出与输入逐字相同（verbatim identity）。
 *
 * 覆盖（分层对齐，工单决策）：
 * - 声明行：`block-beta` 或 `block`（12.0.0 两个关键字都接受；diagram id 返回 block）
 * - 节点形状全家族：裸 `id`、`[]`、`()`、`([])`、`[[]]`、`[()]`、`(())`、`((()))`、`{}`、
 *   `{{}}`、`>label]`、`[/]`、`[\]`、[/\]、[\/]，以及块箭头 `id<["L"]>(dir)`
 * - 边全家族：`[xo<]?` 前缀 + `--`/`==`/`-.` 核心 + `[xo>]` 后缀自由组合
 *   （`-->` / `--` / `x--x` / `o--o` / `<-->` / `==>` / `-.->`…），边标签 `A-- "t" -->B`
 *   （不支持管道写法 `|label|`）；边可出现在任意作用域（mermaid 的边是全局收集的）
 * - `columns N` / `columns auto`（顶层与嵌套块内各可有一行）
 * - 嵌套块 `block:gid[:n] ... end`（可多层）；`space` / `space:N`；节点 `:n` 跨列；`title`
 *
 * 不解析、原样保留（清单外语法不报错，ADR-0008）：`style` / `classDef` / `class` /
 * `linkStyle` / `accTitle` / `accDescr`、frontmatter、`%%` 注释、`~~~` 隐形连线、
 * 无法识别的行。
 *
 * 词法事实（编译产物核对，本模块的校验器据此把关）：
 * - 节点 id 不含 `-`（`A-B` 会被切成两个 token）与空白/`:=`/括号家族
 * - `A - B`（单横线）不是合法连法——单 `-` 不构成边 token，行落回 verbatim
 * - 边标签形态是「算子切成两半夹住引号标签」：`A-- "t" -->B`（左半 `--`、右半 `-->`）；
 *   无尾部算子半段的裸 `--` 无法承载标签（落地侧拒绝，见 set-edge）
 * - 边起点端默认 arrow_open，只有显式 `x` / `o` / `<` 才有起点箭头
 *
 * span 约定（与 state / er 解析器同口径）：元素 span 从该行首个非空白字符起、到行尾
 * （不含换行）；行首缩进与换行留在 verbatim。嵌套块 = 声明行 + 块内各行 + `end` 行
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

// ---------- 形状家族（typeStr2Type 的枚举面，表单/投影共用） ----------

/**
 * 节点形状枚举（`typeStr2Type` 全表 + 'none' = 裸 id）。
 * `block_arrow` 只做解析与 label 编辑，不做形状/方向编辑（工单决策，见 set-node-shape）。
 */
export const BLOCK_SHAPES = [
  'none',
  'square',
  'round',
  'stadium',
  'subroutine',
  'cylinder',
  'circle',
  'doublecircle',
  'diamond',
  'hexagon',
  'odd',
  'lean_right',
  'lean_left',
  'trapezoid',
  'inv_trapezoid',
] as const
export type BlockShape = (typeof BLOCK_SHAPES)[number]

/** 形状 → 定界符（open/close 夹住 label 文本）。块箭头不在此表（方向语法独立处理）。 */
const SHAPE_MARKERS: Record<Exclude<BlockShape, 'none' | 'block_arrow'>, { open: string; close: string }> = {
  square: { open: '[', close: ']' },
  round: { open: '(', close: ')' },
  stadium: { open: '([', close: '])' },
  subroutine: { open: '[[', close: ']]' },
  cylinder: { open: '[(', close: ')]' },
  circle: { open: '((', close: '))' },
  doublecircle: { open: '(((', close: ')))' },
  diamond: { open: '{', close: '}' },
  hexagon: { open: '{{', close: '}}' },
  odd: { open: '>', close: ']' },
  lean_right: { open: '[/', close: '/]' },
  lean_left: { open: '[\\', close: '\\]' },
  trapezoid: { open: '[/', close: '\\]' },
  inv_trapezoid: { open: '[\\', close: '/]' },
}

/** 定界符 → 形状（按最长 open 优先，解析顺序即此数组顺序；与 typeStr2Type 全表一致） */
const SHAPE_MARKER_LIST = (
  [
    'doublecircle',
    'circle',
    'stadium',
    'cylinder',
    'subroutine',
    'hexagon',
    'diamond',
    'lean_right',
    'lean_left',
    'trapezoid',
    'inv_trapezoid',
    'square',
    'round',
  ] as const
).map((shape) => ({ shape, ...SHAPE_MARKERS[shape] }))

// ---------- 词法片段（mermaid 12.0.0 block 词法核对） ----------

/** 节点 id token：不含空白、括号家族、`-`（关系算子）、`:`（跨列）、`<` `>`（箭头）、
 * `"` `'` `=`（label/箭头记号）。与编译词法的 ID 规则 `[^\(\[\n\-\)\{\}\s\<\>:=]+` 同口径。 */
const BLOCK_ID = '[^\\s\\[\\]{}()<>=:"\'\\-]+'

/** 边算子 token：`[xo<]?` 前缀 + `--`/`==`/`-.` 核心 + `[xo>]` 后缀（含 `~~~` 隐形线，
 * 落地侧只认前六种，`~~~` 行落 verbatim）。与编译词法的四条 link 规则同口径（整行锚定）。 */
export const BLOCK_EDGE_TOKEN = /^[xo<]?(--+[-xo>]|==+[=xo>]|-?\.+-[xo>]?|--|==|-\.|~{2,})$/

/** 边算子 token 合法性（不含 `~~~` 隐形线——清单外语法，逐字保留不编辑） */
export function isValidBlockEdgeToken(line: string): boolean {
  return BLOCK_EDGE_TOKEN.test(line) && !line.startsWith('~')
}

/** 可承载标签的边算子（要求终点侧有完整半段——裸 `--`/`==`/`-.` 无法夹住标签） */
export function isValidBlockEdgeLine(line: string): boolean {
  return isValidBlockEdgeToken(line) && splitBlockEdgeLine(line) !== null
}

const HEADER_RE = /^([ \t]*)(block(?:-beta)?)([ \t\r]*)$/
const GROUP_OPEN_RE = /^block:([^ \t:[\](){}<>"'=]+)(?::([ \t]*\d+))?[ \t\r]*$/
const GROUP_CLOSE_RE = /^end\b[ \t\r]*$/
const COLUMNS_RE = /^columns([ \t]+)(auto|\d+)[ \t\r]*$/
const SPACE_RE = /^space(?::(\d+))?[ \t\r]*$/
const TITLE_RE = /^title([ \t]+)(.+?)[ \t\r]*$/

// ---------- 节点原子解析（声明行与边端点共用） ----------

/** 节点（或边端点）的形状/标签结构化事实；原文重建由 renderBlockNode 承担 */
export interface BlockNodeAtom {
  /** 语法 id（画布 data-id、编辑意图都用它） */
  id: string
  /** 形状枚举；null = 裸 id（渲染时 mermaid 也显示 id 文本） */
  shape: BlockShape | 'block_arrow' | null
  /** 标签语义值（去引号后）；null = 无标签（裸 id / 无方括号形状） */
  label: string | null
  /** 源码里标签是否带引号（仅 block_arrow 强制引号；其余形状保持原形态） */
  labelQuoted: boolean
  /** 块箭头的方向串（`x, down` 等），逐字保留——工单 09 不做方向编辑 */
  arrowDirs: string | null
}

/** 解析一个节点原子（`id[形状标签]` / 裸 `id`）；不是节点原子时 null */
export function parseBlockNodeAtom(text: string): BlockNodeAtom | null {
  const m = new RegExp(`^(${BLOCK_ID})([\\s\\S]*)$`).exec(text)
  if (m === null) return null
  const id = m[1]
  const rest = m[2]
  if (rest === '') return { id, shape: null, label: null, labelQuoted: false, arrowDirs: null }
  // 块箭头：id<["Label"]>(dir[, dir...])——label 内层逐字保留（通常是引号形态）；
  // 方向括号可省略（`id<["L"]>` 实测合法）
  const arrow = /^<\[([\s\S]*)\]>(?:\(([\s\S]*)\))?$/.exec(rest)
  if (arrow !== null) {
    const inner = arrow[1]
    const qm = /^"([^"]*)"$/.exec(inner)
    return {
      id,
      shape: 'block_arrow',
      label: qm !== null ? qm[1] : inner,
      labelQuoted: qm !== null,
      arrowDirs: arrow[2] ?? null,
    }
  }
  for (const { shape, open, close } of SHAPE_MARKER_LIST) {
    if (!rest.startsWith(open) || !rest.endsWith(close)) continue
    if (rest.length < open.length + close.length) continue
    const inner = rest.slice(open.length, rest.length - close.length)
    const qm = /^"([^"]*)"$/.exec(inner)
    return { id, shape, label: qm !== null ? qm[1] : inner, labelQuoted: qm !== null, arrowDirs: null }
  }
  return null
}

/**
 * 节点原子的原文重建（changes.label / changes.shape 只替换对应槽位）。
 *
 * 引号形态契约（实测：裸标签只允许 ASCII 词字符——`a2[方形]` 词法直接失败，
 * `a2["方形"]` 合法）：值未变时不落码（verbatim identity 天然成立）；值变化时
 * 保持原形态——原引号仍引号，原裸写仅当新值仍是 ASCII 词字符才裸写，否则自动加引号
 * （守「源码始终是合法 mermaid」）。
 */
export function renderBlockNodeAtom(
  d: BlockNodeAtom,
  changes: { label?: string | null; shape?: BlockShape | null } = {},
): string {
  const label = changes.label !== undefined ? changes.label : d.label
  if (d.shape === 'block_arrow' && changes.shape === undefined) {
    // 块箭头：只允许改 label（方向串逐字保留；label 强制引号形态——LLABEL 词法要求）
    const body = label === null ? '' : `"${label}"`
    return d.arrowDirs === null ? `${d.id}<[${body}]>` : `${d.id}<[${body}]>(${d.arrowDirs})`
  }
  const shape = changes.shape !== undefined ? changes.shape : (d.shape === 'block_arrow' ? null : d.shape)
  if (shape === null || shape === 'none') {
    // 变成裸 id：标签无处安放，丢弃（调用方保证不把有标签节点改回裸 id 除非显式要求）
    return d.id
  }
  const markers = SHAPE_MARKERS[shape]
  if (label === null) return `${d.id}${markers.open}${markers.close}`
  const wasQuoted = d.labelQuoted
  const changed = changes.label !== undefined && changes.label !== d.label
  const emitQuoted = wasQuoted || (changed && !BLOCK_RAW_LABEL.test(label))
  return `${d.id}${markers.open}${emitQuoted ? `"${label}"` : label}${markers.close}`
}

/** 能不加引号裸写的标签（实测口径：ASCII 词字符，无空白——`a2[test]` 合法、`a2[方]` 失败） */
const BLOCK_RAW_LABEL = /^[A-Za-z0-9_]+$/

// ---------- 元素数据 ----------

export interface BlockHeaderData {
  kind: 'block-header'
  /** 原文关键字（`block-beta` 或 `block`），逐字保留 */
  keyword: string
  trailing: string
}

/** `columns N` / `columns auto` 行；value null 表示 auto（mermaid 语义 = -1） */
export interface BlockColumnsData {
  kind: 'block-columns'
  gap: string
  /** null = auto */
  value: number | null
  /** 该行所属嵌套块 id（null = 顶层） */
  owner: string | null
}

export function renderBlockColumns(d: BlockColumnsData, changes: { value?: number | null } = {}): string {
  const value = changes.value !== undefined ? changes.value : d.value
  return `columns${d.gap}${value === null ? 'auto' : value}`
}

/**
 * 节点声明行：`id[形状标签][:n]`。
 * - atom 内的 id / 形状 / 标签可分别编辑（width 只增删 `:n` 段）
 * - owner = 所属嵌套块 id（null = 顶层）——布局语义（位置 = 书写顺序 + columns）需要它
 */
export interface BlockNodeData {
  kind: 'block-node'
  atom: BlockNodeAtom
  /** `:n` 跨列；null = 未写 */
  width: number | null
  owner: string | null
}

export function renderBlockNode(d: BlockNodeData, changes: Parameters<typeof renderBlockNodeAtom>[1] & { width?: number | null } = {}): string {
  const width = changes.width !== undefined ? changes.width : d.width
  return `${renderBlockNodeAtom(d.atom, changes)}${width !== null ? `:${width}` : ''}`
}

/**
 * 边行：`{left}{算子或 标签形态}{right}`。
 * - left / right 是**端点原文**（端点本身也可以带形状，如 `a["x"] --> b`，逐字保留）
 * - line 是算子原文（如 `-->` / `x--x`）；带标签时 line 仍存**完整**算子（left/right 半段
 *   由 splitBlockEdgeLine 现场推导），label 为引号内的语义值
 * - owner 记录行所在作用域（mermaid 的边是全局收集的，删除/追加不依赖它，仅信息完整）
 */
export interface BlockEdgeData {
  kind: 'block-edge'
  left: string
  right: string
  line: string
  label: string | null
  owner: string | null
}

/**
 * 完整算子 → 夹标签的左右半段；不可承载标签时 null。
 *
 * 两侧半段是**独立 token**（mermaid.parse 逐条实测，见工单 Comments）：
 * `-->` 落成 `a-- "t" -->b`、`x--x` 落成 `ax-- "t" --xb`、`-.->` 落成 `a-. "t" .->b`、
 * `-.` 落成 `a-. "t" .-b`。规则：左半 = 起点前缀 + `--`/`==`/`-.`，右半 = `--`/`==`
 * + 终点记号（虚线则是 `.` + `-` + 终点记号）；无终点记号的裸 `--`/`==` 无法承载标签。
 */
export function splitBlockEdgeLine(line: string): { leftHalf: string; rightHalf: string } | null {
  if (!BLOCK_EDGE_TOKEN.test(line) || line.startsWith('~')) return null
  const m = /^([xo<])([\s\S]+)$/.exec(line)
  const prefix = m !== null ? m[1] : ''
  const rest = m !== null ? m[2] : line
  const dotted = rest.includes('.')
  const thick = rest.includes('==')
  const endMarker = /^[xo>]$/.test(rest.slice(-1)) ? rest.slice(-1) : ''
  const dashes = thick ? '==' : '--'
  if (dotted) {
    return { leftHalf: `${prefix}-.`, rightHalf: `.-${endMarker}` }
  }
  if (endMarker === '') return null
  return { leftHalf: `${prefix}${dashes}`, rightHalf: `${dashes}${endMarker}` }
}

export function renderBlockEdge(d: BlockEdgeData, changes: { line?: string; label?: string | null } = {}): string {
  const line = changes.line ?? d.line
  const label = changes.label !== undefined ? changes.label : d.label
  if (label === null) return `${d.left} ${line} ${d.right}`
  const halves = splitBlockEdgeLine(line)
  if (halves === null) return `${d.left} ${line} ${d.right}`
  return `${d.left}${halves.leftHalf} "${label}" ${halves.rightHalf}${d.right}`
}

export interface BlockGroupOpenData {
  kind: 'block-group-open'
  /** 嵌套块语法 id */
  id: string
  /** `block:gid:n` 的跨列；null = 未写 */
  width: number | null
  trailing: string
}

export function renderBlockGroupOpen(d: BlockGroupOpenData, changes: { width?: number | null } = {}): string {
  const width = changes.width !== undefined ? changes.width : d.width
  return `block:${d.id}${width !== null ? `:${width}` : ''}${d.trailing}`
}

export interface BlockGroupCloseData {
  kind: 'block-group-close'
}

/** `space` / `space:N` 行（布局空位，不进结构树——工单决策） */
export interface BlockSpaceData {
  kind: 'block-space'
  /** 跨列数；null = 1 */
  width: number | null
  owner: string | null
}

export function renderBlockSpace(d: BlockSpaceData, changes: { width?: number | null } = {}): string {
  const width = changes.width !== undefined ? changes.width : d.width
  return width === null ? 'space' : `space:${width}`
}

export interface BlockTitleData {
  kind: 'block-title'
  gap: string
  value: string
}

export function renderBlockTitle(d: BlockTitleData, changes: { value?: string } = {}): string {
  return `title${d.gap}${changes.value ?? d.value}`
}

export type BlockData =
  | BlockHeaderData
  | BlockColumnsData
  | BlockNodeData
  | BlockEdgeData
  | BlockGroupOpenData
  | BlockGroupCloseData
  | BlockSpaceData
  | BlockTitleData

// ---------- 行级解析 ----------

/** 声明行：节点原子 + 可选 `:n`（惰性分组让宽度段优先吃掉尾部 `:数字`） */
function parseNodeStatement(line: string): BlockNodeData | null {
  const widthMatch = /^(.*?)(?::(\d+))?[ \t\r]*$/.exec(line)
  if (widthMatch === null) return null
  let body = widthMatch[1]
  let width: number | null = widthMatch[2] !== undefined ? Number(widthMatch[2]) : null
  let atom = parseBlockNodeAtom(body)
  if (atom === null && width !== null) {
    // 形状标签内可能含 `:`（如 `a["x:2"]`）：剥不出宽度时回落不剥宽度的切法
    body = line.trimEnd()
    width = null
    atom = parseBlockNodeAtom(body)
  }
  if (atom === null) return null
  return { kind: 'block-node', atom, width, owner: null }
}

/** 边行（含标签形态与普通形态）；left/right 端点必须能解析成节点原子（否则整行 verbatim） */
function parseEdgeStatement(line: string): BlockEdgeData | null {
  // 普通形态：`A --> B`（先试，避免把 `a["x"] --> b` 的引号当标签）
  const plain = new RegExp(
    `^(.+?)\\s*([xo<]?(?:--+[-xo>]|==+[=xo>]|-?\\.+-[xo>]?|--|==|-\\.))\\s*(.+)[ \\t\\r]*$`,
  ).exec(line)
  if (plain !== null) {
    const left = parseBlockNodeAtom(plain[1])
    const right = parseBlockNodeAtom(plain[3])
    if (left !== null && right !== null) {
      return { kind: 'block-edge', left: plain[1], right: plain[3], line: plain[2], label: null, owner: null }
    }
  }
  // 标签形态：`A-- "t" -->B`（算子切成两半夹住引号标签）
  const labeled = new RegExp(
    `^(.+?)\\s*([xo<]?[-=.]+)\\s*"((?:\\\\.|[^"\\\\])*)"\\s*([-=.]+[xo>]?)[ \\t]*(.+)[ \\t\\r]*$`,
  ).exec(line)
  if (labeled !== null) {
    const left = parseBlockNodeAtom(labeled[1])
    const right = parseBlockNodeAtom(labeled[5])
    const lineTok = `${labeled[2]}${labeled[4]}`
    if (left !== null && right !== null && BLOCK_EDGE_TOKEN.test(lineTok)) {
      return { kind: 'block-edge', left: labeled[1], right: labeled[5], line: lineTok, label: labeled[3], owner: null }
    }
  }
  return null
}

interface RawEntry {
  span: Span
  id: string
  data: BlockData
}

interface Counters {
  columns: number
  node: number
  edge: number
  space: number
  groupEnd: number
  nodeOccurrence: Map<string, number>
  groupOccurrence: Map<string, number>
}

/** 打开的嵌套块栈：块内行归属栈顶 gid */
interface OpenGroup {
  lineNo: number
  id: string
}

export class BlockParser implements DiagramParser {
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
      columns: 0,
      node: 0,
      edge: 0,
      space: 0,
      groupEnd: 0,
      nodeOccurrence: new Map(),
      groupOccurrence: new Map(),
    }
    const groupStack: OpenGroup[] = []
    let seenHeader = false
    let titleSeen = false
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
            throw parseFailure(lineNo, '图表必须以 block 或 block-beta 声明开始')
          }
          seenHeader = true
          entries.push({
            span: { start: cursor, end: cursor + line.length },
            id: 'header',
            data: { kind: 'block-header', keyword: header[2], trailing: header[3] ?? '' },
          })
        } else {
          const firstChar = line.length - line.trimStart().length
          const span = { start: cursor + firstChar, end: cursor + line.length }
          const owner = groupStack[groupStack.length - 1]?.id ?? null

          if (GROUP_CLOSE_RE.test(trimmed)) {
            if (groupStack.length === 0) {
              // 顶层 `end` 没有匹配的嵌套块声明（mermaid 直接解析失败），如实报错
              throw parseFailure(lineNo, '多余的 end（没有与之匹配的嵌套块声明行）')
            }
            groupStack.pop()
            counters.groupEnd++
            entries.push({ span, id: `block-group-end:${counters.groupEnd}`, data: { kind: 'block-group-close' } })
          } else {
            const groupOpen = GROUP_OPEN_RE.exec(trimmed)
            if (groupOpen !== null) {
              const gid = groupOpen[1]
              const n = (counters.groupOccurrence.get(gid) ?? 0) + 1
              counters.groupOccurrence.set(gid, n)
              entries.push({
                span,
                id: blockGroupElementId(gid, n),
                data: {
                  kind: 'block-group-open',
                  id: gid,
                  width: groupOpen[2] !== undefined ? Number(groupOpen[2]) : null,
                  trailing: '',
                },
              })
              groupStack.push({ lineNo, id: gid })
            } else {
              const columns = COLUMNS_RE.exec(trimmed)
              if (columns !== null) {
                counters.columns++
                entries.push({
                  span,
                  id: `columns:${counters.columns}`,
                  data: {
                    kind: 'block-columns',
                    gap: columns[1],
                    value: columns[2] === 'auto' ? null : Number(columns[2]),
                    owner,
                  },
                })
              } else {
                const space = SPACE_RE.exec(trimmed)
                if (space !== null) {
                  counters.space++
                  entries.push({
                    span,
                    id: `space:${counters.space}`,
                    data: {
                      kind: 'block-space',
                      width: space[1] !== undefined ? Number(space[1]) : null,
                      owner,
                    },
                  })
                } else if (owner === null) {
                  const title = TITLE_RE.exec(trimmed)
                  if (title !== null && !titleSeen) {
                    titleSeen = true
                    entries.push({
                      span,
                      id: 'block-title:1',
                      data: { kind: 'block-title', gap: title[1], value: title[2] },
                    })
                  } else {
                    this.parseTopLevelStatement(line, span, owner, counters, entries)
                  }
                } else {
                  this.parseTopLevelStatement(line, span, owner, counters, entries)
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
      throw parseFailure(1, '图表必须以 block 或 block-beta 声明开始')
    }
    if (groupStack.length > 0) {
      throw parseFailure(groupStack[groupStack.length - 1].lineNo, '嵌套块声明行缺少匹配的 end')
    }
    return assembleDocument(source, entries)
  }

  /** 顶层与块内共用的语句尝试：边 → 节点；其余（style / classDef / 注释等）逐字保留 */
  private parseTopLevelStatement(
    line: string,
    span: Span,
    owner: string | null,
    counters: Counters,
    entries: RawEntry[],
  ): void {
    const trimmed = line.trim()
    const edge = parseEdgeStatement(trimmed)
    if (edge !== null) {
      counters.edge++
      entries.push({ span, id: `edge:${counters.edge}`, data: { ...edge, owner } })
      return
    }
    const node = parseNodeStatement(trimmed)
    if (node !== null) {
      const n = (counters.nodeOccurrence.get(node.atom.id) ?? 0) + 1
      counters.nodeOccurrence.set(node.atom.id, n)
      entries.push({ span, id: blockNodeElementId(node.atom.id, n), data: { ...node, owner } })
      return
    }
    // 其余逐字保留
  }

  // ---------- 意图落地（resolveRewrites） ----------

  resolveRewrites(doc: SourceDocument, intent: EditIntent): ReadonlyMap<string, string> | null {
    switch (intent.type) {
      case 'add-node':
        return this.resolveAddNode(doc, intent as never)
      case 'delete-node':
        return this.resolveDeleteNode(doc, intent as never)
      case 'set-node-label':
        return this.resolveSetNode(doc, intent as never)
      case 'set-node-shape':
        return this.resolveSetNode(doc, intent as never)
      case 'set-node-width':
        return this.resolveSetNode(doc, intent as never)
      case 'add-edge':
        return this.resolveAddEdge(doc, intent as never)
      case 'set-edge':
        return this.resolveSetEdge(doc, intent as never)
      case 'delete-edge':
        return this.resolveDeleteEdge(doc, intent as never)
      case 'add-group':
        return this.resolveAddGroup(doc, intent as never)
      case 'delete-group':
        return this.resolveDeleteGroup(doc, intent as never)
      case 'set-columns':
        return this.resolveSetColumns(doc, intent as never)
      case 'add-space':
        return this.resolveAddSpace(doc, intent as never)
      case 'delete-space':
        return this.resolveDeleteSpace(doc, intent as never)
      case 'set-title':
        return this.resolveSetTitle(doc, intent as never)
      default:
        return null
    }
  }

  /** 嵌套块声明行 → 匹配 `end` 行（按 open/close 深度计数） */
  private matchingEnd(doc: SourceDocument, decl: ElementPart): ElementPart | null {
    let depth = 1
    for (const part of doc.elements) {
      if (part.span.start <= decl.span.start) continue
      const data = part.element as BlockData
      if (data.kind === 'block-group-open') depth++
      if (data.kind === 'block-group-close') {
        depth--
        if (depth === 0) return part
      }
    }
    return null
  }

  /** 嵌套块声明行索引：gid（同名取首个）→ { open, end } */
  private groupBounds(doc: SourceDocument, gid: string): { open: ElementPart; end: ElementPart } | null {
    for (const part of doc.elements) {
      const data = part.element as BlockData
      if (data.kind === 'block-group-open' && data.id === gid) {
        const end = this.matchingEnd(doc, part)
        return end === null ? null : { open: part, end }
      }
    }
    return null
  }

  /** 某元素所在行的行首缩进 */
  private indentOf(doc: SourceDocument, span: Span): string {
    const lineStart = doc.source.lastIndexOf('\n', Math.max(0, span.start - 1)) + 1
    return /^[ \t]*/.exec(doc.source.slice(lineStart, span.start))?.[0] ?? ''
  }

  /**
   * 顶层作用域的追加锚点：最后一个「顶层」元素。不能直接用文档最后一个元素——
   * 它可能在某个嵌套块内部，把新语句插进去会改变归属。
   * 顶层元素 = owner 为 null 的元素（嵌套块的 `end` 行按父作用域计，插入其后即块外）。
   */
  private rootTailAnchor(doc: SourceDocument): string | undefined {
    let last: ElementPart | undefined
    for (const part of doc.elements) {
      const data = part.element as BlockData
      if (data.kind === 'block-group-close') continue
      if (data.kind === 'block-group-open') continue
      const owner = 'owner' in data ? (data.owner as string | null) : null
      if (owner === null) last = part
    }
    if (last !== undefined) return last.id
    // 空文档（只有表头）：锚回表头
    return doc.elements.find((p) => (p.element as BlockData).kind === 'block-header')?.id
  }

  /** 编辑锚点落在嵌套块声明行上时，推进到块闭合行之后（新语句要插在块**外**） */
  private reanchorPastGroupEnd(doc: SourceDocument, afterElementId: string | undefined): string | undefined {
    const anchor = resolveAnchor(doc, afterElementId)
    if (anchor === undefined || anchor === null) return afterElementId
    const data = anchor.element as BlockData
    if (data.kind !== 'block-group-open') return afterElementId
    const end = this.matchingEnd(doc, anchor)
    return end === null ? afterElementId : end.id
  }

  private resolveAddNode(
    doc: SourceDocument,
    intent: Extract<BlockIntent, { type: 'add-node' }>,
  ): Map<string, string> | null {
    if (!isValidBlockId(intent.id)) return null
    if (intent.label !== null && intent.label !== undefined && !isValidBlockLabel(intent.label)) return null
    if (this.findNodeDecl(doc, intent.id) !== null) return null
    const shape = intent.shape ?? 'square'
    if (!(BLOCK_SHAPES as readonly string[]).includes(shape)) return null
    const atom = parseBlockNodeAtom(renderBlockNodeAtom({ id: intent.id, shape: null, label: null, labelQuoted: false, arrowDirs: null }, { shape, label: intent.label ?? null }))
    if (atom === null) return null
    const data: BlockNodeData = { kind: 'block-node', atom, width: intent.width ?? null, owner: intent.parentGroupId ?? null }
    if (intent.parentGroupId !== undefined && intent.parentGroupId !== null) {
      // 嵌套块内：锚到该组的 `end` 行，插在它之前（缩进跟随 end 行）
      const bounds = this.groupBounds(doc, intent.parentGroupId)
      if (bounds === null) return null
      const indent = this.indentOf(doc, bounds.end.span)
      const original = doc.source.slice(bounds.end.span.start, bounds.end.span.end)
      return new Map([[bounds.end.id, `${indent}${renderBlockNode(data)}\n${original}`]])
    }
    return insertAfter(doc, {
      afterElementId: this.rootTailAnchor(doc),
      render: (indent) => indentLines(indent, [renderBlockNode(data)]),
    })
  }

  /** 声明行按名字找（同名多行取首个——mermaid 的 Map 语义下首个承担编辑入口） */
  private findNodeDecl(doc: SourceDocument, id: string): ElementPart | null {
    for (const part of doc.elements) {
      const data = part.element as BlockData
      if (data.kind === 'block-node' && data.atom.id === id) return part
    }
    return null
  }

  private resolveDeleteNode(
    doc: SourceDocument,
    intent: Extract<BlockIntent, { type: 'delete-node' }>,
  ): Map<string, string> | null {
    const rewrites = new Map<string, string>()
    let found = false
    for (const part of doc.elements) {
      const data = part.element as BlockData
      if (data.kind === 'block-node' && data.atom.id === intent.id) {
        rewrites.set(part.id, '')
        found = true
      }
      if (data.kind === 'block-edge') {
        const fromId = parseBlockNodeAtom(data.left)?.id
        const toId = parseBlockNodeAtom(data.right)?.id
        if (fromId === intent.id || toId === intent.id) rewrites.set(part.id, '')
      }
    }
    return found ? rewrites : null
  }

  private resolveSetNode(
    doc: SourceDocument,
    intent: Extract<BlockIntent, { type: 'set-node-label' | 'set-node-shape' | 'set-node-width' }>,
  ): Map<string, string> | null {
    const part = this.findNodeDecl(doc, intent.id)
    if (part === null) return null
    const data = part.element as BlockNodeData
    if (intent.type === 'set-node-label') {
      const { label } = intent
      if (label !== null && !isValidBlockLabel(label)) return null
      // 块箭头删除标签落 `id<[]>`（内层空串）——语法上合法但无意义，拒绝更诚实
      if (data.atom.shape === 'block_arrow' && (label === null || label === '')) return null
      return new Map([[part.id, renderBlockNode(data, { label })]])
    }
    if (intent.type === 'set-node-shape') {
      const { shape } = intent
      if (shape === 'block_arrow') return null // 块箭头不做形状编辑（工单决策：无方向编辑，升格前记证据）
      if (data.atom.shape === 'block_arrow') return null // 同上：把块箭头改成别的形状会丢方向串
      if (shape !== null && !(BLOCK_SHAPES as readonly string[]).includes(shape)) return null
      return new Map([[part.id, renderBlockNode(data, { shape })]])
    }
    // set-node-width
    const { width } = intent
    if (width !== null && (!Number.isInteger(width) || width < 1)) return null
    return new Map([[part.id, renderBlockNode(data, { width })]])  }

  private resolveAddEdge(
    doc: SourceDocument,
    intent: Extract<BlockIntent, { type: 'add-edge' }>,
  ): Map<string, string> | null {
    if (!isValidBlockEdgeToken(intent.line)) return null
    if (intent.label !== undefined && intent.label !== null && !isValidBlockLabel(intent.label)) return null
    if (intent.from === intent.to) return null
    // 端点必须是已知块（声明节点或嵌套块）——隐式节点交给用户先声明，编辑器不凭空造节点
    if (this.findNodeDecl(doc, intent.from) === null && this.groupBounds(doc, intent.from) === null) return null
    if (this.findNodeDecl(doc, intent.to) === null && this.groupBounds(doc, intent.to) === null) return null
    const rendered = renderBlockEdge(
      { kind: 'block-edge', left: intent.from, right: intent.to, line: intent.line, label: intent.label ?? null, owner: null },
    )
    return insertAfter(doc, {
      afterElementId: this.reanchorPastGroupEnd(doc, this.rootTailAnchor(doc)),
      render: (indent) => indentLines(indent, [rendered]),
    })
  }

  private resolveSetEdge(
    doc: SourceDocument,
    intent: Extract<BlockIntent, { type: 'set-edge' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || (part.element as BlockData).kind !== 'block-edge') return null
    const data = part.element as BlockEdgeData
    const changes = intent.changes
    if (changes.line !== undefined && !isValidBlockEdgeToken(changes.line)) return null
    if (changes.label !== undefined && changes.label !== null && !isValidBlockLabel(changes.label)) return null
    if (changes.label !== undefined && changes.label !== null && splitBlockEdgeLine(changes.line ?? data.line) === null) {
      // 裸 `--` / `==` / `-.` 无法承载标签（见文件头词法事实），拒绝而不是落非法 mermaid
      return null
    }
    // 已带标签的边换成不能承载标签的裸算子 = 静默丢标签，同样拒绝（调用方先清标签）
    if (changes.label === undefined && data.label !== null && changes.line !== undefined && splitBlockEdgeLine(changes.line) === null) {
      return null
    }
    return new Map([[part.id, renderBlockEdge(data, changes)]])
  }

  private resolveDeleteEdge(
    doc: SourceDocument,
    intent: Extract<BlockIntent, { type: 'delete-edge' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || (part.element as BlockData).kind !== 'block-edge') return null
    return new Map([[part.id, '']])
  }

  private resolveAddGroup(
    doc: SourceDocument,
    intent: Extract<BlockIntent, { type: 'add-group' }>,
  ): Map<string, string> | null {
    if (!isValidBlockId(intent.id)) return null
    if (this.groupBounds(doc, intent.id) !== null || this.findNodeDecl(doc, intent.id) !== null) return null
    const data: BlockGroupOpenData = { kind: 'block-group-open', id: intent.id, width: intent.width ?? null, trailing: '' }
    const lines = [renderBlockGroupOpen(data), 'end']
    if (intent.parentGroupId !== undefined && intent.parentGroupId !== null) {
      const bounds = this.groupBounds(doc, intent.parentGroupId)
      if (bounds === null) return null
      const indent = this.indentOf(doc, bounds.end.span)
      const original = doc.source.slice(bounds.end.span.start, bounds.end.span.end)
      return new Map([[bounds.end.id, `${indent}${lines.join('\n')}\n${original}`]])
    }
    return insertAfter(doc, {
      afterElementId: this.rootTailAnchor(doc),
      render: (indent) => indentLines(indent, lines),
    })
  }

  private resolveDeleteGroup(
    doc: SourceDocument,
    intent: Extract<BlockIntent, { type: 'delete-group' }>,
  ): Map<string, string> | null {
    const bounds = this.groupBounds(doc, intent.id)
    if (bounds === null) return null
    const rewrites = new Map<string, string>()
    for (const part of doc.elements) {
      if (part.span.start >= bounds.open.span.start && part.span.end <= bounds.end.span.end) {
        rewrites.set(part.id, '')
      }
      const data = part.element as BlockData
      if (data.kind === 'block-edge') {
        const fromId = parseBlockNodeAtom(data.left)?.id
        const toId = parseBlockNodeAtom(data.right)?.id
        if (fromId === intent.id || toId === intent.id) rewrites.set(part.id, '')
      }
    }
    return rewrites
  }

  /** 改 columns：scope 内已有该行 → 原地改写 / 删除（value null）；没有 → 插入（value null 时不动） */
  private resolveSetColumns(
    doc: SourceDocument,
    intent: Extract<BlockIntent, { type: 'set-columns' }>,
  ): Map<string, string> | null {
    const { groupId } = intent
    // 'auto' 是表单侧的「跟随默认」哨兵，落码即删除该行（mermaid 默认就是 auto）
    const value = intent.value
    const numeric: number | null = value === 'auto' ? null : value
    if (numeric !== null && (!Number.isInteger(numeric) || numeric < 1)) return null
    let scopeOpen: ElementPart | null = null
    let scopeEnd: ElementPart | null = null
    let insertAnchor: ElementPart | null = null
    if (groupId !== undefined && groupId !== null) {
      const bounds = this.groupBounds(doc, groupId)
      if (bounds === null) return null
      scopeOpen = bounds.open
      scopeEnd = bounds.end
      insertAnchor = bounds.open
    } else {
      scopeOpen = null
      scopeEnd = null
      insertAnchor = doc.elements.find((p) => (p.element as BlockData).kind === 'block-header') ?? null
      if (insertAnchor === null) return null
    }
    const lower = scopeOpen === null ? -1 : scopeOpen.span.start
    const upper = scopeEnd === null ? Number.MAX_SAFE_INTEGER : scopeEnd.span.end
    for (const part of doc.elements) {
      if (part.span.start <= lower || part.span.end >= upper) continue
      const data = part.element as BlockData
      if (data.kind === 'block-columns' && data.owner === (groupId ?? null)) {
        if (numeric === null) return new Map([[part.id, '']])
        return new Map([[part.id, renderBlockColumns(data, { value: numeric })]])
      }
    }
    if (numeric === null) return new Map()
    const fresh: BlockColumnsData = { kind: 'block-columns', gap: ' ', value: numeric, owner: groupId ?? null }
    if (groupId !== undefined && groupId !== null) {
      // 嵌套块内：插在声明行之后（跟随其缩进）
      const original = doc.source.slice(scopeOpen!.span.start, scopeOpen!.span.end)
      const indent = this.indentOf(doc, scopeOpen!.span)
      return new Map([[scopeOpen!.id, `${original}\n${indent}${renderBlockColumns(fresh)}`]])
    }
    return insertAfter(doc, {
      afterElementId: insertAnchor!.id,
      render: (indent) => indentLines(indent, [renderBlockColumns(fresh)]),
    })
  }

  private resolveAddSpace(
    doc: SourceDocument,
    intent: Extract<BlockIntent, { type: 'add-space' }>,
  ): Map<string, string> | null {
    if (intent.width !== undefined && intent.width !== null && (!Number.isInteger(intent.width) || intent.width < 1)) return null
    const data: BlockSpaceData = { kind: 'block-space', width: intent.width ?? null, owner: null }
    return insertAfter(doc, {
      afterElementId: intent.afterElementId ?? this.rootTailAnchor(doc),
      render: (indent) => indentLines(indent, [renderBlockSpace(data)]),
    })
  }

  private resolveDeleteSpace(
    doc: SourceDocument,
    intent: Extract<BlockIntent, { type: 'delete-space' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || (part.element as BlockData).kind !== 'block-space') return null
    return new Map([[part.id, '']])
  }

  /** 设置标题：有 title 行就原地改写，没有就插到表头之后；null = 删除该行 */
  private resolveSetTitle(
    doc: SourceDocument,
    intent: Extract<BlockIntent, { type: 'set-title' }>,
  ): Map<string, string> | null {
    const existing = doc.elements.find((p) => (p.element as BlockData).kind === 'block-title')
    if (intent.value === null) {
      return existing === undefined ? new Map() : new Map([[existing.id, '']])
    }
    const value = intent.value.trim()
    if (value === '' || /["\r\n]/.test(value)) return null
    if (existing !== undefined) {
      return new Map([[existing.id, renderBlockTitle(existing.element as BlockTitleData, { value })]])
    }
    const header = doc.elements.find((p) => (p.element as BlockData).kind === 'block-header')
    if (header === undefined) return null
    return insertAfter(doc, {
      afterElementId: header.id,
      render: (indent) => indentLines(indent, [`title ${value}`]),
    })
  }
}

export const blockParser = new BlockParser()

// ---------- 校验（表单层复用，与落地侧同一规则） ----------

/**
 * 新建块/嵌套块 id 的合法性：与编译词法的 ID token 同口径
 * （不含空白、括号家族、`-`、`:`、`<` `>`、引号、`=`）。
 */
export function isValidBlockId(id: string): boolean {
  return new RegExp(`^${BLOCK_ID}$`).test(id)
}

/** 标签合法性：非空、不含 `"` `[` `]` 与换行（含则无法安全写回形状定界符内） */
export function isValidBlockLabel(label: string): boolean {
  return label.trim() !== '' && !/["\[\]\r\n]/.test(label)
}

// ---------- 编辑意图（工单 09 表单/画布所需集合） ----------

export type BlockIntent =
  /** 新增块节点（shape 缺省 square；label 缺省不带；parentGroupId = 落进哪个嵌套块） */
  | { type: 'add-node'; id: string; shape?: BlockShape | null; label?: string | null; width?: number | null; parentGroupId?: string | null; afterElementId?: string }
  /** 删除块节点（级联删触及边，由管线负责） */
  | { type: 'delete-node'; id: string }
  /** 改标签（null = 去掉标签变裸形状；块箭头不允许 null） */
  | { type: 'set-node-label'; id: string; label: string | null }
  /** 改形状（block_arrow 形态不可达——见 resolveSetNode 的两个方向拒绝） */
  | { type: 'set-node-shape'; id: string; shape: BlockShape | 'block_arrow' | null }
  /** 改跨列 `:n`（null = 去掉） */
  | { type: 'set-node-width'; id: string; width: number | null }
  /** 新增边（端点必须是已声明的节点或嵌套块；标签形态见 renderBlockEdge） */
  | { type: 'add-edge'; from: string; to: string; line: string; label?: string | null; afterElementId?: string }
  /** 改边（算子 / 标签；elementId 为 `edge:N`） */
  | { type: 'set-edge'; elementId: string; changes: { line?: string; label?: string | null } }
  | { type: 'delete-edge'; elementId: string }
  /** 新增嵌套块（空块体，成员随后 add-node parentGroupId 落入） */
  | { type: 'add-group'; id: string; width?: number | null; parentGroupId?: string | null }
  /** 删除嵌套块（连同成员与触及边） */
  | { type: 'delete-group'; id: string }
  /** 改 columns（groupId null = 顶层；value null = 删除该行） */
  | { type: 'set-columns'; groupId?: string | null; value: number | 'auto' | null }
  /** 加布局空位 */
  | { type: 'add-space'; width?: number | null; afterElementId?: string }
  | { type: 'delete-space'; elementId: string }
  /** 设置标题；null = 删除 title 行 */
  | { type: 'set-title'; value: string | null }
