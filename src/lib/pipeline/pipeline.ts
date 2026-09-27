import { reassemble, type SourceDocument } from './document'
import type { DiagramParser, EditIntent, ParseResult, SourceParseError } from './parser'

/**
 * 源码变换管线（ADR-0008 的核心接缝）：
 *   (当前源码文本, 编辑意图) → 新源码文本
 * 纯函数：解析 → 意图落地为 span 重写表 → 重组装（未触碰文本逐字保留）。
 */

export type EditResult =
  | { ok: true; source: string; doc: SourceDocument }
  | { ok: false; error: SourceParseError }

export function applyEdit(source: string, parser: DiagramParser, intent: EditIntent): EditResult {
  const parsed: ParseResult = parser.parse(source)
  if (!parsed.ok) return parsed

  const rewrites = parser.resolveRewrites(parsed.doc, intent)
  if (rewrites === null) {
    return {
      ok: false,
      error: {
        line: null,
        message: `编辑意图无法应用（${intent.type}）：目标元素不存在`,
      },
    }
  }

  return { ok: true, source: reassemble(parsed.doc, rewrites), doc: parsed.doc }
}
