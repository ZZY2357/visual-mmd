import { assembleDocument, getElementById, type SourceDocument } from './document'
import type { DiagramParser, EditIntent, ParseResult, SourceParseError } from './parser'
import { frontmatterEnd } from './frontmatter'
import { c4ElementElementId, c4BoundaryElementId } from './element-id'
import type { Span } from './span'
import { indentLines, insertAfter } from './insert'

/**
 * C4 系列（C4Context / C4Container / C4Component / C4Dynamic / C4Deployment）解析器
 * （more-diagrams 工单 18，语法事实以 .scratch/more-diagrams/research/data-display.md §9 为准）。
 *
 * 手写、逐行、带 span（ADR-0004）。可测试承诺：解析后不做修改再重组装，输出与输入逐字相同
 * （verbatim identity）。
 *
 * 覆盖（research §9，**白名单制**——官方明示 C4 实验性/不稳定，不追 PlantUML 兼容全集）：
 * - 声明头：五个关键字 `C4Context` / `C4Container` / `C4Component` / `C4Dynamic` / `C4Deployment`
 *   （全部大写 C4），同行可带图表标题（`C4Context\n  title 标题` 另起一行，见下）。
 * - 元素声明（函数调用式，**位置参数与 `$name=` 命名参数两种形态**，`?`=可选）：
 *   `Person(alias, label, ?descr, ?sprite, ?tags, $link)` / `Person_Ext`
 *   `System(...)` / `SystemDb` / `SystemQueue` / `System_Ext` / `SystemDb_Ext` / `SystemQueue_Ext`
 *   `Container(alias, label, ?techn, ?descr, ?sprite, ?tags, $link)` + `_Ext` / `_Db` / `_Queue` 变体
 *   `Component(alias, label, ?techn, ?descr, ?sprite, ?tags, $link)` + 变体
 * - 块体构造（`… (alias, label, ?type, ?tags, $link) {` … `}`）：四类边界
 *   `Enterprise_Boundary` / `System_Boundary` / `Boundary` / `Container_Boundary`，
 *   以及四类 Deployment Node `Deployment_Node` / `Node` / `Node_L` / `Node_R`
 *   ——**实测确认后者与边界走同一张 boundaries 表**（`addDeploymentNode` 与
 *   `addPersonOrSystemBoundary` 都 push 进 `boundaries`），是容器而非叶子元素。
 * - 关系：`Rel(from, to, label, ?techn, ?descr, ?sprite, ?tags, $link)` / `BiRel` / `Rel_Back`；
 *   方向别名 `Rel_U|Rel_Up` / `Rel_D|Rel_Down` / `Rel_L|Rel_Left` / `Rel_R|Rel_Right`；
 *   `RelIndex(index, from, to, label, ...)`（index 被 mermaid 忽略，顺序即语句顺序）。
 *
 * 不解析、原样保留（白名单外，ADR-0008）：`Rel_S`/`Rel_Ne`/`Rel_B`/`Rel_T`、`Lay_*`、
 * `Show`/`Hide`、`UpdateElementStyle`/`UpdateRelStyle`/`UpdateLayoutConfig`/`UpdateContainerStyle`、
 * `SHOW_LEGEND`/`SketchMode`、`title`/`accTitle`/`accDescr`、frontmatter、`%%` 注释、
 * 无法识别的行——一律逐字保留，不报错。
 *
 * 身份（ADR-0012）：
 * - 元素 / 边界 = **名字即身份**（alias 是语法标识，关系引用它；`c4-element:<alias>` /
 *   `c4-boundary:<alias>`）——同一 alias 重复声明时按出现序计数（`c4-element:<alias>#2`）。
 * - 关系 = **位置序身份**（`relation:N`，1 基文档序——label 可重复且不唯一，位置序是唯一稳定身份）。
 *
 * span 约定（行级）：行首缩进与换行留在 verbatim；元素 span 不跨行；改动只重写该行。

参数位（位置形态）——由 mermaid c4Db 的声明签名决定，解析器只按位取语义字段：

| 种类 | 位置参数 |
|---|---|
| Person / System | alias, label, descr, sprite, tags, $link |
| Container / Component | alias, label, techn, descr, sprite, tags, $link |
| 边界 / Deployment Node | alias, label, type(→techn), tags, $link |
| Rel 家族 | from, to, label, techn, descr, sprite, tags, $link |
| RelIndex | index, from, to, label, techn, descr, ...（index 被忽略） |
 */

interface ParseFailure extends Error {
  line: number
}

function parseFailure(line: number, message: string): ParseFailure {
  const error = new Error(message) as ParseFailure
  error.line = line
  return error
}

// ---------- 词法与声明签名 ----------

/** 声明头关键字（research §9：全部大写 C4） */
export const C4_KEYWORDS = ['C4Context', 'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment'] as const
export type C4Keyword = (typeof C4_KEYWORDS)[number]

/** 元素种类（`kind`）：决定表单字段组与「加同类元素」的 Tab 语义 */
export type C4ElementKind = 'person' | 'system' | 'container' | 'component'

/** 元素声明宏 → 种类 + 变体后缀（`_Ext` / `_Db` / `_Queue` / `_L` / `_R`） */
interface C4MacroSignature {
  kind: C4ElementKind
  /** 变体原文（含前导 `_`；基础宏为 ''），逐字保留在函数名里 */
  variant: string
  /** 语义字段的取值方式（位置参数 → 语义字段） */
  positionals: readonly C4FieldName[]
}

/** 元素语义字段（表单可编辑的部分；sprite / tags / link 只读展示） */
export type C4FieldName = 'alias' | 'label' | 'techn' | 'descr' | 'sprite' | 'tags' | 'link'

/**
 * 元素声明宏表（research §9 白名单）。
 * 顺序无关（按整词匹配函数名）；未在表里的函数名（`Rel_S` / `Lay_*` / `UpdateElementStyle` …）
 * 一律不解析、逐字保留。
 */
