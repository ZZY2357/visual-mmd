import { assembleDocument, getElementById, type AnyElement, type SourceDocument } from './document'
import type { DiagramParser, EditIntent, ParseResult, SourceParseError } from './parser'
import { frontmatterEnd } from './frontmatter'
import { lineAtOffset, type Span } from './span'
import { indentLines, insertAfter } from './insert'

/**
 * agentflow-beta 完整解析器（more-diagrams 工单 27，语法事实以
 * `.scratch/more-diagrams/research/agentflow.md` 为准，含 §8 补勘察复核——动态实测）：
 * 手写、逐行、带 span（ADR-0004）。可测试承诺：解析后不做修改再重组装，
 * 输出与输入逐字相同（verbatim identity）。
 *
 * 覆盖（research §2 核心）：
 * - 声明行：`agentflow-beta`，可选同行方向 `TB|TD|BT|LR|RL`（空默认 TB）；
 *   **大小写敏感**（research §8.1 实测：`AgentFlow-Beta` 探测器不认，detect 不带 i）
 * - 节点行（flowchart 风格）：`id["label"]` / `id@{ shape: … }` / `connector id["…"]`；
 *   形状由元数据 `@{ shape: … }` 指定（`task`/`tool`/`input`/`decision`/`refdoc`/`action`）
 * - 边（三种语义，位置序身份 `edge:N`，ADR-0012）：`-->`（sequence）/ `-.-`（reference，
 *   非方向）/ `--x`（failure）；标签写在箭身中间（`-- yes -->`）；可链式 `a --> b --> c`
 * - 容器 `flow id["title"] … end`（可嵌套）；`global … end`（块内节点保持顶层，
 *   无渲染分组——仅作用域豁免）；折叠容器 `@{ view: "collapsed" }`
 * - 元数据 `@{ … }`（YAML，单行或**多行**）：逐字保留，**不消费 YAML**——mermaid 只消费
 *   `shape`/`label`/`labelType`/`view`/`algorithm`/`curve`/`animate`/`animation`，其余键
 *   透传不拒（research §2/§8.4：多行块续行缩进非法会抛错）。**多行元数据块整块 verbatim**
 *   （不作为可寻址元素——改形状只动单行形态；多行块如实降级为只读文本，见工单 Comments）
 * - 文档级：`direction` 行 / `title` / `classDef` / `style` 等识别不了的行——逐字保留
 *   （ADR-0008），整行可寻址（可删除）
 *
 * DOM 可寻址（research §8.2 实测）：节点 `<g class="node">` id = `{svgId}-agentflow-{id}-{n}`
 * （flowchart 同形，可前缀剥离反注 data-id）；边 `<path data-id="L_{from}_{to}_{n}">`
 * （flowchart 口径，best-effort）；**容器 `<g class="cluster">` 无 data-id、无 data-et**
 * （如实降级：容器不做画布点选，走结构树）。
 *
 * 不解析、原样保留（清单外语法不报错，ADR-0008）：frontmatter（隐藏 YAML）、
 * `%%` 注释（**agentflow 显式开启 preserveCommentsWhenParsing**，research §5——必须逐字
 * 保留）、空行、一切识别不了的行。
 */

interface ParseFailure extends Error {
  line: number
}

function parseFailure(line: number, message: string): ParseFailure {
  const error = new Error(message) as ParseFailure
  error.line = line
  return error
}

// ---------- 方向 ----------

/** 声明行可用的方向取值（`TD` 是 `TB` 的别名，mermaid 亦接受） */
export const AGENTFLOW_DIRECTIONS = ['TB', 'TD', 'BT', 'LR', 'RL'] as const

export type AgentflowDirection = (typeof AGENTFLOW_DIRECTIONS)[number]

function isDirection(value: string): value is AgentflowDirection {
  return (AGENTFLOW_DIRECTIONS as readonly string[]).includes(value.toUpperCase())
}

// ---------- 形状（research §2：`@{ shape: … }` 别名） ----------

/**
 * agentflow 形状别名（research §2 的 `ALLOWED_SHAPES` 子集）。
 * 投影按源码原值如实反映（`@{}` 逐字保留）；此表服务「新增节点」的规范渲染与表单下拉。
 */
export const AGENTFLOW_SHAPES = [
  'task',
  'tool',
  'input',
  'decision',
  'refdoc',
  'action',
  'connector',
] as const

export type AgentflowShape = (typeof AGENTFLOW_SHAPES)[number]

export function isAgentflowShape(value: string): value is AgentflowShape {
  return (AGENTFLOW_SHAPES as readonly string[]).includes(value)
}

// ---------- 元素数据 ----------

/** 声明行：`agentflow-beta [方向]`（关键字单例；方向可选，空默认 TB） */
export interface AgentflowHeaderData {
  kind: 'agentflow-header'
  /** 原文关键字（保留用户书写；探测口径大小写敏感，实际只会是 `agentflow-beta`） */
  keyword: string
  /** 关键字与该行其余部分之间的空白原文 */
  gap: string
  /** 方向原文（空串 = 未写，mermaid 默认 TB） */
  direction: string
  /** 行尾残留（不含 eol） */
  trailing: string
  /** 换行符（文档最后一行可能为空串） */
  eol: string
}

