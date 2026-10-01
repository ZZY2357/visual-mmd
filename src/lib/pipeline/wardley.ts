import { assembleDocument, getElementById, type SourceDocument } from './document'
import type { DiagramParser, EditIntent, ParseResult, SourceParseError } from './parser'
import { frontmatterEnd } from './frontmatter'
import type { Span } from './span'
import { insertAfter } from './insert'

/**
 * wardley 完整解析器（more-diagrams 工单 23，语法事实以
 * .scratch/more-diagrams/research/wardley.md 为准——Langium 图种，非 jison）：
 * 手写、逐行、带 span（ADR-0004）。可测试承诺：解析后不做修改再重组装，
 * 输出与输入逐字相同（verbatim identity）。
 *
 * 覆盖（research §2 分层）：
 * - 表头：`wardley-beta`（唯一关键字，无裸名；detect 大小写不敏感，语法字面是
 *   `wardley-beta`——见 registry）
 * - 节点行：`component 名 [可见度, 演化度]` / `anchor 名 [可见度, 演化度]`
 *   （坐标是 OWM 的 `[visibility, evolution]` = `[Y, X]`，research 坑 1）；
 *   非 ASCII 名必须引号（research 坑 3）——名字形态逐字保留
 * - 连线行：`A -> B` / `A --> B` / `A -.-> B`，位置序身份 `wardley-link:N`（ADR-0012）
 * - `evolve 名 目标演化度`：红色虚线演化箭头（DB 落 trend），位置序 `evolve:N`
 * - 文档级：`title` / `size [宽, 高]` / `evolution 段 -> 段 -> …` / `annotations [x,y]` /
 *   `note "文本" [可见度, 演化度]` / `annotation 编号,[x,y] "文本"` /
 *   `accelerator|deaccelerator "名" [x, y]` —— 整行可寻址（表单/删除），语法细节逐字保留
 * - `pipeline 父 { … }`：**多行块**，整块一个元素（工单 23 分层），块内文本次字保留
 *
 * 不解析、原样保留（清单外语法不报错，ADR-0008）：frontmatter、`%%` 注释、空行、
 * `%%{init}%%` 指令、无法识别的行。
 *
 * 注（research §5）：`linkLabel` 词法会吞掉行尾到换行——本解析器**不解析**行尾 `;` 注释，
 * 含 `;` 的行整体落在 link 行的原文里，改写时逐字保留。
 */

interface ParseFailure extends Error {
  line: number
}

function parseFailure(line: number, message: string): ParseFailure {
  const error = new Error(message) as ParseFailure
  error.line = line
  return error
}

// ---------- 名字形态（引号风格逐字保留） ----------

/** 引号名原文（含引号）与引号内文本；裸名（ASCII 词形）原文即名字。 */
export interface WardleyName {
  /** 原文（含引号，若用户写了引号） */
  raw: string
  /** 去引号后的名字 */
  name: string
  /** 引号字符（" / '）；裸名 '' */
  quote: string
}

/** 解析一个名字：优先引号串（非 ASCII 名必须走这里），否则裸 ASCII 词形（research 坑 3） */
function parseName(text: string): { name: WardleyName; rest: string } | null {
  const trimmed = text.replace(/^[ \t]+/, '')
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
    const quote = trimmed[0]
    const end = trimmed.indexOf(quote, 1)
    if (end === -1) return null
    return {
      name: { raw: trimmed.slice(0, end + 1), name: trimmed.slice(1, end), quote },
      rest: trimmed.slice(end + 1),
    }
  }
  // 裸名：与 NAME_WITH_SPACES 同界的收窄——ASCII 字母开头，允许字母数字 _ ( ) & 连字符
  const m = /^([A-Za-z][A-Za-z0-9_()&]*(?:-[^>][A-Za-z0-9_()&]*)*)/.exec(trimmed)
  if (m === null) return null
  return { name: { raw: m[1], name: m[1], quote: '' }, rest: trimmed.slice(m[1].length) }
}

