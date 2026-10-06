import { assembleDocument, getElementById, type SourceDocument } from './document'
import type { DiagramParser, EditIntent, ParseResult, SourceParseError } from './parser'
import { frontmatterEnd } from './frontmatter'
import {
  architectureGroupElementId,
  architectureJunctionElementId,
  architectureServiceElementId,
} from './element-id'
import type { Span } from './span'
import { indentLines, insertAfter } from './insert'

/**
 * architecture-beta 完整解析器（more-diagrams 工单 17，语法事实以
 * .scratch/more-diagrams/research/data-display.md §8 为准——并已离线核对
 * @mermaid-js/parser 的 ArchitectureGrammar 与 mermaid 12 渲染器源码）：
 * 手写、逐行、带 span（ADR-0004）。可测试承诺：解析后不做修改再重组装，
 * 输出与输入逐字相同（verbatim identity）。
 *
 * 覆盖（分层对齐，工单定案）：
 * - `group id(icon)[title] [in parent]`、`service id(icon)[title] [in parent]`
 *   （icon / title / in 各段可省；icon 另有 `("文本")` 文本图标形态，逐字保留不解析）
 * - `junction id [in parent]`
 * - 边：`a:R -- L:b` / `a --> b` / `a <-- b` / 组级 `a{group}:B --> T:b{group}`、
 *   `-label-` 带标签形态（label 含 `-` 的行保持 verbatim）
 * - `align row|column a b [c ...]`（≥2 个成员）
 * - title / accTitle / accDescr 行逐字保留（清单外，ADR-0008）
 *
 * 不解析、原样保留：frontmatter、`%%` 注释、`%%{init}%%` 指令、无法识别的行。
 * config（seed / nodeSeparation 等）在 frontmatter 里，本票不做表单化编辑（工单明确）。
 *
 * 语义事实（离线核对 mermaid 12 db）：service / group / junction 共享**一个 id 命名空间**
 * （registeredIds，重名抛错）；边端点必须是已声明的 service / junction（group 不能直接作
 * 端点）；`{group}` 标记要求该端点 service 真的 `in` 某个组。这些在 resolveRewrites 落地侧
 * 把关——源码始终合法（工单验收要求）；解析本身保持宽松（既有源码结构可读即可）。
 *
 * span 约定：元素 span 从该行首个非空白字符起、到行尾（不含换行）；行首缩进与换行留在 verbatim。
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

export interface ArchitectureHeaderData {
  kind: 'architecture-header'
  /** 原文关键字（architecture-beta），逐字保留 */
  keyword: string
  trailing: string
}

/** in 子句的原文段：`in` 前后空白与父 id */
export interface ArchInClause {
  gapBefore: string
  parent: string
}

/** `service id(icon)[title] in parent` / `group ...` 的声明行。
 * iconRaw / titleRaw 是含定界符的原文（`(cloud)` / `[标题]`），未设为 null。 */
export interface ArchNodeDeclData {
  kind: 'architecture-node-decl'
  /** 关键字（service / group / junction），逐字保留 */
  keyword: 'service' | 'group' | 'junction'
  /** 关键字与 id 之间的空白 */
  gap: string
  id: string
  iconRaw: string | null
  titleRaw: string | null
  inClause: ArchInClause | null
  /** 行尾原文（尾随空白 / 注释），逐字保留 */
  trailing: string
}

/** 边语句。箭头 `<`/`>` 独立记录（mermaid 语法：箭头贴在 `--` 的哪一侧就指向哪一端）。 */
export interface ArchEdgeData {
  kind: 'architecture-edge'
  from: string
  fromGroupRaw: string | null
  fromPort: ArchPort | null
  /** fromPort 与箭头/`--` 之间的空白 */
  gap1: string
  fromArrow: boolean
  /** `<`/`--` 之间的空白（箭头紧贴 `--` 的书写形态下为 ''） */
  gap2: string
  toArrow: boolean
  /** 箭头与端口/id 之间的空白（`--> L:b` 形态下为 ' '） */
  gapArrow: string
  toPort: ArchPort | null
  /** 端口与 to id 之间的空白 */
  gap3: string
  to: string
  toGroupRaw: string | null
  trailing: string
}

