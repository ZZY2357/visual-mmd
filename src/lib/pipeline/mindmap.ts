import { assembleDocument, getElementById, type SourceDocument } from './document'
import type { DiagramParser, EditIntent, ParseResult, SourceParseError } from './parser'
import { frontmatterEnd } from './frontmatter'
import type { Span } from './span'

/**
 * mindmap 完整解析器（工单 08，语法范围以 ADR-0005 清单为准）：
 * 手写、逐行、带 span（ADR-0004）。可测试承诺：解析后不做修改再重组装，
 * 输出与输入逐字相同（verbatim identity）。
 *
 * 覆盖（ADR-0005，mermaid v12 实际支持的形状清单）：
 * - 层级节点：纯缩进定层级（mermaid 规则：相对缩进，取最近的更浅节点为父）
 * - 全部节点形状：方形 []、圆角 ()、圆 (())、爆炸 ))(、云 )(( 、六边形 {{}}、
 *   以及无形状的默认文本节点
 * - ::icon() 图标行（紧跟节点行，归属其上一个节点）
 *
 * mindmap 无方向/样式配置，无不解析项（ADR-0005）；无法识别的行（注释、空行、
 * 生僻语法）仍按 ADR-0008 逐字保留。
 *
 * span 约定：节点与图标行的 span 从行首（含缩进，缩进在 mindmap 中是语法的一部分）
 * 到下一行行首（含行尾换行）；header 的 span 为该行本身（不含换行）。
 * 因此删除节点会连同其缩进与换行一并干净移除，不留残行。
 */

interface ParseFailure extends Error {
  line: number
}

function parseFailure(line: number, message: string): ParseFailure {
  const error = new Error(message) as ParseFailure
  error.line = line
  return error
}

// ---------- 节点形状 ----------

export type MindmapShapeType = 'square' | 'rounded' | 'circle' | 'bang' | 'cloud' | 'hexagon'

/** mermaid v12 mindmap 全部节点形状（ADR-0005） */
export const MINDMAP_SHAPES: Record<MindmapShapeType, { open: string; close: string }> = {
  square: { open: '[', close: ']' },
  rounded: { open: '(', close: ')' },
  circle: { open: '((', close: '))' },
  bang: { open: '))', close: '((' },
  cloud: { open: ')', close: '(' },
  hexagon: { open: '{{', close: '}}' },
}

/** 形状识别表：长 opener / 易混淆的在前（圆在圆角前、爆炸在云前） */
const SHAPE_PATTERNS: Array<{ type: MindmapShapeType; re: RegExp }> = [
  { type: 'circle', re: /^\(\((.*)\)\)$/ },
  { type: 'bang', re: /^\)\)(.*)\(\($/ },
  { type: 'hexagon', re: /^\{\{(.*)\}\}$/ },
  { type: 'square', re: /^\[(.*)\]$/ },
  { type: 'rounded', re: /^\((.*)\)$/ },
  { type: 'cloud', re: /^\)(.*)\($/ },
]

function parseShape(body: string): { text: string; shapeType: MindmapShapeType; openRaw: string; closeRaw: string } | null {
  for (const { type, re } of SHAPE_PATTERNS) {
    const m = re.exec(body)
    if (m !== null) {
      const spec = MINDMAP_SHAPES[type]
      return { text: m[1], shapeType: type, openRaw: spec.open, closeRaw: spec.close }
    }
  }
  return null
}

/** 节点行内容解析结果：可选 id（不显示，类似 flowchart）+ 形状文本 */
interface ParsedNodeBody {
  id: string | null
  gapAfterId: string
  text: string
  shapeType: MindmapShapeType | null
  openRaw: string
  closeRaw: string
}

function parseNodeBody(body: string): ParsedNodeBody {
  // 1. 整体即形状（无 id）
  const direct = parseShape(body)
  if (direct !== null) return { id: null, gapAfterId: '', ...direct }
  // 2. id + 形状（如 root((mindmap))、id2(rounded square)；id 不显示）
  const m = /^([^\s()[\]{}]+)([ \t]*)(.+)$/.exec(body)
  if (m !== null) {
    const shape = parseShape(m[3])
    if (shape !== null) return { id: m[1], gapAfterId: m[2], ...shape }
  }
  // 3. 默认无形状：整行即文本
  return { id: null, gapAfterId: '', text: body, shapeType: null, openRaw: '', closeRaw: '' }
}

