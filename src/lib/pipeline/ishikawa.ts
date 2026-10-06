import { assembleDocument, getElementById, type SourceDocument } from './document'
import type { DiagramParser, EditIntent, ParseResult, SourceParseError } from './parser'
import { frontmatterEnd } from './frontmatter'
import type { Span } from './span'
import { insertAfter } from './insert'

/**
 * ishikawa 完整解析器（more-diagrams 工单 22，语法事实以
 * .scratch/more-diagrams/research/ishikawa.md 为准——**不是** frontmatter/YAML 数据块，
 * 而是**缩进行式**）：手写、逐行、带 span（ADR-0004）。可测试承诺：解析后不做修改
 * 再重组装，输出与输入逐字相同（verbatim identity）。
 *
 * 覆盖（research §2 核心）：
 * - 声明行：`ishikawa` / `ishikawa-beta`（词法 `^ishikawa(-beta)?\b`，**大小写不敏感**；
 *   声明行必须是裸关键字）
 * - 第一行正文 = 鱼头（问题/事件），是本图的根节点，兼作图标题（research 坑 4）
 * - 后续行 = 因果节点，层级由**相对缩进**决定（research 坑 1/6.1）：
 *   `level = rawLevel - baseLevel + 1`，`baseLevel` = 第一条主因的缩进宽度；`<= 0` 归 1；
 *   缩进宽度 = 字符数（tab 算 1，research 坑 2）；鱼头自身缩进不参与计算
 *
 * 不解析、原样保留（清单外语法不报错，ADR-0008）：frontmatter、行首 `%%` 注释、
 * 空行（SPACELINE）、以及一切识别不了的形态。**行内 `%%` 不是注释**（成为文本，
 * research 坑 3）；`title` / `classDef` / `style` / `:::class` 语本图种**不存在**
 * （research 坑 6），故这些行按普通文本/识别不了的行处理，逐字保留。
 *
 * span 约定（与 mindmap 同口径）：节点行的 span 含行首缩进（缩进即层级语法，
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

export interface IshikawaHeaderData {
  kind: 'ishikawa-header'
  /** 原文关键字（`ishikawa` / `ishikawa-beta`，保留用户书写） */
  keyword: string
  trailing: string
}

export interface IshikawaNodeData {
  kind: 'ishikawa-node'
  /** 行首缩进原文（ishikawa 中缩进即层级语法，属元素 span 的一部分） */
  indent: string
  /** 缩进宽度（字符数，tab 算 1；research 坑 2） */
  rawLevel: number
  /** 行内文本（= 去掉缩进的整行 `trim()`；行内 `%%` 属文本，research 坑 3） */
  text: string
  /** 换行前残留空白 */
  trailing: string
  /** 行尾换行符（文档最后一行可能为空串） */
  eol: string
  /** 0 起始层级：鱼头为 0（root），第一条主因为 1、其子为 2……（research 坑 1/6.1） */
  depth: number
  /** true = 鱼头（问题/事件），每图唯一 */
  isRoot: boolean
}

export type IshikawaElementData = IshikawaHeaderData | IshikawaNodeData

/** 渲染节点行：文本编辑后的整行（含缩进、残留空白与 eol 原样搬运） */
export function renderIshikawaNode(d: IshikawaNodeData, changes: { text?: string } = {}): string {
  const text = changes.text !== undefined ? changes.text : d.text
  return d.indent + text + d.trailing + d.eol
}

// ---------- 编辑意图（工单 22 表单/结构树/菜单所需集合） ----------

export type IshikawaIntent =
  /** 改节点文本（鱼头亦可用：改第一行即改图标题，research 坑 4） */
  | { type: 'set-node-text'; elementId: string; text: string }
  /** 添加子节点（默认主因/分支；落在目标节点整棵子树之后，缩进深一档） */
  | { type: 'add-child'; parentElementId: string; text: string }
  /** 添加同级节点（落在目标节点整棵子树之后，同缩进） */
  | { type: 'add-sibling'; elementId: string; text: string }
  /** 删除节点：连同其全部后代（子树）一起删除 */
  | { type: 'delete-node'; elementId: string }

