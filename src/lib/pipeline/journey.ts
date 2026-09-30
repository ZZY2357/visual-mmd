import { assembleDocument, getElementById, type ElementPart, type SourceDocument } from './document'
import { frontmatterEnd } from './frontmatter'
import { insertAfter } from './insert'
import type { DiagramParser, EditIntent, ParseResult, SourceParseError } from './parser'
import type { Span } from './span'

/**
 * journey（用户旅程图）完整解析器（more-diagrams 工单 08，语法事实以
 * spec 的 research/journey-block-catalog.md B1 节为准，勿重复调研）：
 * 手写、逐行、带 span（ADR-0004）。可测试承诺：解析后不做修改再重组装，
 * 输出与输入逐字相同（verbatim identity）。
 *
 * 覆盖（分层对齐，spec 决策）：
 * - 声明头 `journey`、`title 标题文本`（单行）、`section 名称`
 * - 任务行 `Task name: score: actors`（score 1–5 整数、逗号分隔 actor 列表；
 *   只有 `name: score` 的两段形态也认——mermaid 的 addTask 对单段 taskData 只取 score）
 *
 * 词法边界（mermaid journey 词法实证，工单 Comments 记录结论）：
 * - task name 的词法规则是 `[^#:\n;]+`——冒号/井号/分号/换行都会终止 name；
 * - taskData 的词法规则是 `:[^#\n;]+`——actor 段内不能再出现裸 `#` / `;`；
 * - **引号不是转义机制**：词法里没有任何字符串字面量规则，`"A: B"` 会被切成
 *   name=`"A` + taskData=`: B"`（引号原样留在文本里），而非带冒号的完整名字。
 *   因此「表单输入含冒号时自动给 name 加引号」**不可行**，落码侧一律拒绝
 *   （isValidJourneyTaskName / isValidJourneyActor 返回 false，由表单提示）。
 * - score 段按 mermaid 的 `Number()` 宽松解析：只有「整数 1–5」合法；越界整数与
 *   非数字都解析保留原文、由结构树/表单标注（不静默改写用户源码）。
 * - taskData 第三个冒号之后的片段 mermaid 直接忽略（addTask 只取 pieces[0]/[1]）；
 *   手术改写该行时按「name: score: actors」重建，被忽略的尾部片段随之消失（记录在案）。
 *
 * span 约定（与 timeline 同口径，行级）：行首缩进与换行留在 verbatim；元素 span 不跨行；
 * 行尾空白归 tail 字段逐字保留。不解析、原样保留（清单外语法不报错，ADR-0008）：
 * frontmatter、`%%` 注释、`accTitle` / `accDescr`（含多行 `accDescr {}`，工单明确不做编辑）、
 * `#` 注释行、无法识别的行。
 *
 * 身份（ADR-0012 位置序）：`task:N` / `section:N` 均按文档序 1 基编号——journey 的
 * 语法里没有节点 id（research 已核查），位置序是唯一可行身份；元素 id 走字面量，
 * 无需 element-id.ts 的名字编解码。
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

export interface JourneyHeaderData {
  kind: 'journey-header'
  /** `journey` 之后到行尾的原文（空白），逐字保留 */
  trailing: string
}

export interface JourneyTitleData {
  kind: 'journey-title'
  /** `title` 与标题之间的空白原文 */
  gap: string
  /** 标题文本（gap 之后到 `#` 注释起点，去尾空白）；改写时行尾注释不保留（与 timeline 同口径） */
  text: string
}

/** `section 名称` 行；名称词法 `section\s[^#:\n;]+`（不含 `:` `#` `;` 换行） */
export interface JourneySectionData {
  kind: 'journey-section'
  /** `section` 与名称之间的空白原文 */
  gap: string
  /** 名称文本（逐字保留） */
  name: string
}

export function renderJourneySection(d: JourneySectionData, changes: { name?: string } = {}): string {
  return `section${d.gap}${changes.name ?? d.name}`
}