export const C4_ELEMENT_MACROS: Readonly<Record<string, C4MacroSignature>> = Object.freeze({
  // Person 家族
  Person: { kind: 'person', variant: '', positionals: ['alias', 'label', 'descr', 'sprite', 'tags', 'link'] },
  Person_Ext: { kind: 'person', variant: '_Ext', positionals: ['alias', 'label', 'descr', 'sprite', 'tags', 'link'] },
  // System 家族（`Db` / `Queue` 是形状变体，`_Ext` 是外部标记，两者可组合）
  System: { kind: 'system', variant: '', positionals: ['alias', 'label', 'descr', 'sprite', 'tags', 'link'] },
  System_Ext: { kind: 'system', variant: '_Ext', positionals: ['alias', 'label', 'descr', 'sprite', 'tags', 'link'] },
  SystemDb: { kind: 'system', variant: 'Db', positionals: ['alias', 'label', 'descr', 'sprite', 'tags', 'link'] },
  SystemDb_Ext: { kind: 'system', variant: 'Db_Ext', positionals: ['alias', 'label', 'descr', 'sprite', 'tags', 'link'] },
  SystemQueue: { kind: 'system', variant: 'Queue', positionals: ['alias', 'label', 'descr', 'sprite', 'tags', 'link'] },
  SystemQueue_Ext: {
    kind: 'system',
    variant: 'Queue_Ext',
    positionals: ['alias', 'label', 'descr', 'sprite', 'tags', 'link'],
  },
  // Container 家族（Container / ContainerDb / ContainerQueue / Container_Boundary 见边界表）
  Container: {
    kind: 'container',
    variant: '',
    positionals: ['alias', 'label', 'techn', 'descr', 'sprite', 'tags', 'link'],
  },
  Container_Ext: {
    kind: 'container',
    variant: '_Ext',
    positionals: ['alias', 'label', 'techn', 'descr', 'sprite', 'tags', 'link'],
  },
  ContainerDb: {
    kind: 'container',
    variant: 'Db',
    positionals: ['alias', 'label', 'techn', 'descr', 'sprite', 'tags', 'link'],
  },
  ContainerDb_Ext: {
    kind: 'container',
    variant: 'Db_Ext',
    positionals: ['alias', 'label', 'techn', 'descr', 'sprite', 'tags', 'link'],
  },
  ContainerQueue: {
    kind: 'container',
    variant: 'Queue',
    positionals: ['alias', 'label', 'techn', 'descr', 'sprite', 'tags', 'link'],
  },
  ContainerQueue_Ext: {
    kind: 'container',
    variant: 'Queue_Ext',
    positionals: ['alias', 'label', 'techn', 'descr', 'sprite', 'tags', 'link'],
  },
  // Component 家族（C4 的 Component 是「容器内的组件」，故有 techn 位）
  Component: {
    kind: 'component',
    variant: '',
    positionals: ['alias', 'label', 'techn', 'descr', 'sprite', 'tags', 'link'],
  },
  Component_Ext: {
    kind: 'component',
    variant: '_Ext',
    positionals: ['alias', 'label', 'techn', 'descr', 'sprite', 'tags', 'link'],
  },
  ComponentDb: {
    kind: 'component',
    variant: 'Db',
    positionals: ['alias', 'label', 'techn', 'descr', 'sprite', 'tags', 'link'],
  },
  ComponentDb_Ext: {
    kind: 'component',
    variant: 'Db_Ext',
    positionals: ['alias', 'label', 'techn', 'descr', 'sprite', 'tags', 'link'],
  },
  ComponentQueue: {
    kind: 'component',
    variant: 'Queue',
    positionals: ['alias', 'label', 'techn', 'descr', 'sprite', 'tags', 'link'],
  },
  ComponentQueue_Ext: {
    kind: 'component',
    variant: 'Queue_Ext',
    positionals: ['alias', 'label', 'techn', 'descr', 'sprite', 'tags', 'link'],
  },
})

/**
 * 边界类宏表（**块体构造**，`… (alias, label, ?type, ?tags, $link) {` … `}`）：
 * C4 的四类 Boundary 与四类 Deployment Node（`Deployment_Node` / `Node` / `Node_L` / `Node_R`）
 * 在 mermaid 的 c4Db 里**走同一张 boundaries 表**（`addDeploymentNode` 与
 * `addPersonOrSystemBoundary` 都 push 到 `boundaries`，research §9 与
 * `c4Diagram-YGBWAQC7.mjs` 源码核对）——它们是可嵌套的容器，不是叶子元素。
 * 位置参数：`alias, label, ?type, ?tags, $link`（`type` 落在 techn 语义位）。
 */
export const C4_BOUNDARY_MACROS: Readonly<Record<string, { boundaryKind: C4BoundaryKind }>> = Object.freeze({
  Enterprise_Boundary: { boundaryKind: 'enterprise' },
  System_Boundary: { boundaryKind: 'system' },
  Boundary: { boundaryKind: 'generic' },
  Container_Boundary: { boundaryKind: 'container' },
  Deployment_Node: { boundaryKind: 'deployment' },
  Node: { boundaryKind: 'deployment' },
  Node_L: { boundaryKind: 'deployment' },
  Node_R: { boundaryKind: 'deployment' },
})

/** 关系宏 → 方向 + 是否双向 / 反向（research §9） */
export interface C4RelSignature {
  /** 源码宏名，逐字保留在重写里 */
  macro: string
  /** 方向语义：'default' 走布局默认；'U'/'D'/'L'/'R' 是显式方向别名 */
  direction: C4Direction
  /** 是否双向（BiRel）/ 反向（Rel_Back） */
  bidirectional: boolean
  reversed: boolean
  /** 是否有前导 index 位（RelIndex） */
  indexed: boolean
}