/** 按名字形态渲染：引号名保留原引号风格，裸名原样——不擅自加引号（ADR-0004 逐字） */
function renderName(name: WardleyName, next: string): string {
  return name.quote === '' ? next : `${name.quote}${next}${name.quote}`
}

// ---------- 坐标 ----------

/** `[可见度, 演化度]`（= [Y, X]）；原文逐字保留（不改小数风格，非法值原样） */
export interface WardleyCoords {
  /** 第一个数字原文（可见度 / Y） */
  visibility: string
  /** 第二个数字原文（演化度 / X） */
  evolution: string
}

const COORDS_RE = /^[ \t]*\[[ \t]*([0-9.]+)[ \t]*,[ \t]*([0-9.]+)[ \t]*\][ \t]*/

function parseCoords(text: string): { coords: WardleyCoords; rest: string } | null {
  const m = COORDS_RE.exec(text)
  if (m === null) return null
  return { coords: { visibility: m[1], evolution: m[2] }, rest: text.slice(m[0].length) }
}

/** 坐标值校验（表单层复用，research 坑 2）：非负数字，0–1 或 0–100 皆可（解析器归一后越界抛错）。
 * Langium 的 NUMBER 终结符是 `INT ("." INT?)?`（无前导 `.5`、无负号）——这里同界，避免落码出非法源 */
export function isValidWardleyCoord(value: string): boolean {
  if (!/^[0-9]+(\.[0-9]+)?$/.test(value)) return false
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 && n <= 100
}

/** 结点名校验（表单层复用，与 research 坑 3 同界）：非空、不含引号与换行 */
export function isValidWardleyName(name: string): boolean {
  return name !== '' && !/["'\r\n]/.test(name)
}

/**
 * 名字是否可裸写（ASCII 词形，与 mermaid `NAME_WITH_SPACES` 同界）。
 * 非 ASCII（含中文）名字必须加引号——渲染新行时据此决定要不要加引号（research 坑 3）。
 */
export function isBareWardleyName(name: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_()&]*(?:-[^>][A-Za-z0-9_()&]*)*$/.test(name)
}

/** 渲染名字 token：可裸写则裸写，否则加双引号（新建节点行用） */
export function renderWardleyNameToken(name: string): string {
  return isBareWardleyName(name) ? name : `"${name}"`
}

// ---------- 元素数据 ----------

export interface WardleyHeaderData {
  kind: 'wardley-header'
  /** 原文关键字（`wardley-beta`，保留用户书写大小写） */
  keyword: string
  trailing: string
}

/** 节点行：`component 名 [vis, evo] [(inertia)] [(build)] [label [x, y]]` */
export interface WardleyNodeData {
  kind: 'wardley-node'
  nodeKind: 'component' | 'anchor'
  /** 关键字原文（`component` / `anchor`） */
  keyword: string
  /** 关键字与名字之间的空白 */
  keywordAfter: string
  name: WardleyName
  /** 名字与坐标 `[` 之间的空白 */
  coordsLead: string
  coords: WardleyCoords
  /** 坐标之后到行尾的装饰器原文（`(inertia)` / `(build)` / `label [x, y]` / 空白） */
  trailing: string
  /** 换行符（文档最后一行可能为空串） */
  eol: string
}

/** 依赖连线行：`A -> B` / `A --> B` / `A -.-> B`（文档序位置序身份） */
export interface WardleyLinkData {
  kind: 'wardley-link'
  from: WardleyName
  /** from 与箭头之间的空白 */
  arrowLead: string
  /** 箭头原文（`->` / `-->` / `-.->`） */
  arrow: string
  /** 箭头与 to 之间的空白 */
  arrowAfter: string
  to: WardleyName
  /** to 之后到行尾（含行尾 `; 注释`，逐字保留） */
  trailing: string
  eol: string
}

