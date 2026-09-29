import { getElementById, type SourceDocument } from './document'
import { lineAtOffset } from './span'

/** 元素所在行的行首缩进（插入新行时跟随用户缩进习惯） */
export function lineIndent(source: string, offset: number): string {
  const lineStart = source.lastIndexOf('\n', Math.max(0, offset - 1)) + 1
  let i = lineStart
  while (i < offset && (source[i] === ' ' || source[i] === '\t')) i++
  return source.slice(lineStart, i)
}

/** 逐行 `'\n' + indent + line` 拼接（flowchart / class / sequence 共用的行拼接方式） */
export function indentLines(indent: string, lines: string[]): string {
  return lines.map((l) => '\n' + indent + l).join('')
}

/**
 * 手术式插入的共享内核（architecture-deepening 工单 02）：
 * 重写锚点元素 span = 锚点原文 + 插入文本，未触碰原文逐字保留（ADR-0008）。
 * 四份 parser 只在两个轴上不同——锚点策略与行拼接方式——故由调用方以参数给出。
 *
 * @param afterElementId 缺省 = 文档最后一个元素
 * @param anchor 'self' = 元素本身；'line-end' = 推到该行最靠后的元素（flowchart 链式语句）
 * @param render 追加到锚点原文之后的文本；indent 由内核算出，original 是锚点原文
 * @returns 重写表；锚点不存在 / 文档无元素时 null（不抛错、不产生重写）
 */
export function insertAfter(
  doc: SourceDocument,
  opts: {
    afterElementId?: string
    anchor?: 'self' | 'line-end'
    render(indent: string, original: string): string
  },
): Map<string, string> | null {
  let requested =
    (opts.afterElementId !== undefined ? getElementById(doc, opts.afterElementId) : undefined) ??
    doc.elements[doc.elements.length - 1]
  if (requested === undefined) return null
  if (opts.anchor === 'line-end') {
    // 新行插在锚点所在行的行尾：锚点取该行 span 最靠后的元素（链式语句的行末节点）
    const line = lineAtOffset(doc.source, requested.span.start)
    requested =
      doc.elements
        .filter((part) => lineAtOffset(doc.source, part.span.start) === line)
        .sort((a, b) => b.span.end - a.span.end)[0] ?? requested
  }
  const indent = lineIndent(doc.source, requested.span.start)
  const inserted = opts.render(indent, doc.source.slice(requested.span.start, requested.span.end))
  return new Map([
    [requested.id, doc.source.slice(requested.span.start, requested.span.end) + inserted],
  ])
}
