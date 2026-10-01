import { assembleDocument, getElementById, type SourceDocument } from './document'
import type { DiagramParser, EditIntent, ParseResult, SourceParseError } from './parser'
import { frontmatterEnd } from './frontmatter'
import type { Span } from './span'
import { insertAfter } from './insert'

/**
 * treeView 完整解析器（more-diagrams 工单 24，语法事实以
 * .scratch/more-diagrams/research/treeview.md 为准——Langium 图种，**非** frontmatter
 * 声明式）：手写、逐行、带 span（ADR-0004）。可测试承诺：解析后不做修改再重组装，
 * 输出与输入逐字相同（verbatim identity）。
 *
 * 覆盖（research §1/§2 核心）：
 * - 声明行：唯一关键字 `treeView-beta`，**大小写敏感**（Langium `Keyword` +
 *   检测器 `/^\s*treeView-beta/` 无 `i` 位），且必须是裸关键字行
 * - 节点行：`INDENTATION? name annotation*`；层级由**缩进字符数**决定（tab 记 1 个字符，
 *   research 坑 1；值与 mermaid `TreeViewValueConverter` 的 `input.length` 一致），
 *   mermaid `db.addNode` 用 `while (level <= 栈顶.level) pop()`——故组树比较用 `<=`
 * - 名称：引号名（`"..."` / `'...'`，去引号）或裸名（允许内部空格；终止于
 *   ` :::`/` icon(`/` ##` 前瞻或行尾，research 坑 2/3）
 * - 行内注解（可任意顺序、可重复，各以空白开头）：`:::class`、`icon(pack:name)`、
 *   `## 描述`；`icon()`（空）与 `icon(none)` 表示抑制图标
 * - 目录 = 名称（**去引号之后**）以 `/` 结尾（research 坑 4）
 *
 * 不解析、原样保留（清单外语法不报错，ADR-0008）：frontmatter、`%%` 注释、
 * 空行、`title` / `accTitle:` / `accDescr:` 行（文档级属性，本批不做表单化编辑）、
 * 识别不了的行（含 box-drawing 分支字符的装饰行——app 侧按原字节保留，渲染视图由
 * mermaid 预处理器产生，research §6.6）。
 *
 * span 约定（与 mindmap/ishikawa 同口径）：节点行的 span 含行首缩进（缩进即层级语法，
 * research §5——改写相邻行时必须原样搬运）与行尾换行，删除节点连同其子树一并干净移除。
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

export interface TreeviewHeaderData {
  kind: 'treeview-header'
  /** 原文关键字（保留用户书写，恒为 `treeView-beta`） */
  keyword: string
  trailing: string
}

export interface TreeviewNodeData {
  kind: 'treeview-node'
  /** 行首缩进原文（缩进即层级语法，属元素 span 的一部分） */
  indent: string
  /** 缩进字符数 = mermaid `level`（tab 记 1，research 坑 1） */
  level: number
  /** 引号字符（`"` / `'`）；裸名 null */
  quote: string | null
  /** 名称（去引号、裸名去尾空白；**不含**目录尾 `/`） */
  name: string
  /** true = 目录（名称去引号后以 `/` 结尾，research 坑 4） */
  isDirectory: boolean
  /** 名称与首个注解之间的空白（无注解时为空） */
  nameTrailing: string
  /** 名称之后的全部原文（含注解间空白；无注解时空串）——改名/切目录时逐字搬运 */
  annSegment: string
  /** `:::class` 注解原文（不含前导空白）；无 null */
  classRaw: string | null
  /** `icon(...)` 注解原文（不含前导空白）；无 null */
  iconRaw: string | null
  /** `## 描述` 注解原文（不含前导空白）；无 null */
  descRaw: string | null
  /** 换行前残留空白 */
  trailing: string
  /** 行尾换行符（文档最后一行可能为空串） */
  eol: string
}

export type TreeviewElementData = TreeviewHeaderData | TreeviewNodeData

