import { describe, expect, it } from 'vitest'
import { applyEdit } from '../pipeline'
import { reassemble } from '../document'
import {
  sequenceParser,
  renderAutonumber,
  renderNote,
  renderParticipant,
  type AutonumberData,
  type BoxOpenData,
  type NoteData,
  type ParticipantData,
  type RectOpenData,
} from '../sequence'
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

/** 覆盖 ADR-0005 清单内全部 sequence 语法（含 create，工单 01）+ 清单外（destroy/rect/box）逐字保留 */
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
    ['覆盖全部语法的用例（含清单外 destroy/rect/box）', FULL_COVERAGE],
    ['create 声明（participant/actor，含别名与无别名）', `sequenceDiagram
    create participant B as Bee
    create actor C
    A->>B: hi
    B->>C: 好
`],
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

// ---------- create 进模型（工单 01，ADR-0014） ----------

/** 解析出的 participant 元素（断言用） */
function participantElements(source: string): ParticipantData[] {
  const parsed = sequenceParser.parse(source)
  expect(parsed.ok, `样例源码必须可解析：${source}`).toBe(true)
  if (!parsed.ok) throw parsed.error
  return parsed.doc.elements
    .filter((part) => part.element.kind === 'participant')
    .map((part) => part.element as ParticipantData)
}