export type ArchPort = 'T' | 'B' | 'L' | 'R'

/** 方向端口原文 → 端口枚举；非法字母 null */
export function parseArchPort(text: string): ArchPort | null {
  return text === 'T' || text === 'B' || text === 'L' || text === 'R' ? text : null
}

/** 边箭头语义：none = 直线，source = 箭头指起点，target = 箭头指终点，both = 双向 */
export type ArchArrow = 'none' | 'source' | 'target' | 'both'

export function arrowOf(d: { fromArrow: boolean; toArrow: boolean }): ArchArrow {
  if (d.fromArrow && d.toArrow) return 'both'
  if (d.fromArrow) return 'source'
  if (d.toArrow) return 'target'
  return 'none'
}

/** 边行重建：未改动的空白段逐字拼回（gap1 = `--` 左侧、gap2 = 箭头左侧、gapArrow = 箭头右侧、gap3 = 端口与 to 之间） */
export function renderArchEdgeLine(d: ArchEdgeData, changes: { fromPort?: ArchPort | null; toPort?: ArchPort | null; arrow?: ArchArrow } = {}): string {
  const fromPort = changes.fromPort !== undefined ? changes.fromPort : d.fromPort
  const toPort = changes.toPort !== undefined ? changes.toPort : d.toPort
  const arrow = changes.arrow ?? arrowOf(d)
  const fromArrow = arrow === 'source' || arrow === 'both'
  const toArrow = arrow === 'target' || arrow === 'both'
  let s = `${d.from}${d.fromGroupRaw ?? ''}`
  s += fromPort !== null ? `:${fromPort}` : ''
  s += `${d.gap1}${fromArrow ? '<' : ''}--${d.gap2}${toArrow ? '>' : ''}`
  s += d.gapArrow
  s += toPort !== null ? `${toPort}:` : ''
  s += `${d.gap3}${d.to}${d.toGroupRaw ?? ''}${d.trailing}`
  return s
}

/** `align row a b c`。members ≥ 2（mermaid 语法要求） */
export interface ArchAlignData {
  kind: 'architecture-align'
  gap: string
  direction: 'row' | 'column'
  /** 方向与成员之间、成员之间的空白（members.length = memberGaps.length + 1） */
  memberGaps: string[]
  members: string[]
  trailing: string
}

export function renderArchAlign(d: ArchAlignData): string {
  let s = `align${d.gap}${d.direction}`
  d.members.forEach((m, i) => {
    s += `${d.memberGaps[i]}${m}`
  })
  return s + d.trailing
}

export type ArchitectureElementData =
  | ArchitectureHeaderData
  | ArchNodeDeclData
  | ArchEdgeData
  | ArchAlignData

// ---------- 行级解析 ----------

const HEADER_RE = /^([ \t]*)(architecture-beta)([ \t]*)$/
/** mermaid ID 词法：`[\w]([-\w]*\w)?`（\w = 字母数字下划线） */
const ID_RE = /^[A-Za-z0-9_](?:[A-Za-z0-9_-]*[A-Za-z0-9_])?$/
const DIR_RE = /^[TBLR]$/

/** 新建元素 id 的合法性（与 mermaid ID 词法同口径） */
export function isValidArchId(id: string): boolean {
  return ID_RE.test(id)
}

/** 标题合法性：非空、不含方括号与换行（ARCH_TITLE 词法的白名单化） */
export function isValidArchTitle(title: string): boolean {
  return title !== '' && !/[[\]\r\n]/.test(title)
}

/** 图标合法性：内置枚举五个或 `pack:icon-name` 自由串（ARCH_ICON 词法 `([\w-:]+)`） */
export const ARCH_BUILTIN_ICONS = ['cloud', 'database', 'disk', 'internet', 'server'] as const
export function isValidArchIcon(icon: string): boolean {
  return /^[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)?$/.test(icon)
}