export type C4Direction = 'default' | 'U' | 'D' | 'L' | 'R'

export const C4_REL_MACROS: Readonly<Record<string, Omit<C4RelSignature, 'macro'>>> = Object.freeze({
  Rel: { direction: 'default', bidirectional: false, reversed: false, indexed: false },
  BiRel: { direction: 'default', bidirectional: true, reversed: false, indexed: false },
  Rel_Back: { direction: 'default', bidirectional: false, reversed: true, indexed: false },
  Rel_U: { direction: 'U', bidirectional: false, reversed: false, indexed: false },
  Rel_Up: { direction: 'U', bidirectional: false, reversed: false, indexed: false },
  Rel_D: { direction: 'D', bidirectional: false, reversed: false, indexed: false },
  Rel_Down: { direction: 'D', bidirectional: false, reversed: false, indexed: false },
  Rel_L: { direction: 'L', bidirectional: false, reversed: false, indexed: false },
  Rel_Left: { direction: 'L', bidirectional: false, reversed: false, indexed: false },
  Rel_R: { direction: 'R', bidirectional: false, reversed: false, indexed: false },
  Rel_Right: { direction: 'R', bidirectional: false, reversed: false, indexed: false },
  RelIndex: { direction: 'default', bidirectional: false, reversed: false, indexed: true },
})

/** 关系方向 → 宏名（表单改方向时用；每个方向给一个规范宏名） */
export const C4_REL_MACRO_OF: Record<C4Direction, string> = {
  default: 'Rel',
  U: 'Rel_U',
  D: 'Rel_D',
  L: 'Rel_L',
  R: 'Rel_R',
}

// ---------- 元素数据 ----------

export interface C4HeaderData {
  kind: 'c4-header'
  /** 声明关键字原文（C4Context …） */
  keyword: C4Keyword
  /** 关键字之后的原文（同行空白等），逐字保留 */
  trailing: string
}

/** 函数实参：`$name = value` 或位置实参 */
export interface C4Argument {
  /** 命名参数名（不含 `$`）；位置参数 null */
  name: string | null
  /** 值原文（含引号，逐字保留） */
  raw: string
}

/**
 * C4 元素声明行。
 * `args` 是**实参原文的有序列表**（位置与命名混排，逐字保留）；`fields` 是把实参映射到
 * 语义位后的结果（alias / label / techn / descr / sprite / tags / link），供投影与表单消费。
 */
export interface C4ElementData {
  kind: 'c4-element'
  /** 声明宏原文（Person / System_Ext / Deployment_Node …） */
  macro: string
  elementKind: C4ElementKind
  variant: string
  args: C4Argument[]
  /** 语义字段（值已**去引号**；未提供为 null） */
  fields: C4Fields
  /** 所在边界的 alias（块栈顶）；顶层元素 null。块栈配对由解析器一次算好，
   * 投影 / 结构树据此显示归属（`}` 收尾行不入元素，故投影无法自行回退） */
  parentAlias: string | null
  /** 行尾残留（`%%` 注释 / 尾随空白），逐字保留 */
  tail: string
}

export interface C4Fields {
  alias: string | null
  label: string | null
  /** Container/Component 的 technology；Deployment_Node 的 type 归到这里 */
  techn: string | null
  descr: string | null
  sprite: string | null
  tags: string | null
  /** `$link` 命名参数的值 */
  link: string | null
}

/** 边界开行（C4 用花括号块，无独立收尾关键字——`}` 单独一行） */
export interface C4BoundaryData {
  kind: 'c4-boundary'
  macro: string
  /** 边界种类：enterprise / system / generic / container */
  boundaryKind: C4BoundaryKind
  args: C4Argument[]
  fields: C4Fields
  /** 外层边界的 alias（块栈里本行之前的那一层）；顶层边界 null */
  parentAlias: string | null
  /** 行尾到 `{` 之间的原文（含 `{`），逐字保留 */
  tail: string
}

/** 边界种类（`boundaryKind`）：四类 Boundary + 四类 Deployment Node 合流后的分类 */
export type C4BoundaryKind = 'enterprise' | 'system' | 'generic' | 'container' | 'deployment'

/** 关系声明行（位置序身份 `relation:N`） */
export interface C4RelationData {
  kind: 'c4-relation'
  macro: string
  direction: C4Direction
  bidirectional: boolean
  reversed: boolean
  indexed: boolean
  /** RelIndex 的 index 实参原文（被 mermaid 忽略，逐字保留）；非 RelIndex 为 null */
  indexRaw: string | null
  args: C4Argument[]
  /** 语义字段（值已去引号） */
  from: string
  to: string
  label: string | null
  techn: string | null
  descr: string | null
  sprite: string | null
  tags: string | null
  link: string | null
  tail: string
}

export type C4ElementDataUnion = C4HeaderData | C4ElementData | C4BoundaryData | C4RelationData

// ---------- 词法助手 ----------

/** C4 标识符（alias）词法：标识符形态的裸词 */
const C4_ALIAS_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/

export function isValidC4Alias(alias: string): boolean {
  return C4_ALIAS_RE.test(alias)
}

/** C4 文本字段（label / descr / techn / tags）校验：非空、无换行、无半角双引号 */
export function isValidC4Text(text: string): boolean {
  return text.trim() !== '' && !/[\n\r"]/.test(text)
}

/** 带引号字符串的值：去引号（保留内部原文）；非引号形态原样返回 */
export function stripC4Quote(raw: string): string {
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) return raw.slice(1, -1)
  return raw
}

/**
 * 值 → 源码形态：**含除小写字母 / 数字 / `_` / `.` / `-` 之外的任何字符即加引号**。
 * C4 的实参在 mermaid 词法里只有「带引号串」才是安全文本（裸词会被当标识符 / 关键字
 * 解析，`Go` / `Java 17` / 中文都会被误读），故这里只放行最低限度的裸词形态。
 */
