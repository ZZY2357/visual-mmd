import type { SourceDocument } from './document'

/**
 * 源码变换管线的类型接缝（ADR-0008）：
 *   (当前源码文本, 编辑意图) → 新源码文本
 * 解析器、手术式改写、快照栈全部封装在该接缝之后，测试只走此接缝。
 */

/** 解析错误：含 1 起始行号（无法定位时为 null） */
export interface SourceParseError {
  line: number | null
  message: string
}

export type ParseResult =
  | { ok: true; doc: SourceDocument }
  | { ok: false; error: SourceParseError }

/** 编辑意图：表单/画布层面的抽象操作，由解析器负责落地为 span 重写 */
export type EditIntent = { readonly type: string } & Record<string, unknown>

/** 每种图表类型实现一个：解析（带 span）+ 意图落地（产出 elementId → 新文本 的重写表） */
export interface DiagramParser {
  parse(source: string): ParseResult
  /** 意图不可应用（目标元素不存在等）时返回 null */
  resolveRewrites(doc: SourceDocument, intent: EditIntent): ReadonlyMap<string, string> | null
}