/** `evolve 名 目标演化度` */
export interface WardleyEvolveData {
  kind: 'wardley-evolve'
  keywordAfter: string
  name: WardleyName
  /** 名字与目标值之间的空白 */
  valueLead: string
  /** 目标演化度原文 */
  target: string
  /** 目标值之后到行尾 */
  trailing: string
  eol: string
}

/**
 * 文档级属性行（整行可寻址、可删除；值文本在表单层编辑需整行重建，工单 23 只做
 * title / size 表单，其余由用户改源码——见工单偏差说明）。kind 细分以便结构树分区。
 */
export interface WardleyDocLineData {
  kind: 'wardley-doc'
  docKind: 'title' | 'size' | 'evolution' | 'annotations' | 'note' | 'annotation' | 'accelerator' | 'deaccelerator' | 'unknown'
  /** 原行文本（不含 eol） */
  text: string
  eol: string
}

/** `pipeline 父 { … }` 多行块（整块一个元素，块内文本次字保留） */
export interface WardleyPipelineData {
  kind: 'wardley-pipeline'
  /** 父组件名 */
  parent: WardleyName
  /** 块原文（含 `pipeline … {` 到 `}` 的整块，逐字保留） */
  raw: string
}

export type WardleyElementData =
  | WardleyHeaderData
  | WardleyNodeData
  | WardleyLinkData
  | WardleyEvolveData
  | WardleyDocLineData
  | WardleyPipelineData

// ---------- 渲染 ----------

export function renderWardleyNode(
  d: WardleyNodeData,
  changes: { name?: string; visibility?: string; evolution?: string } = {},
): string {
  const name = changes.name !== undefined ? changes.name : d.name.name
  const vis = changes.visibility !== undefined ? changes.visibility : d.coords.visibility
  const evo = changes.evolution !== undefined ? changes.evolution : d.coords.evolution
  return (
    d.keyword +
    d.keywordAfter +
    renderName(d.name, name) +
    d.coordsLead +
    `[${vis}, ${evo}]` +
    d.trailing +
    d.eol
  )
}

/** 按字段渲染一条新节点行（新建用；自带行尾换行） */
function renderNewNodeLine(
  nodeKind: 'component' | 'anchor',
  name: string,
  coords: WardleyCoords,
): string {
  return `${nodeKind} ${renderWardleyNameToken(name)} [${coords.visibility}, ${coords.evolution}]\n`
}

export function renderWardleyLink(
  d: WardleyLinkData,
  changes: { from?: string; to?: string } = {},
): string {
  const from = changes.from !== undefined ? changes.from : d.from.name
  const to = changes.to !== undefined ? changes.to : d.to.name
  return (
    renderName(d.from, from) +
    d.arrowLead +
    d.arrow +
    d.arrowAfter +
    renderName(d.to, to) +
    d.trailing +
    d.eol
  )
}

// ---------- 编辑意图 ----------

export type WardleyIntent =
  /** 新建节点（component / anchor；坐标缺省 = [0.5, 0.5] 图正中） */
  | {
      type: 'add-node'
      nodeKind: 'component' | 'anchor'
      name: string
      coords?: WardleyCoords
      afterElementId?: string
    }
  /** 改节点名（引号风格逐字保留） */
  | { type: 'set-node-name'; elementId: string; name: string }
  /** 改节点坐标（可见度 / 演化度，原文落码） */
  | { type: 'set-node-coords'; elementId: string; visibility?: string; evolution?: string }
  /** 删除节点（级联删触及连线由管线负责） */
  | { type: 'delete-node'; elementId: string }
  /** 加连线（from / to 为名字；锚点 = from 节点行） */
  | { type: 'add-link'; from: string; to: string; afterElementId?: string }
  /** 改连线端点 */
  | { type: 'set-link'; elementId: string; from?: string; to?: string }
  /** 删除连线 */
  | { type: 'delete-link'; elementId: string }
  /** 加 evolve（目标演化度原文） */
  | { type: 'add-evolve'; name: string; target: string; afterElementId?: string }
  /** 改 evolve 目标值 */
  | { type: 'set-evolve-target'; elementId: string; target: string }
  /** 删除 evolve */
  | { type: 'delete-evolve'; elementId: string }
  /** 删除一条文档级属性行 */
  | { type: 'delete-doc-line'; elementId: string }
  /** 删除 pipeline 块（整块摘除） */
  | { type: 'delete-pipeline'; elementId: string }

