import { assembleDocument, getElementById, type ElementPart, type SourceDocument } from './document'
import { frontmatterEnd } from './frontmatter'
import { insertAfter } from './insert'
import type { DiagramParser, EditIntent, ParseResult, SourceParseError } from './parser'
import type { Span } from './span'
import { newElementName } from '../../i18n/domain-strings.ts'

/**
 * gantt（甘特图）完整解析器（more-diagrams 工单 11，语法事实以 spec 的
 * research/data-display.md gantt 节为准，勿重复调研）：
 * 手写、逐行、带 span（ADR-0004）。可测试承诺：解析后不做修改再重组装，
 * 输出与输入逐字相同（verbatim identity）。
 *
 * 覆盖（分层对齐，spec 决策）：
 * - 声明头 `gantt`、`title 标题文本`（单行）
 * - 指令行（文档级属性元素）：dateFormat / axisFormat / tickInterval / excludes /
 *   todayMarker（值原文保留，todayMarker 支持 off 开关）、section（分组）
 * - 任务行 `任务名 : 元数据`（冒号元数据，逗号分隔）：标签前缀 done/active/crit/milestone
 *   （外加 mermaid 12 实际支持的 vert，见下）、各日期形态
 *
 * 词法边界（mermaid 12 词法实证，ganttDiagram-*.mjs 第 783 行 lexer 规则表，工单
 * Comments 记录结论）：
 * - 任务名 taskTxt = `[^:\n]+`（冒号/换行终止）；元数据 taskData = `:[^#\n;]+`
 *   ——元数据段含 `#` 或 `;` 的整行不认（逐字保留，与 lexer 的截断语义一致）。
 * - 指令值：dateFormat/axisFormat/tickInterval/excludes 的词法在 `#` 与 `;` 处截断、
 *   todayMarker 只在 `;` 处截断（todayMarker 样式值合法地含 `#`，如
 *   `stroke-width:5px,stroke:#0f0`）——含越界字符的指令行整行逐字保留。
 * - **`vert` 是任务标签不是指令行**：mermaid 12 的 gantt lexer 没有 vert 关键字
 *   token，`tags = ["active","done","crit","milestone","vert"]`（ganttDiagram-*.mjs
 *   821 行）由 getTaskTags 按整字段精确匹配前缀剥离（1420 行）——research 文档
 *   「vert <date> 垂直参考线」实为 `任务 : vert, <date>` 的任务标签用法。
 *   解析器据此把 vert 计入标签集（工单偏离记录在 Comments）。
 * - 标签匹配大小写敏感、必须独占一个逗号字段（`^\s*tag\s*$`，getTaskTags 1420 行）。
 * - `after <ids>` / `until <ids>`：ids 为空格分隔的 `[\d\w-]+` token
 *   （getStartDate/getEndDate 的 `^after\s+([\d\w- ]+)`，1060/1094 行）。
 * - 时长 token：`/^(\d+(?:\.\d+)?)([Mdhmswy]|ms)$/`（parseDuration 1051 行）。
 * - `click ... href/call` 行（工单明确不做编辑）逐字保留——注意 href 值含 `://`，
 *   必须在任务行识别**之前**排除，否则会被误切成任务名 + 元数据。
 * - 日期一律按**字符串**存（工单定案）：编辑不换格式，用户写 `2024-01-01` 落码还是
 *   `2024-01-01`（verbatim）；日期是否可被 day.js 解析是渲染层事务，语法层面
 *   （taskData 词法）合法即接受，不静默改写。
 *
 * 元数据位置语义（工单定案的「形态」建模）：去掉标签前缀后的逗号字段按个数与
 * 前缀推断形态（起止日期 / 起止+时长 / after / until / after+until）；
 * 1 字段形态（起点继承上一任务）与含空字段的清单外形态保留 shape = null——
 * 任务本身仍可寻址（改名/删除/标签编辑），元数据编辑需先在表单里选形态。
 *
 * span 约定（与 journey/timeline 同口径，行级）：行首缩进与换行留在 verbatim；
 * 元素 span 不跨行；行尾空白归 tail 字段逐字保留。不解析、原样保留（清单外语法
 * 不报错，ADR-0008）：frontmatter、`%%` 注释、`accTitle` / `accDescr`（含多行
 * `accDescr {}`）、includes / weekday / weekend / inclusiveEndDates / topAxis 等
 * 清单外指令、无法识别的行。
 *
 * 身份（ADR-0012 位置序）：`task:N` / `section:N` / `directive:N` 均按文档序 1 基
 * 编号——任务虽有可选显式 id，但可重复、可省略、可含任意字符，位置序是唯一稳定
 * 身份；mermaid 渲染 id（显式 id 或自动 `taskN`）作为画布 data-id 由投影预计算
 * （见 gantt-projection），不与编辑器身份混用。
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

export interface GanttHeaderData {
  kind: 'gantt-header'
  /** `gantt` 之后到行尾的原文（空白），逐字保留 */
  trailing: string
}