export interface MindmapHeaderData {
  kind: 'mindmap-header'
  keyword: string
  trailing: string
}

export interface MindmapNodeData {
  kind: 'mindmap-node'
  /** 行首缩进原文（mindmap 中缩进即层级语法，属元素 span 的一部分） */
  indent: string
  /** 节点 id（不显示）；无 id 时 null */
  id: string | null
  gapAfterId: string
  text: string
  /** null = 默认无形状 */
  shapeType: MindmapShapeType | null
  openRaw: string
  closeRaw: string
  /** 换行前残留空白 */
  trailing: string
  /** 行尾换行符（文档最后一行可能为空串） */
  eol: string
  /** 0 起始的层级深度（首个节点为根，depth 0） */
  depth: number
}

export interface MindmapIconData {
  kind: 'mindmap-icon'
  icon: string
  indent: string
  trailing: string
  eol: string
  /** 归属节点的深度（图标行不参与层级计算，跟随其节点） */
  depth: number
}

type MindmapElementData = MindmapHeaderData | MindmapNodeData | MindmapIconData

export function renderMindmapNode(
  d: MindmapNodeData,
  changes: { text?: string; shape?: MindmapShapeType | null } = {},
): string {
  const text = changes.text !== undefined ? changes.text : d.text
  const shape = changes.shape !== undefined ? changes.shape : d.shapeType
  const spec = shape !== null ? MINDMAP_SHAPES[shape] : null
  const body = spec !== null ? spec.open + text + spec.close : text
  const idPart = d.id !== null ? d.id + d.gapAfterId : ''
  return d.indent + idPart + body + d.trailing + d.eol
}

export function renderMindmapIcon(d: MindmapIconData, changes: { icon?: string } = {}): string {
  const icon = changes.icon !== undefined ? changes.icon : d.icon
  return d.indent + '::icon(' + icon + ')' + d.trailing + d.eol
}

// ---------- 编辑意图（工单 08 树形界面所需的最小完备集合） ----------

export type MindmapIntent =
  /** 改节点显示文本（elementId = `mindmap-node:N`） */
  | { type: 'set-node-text'; elementId: string; text: string }
  /** 换节点形状；null = 默认无形状 */
  | { type: 'set-node-shape'; elementId: string; shape: MindmapShapeType | null }
  /** 设置节点图标；null/空串 = 移除图标行 */
  | { type: 'set-node-icon'; elementId: string; icon: string | null }
  /** 添加子节点；parentElementId 缺省时取根节点（无任何节点时在 header 后创建根） */
  | {
      type: 'add-child'
      parentElementId?: string
      text: string
      shape?: MindmapShapeType | null
      icon?: string | null
    }
  /** 添加同级节点（落在目标节点整棵子树之后） */
  | { type: 'add-sibling'; elementId: string; text: string; shape?: MindmapShapeType | null; icon?: string | null }
  /** 删除节点：连同其图标行与全部后代（子树）一起删除 */
  | { type: 'delete-node'; elementId: string }

/** 节点文本合法性校验（表单层复用）：mindmap 节点不能为空 */
export function isValidMindmapNodeText(text: string): boolean {
  return text.trim() !== ''
}

// ---------- 解析 ----------

const HEADER_RE = /^([ \t]*)(mindmap)([ \t\r]*)$/
const ICON_RE = /^::icon\((.*)\)$/

function indentWidth(indent: string): number {
  let w = 0
  for (const ch of indent) w += ch === '\t' ? 4 : 1
  return w
}