/**
 * 任务行数据。行形状：`indent? name gap1 ':' gapScore score [':' gap2 actors] tail`
 * - `name` 已去首尾空白；空白 / `#` 注释都记进 `tail`（改写时逐字回写）
 * - `score` / `actors` 是两段冒号之间的原文（外侧空白已裁，各自冒号后的空白存 gapScore
 *   / gap2 逐字回写）；**越界/非数字 score 原样保留**（结构树标注，不静默改写）
 * - 无第二冒号时 hasActors = false（mermaid 语义：taskData 只有一段 → 只有 score）
 */
export interface JourneyTaskData {
  kind: 'journey-task'
  /** 任务名（不含 `:` `#` `;` 换行；去首尾空白后的原文） */
  name: string
  /** name 与第一个 `:` 之间的空白原文 */
  gap1: string
  /** 第一个 `:` 与 score 段之间的空白原文 */
  gapScore: string
  /** score 段原文（去外侧空白）；越界/非数字保留原文 */
  score: string
  /** 是否有第二冒号（actor 段） */
  hasActors: boolean
  /** 第二个 `:` 与 actor 段之间的空白原文（仅 hasActors 时有意义） */
  gap2: string
  /** actor 段原文（去外侧空白；逗号分隔，actor 内的冒号按 mermaid 语义合法） */
  actors: string
  /** 行尾原文（尾随空白 / `#` 注释），逐字保留 */
  tail: string
}

/** 任务行原文重建。changes 任一字段缺省 = 逐字保留原文 */
export function renderJourneyTask(
  d: JourneyTaskData,
  changes: { name?: string; score?: string; actors?: string | null } = {},
): string {
  const name = changes.name ?? d.name
  const score = changes.score ?? d.score
  // actors: 省略 = 保持原样（含「原本就没有第二段」）；null / 空串 = 移除 actor 段；
  // 非空串 = 重建第二段（hasActors 由此转为 true，gap2 用原值或补单空格）
  const actorsValue = changes.actors === undefined ? d.actors : changes.actors
  const hasActors = changes.actors === undefined ? d.hasActors : actorsValue !== null && actorsValue !== ''
  const gap2 =
    changes.actors === undefined || !hasActors ? d.gap2 : d.gap2 === '' ? ' ' : d.gap2
  const actorsPart = hasActors ? `:${gap2}${actorsValue}` : ''
  return `${name}${d.gap1}:${d.gapScore}${score}${actorsPart}${d.tail}`
}

export type JourneyElementData =
  | JourneyHeaderData
  | JourneyTitleData
  | JourneySectionData
  | JourneyTaskData

// ---------- 词法助手与校验 ----------

/** 合法 score 取值（1–5 整数；表单选择器与校验共用，research B1 坑 1） */
export const JOURNEY_SCORES = [1, 2, 3, 4, 5] as const

const HEADER_RE = /^journey[ \t\r]*$/i
const TITLE_PREFIX = /^title[ \t]/
const SECTION_PREFIX = /^section[ \t]/
const ACC_PREFIX = /^acc(Title|Descr)\b/i

/**
 * 任务名合法性（mermaid 词法 `[^#:\n;]+` + 非空）：不能为空白，
 * 不能含 `:` `#` `;` 与换行。**引号不救冒号**（词法无字符串字面量，见文件头注释），
 * 含冒号的输入只能拒绝，不自动加引号。
 */
