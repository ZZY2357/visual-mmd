/**
 * 从 mermaid 抛出的错误中提取"错误行号"的纯函数接缝。
 * mermaid v12 的解析错误消息形如：
 *   "Parse error on line 3: ... Expected ... got 'EOF'"
 * 也可能是不含行号的普通 Error。提取不到行号时返回 null。
 */

export interface SourceParseError {
  /** 1 起始的错误行号；无法确定时为 null */
  line: number | null
  /** 面向用户展示的错误信息（原始消息的整理版） */
  message: string
}

export function extractParseError(error: unknown): SourceParseError {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : String(error)

  const lineMatch = /line\s+(\d+)/i.exec(message)
  const line = lineMatch !== null ? Number.parseInt(lineMatch[1], 10) : null

  return { line: line !== null && line >= 1 ? line : null, message }
}