export function quoteC4Value(value: string): string {
  return /^[a-z0-9_./-]+$/.test(value) ? value : `"${value}"`
}

/**
 * 拆分实参串（已去掉外层圆括号）：按顶层逗号切分，跳过引号内的逗号与嵌套括号。
 * 返回的每段保留原文空白，值形态由 classifyC4Argument 归类。
 */
export function splitC4Args(inner: string): string[] {
  const out: string[] = []
  let depth = 0
  let quote: string | null = null
  let start = 0
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]
    if (quote !== null) {
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
    } else if (ch === '(' || ch === '[' || ch === '{') {
      depth++
    } else if (ch === ')' || ch === ']' || ch === '}') {
      if (depth > 0) depth--
    } else if (ch === ',' && depth === 0) {
      out.push(inner.slice(start, i).trim())
      start = i + 1
    }
  }
  const last = inner.slice(start).trim()
  if (last !== '' || out.length > 0) out.push(last)
  return out
}

/** 单段实参 → `{ name, raw }`：`$name = value` 视为命名参数，其余为位置参数 */
function classifyC4Argument(segment: string): C4Argument | null {
  if (segment === '') return null
  const named = /^\$([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]+)$/.exec(segment)
  if (named !== null) return { name: named[1], raw: named[2].trim() }
  return { name: null, raw: segment }
}

/** 取函数调用行的实参（`(` … 末 `)`）；无括号调用（`SHOW_LEGEND` 等）返回 null */
function takeC4Call(body: string): { macro: string; inner: string; tail: string } | null {
  const open = body.indexOf('(')
  if (open === -1) return null
  const macro = body.slice(0, open).trim()
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(macro)) return null
  // 末括号：最后一个 `)` 之前可能有 `%%` 注释
  const comment = body.indexOf('%%')
  const hard = comment === -1 ? body : body.slice(0, comment)
  const close = hard.lastIndexOf(')')
  if (close === -1 || close < open) return null
  const inner = hard.slice(open + 1, close)
  const tail = body.slice(hard.length) + body.slice(close + 1, hard.length)
  return { macro, inner, tail }
}

// ---------- 行级解析 ----------

const C4_HEADER_RE = new RegExp(`^(${C4_KEYWORDS.join('|')})([ \\t\\r]*)$`)

/** 声明头解析：`C4Context` 单独成行（关键字后只允许空白 / 注释） */
function parseHeaderLine(body: string): Omit<C4HeaderData, 'kind'> | null {
  const m = C4_HEADER_RE.exec(body)
  if (m !== null) return { keyword: m[1] as C4Keyword, trailing: m[2] ?? '' }
  return null
}

/**
 * 元素行解析：白名单宏 → 实参列表 → 语义字段映射。
 * 位置实参按宏签名的 `positionals` 顺序落到字段位；命名参数（`$name=`）按名覆盖。
 */
function parseElementLine(body: string): Omit<C4ElementData, 'kind' | 'parentAlias'> | null {
  const call = takeC4Call(body)
  if (call === null) return null
  const signature = C4_ELEMENT_MACROS[call.macro]
  if (signature === undefined) return null
  const args = splitC4Args(call.inner)
    .map(classifyC4Argument)
    .filter((a): a is C4Argument => a !== null)
  const fields = mapC4Fields(args, signature.positionals)
  return { macro: call.macro, elementKind: signature.kind, variant: signature.variant, args, fields, tail: call.tail }
}

/** 边界行解析：`Enterprise_Boundary(alias, label, ?type, ?tags, $link) {`（含 Deployment Node 四类） */
function parseBoundaryLine(body: string): Omit<C4BoundaryData, 'kind' | 'parentAlias'> | null {
  const call = takeC4Call(body)
  if (call === null) return null
  const signature = C4_BOUNDARY_MACROS[call.macro]
  if (signature === undefined) return null
  const args = splitC4Args(call.inner)
    .map(classifyC4Argument)
    .filter((a): a is C4Argument => a !== null)
  // 位置表：alias, label, type(→techn), tags, link
  const fields = mapC4Fields(args, ['alias', 'label', 'techn', 'tags', 'link'])
  const after = body.slice(body.lastIndexOf(')') + 1)
  return {
    macro: call.macro,
    boundaryKind: signature.boundaryKind,
    args,
    fields,
    // 花括号与尾随空白逐字保留（C4 块体用 `}` 收尾，无独立关键字）
    tail: after,
  }
}

/** 关系行解析：`Rel(from, to, label, ?techn, ?descr, ?sprite, ?tags, $link)` */
function parseRelationLine(body: string): Omit<C4RelationData, 'kind'> | null {
  const call = takeC4Call(body)
  if (call === null) return null
  const signature = C4_REL_MACROS[call.macro]
  if (signature === undefined) return null
  const args = splitC4Args(call.inner)
    .map(classifyC4Argument)
    .filter((a): a is C4Argument => a !== null)
  const indexRaw = signature.indexed ? (args[0]?.raw ?? null) : null
  const rest = signature.indexed ? args.slice(1) : args
  // 位置形态：from / to 分别取第 0 / 第 1 个位置实参；命名参数 `$from` / `$to` 优先。
  const positional = rest.filter((a) => a.name === null)
  const fromRaw = rest.find((a) => a.name === 'from')?.raw ?? positional[0]?.raw ?? ''
  const toRaw = rest.find((a) => a.name === 'to')?.raw ?? positional[1]?.raw ?? ''
  if (fromRaw === '' || toRaw === '') return null
  return {
    macro: call.macro,
    direction: signature.direction,
    bidirectional: signature.bidirectional,
    reversed: signature.reversed,
    indexed: signature.indexed,
    indexRaw,
    args,
    from: stripC4Quote(fromRaw),
    to: stripC4Quote(toRaw),
    label: valueOf(rest, 'label', 2),
    techn: valueOf(rest, 'techn', 3),
    descr: valueOf(rest, 'descr', 4),
    sprite: valueOf(rest, 'sprite', 5),
    tags: valueOf(rest, 'tags', 6),
    link: namedOf(rest, 'link'),
    tail: call.tail,
  }
}