export function isValidJourneyTaskName(name: string): boolean {
  return name.trim() !== '' && !/[:#;\n]/.test(name)
}

/** section 名称合法性（mermaid 词法 `section\s[^#:\n;]+`）：非空、不含 `:` `#` `;` 换行 */
export function isValidJourneySectionName(name: string): boolean {
  return name.trim() !== '' && !/[:#;\n]/.test(name)
}

/** actor 合法性：非空、不含逗号（逗号是 actor 分隔符，含逗号的 actor 会落码成两个）、
 * 不含 `#` `;`（taskData 词法在此终止）与换行。冒号在 taskData 段内合法（mermaid
 * addTask 用冒号切 score/actors 之外的片段直接忽略，为稳妥一并拒绝）。 */
export function isValidJourneyActor(actor: string): boolean {
  return actor.trim() !== '' && !/[,:#;\n]/.test(actor)
}

/** score 段原文 → 数值：仅「整数」可解析（mermaid 的 Number() 宽松解析的严谨子集）；非整数字面量 null */
export function parseJourneyScore(score: string): number | null {
  return /^\d+$/.test(score.trim()) ? Number(score.trim()) : null
}

/** score 是否合法（1–5 整数，research B1 坑 1） */
export function isJourneyScoreInRange(score: string): boolean {
  const n = parseJourneyScore(score)
  return n !== null && n >= 1 && n <= 5
}

/** actor 段原文 → actor 列表（逗号分隔、逐项裁空白、空项丢弃——与 mermaid peopleList 同口径） */
export function parseJourneyActors(actorsRaw: string): string[] {
  return actorsRaw
    .split(',')
    .map((a) => a.trim())
    .filter((a) => a !== '')
}

// ---------- 解析器 ----------

interface RawEntry {
  span: Span
  id: string
  data: JourneyElementData
}

/** 行内先于 `#` 注释的正文区长度（`#` 起注释逐字归 tail）；无注释 = 行长 */
function bodyLength(line: string): number {
  const hash = line.indexOf('#')
  return hash === -1 ? line.length : hash
}

/** 任务行解析：`name : score [: actors] tail`。不合文法返回 null（整行原样保留）。 */
function parseTaskLine(line: string): JourneyTaskData | null {
  const bodyEnd = bodyLength(line)
  // name：第一个 `:`（或注释起点）之前；先裁掉行尾空白定位真正的冒号
  const colon1 = line.indexOf(':', 0)
  const nameEnd = Math.min(colon1 === -1 ? line.length : colon1, bodyEnd)
  const name = line.slice(0, nameEnd).trimEnd()
  if (name.trim() === '') return null
  if (colon1 === -1 || colon1 >= bodyEnd) return null
  const gap1 = line.slice(name.length, colon1)
  // score 段：colon1 之后到第二个冒号 / 注释起点
  const colon2 = line.indexOf(':', colon1 + 1)
  const scoreEnd = Math.min(colon2 === -1 ? bodyEnd : colon2, bodyEnd)
  const scoreRaw = line.slice(colon1 + 1, scoreEnd)
  const score = scoreRaw.trim()
  if (score === '') return null
  const gapScore = scoreRaw.slice(0, scoreRaw.length - scoreRaw.trimStart().length)
  let hasActors = false
  let gap2 = ''
  let actors = ''
  if (colon2 !== -1 && colon2 < bodyEnd) {
    hasActors = true
    const actorsRaw = line.slice(colon2 + 1, bodyEnd)
    gap2 = actorsRaw.slice(0, actorsRaw.length - actorsRaw.trimStart().length)
    actors = actorsRaw.trim()
  }
  const tail = line.slice(bodyEnd)
  return { kind: 'journey-task', name, gap1, gapScore, score, hasActors, gap2, actors, tail }
}

export class JourneyParser implements DiagramParser {
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
    let taskCount = 0
    let sectionCount = 0
    let seenHeader = false
    // 文首 frontmatter 块不参与解析，整体 verbatim 保留
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
        const firstChar = line.length - line.trimStart().length
        const spanOfLine = (): Span => ({ start: cursor + firstChar, end: lineEndAbs })

        if (!seenHeader) {
          if (!HEADER_RE.test(trimmed)) {
            throw parseFailure(lineNo, '图表必须以 journey 声明开始')
          }
          seenHeader = true
          entries.push({
            span: spanOfLine(),
            id: 'journey-header',
            data: { kind: 'journey-header', trailing: line.slice(firstChar + 'journey'.length) },
          })
        } else if (trimmed.startsWith('%%') || ACC_PREFIX.test(trimmed) || trimmed.startsWith('#')) {
          // 注释 / 可访问性语句（含多行 accDescr {} 的花括号行，工单明确不做编辑）：逐字保留
        } else if (TITLE_PREFIX.test(trimmed)) {
          const rest = line.slice(firstChar + 'title'.length)
          const bodyEnd = (() => { const h = rest.indexOf('#'); return h === -1 ? rest.length : h })()
          const raw = rest.slice(0, bodyEnd)
          const text = raw.trim()
          if (text !== '') {
            entries.push({
              span: spanOfLine(),
              id: 'journey-title',
              data: { kind: 'journey-title', gap: raw.slice(0, raw.length - raw.trimStart().length), text },
            })
          }
          // 空标题等清单外形态：不解析，逐字保留
        } else if (SECTION_PREFIX.test(trimmed)) {
          const rest = line.slice(firstChar + 'section'.length)
          const bodyEnd = (() => { const h = rest.indexOf('#'); return h === -1 ? rest.length : h })()
          const raw = rest.slice(0, bodyEnd)
          const name = raw.trim()
          if (name !== '' && !/[:#;\n]/.test(name)) {
            sectionCount++
            entries.push({
              span: spanOfLine(),
              id: `section:${sectionCount}`,
              data: { kind: 'journey-section', gap: raw.slice(0, raw.length - raw.trimStart().length), name },
            })
          }
          // 名称含 `:` 等清单外形态：不解析，逐字保留
        } else {
          const task = parseTaskLine(line.slice(firstChar))
          if (task !== null) {
            taskCount++
            entries.push({
              span: spanOfLine(),
              id: `task:${taskCount}`,
              data: task,
            })
          }
          // 清单外 / 无法识别：不解析，逐字保留
        }
      }

      if (nl === -1) break
      cursor = nl + 1
    }

    if (!seenHeader) {
      throw parseFailure(1, '图表必须以 journey 声明开始')
    }
    return assembleDocument(source, entries)
  }

  // ---------- 意图落地（resolveRewrites） ----------

  resolveRewrites(doc: SourceDocument, intent: EditIntent): ReadonlyMap<string, string> | null {
    switch (intent.type) {
      case 'add-task':
        return this.resolveAddTask(doc, intent as never)
      case 'set-task-name':
        return this.resolveSetTaskName(doc, intent as never)
      case 'set-task-score':
        return this.resolveSetTaskScore(doc, intent as never)
      case 'set-task-actors':
        return this.resolveSetTaskActors(doc, intent as never)
      case 'delete-task':
        return this.resolveDeleteTask(doc, intent as never)
      case 'add-section':
        return this.resolveAddSection(doc, intent as never)
      case 'set-section-name':
        return this.resolveSetSectionName(doc, intent as never)
      case 'delete-section':
        return this.resolveDeleteSection(doc, intent as never)
      case 'set-title':
        return this.resolveSetTitle(doc, intent as never)
      default:
        return null
    }
  }

  private taskPart(doc: SourceDocument, elementId: string): ElementPart | null {
    const part = getElementById(doc, elementId)
    return part !== undefined && part.element.kind === 'journey-task' ? part : null
  }

  private sectionPart(doc: SourceDocument, elementId: string): ElementPart | null {
    const part = getElementById(doc, elementId)
    return part !== undefined && part.element.kind === 'journey-section' ? part : null
  }

  /** 某 section 的任务（文档序：该 section 行之后、下一个 section 行之前的全部任务） */
  private tasksOfSection(doc: SourceDocument, sectionElementId: string): ElementPart[] {
    const out: ElementPart[] = []
    let current: string | null = null
    for (const part of doc.elements) {
      if (part.element.kind === 'journey-section') current = part.id
      else if (part.element.kind === 'journey-task' && current === sectionElementId) out.push(part)
    }
    return out
  }

  /**
   * 新增任务：带 sectionElementId 时落在该 section 最后一个任务之后（无任务则紧随
   * section 行）；不带（空白菜单「加任务」）时按回退语义落文档末尾——mermaid 按
   * currentSection 归组，文档末尾的任务归属最后一个 section（无 section 时归属空组）。
   */
  private resolveAddTask(
    doc: SourceDocument,
    intent: Extract<JourneyIntent, { type: 'add-task' }>,
  ): Map<string, string> | null {
    if (!isValidJourneyTaskName(intent.name)) return null
    const score = String(intent.score)
    if (!isJourneyScoreInRange(score)) return null
    for (const actor of intent.actors) {
      if (!isValidJourneyActor(actor)) return null
    }
    let anchorId = intent.afterElementId
    if (intent.sectionElementId !== undefined && anchorId === undefined) {
      const tasks = this.tasksOfSection(doc, intent.sectionElementId)
      const last = tasks[tasks.length - 1]
      anchorId = last !== undefined ? last.id : intent.sectionElementId
    }
    const actorsPart = intent.actors.length > 0 ? `: ${intent.actors.join(', ')}` : ''
    return insertAfter(doc, {
      afterElementId: anchorId,
      anchor: 'line-end',
      render: (indent) => `\n${indent}${intent.name}: ${score}${actorsPart}`,
    })
  }

  /** 改任务名（双击/菜单/表单共用）；含冒号等非法字符时拒绝（不自动加引号，见文件头） */
  private resolveSetTaskName(
    doc: SourceDocument,
    intent: Extract<JourneyIntent, { type: 'set-task-name' }>,
  ): Map<string, string> | null {
    const part = this.taskPart(doc, intent.elementId)
    const name = intent.name.trim()
    if (part === null || !isValidJourneyTaskName(name)) return null
    return new Map([[part.id, renderJourneyTask(part.element as JourneyTaskData, { name })]])
  }

  /** 改 score：仅 1–5 整数（表单是 1–5 选择器；越界只能来自手写源码，改写必须落回合法值） */
  private resolveSetTaskScore(
    doc: SourceDocument,
    intent: Extract<JourneyIntent, { type: 'set-task-score' }>,
  ): Map<string, string> | null {
    const part = this.taskPart(doc, intent.elementId)
    if (part === null) return null
    if (!Number.isInteger(intent.score) || intent.score < 1 || intent.score > 5) return null
    return new Map([[part.id, renderJourneyTask(part.element as JourneyTaskData, { score: String(intent.score) })]])
  }

  /** 改 actor 列表：空数组 = 移除第二段（回落 `name: score` 形态，mermaid 合法） */
  private resolveSetTaskActors(
    doc: SourceDocument,
    intent: Extract<JourneyIntent, { type: 'set-task-actors' }>,
  ): Map<string, string> | null {
    const part = this.taskPart(doc, intent.elementId)
    if (part === null) return null
    const seen = new Set<string>()
    for (const actor of intent.actors) {
      const trimmed = actor.trim()
      if (!isValidJourneyActor(trimmed) || seen.has(trimmed)) return null
      seen.add(trimmed)
    }
    return new Map([
      [part.id, renderJourneyTask(part.element as JourneyTaskData, { actors: intent.actors.join(', ') })],
    ])
  }

  private resolveDeleteTask(
    doc: SourceDocument,
    intent: Extract<JourneyIntent, { type: 'delete-task' }>,
  ): Map<string, string> | null {
    const part = this.taskPart(doc, intent.elementId)
    if (part === null) return null
    return new Map([[part.id, '']])
  }

  /** 新增 section 行（缺省锚点回退文档末尾）；新任务随后经 add-task 锚到它 */
  private resolveAddSection(
    doc: SourceDocument,
    intent: Extract<JourneyIntent, { type: 'add-section' }>,
  ): Map<string, string> | null {
    const name = (intent.name ?? '新分组').trim()
    if (!isValidJourneySectionName(name)) return null
    return insertAfter(doc, {
      afterElementId: intent.afterElementId,
      anchor: 'line-end',
      render: (indent) => `\n${indent}section ${name}`,
    })
  }

  private resolveSetSectionName(
    doc: SourceDocument,
    intent: Extract<JourneyIntent, { type: 'set-section-name' }>,
  ): Map<string, string> | null {
    const part = this.sectionPart(doc, intent.elementId)
    if (part === null) return null
    const name = intent.name.trim()
    if (!isValidJourneySectionName(name)) return null
    return new Map([[part.id, renderJourneySection(part.element as JourneySectionData, { name })]])
  }

  /** 删除 section：连同其全部任务一起移除（级联由管线负责，与 kanban delete-column 同形） */
  private resolveDeleteSection(
    doc: SourceDocument,
    intent: Extract<JourneyIntent, { type: 'delete-section' }>,
  ): Map<string, string> | null {
    const part = this.sectionPart(doc, intent.elementId)
    if (part === null) return null
    const rewrites = new Map<string, string>()
    rewrites.set(part.id, '')
    for (const task of this.tasksOfSection(doc, part.id)) rewrites.set(task.id, '')
    return rewrites
  }

  /** 设置图表标题（`title 文本`）：已有标题行则原地改；无则紧随声明头插入一行。
   * 空文本不落码（删标题属改结构，未定义——清单外，返回 null 由调用方放弃） */
  private resolveSetTitle(
    doc: SourceDocument,
    intent: Extract<JourneyIntent, { type: 'set-title' }>,
  ): Map<string, string> | null {
    const text = intent.text.trim()
    if (text === '' || /[:#;\n]/.test(text)) return null
    const existing = doc.elements.find((p) => p.element.kind === 'journey-title')
    if (existing !== undefined) {
      return new Map([[existing.id, `title${(existing.element as JourneyTitleData).gap}${text}`]])
    }
    const header = doc.elements.find((p) => p.element.kind === 'journey-header')
    if (header === undefined) return null
    return insertAfter(doc, {
      afterElementId: header.id,
      anchor: 'self',
      render: (indent) => `\n${indent}title ${text}`,
    })
  }
}

export const journeyParser = new JourneyParser()

// ---------- 编辑意图（工单 08 表单 / 画布所需集合） ----------

export type JourneyIntent =
  /** 新增任务（score 1–5 整数；actors 可空）；锚点缺省 = section 末尾 / 文档末尾 */
  | { type: 'add-task'; name: string; score: number; actors: string[]; sectionElementId?: string; afterElementId?: string }
  /** 改任务名（elementId = `task:N`）；含 `:` 等非法字符时拒绝（引号不救冒号，见 parser 文件头） */
  | { type: 'set-task-name'; elementId: string; name: string }
  /** 改 score（仅 1–5 整数） */
  | { type: 'set-task-score'; elementId: string; score: number }
  /** 改 actor 列表（空数组 = 移除 actor 段） */
  | { type: 'set-task-actors'; elementId: string; actors: string[] }
  /** 删除任务 */
  | { type: 'delete-task'; elementId: string }
  /** 新增 section 行；name 缺省「新分组」 */
  | { type: 'add-section'; name?: string; afterElementId?: string }
  /** 改 section 名称 */
  | { type: 'set-section-name'; elementId: string; name: string }
  /** 删除 section（连同其全部任务） */
  | { type: 'delete-section'; elementId: string }
  /** 设置图表标题（`title 文本`）；无标题行时紧随声明头插入一行 */
  | { type: 'set-title'; text: string }
