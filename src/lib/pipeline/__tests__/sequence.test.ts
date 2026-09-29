import { describe, expect, it } from 'vitest'
import { applyEdit } from '../pipeline'
import { reassemble } from '../document'
import { sequenceParser, renderNote, type NoteData } from '../sequence'
import { SEQUENCE_TEMPLATE } from '../../diagram-registry'

/**
 * sequence 解析器测试（工单 06，ADR-0004/0008）：
 * verbatim identity / 手术式改写，金样合法性见 sequence-golden.test.ts。
 */

/**
 * 结构性不变量（工单 11）：产物里不得存在"空分支"的块。
 * mermaid 对空块（loop/alt/... 与 end 之间没有语句）解析通过、但渲染期会抛出
 * 成批 `attribute …: Expected length, "NaN"` console error，故这里在结构层面拦住。
 * 实现：open 起一个块；else/and 结束当前分支并起下一个；end 收块；
 * 每个分支必须至少含一条语句（嵌套块本身算外层分支的一条语句）。
 */
function expectNoEmptyBranch(source: string): void {
  const parsed = sequenceParser.parse(source)
  expect(parsed.ok, `产物无法解析：${source}`).toBe(true)
  if (!parsed.ok) return
  const stack: number[] = []
  for (const part of parsed.doc.elements) {
    const kind = part.element.kind
    if (kind === 'block-open') {
      if (stack.length > 0) stack[stack.length - 1]++
      stack.push(0)
    } else if (kind === 'block-else') {
      if (stack.length > 0) {
        expect(stack[stack.length - 1], `else 分支为空：\n${source}`).toBeGreaterThan(0)
        stack[stack.length - 1] = 0
      }
    } else if (kind === 'block-end') {
      if (stack.length > 0) {
        expect(stack.pop(), `块体为空：\n${source}`).toBeGreaterThan(0)
      }
    } else if (stack.length > 0) {
      stack[stack.length - 1]++
    }
  }
  expect(stack, `块未闭合：\n${source}`).toHaveLength(0)
}

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

  it('delete-participant：声明与全部引用删除，被删空的 loop 一并移除（工单 11）', () => {
    const result = applyEdit(SOURCE, sequenceParser, { type: 'delete-participant', actorId: 'B' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).not.toContain('participant B')
    expect(result.source).not.toContain('A->>B')
    expect(result.source).toContain('participant A as 甲')
    // loop 心跳 的块体只有 A->>B: ping（引用 B）→ 级联删空后整块移除，不留空块
    expect(result.source).not.toContain('loop 心跳')
    expect(result.source).not.toMatch(/^[ \t]*end[ \t]*$/m)
    expectNoEmptyBranch(result.source)
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

// ---------- 级联删除后的空块清理（工单 11） ----------

/** 非空白行（去掉纯缩进的残留行后）——便于精确描述产物结构 */
function nonBlankLines(source: string): string[] {
  return source.split('\n').filter((line) => line.trim() !== '')
}

describe('级联删除参与者后清理空块（工单 11）', () => {
  it('最小复现（默认模板）：loop 内只有待删参与者的消息 → loop 整块消失、end 不留', () => {
    const result = applyEdit(SEQUENCE_TEMPLATE, sequenceParser, { type: 'delete-participant', actorId: '系统' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).not.toContain('系统')
    expect(result.source).not.toContain('loop')
    expect(result.source).not.toMatch(/^[ \t]*end[ \t]*$/m)
    // 只剩与被删参与者无关的三行；被删行只留下行内缩进的空白（手术式改写不改 verbatim）
    expect(nonBlankLines(result.source)).toEqual(['sequenceDiagram', '    autonumber', '    actor 使用者'])
    expectNoEmptyBranch(result.source)
  })

  it('alt：else 分支被删空 → 摘掉该 else 行，块与其它分支逐字保留', () => {
    const source = `sequenceDiagram
    actor A
    participant B
    participant C
    alt 条件一
        A->>B: hi
    else 条件二
        A->>C: ho
    end
    Note over B,C: 收尾
`
    const result = applyEdit(source, sequenceParser, { type: 'delete-participant', actorId: 'C' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 条件二（含唯一的 A->>C: ho）被删空 → else 行摘掉；条件一 与 end 原样保留
    expect(nonBlankLines(result.source)).toEqual([
      'sequenceDiagram',
      '    actor A',
      '    participant B',
      '    alt 条件一',
      '        A->>B: hi',
      '    end',
    ])
    expect(result.source).not.toContain('else')
    expect(result.source).not.toContain('条件二')
    expectNoEmptyBranch(result.source)
  })

  it('alt：所有分支都被删空 → 整块消失（含 end）', () => {
    const source = `sequenceDiagram
    actor A
    participant B
    alt 条件一
        A->>B: hi
    else 条件二
        B->>A: ho
    end
`
    const result = applyEdit(source, sequenceParser, { type: 'delete-participant', actorId: 'B' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(nonBlankLines(result.source)).toEqual(['sequenceDiagram', '    actor A'])
    expect(result.source).not.toContain('alt')
    expect(result.source).not.toContain('else')
    expect(result.source).not.toMatch(/^[ \t]*end[ \t]*$/m)
    expectNoEmptyBranch(result.source)
  })

  it('alt：首个分支被删空、else 分支仍有语句 → 摘掉分界 else 行，不留空分支', () => {
    const source = `sequenceDiagram
    actor A
    participant B as Bee
    participant C as Cee
    alt 条件一
        A->>B: hi
    else 条件二
        A->>C: ho
    end
`
    const result = applyEdit(source, sequenceParser, { type: 'delete-participant', actorId: 'B' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(nonBlankLines(result.source)).toEqual([
      'sequenceDiagram',
      '    actor A',
      '    participant C as Cee',
      '    alt 条件一',
      '        A->>C: ho',
      '    end',
    ])
    expect(result.source).not.toContain('else')
    expectNoEmptyBranch(result.source)
  })

  it('par/and：首个分支被删空、and 分支仍有语句 → 摘掉 and 分界行', () => {
    const source = `sequenceDiagram
    actor A
    participant B
    par 任务一
        A->>B: ping
    and 任务二
        A->>A: pong
    end
`
    const result = applyEdit(source, sequenceParser, { type: 'delete-participant', actorId: 'B' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(nonBlankLines(result.source)).toEqual([
      'sequenceDiagram',
      '    actor A',
      '    par 任务一',
      '        A->>A: pong',
      '    end',
    ])
    expect(result.source).not.toContain('and')
    expectNoEmptyBranch(result.source)
  })

  it('嵌套块：内层被删空先删内层，外层仍有语句则保留', () => {
    const source = `sequenceDiagram
    actor A
    participant B
    loop 外层
        alt 内层
            A->>B: ping
        end
        A->>A: 自转
    end
`
    const result = applyEdit(source, sequenceParser, { type: 'delete-participant', actorId: 'B' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(nonBlankLines(result.source)).toEqual([
      'sequenceDiagram',
      '    actor A',
      '    loop 外层',
      '        A->>A: 自转',
      '    end',
    ])
    expect(result.source).not.toContain('alt')
    expect(result.source).not.toContain('ping')
    expectNoEmptyBranch(result.source)
  })

  it('嵌套块：内层删空导致外层也变空 → 内外一起移除', () => {
    const source = `sequenceDiagram
    actor A
    participant B
    loop 外层
        alt 内层
            A->>B: ping
        end
    end
`
    const result = applyEdit(source, sequenceParser, { type: 'delete-participant', actorId: 'B' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(nonBlankLines(result.source)).toEqual(['sequenceDiagram', '    actor A'])
    expect(result.source).not.toContain('loop')
    expect(result.source).not.toContain('alt')
    expect(result.source).not.toContain('end')
    expectNoEmptyBranch(result.source)
  })

  it('不该删：两个块都不含待删参与者 → 块体与 end 逐字不变', () => {
    const source = `sequenceDiagram
    actor A
    participant B
    participant C
    loop 心跳
        A->>C: pong
    end
    alt 条件
        A->>C: hi
    else 别的
        C->>C: ho
    end
    A->>B: 无关消息
`
    const result = applyEdit(source, sequenceParser, { type: 'delete-participant', actorId: 'B' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 只有声明行与无关消息行被删（各自留下行内缩进的空白），两个块逐字未动
    const expected = source.replace('    participant B\n', '    \n').replace('    A->>B: 无关消息\n', '    \n')
    expect(result.source).toBe(expected)
  })

  it('不该删：块内仍有其它参与者的语句 → 块与 end 保留，仅被删空的分支摘掉分界行', () => {
    const source = `sequenceDiagram
    actor A
    participant B
    participant C
    loop 心跳
        A->>B: ping
        A->>C: pong
    end
    alt 条件
        A->>C: hi
    else 别的
        B->>C: ho
    end
`
    const result = applyEdit(source, sequenceParser, { type: 'delete-participant', actorId: 'B' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // loop 仍有 A->>C: pong → 整块保留（含 end）；只有被删的 A->>B: ping 行剩下一行缩进
    expect(result.source).toContain('    loop 心跳\n        \n        A->>C: pong\n    end\n')
    expect(nonBlankLines(result.source)).toEqual([
      'sequenceDiagram',
      '    actor A',
      '    participant C',
      '    loop 心跳',
      '        A->>C: pong',
      '    end',
      '    alt 条件',
      '        A->>C: hi',
      '    end',
    ])
    expect(result.source).not.toContain('else')
    expectNoEmptyBranch(result.source)
  })

  it('原本就空的块不被触碰（只清理本次删除造成的空）', () => {
    const source = `sequenceDiagram
    actor A
    participant B
    loop 空块
    end
    A->>B: hi
`
    const result = applyEdit(source, sequenceParser, { type: 'delete-participant', actorId: 'B' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 该 loop 在删除前就是空的，不属于"本次删空"，逐字保留（此处不能用 expectNoEmptyBranch）
    expect(result.source).toContain('    loop 空块\n    end\n')
    expect(result.source).not.toContain('participant B')
    expect(result.source).not.toContain('A->>B: hi')
  })
})

// ---------- Note left of / right of 的参与者解析（工单 13） ----------

/** 解析出源码里全部 note 元素（断言用） */
function noteElements(source: string): NoteData[] {
  const parsed = sequenceParser.parse(source)
  expect(parsed.ok, `样例源码必须可解析：${source}`).toBe(true)
  if (!parsed.ok) throw parsed.error
  return parsed.doc.elements.filter((part) => part.element.kind === 'note').map((part) => part.element as NoteData)
}

describe('Note left of / right of 解析参与者（工单 13）', () => {
  const RUBRIC = `sequenceDiagram
    actor 甲
    participant Server as 服务器
    Note left of 甲: 左边注释
    Note over 甲,Server: 跨越注释
    Note right of Server: 右边注释
`

  it('left of / right of 解析出单个参与者，over 不受影响', () => {
    const notes = noteElements(RUBRIC)
    expect(notes.map((n) => [n.pos, n.actors])).toEqual([
      ['left', ['甲']],
      ['over', ['甲', 'Server']],
      ['right', ['Server']],
    ])
  })

  it('mid 含 ` of X`：未改 pos/actors 时 renderNote 逐字回写整行', () => {
    const notes = noteElements(RUBRIC)
    expect(notes.map((n) => n.mid)).toEqual([' of 甲', ' 甲,Server', ' of Server'])
    expect(notes.map((n) => renderNote(n, {}))).toEqual([
      'Note left of 甲: 左边注释',
      'Note over 甲,Server: 跨越注释',
      'Note right of Server: 右边注释',
    ])
  })

  it('verbatim：解析 → 重组装逐字相同（含 ` of ` 前后的空格）', () => {
    const parsed = sequenceParser.parse(RUBRIC)
    if (!parsed.ok) throw parsed.error
    expect(reassemble(parsed.doc)).toBe(RUBRIC)
  })

  it('no-op set-note（文本未变）逐字不改：`of` 不被吞掉', () => {
    const source = `sequenceDiagram
    actor 甲
    participant 乙 as Bee
    Note right of 乙: 注释
`
    const result = applyEdit(source, sequenceParser, { type: 'set-note', elementId: 'note:1', text: '注释' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toBe(source)
  })

  it.each(['left', 'right'] as const)('级联删除：删参与者 乙 时 `Note %s of 乙` 一并移除（工单 13）', (pos) => {
    const source = `sequenceDiagram
    actor 甲
    participant 乙 as Bee
    Note ${pos} of 乙: 注释
    甲->>乙: hi
`
    const result = applyEdit(source, sequenceParser, { type: 'delete-participant', actorId: '乙' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 声明 / note / 消息全部级联消失，不留悬挂引用（否则 mermaid 会隐式复现「乙」框）
    expect(nonBlankLines(result.source)).toEqual(['sequenceDiagram', '    actor 甲'])
    expect(result.source).not.toContain(`Note ${pos} of 乙`)
    expect(result.source).not.toContain('乙')
    expectNoEmptyBranch(result.source)
  })

  it('set-note：`Note right of 甲` 改 pos 为 over 时带上参与者（不再是 `Note over : …`）', () => {
    const source = `sequenceDiagram
    participant 甲
    Note right of 甲: 注释
`
    const result = applyEdit(source, sequenceParser, { type: 'set-note', elementId: 'note:1', pos: 'over' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('Note over 甲: 注释')
    expect(result.source).not.toContain('Note over :')
  })

  it('rename-participant：`Note right of 甲` 的参与者一并改名，不留旧名', () => {
    const source = `sequenceDiagram
    participant 甲
    Note right of 甲: 注释
`
    const result = applyEdit(source, sequenceParser, { type: 'rename-participant', actorId: '甲', newId: 'Client' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('Note right of Client: 注释')
    expect(result.source).not.toContain('甲')
  })
})
