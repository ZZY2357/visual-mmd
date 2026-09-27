import type { Span } from './span'

/**
 * 源码文档（解析产物）：把源码切成有序的 parts，完整覆盖 [0, source.length)。
 * - element part：解析出的元素，记录 span 与结构化数据
 * - verbatim part：不属于任何元素的文本（注释、空行、无法解析的语法），编辑时逐字保留（ADR-0008）
 *
 * 可测试承诺（verbatim identity）：解析后不做修改再重组装，输出与输入逐字相同。
 */

/** 元素的结构化数据：kind 判别 + 任意字段；具体形状由各图表解析器定义 */
export type AnyElement = { readonly kind: string } & object

export interface VerbatimPart {
  kind: 'verbatim'
  span: Span
}

export interface ElementPart {
  kind: 'element'
  span: Span
  /** 文档内唯一 id，编辑意图通过它寻址 */
  id: string
  element: AnyElement
}

export type Part = VerbatimPart | ElementPart

export interface SourceDocument {
  source: string
  parts: Part[]
  /** 仅 element parts，按文档顺序 */
  elements: ElementPart[]
}

export function getElementById(doc: SourceDocument, id: string): ElementPart | undefined {
  return doc.elements.find((part) => part.id === id)
}

/**
 * 从有序的元素区间组装文档：元素之间的缝隙自动成为 verbatim part。
 * 元素区间重叠视为解析器内部错误（不变量被破坏）。
 */
export function assembleDocument(
  source: string,
  elements: ReadonlyArray<{ span: Span; id: string; data: AnyElement }>,
): SourceDocument {
  const sorted = [...elements].sort((a, b) => a.span.start - b.span.start)
  const parts: Part[] = []
  let cursor = 0
  for (const entry of sorted) {
    if (entry.span.start < cursor || entry.span.end < entry.span.start) {
      throw new Error(`解析器内部错误：元素区间非法或重叠（${entry.id}）`)
    }
    if (entry.span.end > source.length) {
      throw new Error(`解析器内部错误：元素区间越界（${entry.id}）`)
    }
    if (entry.span.start > cursor) {
      parts.push({ kind: 'verbatim', span: { start: cursor, end: entry.span.start } })
    }
    parts.push({ kind: 'element', span: entry.span, id: entry.id, element: entry.data })
    cursor = entry.span.end
  }
  if (cursor < source.length) {
    parts.push({ kind: 'verbatim', span: { start: cursor, end: source.length } })
  }
  return {
    source,
    parts,
    elements: parts.filter((part): part is ElementPart => part.kind === 'element'),
  }
}

/**
 * 重组装：element part 若在 rewrites 中则以新文本替换其 span，否则原样切片；
 * verbatim part 永远逐字切片。这是"手术式改写"的执行核心。
 */
export function reassemble(
  doc: SourceDocument,
  rewrites: ReadonlyMap<string, string> = new Map(),
): string {
  const out: string[] = []
  for (const part of doc.parts) {
    if (part.kind === 'verbatim') {
      out.push(doc.source.slice(part.span.start, part.span.end))
    } else {
      const rewritten = rewrites.get(part.id)
      out.push(rewritten ?? doc.source.slice(part.span.start, part.span.end))
    }
  }
  return out.join('')
}
