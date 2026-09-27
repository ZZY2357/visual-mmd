import { describe, expect, it } from 'vitest'
import { extractParseError } from '../mermaid-error'

describe('extractParseError（mermaid 解析错误检测接缝）', () => {
  it('从 Error 消息中提取错误行号', () => {
    const err = new Error(
      "Parse error on line 3: ... B --> } ... Expecting 'SQE', 'PE', got 'EOF'",
    )
    const result = extractParseError(err)
    expect(result.line).toBe(3)
    expect(result.message).toContain('Parse error on line 3')
  })

  it('mermaid 风格的字符串错误也能提取行号', () => {
    const result = extractParseError('Parse error on line 12: ...')
    expect(result.line).toBe(12)
  })

  it('不含行号的消息返回 line = null，但保留信息', () => {
    const result = extractParseError(new Error('something went wrong'))
    expect(result.line).toBeNull()
    expect(result.message).toBe('something went wrong')
  })

  it('非 Error、非字符串的抛出值也能兜底成字符串', () => {
    const result = extractParseError({ weird: true })
    expect(typeof result.message).toBe('string')
    expect(result.line).toBeNull()
  })

  it('行号为 0 或负数时视为无效', () => {
    expect(extractParseError('error at line 0').line).toBeNull()
  })
})