/** 节点行：`id["label"]` / `id@{ … }` / 链式语句里的 `id["label"]` 出现 */
export interface AgentflowNodeData {
  kind: 'agentflow-node'
  nodeId: string
  /** 是 `connector id[…]` 声明（连接器型节点） */
  isConnector: boolean
  /** `connector` 与 id 之间的空白原文（非连接器时为空串） */
  connectorGap: string
  /** id 后的空白原文（id 与形状/元数据之间） */
  gapAfterId: string
  /** 形状括号原文（`[` / `[[` 等）；无形状时为空串 */
  openRaw: string
  /** 形状内文本（**去引号**）；无形状时为 null */
  text: string | null
  /** 形状内文本的引号原文（`"` / `'` / 空串 = 未加引号）；无形状时为空串 */
  quote: string
  /** 形状闭合符原文；无形状时为空串 */
  closeRaw: string
  /** 单行元数据 `@{ … }` 整块原文（含 `@{` 与 `}`）；无 / 多行时为 '' */
  metaRaw: string
  /** id/形状 与元数据之间的空白原文 */
  metaGap: string
  /** 行尾残留（空白/注释）；仅当本元素是该行最后一个元素时非空 */
  trailing: string
}

/** 边：位置序身份 `edge:N`（ADR-0012）——三种语义（sequence/reference/failure） */
export type AgentflowEdgeKind = 'sequence' | 'reference' | 'failure'

export interface AgentflowEdgeData {
  kind: 'agentflow-edge'
  fromNodeId: string
  toNodeId: string
  edgeKind: AgentflowEdgeKind
  /** 箭身原文（`-->` / `-.-` / `--x`；含可能的多长度重复符） */
  arrowRaw: string
  /** 标签原文（行内 `-- 标签 -->` 的中间段）；无标签时为 null */
  label: string | null
  /** 标签前空白原文（label 为 null 时为空串） */
  labelLead: string
  /** 标签后空白原文（label 为 null 时为空串） */
  labelTrail: string
}

/** 容器声明行：`flow id["title"]` / `global`（开行，与 `end` 行配对） */
export interface AgentflowContainerOpenData {
  kind: 'agentflow-container-open'
  /** `flow` 或 `global` */
  keyword: 'flow' | 'global'
  /** 行首缩进原文（开行 span 从行首起，渲染时必须原样带回） */
  indent: string
  /** 容器 id（`global` 恒为 null） */
  id: string | null
  /** 关键词与 id 之间空白原文 */
  gap1: string
  /** 标题括号原文；无标题时为空串 */
  openRaw: string
  /** 标题文本（**去引号**）；无标题时为 null */
  title: string | null
  /** 标题引号原文（`"` / `'` / 空串 = 未加引号）；无标题时为空串 */
  quote: string
  /** 标题闭合符原文；无标题时为空串 */
  closeRaw: string
  /** 单行元数据 `@{ … }` 整块原文（如折叠容器）；无 / 多行时为 '' */
  metaRaw: string
  /** 元数据前的空白原文 */
  metaGap: string
  /** 行尾换行原文（本元素的 span 覆盖整行含 EOL，渲染时必须原样带回，否则 `end` 会并入本行） */
  eol: string
}

/** 容器结束行 `end`（配对开行；投影/删除时判断归属） */
export interface AgentflowContainerEndData {
  kind: 'agentflow-container-end'
  /** 匹配的开行的容器关键字 */
  keyword: 'flow' | 'global'
}

/** 文档级属性行（`direction` / `title` / `classDef` / `style` 等逐字保留行；整行可寻址） */
export interface AgentflowDocLineData {
  kind: 'agentflow-doc'
  /** 原行文本（不含 eol） */
  text: string
  eol: string
}

export type AgentflowElementData =
  | AgentflowHeaderData
  | AgentflowNodeData
  | AgentflowEdgeData
  | AgentflowContainerOpenData
  | AgentflowContainerEndData
  | AgentflowDocLineData

// ---------- 渲染 ----------

/** 渲染声明行（改方向后；关键字与空白原文逐字保留） */
export function renderAgentflowHeader(
  d: AgentflowHeaderData,
  changes: { direction?: string } = {},
): string {
  const direction = changes.direction !== undefined ? changes.direction : d.direction
  if (direction === '') return d.keyword + d.trailing + d.eol
  const gap = d.direction === '' ? (d.trailing !== '' ? d.trailing : ' ') : d.gap
  return d.keyword + gap + direction + d.eol
}

/** 渲染节点行（改文本 / 改 id / 改元数据后；各部分原文逐字保留） */
export function renderAgentflowNode(
  d: AgentflowNodeData,
  changes: { newId?: string; text?: string; metaRaw?: string } = {},
): string {
  const id = changes.newId ?? d.nodeId
  const prefix = d.isConnector ? 'connector' + d.connectorGap : ''
  const nextMeta = changes.metaRaw !== undefined ? changes.metaRaw : d.metaRaw
  // 元数据前的空白：原块存在则沿用原文；新加块而原无空白则补一个空格
  const metaPrefix =
    nextMeta === '' ? '' : d.metaGap !== '' ? d.metaGap : d.metaRaw === '' ? ' ' : d.metaGap
  const metaPart = nextMeta === '' ? '' : metaPrefix + nextMeta
  if (d.text === null) {
    return prefix + id + metaPart + d.trailing
  }
  const text = changes.text !== undefined ? changes.text : d.text
  return prefix + id + d.gapAfterId + d.openRaw + d.quote + text + d.quote + d.closeRaw + metaPart + d.trailing
}