/**
 * 节点文本校验（表单层复用）：非空、单行、不含换行（文本即整行其余内容，
 * 换行会把一行拆成两行改变层级语义）。
 */
export function isValidIshikawaText(text: string): boolean {
  return text.trim() !== '' && !/[\r\n]/.test(text)
}

// ---------- 行级解析 ----------

/** 声明行：`ishikawa` / `ishikawa-beta`（词法带 `/i`，research §1） */
const HEADER_RE = /^([ \t]*)(ishikawa(?:-beta)?)([ \t\r]*)$/i

/** 缩进宽度：字符数，tab 算 1（research 坑 2，词法 `SPACELIST = /[\s]+/` 的匹配长度） */
function indentWidth(indent: string): number {
  return indent.length
}

interface RawEntry {
  span: Span
  id: string
  data: IshikawaElementData
}

export class IshikawaParser implements DiagramParser {
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
    let rootSeen = false
    /** 已打开层级的 level 栈（level = rawLevel - baseLevel + 1，>= 1） */
    const levels: number[] = []
    // baseLevel = 第一条主因（root 之后的第一个节点行）的缩进宽度；首因未出现前为 null
    let baseLevel: number | null = null
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
              kind: 'ishikawa-header',
              keyword: headerMatch[2],
              trailing: (headerMatch[3] ?? '').replace(/\r$/, ''),
            },
          })
        } else if (trimmed.startsWith('%%')) {
          // 行首注释（可带缩进空白，research §2 边角）：逐字保留，不参与层级
        } else if (seenHeader) {
          // 正文行：整行=鱼头/因果节点（行内 `%%` 属文本，research 坑 3）
          const firstNonWs = line.length - line.trimStart().length
          const indent = line.slice(0, firstNonWs)
          const bodyEnd = /[ \t\r]+$/.exec(line)
          const trailing = eol === '' && bodyEnd !== null ? bodyEnd[0] : ''
          const text = line.slice(firstNonWs, line.length - trailing.length)
          if (text !== '') {
            const rawLevel = indentWidth(indent)
            let depth: number
            if (!rootSeen) {
              // 第一行 = 鱼头（root，depth 0）；其缩进不参与层级计算（research 坑 1）
              rootSeen = true
              depth = 0
            } else {
              if (baseLevel === null) baseLevel = rawLevel // 第一条主因定基准
              const level = Math.max(1, rawLevel - baseLevel + 1)
              while (levels.length > 0 && levels[levels.length - 1] >= level) levels.pop()
              depth = level
              levels.push(level)
            }
            nodeCount++
            entries.push({
              span: { start: cursor, end: cursor + line.length + eol.length },
              id: `ishikawa-node:${nodeCount}`,
              data: {
                kind: 'ishikawa-node',
                indent,
                rawLevel,
                text,
                trailing,
                eol,
                depth,
                isRoot: depth === 0,
              },
            })
          }
        }
        // header 之前的非注释行：不解析，逐字保留
      }

      if (nl === -1) break
      cursor = nl + 1
    }

    if (!seenHeader) {
      throw parseFailure(1, '图表必须以 ishikawa 声明开始')
    }
    return assembleDocument(source, entries)
  }

  // ---------- 意图落地（resolveRewrites） ----------

  resolveRewrites(doc: SourceDocument, intent: EditIntent): ReadonlyMap<string, string> | null {
    switch (intent.type) {
      case 'set-node-text':
        return this.resolveSetNodeText(doc, intent as Extract<IshikawaIntent, { type: 'set-node-text' }>)
      case 'add-child':
        return this.resolveAddChild(doc, intent as Extract<IshikawaIntent, { type: 'add-child' }>)
      case 'add-sibling':
        return this.resolveAddSibling(doc, intent as Extract<IshikawaIntent, { type: 'add-sibling' }>)
      case 'delete-node':
        return this.resolveDeleteNode(doc, intent as Extract<IshikawaIntent, { type: 'delete-node' }>)
      default:
        return null
    }
  }

  private nodePart(doc: SourceDocument, elementId: string) {
    const part = getElementById(doc, elementId)
    if (part === undefined || part.element.kind !== 'ishikawa-node') return null
    return part
  }

  private resolveSetNodeText(
    doc: SourceDocument,
    intent: Extract<IshikawaIntent, { type: 'set-node-text' }>,
  ): Map<string, string> | null {
    const part = this.nodePart(doc, intent.elementId)
    if (part === null || !isValidIshikawaText(intent.text)) return null
    return new Map([[part.id, renderIshikawaNode(part.element as IshikawaNodeData, { text: intent.text.trim() })]])
  }

  /** 节点子树（含自身）覆盖的 element 区间 [startIndex, endIndex]（与 mindmap/treemap 同构） */
  private subtreeRange(doc: SourceDocument, startIndex: number): { start: number; end: number } {
    const depth = (doc.elements[startIndex].element as IshikawaNodeData).depth
    let end = startIndex
    for (let i = startIndex + 1; i < doc.elements.length; i++) {
      const e = doc.elements[i].element
      if (e.kind !== 'ishikawa-node') break
      if ((e as IshikawaNodeData).depth > depth) {
        end = i
        continue
      }
      break
    }
    return { start: startIndex, end }
  }

  /**
   * 子节点缩进：跟随既有子节点（其 depth = 父 + 1）；否则在父行缩进上加一档。
   * 加一档的口径：父缩进里若含 tab 就用 tab，否则加 4 空格（mermaid 文档示例用 4 空格，
   * research §7 模板亦然；层级是**相对**的，绝对宽度不影响语义，只影响观感）。
   */
  private childIndentOf(doc: SourceDocument, parent: IshikawaNodeData, parentIndex: number): string {
    for (let i = parentIndex + 1; i < doc.elements.length; i++) {
      const e = doc.elements[i].element
      if (e.kind !== 'ishikawa-node') break
      const n = e as IshikawaNodeData
      if (n.depth <= parent.depth) break
      if (n.depth === parent.depth + 1) return n.indent
    }
    if (parent.indent.includes('\t')) return parent.indent + '\t'
    return parent.indent + '    '
  }

  private resolveAddChild(
    doc: SourceDocument,
    intent: Extract<IshikawaIntent, { type: 'add-child' }>,
  ): Map<string, string> | null {
    if (!isValidIshikawaText(intent.text)) return null
    const part = this.nodePart(doc, intent.parentElementId)
    if (part === null) return null
    const parent = part.element as IshikawaNodeData
    const parentIndex = doc.elements.indexOf(part)
    const range = this.subtreeRange(doc, parentIndex)
    const anchorId = doc.elements[range.end].id
    const indent = this.childIndentOf(doc, parent, parentIndex)
    const line = indent + intent.text.trim() + '\n'
    return insertAfter(doc, {
      afterElementId: anchorId,
      render: (_i, original) => (/[\n\r]$/.test(original) ? '' : '\n') + line,
    })
  }

  private resolveAddSibling(
    doc: SourceDocument,
    intent: Extract<IshikawaIntent, { type: 'add-sibling' }>,
  ): Map<string, string> | null {
    if (!isValidIshikawaText(intent.text)) return null
    const part = this.nodePart(doc, intent.elementId)
    if (part === null) return null
    const node = part.element as IshikawaNodeData
    const nodeIndex = doc.elements.indexOf(part)
    const range = this.subtreeRange(doc, nodeIndex)
    const anchorId = doc.elements[range.end].id
    const line = node.indent + intent.text.trim() + '\n'
    return insertAfter(doc, {
      afterElementId: anchorId,
      render: (_i, original) => (/[\n\r]$/.test(original) ? '' : '\n') + line,
    })
  }

  private resolveDeleteNode(
    doc: SourceDocument,
    intent: Extract<IshikawaIntent, { type: 'delete-node' }>,
  ): Map<string, string> | null {
    const part = this.nodePart(doc, intent.elementId)
    if (part === null) return null
    // 鱼头（root）不可删除：删掉会让整图失去问题本身（结构语义底线，工单定案）
    if ((part.element as IshikawaNodeData).isRoot) return null
    const range = this.subtreeRange(doc, doc.elements.indexOf(part))
    const rewrites = new Map<string, string>()
    for (let i = range.start; i <= range.end; i++) rewrites.set(doc.elements[i].id, '')
    return rewrites
  }
}

export const ishikawaParser = new IshikawaParser()