/** 渲染节点行：name / 目录标记编辑后的整行（注解与空白原样搬运） */
export function renderTreeviewNode(
  d: TreeviewNodeData,
  changes: { name?: string; isDirectory?: boolean } = {},
): string {
  const name = changes.name !== undefined ? changes.name : d.name
  const isDir = changes.isDirectory !== undefined ? changes.isDirectory : d.isDirectory
  const quote = d.quote ?? ''
  const namePart = quote + name + (isDir ? '/' : '') + quote
  // 名称之后的注解段整体逐字搬运（含各注解间空白，verbatim，ADR-0008）
  return d.indent + namePart + d.annSegment + d.trailing + d.eol
}

// ---------- 编辑意图（工单 24 表单/结构树/菜单所需集合） ----------

export type TreeviewIntent =
  /** 改节点名（不改目录标记；引号风格逐字保留） */
  | { type: 'set-node-name'; elementId: string; name: string }
  /** 切换目录/文件（在名称尾增删 `/`；引号风格逐字保留） */
  | { type: 'set-node-directory'; elementId: string; isDirectory: boolean }
  /** 添加子节点（落在目标节点整棵子树之后，缩进深一档；缺省为文件） */
  | { type: 'add-child'; parentElementId: string; name: string; isDirectory?: boolean }
  /** 添加同级节点（落在目标节点整棵子树之后，同缩进） */
  | { type: 'add-sibling'; elementId: string; name: string; isDirectory?: boolean }
  /** 删除节点：连同其全部后代（子树）一起删除 */
  | { type: 'delete-node'; elementId: string }

/**
 * 名称校验（表单层复用）：非空、单行；不含引号（引号是语法分隔符，名称内不允许——
 * QUOTED_NAME 引号内也不能含引号）、不含换行。目录 `/` 由独立的目录意图表达，
 * 这里的 name 不含尾 `/`（表单里用户输入的名称即节点名本身）。
 */
