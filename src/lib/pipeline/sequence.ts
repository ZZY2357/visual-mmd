import { assembleDocument, getElementById, type AnyElement, type ElementPart, type SourceDocument } from './document'
import type { DiagramParser, EditIntent, ParseResult, SourceParseError } from './parser'
import { frontmatterEnd } from './frontmatter'
import { participantElementId, withOccurrence } from './element-id'
import { lineAtOffset, type Span } from './span'
import { indentLines, insertAfter, lineIndent } from './insert'

/**
 * sequence 完整解析器（工单 06，语法范围以 ADR-0005 清单为准）：
 * 手写、逐行、带 span（ADR-0004）。可测试承诺：解析后不做修改再重组装，
 * 输出与输入逐字相同（verbatim identity）。
 *
 * 覆盖（ADR-0005）：
 * - participant / actor 声明（含 `as` 别名）
 * - create participant / create actor（参与者生命起点，ADR-0014）
 * - 四种消息箭头：->>（实线箭头）、-->（虚线）、-x（叉头）、--（无头）
 * - autonumber
 * - activate / deactivate（含消息简写 +/-：`A->>+B` 激活 B、`A-->>-B` 停用 B）
 * - note over / left of / right of
 * - 逻辑块：loop / alt-else / opt / par-and / critical / break（含嵌套）
 * - rect / box 区域块（工单 06，ADR-0014）：渲染产物无 data-id、不构成 DOM 包含，
 *   只做「解析 + 结构树可见 + 可改名」，不做分组编辑
 *
 * 不解析、原样保留（清单外语法不报错，ADR-0008）：destroy、注释、空行、
 * 以及一切无法识别的行。
 *
 * span 约定：元素 span 从该行首个非空白字符起、到行尾（不含换行）；
 * 行首缩进与换行永远留在 verbatim。
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

export interface SeqHeaderData {
  kind: 'seq-header'
  keyword: string
  trailing: string
}

export interface ParticipantData {
  kind: 'participant'
  /** 由 `create` 引入时为 `create` 关键字与其后空白的原文（如 `'create '`）；普通声明为 null（ADR-0014） */
  createPrefixRaw: string | null
  keyword: 'participant' | 'actor'
  gap: string
  actorId: string
  /** `as` 之后的原始别名文本（含引号）；无别名时 null */
  aliasRaw: string | null
}

export type MessageArrow = '->>' | '-->' | '-x' | '--'
export type MessageAct = '+' | '-' | ''

export interface MessageData {
  kind: 'message'
  from: string
  gap1: string
  arrow: MessageArrow
  /** 源码中的原始箭头 token（如 `-->>`）；不改箭头时原样保留 */
  arrowRaw: string
  /** 消息简写激活标记（箭头与目标参与者之间的 + / -） */
  act: MessageAct
  gap2: string
  to: string
  colonGap: string
  text: string
}

export interface AutonumberData {
  kind: 'autonumber'
  /** 整行原文（trim 后）；未改任何字段时逐字回写 */
  raw: string
  /** 起始值原文（第一个 token）；无参数时为 null */
  start: string | null
  /** 步长原文（第二个 token）；无步长时为 null */
  step: string | null
}

export interface ActivationData {
  kind: 'activation'
  keyword: 'activate' | 'deactivate'
  gap: string
  actorId: string
}

export type NotePos = 'over' | 'left' | 'right'

export interface NoteData {
  kind: 'note'
  gap1: string
  pos: NotePos
  /** pos 与冒号之间的原文（`over` 后是参与者列表，left/right 后是 ` of X`） */
  mid: string
  /** 参与者列表（over 可能有两个）；解析不出时为 null（mid 仍逐字保留） */
  actors: string[] | null
  colonGap: string
  text: string
}

export type BlockKeyword = 'loop' | 'alt' | 'opt' | 'par' | 'critical' | 'break'

export interface BlockOpenData {
  kind: 'block-open'
  keyword: BlockKeyword
  gap: string
  label: string | null
}

/** 块内的 else / and 分支行 */
export interface BlockElseData {
  kind: 'block-else'
  keyword: 'else' | 'and'
  gap: string
  label: string | null
}

export interface BlockEndData {
  kind: 'block-end'
}

/**
 * `rect <色值>` 区域块的开行（工单 06）。实测渲染为 `<rect class="rect">`、无 data-id，
 * 是 `<svg>` 的直接子元素（不构成 DOM 包含）；故只做可见与可改名。
 */
export interface RectOpenData {
  kind: 'rect-open'
  /** `rect` 与色值之间的空白 */
  gap: string
  /** 色值原文（`rect` 之后的整段，逐字保留） */
  colorRaw: string
}

/**
 * `box <颜色?> <标签?>` 参与者分组框的开行（工单 06）。实测是图形层叠而非 DOM 父子
 * （`participant DB` 仍照常获得 `g[DB]`），故同样只做可见与可改名。
 */
export interface BoxOpenData {
  kind: 'box-open'
  /** `box` 与内容之间的空白 */
  gap: string
  /** 前置颜色 token 原文（如 `Purple` / `rgb(...)`）；无颜色时为 null */
  colorRaw: string | null
  /** 颜色与标签之间的空白；无颜色时为 '' */
  colorGap: string
  /** 标签文本；无标签时为 null */
  label: string | null
}

/** rect / box（工单 06 统称「区域」）的收尾 `end` 行 */
export interface RegionEndData {
  kind: 'region-end'
}

export type SequenceElementData =
  | SeqHeaderData
  | ParticipantData
  | MessageData
  | AutonumberData
  | ActivationData
  | NoteData
  | BlockOpenData
  | BlockElseData
  | BlockEndData
  | RectOpenData
  | BoxOpenData
  | RegionEndData

