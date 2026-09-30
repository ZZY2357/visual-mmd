import { assembleDocument, getElementById, type SourceDocument } from './document'
import type { DiagramParser, EditIntent, ParseResult, SourceParseError } from './parser'
import { frontmatterEnd } from './frontmatter'
import { withOccurrence } from './element-id'
import type { Span } from './span'
import { indentLines, insertAfter, resolveAnchor } from './insert'

/**
 * gitGraph 完整解析器（more-diagrams 工单 04，语法事实以
 * spec 的 research/state-er-gitgraph.md gitGraph 部分为准）：
 * 手写、逐行、带 span（ADR-0004）。可测试承诺：解析后不做修改再重组装，
 * 输出与输入逐字相同（verbatim identity）。
 *
 * 覆盖（分层对齐，spec 决策）：
 * - 表头方向：`gitGraph` / `gitGraph LR:` / `TB:` / `BT:`（默认 LR）
 * - `commit`（id / tag / type 参数）
 * - `branch`（含 order 参数、引号名——mermaid 对关键字名分支要求引号）
 * - `checkout` / `switch`（等价关键字）
 * - `merge`（id / tag / type 参数）
 * - `cherry-pick`（id / parent 参数）
 *
 * 不解析、原样保留（清单外语法不报错，ADR-0008）：frontmatter、`%%` 注释、
 * 无法识别的行（gitGraph 无 classDef/style 语句——spec 勘察事实，无需样式保留清单）。
 *
 * span 约定（与 state 解析器同口径）：元素 span 从该行首个非空白字符起、到行尾
 * （不含换行）；行首缩进与换行留在 verbatim。
 *
 * 语句序即拓扑（工单定案）：gitGraph 的分支归属由「当前分支追踪」隐式产生，
 * 全部编辑是语句序列的增删改（追加与 insertAfter 锚点插入），不提供重排拓扑。
 * 落码侧负责语义校验（checkout 不存在的分支、自合并、cherry-pick 引用缺失等
 * 都是 mermaid 渲染错误）——「源码始终是合法 mermaid」：解析失败的编辑禁止落码。
 */

interface ParseFailure extends Error {
  line: number
}

function parseFailure(line: number, message: string): ParseFailure {
  const error = new Error(message) as ParseFailure
  error.line = line
  return error
}

// ---------- 参数（id: / tag: / type: / order: / parent:） ----------

/** 一条 `key: value` 参数：间隙与引号逐字保留，编辑时按序改写/增删 */
export interface GitgraphParam {
  /** 参数名（小写规范化：id / tag / type / order / parent） */
  key: string
  /** 参数名与值之间的原文（`:` 及两侧空白） */
  colonRaw: string
  /** 引号字符（" / '）；裸值为 '' */
  quote: string
  /** 参数值原文（去引号） */
  value: string
  /** 值之后到下一个参数（或行尾）之间的空白 */
  after: string
}

export function renderGitgraphParams(params: GitgraphParam[]): string {
  return params.map((p) => `${p.key}${p.colonRaw}${p.quote}${p.value}${p.quote}${p.after}`).join('')
}

/**
 * 参数编辑后的渲染：changes 按 key 覆盖值（null = 删除该参数）；
 * 新 key 追加到末尾（` order: 2` 规范化单空格）。
 * 编辑行的内部空白规范化为既有参数原文（只动被编辑的值），新增参数用单空格。
 */
export function renderParamsWith(
  params: GitgraphParam[],
  changes: Record<string, string | number | null | undefined> = {},
): string {
  const out: GitgraphParam[] = []
  for (const p of params) {
    if (!(p.key in changes)) {
      out.push(p)
      continue
    }
    const next = changes[p.key]
    if (next === null || next === undefined) continue // 删除该参数
    out.push({ ...p, value: String(next) })
  }
  // 新增参数（changes 里有而 params 里没有的 key）：数字裸值（order），其余带双引号。
  // 若前一项的 after 为空（原本是末项），补一个空格作分隔。
  const known = new Set(params.map((p) => p.key))
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === undefined || known.has(key)) continue
    const last = out[out.length - 1]
    if (last !== undefined && last.after === '') out[out.length - 1] = { ...last, after: ' ' }
    const quoted = typeof value !== 'number'
    out.push({ key, colonRaw: ': ', quote: quoted ? '"' : '', value: String(value), after: '' })
  }
  // 末项的行尾空白在编辑后不再有意义：去掉，避免留下悬挂空格
  if (out.length > 0) out[out.length - 1] = { ...out[out.length - 1]!, after: '' }
  return renderGitgraphParams(out)
}

