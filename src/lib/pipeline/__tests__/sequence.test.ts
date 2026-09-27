import { describe, expect, it } from 'vitest'
import { applyEdit } from '../pipeline'
import { reassemble } from '../document'
import { sequenceParser } from '../sequence'

/**
 * sequence 解析器测试（工单 06，ADR-0004/0008）：
 * verbatim identity / 手术式改写，金样合法性见 sequence-golden.test.ts。
 */

/** 覆盖 ADR-0005 清单内全部 sequence 语法 + 清单外（create/destroy/rect/box）逐字保留 */
const FULL_COVERAGE = `sequenceDiagram
    %% 一条注释，必须逐字保留
    autonumber 10
    actor 用户 as 小明
    participant Server as 服务器

    rect rgb(200, 150, 255)
        box 自定义框
            actor 内部
        end
    end

    用户->>+Server: 请求
    Server-->>-用户: 响应
    用户 -x Server: 丢失
    用户 -- Server: 异步无头

    create participant 第三方
    destroy 用户
    用户->>Server: 再来一条

    Note left of 用户: 左边注释
    Note over 用户,Server: 跨越注释
    Note right of Server: 右边注释

    loop 每 3 秒
        用户->>Server: 心跳
    end

    alt 成功
        Server-->>用户: OK
    else 失败
        Server-->>用户: 错误
    end

    opt 可选步骤
        用户->>Server: 询问
    end

    par 任务一
        Server->>Server: 自转
    and 任务二
        Server->>用户: 推送
    end

    critical 必须成功
        用户->>Server: 提交
        break 网络断了
            Server-->>用户: 中断
        end
    end
`

describe('verbatim identity（sequence）', () => {
  const sources: Array<[string, string]> = [
    ['默认时序图模板', `sequenceDiagram
    autonumber
    actor 使用者
    participant 系统 as Visual MMD
    使用者->>系统: 打开图表
    activate 系统
    系统-->>使用者: 渲染预览
    deactivate 系统
    Note over 使用者,系统: 左侧代码随表单变化
    loop 每次编辑
        系统->>系统: 保存到 localStorage
    end
`],
    ['覆盖全部语法的用例（含清单外 create/destroy/rect/box）', FULL_COVERAGE],
    ['无尾随换行', 'sequenceDiagram\n    A->>B: 你好'],
    ['CRLF 行尾', 'sequenceDiagram\r\n    A->>B: 你好\r\n    B-->>A: 好\r\n'],
    ['无空格紧凑写法', 'sequenceDiagram\n    A->>B:hi\n    B--xA:yo\n'],
    ['autonumber 带参数', 'sequenceDiagram\n    autonumber 5 10\n    A->>B: 你好\n'],
    ['别名带引号', 'sequenceDiagram\n    participant A as "中文名"\n    A->>B: 你好\n'],
  ]

  for (const [name, source] of sources) {
    it(`${name}：解析→重组装逐字相同`, () => {
      const parsed = sequenceParser.parse(source)
      expect(parsed.ok).toBe(true)
      if (!parsed.ok) return
      expect(reassemble(parsed.doc)).toBe(source)
    })
  }

  it('解析产物完整覆盖源码且不重叠（parts 不变量）', () => {
    const parsed = sequenceParser.parse(FULL_COVERAGE)
    if (!parsed.ok) throw parsed.error
    let cursor = 0
    for (const part of parsed.doc.parts) {
      expect(part.span.start).toBe(cursor)
      cursor = part.span.end
    }
    expect(cursor).toBe(FULL_COVERAGE.length)
  })
})