/** 渲染边 token（不含两侧空白；span 恰为 token 本身） */
export function renderAgentflowEdge(
  d: AgentflowEdgeData,
  changes: { label?: string | null } = {},
): string {
  const label = changes.label !== undefined ? changes.label : d.label
  if (label === null || label === '') return d.arrowRaw
  const lead = d.labelLead !== '' ? d.labelLead : ' '
  const trail = d.labelTrail !== '' ? d.labelTrail : ' '
  // 三种算子的行内标签写法（与 parser 的 tryInlineEdgeLabel 互逆）：
  // - `-->` → `-- 标签 -->`
  // - `-.-` → `-. 标签 .-`
  // - `--x` → `-- 标签 --x`
  const { head, tail } = splitArrow(d.arrowRaw)
  return head + lead + label + trail + tail
}

/** 拆算子为「前段 + 后段」以插入标签；后段是完整算子（保留末段语义） */
function splitArrow(raw: string): { head: string; tail: string } {
  if (raw.startsWith('-.')) return { head: '-.', tail: raw }
  if (raw.startsWith('--')) return { head: '--', tail: raw }
  return { head: raw, tail: raw }
}

/** 渲染容器开行（改标题后；关键词/空白/元数据原文逐字保留） */
export function renderAgentflowContainerOpen(
  d: AgentflowContainerOpenData,
  changes: { title?: string } = {},
): string {
  if (d.id === null) return d.indent + d.keyword + d.gap1 + d.eol // global：无标题（gap1 = 尾随空白原文）
  const head = d.indent + d.keyword + d.gap1 + d.id
  if (d.title === null || d.openRaw === '') return head + d.metaGap + d.metaRaw + d.eol
  const title = changes.title !== undefined ? changes.title : d.title
  const quote = d.quote
  return head + d.openRaw + quote + title + quote + d.closeRaw + d.metaGap + d.metaRaw + d.eol
}

// ---------- 行级解析 ----------

const HEADER_RE = /^([ \t]*)(agentflow-beta)([ \t]*)([^\s]*)([ \t\r]*)$/
const FLOW_OPEN_RE = /^([ \t]*)(flow|global)([ \t]*)(.*)$/
const END_RE = /^[ \t]*end[ \t\r]*$/
const ID_RE = /[A-Za-z0-9_\u00C0-\uFFFF-]+/y
const VALID_NEW_ID_RE = /^[A-Za-z0-9_\u00C0-\uFFFF-]+$/
const WS_RE = /[ \t\r]*/y

function skipWs(line: string, pos: number): number {
  WS_RE.lastIndex = pos
  const match = WS_RE.exec(line)
  return pos + (match !== null ? match[0].length : 0)
}

/** 节点 id 合法性（表单层复用）：非空、词法合法、非保留关键字 */
export function isValidNewNodeId(id: string): boolean {
  return id !== '' && VALID_NEW_ID_RE.test(id) && id !== 'end' && id !== 'flow' && id !== 'global'
}

interface NodeToken {
  nodeId: string
  isConnector: boolean
  connectorGap: string
  gapAfterId: string
  openRaw: string
  text: string | null
  quote: string
  closeRaw: string
  metaGap: string
  metaRaw: string
  /** token 结束列（不含形状/元数据后的行尾残留） */
  end: number
}

/** 在 pos 处读一个节点 token（含可选形状与单行元数据）；不是节点返回 null */
function parseNodeToken(line: string, start: number): NodeToken | null {
  let pos = start
  let isConnector = false
  let connectorGap = ''
  if (
    line.startsWith('connector', pos) &&
    !/[A-Za-z0-9_-]/.test(line[pos + 'connector'.length] ?? '')
  ) {
    isConnector = true
    pos += 'connector'.length
    const gapMatch = /^[ \t]+/.exec(line.slice(pos))
    if (gapMatch === null) return null
    connectorGap = gapMatch[0]
    pos += connectorGap.length
  }
  ID_RE.lastIndex = pos
  const match = ID_RE.exec(line)
  if (match === null || match.index !== pos) return null
  const nodeId = match[0]
  if (nodeId === '') return null
  pos += nodeId.length
  const idEnd = pos

  const gapAfterId = /^[ \t]*/.exec(line.slice(pos))?.[0] ?? ''
  pos += gapAfterId.length

  let openRaw = ''
  let text: string | null = null
  let quote = ''
  let closeRaw = ''
  const shape = parseShapeBrackets(line, pos)
  if (shape !== null) {
    openRaw = shape.open
    text = shape.text
    quote = shape.quote
    closeRaw = shape.close
    pos = shape.end
  }

  // 单行元数据 `@{ … }`（多行块不在此认领——交由上层 statement 判定为 verbatim）
  const metaGap = /^[ \t]*/.exec(line.slice(pos))?.[0] ?? ''
  let metaRaw = ''
  let tokenEnd = shape !== null ? pos : idEnd
  if (line.startsWith('@{', pos + metaGap.length)) {
    const closeIdx = findMetaClose(line, pos + metaGap.length + 2)
    if (closeIdx !== -1) {
      metaRaw = line.slice(pos + metaGap.length, closeIdx + 1)
      tokenEnd = closeIdx + 1
    }
  }

  return { nodeId, isConnector, connectorGap, gapAfterId, openRaw, text, quote, closeRaw, metaGap, metaRaw, end: tokenEnd }
}