/** 按字段顺序表把实参映射到语义字段（位置实参按序、命名参数按名覆盖）；值一律去引号 */
function mapC4Fields(args: C4Argument[], positionals: readonly C4FieldName[]): C4Fields {
  const fields: C4Fields = {
    alias: null,
    label: null,
    techn: null,
    descr: null,
    sprite: null,
    tags: null,
    link: null,
  }
  let slot = 0
  for (const arg of args) {
    if (arg.name !== null) {
      assignC4Field(fields, arg.name as C4FieldName, arg.raw)
      continue
    }
    const name = positionals[slot]
    slot++
    if (name === undefined) continue
    assignC4Field(fields, name, arg.raw)
  }
  return fields
}

/** 字段赋值：空原文 → null；带引号值去引号（alias 是标识符位，恒裸词） */
function assignC4Field(fields: C4Fields, name: C4FieldName, raw: string): void {
  if (!(name in fields)) return
  if (raw === '') {
    fields[name] = null
    return
  }
  fields[name] = stripC4Quote(raw)
}

/** 取位置字段值（去引号）；命名参数优先 */
function valueOf(args: C4Argument[], name: C4FieldName, position: number): string | null {
  const named = args.find((a) => a.name === name)
  if (named !== undefined) return named.raw === '' ? null : stripC4Quote(named.raw)
  const positional = args.filter((a) => a.name === null)
  const arg = positional[position]
  if (arg === undefined || arg.raw === '') return null
  return stripC4Quote(arg.raw)
}

/** 取命名参数值（去引号） */
function namedOf(args: C4Argument[], name: string): string | null {
  const named = args.find((a) => a.name === name)
  if (named === undefined || named.raw === '') return null
  return stripC4Quote(named.raw)
}

// ---------- 元素原文重建 ----------

/** 实参 → 源码片段（命名参数带 `$`；值按需加引号） */
function renderC4Argument(arg: C4Argument): string {
  if (arg.name !== null) return `$${arg.name}=${arg.raw}`
  return arg.raw
}

/**
 * 元素行原文重建。`fields` 的**已提供字段**按下标就地替换实参值，未提供的字段保持原样；
 * 目标位**超出已有实参数**时补足中间的位（`?descr` 之前有 `?techn` 等）再追加，
 * 使「给 Person 补 descr」这类编辑得到合法源码。
 * 值含非词字符时自动加引号（quoteC4Value）。`alias` 是标识符位，不加引号。
 */
export function renderC4Element(data: C4ElementData, changes: Partial<C4Fields> = {}): string {
  const slots: readonly string[] =
    data.elementKind === 'container' || data.elementKind === 'component'
      ? ['alias', 'label', 'techn', 'descr', 'sprite', 'tags', 'link']
      : ['alias', 'label', 'descr', 'sprite', 'tags', 'link']
  return renderC4Call(data.macro, data.args, slots, changes, data.tail)
}

/**
 * 函数调用行的通用重建：位置实参按 `slots` 表落位，`changes` 覆盖对应键；
 * **超出已有实参数的变更位**按需补位（中间缺口落空串——mermaid 把 `,,` 的空位读作缺省）。
 * `slots` 的元素是 `changes` 的键名（元素的字段名 / 关系的 `from`/`to`/字段名）。
 */
function renderC4Call(
  macro: string,
  args: readonly C4Argument[],
  slots: readonly string[],
  changes: Record<string, unknown>,
  tail: string,
): string {
  const out: C4Argument[] = []
  let slot = 0
  const handled = new Set<number>()
  for (const arg of args) {
    if (arg.name !== null) {
      const value = changes[arg.name]
      out.push(value === undefined ? arg : { name: arg.name, raw: value === null ? '' : quoteC4Value(String(value)) })
      continue
    }
    const key = slots[slot]
    const value = key === undefined ? undefined : changes[key]
    if (value === undefined) {
      out.push(arg)
    } else {
      handled.add(slot)
      // alias / from / to 是标识符位，恒不加引号
      const bare = key === 'alias' || key === 'from' || key === 'to'
      out.push({ name: null, raw: value === null ? '' : bare ? String(value) : quoteC4Value(String(value)) })
    }
    slot++
  }
  // 变更位超出已有实参数：先处理更靠后的位，补位到该下标（中间缺口留空），再放新值
  for (let i = slots.length - 1; i >= 0; i--) {
    if (handled.has(i)) continue
    const key = slots[i]
    const value = changes[key]
    if (value === undefined) continue
    while (out.length < i) out.push({ name: null, raw: '' })
    const bare = key === 'alias' || key === 'from' || key === 'to'
    out.push({ name: null, raw: value === null ? '' : bare ? String(value) : quoteC4Value(String(value)) })
    handled.add(i)
  }
  const rendered = out.map(renderC4Argument)
  // 去掉末尾由补位产生的空实参（`X(a, "")` → `X(a)`）
  while (rendered.length > 0 && rendered[rendered.length - 1] === '') rendered.pop()
  return `${macro}(${rendered.join(', ')})${tail}`
}

/** 边界行原文重建（`alias, label, ?type, ?tags, $link` 位置表 + ` {` 尾段逐字保留） */
export function renderC4Boundary(data: C4BoundaryData, changes: Partial<C4Fields> = {}): string {
  const slots: readonly string[] = ['alias', 'label', 'techn', 'tags', 'link']
  return renderC4Call(data.macro, data.args, slots, changes, data.tail)
}