export function isValidTreeviewName(name: string): boolean {
  return name.trim() !== '' && !/["'\r\n]/.test(name)
}

// ---------- 行级解析 ----------

const HEADER_RE = /^([ \t]*)(treeView-beta)([ \t\r]*)$/
/** 目录名称尾 `/`（在去引号之后判定） */
const DIRECTORY_SUFFIX = '/'
/** 注解标记前的空白（research 坑 2：`[ \t]+:::` / `[ \t]+icon(` / `[ \t]+##`） */
const ANN_LEAD_RE = /^[ \t]+/
/** `:::class` 注解：前缀匹配，class 名贪心到词尾（其后须为空白或行尾） */
const CLASS_ANN_RE = /^:::([ \t]*)([A-Za-z_][\w-]*)/
/** `icon(pack:name)` 注解：前缀匹配；`icon()`（空）与 `icon(none)` 表示抑制 */
const ICON_ANN_RE = /^icon\(([\w-]*(?::[\w-]+)?)\)/
/** `## 描述` 注解：吞到行尾（描述可含空白） */
const DESC_ANN_RE = /^##[\s\S]*/
/** box-drawing 分支/竖线字符：含这些字符的行不解析（app 侧原字节保留，research §6.6） */
const BOX_DRAWING_RE = /[─━│┃└┗├┣]/

interface RawEntry {
  span: Span
  id: string
  data: TreeviewElementData
}

/** 行内注解解析结果：各注解原文 + 名称 */
interface ParsedNodeLine {
  quote: string | null
  name: string
  isDirectory: boolean
  /** 名称与首个注解之间的空白（无注解时为空） */
  nameTrailing: string
  /**
   * 名称之后的**全部**原文（含各注解间的空白；无注解时空串）。
   * 改名 / 切目录时整段逐字搬运，保证多个注解间空白不被归一化（verbatim，ADR-0008）。
   */
  annSegment: string
  classRaw: string | null
  iconRaw: string | null
  descRaw: string | null
}

/**
 * 把一个节点行的「名称 + 注解」部分切成结构化字段（去引号后的名称、目录标记、各注解原文）。
 * 名称与注解之间的边界：首个「空白 + `:::`/`icon(`/`##`」（research 坑 2，BARE_NAME 前瞻，
 * `CLASS_ANNOTATION = /[ \t]+:::/` 等）。返回 null = 不识别（逐字保留，不报错）。
 */
function parseNodeContent(content: string): ParsedNodeLine | null {
  if (content === '') return null
  let rest = content
  let quote: string | null = null
  let rawName: string
  // 1) 引号名：整段以引号包裹（QUOTED_NAME = "[^"]*" | '[^']*'），其后可为注解
  const quoted = /^(["'])([^"']*)\1/.exec(rest)
  if (quoted !== null) {
    quote = quoted[1]
    rawName = quoted[2]
    rest = rest.slice(quoted[0].length)
  } else {
    // 2) 裸名：终止于「空白 + ::: / icon( / ##」或行尾（BARE_NAME 前瞻语义）
    const bare = /^(.*?)(?=[ \t]+(?::::|icon\(|##)|$)/s.exec(rest)
    if (bare === null || bare[1] === '') return null
    rawName = bare[1].replace(/[\t ]+$/, '')
    rest = rest.slice(bare[1].length)
  }
  // 3) 注解：任意顺序、可重复，各以空白开头（research 坑 2）。
  //    `:::`/`icon()` 前缀匹配并消费（其后可紧跟别的注解）；`##` 吞到行尾。
  const annSegment = rest // 名称之后的全部原文（含空白），改名时逐字搬运
  let classRaw: string | null = null
  let iconRaw: string | null = null
  let descRaw: string | null = null
  let nameTrailing = ''
  while (rest !== '') {
    const lead = ANN_LEAD_RE.exec(rest)
    if (lead === null) return null // 注解标记前必须有空白
    if (nameTrailing === '') nameTrailing = lead[0]
    const body = rest.slice(lead[0].length)
    const classMatch: RegExpExecArray | null = classRaw === null ? CLASS_ANN_RE.exec(body) : null
    const iconMatch: RegExpExecArray | null = iconRaw === null ? ICON_ANN_RE.exec(body) : null
    if (classMatch !== null) {
      classRaw = classMatch[0]
      rest = body.slice(classMatch[0].length)
    } else if (iconMatch !== null) {
      iconRaw = iconMatch[0]
      rest = body.slice(iconMatch[0].length)
    } else if (descRaw === null) {
      const descMatch = DESC_ANN_RE.exec(body)
      if (descMatch === null) return null
      descRaw = descMatch[0]
      rest = ''
    } else {
      return null // 未知/重复注解：不识别，逐字保留
    }
  }
  const isDirectory = rawName.endsWith(DIRECTORY_SUFFIX)
  const name = isDirectory ? rawName.slice(0, -1) : rawName
  return { quote, name, isDirectory, nameTrailing, annSegment, classRaw, iconRaw, descRaw }
}

export class TreeviewParser implements DiagramParser {
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
    let nodeCount = 0
    let seenHeader = false
    // 文首 frontmatter 块不参与解析，整体 verbatim 保留（工单 11）
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
            // header 的 span 含行尾换行，保持与节点一致的插入锚点语义
            span: { start: cursor, end: cursor + line.length + eol.length },
            id: 'header',
            data: {
              kind: 'treeview-header',
              keyword: headerMatch[2],
              trailing: (headerMatch[3] ?? '').replace(/\r$/, ''),
            },
          })
        } else if (trimmed.startsWith('%%')) {
          // 注释行：逐字保留，不参与层级
        } else if (seenHeader && !BOX_DRAWING_RE.test(line)) {
          const firstNonWs = line.length - line.trimStart().length
          const indent = line.slice(0, firstNonWs)
          const bodyEnd = /[ \t\r]+$/.exec(line)
          const trailing = eol === '' && bodyEnd !== null ? bodyEnd[0] : ''
          const content = line.slice(firstNonWs, line.length - trailing.length)
          const parsed = parseNodeContent(content)
          if (parsed !== null) {
            nodeCount++
            entries.push({
              span: { start: cursor, end: cursor + line.length + eol.length },
              id: `treeview-node:${nodeCount}`,
              data: {
                kind: 'treeview-node',
                indent,
                level: indent.length,
                quote: parsed.quote,
                name: parsed.name,
                isDirectory: parsed.isDirectory,
                nameTrailing: parsed.nameTrailing,
                annSegment: parsed.annSegment,
                classRaw: parsed.classRaw,
                iconRaw: parsed.iconRaw,
                descRaw: parsed.descRaw,
                trailing,
                eol,
              },
            })
          }
          // 其余（title / accTitle / 识别不了的行）：逐字保留
        }
        // header 之前的非注释行、含 box-drawing 的行：不解析，逐字保留
      }

      if (nl === -1) break
      cursor = nl + 1
    }

    if (!seenHeader) {
      throw parseFailure(1, '图表必须以 treeView-beta 声明开始')
    }
    return assembleDocument(source, entries)
  }

  // ---------- 意图落地（resolveRewrites） ----------

  resolveRewrites(doc: SourceDocument, intent: EditIntent): ReadonlyMap<string, string> | null {
    switch (intent.type) {
      case 'set-node-name':
        return this.resolveSetNodeName(doc, intent as Extract<TreeviewIntent, { type: 'set-node-name' }>)
      case 'set-node-directory':
        return this.resolveSetNodeDirectory(doc, intent as Extract<TreeviewIntent, { type: 'set-node-directory' }>)
      case 'add-child':
        return this.resolveAddChild(doc, intent as Extract<TreeviewIntent, { type: 'add-child' }>)
      case 'add-sibling':
        return this.resolveAddSibling(doc, intent as Extract<TreeviewIntent, { type: 'add-sibling' }>)
      case 'delete-node':
        return this.resolveDeleteNode(doc, intent as Extract<TreeviewIntent, { type: 'delete-node' }>)
      default:
        return null
    }
  }

  private nodePart(doc: SourceDocument, elementId: string) {
    const part = getElementById(doc, elementId)
    if (part === undefined || part.element.kind !== 'treeview-node') return null
    return part
  }

  private resolveSetNodeName(
    doc: SourceDocument,
    intent: Extract<TreeviewIntent, { type: 'set-node-name' }>,
  ): Map<string, string> | null {
    const part = this.nodePart(doc, intent.elementId)
    if (part === null || !isValidTreeviewName(intent.name)) return null
    const node = part.element as TreeviewNodeData
    if (intent.name === node.name) return null
    return new Map([[part.id, renderTreeviewNode(node, { name: intent.name.trim() })]])
  }

  private resolveSetNodeDirectory(
    doc: SourceDocument,
    intent: Extract<TreeviewIntent, { type: 'set-node-directory' }>,
  ): Map<string, string> | null {
    const part = this.nodePart(doc, intent.elementId)
    if (part === null) return null
    const node = part.element as TreeviewNodeData
    if (node.isDirectory === intent.isDirectory) return null
    return new Map([[part.id, renderTreeviewNode(node, { isDirectory: intent.isDirectory })]])
  }

  /** 节点子树（含自身）覆盖的 element 区间 [startIndex, endIndex]（与 mindmap/ishikawa 同构） */
  private subtreeRange(doc: SourceDocument, startIndex: number): { start: number; end: number } {
    const level = (doc.elements[startIndex].element as TreeviewNodeData).level
    let end = startIndex
    for (let i = startIndex + 1; i < doc.elements.length; i++) {
      const e = doc.elements[i].element
      if (e.kind !== 'treeview-node') break
      if ((e as TreeviewNodeData).level > level) {
        end = i
        continue
      }
      break
    }
    return { start: startIndex, end }
  }

  /**
   * 子节点缩进：跟随既有子节点（level 更深）的缩进；否则在父行缩进上加一档
   * （父缩进含 tab 用 tab，否则加 4 空格——mermaid 预处理器 INDENT_UNIT 即 4 空格，
   * research §6.1；层级是相对字符数，绝对宽度只影响观感）。
   */
  private childIndentOf(doc: SourceDocument, parent: TreeviewNodeData, parentIndex: number): string {
    for (let i = parentIndex + 1; i < doc.elements.length; i++) {
      const e = doc.elements[i].element
      if (e.kind !== 'treeview-node') break
      const n = e as TreeviewNodeData
      if (n.level <= parent.level) break
      // 第一个更深的节点 = 某条既有子路径的头，取其缩进
      return n.indent
    }
    if (parent.indent.includes('\t')) return parent.indent + '\t'
    return parent.indent + '    '
  }

  private resolveAddChild(
    doc: SourceDocument,
    intent: Extract<TreeviewIntent, { type: 'add-child' }>,
  ): Map<string, string> | null {
    if (!isValidTreeviewName(intent.name)) return null
    const part = this.nodePart(doc, intent.parentElementId)
    if (part === null) {
      // 空树（只有 header、无任何节点）时，父用空串占位：新节点顶格追加在 header 行之后
      // （空白菜单「加根节点」在空文档上的唯一合理落点），与 mermaid 首行即顶层节点一致。
      if (intent.parentElementId !== '') return null
      const header = getElementById(doc, 'header')
      if (header === undefined) return null
      const line = this.nameOf(intent.name.trim(), intent.isDirectory === true) + '\n'
      return insertAfter(doc, {
        afterElementId: 'header',
        render: (_i, original) => (/[\n\r]$/.test(original) ? '' : '\n') + line,
      })
    }
    const parent = part.element as TreeviewNodeData
    const parentIndex = doc.elements.indexOf(part)
    const range = this.subtreeRange(doc, parentIndex)
    const anchorId = doc.elements[range.end].id
    const indent = this.childIndentOf(doc, parent, parentIndex)
    const line = indent + this.nameOf(intent.name.trim(), intent.isDirectory === true) + '\n'
    return insertAfter(doc, {
      afterElementId: anchorId,
      render: (_i, original) => (/[\n\r]$/.test(original) ? '' : '\n') + line,
    })
  }

  private resolveAddSibling(
    doc: SourceDocument,
    intent: Extract<TreeviewIntent, { type: 'add-sibling' }>,
  ): Map<string, string> | null {
    if (!isValidTreeviewName(intent.name)) return null
    const part = this.nodePart(doc, intent.elementId)
    if (part === null) return null
    const node = part.element as TreeviewNodeData
    const nodeIndex = doc.elements.indexOf(part)
    const range = this.subtreeRange(doc, nodeIndex)
    const anchorId = doc.elements[range.end].id
    const line = node.indent + this.nameOf(intent.name.trim(), intent.isDirectory === true) + '\n'
    return insertAfter(doc, {
      afterElementId: anchorId,
      render: (_i, original) => (/[\n\r]$/.test(original) ? '' : '\n') + line,
    })
  }

  private resolveDeleteNode(
    doc: SourceDocument,
    intent: Extract<TreeviewIntent, { type: 'delete-node' }>,
  ): Map<string, string> | null {
    const part = this.nodePart(doc, intent.elementId)
    if (part === null) return null
    const range = this.subtreeRange(doc, doc.elements.indexOf(part))
    const rewrites = new Map<string, string>()
    for (let i = range.start; i <= range.end; i++) rewrites.set(doc.elements[i].id, '')
    return rewrites
  }

  /** 新建节点的名称文本：含空格/特殊字符时用引号包裹，目录的 `/` 在引号内（research 坑 4） */
  private nameOf(name: string, isDirectory: boolean): string {
    const needsQuote = /[ \t"'#]/.test(name) || name.includes('::') || name.includes('icon(')
    const body = name + (isDirectory ? DIRECTORY_SUFFIX : '')
    return needsQuote ? `"${body}"` : body
  }
}

export const treeviewParser = new TreeviewParser()
