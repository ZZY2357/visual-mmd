import { describe, expect, it } from 'vitest'
import { DEFAULT_DIAGRAM_SOURCE } from '../../storage'
import { flowchartParser } from '../flowchart'
import { reassemble } from '../document'

/**
 * verbatim identity（ADR-0004/0008 可测试承诺）：
 * 任意合法源码经解析 → 不改 → 重组装，输出与输入逐字相同。
 */

/** 覆盖 ADR-0005 清单内全部 flowchart 语法 + 清单外（linkStyle/click/class）逐字保留 */
const FULL_COVERAGE = `flowchart LR
    %% 一条注释，必须逐字保留

    A[矩形] --> B(圆角)
    B([体育场]) --> C[[子程序]]
    C[(圆柱)] --> D((圆))
    D(((双圆))) --> E{菱形}
    E{{六边形}} --> F[/平行四边形/]
    F[\\反平行四边形\\] --> G[/梯形\\]
    G[\\反梯形/] --> H>旗帜]
    A --- B
    A ---|管道标签| B
    B -- 行内标签 --> C
    B -.-> C
    B -. 虚线标签 .-> D
    B -.- D
    C ==> E
    C == 粗线标签 ==> E
    C === E
    D ~~~ E
    D --o E
    D o--o E
    D --x E
    D x--x E
    D <--> E
    D o<-->o E
    E ----> F
    E -..-> F
    E ===> F
    E --->|长度箭头| F

    subgraph 一 [分组标题]
        direction LR
        S1[内部节点] --> S2
        subgraph 嵌套子图
            N1(N一) --> N2
        end
    end

    classDef 高亮 fill:#f9f,stroke:#333, stroke-width:2px,stroke-dasharray:5 5,color:#333
    class S1 高亮
    linkStyle 0 stroke:red,stroke-width:2px
    click A callback "提示"
`

describe('verbatim identity', () => {
  const sources: Array<[string, string]> = [
    ['默认 flowchart 模板', DEFAULT_DIAGRAM_SOURCE],
    ['覆盖全部语法的用例', FULL_COVERAGE],
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
    ['链式连线与管道标签', 'flowchart LR\n    A --> B --> C\n    A ---|中间| B\n    B -- x --> C -->|尾| D\n'],
    ['bare subgraph 与引号标题', 'flowchart TD\n    subgraph\n        A --> B\n    end\n    subgraph g1 ["带引号"]\n        C\n    end\n'],
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
