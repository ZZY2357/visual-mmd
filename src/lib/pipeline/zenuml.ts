import { assembleDocument, getElementById, type ElementPart, type SourceDocument } from './document'
import { frontmatterEnd } from './frontmatter'
import { insertAfter } from './insert'
import type { DiagramParser, EditIntent, ParseResult, SourceParseError } from './parser'
import type { Span } from './span'

/**
 * zenuml（ZenUML）完整解析器（more-diagrams 工单 19，语法事实以
 * .scratch/more-diagrams/research/data-display.md §10 为准，工单 19 实测复核）。
 *
 * zenuml 是**外部注册图种**：需 `mermaid.registerExternalDiagrams([plugin], { lazyLoad:false })`
 * 才能被 mermaid 识别（详见 use-mermaid-preview.ts）。其 mermaid 侧 `parser.parse` 是 **no-op**
 * （工单 19 任务 0 实测），因此**解析合法性只能由本解析器负责**——不能依赖 mermaid.parse。
 *
 * 手写、逐行、带 span（ADR-0004）。可测试承诺：解析后不做修改再重组装，输出与输入逐字相同
 * （verbatim identity）。
 *
 * 覆盖（工单 19 范围）：
 * - 声明头：`zenuml`（探测器 `/^\s*zenuml/`；本解析器同口径，允许同行尾随空白）。
 * - 参与者声明 `participant <id> [as "<别名>"]`（别名可带/不带引号；工单 19 实测两者皆可）。
 *   参与者也可**隐式**由消息端点引入（zenuml 隐式按出现顺序）——隐式端点不落码，投影按需合成。
 * - 注解行 `@Actor A` / `@Database Db`（可单行；`@Database Db { … }` 块形态整体逐字保留，
 *   不做块内解析——工单 19 不做嵌套块插入锚点）。
 * - 消息：
 *   - 同步 `A.b(args)` / `A.b`（点调用）
 *   - 异步 `A->B.method(args)` / `A->B.method`
 *   - 创建 `new A(args)` / `new A`
 *   - 返回 `return value` / `@return value`（无 target）
 *   - 赋值前缀 `x = A.b()` / `const r = A.b()`（工单 19 实测合法；保留前缀原文）
 * - 片段：`if (c) { … } else if (c2) { … } else { … }`、`while` / `for` / `forEach` / `loop`、
 *   `opt`、`par`、`try { … } catch { … } finally { … }`——作为**分组**进结构树。
 * - 文档级：`title <text>`。
 * - 边角（逐字保留，清单外不报错，ADR-0008）：`// comment` 注释行、空行、缩进、无法识别的行。
 *
 * 身份（ADR-0012）：
 * - 参与者 = **名字即身份**（`participant:<id>`——mermaid/zenuml 按名引用，重名即同一参与者）。
 * - 消息 = **位置序身份**（`message:N`，1 基文档序——消息无显式 id，位置序是唯一稳定身份）。
 * - 片段 = **位置序身份**（`fragment:N`，1 基文档序——开行为分组锚点，闭合 `}` 归属该片段）。
 *
 * span 约定（行级，与 venn / usecase 同口径）：行首缩进与换行留在 verbatim；元素 span 不跨行；
 * 行尾空白 / `// comment` 归 tail 字段逐字保留（改写时回写）。
 * 片段的 `{` 可同行（`if (c) {`）——开行元素 span = 整行，片体内语句各自成元素，闭合 `}` 行
 * 作为该片段的**闭合元素**（`fragment-end:N`，逐字保留，不进结构树分组标题）。
 *
 * **不做（工单 19 明确）**：
 * - 嵌套块 `{}` 的块内插入锚点（添加消息一律追加到锚点元素所在层之后，块内锚点不解析）；
 * - `// comment` 注释的编辑（保留，不暴露编辑入口）；
 * - zenuml 内部 config（`%%{init}%%` / frontmatter 整体逐字保留，不做表单化编辑）。
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

export interface ZenumlHeaderData {
  kind: 'zenuml-header'
  /** 声明行尾原文（含尾随空白），逐字保留 */
  trailing: string
}

