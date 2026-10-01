import { describe, expect, it } from 'vitest'
import {
  isValidZenumlId,
  isValidZenumlLabel,
  zenumlParser,
  type ZenumlAnnotationData,
  type ZenumlFragmentData,
  type ZenumlMessageData,
  type ZenumlParticipantData,
  type ZenumlTitleData,
} from '../zenuml'
import { reassemble, type SourceDocument } from '../document'

/**
 * zenuml 解析器测试（more-diagrams 工单 19，语法事实以
 * .scratch/more-diagrams/research/data-display.md §10 为准，工单 19 任务 0 已实测复核）。
 *
 * 关键实测事实（任务 0）：zenuml 是外部注册图种，mermaid 侧 `parser.parse` 是 **no-op**
 * （恒不抛），因此**解析合法性只能由本解析器负责**——本文件即该职责的回归锁。
 *
 * 覆盖：解析（verbatim identity）、身份（参与者名字即身份 / 消息位置序）、意图往返、
 * 逐字保留、非法源码 / 非法编辑边界。
 */

function parse(source: string): SourceDocument {
  const result = zenumlParser.parse(source)
  if (!result.ok) throw new Error(`解析失败：${result.error.message}（行 ${result.error.line}）`)
  return result.doc
}

/** 解析 → 应用意图 → 重组装 → 再解析（形状不变式由二次解析断言） */
function apply(doc: SourceDocument, intent: Parameters<typeof zenumlParser.resolveRewrites>[1]): SourceDocument {
  const rewrites = zenumlParser.resolveRewrites(doc, intent)
  if (rewrites === null) throw new Error(`意图被拒绝：${JSON.stringify(intent)}`)
  return parse(reassemble(doc, rewrites))
}

const SAMPLE = `zenuml
    title 下单流程
    participant Client as "客户端"
    @Database Server
    Client->Server.placeOrder(item)
    Server.checkStock()
    if (item.stock > 0) {
        Server.reserve()
    } else {
        Client.reject()
    }
    new Order(item)
    return ok
`