/** 剥定界符：`(cloud)` → cloud、`[标题]` → 标题（含引号时去引号） */
export function archIconText(iconRaw: string): string {
  return iconRaw.replace(/^\(/, '').replace(/\)$/, '')
}
export function archTitleText(titleRaw: string): string {
  const inner = titleRaw.replace(/^\[/, '').replace(/\]$/, '')
  if ((inner.startsWith('"') && inner.endsWith('"')) || (inner.startsWith("'") && inner.endsWith("'"))) {
    return inner.slice(1, -1)
  }
  return inner
}

interface RawEntry {
  span: Span
  id: string
  data: ArchitectureElementData
}

/** 供 resolveRewrites 重建声明行的最小数据（render 用） */
export function renderArchNodeDecl(d: ArchNodeDeclData, changes: { icon?: string | null; title?: string | null; parent?: string | null } = {}): string {
  let s = `${d.keyword}${d.gap}${d.id}`
  const icon = changes.icon !== undefined ? changes.icon : (d.iconRaw !== null ? archIconText(d.iconRaw) : null)
  if (icon !== null) s += `(${icon})`
  const title = changes.title !== undefined ? changes.title : (d.titleRaw !== null ? archTitleText(d.titleRaw) : null)
  if (title !== null) s += `[${title}]`
  const parent = changes.parent !== undefined ? changes.parent : (d.inClause !== null ? d.inClause.parent : null)
  if (parent !== null) s += ` in ${parent}`
  return s + d.trailing
}

function parseNodeDeclLine(
  keyword: 'service' | 'group' | 'junction',
  line: string,
  firstChar: number,
): ArchNodeDeclData | null {
  const kwRe = new RegExp(`^${keyword}([ \\t]+)(.*)$`)
  const m = kwRe.exec(line.slice(firstChar))
  if (m === null) return null
  let rest = m[2]
  const trailing = /[ \t\r]+$/.exec(rest)?.[0] ?? ''
  rest = rest.slice(0, rest.length - trailing.length)

  // in 子句：尾部的 ` in <id>`（父 id 之后只允许尾随空白，已被 trailing 剥掉）
  let inClause: ArchInClause | null = null
  const inMatch = /(?:^|[ \t])in([ \t]+)([A-Za-z0-9_](?:[A-Za-z0-9_-]*[A-Za-z0-9_])?)$/.exec(rest)
  if (inMatch !== null) {
    inClause = { gapBefore: inMatch[0].slice(0, inMatch[0].length - inMatch[1].length - inMatch[2].length), parent: inMatch[2] }
    rest = rest.slice(0, rest.length - inMatch[0].length)
  }

  // id：首个 token
  const idMatch = /^[A-Za-z0-9_](?:[A-Za-z0-9_-]*[A-Za-z0-9_])?/.exec(rest)
  if (idMatch === null) return null
  const id = idMatch[0]
  rest = rest.slice(id.length)

  // icon：`(...)`；文本图标 `("...")` 不解析（保持 iconRaw 原文逐字保留亦可——ARCH_ICON 不含引号，
  // 带引号形态整行保持 verbatim：这里只接 `(\w-:)+` 词法）
  let iconRaw: string | null = null
  const iconMatch = /^([ \t]*)(\([A-Za-z0-9_:-]+\))/.exec(rest)
  if (iconMatch !== null) {
    iconRaw = iconMatch[2]
    rest = rest.slice(iconMatch[0].length)
  }

  // title：`[...]`（ARCH_TITLE：引号串或非方括号字符）
  let titleRaw: string | null = null
  const titleMatch = /^([ \t]*)(\[(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^[\]\r\n]+)\])/.exec(rest)
  if (titleMatch !== null) {
    titleRaw = titleMatch[2]
    rest = rest.slice(titleMatch[0].length)
  }

  if (rest !== '') return null // 残留无法识别的内容 → 整行 verbatim
  return { kind: 'architecture-node-decl', keyword, gap: m[1], id, iconRaw, titleRaw, inClause, trailing }
}