describe('create 声明进模型（工单 01，ADR-0014）', () => {
  it('create participant / create actor 解析为参与者声明，关键字与别名照常透出', () => {
    const decls = participantElements(`sequenceDiagram
    create participant B as Bee
    create actor C
`)
    expect(decls).toEqual([
      { kind: 'participant', createPrefixRaw: 'create ', keyword: 'participant', gap: ' ', actorId: 'B', aliasRaw: 'Bee' },
      { kind: 'participant', createPrefixRaw: 'create ', keyword: 'actor', gap: ' ', actorId: 'C', aliasRaw: null },
    ])
  })

  it('普通 participant / actor 声明的 createPrefixRaw 为 null（对照）', () => {
    const decls = participantElements(`sequenceDiagram
    participant A as 甲
    actor B
`)
    expect(decls.map((d) => [d.actorId, d.createPrefixRaw])).toEqual([
      ['A', null],
      ['B', null],
    ])
  })

  it('create 与关键字之间的空白逐字保留，renderParticipant 原样回写', () => {
    const decls = participantElements('sequenceDiagram\n    create   participant B\n')
    expect(decls[0]?.createPrefixRaw).toBe('create   ')
    expect(renderParticipant(decls[0], {})).toBe('create   participant B')
  })

  it('verbatim：含 create 的源码解析→重组装逐字相同', () => {
    const source = `sequenceDiagram
    %% create 注释
    create participant B as Bee
    create actor C
      create    participant D
    A->>B: hi
`
    const parsed = sequenceParser.parse(source)
    if (!parsed.ok) throw parsed.error
    expect(reassemble(parsed.doc)).toBe(source)
  })

  it('set-participant 别名：create 行改写后仍保留 create 前缀', () => {
    const source = 'sequenceDiagram\n    create participant B\n    B->>B: hi\n'
    const result = applyEdit(source, sequenceParser, { type: 'set-participant', actorId: 'B', alias: '乙' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('create participant B as 乙')
    expect(result.source).toContain('B->>B: hi')
  })

  it('rename-participant：create 行与全部引用一起改名，create 前缀与别名保留', () => {
    const source = 'sequenceDiagram\n    create participant B as Bee\n    A->>B: hi\n'
    const result = applyEdit(source, sequenceParser, { type: 'rename-participant', actorId: 'B', newId: 'Srv' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('create participant Srv as Bee')
    expect(result.source).toContain('A->>Srv: hi')
    expect(result.source).not.toMatch(/\bB\b/)
  })

  it('destroy 仍不解析；rect / box 及其 end 进解析结构（工单 06）', () => {
    const source = `sequenceDiagram
    participant A
    A->>B: hi
    destroy B
    rect rgb(0, 0, 0)
    end
    box 分组
        participant C
    end
`
    const parsed = sequenceParser.parse(source)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(reassemble(parsed.doc)).toBe(source)
    // destroy 逐字保留、不进结构；rect/box 的开闭都成为元素
    expect(parsed.doc.elements.map((p) => p.element.kind)).toEqual([
      'seq-header',
      'participant',
      'message',
      'rect-open',
      'region-end',
      'box-open',
      'participant',
      'region-end',
    ])
    expect(parsed.doc.elements.map((p) => p.element.kind)).not.toContain('destroy')
  })
})

// ---------- rect / box 进模型（工单 06，ADR-0014） ----------

/** 解析出的 rect-open / box-open 元素（断言用） */
function regionOpenElements(source: string): Array<RectOpenData | BoxOpenData> {
  const parsed = sequenceParser.parse(source)
  expect(parsed.ok, `样例源码必须可解析：${source}`).toBe(true)
  if (!parsed.ok) throw parsed.error
  return parsed.doc.elements
    .filter((part) => part.element.kind === 'rect-open' || part.element.kind === 'box-open')
    .map((part) => part.element as RectOpenData | BoxOpenData)
}

describe('rect / box 进模型（工单 06）', () => {
  it('rect：色值原文整段透出（gap 为关键字后的空白）', () => {
    const [rect] = regionOpenElements('sequenceDiagram\n    rect rgb(200, 150, 255)\n    end\n')
    expect(rect).toEqual({ kind: 'rect-open', gap: ' ', colorRaw: 'rgb(200, 150, 255)' })
  })

  it('box：颜色 token + 标签拆分（按 mermaid 的「颜色在前、描述在后」）', () => {
    const [box] = regionOpenElements('sequenceDiagram\n    box Purple 数据库组\n    end\n')
    expect(box).toEqual({ kind: 'box-open', gap: ' ', colorRaw: 'Purple', colorGap: ' ', label: '数据库组' })
  })

  it('box：首段非颜色（中文/单 token）时整段都是标签，colorRaw 为 null', () => {
    expect(regionOpenElements('sequenceDiagram\n    box 数据库组\n    end\n')[0]).toEqual({
      kind: 'box-open',
      gap: ' ',
      colorRaw: null,
      colorGap: '',
      label: '数据库组',
    })
    // 单 token（无描述）：mermaid 视其为颜色，但无剩余文本 → 这里保守当作标签，逐字仍一致
    expect(regionOpenElements('sequenceDiagram\n    box Purple\n    end\n')[0]).toEqual({
      kind: 'box-open',
      gap: ' ',
      colorRaw: null,
      colorGap: '',
      label: 'Purple',
    })
  })

  it('box：颜色函数写法同样拆出（rgb(...) 首段）', () => {
    const [box] = regionOpenElements('sequenceDiagram\n    box rgb(0, 0, 0) 分组\n    end\n')
    expect(box).toEqual({ kind: 'box-open', gap: ' ', colorRaw: 'rgb(0, 0, 0)', colorGap: ' ', label: '分组' })
  })

  it('verbatim：rect / box（含嵌套与单行写法）解析→重组装逐字相同', () => {
    const source = `sequenceDiagram
    %% 注释
    rect rgb(200, 150, 255)
        box 自定义框
            participant 内部
        end
    end
    box   Purple   数据库组
    end
`
    const parsed = sequenceParser.parse(source)
    if (!parsed.ok) throw parsed.error
    expect(reassemble(parsed.doc)).toBe(source)
  })

  it('set-rect-color：只改 rect 行的色值，内部成员逐字不变', () => {
    const source = `sequenceDiagram
    participant A
    rect rgb(200, 150, 255)
        A->>A: 自转
    end
`
    const result = applyEdit(source, sequenceParser, {
      type: 'set-rect-color',
      elementId: 'rect:1',
      color: 'rgb(255, 0, 0)',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('    rect rgb(255, 0, 0)\n')
    expect(result.source).toContain('        A->>A: 自转\n')
    expect(result.source).not.toContain('200, 150, 255')
  })

  it('set-box-label：保留颜色 token，只改标签', () => {
    const source = `sequenceDiagram
    box Purple 数据库组
        participant DB
    end
`
    const result = applyEdit(source, sequenceParser, {
      type: 'set-box-label',
      elementId: 'box:1',
      label: '存储层',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('    box Purple 存储层\n')
    expect(result.source).toContain('        participant DB\n')
  })

  it('set-box-label：无颜色 token 的 box 直接替换整段', () => {
    const source = 'sequenceDiagram\n    box 数据库组\n    end\n'
    const result = applyEdit(source, sequenceParser, {
      type: 'set-box-label',
      elementId: 'box:1',
      label: '存储层',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toBe('sequenceDiagram\n    box 存储层\n    end\n')
  })

  it('目标不存在时返回错误（rect / box 意图各一）', () => {
    expect(applyEdit('sequenceDiagram\n', sequenceParser, { type: 'set-rect-color', elementId: 'rect:9', color: '#fff' }).ok).toBe(false)
    expect(applyEdit('sequenceDiagram\n', sequenceParser, { type: 'set-box-label', elementId: 'box:9', label: 'x' }).ok).toBe(false)
  })

  it('嵌套栈正确：loop 内的 rect 的 end 不会误配成 loop 的 end', () => {
    const source = `sequenceDiagram
    participant A
    loop 外层
        rect rgb(0,0,0)
            A->>A: hi
        end
    end
`
    const parsed = sequenceParser.parse(source)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.doc.elements.map((p) => p.element.kind)).toEqual([
      'seq-header',
      'participant',
      'block-open',
      'rect-open',
      'message',
      'region-end',
      'block-end',
    ])
    // 删 loop 应连同内部 rect 一起移除（open 到匹配 end 的区间正确）
    const result = applyEdit(source, sequenceParser, { type: 'delete-block', elementId: 'block:1' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).not.toContain('loop')
    expect(result.source).not.toContain('rect')
    expect(result.source).not.toMatch(/^[ \t]*end[ \t]*$/m)
  })
})

// ---------- 未闭合 rect / box 不解析失败（工单 01，D1 定案取甲：保留 entry） ----------

/** 解析出的元素种类序列；null = 解析失败 */
function parseKinds(source: string): string[] | null {
  const parsed = sequenceParser.parse(source)
  if (!parsed.ok) return null
  return parsed.doc.elements.map((part) => part.element.kind)
}

/** 解析失败时的错误；解析成功则断言失败 */
function parseError(source: string): { line: number | null; message: string } {
  const parsed = sequenceParser.parse(source)
  expect(parsed.ok, `预期解析失败：\n${source}`).toBe(false)
  if (parsed.ok) throw new Error('预期解析失败')
  return parsed.error
}

describe('未闭合 rect / box 不解析失败（工单 01）', () => {
  it('rect 内嵌 loop 且只有一个 end：end 关 loop，rect-open 保留、无 region-end', () => {
    const source = `sequenceDiagram
    rect rgb(200, 150, 255)
    loop 每日
    甲->>乙: 打卡
    end
`
    expect(parseKinds(source)).toEqual(['seq-header', 'rect-open', 'block-open', 'message', 'block-end'])
    const parsed = sequenceParser.parse(source)
    if (!parsed.ok) throw parsed.error
    // 未闭合 region 留下的 open entry 照旧参与重组装，逐字保留不变（ADR-0004/0008）
    expect(reassemble(parsed.doc)).toBe(source)
  })

  it('box 完全没有 end：解析成功，box-open 保留、无 region-end', () => {
    const source = 'sequenceDiagram\n    participant A\n    box 分组\n        participant C\n'
    expect(parseKinds(source)).toEqual(['seq-header', 'participant', 'box-open', 'participant'])
  })

  it('回归保护：逻辑块未闭合仍解析失败，行号指向未闭合的开行', () => {
    expect(parseError('sequenceDiagram\n    participant A\n    loop 外层\n        A->>A: hi\n')).toEqual({
      line: 3,
      message: '逻辑块缺少匹配的 end',
    })
    // region 未闭合不报错，但包住它的 loop 未闭合仍要报错，行号指 loop
    expect(
      parseError('sequenceDiagram\n    loop 外层\n        rect rgb(0,0,0)\n            A->>A: hi\n    end\n'),
    ).toEqual({ line: 2, message: '逻辑块缺少匹配的 end' })
  })

  it('正常闭合的 rect / box 仍出 open + region-end（保护工单 06 成果）', () => {
    expect(parseKinds('sequenceDiagram\n    rect rgb(0,0,0)\n        A->>A: hi\n    end\n')).toEqual([
      'seq-header',
      'rect-open',
      'message',
      'region-end',
    ])
    expect(parseKinds('sequenceDiagram\n    box 分组\n        participant C\n    end\n')).toEqual([
      'seq-header',
      'box-open',
      'participant',
      'region-end',
    ])
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

// ---------- autonumber 起始值 / 步长（工单 08） ----------

/** 解析出的 autonumber 元素（断言用） */
function autonumberElements(source: string): AutonumberData[] {
  const parsed = sequenceParser.parse(source)
  expect(parsed.ok, `样例源码必须可解析：${source}`).toBe(true)
  if (!parsed.ok) throw parsed.error
  return parsed.doc.elements
    .filter((part) => part.element.kind === 'autonumber')
    .map((part) => part.element as AutonumberData)
}

describe('autonumber 起始值 / 步长（工单 08）', () => {
  it('解析：无参 / 仅起始值 / 起始值+步长 三种形态', () => {
    expect(autonumberElements('sequenceDiagram\n    autonumber\n')[0]).toEqual({
      kind: 'autonumber',
      raw: 'autonumber',
      start: null,
      step: null,
    })
    expect(autonumberElements('sequenceDiagram\n    autonumber 10\n')[0]).toEqual({
      kind: 'autonumber',
      raw: 'autonumber 10',
      start: '10',
      step: null,
    })
    expect(autonumberElements('sequenceDiagram\n    autonumber 10 10\n')[0]).toEqual({
      kind: 'autonumber',
      raw: 'autonumber 10 10',
      start: '10',
      step: '10',
    })
  })

  it('renderAutonumber：未改字段时逐字回写（多空白保留）', () => {
    const [d] = autonumberElements('sequenceDiagram\n    autonumber  10   10\n')
    expect(renderAutonumber(d, {})).toBe('autonumber  10   10')
  })

  it('verbatim：autonumber 带参数解析 → 重组装逐字相同', () => {
    const source = 'sequenceDiagram\n    autonumber  10   10\n    A->>B: 你好\n'
    const parsed = sequenceParser.parse(source)
    if (!parsed.ok) throw parsed.error
    expect(reassemble(parsed.doc)).toBe(source)
  })

  it('set-autonumber：行已存在时原地改起始值（步长保留）', () => {
    const source = 'sequenceDiagram\n    autonumber 10 10\n    A->>B: hi\n'
    const result = applyEdit(source, sequenceParser, { type: 'set-autonumber', enabled: true, start: '5' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toBe('sequenceDiagram\n    autonumber 5 10\n    A->>B: hi\n')
  })

  it('set-autonumber：改步长（起始值保留）', () => {
    const source = 'sequenceDiagram\n    autonumber 5 10\n    A->>B: hi\n'
    const result = applyEdit(source, sequenceParser, { type: 'set-autonumber', enabled: true, step: '2' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('autonumber 5 2')
  })

  it('set-autonumber：无参行 + 起始值/步长 → 一次补齐 `autonumber 10 10`', () => {
    const source = 'sequenceDiagram\n    autonumber\n    A->>B: hi\n'
    const result = applyEdit(source, sequenceParser, { type: 'set-autonumber', enabled: true, start: '10', step: '10' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toBe('sequenceDiagram\n    autonumber 10 10\n    A->>B: hi\n')
  })

  it('set-autonumber：清空起始值退化为 `autonumber`（步长一并去掉）', () => {
    const source = 'sequenceDiagram\n    autonumber 10 10\n    A->>B: hi\n'
    const result = applyEdit(source, sequenceParser, { type: 'set-autonumber', enabled: true, start: null, step: null })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toBe('sequenceDiagram\n    autonumber\n    A->>B: hi\n')
  })

  it('set-autonumber 开 + 参数：无 autonumber 行时插到 header 后并带参数', () => {
    const source = 'sequenceDiagram\n    A->>B: hi\n'
    const result = applyEdit(source, sequenceParser, { type: 'set-autonumber', enabled: true, start: '5' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toBe('sequenceDiagram\nautonumber 5\n    A->>B: hi\n')
  })

  it('set-autonumber 关：删除带参数的行，其余逐字不变', () => {
    const source = 'sequenceDiagram\n    %% 注释\n    autonumber 10 10\n    A->>B: hi\n'
    const result = applyEdit(source, sequenceParser, { type: 'set-autonumber', enabled: false })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).not.toContain('autonumber')
    expect(result.source).toContain('%% 注释')
    expect(result.source).toContain('A->>B: hi')
  })
})

// ---------- activation 的 actorId 可写回（工单 08） ----------

describe('activate / deactivate 的 actorId 可写回（工单 08）', () => {
  it('rename-participant：activate / deactivate 行一并改名', () => {
    const source = `sequenceDiagram
    participant A
    activate A
    A->>B: hi
    deactivate A
`
    const result = applyEdit(source, sequenceParser, { type: 'rename-participant', actorId: 'A', newId: 'Client' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('participant Client')
    expect(result.source).toContain('    activate Client\n')
    expect(result.source).toContain('    deactivate Client\n')
    expect(result.source).not.toMatch(/\bA\b/)
  })

  it('rename-participant：activate 行内空白逐字保留', () => {
    const source = 'sequenceDiagram\n    participant A\n    activate   A\n'
    const result = applyEdit(source, sequenceParser, { type: 'rename-participant', actorId: 'A', newId: 'Client' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('activate   Client')
  })
})

// ---------- note 参与者集合可写回（工单 08） ----------

describe('note 参与者集合可写回（工单 08）', () => {
  it('set-note actors：over 多参与者集合改写，文本与位置逐字保留', () => {
    const source = 'sequenceDiagram\n    Note over A,B: 一句说明\n'
    const result = applyEdit(source, sequenceParser, { type: 'set-note', elementId: 'note:1', actors: ['A', 'C'] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toBe('sequenceDiagram\n    Note over A,C: 一句说明\n')
  })

  it('set-note actors：解析不出（null）的 note 也能改成参与者集合', () => {
    const source = 'sequenceDiagram\n    Note over A B C: 说明\n'
    // 前提：三个带空格的 token 解析不出参与者 → actors 为 null
    expect(noteElements(source)[0]?.actors).toBeNull()
    const result = applyEdit(source, sequenceParser, { type: 'set-note', elementId: 'note:1', actors: ['A', 'B'] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toBe('sequenceDiagram\n    Note over A,B: 说明\n')
  })

  it('set-note actors 空数组：不落码（note 至少要有一个参与者）', () => {
    const source = 'sequenceDiagram\n    Note over A,B: 说明\n'
    expect(applyEdit(source, sequenceParser, { type: 'set-note', elementId: 'note:1', actors: [] }).ok).toBe(false)
  })
})

// ---------- direction 不在 sequence 的可编集合内（工单 07 的边界） ----------

/**
 * 工单 07 的 `direction` 只做 class：mermaid 12.0.0 的 sequenceDiagram **没有** `direction`
 * 语法（下面的 `mermaid.parse` 断言就是硬证据），源码里写它就是语法错误。
 * 因此不能给它做「可切换 / 可删除」的表单——那会产出非法源码。该行继续走
 * 「不解析、原样保留」的老路（ADR-0008）：编辑任何别的元素都不触碰它。
 */
describe('sequence 的 direction 仍原样保留（工单 07 的边界）', () => {
  it('mermaid 12 不接受 sequenceDiagram 的 direction', async () => {
    const mermaid = (await import('mermaid')).default
    await expect(mermaid.parse('sequenceDiagram\nA->>B: hi\n')).resolves.toBeTruthy()
    await expect(mermaid.parse('sequenceDiagram\ndirection LR\nA->>B: hi\n')).rejects.toBeTruthy()
  })

  it('direction 行不被解析，编辑其它元素时逐字保留', () => {
    const source = `sequenceDiagram
    direction LR
    participant 甲
    甲->>乙: hi
`
    const parsed = sequenceParser.parse(source)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(reassemble(parsed.doc)).toBe(source)
    expect(parsed.doc.elements.some((p) => p.element.kind === 'direction')).toBe(false)

    const result = applyEdit(source, sequenceParser, { type: 'set-participant', actorId: '甲', alias: 'Ali' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('    direction LR')
  })
})