describe('zenuml 解析（more-diagrams 工单 19）', () => {
  it('verbatim identity：解析后不做修改再重组装，输出与输入逐字相同', () => {
    expect(reassemble(parse(SAMPLE))).toBe(SAMPLE)
  })

  it('声明头：必须以 zenuml 打头；大小写 / 尾随内容不认领', () => {
    expect(parse('zenuml\n    A.b()\n').elements[0]?.element.kind).toBe('zenuml-header')
    expect(parse('  zenuml  \n    A.b()\n').elements[0]?.element.kind).toBe('zenuml-header')
    expect(zenumlParser.parse('Zenuml\n').ok).toBe(false)
    expect(zenumlParser.parse('zenuml extra\n').ok).toBe(false)
    expect(zenumlParser.parse('flowchart TD\n').ok).toBe(false)
  })

  it('缺表头：解析失败并报首行', () => {
    const result = zenumlParser.parse('participant A\n')
    if (result.ok) throw new Error('缺表头必须解析失败')
    expect(result.error.line).toBe(1)
  })

  it('participant 声明：id 即身份 `participant:<id>`；别名可带/不带引号', () => {
    const doc = parse('zenuml\n    participant Client as "客户端"\n    participant Server as Backend\n')
    const parts = doc.elements
      .filter((p) => p.element.kind === 'zenuml-participant')
      .map((p) => ({ id: p.id, element: p.element as ZenumlParticipantData }))
    expect(parts.map((p) => p.id)).toEqual(['participant:Client', 'participant:Server'])
    expect(parts[0]?.element.aliasRaw).toBe('"客户端"')
    expect(parts[1]?.element.aliasRaw).toBe('Backend')
  })

  it('消息形态：同步 `A.b()` / 异步 `A->B.m()` / `new A()` / `return v`，种类正确', () => {
    const doc = parse(
      'zenuml\n    A.b()\n    A->B.m(x)\n    new C()\n    return ok\n',
    )
    const msgs = doc.elements
      .filter((p) => p.element.kind === 'zenuml-message')
      .map((p) => ({ id: p.id, element: p.element as ZenumlMessageData }))
    expect(msgs.map((m) => m.id)).toEqual(['message:1', 'message:2', 'message:3', 'message:4'])
    expect(msgs.map((m) => m.element.messageKind)).toEqual(['sync', 'async', 'new', 'return'])
  })

  it('消息身份 = 位置序 message:N（ADR-0012）；from/to 端点解析正确', () => {
    const doc = parse('zenuml\n    Client->Server.placeOrder(item)\n    Server.checkStock()\n')
    const msgs = doc.elements
      .filter((p) => p.element.kind === 'zenuml-message')
      .map((p) => ({ id: p.id, element: p.element as ZenumlMessageData }))
    expect(msgs.map((m) => m.id)).toEqual(['message:1', 'message:2'])
    expect(msgs[0]?.element).toMatchObject({
      messageKind: 'async',
      from: 'Client',
      to: 'Server',
      operator: '->',
      method: 'placeOrder',
      argsRaw: '(item)',
    })
    // 同步：from = A，to = null（无显式接收方）
    expect(msgs[1]?.element).toMatchObject({ messageKind: 'sync', from: 'Server', to: null, method: 'checkStock' })
  })

  it('赋值前缀 `const r = A.b()` 逐字保留在 assignPrefix', () => {
    const doc = parse('zenuml\n    const r = A.fetch()\n')
    const msg = doc.elements.find((p) => p.element.kind === 'zenuml-message')?.element as ZenumlMessageData
    expect(msg.assignPrefix).toBe('const r = ')
    expect(msg.method).toBe('fetch')
    expect(reassemble(doc)).toBe('zenuml\n    const r = A.fetch()\n')
  })

  it('注解行 `@Actor A` / `@Database Db` 解析（单行形态）', () => {
    const doc = parse('zenuml\n    @Actor Client\n    @Database Db\n')
    const anns = doc.elements
      .filter((p) => p.element.kind === 'zenuml-annotation')
      .map((p) => p.element as ZenumlAnnotationData)
    expect(anns.map((a) => a.annotation)).toEqual(['Actor', 'Database'])
    expect(anns.map((a) => a.target)).toEqual(['Client', 'Db'])
  })

  it('片段开行：关键字与条件解析；闭合成 fragment-end', () => {
    const doc = parse('zenuml\n    if (x > 0) {\n        A.b()\n    }\n')
    const frag = doc.elements.find((p) => p.element.kind === 'zenuml-fragment')?.element as ZenumlFragmentData
    expect(frag.keyword).toBe('if')
    expect(frag.conditionRaw.trim()).toBe('(x > 0)')
    expect(doc.elements.some((p) => p.element.kind === 'zenuml-fragment-end')).toBe(true)
  })

  it('片段关键字族：if / else / else if / while / for / forEach / loop / opt / par / try / catch / finally', () => {
    const src = `zenuml
    if (a) {
        A.b()
    } else if (b) {
        A.c()
    } else {
        A.d()
    }
    while (c) {
        A.e()
    }
    for (i) {
        A.f()
    }
    forEach (x) {
        A.g()
    }
    loop (3) {
        A.h()
    }
    opt {
        A.i()
    }
    par {
        A.j()
    }
    try {
        A.k()
    } catch {
        A.l()
    } finally {
        A.m()
    }
`
    const doc = parse(src)
    const keywords = doc.elements
      .filter((p) => p.element.kind === 'zenuml-fragment')
      .map((p) => (p.element as ZenumlFragmentData).keyword)
    expect(keywords).toEqual([
      'if',
      'else if',
      'else',
      'while',
      'for',
      'forEach',
      'loop',
      'opt',
      'par',
      'try',
      'catch',
      'finally',
    ])
    expect(reassemble(doc)).toBe(src)
  })

  it('brace 风格续开 `} else if {` / `} else {` / `} catch {` / `} finally {` 识别为独立片段', () => {
    const src = `zenuml
    if (a) {
        A.b()
    } else if (b) {
        A.c()
    } else {
        A.d()
    }
    try {
        A.e()
    } catch {
        A.f()
    } finally {
        A.g()
    }
`
    const doc = parse(src)
    const keywords = doc.elements
      .filter((p) => p.element.kind === 'zenuml-fragment')
      .map((p) => (p.element as ZenumlFragmentData).keyword)
    // 同行闭合的 `}` 先弹栈、续开关键字再入栈；6 个片段各自成立
    expect(keywords).toEqual(['if', 'else if', 'else', 'try', 'catch', 'finally'])
    expect(reassemble(doc)).toBe(src)
  })

  it('title 行解析', () => {
    const doc = parse('zenuml\n    title 下单流程\n    A.b()\n')
    const title = doc.elements.find((p) => p.element.kind === 'zenuml-title')?.element as ZenumlTitleData
    expect(title?.value).toBe('下单流程')
  })

  it('逐字保留：`// comment` 注释 / 空行 / 无法识别的行不进元素', () => {
    const src = `zenuml
    // 一行注释
    A.b()

    @Database Db {
        someBlockBody
    }
`
    const doc = parse(src)
    expect(reassemble(doc)).toBe(src)
    // 注释 / 空行不进元素；块形态注解 `@X Y { … }` 整体不解析（首行不认领、闭合 `}` 记为 brace-end 逐字保留）
    const kinds = doc.elements.map((p) => p.element.kind)
    expect(kinds).toContain('zenuml-header')
    expect(kinds).toContain('zenuml-message')
    expect(kinds).not.toContain('zenuml-annotation')
    expect(kinds).not.toContain('zenuml-fragment')
  })

  it('行尾 `// comment` 归 tail 逐字保留、不破坏解析', () => {
    const src = 'zenuml\n    A.b() // 调用\n'
    const doc = parse(src)
    const msg = doc.elements.find((p) => p.element.kind === 'zenuml-message')?.element as ZenumlMessageData
    expect(msg.method).toBe('b')
    expect(msg.tail.trim()).toBe('// 调用')
    expect(reassemble(doc)).toBe(src)
  })

  it('frontmatter 整块跳过、逐字保留', () => {
    const src = '---\ntitle: x\n---\nzenuml\n    A.b()\n'
    const doc = parse(src)
    expect(reassemble(doc)).toBe(src)
    expect(doc.elements[0]?.element.kind).toBe('zenuml-header')
  })
})