// ---------- 渲染 ----------

export function renderParticipant(d: ParticipantData, changes: { actorId?: string; alias?: string | null } = {}): string {
  const actorId = changes.actorId ?? d.actorId
  // create 前缀（`create `）在改写后逐字保留：去掉它会把生命起点降级为普通声明（ADR-0014）
  const prefix = d.createPrefixRaw ?? ''
  if (changes.alias !== undefined) {
    return changes.alias === null || changes.alias === ''
      ? `${prefix}${d.keyword}${d.gap}${actorId}`
      : `${prefix}${d.keyword}${d.gap}${actorId} as ${quoteAlias(changes.alias)}`
  }
  return d.aliasRaw !== null ? `${prefix}${d.keyword}${d.gap}${actorId} as ${d.aliasRaw}` : `${prefix}${d.keyword}${d.gap}${actorId}`
}

/** 别名含空白/逗号时用双引号包起来（mermaid 要求） */
function quoteAlias(alias: string): string {
  return /[\s,]/.test(alias) ? `"${alias}"` : alias
}

export function stripAliasQuotes(aliasRaw: string): string {
  const trimmed = aliasRaw.trim()
  if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

export function renderMessage(d: MessageData, changes: Partial<Pick<MessageData, 'from' | 'arrow' | 'act' | 'to' | 'text'>> = {}): string {
  const from = changes.from ?? d.from
  // 未改箭头时用源码原始 token（-->> 等扩展写法逐字保留）；改箭头时用规范四种之一
  const arrowToken = changes.arrow !== undefined ? changes.arrow : (d.arrowRaw ?? d.arrow)
  const act = changes.act ?? d.act
  const to = changes.to ?? d.to
  const text = changes.text ?? d.text
  return `${from}${d.gap1}${arrowToken}${act}${d.gap2}${to}:${d.colonGap}${text}`
}

export function renderActivation(
  d: ActivationData,
  changes: { keyword?: 'activate' | 'deactivate'; actorId?: string } = {},
): string {
  const keyword = changes.keyword ?? d.keyword
  const actorId = changes.actorId ?? d.actorId
  return `${keyword}${d.gap}${actorId}`
}

/** 参数值归一：null / undefined / 空串 → 无该参数 */
function autonumberValue(v: string | null | undefined): string | null {
  return v === null || v === undefined || v === '' ? null : v
}

/**
 * autonumber 行（工单 08）：未改字段时逐字回写 `raw`（保留用户的多空白写法）；
 * 改动后按 mermaid 规范重建 `autonumber [start] [step]`——
 * 步长只有在起始值存在时才有意义，起始值被清空时步长一并去掉。
 */
export function renderAutonumber(
  d: AutonumberData,
  changes: { start?: string | null; step?: string | null } = {},
): string {
  if (changes.start === undefined && changes.step === undefined) return d.raw
  const start = autonumberValue(changes.start !== undefined ? changes.start : d.start)
  const step = autonumberValue(changes.step !== undefined ? changes.step : d.step)
  if (start === null) return 'autonumber'
  return step === null ? `autonumber ${start}` : `autonumber ${start} ${step}`
}

export function renderNote(d: NoteData, changes: Partial<Pick<NoteData, 'pos' | 'actors' | 'text'>> = {}): string {
  const pos = changes.pos ?? d.pos
  const text = changes.text ?? d.text
  let mid = d.mid
  if (changes.pos !== undefined || changes.actors !== undefined) {
    const actors = (changes.actors ?? d.actors ?? []).join(',')
    mid = pos === 'over' ? ` ${actors}` : ` of ${actors}`
  }
  return `Note${d.gap1}${pos}${mid}:${d.colonGap}${text}`
}

export function renderBlockOpen(d: BlockOpenData, changes: { label?: string | null } = {}): string {
  const label = changes.label !== undefined ? changes.label : d.label
  return label === null || label === '' ? d.keyword : `${d.keyword}${d.gap}${label}`
}

export function renderBlockElse(d: BlockElseData, changes: { label?: string | null } = {}): string {
  const label = changes.label !== undefined ? changes.label : d.label
  return label === null || label === '' ? d.keyword : `${d.keyword}${d.gap}${label}`
}

export function renderRectOpen(d: RectOpenData, changes: { color?: string } = {}): string {
  return `rect${d.gap}${changes.color ?? d.colorRaw}`
}

export function renderBoxOpen(d: BoxOpenData, changes: { label?: string | null } = {}): string {
  const label = changes.label !== undefined ? changes.label : d.label
  // 无颜色：整行内容就是标签；有颜色：颜色 token 逐字保留，只换标签
  if (d.colorRaw === null) return `box${d.gap}${label ?? ''}`
  return label === null || label === ''
    ? `box${d.gap}${d.colorRaw}`
    : `box${d.gap}${d.colorRaw}${d.colorGap}${label}`
}

// ---------- 行级解析 ----------

const HEADER_RE = /^([ \t]*)(sequenceDiagram)([ \t\r]*)$/i

interface RawEntry {
  span: Span
  id: string
  data: SequenceElementData
}

const PARTICIPANT_RE = /^(participant|actor)([ \t]+)(\S+)([ \t]+as[ \t]+(.+?))?[ \t]*$/i
/**
 * 生命起点声明：`create participant B` / `create actor B [as 别名]`（ADR-0014）。
 * `destroy` 仍不解析（视觉空操作，进模型会让画布与渲染结果不一致）。
 */
const CREATE_RE = /^create([ \t]+)(participant|actor)([ \t]+)(\S+)([ \t]+as[ \t]+(.+?))?[ \t]*$/i
const ACTIVATION_RE = /^(activate|deactivate)([ \t]+)(\S+)[ \t]*$/i
const AUTONUMBER_RE = /^autonumber([ \t]+.*)?[ \t]*$/i
const BLOCK_OPEN_RE = /^(loop|alt|opt|par|critical|break)(?:[ \t]+(.*?))?[ \t]*$/i
const BLOCK_ELSE_RE = /^(else|and)(?:[ \t]+(.*?))?[ \t]*$/i
/** 区域块开行（工单 06）：`rect <色值>`；`box <颜色?> <标签?>` */
const RECT_OPEN_RE = /^rect([ \t]+)(.*)$/i
const BOX_OPEN_RE = /^box([ \t]+)(.*)$/i
/**
 * box 行尾的「颜色 + 标签」拆分，按 mermaid 的 parseBoxData 形状（颜色在前、描述在后）：
 * 首段是 `rgb()/rgba()/hsl()/hsla()` 调用或一个单词。mermaid 还会用 window.CSS.supports
 * 校验单词是否为合法颜色名——解析器是纯函数（ADR-0004）不碰浏览器 API，故这里保守处理：
 * 仅当首段之后仍有非空白文本时才把它当颜色 token（`box Purple 组` → 颜色 Purple + 标签「组」），
 * 否则整段都是标签。逐字回写不受此拆分影响（renderBoxOpen 原样拼回）。
 */
const BOX_HEAD_RE = /^((?:rgba?|hsla?)\s*\(.*\)|\w*)([\s\S]*)$/
/**
 * 消息：from 箭头 [act] to : 文本（from 懒惰匹配，避免吞掉箭头字符）。
 * 箭头按最长优先：`-->>`（虚线+箭头头，mermaid 亦接受）归一为 `-->` 语义；
 * 箭头后禁止紧跟 `>` / `x`，防止 `--x`（清单外的叉头虚线）被误拆成 `--` 消息。
 */
const MESSAGE_RE = /^(\S+?)([ \t]*)(->>|-->>?|-x|->|--)(?![>x])([+-]?)([ \t]*)(\S+?)([ \t]*):(.*)$/

function parseNoteLine(raw: string): NoteData | null {
  // raw 是去缩进后的行文本，start（行内偏移）只对 line 有效，这里直接跳过 'Note' 关键字
  const body = raw.slice('Note'.length)
  // pos 分组只认关键字本身（over / left / right），`of` 单独放在可选分组里：
  // 曾经写成 `(over|left of|right of)` 把 `of` 吃进 pos 分组，随后 parseAfterOf 又要匹配一次
  // `of`，同一个 `of` 被消费两次 → left/right 的 actors 恒为 null（工单 13）。
  // mid = pos 关键字与冒号之间的原文（left/right 含 ` of X`），未改 pos/actors 时可逐字回写整行。
  const m = /^([ \t]+)(over|left|right)([ \t]+of)?(.*?):(.*)$/i.exec(body)
  if (m === null) return null
  const pos = m[2].toLowerCase() as NotePos
  // left / right 必须带 `of`（mermaid 语法），否则不认作 note（与原行为一致，原样保留）
  if (pos !== 'over' && m[3] === undefined) return null
  const mid = `${m[3] ?? ''}${m[4]}`
  const actors = pos === 'over' ? parseOverActorList(m[4]) : parseAfterOf(mid)
  return {
    kind: 'note',
    gap1: m[1],
    pos,
    mid,
    actors,
    colonGap: /^[ \t]*/.exec(m[5])?.[0] ?? '',
    text: m[5].replace(/^[ \t]*/, ''),
  }
}

/** `Note over A,B` → ['A','B']；`Note over A` → ['A']；解析不出时 null */
function parseOverActorList(mid: string): string[] | null {
  const parts = mid.split(',').map((p) => p.trim())
  if (parts.some((p) => p === '' || /\s/.test(p))) return null
  return parts
}

/** `Note right of A` 的 mid（` of A`）→ ['A']；解析不出时 null */
function parseAfterOf(mid: string): string[] | null {
  const m = /^[ \t]+of[ \t]+([^\s:,]+)[ \t]*$/i.exec(mid)
  if (m === null) return null
  return [m[1]]
}

function classifyLine(line: string, lineStart: number, lineNo: number, entries: RawEntry[], counters: Counters): void {
  const firstChar = line.length - line.trimStart().length
  const raw = line.trim()
  const span = { start: lineStart + firstChar, end: lineStart + line.length }

  // header 单独在外层判定

  const autonumber = AUTONUMBER_RE.exec(raw)
  if (autonumber !== null) {
    counters.autonumber++
    // 参数按空白切分：第一个 token = 起始值、第二个 = 步长（工单 08）。
    // 第三个及以后即使存在（非法语法）也只进 raw、改写时才消解。
    const tokens = raw.slice('autonumber'.length).trim().split(/[ \t]+/).filter((t) => t !== '')
    entries.push({
      span,
      id: withOccurrence('autonumber', counters.autonumber),
      data: { kind: 'autonumber', raw, start: tokens[0] ?? null, step: tokens[1] ?? null },
    })
    return
  }

  const activation = ACTIVATION_RE.exec(raw)
  if (activation !== null) {
    counters.activation++
    entries.push({
      span,
      id: `act:${counters.activation}`,
      data: { kind: 'activation', keyword: activation[1].toLowerCase() as 'activate' | 'deactivate', gap: activation[2], actorId: activation[3] },
    })
    return
  }

  if (/^note([ \t])/i.test(raw)) {
    const note = parseNoteLine(raw)
    if (note !== null) {
      counters.note++
      entries.push({ span, id: `note:${counters.note}`, data: note })
      return
    }
    return // 解析不了：原样保留
  }

  const create = CREATE_RE.exec(raw)
  if (create !== null) {
    // 重复 create 不在此校验（mermaid 侧会报 actors with the same id），解析器照常产出（工单 01）
    const actorId = create[4]
    counters.participant.set(actorId, (counters.participant.get(actorId) ?? 0) + 1)
    const count = counters.participant.get(actorId) as number
    entries.push({
      span,
      id: participantElementId(actorId, count),
      data: {
        kind: 'participant',
        createPrefixRaw: `create${create[1]}`,
        keyword: create[2].toLowerCase() as 'participant' | 'actor',
        gap: create[3],
        actorId,
        aliasRaw: create[6] ?? null,
      },
    })
    return
  }

  const participant = PARTICIPANT_RE.exec(raw)
  if (participant !== null) {
    const actorId = participant[3]
    counters.participant.set(actorId, (counters.participant.get(actorId) ?? 0) + 1)
    const count = counters.participant.get(actorId) as number
    entries.push({
      span,
      id: participantElementId(actorId, count),
      data: {
        kind: 'participant',
        createPrefixRaw: null,
        keyword: participant[1].toLowerCase() as 'participant' | 'actor',
        gap: participant[2],
        actorId,
        aliasRaw: participant[5] ?? null,
      },
    })
    return
  }

  const blockOpen = BLOCK_OPEN_RE.exec(raw)
  if (blockOpen !== null) {
    counters.block++
    entries.push({
      span,
      id: `block:${counters.block}`,
      data: { kind: 'block-open', keyword: blockOpen[1].toLowerCase() as BlockKeyword, gap: ' ', label: blockOpen[2] ?? null },
    })
    return
  }

  const blockElse = BLOCK_ELSE_RE.exec(raw)
  if (blockElse !== null) {
    counters.else++
    entries.push({
      span,
      id: `else:${counters.else}`,
      data: { kind: 'block-else', keyword: blockElse[1].toLowerCase() as 'else' | 'and', gap: ' ', label: blockElse[2] ?? null },
    })
    return
  }

  const rect = RECT_OPEN_RE.exec(raw)
  if (rect !== null) {
    counters.rect++
    entries.push({
      span,
      id: `rect:${counters.rect}`,
      data: { kind: 'rect-open', gap: rect[1], colorRaw: rect[2] },
    })
    return
  }

  const box = BOX_OPEN_RE.exec(raw)
  if (box !== null) {
    counters.box++
    const head = box[2]
    const m = BOX_HEAD_RE.exec(head)
    const first = m?.[1] ?? ''
    const rest = m?.[2] ?? ''
    // 首段之后仍有非空白文本 → 首段是颜色 token，其后是标签；否则整段都是标签
    const hasColor = first !== '' && /\S/.test(rest)
    const colorGap = hasColor ? (/^[ \t]*/.exec(rest)?.[0] ?? '') : ''
    entries.push({
      span,
      id: `box:${counters.box}`,
      data: {
        kind: 'box-open',
        gap: box[1],
        colorRaw: hasColor ? first : null,
        colorGap,
        label: hasColor ? rest.slice(colorGap.length) : head,
      },
    })
    return
  }

  const message = MESSAGE_RE.exec(raw)
  // from 以 - / > 结尾说明把箭头字符吃进了 from（如清单外的 `A--xB`），不按消息解析
  if (message !== null && !/[->]$/.test(message[1])) {
    counters.message++
    entries.push({
      span,
      id: `message:${counters.message}`,
      data: {
        kind: 'message',
        from: message[1],
        gap1: message[2],
        arrow: (message[3] === '-->>' ? '-->' : message[3]) as MessageArrow,
      arrowRaw: message[3],
        act: message[4] as MessageAct,
        gap2: message[5],
        to: message[6],
        colonGap: /^[ \t]*/.exec(message[8])?.[0] ?? '',
        text: message[8].replace(/^[ \t]*/, ''),
      },
    })
    return
  }

  // 其余（destroy、注释、无法识别的指令）不解析，verbatim 逐字保留
  void lineNo
}

interface Counters {
  message: number
  note: number
  activation: number
  block: number
  else: number
  autonumber: number
  rect: number
  box: number
  participant: Map<string, number>
}

/** 逻辑块的解析结构（工单 11 清理空块用）：open 行、属于该块的 else/and 行、匹配的 end 行 */
interface BlockShape {
  open: ElementPart
  end: ElementPart
  /** 该块的 else/and 边界行（按文档顺序；不含嵌套块的 else/and） */
  elseLines: ElementPart[]
}

// ---------- 解析器 ----------

export class SequenceParser implements DiagramParser {
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
      message: 0,
      note: 0,
      activation: 0,
      block: 0,
      else: 0,
      autonumber: 0,
      rect: 0,
      box: 0,
      participant: new Map(),
    }
    // 未闭合的「开行」栈：逻辑块（loop/alt/…）与区域块（rect/box，工单 06）共用，
    // `end` 关闭最内层。类型分开记录，好让 rect/box 的 end 出 `region-end`、
    // 不干扰逻辑块的 open/end 配对（matchingEnd / blockShapes / pruneEmptyBlocks）。
    const openStack: Array<{ lineNo: number; scope: 'block' | 'region' }> = []
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
      const trimmed = line.trim()

      if (trimmed !== '') {
        if (!seenHeader) {
          const header = HEADER_RE.exec(line)
          if (header === null) {
            throw parseFailure(lineNo, '图表必须以 sequenceDiagram 声明开始')
          }
          seenHeader = true
          entries.push({
            span: { start: cursor, end: cursor + line.length },
            id: 'header',
            data: { kind: 'seq-header', keyword: header[2], trailing: header[3] ?? '' },
          })
        } else if (trimmed === 'end') {
          const top = openStack.pop()
          if (top !== undefined) {
            const firstChar = line.length - line.trimStart().length
            const span = { start: cursor + firstChar, end: cursor + line.length }
            entries.push(
              top.scope === 'region'
                ? { span, id: `region-end:${lineNo}`, data: { kind: 'region-end' } }
                : { span, id: `end:${lineNo}`, data: { kind: 'block-end' } },
            )
          }
          // 无匹配开行的 end：不解析，原样保留（清单外的 end）
        } else {
          classifyLine(line, cursor, lineNo, entries, counters)
          const last = entries[entries.length - 1]
          if (last !== undefined && last.span.start >= cursor) {
            const kind = last.data.kind
            if (kind === 'block-open') openStack.push({ lineNo, scope: 'block' })
            else if (kind === 'rect-open' || kind === 'box-open') openStack.push({ lineNo, scope: 'region' })
          }
        }
      }

      if (nl === -1) break
      cursor = nl + 1
    }

    if (!seenHeader) {
      throw parseFailure(1, '图表必须以 sequenceDiagram 声明开始')
    }
    // 只有未闭合的逻辑块算语法错误。区域块（rect / box）的 end 属于「不解析、原样保留」，
    // 且 region 内嵌逻辑块时 end 只够关内层逻辑块，region 永远等不到自己的 end
    // （工单 01：此前能打开的图不能因此整图解析失败）。未闭合 region 的 rect-open /
    // box-open entry 照旧留下，投影里仍可见、仍可改名。
    for (let i = openStack.length - 1; i >= 0; i--) {
      const open = openStack[i]
      if (open.scope === 'block') throw parseFailure(open.lineNo, '逻辑块缺少匹配的 end')
    }
    return assembleDocument(source, entries)
  }

  // ---------- 意图落地（resolveRewrites） ----------

  resolveRewrites(doc: SourceDocument, intent: EditIntent): ReadonlyMap<string, string> | null {
    switch (intent.type) {
      case 'add-participant':
        return this.resolveAddParticipant(doc, intent as never)
      case 'set-participant':
        return this.resolveSetParticipant(doc, intent as never)
      case 'rename-participant':
        return this.resolveRenameParticipant(doc, intent as never)
      case 'delete-participant':
        return this.resolveDeleteParticipant(doc, intent as never)
      case 'toggle-activation':
        return this.resolveToggleActivation(doc, intent as never)
      case 'add-message':
        return this.resolveAddMessage(doc, intent as never)
      case 'set-message':
        return this.resolveSetMessage(doc, intent as never)
      case 'delete-message':
        return this.resolveDeleteMessage(doc, intent as never)
      case 'add-note':
        return this.resolveAddNote(doc, intent as never)
      case 'set-note':
        return this.resolveSetNote(doc, intent as never)
      case 'delete-note':
        return this.resolveDeleteNote(doc, intent as never)
      case 'set-autonumber':
        return this.resolveSetAutonumber(doc, intent as never)
      case 'add-block':
        return this.resolveAddBlock(doc, intent as never)
      case 'set-block-label':
        return this.resolveSetBlockLabel(doc, intent as never)
      case 'add-else':
        return this.resolveAddElse(doc, intent as never)
      case 'set-else-label':
        return this.resolveSetElseLabel(doc, intent as never)
      case 'delete-else':
        return this.resolveDeleteElse(doc, intent as never)
      case 'delete-block':
        return this.resolveDeleteBlock(doc, intent as never)
      case 'set-rect-color':
        return this.resolveSetRectColor(doc, intent as never)
      case 'set-box-label':
        return this.resolveSetBoxLabel(doc, intent as never)
      default:
        return null
    }
  }

  // ----- participant -----

  private resolveAddParticipant(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'add-participant' }>,
  ): Map<string, string> | null {
    if (!isValidParticipantId(intent.actorId)) return null
    const keyword = intent.isActor === true ? 'actor' : 'participant'
    const alias = intent.alias !== undefined && intent.alias !== '' ? ` as ${quoteAlias(intent.alias)}` : ''
    return insertAfter(doc, { afterElementId: intent.afterElementId, render: (indent) => indentLines(indent, [`${keyword} ${intent.actorId}${alias}`]) })
  }

  private resolveSetParticipant(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'set-participant' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, participantElementId(intent.actorId))
    if (part === undefined || part.element.kind !== 'participant') return null
    const changes: { alias?: string | null } = {}
    if (intent.alias !== undefined) changes.alias = intent.alias
    return new Map([[part.id, renderParticipant(part.element as ParticipantData, changes)]])
  }

  /** 改参与者 id：声明行 + 全部引用它的消息 / note / activate 行 */
  private resolveRenameParticipant(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'rename-participant' }>,
  ): Map<string, string> | null {
    if (!isValidParticipantId(intent.newId)) return null
    const decl = getElementById(doc, participantElementId(intent.actorId))
    if (decl === undefined || decl.element.kind !== 'participant') return null
    const rewrites = new Map<string, string>([
      [decl.id, renderParticipant(decl.element as ParticipantData, { actorId: intent.newId })],
    ])
    for (const part of doc.elements) {
      const data = part.element
      if (data.kind === 'message') {
        const msg = data as MessageData
        if (msg.from === intent.actorId || msg.to === intent.actorId) {
          rewrites.set(part.id, renderMessage(msg, { from: msg.from === intent.actorId ? intent.newId : undefined, to: msg.to === intent.actorId ? intent.newId : undefined }))
        }
      } else if (data.kind === 'note') {
        const note = data as NoteData
        if (note.actors !== null && note.actors.includes(intent.actorId)) {
          rewrites.set(part.id, renderNote(note, { actors: note.actors.map((a) => (a === intent.actorId ? intent.newId : a)) }))
        }
      } else if (data.kind === 'activation') {
        const act = data as ActivationData
        if (act.actorId === intent.actorId) {
          rewrites.set(part.id, renderActivation(act, { actorId: intent.newId }))
        }
      }
    }
    return rewrites
  }

  private referencesActor(part: { element: AnyElement }, actorId: string): boolean {
    const data = part.element
    if (data.kind === 'message') {
      const msg = data as MessageData
      return msg.from === actorId || msg.to === actorId
    }
    if (data.kind === 'note') {
      return (data as NoteData).actors?.includes(actorId) === true
    }
    if (data.kind === 'activation') {
      return (data as ActivationData).actorId === actorId
    }
    return false
  }

  /**
   * 删除参与者：声明与全部引用它的消息 / note / activate 行删除；
   * 被级联删空的 loop / alt 等块一并清理（工单 11，见 pruneEmptyBlocks）。
   */
  private resolveDeleteParticipant(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'delete-participant' }>,
  ): Map<string, string> | null {
    const decl = getElementById(doc, participantElementId(intent.actorId))
    if (decl === undefined || decl.element.kind !== 'participant') return null
    const deleted = new Set<string>([decl.id])
    for (const part of doc.elements) {
      if (this.referencesActor(part, intent.actorId)) deleted.add(part.id)
    }
    this.pruneEmptyBlocks(doc, deleted)
    return new Map([...deleted].map((id) => [id, '']))
  }

  /** 计算参与者当前净激活状态（+ / activate 计为开，- / deactivate 计为关） */
  private isActive(doc: SourceDocument, actorId: string): boolean {
    let active = false
    for (const part of doc.elements) {
      const data = part.element
      if (data.kind === 'message') {
        const msg = data as MessageData
        if (msg.to === actorId && msg.act === '+') active = true
        if (msg.to === actorId && msg.act === '-') active = false
      } else if (data.kind === 'activation' && (data as ActivationData).actorId === actorId) {
        active = (data as ActivationData).keyword === 'activate'
      }
    }
    return active
  }

  /** 切换参与者生命线激活状态：追加一行 activate/deactivate 到最后一次引用之后 */
  private resolveToggleActivation(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'toggle-activation' }>,
  ): Map<string, string> | null {
    const decl = getElementById(doc, participantElementId(intent.actorId))
    if (decl === undefined || decl.element.kind !== 'participant') return null
    const active = this.isActive(doc, intent.actorId)
    const referencing = doc.elements.filter((part) => this.referencesActor(part, intent.actorId))
    const last = referencing[referencing.length - 1] ?? decl
    const line = lineAtOffset(doc.source, last.span.start)
    const anchor =
      doc.elements
        .filter((part) => lineAtOffset(doc.source, part.span.start) === line)
        .sort((a, b) => b.span.end - a.span.end)[0] ?? last
    const indent = lineIndent(doc.source, anchor.span.start)
    const keyword = active ? 'deactivate' : 'activate'
    return new Map([[anchor.id, doc.source.slice(anchor.span.start, anchor.span.end) + `\n${indent}${keyword} ${intent.actorId}`]])
  }

  // ----- message -----

  private resolveAddMessage(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'add-message' }>,
  ): Map<string, string> | null {
    if (intent.from === '' || intent.to === '') return null
    const data: MessageData = {
      kind: 'message',
      from: intent.from,
      gap1: '',
      arrow: intent.arrow ?? '->>',
      arrowRaw: intent.arrow ?? '->>',
      act: intent.act ?? '',
      gap2: '',
      to: intent.to,
      colonGap: ' ',
      text: intent.text ?? '',
    }
    return insertAfter(doc, { afterElementId: intent.afterElementId, render: (indent) => indentLines(indent, [renderMessage(data)]) })
  }

  private resolveSetMessage(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'set-message' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'message') return null
    const changes: Partial<Pick<MessageData, 'from' | 'arrow' | 'act' | 'to' | 'text'>> = {}
    if (intent.arrow !== undefined) changes.arrow = intent.arrow
    if (intent.act !== undefined) changes.act = intent.act
    if (intent.text !== undefined) changes.text = intent.text
    return new Map([[part.id, renderMessage(part.element as MessageData, changes)]])
  }

  private resolveDeleteMessage(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'delete-message' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'message') return null
    return new Map([[part.id, '']])
  }

  // ----- note -----

  private resolveAddNote(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'add-note' }>,
  ): Map<string, string> | null {
    const actors = intent.actors.filter((a) => a !== '')
    if (actors.length === 0) return null
    if (intent.pos !== 'over' && actors.length !== 1) return null
    const data: NoteData = {
      kind: 'note',
      gap1: ' ',
      pos: intent.pos,
      mid: '',
      actors,
      colonGap: ' ',
      text: intent.text ?? '',
    }
    return insertAfter(doc, { afterElementId: intent.afterElementId, render: (indent) => indentLines(indent, [renderNote(data, { actors })]) })
  }

  private resolveSetNote(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'set-note' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'note') return null
    const note = part.element as NoteData
    const changes: Partial<Pick<NoteData, 'pos' | 'actors' | 'text'>> = {}
    if (intent.pos !== undefined) changes.pos = intent.pos
    if (intent.actors !== undefined) {
      const actors = intent.actors.filter((a) => a !== '')
      if (actors.length === 0) return null
      if (changes.pos ?? note.pos) {
        if ((changes.pos ?? note.pos) !== 'over' && actors.length !== 1) return null
      }
      changes.actors = actors
    }
    // over（两个参与者）改为 left/right 时只保留第一个参与者
    const pos = changes.pos ?? note.pos
    if (pos !== 'over') {
      const actors = changes.actors ?? note.actors
      if (actors !== null && actors.length > 1) changes.actors = [actors[0]]
    }
    if (intent.text !== undefined) changes.text = intent.text
    return new Map([[part.id, renderNote(note, changes)]])
  }

  private resolveDeleteNote(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'delete-note' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'note') return null
    return new Map([[part.id, '']])
  }

  // ----- autonumber -----

  private resolveSetAutonumber(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'set-autonumber' }>,
  ): Map<string, string> | null {
    const existing = doc.elements.find((part) => part.element.kind === 'autonumber')
    const hasParams = intent.start !== undefined || intent.step !== undefined
    if (intent.enabled) {
      if (existing !== undefined) {
        // 行已存在：只调开关时不改动，带参数时原地改写该行（工单 08）
        if (!hasParams) return new Map()
        return new Map([
          [existing.id, renderAutonumber(existing.element as AutonumberData, { start: intent.start, step: intent.step })],
        ])
      }
      const header = doc.elements.find((part) => part.element.kind === 'seq-header')
      if (header === undefined) return null
      const base: AutonumberData = { kind: 'autonumber', raw: 'autonumber', start: null, step: null }
      const line = hasParams ? renderAutonumber(base, { start: intent.start, step: intent.step }) : 'autonumber'
      return new Map([[header.id, doc.source.slice(header.span.start, header.span.end) + `\n${line}`]])
    }
    if (existing === undefined) return new Map()
    return new Map([[existing.id, '']])
  }

  // ----- 逻辑块 -----

  private resolveAddBlock(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'add-block' }>,
  ): Map<string, string> | null {
    const keyword = intent.keyword
    const label = intent.label !== undefined && intent.label !== '' ? ` ${intent.label}` : ''
    return insertAfter(doc, { afterElementId: intent.afterElementId, render: (indent) => indentLines(indent, [`${keyword}${label}`, 'end']) })
  }

  /** 块的匹配 end（按 open/end 深度计数） */
  private matchingEnd(doc: SourceDocument, open: { span: Span }): { id: string; span: Span } | null {
    let depth = 1
    for (const part of doc.elements) {
      if (part.span.start <= open.span.start) continue
      if (part.element.kind === 'block-open') depth++
      if (part.element.kind === 'block-end') {
        depth--
        if (depth === 0) return { id: part.id, span: part.span }
      }
    }
    return null
  }

  /** 按文档顺序配对出全部块结构（open / 本块 else 行 / 匹配 end）；嵌套块的 else 不串到外层 */
  private blockShapes(doc: SourceDocument): BlockShape[] {
    const shapes: BlockShape[] = []
    const stack: BlockShape[] = []
    for (const part of doc.elements) {
      if (part.element.kind === 'block-open') {
        stack.push({ open: part, end: part, elseLines: [] })
      } else if (part.element.kind === 'block-else') {
        stack[stack.length - 1]?.elseLines.push(part)
      } else if (part.element.kind === 'block-end') {
        const shape = stack.pop()
        if (shape !== undefined) {
          shape.end = part
          shapes.push(shape)
        }
      }
    }
    return shapes
  }

  /** 区间 (start, end) 内是否存在"未被删除"的元素（即该分支仍有语句） */
  private hasLiveElement(doc: SourceDocument, start: number, end: number, deleted: ReadonlySet<string>): boolean {
    return doc.elements.some((part) => part.span.start >= start && part.span.end <= end && !deleted.has(part.id))
  }

  /** 区间 (start, end) 内是否存在"本次被删除"的元素（用于区分原本就空与本次删空） */
  private hasDeletedElement(doc: SourceDocument, start: number, end: number, deleted: ReadonlySet<string>): boolean {
    return doc.elements.some((part) => part.span.start >= start && part.span.end <= end && deleted.has(part.id))
  }

  /**
   * 级联删除后清理空块（工单 11）：
   * - 某分支的语句被本次删除删空 → 摘掉该分支的分界行（首个分支摘终止它的 else，其余摘起头它的 else）；
   * - 所有分支都空 → 整块移除（open + 全部 else + end）；
   * - 迭代到不动点：内层块先被移除，外层块才可能随之变空。
   *
   * 只清理"本次删除造成的空"：原本就空的块 / 分支不碰（verbatim 底线）。
   * 空块会让 mermaid 渲染期产出成批 `attribute …: Expected length, "NaN"` console error。
   */
  private pruneEmptyBlocks(doc: SourceDocument, deleted: Set<string>): void {
    const shapes = this.blockShapes(doc)
    let changed = true
    while (changed) {
      changed = false
      for (const shape of shapes) {
        if (deleted.has(shape.open.id)) continue
        // 分支边界：open → 仍存活的 else/and 行 → end；相邻两界之间即一个分支
        const bounds: ElementPart[] = [shape.open, ...shape.elseLines.filter((p) => !deleted.has(p.id)), shape.end]
        const branches = bounds.slice(0, -1).map((start, i) => {
          const end = bounds[i + 1]
          return {
            start,
            end,
            empty: !this.hasLiveElement(doc, start.span.end, end.span.start, deleted),
            touched: this.hasDeletedElement(doc, start.span.end, end.span.start, deleted),
          }
        })
        const emptied = branches.filter((b) => b.empty && b.touched)
        if (emptied.length === 0) continue
        if (branches.every((b) => b.empty)) {
          deleted.add(shape.open.id)
          for (const line of shape.elseLines) deleted.add(line.id)
          deleted.add(shape.end.id)
          changed = true
          continue
        }
        for (const branch of emptied) {
          // 首个分支由 open 起头（不可删），摘终止它的 else；其余分支摘起头它的 else
          const boundary = branch.start === shape.open ? branch.end : branch.start
          if (boundary.element.kind === 'block-else' && !deleted.has(boundary.id)) {
            deleted.add(boundary.id)
            changed = true
          }
        }
      }
    }
  }

  private resolveSetBlockLabel(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'set-block-label' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'block-open') return null
    return new Map([[part.id, renderBlockOpen(part.element as BlockOpenData, { label: intent.label })]])
  }

  /** 在块的匹配 end 前插入 else/and 行（继承 end 行缩进） */
  private resolveAddElse(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'add-else' }>,
  ): Map<string, string> | null {
    const block = getElementById(doc, intent.blockId)
    if (block === undefined || block.element.kind !== 'block-open') return null
    const end = this.matchingEnd(doc, block)
    if (end === null) return null
    const keyword = intent.keyword ?? 'else'
    const label = intent.label !== undefined && intent.label !== '' ? ` ${intent.label}` : ''
    const indent = lineIndent(doc.source, end.span.start)
    // end 元素 span 不含行首缩进（缩进属于 verbatim），改写体不需要前导换行：
    // 原缩进 + `else 行\n缩进 + end` 恰好接在原缩进之后
    return new Map([[end.id, `${keyword}${label}\n${indent}${doc.source.slice(end.span.start, end.span.end)}`]])
  }

  private resolveSetElseLabel(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'set-else-label' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'block-else') return null
    return new Map([[part.id, renderBlockElse(part.element as BlockElseData, { label: intent.label })]])
  }

  private resolveDeleteElse(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'delete-else' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'block-else') return null
    return new Map([[part.id, '']])
  }

  private resolveDeleteBlock(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'delete-block' }>,
  ): Map<string, string> | null {
    const open = getElementById(doc, intent.elementId)
    if (open === undefined || open.element.kind !== 'block-open') return null
    const end = this.matchingEnd(doc, open)
    if (end === null) return null
    const rewrites = new Map<string, string>()
    for (const part of doc.elements) {
      if (part.span.start >= open.span.start && part.span.end <= end.span.end) {
        rewrites.set(part.id, '')
      }
    }
    return rewrites
  }

  // ----- rect / box 区域块（工单 06：只做可见与可改名，不做分组编辑） -----

  private resolveSetRectColor(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'set-rect-color' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'rect-open') return null
    return new Map([[part.id, renderRectOpen(part.element as RectOpenData, { color: intent.color })]])
  }

  private resolveSetBoxLabel(
    doc: SourceDocument,
    intent: Extract<SequenceIntent, { type: 'set-box-label' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'box-open') return null
    return new Map([[part.id, renderBoxOpen(part.element as BoxOpenData, { label: intent.label })]])
  }
}