// ---------- 元素数据 ----------

export interface GitgraphHeaderData {
  kind: 'gitgraph-header'
  /** 原文关键字（保留用户大小写习惯） */
  keyword: string
  /** 关键字与方向 token 之间的空白 */
  gap: string
  /** 表头方向（LR / TB / BT）；缺省 null = mermaid 默认 LR */
  direction: string | null
  /** 关键字（或方向缺失时关键字）之后的尾部空白 */
  trailing: string
}

export function renderGitgraphHeader(d: GitgraphHeaderData, changes: { direction?: string | null } = {}): string {
  const dir = changes.direction !== undefined ? changes.direction : d.direction
  if (dir === null) return `${d.keyword}${d.trailing}`
  const gap = d.direction === null && d.gap === '' ? ' ' : d.gap
  return `${d.keyword}${gap}${dir}:${d.trailing}`
}

export interface GitgraphCommitData {
  kind: 'gg-commit'
  /** `commit` 关键字原文 */
  keyword: string
  /** 关键字与参数段之间的空白 */
  gap: string
  params: GitgraphParam[]
}

export function renderGitgraphCommit(
  d: GitgraphCommitData,
  changes: { id?: string | null; tag?: string | null; type?: string | null } = {},
): string {
  const params = renderParamsWith(d.params, changes)
  // 无参数时不保留关键字后的空白（`commit ` → `commit`）；要写参数则至少一个空格
  const sep = params === '' ? d.gap : d.gap !== '' ? d.gap : ' '
  return `${d.keyword}${sep}${params}`
}

export interface GitgraphBranchData {
  kind: 'gg-branch'
  keyword: string
  gap: string
  /** 引号字符；裸名为 '' */
  quote: string
  /** 分支名（去引号） */
  name: string
  /** 名与参数段之间的空白 */
  nameAfter: string
  params: GitgraphParam[]
}

export function renderGitgraphBranch(
  d: GitgraphBranchData,
  changes: { order?: number | null } = {},
): string {
  const params = renderParamsWith(d.params, changes)
  // nameAfter 缺省是原文空隙；无空隙却要写参数时补一个空格（新增 order 不能粘在名字后）
  const sep = params === '' ? d.nameAfter : d.nameAfter !== '' ? d.nameAfter : ' '
  return `${d.keyword}${d.gap}${d.quote}${d.name}${d.quote}${sep}${params}`
}

/** `checkout` / `switch`（等价关键字，原文保留）；分支归属追踪的语句，不进结构树 */
export interface GitgraphCheckoutData {
  kind: 'gg-checkout'
  keyword: string
  gap: string
  quote: string
  name: string
  trailing: string
}

export interface GitgraphMergeData {
  kind: 'gg-merge'
  keyword: string
  gap: string
  quote: string
  /** 被合并的分支名 */
  name: string
  nameAfter: string
  params: GitgraphParam[]
}

export function renderGitgraphMerge(
  d: GitgraphMergeData,
  changes: { id?: string | null; tag?: string | null; type?: string | null } = {},
): string {
  const params = renderParamsWith(d.params, changes)
  const sep = params === '' ? d.nameAfter : d.nameAfter !== '' ? d.nameAfter : ' '
  return `${d.keyword}${d.gap}${d.quote}${d.name}${d.quote}${sep}${params}`
}

export interface GitgraphCherryPickData {
  kind: 'gg-cherry-pick'
  keyword: string
  gap: string
  params: GitgraphParam[]
}

export function renderGitgraphCherryPick(
  d: GitgraphCherryPickData,
  changes: { id?: string | null; parent?: string | null } = {},
): string {
  const params = renderParamsWith(d.params, changes)
  const sep = params === '' ? d.gap : d.gap !== '' ? d.gap : ' '
  return `${d.keyword}${sep}${params}`
}

export type GitgraphElementData =
  | GitgraphHeaderData
  | GitgraphCommitData
  | GitgraphBranchData
  | GitgraphCheckoutData
  | GitgraphMergeData
  | GitgraphCherryPickData

// ---------- 行级解析 ----------

const HEADER_RE = /^([ \t]*)(gitGraph)([ \t]*)((?:LR|TB|BT)(?=:):)?([ \t\r]*)$/

/**
 * gitGraph 参数序列（各语句分别过滤 key，见 parseParams）。
 * `lead` = 参数段之前被吃掉的空白（`branch develop order: 2` 里 name 与 order 之间的空格）——
 * 由调用方保留为 nameAfter，编辑时原样写回（bare 名的 `rest` 会带着这段空隙，见 parseName）。
 */