/** 解析形状括号（长 opener 在前）；找不到闭合返回 null（不抛错） */
function parseShapeBrackets(
  line: string,
  pos: number,
): { open: string; text: string; quote: string; close: string; end: number } | null {
  const pairs: Array<{ open: string; close: string }> = [
    { open: '([', close: '])' },
    { open: '[[', close: ']]' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
  ]
  for (const { open, close } of pairs) {
    if (!line.startsWith(open, pos)) continue
    const closeIdx = line.indexOf(close, pos + open.length)
    if (closeIdx === -1) return null
    const raw = line.slice(pos + open.length, closeIdx)
    // 去引号（`["label"]` / `['label']`）；裸文本原样
    const qm = /^(["'])(.*)\1$/.exec(raw)
    const text = qm !== null ? qm[2] : raw
    const quote = qm !== null ? qm[1] : ''
    return { open, text, quote, close, end: closeIdx + close.length }
  }
  return null
}

/** 找首个不在字符串里的 `}`（单行元数据块闭合符；跳过 `"…"` / `'…'` 内的字符） */
function findMetaClose(line: string, from: number): number {
  let quote: string | null = null
  for (let i = from; i < line.length; i++) {
    const ch = line[i]
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

/** 纯算子：`-.-` / `--x` / `-->`（含重复符加长） */
function tryPlainEdge(line: string, pos: number): EdgeToken | null {
  const patterns: Array<{ re: RegExp; kind: AgentflowEdgeKind }> = [
    { re: /^-\.-/, kind: 'reference' },
    { re: /^--x/, kind: 'failure' },
    { re: /^-->/, kind: 'sequence' },
  ]
  for (const { re, kind } of patterns) {
    const m = re.exec(line.slice(pos))
    if (m !== null) {
      return { edgeKind: kind, arrowRaw: m[0], label: null, labelLead: '', labelTrail: '', end: pos + m[0].length }
    }
  }
  return null
}

interface EdgeToken {
  edgeKind: AgentflowEdgeKind
  arrowRaw: string
  label: string | null
  labelLead: string
  labelTrail: string
  end: number
}

/** 行内标签：`-- 标签 -->`（sequence）/ `-. 标签 .-`（reference）/ `-- 标签 --x`（failure） */
function tryInlineEdgeLabel(line: string, pos: number): EdgeToken | null {
  const forms: Array<{ open: string; close: string; kind: AgentflowEdgeKind }> = [
    { open: '-.', close: '.-', kind: 'reference' },
    { open: '--', close: '--x', kind: 'failure' },
    { open: '--', close: '-->', kind: 'sequence' },
  ]
  for (const { open, close, kind } of forms) {
    if (!line.startsWith(open, pos)) continue
    // open 紧跟箭头头（`-->` 的 `>`）：纯算子，不是行内标签
    if (open === '--' && line[pos + 2] === '>') continue
    if (open === '-.' && line[pos + 2] === '-') continue
    const closeIdx = line.indexOf(close, pos + open.length)
    if (closeIdx === -1) continue
    const rawLabel = line.slice(pos + open.length, closeIdx)
    if (rawLabel.trim() === '') continue
    const lead = /^[ \t]*/.exec(rawLabel)?.[0] ?? ''
    const trail = /[ \t]*$/.exec(rawLabel)?.[0] ?? ''
    const label = rawLabel.slice(lead.length, rawLabel.length - trail.length)
    if (label === '' || /^[-=.x]*$/.test(label)) continue
    return {
      edgeKind: kind,
      // 无标签时的算子原文（`-- 标签 -->` → `-->`；`-. 标签 .-` → `-.-`；`-- 标签 --x` → `--x`）
      arrowRaw: close,
      label,
      labelLead: lead,
      labelTrail: trail,
      end: closeIdx + close.length,
    }
  }
  return null
}

/** 在 pos 处解析边 token（行内标签优先；否则纯算子）；不是边返回 null */
function parseEdgeAt(line: string, pos: number): EdgeToken | null {
  return tryInlineEdgeLabel(line, pos) ?? tryPlainEdge(line, pos)
}

interface RawEntry {
  span: Span
  data: AgentflowElementData
  trailing: string
}

export class AgentflowParser implements DiagramParser {
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
    const entries: Array<{ span: Span; id: string; data: AnyElement }> = []
    const nodeCounts = new Map<string, number>()
    const edgeCounts = new Map<string, number>()
    let docCount = 0
    let seenHeader = false
    /** 多行元数据块未闭合时置 true：块内所有行整块 verbatim（不参与元素寻址，research §8.4） */
    let inMetaBlock = false
    const stack: Array<{ keyword: 'flow' | 'global'; line: number }> = []
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
      const body = line.replace(/\r$/, '')
      const span: Span = { start: cursor, end: cursor + line.length + eol.length }

      if (trimmed !== '') {
        // 多行元数据块内：整块 verbatim（直至含 `}` 的行；块内所有行不参与元素寻址）
        if (inMetaBlock) {
          if (findMetaClose(body, 0) !== -1) inMetaBlock = false
          if (nl === -1) break
          cursor = nl + 1
          continue
        }
        const headerMatch = HEADER_RE.exec(body)
        const flowMatch = FLOW_OPEN_RE.exec(body)
        if (headerMatch !== null) {
          seenHeader = true
          const data: AgentflowHeaderData = {
            kind: 'agentflow-header',
            keyword: headerMatch[2],
            gap: headerMatch[3],
            direction: headerMatch[4],
            trailing: (headerMatch[5] ?? '').replace(/\r$/, ''),
            eol,
          }
          entries.push({ span, id: 'header', data })
        } else if (trimmed.startsWith('%%')) {
          // 注释行（agentflow 显式保注释，research §5）：逐字保留
        } else if (END_RE.test(body)) {
          const top = stack.pop()
          if (top === undefined) {
            throw parseFailure(lineNo, '多余的 end（没有与之匹配的 flow / global）')
          }
          const endData: AgentflowContainerEndData = { kind: 'agentflow-container-end', keyword: top.keyword }
          entries.push({ span, id: `end#${entries.length}`, data: endData })
        } else if (!seenHeader) {
          // header 之前的行：不解析，逐字保留
        } else if (
          flowMatch !== null &&
          (flowMatch[4] === '' ||
            flowMatch[4].startsWith('[') ||
            /^[A-Za-z0-9_\u00C0-\uFFFF-]/.test(flowMatch[4]))
        ) {
          const open = this.parseContainerOpen(flowMatch, eol)
          if (open !== null) {
            stack.push({ keyword: open.keyword, line: lineNo })
            entries.push({ span, id: `container:${open.keyword}:${entries.length}`, data: open })
          } else {
            docCount++
            const docData: AgentflowDocLineData = { kind: 'agentflow-doc', text: body, eol }
            entries.push({ span, id: `agentflow-doc:${docCount}`, data: docData })
          }
        } else if (startsMultilineMeta(body)) {
          // 节点/容器行开启了未闭合的 `@{`：整块 verbatim（本行 + 后续行直至 `}`）
          inMetaBlock = true
        } else {
          const statement = tryStatement(line, cursor)
          if (statement !== null) {
            for (const raw of statement) {
              if (raw.data.kind === 'agentflow-node') {
                const count = (nodeCounts.get(raw.data.nodeId) ?? 0) + 1
                nodeCounts.set(raw.data.nodeId, count)
                const id = count === 1 ? `node:${raw.data.nodeId}` : `node:${raw.data.nodeId}#${count}`
                const nodeData: AgentflowNodeData = { ...raw.data, trailing: raw.trailing }
                entries.push({ span: raw.span, id, data: nodeData })
              } else if (raw.data.kind === 'agentflow-edge') {
                const key = `${raw.data.fromNodeId}->${raw.data.toNodeId}`
                const count = (edgeCounts.get(key) ?? 0) + 1
                edgeCounts.set(key, count)
                const id = count === 1 ? `edge:${key}` : `edge:${key}#${count}`
                entries.push({ span: raw.span, id, data: raw.data })
              }
            }
          } else {
            // 文档级属性行 / 识别不了的行：整行可寻址（可删除），逐字保留
            docCount++
            const docData: AgentflowDocLineData = { kind: 'agentflow-doc', text: body, eol }
            entries.push({ span, id: `agentflow-doc:${docCount}`, data: docData })
          }
        }
      }

      if (nl === -1) break
      cursor = nl + 1
    }

    if (!seenHeader) {
      throw parseFailure(1, '图表必须以 agentflow-beta 声明开始')
    }
    if (stack.length > 0) {
      throw parseFailure(stack[stack.length - 1].line, 'flow / global 缺少匹配的 end')
    }
    return assembleDocument(source, entries)
  }

  /** 解析 `flow id["title"]` / `global` 开行（含可选单行元数据块）；失败返回 null */
  private parseContainerOpen(match: RegExpExecArray, eol: string): AgentflowContainerOpenData | null {
    const indent = match[1]
    const keyword = match[2] as 'flow' | 'global'
    const gap1 = match[3]
    const rest = match[4]

    if (keyword === 'global') {
      // global 后只允许空白（其余内容不是可识别的 global 声明 → verbatim）
      if (rest.trim() !== '') return null
      return {
        kind: 'agentflow-container-open',
        keyword,
        indent,
        id: null,
        gap1: rest,
        openRaw: '',
        title: null,
        quote: '',
        closeRaw: '',
        metaRaw: '',
        metaGap: '',
        eol,
      }
    }

    const idMatch = /^[A-Za-z0-9_\u00C0-\uFFFF-]+/.exec(rest)
    if (idMatch === null) return null
    const id = idMatch[0]
    let pos = idMatch[0].length
    const gapAfterId = /^[ \t]*/.exec(rest.slice(pos))?.[0] ?? ''
    pos += gapAfterId.length

    let openRaw = ''
    let title: string | null = null
    let quote = ''
    let closeRaw = ''
    const qm = /^\[(["']?)(.*?)\1\]/.exec(rest.slice(pos))
    if (qm !== null) {
      openRaw = '['
      quote = qm[1]
      title = qm[2]
      closeRaw = ']'
      pos += qm[0].length
    }

    const metaGap = /^[ \t]*/.exec(rest.slice(pos))?.[0] ?? ''
    let metaRaw = ''
    const metaAbs = pos + metaGap.length
    if (rest.startsWith('@{', metaAbs)) {
      const closeIdx = findMetaClose(rest, metaAbs + 2)
      if (closeIdx !== -1) metaRaw = rest.slice(metaAbs, closeIdx + 1)
    }

    return {
      kind: 'agentflow-container-open',
      keyword,
      indent,
      id,
      gap1,
      openRaw,
      title,
      quote,
      closeRaw,
      metaRaw,
      metaGap,
      eol,
    }
  }

  // ---------- 意图落地（resolveRewrites） ----------

  resolveRewrites(doc: SourceDocument, intent: EditIntent): ReadonlyMap<string, string> | null {
    switch (intent.type) {
      case 'set-node-text':
        return this.resolveSetNodeText(doc, intent as Extract<AgentflowIntent, { type: 'set-node-text' }>)
      case 'rename-node':
        return this.resolveRenameNode(doc, intent as Extract<AgentflowIntent, { type: 'rename-node' }>)
      case 'set-node-shape':
        return this.resolveSetNodeShape(doc, intent as Extract<AgentflowIntent, { type: 'set-node-shape' }>)
      case 'add-node':
        return this.resolveAddNode(doc, intent as Extract<AgentflowIntent, { type: 'add-node' }>)
      case 'delete-node':
        return this.resolveDeleteNode(doc, intent as Extract<AgentflowIntent, { type: 'delete-node' }>)
      case 'set-edge-label':
        return this.resolveSetEdgeLabel(doc, intent as Extract<AgentflowIntent, { type: 'set-edge-label' }>)
      case 'delete-edge':
        return this.resolveDeleteEdge(doc, intent as Extract<AgentflowIntent, { type: 'delete-edge' }>)
      case 'add-edge':
        return this.resolveAddEdge(doc, intent as Extract<AgentflowIntent, { type: 'add-edge' }>)
      case 'set-direction':
        return this.resolveSetDirection(doc, intent as Extract<AgentflowIntent, { type: 'set-direction' }>)
      case 'set-flow-title':
        return this.resolveSetFlowTitle(doc, intent as Extract<AgentflowIntent, { type: 'set-flow-title' }>)
      case 'add-flow':
        return this.resolveAddFlow(doc, intent as Extract<AgentflowIntent, { type: 'add-flow' }>)
      case 'delete-flow':
        return this.resolveDeleteFlow(doc, intent as Extract<AgentflowIntent, { type: 'delete-flow' }>)
      case 'delete-doc-line':
        return this.removeElement(doc, intent.elementId as string, 'agentflow-doc')
      default:
        return null
    }
  }

  private nodeOccs(doc: SourceDocument, nodeId: string) {
    return doc.elements.filter(
      (part) => part.element.kind === 'agentflow-node' && (part.element as AgentflowNodeData).nodeId === nodeId,
    )
  }

  private resolveSetNodeText(
    doc: SourceDocument,
    intent: Extract<AgentflowIntent, { type: 'set-node-text' }>,
  ): Map<string, string> | null {
    const occs = this.nodeOccs(doc, intent.nodeId)
    if (occs.length === 0) return null
    const rewrites = new Map<string, string>()
    for (const part of occs) {
      const d = part.element as AgentflowNodeData
      if (d.text === null) continue
      rewrites.set(part.id, renderAgentflowNode(d, { text: intent.text }))
    }
    return rewrites.size > 0 ? rewrites : null
  }

  private resolveRenameNode(
    doc: SourceDocument,
    intent: Extract<AgentflowIntent, { type: 'rename-node' }>,
  ): Map<string, string> | null {
    if (!isValidNewNodeId(intent.newId) || intent.newId === intent.nodeId) return null
    const occs = this.nodeOccs(doc, intent.nodeId)
    if (occs.length === 0) return null
    const rewrites = new Map<string, string>()
    for (const part of occs) {
      rewrites.set(part.id, renderAgentflowNode(part.element as AgentflowNodeData, { newId: intent.newId }))
    }
    return rewrites
  }

  private resolveSetNodeShape(
    doc: SourceDocument,
    intent: Extract<AgentflowIntent, { type: 'set-node-shape' }>,
  ): Map<string, string> | null {
    const occ = this.nodeOccs(doc, intent.nodeId)[0]
    if (occ === undefined) return null
    const d = occ.element as AgentflowNodeData
    // 多行元数据块不做手术改写（整块 verbatim，research §8.4）：不落码，如实不处理
    if (d.metaRaw === '' && d.metaGap !== '' && d.metaGap.includes('\n')) return null
    const nextMeta = withShapeMeta(d.metaRaw, intent.shape)
    return new Map([[occ.id, renderAgentflowNode(d, { metaRaw: nextMeta })]])
  }

  private resolveAddNode(
    doc: SourceDocument,
    intent: Extract<AgentflowIntent, { type: 'add-node' }>,
  ): Map<string, string> | null {
    if (!isValidNewNodeId(intent.nodeId)) return null
    const shape = intent.shape ?? 'task'
    const text = intent.text ?? intent.nodeId
    const line = `${intent.nodeId}["${text}"]@{ shape: ${shape} }`
    return insertAfter(doc, {
      afterElementId: intent.afterElementId,
      anchor: 'line-end',
      render: (indent) => indentLines(indent, [line]),
    })
  }

  private resolveDeleteNode(
    doc: SourceDocument,
    intent: Extract<AgentflowIntent, { type: 'delete-node' }>,
  ): Map<string, string> | null {
    const occs = this.nodeOccs(doc, intent.nodeId)
    if (occs.length === 0) return null
    const rewrites = new Map<string, string>()
    for (const part of occs) rewrites.set(part.id, '')
    // 触及该节点的边：与 flowchart delete-node 同口径（链中删点后两端合并保留一条）
    const edges = doc.elements.filter((part) => {
      if (part.element.kind !== 'agentflow-edge') return false
      const e = part.element as AgentflowEdgeData
      return e.fromNodeId === intent.nodeId || e.toNodeId === intent.nodeId
    })
    const hasIncomingOn = (line: number) =>
      edges.some(
        (part) =>
          (part.element as AgentflowEdgeData).toNodeId === intent.nodeId &&
          lineAtOffset(doc.source, part.span.start) === line,
      )
    for (const part of edges) {
      const e = part.element as AgentflowEdgeData
      const line = lineAtOffset(doc.source, part.span.start)
      if (e.toNodeId === intent.nodeId || !hasIncomingOn(line)) {
        rewrites.set(part.id, '')
      }
    }
    return rewrites
  }

  private edgePart(doc: SourceDocument, elementId: string) {
    const part = getElementById(doc, elementId)
    if (part === undefined || part.element.kind !== 'agentflow-edge') return null
    return part
  }

  private resolveSetEdgeLabel(
    doc: SourceDocument,
    intent: Extract<AgentflowIntent, { type: 'set-edge-label' }>,
  ): Map<string, string> | null {
    const part = this.edgePart(doc, intent.elementId)
    if (part === null) return null
    if (intent.label !== null && intent.label !== '' && /[\r\n]/.test(intent.label)) return null
    return new Map([[part.id, renderAgentflowEdge(part.element as AgentflowEdgeData, { label: intent.label })]])
  }

  private resolveDeleteEdge(
    doc: SourceDocument,
    intent: Extract<AgentflowIntent, { type: 'delete-edge' }>,
  ): Map<string, string> | null {
    const part = this.edgePart(doc, intent.elementId)
    if (part === null) return null
    // 单行语句（两端节点与边同行）：删边即整行删，与 flowchart 单连线行同口径
    const line = lineAtOffset(doc.source, part.span.start)
    const rewrites = new Map<string, string>()
    for (const p of doc.elements) {
      if (lineAtOffset(doc.source, p.span.start) === line) rewrites.set(p.id, '')
    }
    return rewrites
  }

  private resolveAddEdge(
    doc: SourceDocument,
    intent: Extract<AgentflowIntent, { type: 'add-edge' }>,
  ): Map<string, string> | null {
    if (intent.from === '' || intent.to === '') return null
    const op = intent.edgeKind === 'reference' ? '-.-' : intent.edgeKind === 'failure' ? '--x' : '-->'
    const line =
      intent.label !== undefined && intent.label !== null && intent.label !== ''
        ? `${intent.from} -- ${intent.label} ${op} ${intent.to}`
        : `${intent.from} ${op} ${intent.to}`
    return insertAfter(doc, {
      afterElementId: intent.afterElementId,
      anchor: 'line-end',
      render: (indent) => indentLines(indent, [line]),
    })
  }

  private resolveSetDirection(
    doc: SourceDocument,
    intent: Extract<AgentflowIntent, { type: 'set-direction' }>,
  ): Map<string, string> | null {
    const dir = intent.direction.toUpperCase()
    if (!isDirection(dir)) return null
    const header = doc.elements.find((part) => part.element.kind === 'agentflow-header')
    if (header === undefined) return null
    return new Map([[header.id, renderAgentflowHeader(header.element as AgentflowHeaderData, { direction: dir })]])
  }

  private resolveSetFlowTitle(
    doc: SourceDocument,
    intent: Extract<AgentflowIntent, { type: 'set-flow-title' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'agentflow-container-open') return null
    const d = part.element as AgentflowContainerOpenData
    if (d.keyword !== 'flow') return null
    return new Map([[part.id, renderAgentflowContainerOpen(d, { title: intent.title })]])
  }

  private resolveAddFlow(
    doc: SourceDocument,
    intent: Extract<AgentflowIntent, { type: 'add-flow' }>,
  ): Map<string, string> | null {
    if (intent.id !== undefined && !isValidNewNodeId(intent.id)) return null
    const id = intent.id ?? 'flow1'
    const title = intent.title ?? id
    return insertAfter(doc, {
      afterElementId: intent.afterElementId,
      anchor: 'line-end',
      render: (indent) => indentLines(indent, [`flow ${id}["${title}"]`, 'end']),
    })
  }

  private resolveDeleteFlow(
    doc: SourceDocument,
    intent: Extract<AgentflowIntent, { type: 'delete-flow' }>,
  ): Map<string, string> | null {
    const open = getElementById(doc, intent.elementId)
    if (open === undefined || open.element.kind !== 'agentflow-container-open') return null
    // 匹配的 end（含嵌套）
    let depth = 1
    let end: (typeof doc.elements)[number] | null = null
    for (const part of doc.elements) {
      if (part.span.start <= open.span.start) continue
      if (part.element.kind === 'agentflow-container-open') depth++
      if (part.element.kind === 'agentflow-container-end') {
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

  private removeElement(
    doc: SourceDocument,
    elementId: string,
    kind: AgentflowElementData['kind'],
  ): Map<string, string> | null {
    const part = getElementById(doc, elementId)
    if (part === undefined || part.element.kind !== kind) return null
    return new Map([[part.id, '']])
  }
}

/** 行内是否出现未闭合的 `@{`（开启多行元数据块）；用于把整块判为 verbatim（research §8.4） */
function startsMultilineMeta(line: string): boolean {
  const idx = line.indexOf('@{')
  if (idx === -1) return false
  return findMetaClose(line, idx + 2) === -1
}

/** 逐行解析一条语句（节点 / 边 / 链式）；不是语句返回 null（整行原样保留） */
function tryStatement(line: string, lineStart: number): RawEntry[] | null {
  const firstChar = line.length - line.trimStart().length
  const first = parseNodeToken(line, firstChar)
  if (first === null) return null

  const entries: RawEntry[] = [
    {
      span: { start: lineStart + firstChar, end: lineStart + first.end },
      data: nodeDataOf(first, ''),
      trailing: '',
    },
  ]
  let lastEnd = first.end

  for (;;) {
    if (skipWs(line, lastEnd) >= line.length) {
      // 行以节点结尾：行尾残留归最后一个节点（span 延至行尾）
      const last = entries[entries.length - 1]
      const rawTrailing = line.slice(lastEnd)
      if (/[^\s]/.test(rawTrailing.replace(/%%.*/, ''))) return null
      last.span.end = lineStart + line.length
      last.trailing = rawTrailing
      return entries
    }
    const arrowPos = skipWs(line, lastEnd)
    const arrow = parseEdgeAt(line, arrowPos)
    if (arrow === null) return null
    const nextPos = skipWs(line, arrow.end)
    const next = parseNodeToken(line, nextPos)
    if (next === null) return null

    entries.push({
      span: { start: lineStart + arrowPos, end: lineStart + arrow.end },
      data: {
        kind: 'agentflow-edge',
        fromNodeId: nodeOf(entries).nodeId,
        toNodeId: next.nodeId,
        edgeKind: arrow.edgeKind,
        arrowRaw: arrow.arrowRaw,
        label: arrow.label,
        labelLead: arrow.labelLead,
        labelTrail: arrow.labelTrail,
      },
      trailing: '',
    })
    entries.push({
      span: { start: lineStart + nextPos, end: lineStart + next.end },
      data: nodeDataOf(next, ''),
      trailing: '',
    })
    lastEnd = next.end
  }
}

/** NodeToken → AgentflowNodeData（trailing 由外层填） */
function nodeDataOf(token: NodeToken, trailing: string): AgentflowNodeData {
  return {
    kind: 'agentflow-node',
    nodeId: token.nodeId,
    isConnector: token.isConnector,
    connectorGap: token.connectorGap,
    gapAfterId: token.gapAfterId,
    openRaw: token.openRaw,
    text: token.text,
    quote: token.quote,
    closeRaw: token.closeRaw,
    metaRaw: token.metaRaw,
    metaGap: token.metaGap,
    trailing,
  }
}

/** 边 token 的起点节点（取 entries 里最近的节点） */
function nodeOf(entries: RawEntry[]): AgentflowNodeData {
  for (let i = entries.length - 1; i >= 0; i--) {
    const data = entries[i].data
    if (data.kind === 'agentflow-node') return data
  }
  throw new Error('解析器内部错误：边缺少起点节点')
}

// ---------- 元数据手术（只动目标键，其余原文逐字保留） ----------

/**
 * 在**单行**元数据块里设置 `shape: 值`：已有 key 则替换其值（保留引号风格与其余键原文），
 * 无则追加（YAML 流式风格 `@{ shape: … }`）；空块则生成 `@{ shape: … }`。
 * **绝不重新序列化 YAML**（键序 / 缩进 / 引号风格漂移违反 ADR-0004）。
 */
export function withShapeMeta(metaRaw: string, shape: string): string {
  if (metaRaw === '') return `@{ shape: ${shape} }`
  const m = /\bshape\s*:\s*([^,}]*)/.exec(metaRaw)
  if (m === null) {
    // 追加 `shape` 键：在 `}` 前插入，保持既有键原文不动（`@{ a: 1 }` → `@{ a: 1, shape: x }`）
    const closeIdx = metaRaw.lastIndexOf('}')
    const head = metaRaw.slice(0, closeIdx).replace(/[ \t]+$/, '')
    const tail = metaRaw.slice(closeIdx)
    const sep = head === '@{' ? ' ' : ', '
    return head + sep + `shape: ${shape} ` + tail
  }
  // 替换值时保留原值两侧的空白（如 `shape: task ` 的尾空格）
  const full = m[0]
  const lead = /^shape\s*:\s*/.exec(full)?.[0] ?? 'shape: '
  const valueIdx = m.index + lead.length
  const trailingOfValue = m[1].match(/[ \t]*$/)?.[0] ?? ''
  return (
    metaRaw.slice(0, valueIdx) + shape + trailingOfValue + metaRaw.slice(m.index + full.length)
  )
}

// ---------- 编辑意图 ----------

export type AgentflowIntent =
  /** 改节点显示文本（全部带形状的出现） */
  | { type: 'set-node-text'; nodeId: string; text: string }
  /** 改节点 id（文档中全部出现） */
  | { type: 'rename-node'; nodeId: string; newId: string }
  /** 换节点形状（改首现的单行 `@{ shape: … }`） */
  | { type: 'set-node-shape'; nodeId: string; shape: string }
  /** 新增节点声明行 */
  | { type: 'add-node'; nodeId: string; text?: string; shape?: string; afterElementId?: string }
  /** 删除节点（其全部出现与触及的边） */
  | { type: 'delete-node'; nodeId: string }
  /** 改边标签（elementId = `edge:from->to`；null/空串 = 去标签） */
  | { type: 'set-edge-label'; elementId: string; label: string | null }
  /** 删除边所在整行 */
  | { type: 'delete-edge'; elementId: string }
  /** 新增边行 */
  | {
      type: 'add-edge'
      from: string
      to: string
      edgeKind?: AgentflowEdgeKind
      label?: string | null
      afterElementId?: string
    }
  /** 改图方向（TB/TD/BT/LR/RL） */
  | { type: 'set-direction'; direction: string }
  /** 改 flow 标题（elementId = 容器开行 id） */
  | { type: 'set-flow-title'; elementId: string; title: string }
  /** 新增空 flow 块（open + end 两行） */
  | { type: 'add-flow'; id?: string; title?: string; afterElementId?: string }
  /** 删除 flow 块（open 到 end 之间的全部元素） */
  | { type: 'delete-flow'; elementId: string }
  /** 删除一条文档级属性行 */
  | { type: 'delete-doc-line'; elementId: string }

export const agentflowParser = new AgentflowParser()