/** 边语句：`from{group}?:P < ? -- > ? P?: to{group}?`（空白逐字入 gap）。
 * **方向端口两侧必需**（离线实测 mermaid 12：`a -- b` / `a -- L:b` / `a:R -- b` 都词法报错
 * 「Expecting token of type ':'」——Langium 语法里 LeftPort / RightPort 无 '?' 卡贝利蒂）。 */
function parseEdgeLine(line: string, firstChar: number): ArchEdgeData | null {
  const s = line.slice(firstChar)
  let i = 0
  const ws = () => {
    const start = i
    while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i++
    return s.slice(start, i)
  }
  ws()
  const id1 = /^[A-Za-z0-9_](?:[A-Za-z0-9_-]*[A-Za-z0-9_])?/.exec(s.slice(i))
  if (id1 === null) return null
  const from = id1[0]
  i += from.length
  const fromGroupRaw = /^\{group\}/.exec(s.slice(i))?.[0] ?? null
  if (fromGroupRaw !== null) i += fromGroupRaw.length
  let fromPort: ArchPort | null = null
  const port1 = /^:([TBRL])/.exec(s.slice(i))
  if (port1 !== null) {
    fromPort = port1[1] as ArchPort
    i += port1[0].length
  }
  const gap1 = ws()
  const fromArrow = s[i] === '<'
  if (fromArrow) i++
  if (s.slice(i, i + 2) !== '--') return null
  if (fromPort === null) return null // 左端口必需（见函数头注释），缺失整行 verbatim
  i += 2
  const gap2 = ws()
  const toArrow = s[i] === '>'
  if (toArrow) i++
  const gapArrow = ws()
  let toPort: ArchPort | null = null
  const port2 = /^([TBRL]):/.exec(s.slice(i))
  if (port2 !== null) {
    toPort = port2[1] as ArchPort
    i += port2[0].length
  }
  const gap3 = toPort !== null ? ws() : gapArrow
  const id2 = /^[A-Za-z0-9_](?:[A-Za-z0-9_-]*[A-Za-z0-9_])?/.exec(s.slice(i))
  if (id2 === null || toPort === null) return null // 右端口同样必需（缺失整行 verbatim）
  const to = id2[0]
  i += to.length
  const toGroupRaw = /^\{group\}/.exec(s.slice(i))?.[0] ?? null
  if (toGroupRaw !== null) i += toGroupRaw.length
  const tail = s.slice(i)
  if (tail.trim() !== '') return null // 残留（-label- 形态等）→ 整行 verbatim
  return {
    kind: 'architecture-edge',
    from,
    fromGroupRaw,
    fromPort,
    gap1,
    fromArrow,
    gap2,
    toArrow,
    gapArrow: toPort !== null ? gapArrow : '',
    toPort,
    gap3,
    to,
    toGroupRaw,
    trailing: tail,
  }
}

function parseAlignLine(line: string, firstChar: number): ArchAlignData | null {
  const m = /^align([ \t]+)(row|column)((?:[ \t]+[A-Za-z0-9_](?:[A-Za-z0-9_-]*[A-Za-z0-9_])?)+)[ \t\r]*$/.exec(line.slice(firstChar))
  if (m === null) return null
  const memberGaps = m[3].match(/^[ \t]+|[ \t]+/g) ?? []
  const members = m[3].trim().split(/[ \t]+/)
  if (members.length < 2 || memberGaps.length !== members.length) return null
  return {
    kind: 'architecture-align',
    gap: m[1],
    direction: m[2] as 'row' | 'column',
    memberGaps,
    members,
    trailing: '',
  }
}

interface Counters {
  edge: number
  align: number
}

export class ArchitectureParser implements DiagramParser {
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
    const counters: Counters = { edge: 0, align: 0 }
    let seenHeader = false
    // 文首 frontmatter 块（config）不参与解析，整体 verbatim 保留（工单：不做 config 编辑）
    const bodyStart = frontmatterEnd(source)
    let lineNo = bodyStart === 0 ? 0 : source.slice(0, bodyStart).split('\n').length - 1
    let cursor = bodyStart