function parseParams(
  rest: string,
  allowed: ReadonlyArray<string>,
): { params: GitgraphParam[]; lead: string } | null {
  // name 之后的前导空白不属于任何参数：单独返回，避免 `branch develop order: 2` 整行失配
  const lead = /^[ \t]*/.exec(rest)?.[0] ?? ''
  rest = rest.slice(lead.length)
  const params: GitgraphParam[] = []
  for (;;) {
    const m = /^([a-zA-Z]+)([ \t]*:[ \t]*)/.exec(rest)
    if (m === null) break
    const key = m[1].toLowerCase()
    if (!allowed.includes(key)) return null
    let cursor = m[0].length
    const valueMatch = /^("([^"]*)"|'([^']*)'|([^\s]+))/.exec(rest.slice(cursor))
    if (valueMatch === null) return null
    const quote = valueMatch[2] !== undefined ? '"' : valueMatch[3] !== undefined ? "'" : ''
    const value = valueMatch[2] ?? valueMatch[3] ?? valueMatch[4] ?? ''
    cursor += valueMatch[0].length
    const after = /^[ \t]*/.exec(rest.slice(cursor))?.[0] ?? ''
    cursor += after.length
    params.push({ key, colonRaw: m[2], quote, value, after })
    rest = rest.slice(cursor)
  }
  // 剩余只能是尾部空白（含 \r），否则整行不识别
  if (/[^\s\r]/.test(rest)) return null
  return { params, lead }
}

/** 语句名（裸名或引号名）+ 余下部分；引号名可含空白 */
function parseName(rest: string): { quote: string; name: string; rest: string } | null {
  const qm = /^"([^"]*)"([ \t]*)/.exec(rest) ?? /^'([^']*)'([ \t]*)/.exec(rest)
  if (qm !== null) {
    return { quote: rest[0], name: qm[1], rest: rest.slice(qm[0].length) }
  }
  const bm = /^[^\s:"]+([ \t]*)/.exec(rest)
  if (bm !== null) {
    return { quote: '', name: bm[0].slice(0, bm[0].length - bm[1].length), rest: bm[1] + rest.slice(bm[0].length) }
  }
  return null
}

function trailingSpaces(rest: string): string | null {
  if (/[^\s\r]/.test(rest)) return null
  return rest
}

/** 表头方向（工单范围：LR / TB / BT；mermaid 默认 LR） */
export const GITGRAPH_DIRECTIONS = ['LR', 'TB', 'BT'] as const
export type GitgraphDirection = (typeof GITGRAPH_DIRECTIONS)[number]

/** commit / merge 的 type 白名单（mermaid 渲染语义） */
export const GITGRAPH_COMMIT_TYPES = ['NORMAL', 'REVERSE', 'HIGHLIGHT'] as const

/**
 * mermaid gitGraph 文法里占用为 token 的名字（research 事实：分支名与关键字冲突须加引号，
 * 如 `branch "cherry-pick"`）。生成的新分支名若命中，落码时补双引号。
 */
export const GITGRAPH_KEYWORDS = new Set([
  'commit',
  'branch',
  'checkout',
  'switch',
  'merge',
  'cherry-pick',
  'order',
  'id',
  'tag',
  'type',
  'parent',
  'NORMAL',
  'REVERSE',
  'HIGHLIGHT',
  'LR',
  'TB',
  'BT',
])

interface RawEntry {
  span: Span
  id: string
  data: GitgraphElementData
}