export class MindmapParser implements DiagramParser {
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
    const entries: Array<{ span: Span; id: string; data: MindmapElementData }> = []
    const depths: number[] = [] // 已打开层级的缩进宽度栈
    let nodeCount = 0
    let iconCount = 0
    let seenHeader = false
    // 文首 frontmatter 块（主题等配置）不参与解析，整体 verbatim 保留（工单 11）
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
            // header 的 span 同样含行尾换行，保持与节点一致的插入锚点语义
            span: { start: cursor, end: cursor + line.length + eol.length },
            id: entries.some((e) => e.id === 'mindmap') ? `mindmap#${entries.length}` : 'mindmap',
            data: {
              kind: 'mindmap-header',
              keyword: headerMatch[2],
              trailing: (headerMatch[3] ?? '').replace(/\r$/, ''),
            },
          })
        } else if (trimmed.startsWith('%%')) {
          // 注释行：逐字保留，不参与层级
        } else if (seenHeader) {
          // 图标行：归属上一个元素（必须是节点行）
          const firstNonWs = line.length - line.trimStart().length
          const content = line.slice(firstNonWs).replace(/[ \t\r]+$/, (t) => (eol === '' ? t : ''))
          const indent = line.slice(0, firstNonWs)
          const iconMatch = ICON_RE.exec(content.trimEnd())
          if (iconMatch !== null) {
            const prev = entries[entries.length - 1]
            const ownerDepth = prev !== undefined && prev.data.kind === 'mindmap-node'
              ? (prev.data as MindmapNodeData).depth
              : 0
            iconCount++
            entries.push({
              span: { start: cursor, end: cursor + line.length + eol.length },
              id: `mindmap-icon:${iconCount}`,
              data: {
                kind: 'mindmap-icon',
                icon: iconMatch[1],
                indent,
                trailing: content.slice(content.trimEnd().length),
                eol,
                depth: ownerDepth,
              },
            })
          } else {
            // 节点行：整体内容（去掉尾部空白）做形状匹配
            const bodyEnd = /[ \t\r]+$/.exec(line)
            const trailing = bodyEnd !== null ? bodyEnd[0] : ''
            const body = line.slice(firstNonWs, line.length - trailing.length)
            if (body !== '') {
              const shape = parseNodeBody(body)
              while (depths.length > 0 && depths[depths.length - 1] >= indentWidth(indent)) depths.pop()
              const depth = depths.length
              depths.push(indentWidth(indent))
              nodeCount++
              entries.push({
                span: { start: cursor, end: cursor + line.length + eol.length },
                id: `mindmap-node:${nodeCount}`,
                data: {
                  kind: 'mindmap-node',
                  indent,
                  id: shape.id,
                  gapAfterId: shape.gapAfterId,
                  text: shape.text,
                  shapeType: shape.shapeType,
                  openRaw: shape.openRaw,
                  closeRaw: shape.closeRaw,
                  trailing,
                  eol,
                  depth,
                },
              })
            }
            // body 为空（纯空白行）：上层已过滤，不会到达
          }
        }
        // header 之前的节点/图标行、以及一切无法识别的行：不解析，逐字保留
      }

      if (nl === -1) break
      cursor = nl + 1
    }

    if (!seenHeader) {
      throw parseFailure(1, '图表必须以 mindmap 声明开始')
    }
    return assembleDocument(source, entries)
  }

  // ---------- 意图落地（resolveRewrites） ----------

  resolveRewrites(doc: SourceDocument, intent: EditIntent): ReadonlyMap<string, string> | null {
    switch (intent.type) {
      case 'set-node-text':
        return this.resolveSetNodeText(doc, intent as Extract<MindmapIntent, { type: 'set-node-text' }>)
      case 'set-node-shape':
        return this.resolveSetNodeShape(doc, intent as Extract<MindmapIntent, { type: 'set-node-shape' }>)
      case 'set-node-icon':
        return this.resolveSetNodeIcon(doc, intent as Extract<MindmapIntent, { type: 'set-node-icon' }>)
      case 'add-child':
        return this.resolveAddChild(doc, intent as Extract<MindmapIntent, { type: 'add-child' }>)
      case 'add-sibling':
        return this.resolveAddSibling(doc, intent as Extract<MindmapIntent, { type: 'add-sibling' }>)
      case 'delete-node':
        return this.resolveDeleteNode(doc, intent as Extract<MindmapIntent, { type: 'delete-node' }>)
      default:
        return null
    }
  }

  private nodeParts(doc: SourceDocument) {
    return doc.elements.filter((p) => p.element.kind === 'mindmap-node')
  }

  private nodePart(doc: SourceDocument, elementId: string) {
    const part = getElementById(doc, elementId)
    if (part === undefined || part.element.kind !== 'mindmap-node') return null
    return part
  }

  /** 图标行是否紧跟该节点（紧跟才归属该节点，mermaid 语义） */
  private iconOf(doc: SourceDocument, nodeIndex: number) {
    const next = doc.elements[nodeIndex + 1]
    return next !== undefined && next.element.kind === 'mindmap-icon' ? next : null
  }

  /** 节点子树（含自身）覆盖的 element 区间 [startIndex, endIndex]（含图标行） */
  private subtreeRange(doc: SourceDocument, startIndex: number): { start: number; end: number } {
    const depth = (doc.elements[startIndex].element as MindmapNodeData).depth
    let end = startIndex
    for (let i = startIndex + 1; i < doc.elements.length; i++) {
      const e = doc.elements[i].element
      if (e.kind === 'mindmap-node') {
        if ((e as MindmapNodeData).depth > depth) {
          end = i
          continue
        }
        break
      }
      if (e.kind === 'mindmap-icon' && end === i - 1) {
        end = i
        continue
      }
      break
    }
    return { start: startIndex, end }
  }

  /** 在锚点元素（其 span 含行尾换行）之后插入若干行 */
  private insertAfterElement(
    doc: SourceDocument,
    anchorId: string | undefined,
    lines: string[],
  ): Map<string, string> | null {
    const anchor =
      (anchorId !== undefined ? getElementById(doc, anchorId) : undefined) ??
      doc.elements[doc.elements.length - 1]
    if (anchor === undefined) return null
    const original = doc.source.slice(anchor.span.start, anchor.span.end)
    const anchorEol = /[\n\r]$/.test(original) ? '' : '\n'
    // 行内容自带行尾换行；锚点缺行尾换行时补一个
    const inserted = anchorEol + lines.join('')
    return new Map([[anchor.id, original + inserted]])
  }

  private resolveSetNodeText(
    doc: SourceDocument,
    intent: Extract<MindmapIntent, { type: 'set-node-text' }>,
  ): Map<string, string> | null {
    const part = this.nodePart(doc, intent.elementId)
    if (part === null || !isValidMindmapNodeText(intent.text)) return null
    return new Map([[part.id, renderMindmapNode(part.element as MindmapNodeData, { text: intent.text })]])
  }

  private resolveSetNodeShape(
    doc: SourceDocument,
    intent: Extract<MindmapIntent, { type: 'set-node-shape' }>,
  ): Map<string, string> | null {
    const part = this.nodePart(doc, intent.elementId)
    if (part === null) return null
    return new Map([[part.id, renderMindmapNode(part.element as MindmapNodeData, { shape: intent.shape })]])
  }

  private resolveSetNodeIcon(
    doc: SourceDocument,
    intent: Extract<MindmapIntent, { type: 'set-node-icon' }>,
  ): Map<string, string> | null {
    const part = this.nodePart(doc, intent.elementId)
    if (part === null) return null
    const nodeIndex = doc.elements.indexOf(part)
    const icon = intent.icon === null ? '' : intent.icon.trim()
    const existing = this.iconOf(doc, nodeIndex)
    if (icon === '') {
      if (existing === null) return new Map()
      return new Map([[existing.id, '']])
    }
    if (existing !== null) {
      return new Map([[existing.id, renderMindmapIcon(existing.element as MindmapIconData, { icon })]])
    }
    const node = part.element as MindmapNodeData
    const iconPart = node.indent + '::icon(' + icon + ')' + node.trailing + '\n'
    const original = doc.source.slice(part.span.start, part.span.end)
    const anchorEol = /[\n\r]$/.test(original) ? '' : '\n'
    return new Map([[part.id, original + anchorEol + iconPart]])
  }

  /** 目标父节点的子节点缩进：跟随既有子节点，否则在父缩进上加一档 */
  private childIndentOf(doc: SourceDocument, parent: MindmapNodeData, parentIndex: number): string {
    for (let i = parentIndex + 1; i < doc.elements.length; i++) {
      const e = doc.elements[i].element
      if (e.kind === 'mindmap-node') {
        return (e as MindmapNodeData).depth === parent.depth + 1
          ? (e as MindmapNodeData).indent
          : parent.indent + (parent.indent.includes('\t') ? '\t' : '  ')
      }
      if (e.kind === 'mindmap-icon') continue
      break
    }
    return parent.indent + (parent.indent.includes('\t') ? '\t' : '  ')
  }

  private resolveAddChild(
    doc: SourceDocument,
    intent: Extract<MindmapIntent, { type: 'add-child' }>,
  ): Map<string, string> | null {
    if (!isValidMindmapNodeText(intent.text)) return null
    const nodes = this.nodeParts(doc)

    let parent: MindmapNodeData | null = null
    let parentIndex = -1
    let anchorId: string | undefined
    let indent: string

    if (intent.parentElementId !== undefined) {
      const part = this.nodePart(doc, intent.parentElementId)
      if (part === null) return null
      parentIndex = doc.elements.indexOf(part)
      parent = part.element as MindmapNodeData
      const range = this.subtreeRange(doc, parentIndex)
      anchorId = doc.elements[range.end].id
      indent = this.childIndentOf(doc, parent, parentIndex)
    } else if (nodes.length > 0) {
      // 缺省挂在根节点下
      parentIndex = doc.elements.indexOf(nodes[0])
      parent = nodes[0].element as MindmapNodeData
      const range = this.subtreeRange(doc, parentIndex)
      anchorId = doc.elements[range.end].id
      indent = this.childIndentOf(doc, parent, parentIndex)
    } else {
      // 空文档：在 header 之后创建根节点（根缩进 = header 缩进 + 一档）
      const header = doc.elements.find((p) => p.element.kind === 'mindmap-header')
      if (header === undefined) return null
      anchorId = header.id
      const headerIndent = /^[ \t]*/.exec(doc.source.slice(header.span.start))?.[0] ?? ''
      indent = headerIndent + '  '
    }

    const nodeData: MindmapNodeData = {
      kind: 'mindmap-node',
      indent,
      id: null,
      gapAfterId: '',
      text: intent.text,
      shapeType: intent.shape ?? null,
      openRaw: intent.shape != null ? MINDMAP_SHAPES[intent.shape].open : '',
      closeRaw: intent.shape != null ? MINDMAP_SHAPES[intent.shape].close : '',
      trailing: '',
      eol: '\n',
      depth: (parent?.depth ?? -1) + 1,
    }
    const lines = [renderMindmapNode(nodeData)]
    if (intent.icon != null && intent.icon.trim() !== '') {
      lines.push(renderMindmapIcon({ kind: 'mindmap-icon', icon: intent.icon.trim(), indent, trailing: '', eol: '\n', depth: nodeData.depth }))
    }
    return this.insertAfterElement(doc, anchorId, lines)
  }

  private resolveAddSibling(
    doc: SourceDocument,
    intent: Extract<MindmapIntent, { type: 'add-sibling' }>,
  ): Map<string, string> | null {
    if (!isValidMindmapNodeText(intent.text)) return null
    const part = this.nodePart(doc, intent.elementId)
    if (part === null) return null
    const node = part.element as MindmapNodeData
    const nodeIndex = doc.elements.indexOf(part)
    const range = this.subtreeRange(doc, nodeIndex)
    const anchorId = doc.elements[range.end].id
    const nodeData: MindmapNodeData = {
      kind: 'mindmap-node',
      indent: node.indent,
      id: null,
      gapAfterId: '',
      text: intent.text,
      shapeType: intent.shape ?? null,
      openRaw: intent.shape != null ? MINDMAP_SHAPES[intent.shape].open : '',
      closeRaw: intent.shape != null ? MINDMAP_SHAPES[intent.shape].close : '',
      trailing: '',
      eol: '\n',
      depth: node.depth,
    }
    const lines = [renderMindmapNode(nodeData)]
    if (intent.icon != null && intent.icon.trim() !== '') {
      lines.push(renderMindmapIcon({ kind: 'mindmap-icon', icon: intent.icon.trim(), indent: node.indent, trailing: '', eol: '\n', depth: node.depth }))
    }
    return this.insertAfterElement(doc, anchorId, lines)
  }

  private resolveDeleteNode(
    doc: SourceDocument,
    intent: Extract<MindmapIntent, { type: 'delete-node' }>,
  ): Map<string, string> | null {
    const part = this.nodePart(doc, intent.elementId)
    if (part === null) return null
    const nodeIndex = doc.elements.indexOf(part)
    const range = this.subtreeRange(doc, nodeIndex)
    const rewrites = new Map<string, string>()
    for (let i = range.start; i <= range.end; i++) rewrites.set(doc.elements[i].id, '')
    return rewrites
  }
}

export const mindmapParser = new MindmapParser()
