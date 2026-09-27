import { describe, expect, it } from 'vitest'
import { DEFAULT_DIAGRAM_SOURCE } from '../../storage'
import { flowchartParser } from '../flowchart'
import { reassemble } from '../document'

/**
 * verbatim identity（ADR-0004/0008 可测试承诺）：
 * 任意合法源码经解析 → 不改 → 重组装，输出与输入逐字相同。
 */
describe('verbatim identity', () => {
  const sources: Array<[string, string]> = [
    ['默认 flowchart 模板', DEFAULT_DIAGRAM_SOURCE],
    [
      '含注释、空行、无法解析指令、各类连线',
      `flowchart LR
    %% 一条注释，必须逐字保留

    A[开始] --> B{判断}
    B -- 是 --> C[享受画图]
    B -.-> D
    D == 加油 ==> E((圆))
    F>旗帜]
    G[(圆柱)]

    linkStyle 0 stroke:red,stroke-width:2px
    classDef styled fill:#f9f
`,
    ],
    ['无尾随换行', 'flowchart TD\n    A --> B'],
    ['CRLF 行尾', 'flowchart TD\r\n    A --> B\r\n    B --> C\r\n'],
    ['无空格连线', 'flowchart TD\n    A-->B\n    B--标签-->C\n'],
  ]

  for (const [name, source] of sources) {
    it(`${name}：解析→重组装逐字相同`, () => {
      const parsed = flowchartParser.parse(source)
      expect(parsed.ok).toBe(true)
      if (!parsed.ok) return
      expect(reassemble(parsed.doc)).toBe(source)
    })
  }

  it('解析产物完整覆盖源码且不重叠（parts 不变量）', () => {
    const parsed = flowchartParser.parse(DEFAULT_DIAGRAM_SOURCE)
    if (!parsed.ok) throw parsed.error
    let cursor = 0
    for (const part of parsed.doc.parts) {
      expect(part.span.start).toBe(cursor)
      cursor = part.span.end
    }
    expect(cursor).toBe(DEFAULT_DIAGRAM_SOURCE.length)
  })
})