/** `participant <id> [as "<别名>"]`：显式参与者声明（名字即身份） */
export interface ZenumlParticipantData {
  kind: 'zenuml-participant'
  /** 行首缩进原文（属元素 span，改写时原样搬运） */
  indent: string
  /** 参与者标识符（消息端点引用的名字） */
  id: string
  /** `as "<别名>"` 中关键字 `as` 与别名之间的原文（含空白）；无别名为 null */
  asGap: string | null
  /** 别名整段原文（含引号，若书写时带引号）；无别名为 null */
  aliasRaw: string | null
  /** 行尾残留（含 `// comment` / 尾随空白），逐字保留 */
  tail: string
}

/**
 * 消息（同步 / 异步 / new / return / 赋值）：位置序身份 `message:N`。
 * 保持**逐字原文**字段，改写时手术式重组（未触碰部分逐字保留）。
 */
export interface ZenumlMessageData {
  kind: 'zenuml-message'
  indent: string
  /** 消息种类（表单分层 / 结构树 detail 用）；赋值前缀不改变种类，记录在 assignPrefix */
  messageKind: 'sync' | 'async' | 'new' | 'return'
  /** 赋值前缀原文（`const r = ` / `x = ` / `let r = `；无赋值为 ''） */
  assignPrefix: string
  /** 发起方标识符原文（同步 `A.b()` 的 A / 异步 `A->B.m()` 的 A；`new` / `return` 为 null） */
  from: string | null
  /** 接收方标识符原文（同步 `A.b()` 为 null——调用自身/无显式接收方；异步 `A->B.m()` 的 B；
   *  `new A()` 的构造类名 A；`return` 为 null） */
  to: string | null
  /** 运算符原文（`->` / `.` / 空），逐字保留 */
  operator: string
  /** 方法名原文（`b` / `method`；`new A` 的 A 段；`return` 的值为 `return`） */
  method: string
  /** 参数原文（含括号，`(1, 2)`；无括号为 null），逐字保留 */
  argsRaw: string | null
  /** 行尾残留（含 `// comment` / 尾随空白），逐字保留 */
  tail: string
}

/** 片段开行（`if (c) {` / `while (c) {` / `try {` / `else {` …）：分组 */
export interface ZenumlFragmentData {
  kind: 'zenuml-fragment'
  indent: string
  /** 片段关键字（`if` / `else` / `else if` / `while` / `for` / `forEach` / `loop` / `opt` /
   *  `par` / `try` / `catch` / `finally`） */
  keyword: string
  /** 关键字与 `{` 之间的原文（条件文本，如 `(x)`；无条件的 `opt {` 为 ''），逐字保留 */
  conditionRaw: string
  /** 行尾残留（含 `// comment` / 尾随空白），逐字保留 */
  tail: string
}

/** 片段闭合行（`}`）：逐字保留，不进结构树分组标题 */
export interface ZenumlFragmentEndData {
  kind: 'zenuml-fragment-end'
  indent: string
  tail: string
}

/** 注解行 `@Actor A`（单行形态；块形态整体逐字保留、不解析——见文件头「不做」） */
export interface ZenumlAnnotationData {
  kind: 'zenuml-annotation'
  indent: string
  /** 注解名原文（`Actor` / `Database` …，不含 `@`） */
  annotation: string
  /** `@` 与注解名之间的原文（通常为空） */
  gap: string
  /** 注解作用对象原文（`A` / `Db`；注解独占一行时为 ''） */
  target: string
  tail: string
}

/** 文档级属性行 `title <text>` */
export interface ZenumlTitleData {
  kind: 'zenuml-title'
  indent: string
  /** 关键字与值之间的原文（含空白） */
  gap: string
  /** 值原文（去尾空白） */
  value: string
  tail: string
}

export type ZenumlElementData =
  | ZenumlHeaderData
  | ZenumlParticipantData
  | ZenumlMessageData
  | ZenumlFragmentData
  | ZenumlFragmentEndData
  | ZenumlAnnotationData
  | ZenumlTitleData

// ---------- 词法助手与校验 ----------

/** 裸标识符词法（zenuml 参与者 / 方法名：`[A-Za-z_$][A-Za-z0-9_$-]*`） */
const BARE_ID_RE = /^[A-Za-z_$][A-Za-z0-9_$-]*$/