/**
 * 关系行原文重建。`changes.direction` 改宏名（Rel ↔ Rel_U/D/L/R）；
 * `changes.from` / `changes.to` 用于 **alias 重命名的手术改写**（引用同步）；其余字段就地改值。
 * RelIndex 的前导 index 实参逐字保留。
 */
export function renderC4Relation(data: C4RelationData, changes: C4RelationChanges = {}): string {
  const indexArgs = data.indexed && data.args.length > 0 ? [data.args[0]] : []
  const rest = data.indexed ? data.args.slice(1) : data.args
  // 关系位表：0=from、1=to、2=label、3=techn、4=descr、5=sprite、6=tags（link 走命名参数）
  const slots: readonly string[] = ['from', 'to', 'label', 'techn', 'descr', 'sprite', 'tags']
  const inner = renderC4Call('', rest, slots, changes as Record<string, unknown>, '').slice(1, -1)
  const macro = changes.direction !== undefined ? C4_REL_MACRO_OF[changes.direction] : data.macro
  const rendered = [...indexArgs.map(renderC4Argument), ...(inner === '' ? [] : [inner])]
  return `${macro}(${rendered.join(', ')})${data.tail}`
}

// ---------- 解析器 ----------

export class C4Parser implements DiagramParser {
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
    let relationCount = 0
    let headerSeen = false
    // 边界块深度：C4 的块体由开关两类元素配对（开行带 `{`，闭合行是裸 `}`）
    const boundaryStack: string[] = []
    const aliasCounters = new Map<string, number>()
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
        const body = line.slice(firstChar)

        if (!headerSeen) {
          const header = parseHeaderLine(body)
          if (header === null) {
            throw parseFailure(lineNo, '图表必须以 C4Context / C4Container / C4Component / C4Dynamic / C4Deployment 声明开始')
          }
          headerSeen = true
          entries.push({ span: spanOfLine(), id: 'c4-header', data: { kind: 'c4-header', ...header } })
        } else if (trimmed === '}') {
          // 边界块收尾：本行不入元素（缩进与换行随 verbatim 保留），仅退栈配对
          boundaryStack.pop()
        } else if (body.startsWith('%%')) {
          // 注释行：逐字保留
        } else {
          const boundary = parseBoundaryLine(body)
          if (boundary !== null && /^[ \t]*\{[ \t]*$/.test(boundary.tail)) {
            const alias = boundary.fields.alias ?? ''
            const n = (aliasCounters.get(alias) ?? 0) + 1
            aliasCounters.set(alias, n)
            const parentAlias = boundaryStack.length > 0 ? boundaryStack[boundaryStack.length - 1] : null
            boundaryStack.push(alias)
            entries.push({
              span: spanOfLine(),
              id: c4BoundaryElementId(alias, n),
              data: { kind: 'c4-boundary', ...boundary, parentAlias },
            })
          } else {
            const relation = parseRelationLine(body)
            if (relation !== null) {
              relationCount++
              entries.push({
                span: spanOfLine(),
                id: `relation:${relationCount}`,
                data: { kind: 'c4-relation', ...relation },
              })
            } else {
              const element = parseElementLine(body)
              if (element !== null) {
                const alias = element.fields.alias ?? ''
                const n = (aliasCounters.get(alias) ?? 0) + 1
                aliasCounters.set(alias, n)
                const parentAlias = boundaryStack.length > 0 ? boundaryStack[boundaryStack.length - 1] : null
                entries.push({
                  span: spanOfLine(),
                  id: c4ElementElementId(alias, n),
                  data: { kind: 'c4-element', ...element, parentAlias },
                })
              }
              // 其余（Rel_S/Ne/B/T、Lay_*、Show/Hide、Update*、SHOW_LEGEND、title、
              // 无法识别的行）：不解析，逐字保留（ADR-0008）
            }
          }
        }
      }