export class GitgraphParser implements DiagramParser {
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
    const counters = { commit: 0, checkout: 0, merge: 0, cherry: 0 }
    const branchOccurrence = new Map<string, number>()
    let seenHeader = false
    // 文首 frontmatter 块不参与解析，整体 verbatim 保留（工单 11）
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
        const firstChar = line.length - line.trimStart().length
        const span = { start: cursor + firstChar, end: cursor + line.length }
        if (!seenHeader) {
          const header = HEADER_RE.exec(line)
          if (header === null) {
            throw parseFailure(lineNo, '图表必须以 gitGraph 声明开始')
          }
          seenHeader = true
          entries.push({
            span,
            id: 'header',
            data: {
              kind: 'gitgraph-header',
              keyword: header[2],
              gap: header[3] ?? '',
              direction: header[4] !== undefined ? header[4].slice(0, -1) : null,
              trailing: header[5] ?? '',
            },
          })
        } else {
          const data = this.parseStatementLine(line.slice(firstChar))
          if (data !== null) {
            if (data.kind === 'gg-commit') {
              counters.commit++
              entries.push({ span, id: `commit:${counters.commit}`, data })
            } else if (data.kind === 'gg-branch') {
              const n = (branchOccurrence.get(data.name) ?? 0) + 1
              branchOccurrence.set(data.name, n)
              entries.push({ span, id: withOccurrence(`branch:${data.name}`, n), data })
            } else if (data.kind === 'gg-checkout') {
              counters.checkout++
              entries.push({ span, id: `checkout:${counters.checkout}`, data })
            } else if (data.kind === 'gg-merge') {
              counters.merge++
              entries.push({ span, id: `merge:${counters.merge}`, data })
            } else {
              counters.cherry++
              entries.push({ span, id: `cherry-pick:${counters.cherry}`, data })
            }
          }
          // 其余（注释、生僻语法）不解析，逐字保留
        }
      }

      if (nl === -1) break
      cursor = nl + 1
    }

    if (!seenHeader) {
      throw parseFailure(1, '图表必须以 gitGraph 声明开始')
    }
    return assembleDocument(source, entries)
  }

  /** 语句行 → 元素数据；不识别返回 null（逐字保留，不报错） */
  private parseStatementLine(text: string): GitgraphElementData | null {
    const commit = /^commit([ \t]*)(.*)$/.exec(text)
    if (commit !== null) {
      const parsed = parseParams(commit[2], ['id', 'tag', 'type'])
      if (parsed === null) return null
      return { kind: 'gg-commit', keyword: 'commit', gap: commit[1], params: parsed.params }
    }
    const branch = /^branch([ \t]+)(.*)$/.exec(text)
    if (branch !== null) {
      const name = parseName(branch[2])
      if (name === null) return null
      const parsed = parseParams(name.rest, ['order'])
      if (parsed === null) return null
      return {
        kind: 'gg-branch',
        keyword: 'branch',
        gap: branch[1],
        quote: name.quote,
        name: name.name,
        nameAfter: parsed.lead,
        params: parsed.params,
      }
    }
    const checkout = /^(checkout|switch)([ \t]+)(.*)$/.exec(text)
    if (checkout !== null) {
      const name = parseName(checkout[3])
      if (name === null) return null
      const trailing = trailingSpaces(name.rest)
      if (trailing === null) return null
      return {
        kind: 'gg-checkout',
        keyword: checkout[1],
        gap: checkout[2],
        quote: name.quote,
        name: name.name,
        trailing,
      }
    }
    const merge = /^merge([ \t]+)(.*)$/.exec(text)
    if (merge !== null) {
      const name = parseName(merge[2])
      if (name === null) return null
      const parsed = parseParams(name.rest, ['id', 'tag', 'type'])
      if (parsed === null) return null
      return {
        kind: 'gg-merge',
        keyword: 'merge',
        gap: merge[1],
        quote: name.quote,
        name: name.name,
        nameAfter: parsed.lead,
        params: parsed.params,
      }
    }
    const cherry = /^cherry-pick([ \t]*)(.*)$/.exec(text)
    if (cherry !== null) {
      const parsed = parseParams(cherry[2], ['id', 'parent'])
      if (parsed === null) return null
      return { kind: 'gg-cherry-pick', keyword: 'cherry-pick', gap: cherry[1], params: parsed.params }
    }
    return null
  }

  // ---------- 意图落地（resolveRewrites） ----------

  resolveRewrites(doc: SourceDocument, intent: EditIntent): ReadonlyMap<string, string> | null {
    switch (intent.type) {
      case 'add-commit':
        return this.resolveAddCommit(doc, intent as never)
      case 'add-branch':
        return this.resolveAddBranch(doc, intent as never)
      case 'add-checkout':
        return this.resolveAddCheckout(doc, intent as never)
      case 'add-merge':
        return this.resolveAddMerge(doc, intent as never)
      case 'add-cherry-pick':
        return this.resolveAddCherryPick(doc, intent as never)
      case 'set-commit-params':
        return this.resolveSetCommitParams(doc, intent as never)
      case 'set-branch-order':
        return this.resolveSetBranchOrder(doc, intent as never)
      case 'delete-commit':
        return this.resolveDeleteCommit(doc, intent as never)
      case 'delete-branch':
        return this.resolveDeleteBranch(doc, intent as never)
      case 'delete-merge':
        return this.resolveDeleteStatement(doc, 'gg-merge', (intent as unknown as { elementId: string }).elementId)
      case 'delete-cherry-pick':
        return this.resolveDeleteStatement(doc, 'gg-cherry-pick', (intent as unknown as { elementId: string }).elementId)
      case 'set-direction':
        return this.resolveSetDirection(doc, intent as never)
      default:
        return null
    }
  }

  private resolveAddCommit(
    doc: SourceDocument,
    intent: Extract<GitgraphIntent, { type: 'add-commit' }>,
  ): Map<string, string> | null {
    if (!isValidCommitType(intent.commitType)) return null
    if (intent.id !== undefined && intent.id !== '' && gitgraphCommitIdSet(doc).has(intent.id)) return null
    const line = renderGitgraphCommit({
      kind: 'gg-commit',
      keyword: 'commit',
      gap: '',
      params: paramsOf({ id: intent.id, tag: intent.tag, type: intent.commitType }),
    })
    return insertAfter(doc, { afterElementId: intent.afterElementId, render: (indent) => indentLines(indent, [line]) })
  }

  private resolveAddBranch(
    doc: SourceDocument,
    intent: Extract<GitgraphIntent, { type: 'add-branch' }>,
  ): Map<string, string> | null {
    if (!isValidGitgraphBranchName(intent.name)) return null
    if (gitgraphBranchNames(doc).has(intent.name)) return null // 分支已存在（mermaid 渲染错误）
    const line = renderGitgraphBranch(
      {
        kind: 'gg-branch',
        keyword: 'branch',
        gap: ' ',
        // 与关键字冲突的分支名必须引号化（如 `branch "cherry-pick"`），否则 mermaid 解析错误
        quote: GITGRAPH_KEYWORDS.has(intent.name) ? '"' : '',
        name: intent.name,
        nameAfter: '',
        params: paramsOf({ order: intent.order }),
      },
    )
    return insertAfter(doc, { afterElementId: intent.afterElementId, render: (indent) => indentLines(indent, [line]) })
  }

  /**
   * 新增 `checkout` / `switch` 语句（切回某分支；语句序即拓扑的插入）。
   * 端到端场景「merge 回 main」需要先切回 main——`branch` 创建即 checkout，
   * 而合并只作用于当前分支，故补这条纯语句插入意图（工单 04 e2e）。
   * 分支不存在 → 拒绝落码（mermaid 渲染错误）。
   */
  private resolveAddCheckout(
    doc: SourceDocument,
    intent: Extract<GitgraphIntent, { type: 'add-checkout' }>,
  ): Map<string, string> | null {
    if (!gitgraphBranchNames(doc).has(intent.branch)) return null
    const keyword = intent.keyword ?? 'checkout'
    const name = `${GITGRAPH_KEYWORDS.has(intent.branch) ? `"${intent.branch}"` : intent.branch}`
    const line = `${keyword} ${name}`
    return insertAfter(doc, { afterElementId: intent.afterElementId, render: (indent) => indentLines(indent, [line]) })
  }

  private resolveAddMerge(
    doc: SourceDocument,
    intent: Extract<GitgraphIntent, { type: 'add-merge' }>,
  ): Map<string, string> | null {
    if (!gitgraphBranchNames(doc).has(intent.branch)) return null // 分支不存在（渲染错误）
    // 自合并（当前分支合并自己）是渲染错误：按锚点位置的当前分支判定，而非只看文末
    if (currentBranchAtAnchor(doc, intent.afterElementId) === intent.branch) return null
    const line = renderGitgraphMerge({
      kind: 'gg-merge',
      keyword: 'merge',
      gap: ' ',
      quote: '',
      name: intent.branch,
      nameAfter: '',
      params: paramsOf({ id: intent.id, tag: intent.tag }),
    })
    return insertAfter(doc, { afterElementId: intent.afterElementId, render: (indent) => indentLines(indent, [line]) })
  }

  private resolveAddCherryPick(
    doc: SourceDocument,
    intent: Extract<GitgraphIntent, { type: 'add-cherry-pick' }>,
  ): Map<string, string> | null {
    if (intent.id === '' || !gitgraphCommitIdSet(doc).has(intent.id)) return null // 源提交不存在
    // 源为 merge 提交时 parent 必填（mermaid 渲染错误），且 parent 必须指向存在的提交
    if (gitgraphMergeIdSet(doc).has(intent.id) && (intent.parent === undefined || intent.parent === '')) return null
    if (intent.parent !== undefined && intent.parent !== '' && !gitgraphCommitIdSet(doc).has(intent.parent)) return null
    const line = renderGitgraphCherryPick({
      kind: 'gg-cherry-pick',
      keyword: 'cherry-pick',
      gap: '',
      params: paramsOf({ id: intent.id, parent: intent.parent }),
    })
    return insertAfter(doc, { afterElementId: intent.afterElementId, render: (indent) => indentLines(indent, [line]) })
  }

  /**
   * 改带参数语句的参数（commit / merge / cherry-pick 共用一份意图：三者参数形态同构）。
   * 改 commit 的 id 时级联改写引用它的 cherry-pick（id: / parent:），保证源码仍合法。
   * 非法编辑一律拒绝落码（返回 null）：未知参数、非法 type、id 撞车、cherry-pick 引用悬空。
   */
  private resolveSetCommitParams(
    doc: SourceDocument,
    intent: Extract<GitgraphIntent, { type: 'set-commit-params' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined) return null
    const kind = part.element.kind
    if (kind !== 'gg-commit' && kind !== 'gg-merge' && kind !== 'gg-cherry-pick') return null
    const data = part.element as GitgraphCommitData | GitgraphMergeData | GitgraphCherryPickData
    const oldId = paramValue(data.params, 'id')
    const allowed = kind === 'gg-cherry-pick' ? ['id', 'parent'] : ['id', 'tag', 'type']
    // 归一化 + 校验：未知参数拒绝；''/null 视为去掉该参数（与留空表单同语义）
    const changes: Record<string, string | null> = {}
    for (const [key, value] of Object.entries(intent.changes)) {
      if (!allowed.includes(key)) return null
      if (value === undefined) continue
      if (value === null || value === '') {
        changes[key] = null
        continue
      }
      if (key === 'type' && !isValidCommitType(value)) return null
      changes[key] = value
    }
    if (kind === 'gg-cherry-pick') {
      // cherry-pick 的 id 必填；id / parent 都是对其它提交的引用，指向不存在 = 渲染错误
      if (changes.id === null) return null // 去掉 id 会让 cherry-pick 非法
      const known = gitgraphCommitIdSet(doc)
      const nextId = 'id' in changes ? changes.id : paramValue(data.params, 'id')
      const nextParent = 'parent' in changes ? changes.parent : paramValue(data.params, 'parent')
      if (nextId === null || nextId === '' || !known.has(nextId)) return null
      if (nextParent !== null && nextParent !== '' && !known.has(nextParent)) return null
      // 源为 merge 提交时 parent 必填（mermaid 渲染错误）
      if ((nextParent === null || nextParent === '') && gitgraphMergeIdSet(doc).has(nextId)) return null
    } else if (kind === 'gg-commit') {
      // 去掉 id 会让引用它的 cherry-pick 悬空 → 拒绝
      if (changes.id === null && oldId !== null && oldId !== '' && cherryPickRefs(doc, oldId)) return null
      // 显式 id 撞车（同一 id 指向两个提交）是渲染歧义：除「重命名为原 id」外拒绝
      if (changes.id !== undefined && changes.id !== null && changes.id !== oldId && gitgraphCommitIdSet(doc).has(changes.id)) {
        return null
      }
    } else if (changes.id !== undefined && changes.id !== null && changes.id !== oldId && gitgraphCommitIdSet(doc).has(changes.id)) {
      return null
    }
    const rendered =
      kind === 'gg-commit'
        ? renderGitgraphCommit(data as GitgraphCommitData, changes)
        : kind === 'gg-merge'
          ? renderGitgraphMerge(data as GitgraphMergeData, changes)
          : renderGitgraphCherryPick(data as GitgraphCherryPickData, changes)
    const rewrites = new Map<string, string>([[part.id, rendered]])
    // 改 commit 的 id 级联改写引用它的 cherry-pick（id: / parent:），保证源码仍合法
    const nextId = changes.id
    if (kind === 'gg-commit' && nextId !== undefined && nextId !== null && oldId !== null && oldId !== '') {
      for (const other of doc.elements) {
        if (other.element.kind !== 'gg-cherry-pick') continue
        const cherry = other.element as GitgraphCherryPickData
        const refs = { id: paramValue(cherry.params, 'id'), parent: paramValue(cherry.params, 'parent') }
        const cascades: Record<string, string> = {}
        if (refs.id === oldId) cascades.id = nextId
        if (refs.parent === oldId) cascades.parent = nextId
        if (Object.keys(cascades).length > 0) {
          rewrites.set(other.id, renderGitgraphCherryPick(cherry, cascades))
        }
      }
    }
    return rewrites
  }

  private resolveSetBranchOrder(
    doc: SourceDocument,
    intent: Extract<GitgraphIntent, { type: 'set-branch-order' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'gg-branch') return null
    const order = intent.order
    if (order !== null && (!Number.isInteger(order) || order < 0)) return null
    return new Map([[part.id, renderGitgraphBranch(part.element as GitgraphBranchData, { order })]])
  }

  private resolveDeleteCommit(
    doc: SourceDocument,
    intent: Extract<GitgraphIntent, { type: 'delete-commit' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'gg-commit') return null
    const data = part.element as GitgraphCommitData
    const id = paramValue(data.params, 'id')
    if (id !== null && id !== '') {
      // 该提交被 cherry-pick 引用（id / parent）时删除会让源码非法：禁止落码
      for (const other of doc.elements) {
        if (other.element.kind !== 'gg-cherry-pick') continue
        const cherry = other.element as GitgraphCherryPickData
        if (paramValue(cherry.params, 'id') === id || paramValue(cherry.params, 'parent') === id) return null
      }
    }
    return new Map([[part.id, '']])
  }

  private resolveDeleteBranch(
    doc: SourceDocument,
    intent: Extract<GitgraphIntent, { type: 'delete-branch' }>,
  ): Map<string, string> | null {
    if (intent.name === 'main') return null // 起始分支 main 恒存在（隐式），不能删除
    const rewrites = new Map<string, string>()
    // 分支声明（同名多行全部删除）
    for (const part of doc.elements) {
      const data = part.element
      if (data.kind === 'gg-branch' && (data as GitgraphBranchData).name === intent.name) {
        rewrites.set(part.id, '')
      } else if (data.kind === 'gg-checkout' && (data as GitgraphCheckoutData).name === intent.name) {
        // 连带 checkout/switch 语句（指向已删分支的 checkout 是渲染错误）
        rewrites.set(part.id, '')
      } else if (data.kind === 'gg-merge' && (data as GitgraphMergeData).name === intent.name) {
        // 连带 merge 语句（合并已删分支同法炮制）
        rewrites.set(part.id, '')
      }
    }
    return rewrites.size > 0 ? rewrites : null
  }

  private resolveDeleteStatement(
    doc: SourceDocument,
    kind: 'gg-merge' | 'gg-cherry-pick',
    elementId: string,
  ): Map<string, string> | null {
    const part = getElementById(doc, elementId)
    if (part === undefined || part.element.kind !== kind) return null
    return new Map([[part.id, '']])
  }

  /**
   * 设置表头方向：LR / TB / BT 白名单；null = 去掉方向 token（跟随 mermaid 默认 LR）。
   * gitGraph 的方向在表头行上，没有独立的 direction 语句。
   */
  private resolveSetDirection(
    doc: SourceDocument,
    intent: Extract<GitgraphIntent, { type: 'set-direction' }>,
  ): Map<string, string> | null {
    if (intent.direction !== null && !GITGRAPH_DIRECTIONS.includes(intent.direction as GitgraphDirection)) return null
    const header = doc.elements.find((part) => part.element.kind === 'gitgraph-header')
    if (header === undefined) return null
    return new Map([
      [header.id, renderGitgraphHeader(header.element as GitgraphHeaderData, { direction: intent.direction })],
    ])
  }
}