export interface GanttTitleData {
  kind: 'gantt-title'
  /** `title` 与标题之间的空白原文 */
  gap: string
  /** 标题文本（去尾空白）；改写时行尾空白不保留（与 journey 同口径） */
  text: string
}

/**
 * 指令行数据（文档级属性元素）。行形状：`keyword gap value tail`
 * - keyword 是原文关键词（lexer 大小写不敏感，这里保留用户写法）
 * - value 是值段原文（去首尾空白）；tail 是行尾空白原文，逐字保留
 */
export interface GanttDirectiveData {
  kind: 'gantt-directive'
  keyword: string
  gap: string
  value: string
  tail: string
}

export function renderGanttDirective(d: GanttDirectiveData, changes: { value?: string } = {}): string {
  return `${d.keyword}${d.gap}${changes.value ?? d.value}${d.tail}`
}

/** `section 名称` 行数据 */
export interface GanttSectionData {
  kind: 'gantt-section'
  gap: string
  name: string
  tail: string
}

export function renderGanttSection(d: GanttSectionData, changes: { name?: string } = {}): string {
  return `section${d.gap}${changes.name ?? d.name}${d.tail}`
}

/**
 * 任务行数据。行形状：`name gap1 ':' colonGap metadata tail`
 * - name / metadata 已去首尾空白；各段空白原文存 gap1 / colonGap / tail（逐字回写）
 * - metadata 是冒号后的元数据原文（标签前缀 + 逗号字段），编辑按形态重组，
 *   未触碰时逐字回写
 */
export interface GanttTaskData {
  kind: 'gantt-task'
  name: string
  gap1: string
  colonGap: string
  metadata: string
  tail: string
}

/** 任务行原文重建。changes 任一字段缺省 = 逐字保留原文 */
export function renderGanttTask(d: GanttTaskData, changes: { name?: string; metadata?: string } = {}): string {
  const name = changes.name ?? d.name
  const metadata = changes.metadata ?? d.metadata
  return `${name}${d.gap1}:${d.colonGap}${metadata}${d.tail}`
}

export type GanttElementData =
  | GanttHeaderData
  | GanttTitleData
  | GanttDirectiveData
  | GanttSectionData
  | GanttTaskData

// ---------- 词法助手与元数据形态模型 ----------

/**
 * 任务标签集（mermaid 12 ganttDiagram-*.mjs 821 行的 tags 数组，逐字照抄）。
 * getTaskTags 按整字段精确匹配（大小写敏感、`^\s*tag\s*$`），此处同口径。
 */
export const GANTT_TAGS = ['active', 'done', 'crit', 'milestone', 'vert'] as const

/** mermaid parseDuration 的时长 token 词法（1051 行）：数字（可小数）+ 单位 */
const DURATION_RE = /^(\d+(?:\.\d+)?)([Mdhmswy]|ms)$/

/** 值是否为时长 token（`3d` / `1.5w` / `500ms` 等；工单 11 形态推断用） */
export function isGanttDuration(value: string): boolean {
  return DURATION_RE.test(value.trim())
}

