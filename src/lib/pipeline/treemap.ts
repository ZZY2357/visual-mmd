import { assembleDocument, getElementById, type SourceDocument } from './document'
import type { DiagramParser, EditIntent, ParseResult, SourceParseError } from './parser'
import { frontmatterEnd } from './frontmatter'
import type { Span } from './span'
import { insertAfter } from './insert'

/**
 * treemap 完整解析器（more-diagrams 工单 20，语法事实以
 * .scratch/more-diagrams/research/treemap.md 为准——Langium 图种，非 jison）：
 * 手写、逐行、带 span（ADR-0004）。可测试承诺：解析后不做修改再重组装，
 * 输出与输入逐字相同（verbatim identity）。
 *
 * 覆盖（research §2 分层对齐）：
 * - 表头：`treemap` / `treemap-beta`（Langium 两个关键字都真；声明行必须是裸关键字）
 * - Section 行：`"名"`（引号必需，research 坑 1；可嵌套任意深）
 * - Leaf 行：`"名": 数字`（`:` 两侧空白任意）或 `"名", 数字`（逗号分隔同法）
 * - `:::class` 类标注（Section / Leaf 都可挂）：解析进 classRaw，编辑该行时逐字搬运
 *
 * 不解析、原样保留（清单外语法不报错，ADR-0008）：frontmatter、`%%` 注释、空行、
 * `title` / `accTitle` / `accDescr` / `classDef` 行、无法识别的行（裸词名在 Langium
 * 词法层是解析错误，但按 ADR-0008 我们不代为报错，逐字保留交由 mermaid 渲染报错）。
 *
 * span 约定（与 mindmap 解析器同口径）：节点行的 span 含行首缩进（缩进即层级语法，
 * research §5——改写相邻行时必须原样搬运）与行尾换行，删除节点连同其子树一并干净移除。
 * 层级由缩进宽度决定（research 坑 4：相对比较，同级等宽、子级更宽）。
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

export interface TreemapHeaderData {
  kind: 'treemap-header'
  /** 原文关键字（`treemap` / `treemap-beta`，保留用户书写） */
  keyword: string
  trailing: string
}

export interface TreemapNodeData {
  kind: 'treemap-node'
  /** 行首缩进原文（treemap 中缩进即层级语法，属元素 span 的一部分） */
  indent: string
  /** 引号字符（" / '）；编辑改名时原样保留 */
  quote: string
  /** 引号内名字 */
  name: string
  /** 名字与值分隔符（或 class 段）之间的空白 */
  nameAfter: string
  /** 值分隔符原文（`:` 或 `,`）；Section（无值）null */
  sep: string | null
  /** 分隔符与值之间的空白；Section null */
  sepAfter: string | null
  /** 数值段原文；Section null */
  value: string | null
  /** `:::class` 类标注原文（含 `:::` 前缀）；无 null */
  classRaw: string | null
  /** class 段之前的空白（Leaf 上位于值之后）；无 class 为 '' */
  classLead: string
  /** 换行前残留空白 */
  trailing: string
  /** 行尾换行符（文档最后一行可能为空串） */
  eol: string
  /** 0 起始的层级深度（顶格 Section 为 0） */
  depth: number
}

export type TreemapElementData = TreemapHeaderData | TreemapNodeData

/** 渲染节点行：name / value 编辑后的整行（含缩进与 eol，原样搬运 class 与空白） */
export function renderTreemapNode(
  d: TreemapNodeData,
  changes: { name?: string; value?: string } = {},
): string {
  const name = changes.name !== undefined ? changes.name : d.name
  const valuePart =
    d.sep === null || d.value === null
      ? ''
      : `${d.nameAfter}${d.sep}${d.sepAfter}${changes.value !== undefined ? changes.value : d.value}`
  return (
    d.indent +
    d.quote +
    name +
    d.quote +
    valuePart +
    (d.classRaw !== null ? d.classLead + d.classRaw : '') +
    d.trailing +
    d.eol
  )
}

// ---------- 编辑意图（工单 20 表单/结构树/菜单所需集合） ----------