export const gitgraphParser = new GitgraphParser()

// ---------- 校验（表单层复用，与落地侧同一规则） ----------

/** 新建分支名的合法性：非空、不含空白/冒号/引号（含空白须引号的名字不自动生成） */
export function isValidGitgraphBranchName(name: string): boolean {
  return name !== '' && !/[\s:"']/.test(name)
}

// ---------- 语义小工具（落码侧校验共用，纯函数） ----------

function paramValue(params: GitgraphParam[], key: string): string | null {
  const p = params.find((x) => x.key === key)
  return p !== undefined ? p.value : null
}

/** 从意图可选字段构造参数表（undefined = 不带该参数，''/null 同）；数字裸值（order），其余带双引号 */
function paramsOf(
  values: Record<string, string | number | null | undefined>,
): GitgraphParam[] {
  const out: GitgraphParam[] = []
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === '') continue
    const quoted = typeof value !== 'number'
    out.push({ key, colonRaw: ': ', quote: quoted ? '"' : '', value: String(value), after: '' })
  }
  return out
}

/** 源码中已声明（或默认存在）的分支名集合：main 恒存在 */
function gitgraphBranchNames(doc: SourceDocument): Set<string> {
  const names = new Set<string>(['main'])
  for (const part of doc.elements) {
    if (part.element.kind === 'gg-branch') names.add((part.element as GitgraphBranchData).name)
  }
  return names
}