/** 演化目标值校验（research 坑 2：无前导零的 `.5` 非法，无负数） */
export function isValidWardleyEvolutionTarget(value: string): boolean {
  return isValidWardleyCoord(value) && Number(value) <= 100
}

const DEFAULT_COORDS: WardleyCoords = { visibility: '0.5', evolution: '0.5' }

// ---------- 行级解析 ----------

const HEADER_RE = /^([ \t]*)(wardley-beta)([ \t\r]*)$/
const NODE_RE = /^[ \t]*(component|anchor)\b/
const EVOLVE_RE = /^[ \t]*evolve\b/
const PIPELINE_OPEN_RE = /^[ \t]*pipeline\b/
const DOC_KINDS: ReadonlyArray<{ kind: WardleyDocLineData['docKind']; re: RegExp }> = [
  { kind: 'title', re: /^[ \t]*title\b/ },
  { kind: 'size', re: /^[ \t]*size\b/ },
  { kind: 'evolution', re: /^[ \t]*evolution\b/ },
  { kind: 'annotations', re: /^[ \t]*annotations\b/ },
  { kind: 'annotation', re: /^[ \t]*annotation\b/ },
  { kind: 'note', re: /^[ \t]*note\b/ },
  { kind: 'accelerator', re: /^[ \t]*accelerator\b/ },
  { kind: 'deaccelerator', re: /^[ \t]*deaccelerator\b/ },
]

interface RawEntry {
  span: Span
  id: string
  data: WardleyElementData
}