/** 参与者 id 合法性（表单/落码侧） */
export function isValidZenumlId(id: string): boolean {
  return BARE_ID_RE.test(id)
}

/** 别名 / 文本合法性（非空、不含换行；引号由落码侧按需补） */
export function isValidZenumlLabel(label: string): boolean {
  return label.trim() !== '' && !/[\n]/.test(label)
}

// ---------- 行级解析 ----------

const HEADER_RE = /^zenuml[ \t\r]*$/
const PARTICIPANT_RE = /^participant[ \t]+([^\s]+)(.*)$/
const MESSAGE_RE = /^([A-Za-z_$][A-Za-z0-9_$-]*)(\s*->\s*)([A-Za-z_$][A-Za-z0-9_$-]*)(?:\.([A-Za-z_$][A-Za-z0-9_$-]*))?(\(.*\))?[ \t]*$/
const SYNC_RE = /^([A-Za-z_$][A-Za-z0-9_$-]*)\.([A-Za-z_$][A-Za-z0-9_$-]*)(\(.*\))?[ \t]*$/
const NEW_RE = /^new[ \t]+([A-Za-z_$][A-Za-z0-9_$-]*)(\(.*\))?[ \t]*$/
const RETURN_RE = /^(?:@)?return(?:[ \t]+(.*))?$/
const ASSIGN_RE = /^((?:const|let|var)?[ \t]*[A-Za-z_$][A-Za-z0-9_$-]*[ \t]*=[ \t]*)(.*)$/
const FRAGMENT_OPEN_RE = /^((?:else[ \t]+if|else|if|while|for|forEach|loop|opt|par|try|catch|finally))([ \t]*(?:\(.*\))?)[ \t]*\{[ \t]*$/
/** 同行闭合 + 续开（brace 风格）：`} else {` / `} else if (c) {` / `} catch {` / `} finally {`；
 *  组 1 = 续开片段关键字文本，组 2 = 条件原文 */
const FRAGMENT_CONT_RE = /^\}[ \t]*((?:else[ \t]+if|else|if|while|for|forEach|loop|opt|par|catch|finally))([ \t]*(?:\(.*\))?)[ \t]*\{[ \t]*$/
const ANNOTATION_RE = /^@([A-Za-z_][A-Za-z0-9_]*)([ \t]*)(.*)$/
const TITLE_RE = /^title([ \t]+)(.*)$/

/** 切出行尾 `// comment`（注释归 tail，逐字保留）；无注释返回 null */
function splitComment(s: string): { body: string; tail: string } | null {
  const i = s.indexOf('//')
  if (i === -1) return null
  return { body: s.slice(0, i), tail: s.slice(i) }
}

/** 行首缩进 */
function leadingIndent(s: string): string {
  return s.slice(0, s.length - s.trimStart().length)
}

/** 别名整段解析：`as "…"` / `as …`；返回 asGap / aliasRaw（无别名为 null） */
function parseAlias(rest: string): { asGap: string; aliasRaw: string } | null {
  const m = /^[ \t]+as[ \t]+(.+?)[ \t]*$/.exec(rest)
  if (m === null) return null
  const asMatch = /^([ \t]+as[ \t]+)/.exec(rest)
  if (asMatch === null) return null
  return { asGap: asMatch[1], aliasRaw: m[1] }
}

/** `participant <id> [as "<别名>"] tail` 解析 */
function parseParticipantLine(body: string, indent: string): Omit<ZenumlParticipantData, 'kind'> | null {
  const split = splitComment(body)
  const hard = split === null ? body : split.body
  const tail = split === null ? '' : split.tail
  const m = PARTICIPANT_RE.exec(hard)
  if (m === null) return null
  const id = m[1]
  if (!isValidZenumlId(id)) return null
  const rest = m[2]
  if (rest.trim() === '') {
    return { indent, id, asGap: null, aliasRaw: null, tail }
  }
  const alias = parseAlias(rest)
  if (alias === null) return null
  return { indent, id, asGap: alias.asGap, aliasRaw: alias.aliasRaw, tail }
}

/** 异步消息 `A->B.method(args)` 解析（A = 发起方，B = 接收方） */
function parseAsyncLine(hard: string, assignPrefix: string): Omit<ZenumlMessageData, 'kind' | 'indent' | 'tail'> | null {
  const m = MESSAGE_RE.exec(hard)
  if (m === null) return null
  const from = m[1]
  const to = m[3]
  const method = m[4] ?? ''
  const argsRaw = m[5] ?? null
  return {
    messageKind: 'async',
    assignPrefix,
    from,
    to,
    operator: '->',
    method,
    argsRaw,
  }
}

/** 同步消息 `A.b(args)` 解析（A = 发起方；同步调用无显式接收方） */
function parseSyncLine(hard: string, assignPrefix: string): Omit<ZenumlMessageData, 'kind' | 'indent' | 'tail'> | null {
  const m = SYNC_RE.exec(hard)
  if (m === null) return null
  return {
    messageKind: 'sync',
    assignPrefix,
    from: m[1],
    to: null,
    operator: '.',
    method: m[2],
    argsRaw: m[3] ?? null,
  }
}

/**
 * 消息行解析（同步 / 异步 / new / return / 赋值前缀）：返回消息数据 + 行尾注释。
 * 无法识别为消息的行返回 null（由调用方按「无法识别 → 逐字保留」处理）。
 */
function parseMessageLine(
  body: string,
  indent: string,
): Omit<ZenumlMessageData, 'kind'> | null {
  const split = splitComment(body)
  const hard = split === null ? body : split.body
  const tail = split === null ? '' : split.tail
  const hardTrimmed = hard.trimEnd()

  // 赋值前缀（`const r = ` / `x = `）：剥出后再判右侧消息形态
  const assign = ASSIGN_RE.exec(hardTrimmed)
  let assignPrefix = ''
  let core = hardTrimmed
  if (assign !== null) {
    assignPrefix = assign[1]
    core = assign[2]
  }

  const newMsg = NEW_RE.exec(core)
  if (newMsg !== null) {
    return {
      indent,
      messageKind: 'new',
      assignPrefix,
      from: null,
      to: newMsg[1],
      operator: '',
      method: newMsg[1],
      argsRaw: newMsg[2] ?? null,
      tail,
    }
  }
  const ret = RETURN_RE.exec(core)
  if (ret !== null) {
    return {
      indent,
      messageKind: 'return',
      assignPrefix,
      from: null,
      to: null,
      operator: '',
      method: 'return',
      argsRaw: ret[1] !== undefined ? ` ${ret[1]}` : null,
      tail,
    }
  }
  const async = parseAsyncLine(core, assignPrefix)
  if (async !== null) return { ...async, indent, tail }
  const sync = parseSyncLine(core, assignPrefix)
  if (sync !== null) return { ...sync, indent, tail }
  return null
}

/** 注解行 `@Actor A` / `@Database Db` 解析（仅单行形态；`@X Y {` 块形态不在此认领） */
function parseAnnotationLine(body: string, indent: string): Omit<ZenumlAnnotationData, 'kind'> | null {
  const split = splitComment(body)
  const hard = split === null ? body : split.body
  const tail = split === null ? '' : split.tail
  if (hard.includes('{') || hard.includes('}')) return null
  const m = ANNOTATION_RE.exec(hard.trimEnd())
  if (m === null) return null
  return { indent, annotation: m[1], gap: m[2], target: m[3].trimEnd(), tail }
}

/** 标题行 `title <text>` 解析 */
function parseTitleLine(body: string, indent: string): Omit<ZenumlTitleData, 'kind'> | null {
  const split = splitComment(body)
  const hard = split === null ? body : split.body
  const tail = split === null ? '' : split.tail
  const m = TITLE_RE.exec(hard.trimEnd())
  if (m === null) return null
  return { indent, gap: m[1], value: m[2].trimEnd(), tail }
}

export class ZenumlParser implements DiagramParser {
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
    let messageCount = 0
    let fragmentCount = 0
    let seenHeader = false
    // 未闭合片段栈（片段的 `}` 归最近的开行）。仅在**片段开行**层计数，
    // 不解析块内嵌套的细节（工单 19 不做嵌套块插入锚点）。
    const openFragments: number[] = []
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
        const indent = leadingIndent(line)
        const spanOfLine = (): Span => ({ start: cursor + indent.length, end: lineEndAbs })
        const body = line.slice(indent.length)

        if (!seenHeader) {
          if (!HEADER_RE.test(body)) {
            throw parseFailure(lineNo, '图表必须以 zenuml 声明开始')
          }
          seenHeader = true
          entries.push({
            span: spanOfLine(),
            id: 'zenuml-header',
            data: { kind: 'zenuml-header', trailing: '' },
          })
        } else if (body.startsWith('//')) {
          // 注释行：逐字保留
        } else if (FRAGMENT_CONT_RE.test(body)) {
          // 同行闭合 + 续开（brace 风格 `} else {`）：先闭合当前片段，再开新片段。
          // **必须同时落一个 fragment-end 元素**：投影按元素序列重放片段栈，仅改 openFragments
          // 不会让投影弹栈，续开片段会被误判为嵌套在外层片段内。
          const owner = openFragments.pop()
          entries.push({
            // 同行闭合+续开：闭合元素用零宽 span（同一行已被 fragment 元素占据，不能重复占位）。
            // 它只用于「让投影按元素序列重放时弹栈」，不参与逐字重组。
            span: { start: cursor, end: cursor },
            id: owner !== undefined ? `fragment-end:${owner}` : `brace-end:${lineNo}`,
            data: { kind: 'zenuml-fragment-end', indent, tail: '' },
          })
          const m = FRAGMENT_CONT_RE.exec(body)
          fragmentCount++
          openFragments.push(fragmentCount)
          entries.push({
            span: spanOfLine(),
            id: `fragment:${fragmentCount}`,
            data: {
              kind: 'zenuml-fragment',
              indent,
              keyword: (m !== null ? m[1] : 'else').trim(),
              conditionRaw: m !== null && m[2] !== undefined ? m[2] : '',
              tail: '',
            },
          })
        } else if (trimmed === '}') {
          // 片段闭合行：归属最近未闭合的片段（逐字保留）
          const owner = openFragments.pop()
          entries.push({
            span: spanOfLine(),
            id: owner !== undefined ? `fragment-end:${owner}` : `brace-end:${lineNo}`,
            data: { kind: 'zenuml-fragment-end', indent, tail: '' },
          })
        } else if (FRAGMENT_OPEN_RE.test(body)) {
          fragmentCount++
          const m = FRAGMENT_OPEN_RE.exec(body)
          const keywordRaw = m !== null ? m[1] : 'if'
          const conditionRaw = m !== null && m[2] !== undefined ? m[2] : ''
          openFragments.push(fragmentCount)
          entries.push({
            span: spanOfLine(),
            id: `fragment:${fragmentCount}`,
            data: {
              kind: 'zenuml-fragment',
              indent,
              keyword: keywordRaw.trim(),
              conditionRaw,
              tail: '',
            },
          })
        } else if (body.startsWith('participant ')) {
          const parsed = parseParticipantLine(body, indent)
          if (parsed !== null) {
            entries.push({
              span: spanOfLine(),
              id: `participant:${parsed.id}`,
              data: { kind: 'zenuml-participant', ...parsed },
            })
          }
        } else {
          const title = parseTitleLine(body, indent)
          if (title !== null) {
            entries.push({
              span: spanOfLine(),
              id: 'zenuml-title',
              data: { kind: 'zenuml-title', ...title },
            })
          } else {
            const message = parseMessageLine(body, indent)
            if (message !== null) {
              messageCount++
              entries.push({
                span: spanOfLine(),
                id: `message:${messageCount}`,
                data: { kind: 'zenuml-message', ...message },
              })
            } else {
              const annotation = parseAnnotationLine(body, indent)
              if (annotation !== null) {
                entries.push({
                  span: spanOfLine(),
                  id: `annotation:${lineNo}`,
                  data: { kind: 'zenuml-annotation', ...annotation },
                })
              }
              // 其余（`@X Y {` 块形态 / 无法识别的行）：不解析，逐字保留
            }
          }
        }
      }

      if (nl === -1) break
      cursor = nl + 1
    }

    if (!seenHeader) {
      throw parseFailure(1, '图表必须以 zenuml 声明开始')
    }
    return assembleDocument(source, entries)
  }

  // ---------- 意图落地（resolveRewrites） ----------

  resolveRewrites(doc: SourceDocument, intent: EditIntent): ReadonlyMap<string, string> | null {
    switch (intent.type) {
      case 'add-zenuml-participant':
        return this.resolveAddParticipant(doc, intent as Extract<ZenumlIntent, { type: 'add-zenuml-participant' }>)
      case 'set-zenuml-participant-alias':
        return this.resolveSetAlias(doc, intent as Extract<ZenumlIntent, { type: 'set-zenuml-participant-alias' }>)
      case 'rename-zenuml-participant':
        return this.resolveRenameParticipant(
          doc,
          intent as Extract<ZenumlIntent, { type: 'rename-zenuml-participant' }>,
        )
      case 'add-zenuml-message':
        return this.resolveAddMessage(doc, intent as Extract<ZenumlIntent, { type: 'add-zenuml-message' }>)
      case 'set-zenuml-message-text':
        return this.resolveSetMessageText(doc, intent as Extract<ZenumlIntent, { type: 'set-zenuml-message-text' }>)
      case 'delete-zenuml-message':
        return this.resolveDeleteMessage(doc, intent as Extract<ZenumlIntent, { type: 'delete-zenuml-message' }>)
      case 'delete-zenuml-participant':
        return this.resolveDeleteParticipant(
          doc,
          intent as Extract<ZenumlIntent, { type: 'delete-zenuml-participant' }>,
        )
      case 'set-zenuml-title':
        return this.resolveSetTitle(doc, intent as Extract<ZenumlIntent, { type: 'set-zenuml-title' }>)
      default:
        return null
    }
  }

  private participantPart(doc: SourceDocument, elementId: string): ElementPart | null {
    const part = getElementById(doc, elementId)
    if (part === undefined || part.element.kind !== 'zenuml-participant') return null
    return part
  }

  /** 渲染参与者行：`participant <id>[ as <aliasRaw>]`（含 tail；缩进属前一段 verbatim） */
  private renderParticipant(data: ZenumlParticipantData, changes: { id?: string; aliasRaw?: string | null } = {}): string {
    const id = changes.id ?? data.id
    const aliasRaw = changes.aliasRaw !== undefined ? changes.aliasRaw : data.aliasRaw
    const asPart = aliasRaw !== null ? `${data.asGap ?? ' as '}${aliasRaw}` : ''
    return `participant ${id}${asPart}${data.tail}`
  }

  /** 渲染消息行（不改缩进；tail 逐字保留） */
  private renderMessage(data: ZenumlMessageData): string {
    return `${data.assignPrefix}${this.renderMessageCore(data)}${data.tail}`
  }

  private renderMessageCore(data: ZenumlMessageData): string {
    if (data.messageKind === 'new') return `new ${data.method}${data.argsRaw ?? ''}`
    if (data.messageKind === 'return') return `return${data.argsRaw ?? ''}`
    // 异步：`<from>-><to>.<method>(args)`；同步：`<from>.<method>(args)`
    const call =
      data.operator === '->'
        ? `${data.from}->${data.to}${data.method !== '' ? `.${data.method}` : ''}`
        : `${data.from}.${data.method}`
    return `${call}${data.argsRaw ?? ''}`
  }

  /** 改参与者别名（`as "<别名>"`；别名裸词可含引号——由调用方给出 aliasRaw）；null = 删除别名段 */
  private resolveSetAlias(
    doc: SourceDocument,
    intent: Extract<ZenumlIntent, { type: 'set-zenuml-participant-alias' }>,
  ): Map<string, string> | null {
    const part = this.participantPart(doc, intent.elementId)
    if (part === null) return null
    const data = part.element as ZenumlParticipantData
    if (intent.alias === null) {
      return new Map([[part.id, this.renderParticipant(data, { aliasRaw: null })]])
    }
    if (!isValidZenumlLabel(intent.alias)) return null
    return new Map([[part.id, this.renderParticipant(data, { aliasRaw: `"${intent.alias}"` })]])
  }

  /** 改参与者标识符（连带重写消息端点引用；名字即身份） */
  private resolveRenameParticipant(
    doc: SourceDocument,
    intent: Extract<ZenumlIntent, { type: 'rename-zenuml-participant' }>,
  ): Map<string, string> | null {
    const part = this.participantPart(doc, intent.elementId)
    if (part === null) return null
    const oldId = (part.element as ZenumlParticipantData).id
    const newId = intent.id.trim()
    if (!isValidZenumlId(newId)) return null
    if (newId === oldId) return null
    const rewrites = new Map<string, string>([
      [part.id, this.renderParticipant(part.element as ZenumlParticipantData, { id: newId })],
    ])
    for (const other of doc.elements) {
      if (other.element.kind !== 'zenuml-message') continue
      const msg = other.element as ZenumlMessageData
      const from = msg.from === oldId ? newId : msg.from
      const to = msg.to === oldId ? newId : msg.to
      if (from === msg.from && to === msg.to) continue
      rewrites.set(other.id, this.renderMessage({ ...msg, from, to }))
    }
    return rewrites
  }

  /**
   * 新增参与者（`participant <id>[ as "<别名>"]`）；锚点缺省 = 文档末尾。
   * 锚点为参与者时插在其后（组内声明就近）。
   */
  private resolveAddParticipant(
    doc: SourceDocument,
    intent: Extract<ZenumlIntent, { type: 'add-zenuml-participant' }>,
  ): Map<string, string> | null {
    const id = intent.id.trim()
    if (!isValidZenumlId(id)) return null
    if (intent.alias !== undefined && !isValidZenumlLabel(intent.alias)) return null
    const aliasPart = intent.alias !== undefined ? ` as "${intent.alias}"` : ''
    return insertAfter(doc, {
      afterElementId: intent.afterElementId,
      anchor: intent.afterElementId !== undefined ? 'self' : 'line-end',
      render: (ind) => `\n${ind}participant ${id}${aliasPart}`,
    })
  }

  /**
   * 新增消息。形态由 messageKind 决定：
   * - sync：`<from>.<method>(args)`
   * - async：`<from>-><to>.<method>(args)`
   * - new：`new <to>(args)`
   * - return：`return <text>`
   * 锚点缺省 = 文档末尾；给 afterElementId 则落其后（**仅顶层**——不做块内插入锚点，工单 19）；
   * 若锚点落在片段体内，新行缩进跟随锚点行（缩进属前一段 verbatim）。
   */
  private resolveAddMessage(
    doc: SourceDocument,
    intent: Extract<ZenumlIntent, { type: 'add-zenuml-message' }>,
  ): Map<string, string> | null {
    const from = intent.from?.trim() ?? ''
    const to = intent.to?.trim() ?? ''
    const method = intent.method?.trim() ?? ''
    const args = intent.args ?? ''
    let core: string
    switch (intent.messageKind) {
      case 'new':
        if (!isValidZenumlId(to)) return null
        core = `new ${to}(${args})`
        break
      case 'return':
        core = `return${intent.text !== undefined && intent.text.trim() !== '' ? ` ${intent.text.trim()}` : ''}`
        break
      case 'async':
        if (!isValidZenumlId(from) || !isValidZenumlId(to) || (method !== '' && !isValidZenumlId(method))) return null
        core = `${from}->${to}${method === '' ? '' : `.${method}`}(${args})`
        break
      default:
        if (!isValidZenumlId(from) || !isValidZenumlId(method)) return null
        core = `${from}.${method}(${args})`
    }
    if (core.includes('\n')) return null
    return insertAfter(doc, {
      afterElementId: intent.afterElementId,
      anchor: intent.afterElementId !== undefined ? 'self' : 'line-end',
      render: (ind) => `\n${ind}${core}`,
    })
  }

  /**
   * 改消息文本（方法名 / 参数 / return 值）。**只改本行**，端点与 kinds 不变。
   * - sync / async：改方法名与参数
   * - new：改类名与参数
   * - return：改返回值（text）
   * 传 null 表示清空参数（仅 sync/async/new 有意义）。
   */
  private resolveSetMessageText(
    doc: SourceDocument,
    intent: Extract<ZenumlIntent, { type: 'set-zenuml-message-text' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'zenuml-message') return null
    const data = part.element as ZenumlMessageData
    const method = intent.method !== undefined ? intent.method.trim() : data.method
    if ((data.messageKind === 'sync' || data.messageKind === 'async' || data.messageKind === 'new') && !isValidZenumlId(method)) {
      return null
    }
    const argsRaw =
      intent.args !== undefined
        ? intent.args === null
          ? null
          : `(${intent.args})`
        : data.argsRaw
    const next: ZenumlMessageData = { ...data, method, argsRaw }
    return new Map([[part.id, this.renderMessage(next)]])
  }

  /** 删除消息行（仅删本行，其余逐字保留） */
  private resolveDeleteMessage(
    doc: SourceDocument,
    intent: Extract<ZenumlIntent, { type: 'delete-zenuml-message' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'zenuml-message') return null
    return new Map([[part.id, '']])
  }

  /** 删除参与者（删声明行；隐式端点由消息行持有，不级联——zenuml 隐式参与者无声明行） */
  private resolveDeleteParticipant(
    doc: SourceDocument,
    intent: Extract<ZenumlIntent, { type: 'delete-zenuml-participant' }>,
  ): Map<string, string> | null {
    const part = this.participantPart(doc, intent.elementId)
    if (part === null) return null
    return new Map([[part.id, '']])
  }

  /** 设置标题（`title <text>`）：已有则原地改，无则紧随声明头插入一行 */
  private resolveSetTitle(
    doc: SourceDocument,
    intent: Extract<ZenumlIntent, { type: 'set-zenuml-title' }>,
  ): Map<string, string> | null {
    const text = intent.text.trim()
    if (text === '' || /[\n]/.test(text) || text.includes('//')) return null
    const existing = doc.elements.find((p) => p.element.kind === 'zenuml-title')
    if (existing !== undefined) {
      const data = existing.element as ZenumlTitleData
      return new Map([[existing.id, `title${data.gap}${text}${data.tail}`]])
    }
    const header = doc.elements.find((p) => p.element.kind === 'zenuml-header')
    if (header === undefined) return null
    return insertAfter(doc, {
      afterElementId: header.id,
      anchor: 'self',
      render: (ind) => `\n${ind}title ${text}`,
    })
  }
}