/** 新建参与者 id 的合法性校验（表单层复用，与意图落地侧同一规则） */
export function isValidParticipantId(id: string): boolean {
  return /^[^\s:,]+$/.test(id) && id !== 'end'
}

export function isValidMessageArrow(arrow: string): arrow is MessageArrow {
  return arrow === '->>' || arrow === '-->' || arrow === '-x' || arrow === '--'
}

// ---------- 编辑意图（工单 06 表单所需集合） ----------

export type SequenceIntent =
  /** 新增参与者声明行 */
  | { type: 'add-participant'; actorId: string; isActor?: boolean; alias?: string; afterElementId?: string }
  /** 改参与者别名；null = 去掉 as 别名 */
  | { type: 'set-participant'; actorId: string; alias?: string | null }
  /** 改参与者 id（声明 + 全部引用） */
  | { type: 'rename-participant'; actorId: string; newId: string }
  /** 删除参与者（声明 + 全部引用它的行） */
  | { type: 'delete-participant'; actorId: string }
  /** 切换参与者生命线激活状态（追加 activate/deactivate 行） */
  | { type: 'toggle-activation'; actorId: string }
  /** 新增消息行 */
  | { type: 'add-message'; from: string; to: string; arrow?: MessageArrow; act?: MessageAct; text?: string; afterElementId?: string }
  /** 改消息（箭头 / 激活简写 / 文本）；未给出的字段保持不变 */
  | { type: 'set-message'; elementId: string; arrow?: MessageArrow; act?: MessageAct; text?: string }
  | { type: 'delete-message'; elementId: string }
  /** 新增 note 行 */
  | { type: 'add-note'; pos: NotePos; actors: string[]; text?: string; afterElementId?: string }
  /** 改 note（位置 / 参与者 / 文本） */
  | { type: 'set-note'; elementId: string; pos?: NotePos; actors?: string[]; text?: string }
  | { type: 'delete-note'; elementId: string }
  /**
   * 开/关 autonumber（开：header 后插入；关：删除 autonumber 行）。
   * `start` / `step`（工单 08）缺省 = 保持不变；给定时原地改写起始值 / 步长，
   * 行不存在则按参数新建。`null` = 清空该参数（步长随起始值一并清空）。
   */
  | { type: 'set-autonumber'; enabled: boolean; start?: string | null; step?: string | null }
  /** 新增逻辑块（open + end 两行） */
  | { type: 'add-block'; keyword: BlockKeyword; label?: string; afterElementId?: string }
  /** 改逻辑块标签 */
  | { type: 'set-block-label'; elementId: string; label: string | null }
  /** 在块内追加 else/and 分支（插到匹配 end 之前） */
  | { type: 'add-else'; blockId: string; keyword?: 'else' | 'and'; label?: string }
  /** 改 else/and 分支标签 */
  | { type: 'set-else-label'; elementId: string; label: string | null }
  /** 删除 else/and 分支行 */
  | { type: 'delete-else'; elementId: string }
  /** 删除逻辑块（open 到匹配 end 的全部元素） */
  | { type: 'delete-block'; elementId: string }
  /** 改 rect 区域块的色值（工单 06） */
  | { type: 'set-rect-color'; elementId: string; color: string }
  /** 改 box 分组框的标签文本（工单 06；颜色 token 原样保留） */
  | { type: 'set-box-label'; elementId: string; label: string | null }

export const sequenceParser = new SequenceParser()