      if (nl === -1) break
      cursor = nl + 1
    }

    if (!headerSeen) {
      throw parseFailure(1, '图表必须以 C4Context / C4Container / C4Component / C4Dynamic / C4Deployment 声明开始')
    }
    return assembleDocument(source, entries)
  }

  // ---------- 意图落地（resolveRewrites） ----------

  resolveRewrites(doc: SourceDocument, intent: EditIntent): ReadonlyMap<string, string> | null {
    switch (intent.type) {
      case 'add-c4-element':
        return this.resolveAddElement(doc, intent as Extract<C4Intent, { type: 'add-c4-element' }>)
      case 'set-c4-element':
        return this.resolveSetElement(doc, intent as Extract<C4Intent, { type: 'set-c4-element' }>)
      case 'rename-c4-alias':
        return this.resolveRenameAlias(doc, intent as Extract<C4Intent, { type: 'rename-c4-alias' }>)
      case 'delete-c4-element':
        return this.resolveDeleteElement(doc, intent as Extract<C4Intent, { type: 'delete-c4-element' }>)
      case 'add-c4-boundary':
        return this.resolveAddBoundary(doc, intent as Extract<C4Intent, { type: 'add-c4-boundary' }>)
      case 'set-c4-boundary':
        return this.resolveSetBoundary(doc, intent as Extract<C4Intent, { type: 'set-c4-boundary' }>)
      case 'delete-c4-boundary':
        return this.resolveDeleteBoundary(doc, intent as Extract<C4Intent, { type: 'delete-c4-boundary' }>)
      case 'add-rel':
        return this.resolveAddRel(doc, intent as Extract<C4Intent, { type: 'add-rel' }>)
      case 'set-rel':
        return this.resolveSetRel(doc, intent as Extract<C4Intent, { type: 'set-rel' }>)
      case 'delete-rel':
        return this.resolveDeleteRel(doc, intent as Extract<C4Intent, { type: 'delete-rel' }>)
      default:
        return null
    }
  }

  private elementPart(doc: SourceDocument, elementId: string): { id: string; element: C4ElementData } | null {
    const part = getElementById(doc, elementId)
    if (part === undefined || part.element.kind !== 'c4-element') return null
    return { id: part.id, element: part.element as C4ElementData }
  }

  private boundaryPart(doc: SourceDocument, elementId: string): { id: string; element: C4BoundaryData } | null {
    const part = getElementById(doc, elementId)
    if (part === undefined || part.element.kind !== 'c4-boundary') return null
    return { id: part.id, element: part.element as C4BoundaryData }
  }

  /** 新增元素声明（`Macro(alias, "label", …)`）；锚点缺省 = 文档末尾 */
  private resolveAddElement(
    doc: SourceDocument,
    intent: Extract<C4Intent, { type: 'add-c4-element' }>,
  ): Map<string, string> | null {
    const signature = C4_ELEMENT_MACROS[intent.macro]
    if (signature === undefined) return null
    const alias = intent.alias.trim()
    if (!isValidC4Alias(alias)) return null
    if (intent.label !== undefined && !isValidC4Text(intent.label)) return null
    if (intent.techn !== undefined && !isValidC4Text(intent.techn)) return null
    if (intent.descr !== undefined && !isValidC4Text(intent.descr)) return null
    const fields: C4Fields = {
      alias,
      label: intent.label ?? null,
      techn: intent.techn ?? null,
      descr: intent.descr ?? null,
      sprite: null,
      tags: null,
      link: null,
    }
    const positionals = signature.positionals
    const parts: string[] = []
    for (const name of positionals) {
      if (name === 'alias') {
        parts.push(alias)
        continue
      }
      const value = fields[name]
      if (value === null) break
      parts.push(quoteC4Value(value))
    }
    const rendered = `${intent.macro}(${parts.join(', ')})`
    return insertAfter(doc, {
      afterElementId: intent.afterElementId,
      render: (indent, original) => `${/[\n\r]$/.test(original) ? '' : '\n'}${indentLines(indent, [rendered])}`,
    })
  }

  /** 改元素字段（label / techn / descr；alias 走 rename-c4-alias） */
  private resolveSetElement(
    doc: SourceDocument,
    intent: Extract<C4Intent, { type: 'set-c4-element' }>,
  ): Map<string, string> | null {
    const part = this.elementPart(doc, intent.elementId)
    if (part === null) return null
    const changes = intent.changes
    if (changes.label !== undefined && changes.label !== null && !isValidC4Text(changes.label)) return null
    if (changes.techn !== undefined && changes.techn !== null && !isValidC4Text(changes.techn)) return null
    if (changes.descr !== undefined && changes.descr !== null && !isValidC4Text(changes.descr)) return null
    return new Map([[part.id, renderC4Element(part.element, changes)]])
  }

  /**
   * 改 alias（**语法标识**，手术改写）：重写声明行的 alias 位，并同步改写**引用它的关系**
   * （`from` / `to` 位）。其余文本逐字保留。alias 已被别的元素占用时拒绝（不产出歧义源码）。
   */
  private resolveRenameAlias(
    doc: SourceDocument,
    intent: Extract<C4Intent, { type: 'rename-c4-alias' }>,
  ): Map<string, string> | null {
    const part = this.elementPart(doc, intent.elementId)
    if (part === null) return null
    const oldAlias = part.element.fields.alias ?? ''
    const newAlias = intent.alias.trim()
    if (!isValidC4Alias(newAlias)) return null
    if (newAlias === oldAlias) return null
    // 占用检查：别名在图内是共享命名空间（关系直接引用它），重名会让改写产生歧义
    const occupied = doc.elements.some((p) => {
      if (p.id === part.id) return false
      if (p.element.kind === 'c4-element') return (p.element as C4ElementData).fields.alias === newAlias
      if (p.element.kind === 'c4-boundary') return (p.element as C4BoundaryData).fields.alias === newAlias
      return false
    })
    if (occupied) return null
    const rewrites = new Map<string, string>([
      [part.id, renderC4Element(part.element, { alias: newAlias })],
    ])
    for (const other of doc.elements) {
      if (other.element.kind !== 'c4-relation') continue
      const rel = other.element as C4RelationData
      if (rel.from !== oldAlias && rel.to !== oldAlias) continue
      rewrites.set(
        other.id,
        renderC4Relation(rel, {
          from: rel.from === oldAlias ? newAlias : undefined,
          to: rel.to === oldAlias ? newAlias : undefined,
        }),
      )
    }
    return rewrites
  }

  /** 删除元素：连级联删去引用它的关系（悬空引用会让 mermaid 静默丢弃，语义漂移） */
  private resolveDeleteElement(
    doc: SourceDocument,
    intent: Extract<C4Intent, { type: 'delete-c4-element' }>,
  ): Map<string, string> | null {
    const part = this.elementPart(doc, intent.elementId)
    if (part === null) return null
    const alias = part.element.fields.alias ?? ''
    const rewrites = new Map<string, string>([[part.id, '']])
    for (const other of doc.elements) {
      if (other.element.kind !== 'c4-relation') continue
      const rel = other.element as C4RelationData
      if (rel.from === alias || rel.to === alias) rewrites.set(other.id, '')
    }
    return rewrites
  }

  /** 新增边界块（开行 `Enterprise_Boundary(...) {\n}`——空块两行一次写入） */
  private resolveAddBoundary(
    doc: SourceDocument,
    intent: Extract<C4Intent, { type: 'add-c4-boundary' }>,
  ): Map<string, string> | null {
    const signature = C4_BOUNDARY_MACROS[intent.macro]
    if (signature === undefined) return null
    const alias = intent.alias.trim()
    if (!isValidC4Alias(alias)) return null
    if (intent.label !== undefined && !isValidC4Text(intent.label)) return null
    const labelPart = intent.label !== undefined ? `, ${quoteC4Value(intent.label)}` : ''
    return insertAfter(doc, {
      anchor: 'line-end',
      render: (indent, original) => {
        const nl = /[\n\r]$/.test(original) ? '' : '\n'
        return `${nl}${indent}${intent.macro}(${alias}${labelPart}) {\n${indent}}`
      },
    })
  }

  /** 改边界字段（label；alias 走 rename 路径之外的边界重命名由表单门卫拦下） */
  private resolveSetBoundary(
    doc: SourceDocument,
    intent: Extract<C4Intent, { type: 'set-c4-boundary' }>,
  ): Map<string, string> | null {
    const part = this.boundaryPart(doc, intent.elementId)
    if (part === null) return null
    const changes = intent.changes
    if (changes.label !== undefined && changes.label !== null && !isValidC4Text(changes.label)) return null
    return new Map([[part.id, renderC4Boundary(part.element, changes)]])
  }

  /** 删除边界：只删开行（块体与 `}` 收尾行逐字保留——空块仍是合法 C4） */
  private resolveDeleteBoundary(
    doc: SourceDocument,
    intent: Extract<C4Intent, { type: 'delete-c4-boundary' }>,
  ): Map<string, string> | null {
    const part = this.boundaryPart(doc, intent.elementId)
    if (part === null) return null
    return new Map([[part.id, '']])
  }

  /** 新增关系：`Rel(from, to, "label", "techn")` */
  private resolveAddRel(
    doc: SourceDocument,
    intent: Extract<C4Intent, { type: 'add-rel' }>,
  ): Map<string, string> | null {
    const from = intent.from.trim()
    const to = intent.to.trim()
    if (!isValidC4Alias(from) || !isValidC4Alias(to)) return null
    if (intent.label !== undefined && !isValidC4Text(intent.label)) return null
    if (intent.techn !== undefined && !isValidC4Text(intent.techn)) return null
    const direction = intent.direction ?? 'default'
    const macro = C4_REL_MACRO_OF[direction] ?? 'Rel'
    const parts = [from, to]
    if (intent.label !== undefined || intent.techn !== undefined) {
      parts.push(intent.label !== undefined ? quoteC4Value(intent.label) : '""')
    }
    if (intent.techn !== undefined) parts.push(quoteC4Value(intent.techn))
    const rendered = `${macro}(${parts.join(', ')})`
    return insertAfter(doc, {
      afterElementId: intent.afterElementId,
      render: (indent, original) => `${/[\n\r]$/.test(original) ? '' : '\n'}${indentLines(indent, [rendered])}`,
    })
  }

  /** 改关系：label / techn / descr / 方向（宏名） */
  private resolveSetRel(
    doc: SourceDocument,
    intent: Extract<C4Intent, { type: 'set-rel' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'c4-relation') return null
    const data = part.element as C4RelationData
    const changes = intent.changes
    if (changes.label !== undefined && changes.label !== null && !isValidC4Text(changes.label)) return null
    if (changes.techn !== undefined && changes.techn !== null && !isValidC4Text(changes.techn)) return null
    if (changes.descr !== undefined && changes.descr !== null && !isValidC4Text(changes.descr)) return null
    if (changes.direction !== undefined && C4_REL_MACRO_OF[changes.direction] === undefined) return null
    return new Map([[part.id, renderC4Relation(data, changes)]])
  }

  /** 删除关系行 */
  private resolveDeleteRel(
    doc: SourceDocument,
    intent: Extract<C4Intent, { type: 'delete-rel' }>,
  ): Map<string, string> | null {
    const part = getElementById(doc, intent.elementId)
    if (part === undefined || part.element.kind !== 'c4-relation') return null
    return new Map([[part.id, '']])
  }
}