interface RawEntry {
  span: Span
  id: string
  data: ZenumlElementData
}

export const zenumlParser = new ZenumlParser()

// ---------- 编辑意图（工单 19 表单 / 画布所需集合） ----------

export type ZenumlIntent =
  /** 新增参与者（`participant <id>[ as "<别名>"]`）；锚点缺省 = 文档末尾 */
  | { type: 'add-zenuml-participant'; id: string; alias?: string; afterElementId?: string }
  /** 改参与者别名（`as "<别名>"`）；alias 为 null = 删除别名段 */
  | { type: 'set-zenuml-participant-alias'; elementId: string; alias: string | null }
  /** 改参与者标识符（连带重写消息端点引用） */
  | { type: 'rename-zenuml-participant'; elementId: string; id: string }
  /** 新增消息（形态由 messageKind 决定；锚点缺省 = 文档末尾） */
  | {
      type: 'add-zenuml-message'
      messageKind: 'sync' | 'async' | 'new' | 'return'
      /** 发起方（sync / async 必填） */
      from?: string
      /** 接收方（async 的 `->` 右侧 / new 的构造类名） */
      to?: string
      /** 方法名（sync / async） */
      method?: string
      /** 参数原文（不含括号） */
      args?: string
      /** return 的返回值文本 */
      text?: string
      afterElementId?: string
    }
  /** 改消息文本（方法名 / 参数 / 返回值）；method 缺省不变；args 为 null = 清空参数 */
  | { type: 'set-zenuml-message-text'; elementId: string; method?: string; args?: string | null }
  /** 删除消息行（elementId = `message:N`） */
  | { type: 'delete-zenuml-message'; elementId: string }
  /** 删除参与者声明行 */
  | { type: 'delete-zenuml-participant'; elementId: string }
  /** 设置图表标题（`title <text>`） */
  | { type: 'set-zenuml-title'; text: string }