describe('zenuml 意图往返（more-diagrams 工单 19）', () => {
  it('add-zenuml-participant：追加到文档末尾（无锚点）', () => {
    const doc = apply(parse(SAMPLE), { type: 'add-zenuml-participant', id: 'Logger', alias: '日志' })
    expect(doc.source).toContain('participant Logger as "日志"')
  })

  it('add-zenuml-participant：锚点为参与者时插在其后', () => {
    const doc = apply(parse(SAMPLE), {
      type: 'add-zenuml-participant',
      id: 'Logger',
      afterElementId: 'participant:Client',
    })
    const lines = doc.source.split('\n')
    const i = lines.findIndex((l) => l.includes('participant Logger'))
    expect(lines[i - 1]).toContain('participant Client')
  })

  it('add-zenuml-participant：非法 id / 非法别名被拒绝', () => {
    const doc = parse(SAMPLE)
    expect(zenumlParser.resolveRewrites(doc, { type: 'add-zenuml-participant', id: '1bad' })).toBeNull()
    expect(zenumlParser.resolveRewrites(doc, { type: 'add-zenuml-participant', id: 'Ok', alias: 'a\nb' })).toBeNull()
  })

  it('set-zenuml-participant-alias：改别名 / null 删别名段', () => {
    let doc = apply(parse(SAMPLE), {
      type: 'set-zenuml-participant-alias',
      elementId: 'participant:Client',
      alias: '顾客',
    })
    expect(doc.source).toContain('participant Client as "顾客"')
    doc = apply(doc, { type: 'set-zenuml-participant-alias', elementId: 'participant:Client', alias: null })
    expect(doc.source).toContain('\n    participant Client\n')
  })

  it('set-zenuml-participant-alias：空别名被拒绝', () => {
    const doc = parse(SAMPLE)
    expect(
      zenumlParser.resolveRewrites(doc, {
        type: 'set-zenuml-participant-alias',
        elementId: 'participant:Client',
        alias: '   ',
      }),
    ).toBeNull()
  })

  it('rename-zenuml-participant：连带重写消息端点引用（名字即身份）', () => {
    const doc = apply(parse(SAMPLE), { type: 'rename-zenuml-participant', elementId: 'participant:Client', id: 'Customer' })
    expect(doc.source).toContain('participant Customer as "客户端"')
    expect(doc.source).toContain('Customer->Server.placeOrder(item)')
    expect(doc.source).toContain('Customer.reject()') // 片段体内的 `Client.reject()` 也被重写
    expect(doc.source).not.toContain('Client->Server')
  })

  it('rename-zenuml-participant：未声明参与者（仅隐式端点）无声明行可改，拒绝', () => {
    // Server 只由 `@Database Server` 注解与消息端点引入，无 `participant Server` 声明行
    const doc = parse(SAMPLE)
    expect(zenumlParser.resolveRewrites(doc, { type: 'rename-zenuml-participant', elementId: 'participant:Server', id: 'Backend' })).toBeNull()
  })

  it('rename-zenuml-participant：非法 id / 同名被拒绝', () => {
    const doc = parse(SAMPLE)
    expect(zenumlParser.resolveRewrites(doc, { type: 'rename-zenuml-participant', elementId: 'participant:Client', id: '1bad' })).toBeNull()
    expect(zenumlParser.resolveRewrites(doc, { type: 'rename-zenuml-participant', elementId: 'participant:Client', id: 'Client' })).toBeNull()
  })

  it('add-zenuml-message：异步（from/to/method/args）', () => {
    const doc = apply(parse(SAMPLE), {
      type: 'add-zenuml-message',
      messageKind: 'async',
      from: 'Client',
      to: 'Server',
      method: 'pay',
      args: 'amount',
    })
    expect(doc.source).toContain('Client->Server.pay(amount)')
  })

  it('add-zenuml-message：同步 / new / return 各形态', () => {
    let doc = apply(parse(SAMPLE), { type: 'add-zenuml-message', messageKind: 'sync', from: 'A', method: 'run' })
    expect(doc.source).toContain('A.run()')
    doc = apply(doc, { type: 'add-zenuml-message', messageKind: 'new', to: 'Order', args: 'x' })
    expect(doc.source).toContain('new Order(x)')
    doc = apply(doc, { type: 'add-zenuml-message', messageKind: 'return', text: 'done' })
    expect(doc.source).toContain('return done')
  })

  it('add-zenuml-message：锚点为消息时插在其后（缩进跟随锚点行）', () => {
    const doc = apply(parse(SAMPLE), {
      type: 'add-zenuml-message',
      messageKind: 'async',
      from: 'Server',
      to: 'Client',
      method: 'notify',
      afterElementId: 'message:1',
    })
    const lines = doc.source.split('\n')
    const i = lines.findIndex((l) => l.includes('Server->Client.notify'))
    expect(lines[i - 1]).toContain('Client->Server.placeOrder')
  })

  it('add-zenuml-message：非法端点 / 非法方法名被拒绝', () => {
    const doc = parse(SAMPLE)
    expect(zenumlParser.resolveRewrites(doc, { type: 'add-zenuml-message', messageKind: 'sync', from: '1bad', method: 'run' })).toBeNull()
    expect(zenumlParser.resolveRewrites(doc, { type: 'add-zenuml-message', messageKind: 'async', from: 'A', to: '1bad', method: 'm' })).toBeNull()
    expect(zenumlParser.resolveRewrites(doc, { type: 'add-zenuml-message', messageKind: 'sync', from: 'A', method: '1bad' })).toBeNull()
    expect(zenumlParser.resolveRewrites(doc, { type: 'add-zenuml-message', messageKind: 'new', to: '1bad' })).toBeNull()
  })

  it('set-zenuml-message-text：改方法名与参数；只改本行', () => {
    const doc = apply(parse(SAMPLE), {
      type: 'set-zenuml-message-text',
      elementId: 'message:2',
      method: 'verifyStock',
      args: 'item',
    })
    expect(doc.source).toContain('Server.verifyStock(item)')
    expect(doc.source).toContain('Client->Server.placeOrder(item)') // 其它消息不变
  })

  it('set-zenuml-message-text：args 为 null = 清空参数', () => {
    const doc = apply(parse(SAMPLE), { type: 'set-zenuml-message-text', elementId: 'message:2', args: null })
    expect(doc.source).toContain('Server.checkStock')
    expect(doc.source).not.toContain('Server.checkStock()')
  })

  it('set-zenuml-message-text：非法方法名被拒绝', () => {
    const doc = parse(SAMPLE)
    expect(zenumlParser.resolveRewrites(doc, { type: 'set-zenuml-message-text', elementId: 'message:1', method: '1bad' })).toBeNull()
  })

  it('delete-zenuml-message：只删该消息行，其余逐字保留', () => {
    const doc = apply(parse(SAMPLE), { type: 'delete-zenuml-message', elementId: 'message:1' })
    expect(doc.source).not.toContain('placeOrder')
    expect(doc.source).toContain('Server.checkStock()')
    expect(doc.source).toContain('participant Client as "客户端"')
  })

  it('delete-zenuml-participant：只删声明行，消息端点的隐式引用不级联', () => {
    const doc = apply(parse(SAMPLE), { type: 'delete-zenuml-participant', elementId: 'participant:Client' })
    expect(doc.source).not.toContain('participant Client')
    expect(doc.source).toContain('Client->Server.placeOrder(item)') // 消息行是隐式端点持有者，不动
  })

  it('set-zenuml-title：无标题时紧随声明头插入；已有则原地改', () => {
    const doc = apply(parse('zenuml\n    A.b()\n'), { type: 'set-zenuml-title', text: '流程' })
    expect(doc.source).toContain('title 流程')
    expect(doc.source.indexOf('title 流程')).toBeLessThan(doc.source.indexOf('A.b()'))
    const doc2 = apply(parse(SAMPLE), { type: 'set-zenuml-title', text: '新流程' })
    expect(doc2.source).toContain('title 新流程')
    expect(doc2.source).not.toContain('title 下单流程')
  })

  it('set-zenuml-title：空文本 / 含换行 / 含 `//` 被拒绝', () => {
    const doc = parse(SAMPLE)
    expect(zenumlParser.resolveRewrites(doc, { type: 'set-zenuml-title', text: '  ' })).toBeNull()
    expect(zenumlParser.resolveRewrites(doc, { type: 'set-zenuml-title', text: 'a\nb' })).toBeNull()
    expect(zenumlParser.resolveRewrites(doc, { type: 'set-zenuml-title', text: 'a // b' })).toBeNull()
  })

  it('不适用意图返回 null（未知 type / 不存在的元素）', () => {
    const doc = parse(SAMPLE)
    expect(zenumlParser.resolveRewrites(doc, { type: 'nope' })).toBeNull()
    expect(zenumlParser.resolveRewrites(doc, { type: 'delete-zenuml-message', elementId: 'message:99' })).toBeNull()
    expect(zenumlParser.resolveRewrites(doc, { type: 'delete-zenuml-participant', elementId: 'participant:Ghost' })).toBeNull()
    expect(zenumlParser.resolveRewrites(doc, { type: 'set-zenuml-message-text', elementId: 'participant:Client' })).toBeNull()
  })
})

describe('zenuml 词法校验助手（表单侧）', () => {
  it('isValidZenumlId：裸标识符词法', () => {
    expect(isValidZenumlId('Client')).toBe(true)
    expect(isValidZenumlId('_a-1')).toBe(true)
    expect(isValidZenumlId('1bad')).toBe(false)
    expect(isValidZenumlId('a b')).toBe(false)
  })

  it('isValidZenumlLabel：非空、不含换行', () => {
    expect(isValidZenumlLabel('客户端')).toBe(true)
    expect(isValidZenumlLabel('   ')).toBe(false)
    expect(isValidZenumlLabel('a\nb')).toBe(false)
  })
})