export class WardleyParser implements DiagramParser {
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
    let nodeCount = 0
    let linkCount = 0
    let evolveCount = 0
    let docCount = 0
    let pipelineCount = 0
    let seenHeader = false
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
        const headerMatch = HEADER_RE.exec(line)
        if (headerMatch !== null) {
          seenHeader = true
          entries.push({
            span: { start: cursor, end: cursor + line.length + eol.length },
            id: 'header',
            data: {
              kind: 'wardley-header',
              keyword: headerMatch[2],
              trailing: (headerMatch[3] ?? '').replace(/\r$/, ''),
            },
          })
        } else if (trimmed.startsWith('%%')) {
          // 注释行（含 %%{init}%% 指令）：逐字保留
        } else if (seenHeader) {
          const entry = this.parseStatementLine(line, eol, cursor, {
            node: ++nodeCount,
            link: linkCount,
            evolve: evolveCount,
            doc: docCount,
          })
          if (entry !== null) {
            if (entry.data.kind === 'wardley-link') linkCount++
            else if (entry.data.kind === 'wardley-evolve') evolveCount++
            else if (entry.data.kind === 'wardley-doc') docCount++
            entries.push(entry)
          } else if (PIPELINE_OPEN_RE.test(line)) {
            // pipeline 多行块：吞到匹配的 `}`（含）——整块一个元素
            const consumed = this.consumePipelineBlock(source, cursor, line)
            pipelineCount++
            entries.push({
              span: { start: cursor, end: consumed.end },
              id: `pipeline:${pipelineCount}`,
              data: {
                kind: 'wardley-pipeline',
                parent: this.parsePipelineParent(line),
                raw: source.slice(cursor, consumed.end),
              },
            })
            if (consumed.end >= source.length) break
            cursor = consumed.end
            lineNo += consumed.lines
            continue
          }
          // 其余（无法识别的行）逐字保留
        }
        // header 之前的非注释行：不解析，逐字保留
      }

      if (nl === -1) break
      cursor = nl + 1
    }

    if (!seenHeader) {
      throw parseFailure(1, '图表必须以 wardley-beta 声明开始')
    }
    return assembleDocument(source, entries)
  }

  /** 单行语句 → 元素；不识别返回 null（逐字保留，不报错） */
  private parseStatementLine(
    line: string,
    eol: string,
    cursor: number,
    counters: { node: number; link: number; evolve: number; doc: number },
  ): RawEntry | null {
    const body = line.replace(/\r$/, '')
    const span: Span = { start: cursor, end: cursor + line.length + eol.length }

    if (NODE_RE.test(body)) {
      const node = this.parseNodeLine(body, eol)
      if (node !== null) return { span, id: `wardley-node:${counters.node}`, data: node }
      return null
    }
    if (EVOLVE_RE.test(body)) {
      const evolve = this.parseEvolveLine(body, eol)
      if (evolve !== null) return { span, id: `wardley-evolve:${counters.evolve + 1}`, data: evolve }
      return null
    }
    // 文档级属性行（title / size / evolution / …；均整行可寻址）
    for (const { kind, re } of DOC_KINDS) {
      if (re.test(body)) {
        return { span, id: `wardley-doc:${counters.doc + 1}`, data: { kind: 'wardley-doc', docKind: kind, text: body, eol } }
      }
    }
    // 连线行（可能两侧都是引号名）
    const link = this.parseLinkLine(body, eol)
    if (link !== null) return { span, id: `wardley-link:${counters.link + 1}`, data: link }
    return null
  }

  /** 节点行：`component|anchor 名 [vis, evo] 尾随` */
  private parseNodeLine(line: string, eol: string): WardleyNodeData | null {
    const m = /^[ \t]*(component|anchor)([ \t]+)(.*)$/.exec(line)
    if (m === null) return null
    const parsedName = parseName(m[3])
    if (parsedName === null) return null
    const coordsLead = /^[ \t]*/.exec(parsedName.rest)?.[0] ?? ''
    const afterLead = parsedName.rest.slice(coordsLead.length)
    const parsedCoords = parseCoords(afterLead)
    if (parsedCoords === null) return null // 无坐标不是可寻址节点行（research §3：节点须带坐标）
    return {
      kind: 'wardley-node',
      nodeKind: m[1] as 'component' | 'anchor',
      keyword: m[1],
      keywordAfter: m[2],
      name: parsedName.name,
      coordsLead,
      coords: parsedCoords.coords,
      trailing: parsedCoords.rest.replace(/[ \t\r]+$/, ''),
      eol,
    }
  }

  /** `evolve 名 目标值` */
  private parseEvolveLine(line: string, eol: string): WardleyEvolveData | null {
    const m = /^[ \t]*evolve([ \t]+)(.*)$/.exec(line)
    if (m === null) return null
    const parsedName = parseName(m[2])
    if (parsedName === null) return null
    const valueLead = /^[ \t]*/.exec(parsedName.rest)?.[0] ?? ''
    const target = parsedName.rest.slice(valueLead.length).replace(/[ \t\r]+$/, '')
    if (target === '') return null
    return { kind: 'wardley-evolve', keywordAfter: m[1], name: parsedName.name, valueLead, target, trailing: '', eol }
  }

  /** 连线行：`from 箭头 to 尾随`（位置序身份） */
  private parseLinkLine(line: string, eol: string): WardleyLinkData | null {
    const parsedFrom = parseName(line)
    if (parsedFrom === null) return null
    const arrowLead = /^[ \t]*/.exec(parsedFrom.rest)?.[0] ?? ''
    const afterLead = parsedFrom.rest.slice(arrowLead.length)
    const arrowMatch = /^(-->|-\.->|->)/.exec(afterLead)
    if (arrowMatch === null) return null
    const arrowAfterText = afterLead.slice(arrowMatch[1].length)
    const arrowAfter = /^[ \t]*/.exec(arrowAfterText)?.[0] ?? ''
    const parsedTo = parseName(arrowAfterText.slice(arrowAfter.length))
    if (parsedTo === null) return null
    // 带流向端口的连线（`+>` / `+<>` / `+'标签'>`）不是本工单分层范围，逐字保留
    const toRest = parsedTo.rest
    if (/^[ \t]*\+/.test(toRest)) return null
    if (parsedTo.name.raw === '') return null
    return {
      kind: 'wardley-link',
      from: parsedFrom.name,
      arrowLead,
      arrow: arrowMatch[1],
      arrowAfter,
      to: parsedTo.name,
      trailing: toRest.replace(/[ \t\r]+$/, ''),
      eol,
    }
  }

  /** pipeline 块的父名（`pipeline 名 {`；解析不出时用空名占位） */
  private parsePipelineParent(line: string): WardleyName {
    const m = /^[ \t]*pipeline([ \t]+)(.*)$/.exec(line)
    if (m === null) return { raw: '', name: '', quote: '' }
    const parsed = parseName(m[2])
    return parsed?.name ?? { raw: '', name: '', quote: '' }
  }

  /**
   * 吞掉 pipeline 多行块：从块首行起，按 `{` / `}` 配平计数（大小写不敏感、忽略注释行），
   * 返回块结束偏移（含 `}` 与其后换行）与消耗行数。
   */
  private consumePipelineBlock(source: string, start: number, firstLine: string): { end: number; lines: number } {
    let depth = 0
    let cursor = start
    let lines = 0
    let line = firstLine
    for (;;) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('%%')) {
        for (const ch of trimmed) {
          if (ch === '{') depth++
          else if (ch === '}') depth--
        }
      }
      lines++
      const nl = source.indexOf('\n', cursor)
      if (depth <= 0) {
        return { end: nl === -1 ? source.length : nl + 1, lines }
      }
      if (nl === -1) return { end: source.length, lines }
      cursor = nl + 1
      const nextNl = source.indexOf('\n', cursor)
      line = source.slice(cursor, nextNl === -1 ? source.length : nextNl)
    }
  }

  // ---------- 意图落地（resolveRewrites） ----------

  resolveRewrites(doc: SourceDocument, intent: EditIntent): ReadonlyMap<string, string> | null {
    switch (intent.type) {
      case 'add-node':
        return this.resolveAddNode(doc, intent as Extract<WardleyIntent, { type: 'add-node' }>)
      case 'set-node-name':
        return this.resolveSetNodeName(doc, intent as Extract<WardleyIntent, { type: 'set-node-name' }>)
      case 'set-node-coords':
        return this.resolveSetNodeCoords(doc, intent as Extract<WardleyIntent, { type: 'set-node-coords' }>)
      case 'delete-node':
        return this.resolveDeleteNode(doc, intent as Extract<WardleyIntent, { type: 'delete-node' }>)
      case 'add-link':
        return this.resolveAddLink(doc, intent as Extract<WardleyIntent, { type: 'add-link' }>)
      case 'set-link':
        return this.resolveSetLink(doc, intent as Extract<WardleyIntent, { type: 'set-link' }>)
      case 'delete-link':
        return this.removeLine(doc, intent.elementId as string, 'wardley-link')
      case 'add-evolve':
        return this.resolveAddEvolve(doc, intent as Extract<WardleyIntent, { type: 'add-evolve' }>)
      case 'set-evolve-target':
        return this.resolveSetEvolveTarget(doc, intent as Extract<WardleyIntent, { type: 'set-evolve-target' }>)
      case 'delete-evolve':
        return this.removeLine(doc, intent.elementId as string, 'wardley-evolve')
      case 'delete-doc-line':
        return this.removeLine(doc, intent.elementId as string, 'wardley-doc')
      case 'delete-pipeline':
        return this.removeLine(doc, intent.elementId as string, 'wardley-pipeline')
      default:
        return null
    }
  }

  private partOf(doc: SourceDocument, elementId: string, kind: WardleyElementData['kind']) {
    const part = getElementById(doc, elementId)
    if (part === undefined || part.element.kind !== kind) return null
    return part
  }

  /**
   * 节点定位（工单 23 定案）：**节点是名字即身份**，投影把解析期的位置序 id
   * （`wardley-node:N`）重键为 `wardley-node:名`（mermaid 的连线/evolve 都按名引用、
   * 重名会互相覆盖，名字才是稳定身份）。故编辑意图携带的 elementId 可能是
   * `wardley-node:名` 形态——此处按名回解到对应的解析期节点元素。
   * 名字含 `:`（引号名可含任意非引号字符）时，前缀剥离与名字比对仍精确。
   */
  private nodePart(doc: SourceDocument, elementId: string) {
    const direct = this.partOf(doc, elementId, 'wardley-node')
    if (direct !== null) return direct
    const NAME_PREFIX = 'wardley-node:'
    if (!elementId.startsWith(NAME_PREFIX)) return null
    const name = elementId.slice(NAME_PREFIX.length)
    const match = doc.elements.find(
      (p) => p.element.kind === 'wardley-node' && (p.element as WardleyNodeData).name.name === name,
    )
    return match ?? null
  }

  private nodeNames(doc: SourceDocument): WardleyName[] {
    return doc.elements
      .filter((p) => p.element.kind === 'wardley-node')
      .map((p) => (p.element as WardleyNodeData).name)
  }

  private hasNode(doc: SourceDocument, name: string): boolean {
    return this.nodeNames(doc).some((n) => n.name === name)
  }

  /** 通用单行移除：把该元素的 span 清空（逐字保留其余） */
  private removeLine(
    doc: SourceDocument,
    elementId: string,
    kind: WardleyElementData['kind'],
  ): Map<string, string> | null {
    const part = this.partOf(doc, elementId, kind)
    return part === null ? null : new Map([[part.id, '']])
  }

  /**
   * 锚点规范化：意图可能带 `wardley-node:名`（名字即身份的重键 id，来自投影/选中），
   * 而 `insertAfter` 只认解析期 id（`wardley-node:N`）——按名回解成解析期 id，
   * 否则会静默回退到文档末尾（插入到错误位置）。非节点锚点（解析期 id）原样透传。
   */
  private anchorId(doc: SourceDocument, afterElementId?: string): string | undefined {
    if (afterElementId === undefined) return undefined
    return this.nodePart(doc, afterElementId)?.id ?? afterElementId
  }

  private resolveAddNode(
    doc: SourceDocument,
    intent: Extract<WardleyIntent, { type: 'add-node' }>,
  ): Map<string, string> | null {
    if (!isValidWardleyName(intent.name)) return null
    const coords = intent.coords ?? DEFAULT_COORDS
    if (!isValidWardleyCoord(coords.visibility) || !isValidWardleyCoord(coords.evolution)) return null
    const line = renderNewNodeLine(intent.nodeKind, intent.name, coords)
    return insertAfter(doc, {
      afterElementId: this.anchorId(doc, intent.afterElementId),
      render: (_indent, original) => (/[\n\r]$/.test(original) ? '' : '\n') + line,
    })
  }

  private resolveSetNodeName(
    doc: SourceDocument,
    intent: Extract<WardleyIntent, { type: 'set-node-name' }>,
  ): Map<string, string> | null {
    const part = this.nodePart(doc, intent.elementId)
    if (part === null || !isValidWardleyName(intent.name)) return null
    return new Map([[part.id, renderWardleyNode(part.element as WardleyNodeData, { name: intent.name })]])
  }

  private resolveSetNodeCoords(
    doc: SourceDocument,
    intent: Extract<WardleyIntent, { type: 'set-node-coords' }>,
  ): Map<string, string> | null {
    const part = this.nodePart(doc, intent.elementId)
    if (part === null) return null
    if (intent.visibility !== undefined && !isValidWardleyCoord(intent.visibility)) return null
    if (intent.evolution !== undefined && !isValidWardleyCoord(intent.evolution)) return null
    if (intent.visibility === undefined && intent.evolution === undefined) return null
    return new Map([
      [
        part.id,
        renderWardleyNode(part.element as WardleyNodeData, {
          visibility: intent.visibility,
          evolution: intent.evolution,
        }),
      ],
    ])
  }

  /**
   * 删除节点：摘除节点行，并级联删除**名字相同**的触及连线与 evolve
   * （连线的 from/to 与 evolve 的 name 是名字引用——research §3）。
   */
  private resolveDeleteNode(
    doc: SourceDocument,
    intent: Extract<WardleyIntent, { type: 'delete-node' }>,
  ): Map<string, string> | null {
    const part = this.nodePart(doc, intent.elementId)
    if (part === null) return null
    const name = (part.element as WardleyNodeData).name.name
    const rewrites = new Map<string, string>([[part.id, '']])
    for (const p of doc.elements) {
      if (p.id === part.id) continue
      if (p.element.kind === 'wardley-link') {
        const l = p.element as WardleyLinkData
        if (l.from.name === name || l.to.name === name) rewrites.set(p.id, '')
      } else if (p.element.kind === 'wardley-evolve') {
        const e = p.element as WardleyEvolveData
        if (e.name.name === name) rewrites.set(p.id, '')
      }
    }
    return rewrites
  }

  private resolveAddLink(
    doc: SourceDocument,
    intent: Extract<WardleyIntent, { type: 'add-link' }>,
  ): Map<string, string> | null {
    if (!isValidWardleyName(intent.from) || !isValidWardleyName(intent.to)) return null
    // 两端名字必须存在于节点（mermaid 按名引用；不产出悬空连线）
    if (!this.hasNode(doc, intent.from) || !this.hasNode(doc, intent.to)) return null
    const line = `${renderWardleyNameToken(intent.from)} -> ${renderWardleyNameToken(intent.to)}\n`
    return insertAfter(doc, {
      afterElementId: this.anchorId(doc, intent.afterElementId),
      render: (_indent, original) => (/[\n\r]$/.test(original) ? '' : '\n') + line,
    })
  }

  private resolveSetLink(
    doc: SourceDocument,
    intent: Extract<WardleyIntent, { type: 'set-link' }>,
  ): Map<string, string> | null {
    const part = this.partOf(doc, intent.elementId, 'wardley-link')
    if (part === null) return null
    if (intent.from !== undefined) {
      if (!isValidWardleyName(intent.from) || !this.hasNode(doc, intent.from)) return null
    }
    if (intent.to !== undefined) {
      if (!isValidWardleyName(intent.to) || !this.hasNode(doc, intent.to)) return null
    }
    if (intent.from === undefined && intent.to === undefined) return null
    return new Map([
      [part.id, renderWardleyLink(part.element as WardleyLinkData, { from: intent.from, to: intent.to })],
    ])
  }

  private resolveAddEvolve(
    doc: SourceDocument,
    intent: Extract<WardleyIntent, { type: 'add-evolve' }>,
  ): Map<string, string> | null {
    if (!isValidWardleyName(intent.name) || !this.hasNode(doc, intent.name)) return null
    if (!isValidWardleyEvolutionTarget(intent.target)) return null
    const line = `evolve ${renderWardleyNameToken(intent.name)} ${intent.target}\n`
    return insertAfter(doc, {
      afterElementId: this.anchorId(doc, intent.afterElementId),
      render: (_indent, original) => (/[\n\r]$/.test(original) ? '' : '\n') + line,
    })
  }

  private resolveSetEvolveTarget(
    doc: SourceDocument,
    intent: Extract<WardleyIntent, { type: 'set-evolve-target' }>,
  ): Map<string, string> | null {
    const part = this.partOf(doc, intent.elementId, 'wardley-evolve')
    if (part === null || !isValidWardleyEvolutionTarget(intent.target)) return null
    const d = part.element as WardleyEvolveData
    return new Map([
      [
        part.id,
        `evolve${d.keywordAfter}${renderName(d.name, d.name.name)}${d.valueLead}${intent.target}${d.eol}`,
      ],
    ])
  }
}

export const wardleyParser = new WardleyParser()
