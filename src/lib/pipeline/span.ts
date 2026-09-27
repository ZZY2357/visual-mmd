/**
 * 源码文本区间（ADR-0004）：左闭右开的字符偏移 [start, end)。
 * 解析器为每个元素记录 span，编辑只重写目标 span，其余文本逐字不变（ADR-0008）。
 */
export interface Span {
  start: number
  end: number
}

export function spanLength(span: Span): number {
  return span.end - span.start
}

/** 1 起始的行号（供解析错误与 UI 跳转使用） */
export function lineAtOffset(source: string, offset: number): number {
  let line = 1
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === '\n') line++
  }
  return line
}