    for (;;) {
      const nl = source.indexOf('\n', cursor)
      const lineEnd = nl === -1 ? source.length : nl
      const line = source.slice(cursor, lineEnd)
      lineNo++
      const trimmed = line.trim()

      if (trimmed !== '' && !trimmed.startsWith('%%')) {
        if (!seenHeader) {
          const header = HEADER_RE.exec(line)
          if (header === null) {
            throw parseFailure(lineNo, '图表必须以 architecture-beta 声明开始')
          }
          seenHeader = true
          entries.push({
            span: { start: cursor, end: cursor + line.length },
            id: 'header',
            data: { kind: 'architecture-header', keyword: header[2], trailing: header[3] ?? '' },
          })
        } else {
          const firstChar = line.length - line.trimStart().length
          const span = { start: cursor + firstChar, end: cursor + line.length }
          const service = parseNodeDeclLine('service', line, firstChar)
          if (service !== null) {
            entries.push({ span, id: architectureServiceElementId(service.id), data: service })
          } else {
            const group = parseNodeDeclLine('group', line, firstChar)
            if (group !== null) {
              entries.push({ span, id: architectureGroupElementId(group.id), data: group })
            } else {
              const junction = parseNodeDeclLine('junction', line, firstChar)
              if (junction !== null) {
                entries.push({ span, id: architectureJunctionElementId(junction.id), data: junction })
              } else {
                const edge = parseEdgeLine(line, firstChar)
                if (edge !== null) {
                  counters.edge++
                  entries.push({ span, id: `edge:${counters.edge}`, data: edge })
                } else {
                  const align = parseAlignLine(line, firstChar)
                  if (align !== null) {
                    counters.align++
                    entries.push({ span, id: `align:${counters.align}`, data: align })
                  }
                  // 其余（title / accTitle / accDescr / 注释 / 生僻语法）不解析，逐字保留
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
      throw parseFailure(1, '图表必须以 architecture-beta 声明开始')
    }
    return assembleDocument(source, entries)
  }

  // ---------- 意图落地（resolveRewrites） ----------

  resolveRewrites(doc: SourceDocument, intent: EditIntent): ReadonlyMap<string, string> | null {
    const it = intent as ArchitectureIntent
    switch (it.type) {
      case 'add-service':
        return this.resolveAddNode(doc, 'service', it)
      case 'add-group':
        return this.resolveAddNode(doc, 'group', it)
      case 'add-junction':
        return this.resolveAddNode(doc, 'junction', it)
      case 'set-service-title':
        return this.resolveSetTitle(doc, 'service', it.id, it.title)
      case 'set-group-title':
        return this.resolveSetTitle(doc, 'group', it.id, it.title)
      case 'set-service-icon':
        return this.resolveSetIcon(doc, it.id, it.icon)
      case 'set-service-parent':
        return this.resolveSetParent(doc, 'service', it.id, it.parent)
      case 'set-junction-parent':
        return this.resolveSetParent(doc, 'junction', it.id, it.parent)
      case 'set-group-parent':
        return this.resolveSetParent(doc, 'group', it.id, it.parent)
      case 'delete-service':
        return this.resolveDeleteNode(doc, 'service', it.id)
      case 'delete-group':
        return this.resolveDeleteGroup(doc, it.id)
      case 'delete-junction':
        return this.resolveDeleteNode(doc, 'junction', it.id)
      case 'add-edge':
        return this.resolveAddEdge(doc, it)
      case 'set-edge-port':
        return this.resolveSetEdgePort(doc, it.elementId, it.side, it.port)
      case 'set-edge-arrow':
        return this.resolveSetEdgeArrow(doc, it.elementId, it.arrow)
      case 'delete-edge':
        return this.resolveDeleteByElementId(doc, 'architecture-edge', it.elementId)
      case 'delete-align':
        return this.resolveDeleteByElementId(doc, 'architecture-align', it.elementId)
      default:
        return null
    }
  }

  /** 三类节点 id 的声明 part（名字即身份：mermaid registeredIds 全局唯一） */
  private declOf(doc: SourceDocument, keyword: 'service' | 'group' | 'junction', id: string) {
    const elementId =
      keyword === 'service'
        ? architectureServiceElementId(id)
        : keyword === 'group'
          ? architectureGroupElementId(id)
          : architectureJunctionElementId(id)
    const part = getElementById(doc, elementId)
    if (part === undefined || part.element.kind !== 'architecture-node-decl') return null
    return part.element as ArchNodeDeclData
  }

  private usedIds(doc: SourceDocument): Set<string> {
    const used = new Set<string>()
    for (const part of doc.elements) {
      if (part.element.kind === 'architecture-node-decl') {
        used.add((part.element as ArchNodeDeclData).id)
      }
    }
    return used
  }

  private resolveAddNode(
    doc: SourceDocument,
    keyword: 'service' | 'group' | 'junction',
    intent: { id: string; icon?: string; title?: string; parent?: string; afterElementId?: string },
  ): Map<string, string> | null {
    if (!isValidArchId(intent.id)) return null
    if (this.usedIds(doc).has(intent.id)) return null
    if (intent.icon !== undefined && (intent.icon === '' || !isValidArchIcon(intent.icon))) return null
    if (intent.title !== undefined && intent.title !== '' && !isValidArchTitle(intent.title)) return null
    let parent: string | null = null
    if (intent.parent !== undefined) {
      // 父必须是已声明的 group（mermaid db：父先于子声明，否则渲染报错）
      const parentDecl = this.declOf(doc, 'group', intent.parent)
      if (parentDecl === null) return null
      parent = intent.parent
    }
    const icon = intent.icon !== undefined && intent.icon !== '' ? intent.icon : null
    const title = intent.title !== undefined && intent.title !== '' ? intent.title : null
    // 锚点：给定了 afterElementId 用之；有父时缺省锚到父声明（父先于子，源码保持合法）；
    // 都没有回退文档最后一个元素（insertAfter 语义）
    const anchor =
      intent.afterElementId ??
      (parent !== null ? architectureGroupElementId(parent) : undefined)
    return insertAfter(doc, {
      afterElementId: anchor,
      render: (indent) =>
        indentLines(indent, [renderArchNodeDecl({ kind: 'architecture-node-decl', keyword, gap: ' ', id: intent.id, iconRaw: null, titleRaw: null, inClause: null, trailing: '' }, { icon, title, parent })]),
    })
  }

  private resolveSetTitle(doc: SourceDocument, keyword: 'service' | 'group', id: string, title: string | null): Map<string, string> | null {
    const part = getElementById(
      doc,
      keyword === 'service' ? architectureServiceElementId(id) : architectureGroupElementId(id),
    )
    if (part === undefined || part.element.kind !== 'architecture-node-decl') return null
    if (title !== null && !isValidArchTitle(title)) return null
    return new Map([[part.id, renderArchNodeDecl(part.element as ArchNodeDeclData, { title })]])
  }

  private resolveSetIcon(doc: SourceDocument, id: string, icon: string | null): Map<string, string> | null {
    const part = getElementById(doc, architectureServiceElementId(id))
    if (part === undefined || part.element.kind !== 'architecture-node-decl') return null
    if (icon !== null && !isValidArchIcon(icon)) return null
    return new Map([[part.id, renderArchNodeDecl(part.element as ArchNodeDeclData, { icon })]])
  }

  private resolveSetParent(
    doc: SourceDocument,
    keyword: 'service' | 'junction' | 'group',
    id: string,
    parent: string | null,
  ): Map<string, string> | null {
    const part = getElementById(
      doc,
      keyword === 'service'
        ? architectureServiceElementId(id)
        : keyword === 'junction'
          ? architectureJunctionElementId(id)
          : architectureGroupElementId(id),
    )
    if (part === undefined || part.element.kind !== 'architecture-node-decl') return null
    if (parent !== null) {
      if (parent === id) return null // 不能放进自己（mermaid db 同款校验）
      if (this.declOf(doc, 'group', parent) === null) return null
    }
    return new Map([[part.id, renderArchNodeDecl(part.element as ArchNodeDeclData, { parent })]])
  }

  /** 删 service / junction：删声明行 + 触及边 + 引用它的 align（级联由管线负责，工单定案） */
  private resolveDeleteNode(doc: SourceDocument, keyword: 'service' | 'junction', id: string): Map<string, string> | null {
    const decl = this.declOf(doc, keyword, id)
    if (decl === null) return null
    const rewrites = new Map<string, string>()
    for (const part of doc.elements) {
      const data = part.element
      if (data.kind === 'architecture-node-decl' && (data as ArchNodeDeclData).id === id && (data as ArchNodeDeclData).keyword === keyword) {
        rewrites.set(part.id, '')
      } else if (data.kind === 'architecture-edge') {
        const e = data as ArchEdgeData
        if (e.from === id || e.to === id) rewrites.set(part.id, '')
      } else if (data.kind === 'architecture-align') {
        if ((data as ArchAlignData).members.includes(id)) rewrites.set(part.id, '')
      }
    }
    return rewrites.size > 0 ? rewrites : null
  }

  /** 删 group：删声明行 + 直属成员的 `in` 子句摘掉（成员回到顶层，源码保持合法） */
  private resolveDeleteGroup(doc: SourceDocument, id: string): Map<string, string> | null {
    const decl = this.declOf(doc, 'group', id)
    if (decl === null) return null
    const declPart = getElementById(doc, architectureGroupElementId(id))
    if (declPart === undefined) return null
    const rewrites = new Map<string, string>([[declPart.id, '']])
    for (const part of doc.elements) {
      const data = part.element
      if (data.kind === 'architecture-node-decl') {
        const node = data as ArchNodeDeclData
        if (node.inClause !== null && node.inClause.parent === id) {
          rewrites.set(part.id, renderArchNodeDecl(node, { parent: null }))
        }
      }
      // align 成员引用不受组删除影响（成员仍在，源码仍合法），不动
    }
    return rewrites
  }

  /** 加边：端点必须是已声明的 service / junction（group 不能直接作端点——工单端点校验）；
   * 方向端口两侧必需（mermaid 词法） */
  private resolveAddEdge(
    doc: SourceDocument,
    intent: { from: string; to: string; fromPort?: ArchPort; toPort?: ArchPort; arrow?: ArchArrow; afterElementId?: string },
  ): Map<string, string> | null {
    if (!this.isEndpoint(doc, intent.from) || !this.isEndpoint(doc, intent.to)) return null
    if (intent.fromPort === undefined || intent.toPort === undefined) return null
    if (!DIR_RE.test(intent.fromPort) || !DIR_RE.test(intent.toPort)) return null
    const arrow = intent.arrow ?? 'none'
    if (arrow !== 'none' && arrow !== 'source' && arrow !== 'target' && arrow !== 'both') return null
    const fromArrow = arrow === 'source' || arrow === 'both'
    const toArrow = arrow === 'target' || arrow === 'both'
    const data: ArchEdgeData = {
      kind: 'architecture-edge',
      from: intent.from,
      fromGroupRaw: null,
      fromPort: intent.fromPort,
      // 新边空白口径：`from:R --> L:to` / `from:R <-- L:to` / `from:R -- L:to`
      gap1: ' ',
      fromArrow,
      gap2: '',
      toArrow,
      gapArrow: ' ',
      toPort: intent.toPort,
      gap3: '',
      to: intent.to,
      toGroupRaw: null,
      trailing: '',
    }
    return insertAfter(doc, {
      afterElementId: intent.afterElementId,
      render: (indent) => indentLines(indent, [renderArchEdgeLine(data)]),
    })
  }

  /** 边端点合法性：已声明的 service / junction（含 junction 中转）；group 直接作端点非法 */
  private isEndpoint(doc: SourceDocument, id: string): boolean {
    return (
      this.declOf(doc, 'service', id) !== null ||
      this.declOf(doc, 'junction', id) !== null
    )
  }

  private resolveSetEdgePort(
    doc: SourceDocument,
    elementId: string,
    side: 'from' | 'to',
    port: ArchPort,
  ): Map<string, string> | null {
    const part = getElementById(doc, elementId)
    if (part === undefined || part.element.kind !== 'architecture-edge') return null
    if (!DIR_RE.test(port)) return null
    const changes = side === 'from' ? { fromPort: port } : { toPort: port }
    return new Map([[part.id, renderArchEdgeLine(part.element as ArchEdgeData, changes)]])
  }

  private resolveSetEdgeArrow(doc: SourceDocument, elementId: string, arrow: ArchArrow): Map<string, string> | null {
    const part = getElementById(doc, elementId)
    if (part === undefined || part.element.kind !== 'architecture-edge') return null
    if (arrow !== 'none' && arrow !== 'source' && arrow !== 'target' && arrow !== 'both') return null
    const data = part.element as ArchEdgeData
    const wasToArrow = data.toArrow
    const toArrow = arrow === 'target' || arrow === 'both'
    // 右侧箭头的空白再分配（改写时才规范化，未触碰空白仍逐字）：
    // 加 `>` → 原 `--` 右侧空白让位到箭头之后（`-- L:b` → `--> L:b`）；
    // 去 `>` → 反向移回（`--> L:b` → `-- L:b`）。
    let next = data
    if (toArrow !== wasToArrow) {
      next = toArrow
        ? { ...data, toArrow, gap2: '', gapArrow: data.gap2 + data.gapArrow }
        : { ...data, toArrow, gap2: data.gap2 + data.gapArrow, gapArrow: '' }
    } else {
      next = { ...data, toArrow }
    }
    return new Map([[part.id, renderArchEdgeLine(next, { arrow })]])
  }

  private resolveDeleteByElementId(doc: SourceDocument, kind: string, elementId: string): Map<string, string> | null {
    const part = getElementById(doc, elementId)
    if (part === undefined || part.element.kind !== kind) return null
    return new Map([[part.id, '']])
  }
}

export const architectureParser = new ArchitectureParser()

// ---------- 编辑意图（工单 17 表单/画布所需集合） ----------

export type ArchitectureIntent =
  /** 新增 service / group / junction 声明行（parent 必须是已声明的 group；缺省锚到父声明或文档末尾） */
  | { type: 'add-service'; id: string; icon?: string; title?: string; parent?: string; afterElementId?: string }
  | { type: 'add-group'; id: string; icon?: string; title?: string; parent?: string; afterElementId?: string }
  | { type: 'add-junction'; id: string; parent?: string; afterElementId?: string }
  /** 改 service / group 标题；null = 去掉 [title]（显示回落 id） */
  | { type: 'set-service-title'; id: string; title: string | null }
  | { type: 'set-group-title'; id: string; title: string | null }
  /** 改 service 图标；null = 去掉 (icon) */
  | { type: 'set-service-icon'; id: string; icon: string | null }
  /** 移入 / 移出分组；null = 回到顶层（in 子句；组可嵌套，父必须是已声明的 group） */
  | { type: 'set-service-parent'; id: string; parent: string | null }
  | { type: 'set-junction-parent'; id: string; parent: string | null }
  | { type: 'set-group-parent'; id: string; parent: string | null }
  /** 删除节点（service / junction 级联删触及边与 align；group 级联把成员摘回顶层） */
  | { type: 'delete-service'; id: string }
  | { type: 'delete-group'; id: string }
  | { type: 'delete-junction'; id: string }
  /** 新增边（端点必须是已声明的 service / junction；方向端口两侧必需——mermaid 词法） */
  | {
      type: 'add-edge'
      from: string
      to: string
      fromPort: ArchPort
      toPort: ArchPort
      arrow?: ArchArrow
      afterElementId?: string
    }
  /** 改边方向端口（四向枚举；端口不可删——两侧必需） */
  | { type: 'set-edge-port'; elementId: string; side: 'from' | 'to'; port: ArchPort }
  /** 改边箭头（none / source / target / both） */
  | { type: 'set-edge-arrow'; elementId: string; arrow: ArchArrow }
  | { type: 'delete-edge'; elementId: string }
  | { type: 'delete-align'; elementId: string }