export type TreemapIntent =
  /** 改节点名（引号内文本；引号风格逐字保留） */
  | { type: 'set-node-name'; elementId: string; name: string }
  /** 改叶子数值（仅 Leaf；非法数值拒绝落码） */
  | { type: 'set-node-value'; elementId: string; value: string }
  /** 顶层追加一个节点（value 缺省 = Section 分组；右键空白添加入口） */
  | { type: 'add-root'; name: string; value?: string }
  /** 给 Section 加子节点（落在其子树末尾之后）；value 缺省 = Section 分组 */
  | { type: 'add-child'; parentElementId: string; name: string; value?: string }
  /** 加同级节点（落在目标节点整棵子树之后，同缩进）；value 缺省 = Section 分组 */
  | { type: 'add-sibling'; elementId: string; name: string; value?: string }
  /** 删除节点：连同其全部后代（子树）一起删除 */
  | { type: 'delete-node'; elementId: string }

/** 节点名校验（表单层复用，与 Langium STRING2 词法同界）：非空、不含引号与换行 */
export function isValidTreemapName(name: string): boolean {
  return name !== '' && !/["'\r\n]/.test(name)
}

/**
 * 数值校验（表单层复用）：mermaid 词法 NUMBER2 = /[0-9_.]+/（research 坑 3），
 * 负号被词法层直接拒；我们收窄到无逗号子集（`1,000` 的逗号形态属清单外原样保留，
 * 不代写）。空串/非数字/负数均拒绝。
 */
export function isValidTreemapValue(value: string): boolean {
  return /^[0-9]+(\.[0-9]+)?$|^\.[0-9]+$/.test(value)
}

// ---------- 行级解析 ----------

const HEADER_RE = /^([ \t]*)(treemap(?:-beta)?)([ \t\r]*)$/
/** 引号名 + 余下部分（research 坑 1：名字必须带引号，单双引号皆可） */
const NAME_RE = /^"([^"]*)"|^(?:'([^']*)')/
/** `:::class` 类标注（尾随 token，research §2 边角） */
const CLASS_RE = /(:::[^: \t\r]+)$/

function indentWidth(indent: string): number {
  let w = 0
  for (const ch of indent) w += ch === '\t' ? 4 : 1
  return w
}

interface RawEntry {
  span: Span
  id: string
  data: TreemapElementData
}

export class TreemapParser implements DiagramParser {
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
    const depths: number[] = [] // 已打开层级的缩进宽度栈
    let nodeCount = 0
    let seenHeader = false
    // 文首 frontmatter 块不参与解析，整体 verbatim 保留（工单 11）
    const bodyStart = frontmatterEnd(source)
    let cursor = bodyStart