/** 全部 commit / merge 的显式 id 集合（cherry-pick 引用校验用） */
function gitgraphCommitIdSet(doc: SourceDocument): Set<string> {
  const ids = new Set<string>()
  for (const part of doc.elements) {
    const data = part.element
    if (data.kind === 'gg-commit') {
      const id = paramValue((data as GitgraphCommitData).params, 'id')
      if (id !== null && id !== '') ids.add(id)
    } else if (data.kind === 'gg-merge') {
      const id = paramValue((data as GitgraphMergeData).params, 'id')
      if (id !== null && id !== '') ids.add(id)
    }
  }
  return ids
}

/** 全部 merge 语句的显式 id 集合（cherry-pick 的 parent 必填校验用） */
function gitgraphMergeIdSet(doc: SourceDocument): Set<string> {
  const ids = new Set<string>()
  for (const part of doc.elements) {
    if (part.element.kind !== 'gg-merge') continue
    const id = paramValue((part.element as GitgraphMergeData).params, 'id')
    if (id !== null && id !== '') ids.add(id)
  }
  return ids
}

/** 是否存在 cherry-pick 的 id / parent 引用该提交 id（删 id / 删提交前的悬空校验） */
function cherryPickRefs(doc: SourceDocument, id: string): boolean {
  for (const part of doc.elements) {
    if (part.element.kind !== 'gg-cherry-pick') continue
    const cherry = part.element as GitgraphCherryPickData
    if (paramValue(cherry.params, 'id') === id || paramValue(cherry.params, 'parent') === id) return true
  }
  return false
}