interface RawEntry {
  span: Span
  id: string
  data: C4ElementDataUnion
}

export const c4Parser = new C4Parser()

// ---------- 编辑意图（工单 18 表单 / 画布所需集合） ----------

export interface C4ElementChanges {
  label?: string | null
  techn?: string | null
  descr?: string | null
}

export interface C4RelationChanges {
  label?: string | null
  techn?: string | null
  descr?: string | null
  direction?: C4Direction
  /** 仅用于 alias 重命名的**引用同步**（不对应用户编辑字段） */
  from?: string
  to?: string
}

export type C4Intent =
  /** 新增元素声明（macro 决定种类与字段组） */
  | {
      type: 'add-c4-element'
      macro: string
      alias: string
      label?: string
      techn?: string
      descr?: string
      afterElementId?: string
    }
  /** 改元素字段（label / techn / descr；alias 走 rename-c4-alias） */
  | { type: 'set-c4-element'; elementId: string; changes: C4ElementChanges }
  /** 改 alias（语法标识，连带重写引用它的关系端点） */
  | { type: 'rename-c4-alias'; elementId: string; alias: string }
  /** 删除元素（连带删去引用它的关系） */
  | { type: 'delete-c4-element'; elementId: string }
  /** 新增边界块（空块两行） */
  | { type: 'add-c4-boundary'; macro: string; alias: string; label?: string; afterElementId?: string }
  /** 改边界字段（label） */
  | { type: 'set-c4-boundary'; elementId: string; changes: { label?: string | null } }
  /** 删除边界（只删开行） */
  | { type: 'delete-c4-boundary'; elementId: string }
  /** 新增关系（macro 由 direction 推出；label / techn 可附） */
  | {
      type: 'add-rel'
      from: string
      to: string
      label?: string
      techn?: string
      direction?: C4Direction
      afterElementId?: string
    }
  /** 改关系（label / techn / descr / direction） */
  | { type: 'set-rel'; elementId: string; changes: C4RelationChanges }
  /** 删除关系 */
  | { type: 'delete-rel'; elementId: string }