    for (;;) {
      const nl = source.indexOf('\n', cursor)
      const lineEnd = nl === -1 ? source.length : nl
      const line = source.slice(cursor, lineEnd)
      const eol = nl === -1 ? '' : '\n'
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
              kind: 'treemap-header',
              keyword: headerMatch[2],
              trailing: (headerMatch[3] ?? '').replace(/\r$/, ''),
            },
          })
        } else if (trimmed.startsWith('%%')) {
          // 注释行：逐字保留，不参与层级
        } else if (seenHeader) {
          const node = this.parseNodeLine(line)
          if (node !== null) {
            // 层级：缩进宽度栈（research 坑 4，与 mindmap 同口径）
            while (depths.length > 0 && depths[depths.length - 1] >= indentWidth(node.indent)) depths.pop()
            const depth = depths.length
            depths.push(indentWidth(node.indent))
            nodeCount++
            entries.push({
              span: { start: cursor, end: cursor + line.length + eol.length },
              id: `treemap-node:${nodeCount}`,
              data: { ...node, depth, eol },
            })
          }
          // 其余（title / accTitle / accDescr / classDef / 无法识别的行）逐字保留
        }
        // header 之前的非注释行：不解析，逐字保留
      }

      if (nl === -1) break
      cursor = nl + 1
    }

    if (!seenHeader) {
      throw parseFailure(1, '图表必须以 treemap 声明开始')
    }
    return assembleDocument(source, entries)
  }

  /** 节点行 → 元素数据；不识别返回 null（逐字保留，不报错）。eol 由调用方补。 */
  private parseNodeLine(line: string): Omit<TreemapNodeData, 'depth' | 'eol'> | null {
    const firstNonWs = line.length - line.trimStart().length
    const indent = line.slice(0, firstNonWs)
    const bodyEnd = /[ \t\r]+$/.exec(line)
    const trailing = bodyEnd !== null ? bodyEnd[0] : ''
    const content = line.slice(firstNonWs, line.length - trailing.length)
    const nameMatch = NAME_RE.exec(content)
    if (nameMatch === null) return null
    const quote = nameMatch[1] !== undefined ? '"' : "'"
    const name = nameMatch[1] ?? nameMatch[2] ?? ''
    let rest = content.slice(nameMatch[0].length)
    // class 段先摘出（`"A":::c` / `"A": 1:::c`；`:::` 不会出现在合法数值里）
    let classRaw: string | null = null
    let classLead = ''
    const classMatch = CLASS_RE.exec(rest)
    if (classMatch !== null) {
      classRaw = classMatch[1]
      rest = rest.slice(0, classMatch.index)
      const leadMatch = /[ \t]*$/.exec(rest)
      classLead = leadMatch !== null ? leadMatch[0] : ''
      rest = rest.slice(0, rest.length - classLead.length)
    }
    // 有值 = Leaf（`:` 或 `,` 分隔，两侧空白任意，research 坑 2）；无值 = Section
    const sepMatch = /^([ \t]*)(:|,)([ \t]*)([^\s]+)$/.exec(rest)
    if (sepMatch !== null) {
      return {
        kind: 'treemap-node',
        indent,
        quote,
        name,
        nameAfter: sepMatch[1],
        sep: sepMatch[2],
        sepAfter: sepMatch[3],
        value: sepMatch[4],
        classRaw,
        classLead,
        trailing,
      }
    }
    if (rest === '') {
      return {
        kind: 'treemap-node',
        indent,
        quote,
        name,
        nameAfter: '',
        sep: null,
        sepAfter: null,
        value: null,
        classRaw,
        classLead,
        trailing,
      }
    }
    return null // 名字后面跟着别的内容（非值非 class）：不识别，逐字保留
  }

  // ---------- 意图落地（resolveRewrites） ----------

  resolveRewrites(doc: SourceDocument, intent: EditIntent): ReadonlyMap<string, string> | null {
    switch (intent.type) {
      case 'set-node-name':
        return this.resolveSetNodeName(doc, intent as Extract<TreemapIntent, { type: 'set-node-name' }>)
      case 'set-node-value':
        return this.resolveSetNodeValue(doc, intent as Extract<TreemapIntent, { type: 'set-node-value' }>)
      case 'add-root':
        return this.resolveAddRoot(doc, intent as Extract<TreemapIntent, { type: 'add-root' }>)
      case 'add-child':
        return this.resolveAddChild(doc, intent as Extract<TreemapIntent, { type: 'add-child' }>)
      case 'add-sibling':
        return this.resolveAddSibling(doc, intent as Extract<TreemapIntent, { type: 'add-sibling' }>)
      case 'delete-node':
        return this.resolveDeleteNode(doc, intent as Extract<TreemapIntent, { type: 'delete-node' }>)
      default:
        return null
    }
  }

  private nodePart(doc: SourceDocument, elementId: string) {
    const part = getElementById(doc, elementId)
    if (part === undefined || part.element.kind !== 'treemap-node') return null
    return part
  }

  private nodeParts(doc: SourceDocument) {
    return doc.elements.filter((p) => p.element.kind === 'treemap-node')
  }

  private resolveSetNodeName(
    doc: SourceDocument,
    intent: Extract<TreemapIntent, { type: 'set-node-name' }>,
  ): Map<string, string> | null {
    const part = this.nodePart(doc, intent.elementId)
    if (part === null || !isValidTreemapName(intent.name)) return null
    return new Map([[part.id, renderTreemapNode(part.element as TreemapNodeData, { name: intent.name })]])
  }

  private resolveSetNodeValue(
    doc: SourceDocument,
    intent: Extract<TreemapIntent, { type: 'set-node-value' }>,
  ): Map<string, string> | null {
    const part = this.nodePart(doc, intent.elementId)
    if (part === null) return null
    const node = part.element as TreemapNodeData
    if (node.value === null) return null // Section 没有值（Leaf↔Section 转换不做，工单定案）
    if (!isValidTreemapValue(intent.value)) return null
    return new Map([[part.id, renderTreemapNode(node, { value: intent.value })]])
  }

  /** 顶层追加节点：锚点回退文档末元素（insertAfter 语义），顶格书写 */
  private resolveAddRoot(
    doc: SourceDocument,
    intent: Extract<TreemapIntent, { type: 'add-root' }>,
  ): Map<string, string> | null {
    if (!isValidTreemapName(intent.name)) return null
    if (intent.value !== undefined && !isValidTreemapValue(intent.value)) return null
    return insertAfter(doc, {
      render: (_indent, original) => {
        const line = renderNodeLine('', intent.name, intent.value)
        return (/[\n\r]$/.test(original) ? '' : '\n') + line
      },
    })
  }

  /** 目标父节点（须为 Section）的子节点缩进：跟随既有子节点，否则在父缩进上加一档 */
  private childIndentOf(doc: SourceDocument, parent: TreemapNodeData, parentIndex: number): string {
    const nodes = this.nodeParts(doc)
    for (let i = parentIndex + 1; i < nodes.length; i++) {
      const n = nodes[i].element as TreemapNodeData
      if (n.depth <= parent.depth) break
      if (n.depth === parent.depth + 1) return n.indent
    }
    return parent.indent + (parent.indent.includes('\t') ? '\t' : '    ')
  }

  private resolveAddChild(
    doc: SourceDocument,
    intent: Extract<TreemapIntent, { type: 'add-child' }>,
  ): Map<string, string> | null {
    if (!isValidTreemapName(intent.name)) return null
    if (intent.value !== undefined && !isValidTreemapValue(intent.value)) return null
    const part = this.nodePart(doc, intent.parentElementId)
    if (part === null) return null
    const parent = part.element as TreemapNodeData
    if (parent.value !== null) return null // 叶子下不挂子（research §3：有值即叶子）
    const range = this.subtreeRange(doc, doc.elements.indexOf(part))
    const anchorId = doc.elements[range.end].id
    const indent = this.childIndentOf(doc, parent, this.nodeParts(doc).indexOf(part))
    const line = renderNodeLine(indent, intent.name, intent.value)
    return insertAfter(doc, {
      afterElementId: anchorId,
      render: (_i, original) => (/[\n\r]$/.test(original) ? '' : '\n') + line,
    })
  }

  private resolveAddSibling(
    doc: SourceDocument,
    intent: Extract<TreemapIntent, { type: 'add-sibling' }>,
  ): Map<string, string> | null {
    if (!isValidTreemapName(intent.name)) return null
    if (intent.value !== undefined && !isValidTreemapValue(intent.value)) return null
    const part = this.nodePart(doc, intent.elementId)
    if (part === null) return null
    const node = part.element as TreemapNodeData
    const range = this.subtreeRange(doc, doc.elements.indexOf(part))
    const anchorId = doc.elements[range.end].id
    const line = renderNodeLine(node.indent, intent.name, intent.value)
    return insertAfter(doc, {
      afterElementId: anchorId,
      render: (_i, original) => (/[\n\r]$/.test(original) ? '' : '\n') + line,
    })
  }

  private resolveDeleteNode(
    doc: SourceDocument,
    intent: Extract<TreemapIntent, { type: 'delete-node' }>,
  ): Map<string, string> | null {
    const part = this.nodePart(doc, intent.elementId)
    if (part === null) return null
    const range = this.subtreeRange(doc, doc.elements.indexOf(part))
    const rewrites = new Map<string, string>()
    for (let i = range.start; i <= range.end; i++) rewrites.set(doc.elements[i].id, '')
    return rewrites
  }

  /** 节点子树（含自身）覆盖的 element 区间 [startIndex, endIndex]（与 mindmap 同构） */
  private subtreeRange(doc: SourceDocument, startIndex: number): { start: number; end: number } {
    const depth = (doc.elements[startIndex].element as TreemapNodeData).depth
    let end = startIndex
    for (let i = startIndex + 1; i < doc.elements.length; i++) {
      const e = doc.elements[i].element
      if (e.kind !== 'treemap-node') break
      if ((e as TreemapNodeData).depth > depth) {
        end = i
        continue
      }
      break
    }
    return { start: startIndex, end }
  }
}

/** 按字段渲染一行节点文本（新建用；自带行尾换行——锚点 span 含 eol，追加行必须换行） */
function renderNodeLine(indent: string, name: string, value: string | undefined): string {
  const data: TreemapNodeData = {
    kind: 'treemap-node',
    indent,
    quote: '"',
    name,
    nameAfter: '',
    sep: value !== undefined ? ':' : null,
    sepAfter: value !== undefined ? ' ' : null,
    value: value ?? null,
    classRaw: null,
    classLead: '',
    trailing: '',
    eol: '\n',
    depth: 0,
  }
  return renderTreemapNode(data)
}

export const treemapParser = new TreemapParser()