/** commit / merge 的 type 白名单校验（undefined / null 视为不带 type，合法） */
function isValidCommitType(type: string | null | undefined): boolean {
  return type === undefined || type === null || (GITGRAPH_COMMIT_TYPES as readonly string[]).includes(type)
}

/**
 * 锚点位置处的「当前分支」：`branch` 创建并切换，`checkout`/`switch` 切换，
 * merge / cherry-pick / commit 不改变当前分支。锚点缺省/不存在 = 文档末尾（与
 * `insertAfter` 的回退口径一致）。add-merge 的自合并校验用。
 */
function currentBranchAtAnchor(doc: SourceDocument, afterElementId?: string): string {
  const anchor = resolveAnchor(doc, afterElementId)
  let current = 'main'
  for (const part of doc.elements) {
    const data = part.element
    if (data.kind === 'gg-branch') current = (data as GitgraphBranchData).name
    else if (data.kind === 'gg-checkout') current = (data as GitgraphCheckoutData).name
    if (anchor !== null && part.id === anchor.id) break
  }
  return current
}

// ---------- 编辑意图（工单 04 表单/画布所需集合） ----------

export type GitgraphIntent =
  /** 新增 commit 语句（追加或锚点插入；语句序即拓扑） */
  | { type: 'add-commit'; id?: string; tag?: string; commitType?: string; afterElementId?: string }
  /** 新增 branch 语句（创建并 checkout）；重名分支拒绝落码 */
  | { type: 'add-branch'; name: string; order?: number; afterElementId?: string }
  /** 新增 checkout / switch 语句（切回某分支；「merge 回 main」e2e 需要）；分支不存在拒绝落码 */
  | { type: 'add-checkout'; branch: string; keyword?: 'checkout' | 'switch'; afterElementId?: string }
  /** 新增 merge 语句（合并到当前分支）；分支不存在 / 自合并拒绝落码 */
  | { type: 'add-merge'; branch: string; id?: string; tag?: string; afterElementId?: string }
  /** 新增 cherry-pick 语句；源提交 id 不存在拒绝落码 */
  | { type: 'add-cherry-pick'; id: string; parent?: string; afterElementId?: string }
  /** 改带参数语句的 id / tag / type / parent（commit / merge / cherry-pick 共用；null = 去掉参数）；
   * 改 commit 的 id 级联改写 cherry-pick 引用 */
  | { type: 'set-commit-params'; elementId: string; changes: { id?: string | null; tag?: string | null; type?: string | null; parent?: string | null } }
  /** 改分支 order（null = 去掉 order 参数，跟随代码顺序） */
  | { type: 'set-branch-order'; elementId: string; order: number | null }
  /** 删除 commit 语句；被 cherry-pick 引用的提交拒绝落码 */
  | { type: 'delete-commit'; elementId: string }
  /** 删除分支（连带删除指向它的 checkout/switch 与 merge 语句） */
  | { type: 'delete-branch'; name: string }
  | { type: 'delete-merge'; elementId: string }
  | { type: 'delete-cherry-pick'; elementId: string }
  /** 设置表头方向（LR / TB / BT）；null = 去掉方向 token（mermaid 默认 LR） */
  | { type: 'set-direction'; direction: string | null }