/** `after <ids>` / `until <ids>` 的 ids 词法（1060/1094 行）：空格分隔的 `[\d\w-]+` */
const AFTER_RE = /^after\s+([\w- ]+)/
const UNTIL_RE = /^until\s+([\w- ]+)/

/**
 * 任务元数据形态（工单定案：第几个逗号字段决定含义——表单按形态建模，
 * 落码按形态拼回逗号序）：
 * - `date-end`（起止日期）：`[id,] start, end`
 * - `date-duration`（起止+时长）：`[id,] start, 时长`
 * - `after-end`（依赖起止）：`[id,] after <ids>, (结束日期|时长)`
 * - `date-until`（截止于）：`[id,] start, until <id>`
 * - `after-until`（依赖后截止）：`[id,] after <ids>, until <id>`
 */
export type GanttTaskShape = 'date-end' | 'date-duration' | 'after-end' | 'date-until' | 'after-until'

/** 形态化后的任务元数据（表单字段随 shape 变化；解析与表单/落码共用同一模型） */
export interface GanttTaskMeta {
  shape: GanttTaskShape
  /** 显式任务 id（'' = 无 id 字段——mermaid 自动继承/生成） */
  taskId: string
  /** `date-*` 形态：起始日期原文 */
  start: string
  /** `after-*` 形态：依赖 id 原文（空格分隔，如 `t1 t2`） */
  afterIds: string
  /** `date-end` / `after-end` 形态：结束日期或时长原文 */
  end: string
  /** `*-until` 形态：目标任务 id */
  untilId: string
}

/** 元数据解析产物：标签前缀 + 剩余逗号字段 + 形态（清单外形态 shape = null） */
export interface ParsedGanttMetadata {
  /** 标签前缀（原文匹配 GANTT_TAGS，保序） */
  tags: string[]
  /** 去掉标签后的逗号字段（各项已 trim；与 mermaid 的 data 数组同构） */
  fields: string[]
  /** 形态化模型；清单外形态（1 字段 / 空字段 / 前缀不完整等）null */
  meta: GanttTaskMeta | null
}

/** 去掉标签后按字段个数与前缀推断形态（fields 须为 tag 剥离后的 core 字段） */
function inferGanttShape(fields: string[]): GanttTaskMeta | null {
  const afterOf = (spec: string): string | null => {
    const m = AFTER_RE.exec(spec)
    return m !== null ? m[1].trim() : null
  }
  const untilOf = (spec: string): string | null => {
    const m = UNTIL_RE.exec(spec)
    return m !== null ? m[1].trim() : null
  }
  if (fields.length === 3) {
    const [id, startSpec, endSpec] = fields
    const afterIds = afterOf(startSpec)
    const untilId = untilOf(endSpec)
    if (afterIds !== null) {
      return untilId !== null
        ? { shape: 'after-until', taskId: id, start: '', afterIds, end: '', untilId }
        : { shape: 'after-end', taskId: id, start: '', afterIds, end: endSpec, untilId: '' }
    }
    if (untilId !== null) {
      return { shape: 'date-until', taskId: id, start: startSpec, afterIds: '', end: '', untilId }
    }
    // 3 字段与 2 字段同构（第 1 段是显式 id）：末段时长 → 起止+时长，否则起止日期
    return isGanttDuration(endSpec)
      ? { shape: 'date-duration', taskId: id, start: startSpec, afterIds: '', end: endSpec, untilId: '' }
      : { shape: 'date-end', taskId: id, start: startSpec, afterIds: '', end: endSpec, untilId: '' }
  }  if (fields.length === 2) {
    const [startSpec, endSpec] = fields
    const afterIds = afterOf(startSpec)
    const untilId = untilOf(endSpec)
    if (afterIds !== null) {
      return untilId !== null
        ? { shape: 'after-until', taskId: '', start: '', afterIds, end: '', untilId }
        : { shape: 'after-end', taskId: '', start: '', afterIds, end: endSpec, untilId: '' }
    }
    if (untilId !== null) {
      return { shape: 'date-until', taskId: '', start: startSpec, afterIds: '', end: '', untilId }
    }
    // 2 字段 = start + end：第 2 段时长 → 起止+时长，否则起止日期
    return isGanttDuration(endSpec)
      ? { shape: 'date-duration', taskId: '', start: startSpec, afterIds: '', end: endSpec, untilId: '' }
      : { shape: 'date-end', taskId: '', start: startSpec, afterIds: '', end: endSpec, untilId: '' }
  }
  // 1 字段（起点继承上一任务）与 0 字段：无「形态」可言——shape = null，
  // 任务仍可寻址，元数据编辑需先在表单选形态
  return null
}