describe('手术式改写（sequence）：只重写目标元素 span，其余逐字不变', () => {
  const SOURCE = `sequenceDiagram
    %% 注释逐字保留
    autonumber
    participant A as 甲
    participant B

    A->>B: 你好吗
    B-->>A: 很好
    Note over A,B: 一句注释

    loop 心跳
        A->>B: ping
    end
`

  it('set-message 文本：只改目标消息行', () => {
    const result = applyEdit(SOURCE, sequenceParser, { type: 'set-message', elementId: 'message:1', text: '最近如何' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('A->>B: 最近如何')
    expect(result.source).toContain('B-->>A: 很好')
    expect(result.source).toContain('%% 注释逐字保留')
  })

  it('set-message 箭头：改箭头符号保留其余写法', () => {
    const result = applyEdit(SOURCE, sequenceParser, { type: 'set-message', elementId: 'message:2', arrow: '-x' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('B-xA: 很好')
  })

  it('set-participant 别名：只改声明行；消息里的 id 不变', () => {
    const result = applyEdit(SOURCE, sequenceParser, { type: 'set-participant', actorId: 'A', alias: '张三' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('participant A as 张三')
    expect(result.source).toContain('A->>B: 你好吗')
  })

  it('set-participant 去掉别名', () => {
    const result = applyEdit(SOURCE, sequenceParser, { type: 'set-participant', actorId: 'A', alias: null })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('participant A\n')
    expect(result.source).not.toContain('as 甲')
  })

  it('rename-participant：声明 + 全部引用一起改，别名保留', () => {
    const result = applyEdit(SOURCE, sequenceParser, { type: 'rename-participant', actorId: 'A', newId: 'Client' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('participant Client as 甲')
    expect(result.source).toContain('Client->>B: 你好吗')
    expect(result.source).toContain('Note over Client,B: 一句注释')
    expect(result.source).toContain('        Client->>B: ping')
    expect(result.source).not.toMatch(/\bA(?!s )/)
  })

  it('add-message：插到最后一条消息后，沿用锚点缩进', () => {
    const result = applyEdit(SOURCE, sequenceParser, { type: 'add-message', from: 'A', to: 'B', arrow: '->>', text: '新增' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('    end\n    A->>B: 新增\n')
    expect(result.source).toContain('%% 注释逐字保留')
  })

  it('add-message：激活简写落码为 + 简写', () => {
    const result = applyEdit(SOURCE, sequenceParser, { type: 'add-message', from: 'A', to: 'B', arrow: '->>', act: '+' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('A->>+B:')
  })

  it('add-note：over 两个参与者', () => {
    const result = applyEdit(SOURCE, sequenceParser, { type: 'add-note', pos: 'over', actors: ['A', 'B'], text: '备注' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('Note over A,B: 备注')
  })

  it('set-note：改位置（over → left of）', () => {
    const result = applyEdit(SOURCE, sequenceParser, { type: 'set-note', elementId: 'note:1', pos: 'left' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('Note left of A: 一句注释')
  })

  it('set-autonumber 开：插到 header 后', () => {
    const stripped = 'sequenceDiagram\n    A->>B: 你好\n'
    const result = applyEdit(stripped, sequenceParser, { type: 'set-autonumber', enabled: true })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toBe('sequenceDiagram\nautonumber\n    A->>B: 你好\n')
  })

  it('set-autonumber 关：删除 autonumber 行，其余不变', () => {
    const result = applyEdit(SOURCE, sequenceParser, { type: 'set-autonumber', enabled: false })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).not.toContain('autonumber')
    expect(result.source).toContain('%% 注释逐字保留')
  })

  it('add-block：插入 open + end 两行', () => {
    const result = applyEdit(SOURCE, sequenceParser, { type: 'add-block', keyword: 'opt', label: '可选' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('    end\n    opt 可选\n    end\n')
  })

  it('set-block-label：只改 open 行', () => {
    const result = applyEdit(SOURCE, sequenceParser, { type: 'set-block-label', elementId: 'block:1', label: '定时心跳' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('loop 定时心跳')
    expect(result.source).toContain('        A->>B: ping')
  })

  it('add-else：插到匹配 end 前，嵌套块深度正确', () => {
    const result = applyEdit(SOURCE, sequenceParser, { type: 'add-else', blockId: 'block:1', label: '超时' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('        A->>B: ping\n    else 超时\n    end')
  })

  it('delete-block：open 到匹配 end 全部删除（含嵌套内容），其余逐字不变', () => {
    const result = applyEdit(SOURCE, sequenceParser, { type: 'delete-block', elementId: 'block:1' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).not.toContain('loop 心跳')
    expect(result.source).not.toContain('ping')
    expect(result.source).toContain('B-->>A: 很好')
    expect(result.source).toContain('Note over A,B: 一句注释')
  })

  it('delete-participant：声明与全部引用删除', () => {
    const result = applyEdit(SOURCE, sequenceParser, { type: 'delete-participant', actorId: 'B' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).not.toContain('participant B')
    expect(result.source).not.toContain('A->>B')
    expect(result.source).toContain('participant A as 甲')
    expect(result.source).toContain('loop 心跳')
  })

  it('toggle-activation：追加 activate / deactivate 行', () => {
    const step1 = applyEdit(SOURCE, sequenceParser, { type: 'toggle-activation', actorId: 'B' })
    expect(step1.ok).toBe(true)
    if (!step1.ok) return
    expect(step1.source).toContain('        activate B\n')
    const step2 = applyEdit(step1.source, sequenceParser, { type: 'toggle-activation', actorId: 'B' })
    expect(step2.ok).toBe(true)
    if (!step2.ok) return
    expect(step2.source).toContain('        deactivate B\n')
  })

  it('目标元素不存在时返回错误', () => {
    const result = applyEdit(SOURCE, sequenceParser, { type: 'set-message', elementId: 'message:99', text: 'x' })
    expect(result.ok).toBe(false)
  })
})