/**
 * 元数据原文 → 标签 + 字段 + 形态（解析器与投影共用，避免第二份实现）。
 * 含空字段（连续逗号）时 shape = null（mermaid 对空字段的日期解析会抛
 * Invalid date——清单外形态，不建模）。
 */
export function parseGanttTaskMeta(metadata: string): ParsedGanttMetadata {
  const all = metadata.split(',').map((f) => f.trim())
  const tags: string[] = []
  let i = 0
  while (i < all.length && (GANTT_TAGS as readonly string[]).includes(all[i])) {
    tags.push(all[i])
    i++
  }
  const fields = all.slice(i)
  const meta =
    fields.length >= 2 && fields.length <= 3 && fields.every((f) => f !== '')
      ? inferGanttShape(fields)
      : null
  return { tags, fields, meta }
}

/**
 * 形态模型 → 逗号字段数组（落码按形态拼回逗号序，工单定案）。
 * 校验不过返回 null（绝不产出非法 mermaid）：
 * - 日期/时长/结束值：非空、不含 `#` `;`（taskData 词法边界）
 * - id / 依赖 id / until 目标：非空 `[\w-]+` token（mermaid after/until 的
 *   ids 词法 `[\\d\\w- ]+` 的单项口径）
 */
export function isValidGanttDateField(value: string): boolean {
  return value.trim() !== '' && !/[#;\n]/.test(value)
}

export function isValidGanttIdToken(value: string): boolean {
  return /^[\w-]+$/.test(value.trim())
}

export function buildGanttCoreFields(meta: GanttTaskMeta): string[] | null {
  const core: string[] = []
  if (meta.taskId.trim() !== '') {
    if (!isValidGanttIdToken(meta.taskId)) return null
    core.push(meta.taskId.trim())
  }
  const startSpec =
    meta.shape === 'after-end' || meta.shape === 'after-until'
      ? `after ${meta.afterIds.trim()}`
      : meta.start
  const endSpec =
    meta.shape === 'date-until' || meta.shape === 'after-until'
      ? `until ${meta.untilId.trim()}`
      : meta.end
  if (!isValidGanttDateField(startSpec)) return null
  if (!isValidGanttDateField(endSpec)) return null
  if (meta.shape === 'after-end' || meta.shape === 'after-until') {
    const ids = meta.afterIds.trim().split(/\s+/)
    if (ids.some((id) => !isValidGanttIdToken(id))) return null
  }
  core.push(startSpec, endSpec)
  return core
}

/** 标签 + 字段 → 元数据原文（落码统一 `, ` 连接——新增内容的书写风格，不涉 verbatim） */
export function renderGanttMetadata(tags: string[], fields: string[]): string {
  return [...tags, ...fields].join(', ')
}

/**
 * 标签数组合法性：逐项 ∈ GANTT_TAGS（getTaskTags 精确匹配口径）、不重复。
 */
export function isValidGanttTags(tags: string[]): boolean {
  const seen = new Set<string>()
  for (const tag of tags) {
    if (!(GANTT_TAGS as readonly string[]).includes(tag) || seen.has(tag)) return false
    seen.add(tag)
  }
  return true
}

/** 逗号字段数组合法性（set-task-meta 的落码门）：1–3 个、逐项非空且无 `#` `;` 换行 */
export function isValidGanttFields(fields: string[]): boolean {
  return (
    fields.length >= 1 &&
    fields.length <= 3 &&
    fields.every((f) => f.trim() !== '' && !/[#;\n]/.test(f))
  )
}

/**
 * 任务名合法性（表单/落码侧）：非空、不含 `:` `;` 与换行（`:` 终止 taskTxt、
 * `;` 是 gantt 的语句分隔；`#` 在 taskTxt 词法内合法但为稳妥一并拒绝，与 journey 同口径）。
 */
export function isValidGanttTaskName(name: string): boolean {
  return name.trim() !== '' && !/[:;\n#]/.test(name)
}

/** section 名称合法性：非空、不含换行（lexer `section\s[^\n]+`；`:` 在 gantt 分组名中合法） */
export function isValidGanttSectionName(name: string): boolean {
  return name.trim() !== '' && !/\n/.test(name)
}

/** 标题合法性：非空、不含换行（lexer `title\s[^\n]+`） */
export function isValidGanttTitle(text: string): boolean {
  return text.trim() !== '' && !/\n/.test(text)
}

/**
 * 指令值合法性（set-directive 的落码门）：非空、不含换行；
 * dateFormat/axisFormat/tickInterval/excludes 的词法在 `#` 与 `;` 处截断、
 * todayMarker 只在 `;` 处截断（样式值合法地含 `#`）——越界即落码非法。
 */
export function isValidGanttDirectiveValue(keyword: string, value: string): boolean {
  const trimmed = value.trim()
  if (trimmed === '' || /\n/.test(trimmed)) return false
  if (trimmed.includes(';')) return false
  if (keyword.toLowerCase() !== 'todaymarker' && trimmed.includes('#')) return false
  return true
}

// ---------- 解析器 ----------

interface RawEntry {
  span: Span
  id: string
  data: GanttElementData
}

const HEADER_RE = /^gantt[ \t\r]*$/i
// 关键词与内容之间的空白用捕获组留下（[ \t]+ 会把分隔空白吞掉，render 时必须原样回写）
const TITLE_RE = /^title([ \t]+)(.+)$/i
const SECTION_RE = /^section([ \t]+)(.+)$/i
const DIRECTIVE_RE = /^(dateFormat|axisFormat|tickInterval|excludes|todayMarker)([ \t]+)(.+)$/i
const CLICK_PREFIX = /^click[ \t]/i
const ACC_PREFIX = /^acc(Title|Descr)\b/i

/** 指令行的值段词法边界（`#` / `;` 越界即整行不认，见文件头注释） */
function directiveValueInBounds(keyword: string, rawValue: string): boolean {
  if (rawValue.includes(';')) return false
  if (keyword.toLowerCase() !== 'todaymarker' && rawValue.includes('#')) return false
  return true
}

/**
 * 任务行解析：`name gap1 ':' colonGap metadata tail`（body 已去行首缩进）。
 * 词法口径 = taskTxt `[^:\n]+` + taskData `:[^#\n;]+`（783 行规则表）——冒号是任务名
 * 终止符，元数据含 `#` / `;` 或冒号后为空即整行不认（逐字保留，不报错，ADR-0008）。
 */
function parseTaskLine(body: string): GanttTaskData | null {
  const colon = body.indexOf(':')
  if (colon === -1) return null
  const namePart = body.slice(0, colon)
  const name = namePart.trim()
  if (name === '') return null
  const metaPart = body.slice(colon + 1)
  const metadata = metaPart.trim()
  if (metadata === '' || /[;\n#]/.test(metadata)) return null
  return {
    kind: 'gantt-task',
    name,
    gap1: namePart.slice(namePart.trimEnd().length),
    colonGap: metaPart.slice(0, metaPart.length - metaPart.trimStart().length),
    metadata,
    tail: metaPart.slice(metaPart.trimEnd().length),
  }
}

export class GanttParser implements DiagramParser {
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
    let directiveCount = 0
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
            throw parseFailure(lineNo, '图表必须以 gantt 声明开始')
          }
          seenHeader = true
          entries.push({
            span: spanOfLine(),
            id: 'gantt-header',
            data: { kind: 'gantt-header', trailing: line.slice(firstChar + 'gantt'.length) },
          })
        } else if (trimmed.startsWith('%%') || ACC_PREFIX.test(trimmed)) {
          // 注释 / 可访问性语句（含多行 accDescr {} 的花括号行，工单明确不做编辑）：逐字保留
        } else if (CLICK_PREFIX.test(trimmed)) {
          // `click ... href/call`（工单明确不做编辑）：必须在任务行识别前排除——
          // href 值含 `://`，否则会被误切成任务名 + 元数据
        } else {
          const body = line.slice(firstChar)
          const titleM = TITLE_RE.exec(body)
          const sectionM = titleM === null ? SECTION_RE.exec(body) : null
          const directiveM = titleM === null && sectionM === null ? DIRECTIVE_RE.exec(body) : null
          if (titleM !== null) {
            const text = titleM[2].trim()
            if (text !== '') {
              entries.push({
                span: spanOfLine(),
                id: 'gantt-title',
                data: { kind: 'gantt-title', gap: titleM[1], text },
              })
            }
            // 空标题等清单外形态：不解析，逐字保留
          } else if (sectionM !== null) {
            const name = sectionM[2].trim()
            if (name !== '') {
              sectionCount++
              const tail = sectionM[2].slice(sectionM[2].trimEnd().length)
              entries.push({
                span: spanOfLine(),
                id: `section:${sectionCount}`,
                data: { kind: 'gantt-section', gap: sectionM[1], name, tail },
              })
            }
            // 空名称等清单外形态：不解析，逐字保留
          } else if (directiveM !== null) {
            const keyword = directiveM[1]
            const gap = directiveM[2]
            const rawValue = directiveM[3].trim()
            if (rawValue !== '' && directiveValueInBounds(keyword, rawValue)) {
              directiveCount++
              // 行尾空白取自未 trim 的内容段（rawValue 已去尾，再取会拿到空串）
              const tail = directiveM[3].slice(directiveM[3].trimEnd().length)
              entries.push({
                span: spanOfLine(),
                id: `directive:${directiveCount}`,
                data: { kind: 'gantt-directive', keyword, gap, value: rawValue, tail },
              })
            }
            // 空值 / 值含 `#` `;` 越界（清单外）：不解析，逐字保留
          } else {
            const task = parseTaskLine(body)
            if (task !== null) {
              taskCount++
              entries.push({
                span: spanOfLine(),
                id: `task:${taskCount}`,
                data: task,
              })
            }
            // 清单外 / 无法识别（含 1 字段以外的怪形态任务行只是 metadata 原样保留，
            // 这里指整行不匹配任务行文法的情形）：不解析，逐字保留
          }
        }
      }

      if (nl === -1) break
      cursor = nl + 1
    }

    if (!seenHeader) {
      throw parseFailure(1, '图表必须以 gantt 声明开始')
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
      case 'set-task-meta':
        return this.resolveSetTaskMeta(doc, intent as never)
      case 'delete-task':
        return this.resolveDeleteTask(doc, intent as never)
      case 'add-section':
        return this.resolveAddSection(doc, intent as never)
      case 'set-section-name':
        return this.resolveSetSectionName(doc, intent as never)
      case 'delete-section':
        return this.resolveDeleteSection(doc, intent as never)
      case 'set-directive':
        return this.resolveSetDirective(doc, intent as never)
      case 'set-title':
        return this.resolveSetTitle(doc, intent as never)
      default:
        return null
    }
  }

  private taskPart(doc: SourceDocument, elementId: string): ElementPart | null {
    const part = getElementById(doc, elementId)
    return part !== undefined && part.element.kind === 'gantt-task' ? part : null
  }

  private sectionPart(doc: SourceDocument, elementId: string): ElementPart | null {
    const part = getElementById(doc, elementId)
    return part !== undefined && part.element.kind === 'gantt-section' ? part : null
  }

  /** 某 section 的任务（文档序：该 section 行之后、下一个 section 行之前的全部任务） */
  private tasksOfSection(doc: SourceDocument, sectionElementId: string): ElementPart[] {
    const out: ElementPart[] = []
    let current: string | null = null
    for (const part of doc.elements) {
      if (part.element.kind === 'gantt-section') current = part.id
      else if (part.element.kind === 'gantt-task' && current === sectionElementId) out.push(part)
    }
    return out
  }

  /**
   * 新增任务：带 sectionElementId 时落在该 section 最后一个任务之后（无任务则紧随
   * section 行）；不带（空白菜单「加任务」）时按回退语义落文档末尾——mermaid 按
   * currentSection 归组，文档末尾的任务归属最后一个 section（无 section 时归属空组）。
   * 元数据缺省 = 时长 `1d`（起点继承上一任务，mermaid 合法）。
   */
  private resolveAddTask(
    doc: SourceDocument,
    intent: Extract<GanttIntent, { type: 'add-task' }>,
  ): Map<string, string> | null {
    const name = intent.name.trim()
    if (!isValidGanttTaskName(name)) return null
    const tags = intent.tags ?? []
    const fields = intent.fields ?? ['1d']
    if (!isValidGanttTags(tags) || !isValidGanttFields(fields)) return null
    let anchorId = intent.afterElementId
    if (intent.sectionElementId !== undefined && anchorId === undefined) {
      const tasks = this.tasksOfSection(doc, intent.sectionElementId)
      const last = tasks[tasks.length - 1]
      anchorId = last !== undefined ? last.id : intent.sectionElementId
    }
    return insertAfter(doc, {
      afterElementId: anchorId,
      anchor: 'line-end',
      render: (indent) => `\n${indent}${name}: ${renderGanttMetadata(tags, fields)}`,
    })
  }

  /** 改任务名（双击/菜单/表单共用）；含 `:` 等非法字符时拒绝（见 isValidGanttTaskName） */
  private resolveSetTaskName(
    doc: SourceDocument,
    intent: Extract<GanttIntent, { type: 'set-task-name' }>,
  ): Map<string, string> | null {
    const part = this.taskPart(doc, intent.elementId)
    const name = intent.name.trim()
    if (part === null || !isValidGanttTaskName(name)) return null
    return new Map([[part.id, renderGanttTask(part.element as GanttTaskData, { name })]])
  }

  /** 改元数据（形态编辑的落码口）：标签 + 按形态拼回的逗号字段，校验不过拒绝落码 */
  private resolveSetTaskMeta(
    doc: SourceDocument,
    intent: Extract<GanttIntent, { type: 'set-task-meta' }>,
  ): Map<string, string> | null {
    const part = this.taskPart(doc, intent.elementId)
    if (part === null) return null
    const tags = intent.tags
    const fields = intent.fields.map((f) => f.trim())
    if (!isValidGanttTags(tags) || !isValidGanttFields(fields)) return null
    return new Map([[part.id, renderGanttTask(part.element as GanttTaskData, { metadata: renderGanttMetadata(tags, fields) })]])
  }

  private resolveDeleteTask(
    doc: SourceDocument,
    intent: Extract<GanttIntent, { type: 'delete-task' }>,
  ): Map<string, string> | null {
    const part = this.taskPart(doc, intent.elementId)
    if (part === null) return null
    return new Map([[part.id, '']])
  }

  /** 新增 section 行（缺省锚点回退文档末尾）；新任务随后经 add-task 锚到它 */
  private resolveAddSection(
    doc: SourceDocument,
    intent: Extract<GanttIntent, { type: 'add-section' }>,
  ): Map<string, string> | null {
    const name = (intent.name ?? newElementName('section')).trim()
    if (!isValidGanttSectionName(name)) return null
    return insertAfter(doc, {
      afterElementId: intent.afterElementId,
      anchor: 'line-end',
      render: (indent) => `\n${indent}section ${name}`,
    })
  }

  private resolveSetSectionName(
    doc: SourceDocument,
    intent: Extract<GanttIntent, { type: 'set-section-name' }>,
  ): Map<string, string> | null {
    const part = this.sectionPart(doc, intent.elementId)
    if (part === null) return null
    const name = intent.name.trim()
    if (!isValidGanttSectionName(name)) return null
    return new Map([[part.id, renderGanttSection(part.element as GanttSectionData, { name })]])
  }

  /** 删除 section：连同其全部任务一起移除（级联由管线负责，与 journey delete-section 同形） */
  private resolveDeleteSection(
    doc: SourceDocument,
    intent: Extract<GanttIntent, { type: 'delete-section' }>,
  ): Map<string, string> | null {
    const part = this.sectionPart(doc, intent.elementId)
    if (part === null) return null
    const rewrites = new Map<string, string>()
    rewrites.set(part.id, '')
    for (const task of this.tasksOfSection(doc, part.id)) rewrites.set(task.id, '')
    return rewrites
  }

  /** 改指令值（dateFormat/axisFormat/tickInterval/excludes/todayMarker；todayMarker 的 off 开关也走这里） */
  private resolveSetDirective(
    doc: SourceDocument,
    intent: Extract<GanttIntent, { type: 'set-directive' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'gantt-directive') return null
    const data = part.element as GanttDirectiveData
    const value = intent.value.trim()
    if (!isValidGanttDirectiveValue(data.keyword, value)) return null
    return new Map([[part.id, renderGanttDirective(data, { value })]])
  }

  /** 设置图表标题（`title 文本`）：已有标题行则原地改；无则紧随声明头插入一行。
   * 空文本不落码（删标题属改结构，未定义——清单外，返回 null 由调用方放弃） */
  private resolveSetTitle(
    doc: SourceDocument,
    intent: Extract<GanttIntent, { type: 'set-title' }>,
  ): Map<string, string> | null {
    const text = intent.text.trim()
    if (!isValidGanttTitle(text)) return null
    const existing = doc.elements.find((p) => p.element.kind === 'gantt-title')
    if (existing !== undefined) {
      return new Map([[existing.id, `title${(existing.element as GanttTitleData).gap}${text}`]])
    }
    const header = doc.elements.find((p) => p.element.kind === 'gantt-header')
    if (header === undefined) return null
    return insertAfter(doc, {
      afterElementId: header.id,
      anchor: 'self',
      render: (indent) => `\n${indent}title ${text}`,
    })
  }
}

export const ganttParser = new GanttParser()

/** 位置序身份的序号解析（`task:3` → 3）；形态不符 null（不凭空造身份） */
export function parseGanttOrdinal(elementId: string, prefix: 'task' | 'section' | 'directive'): number | null {
  const head = `${prefix}:`
  if (!elementId.startsWith(head)) return null
  const m = /^([1-9][0-9]*)$/.exec(elementId.slice(head.length))
  return m === null ? null : Number(m[1])
}

// ---------- 编辑意图（工单 11 表单 / 画布所需集合） ----------

export type GanttIntent =
  /** 新增任务（tags / fields 落码门见 isValidGanttTags / isValidGanttFields；
   * fields 缺省 ['1d']。锚点缺省 = section 末尾 / 文档末尾） */
  | { type: 'add-task'; name: string; tags?: string[]; fields?: string[]; sectionElementId?: string; afterElementId?: string }
  /** 改任务名（elementId = `task:N`）；含 `:` 等非法字符时拒绝 */
  | { type: 'set-task-name'; elementId: string; name: string }
  /** 改元数据（tags + 按形态拼回的逗号字段；表单先选形态再产出 fields） */
  | { type: 'set-task-meta'; elementId: string; tags: string[]; fields: string[] }
  /** 删除任务 */
  | { type: 'delete-task'; elementId: string }
  /** 新增 section 行；name 缺省「新分组」 */
  | { type: 'add-section'; name?: string; afterElementId?: string }
  /** 改 section 名称 */
  | { type: 'set-section-name'; elementId: string; name: string }
  /** 删除 section（连同其全部任务） */
  | { type: 'delete-section'; elementId: string }
  /** 改指令值（elementId = `directive:N`；todayMarker 的 off 开关 = value 'off'） */
  | { type: 'set-directive'; elementId: string; value: string }
  /** 设置图表标题（`title 文本`）；无标题行时紧随声明头插入一行 */
  | { type: 'set-title'; text: string }
