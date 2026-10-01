import { describe, expect, it } from 'vitest'
import { zenumlParser } from '../../pipeline/zenuml'
import { buildZenumlProjection, resolveZenumlSelection } from '../zenuml-projection'
import type { SourceDocument } from '../../pipeline/document'

/**
 * zenuml 投影测试（more-diagrams 工单 19）：参与者名字即身份 / 隐式合成、消息位置序身份
 * （ADR-0012）、片段位置序身份与嵌套归属、注解映射、标题、选中回落。
 *
 * 语法事实以 .scratch/more-diagrams/research/data-display.md §10 + 工单 19 任务 0 实测为准。
 */

function parse(source: string): SourceDocument {
  const result = zenumlParser.parse(source)
  if (!result.ok) throw new Error(`解析失败：${result.error.message}`)
  return result.doc
}

const SAMPLE = `zenuml
    title 下单流程
    participant Client as "客户端"
    participant Server as "服务端"
    @Database Server
    Client->Server.placeOrder(item)
    Server.checkStock()
    if (item.stock > 0) {
        Server.reserve()
        while (retry) {
            Server.retry()
        }
    } else {
        Client.reject()
    }
    new Order(item)
    return ok
`

describe('buildZenumlProjection（more-diagrams 工单 19）', () => {
  it('参与者名字即身份：显式声明文档序，隐式端点按首次出现补合成', () => {
    const p = buildZenumlProjection(parse(SAMPLE))
    // Client/Server 显式声明；Order（new 的构造类名）隐式合成
    expect(p.participants.map((q) => q.elementId)).toEqual([
      'participant:Client',
      'participant:Server',
      'participant:Order',
    ])
    expect(p.participants.map((q) => q.declared)).toEqual([true, true, false])
  })

  it('别名剥引号；无别名为 null（展示回落 id）', () => {
    const p = buildZenumlProjection(parse(SAMPLE))
    expect(p.participants[0]?.alias).toBe('客户端')
    expect(p.participants[1]?.alias).toBe('服务端')
  })

  it('注解行映射到参与者（`@Database Server` → Server.annotation）', () => {
    const p = buildZenumlProjection(parse(SAMPLE))
    const server = p.participants.find((q) => q.id === 'Server')
    expect(server?.annotation).toBe('Database')
    expect(p.participants.find((q) => q.id === 'Client')?.annotation).toBeNull()
  })

  it('消息位置序身份 message:N（ADR-0012），种类 / 端点 / label 正确', () => {
    const p = buildZenumlProjection(parse(SAMPLE))
    expect(p.messages.map((m) => m.elementId)).toEqual([
      'message:1',
      'message:2',
      'message:3',
      'message:4',
      'message:5',
      'message:6',
      'message:7',
    ])
    expect(p.messages[0]).toMatchObject({
      messageKind: 'async',
      from: 'Client',
      to: 'Server',
      method: 'placeOrder',
      label: 'Client->Server.placeOrder()',
    })
    expect(p.messages[1]).toMatchObject({ messageKind: 'sync', from: 'Server', to: null, method: 'checkStock' })
    expect(p.messages[5]).toMatchObject({ messageKind: 'new', from: null, to: 'Order', method: 'Order' })
    expect(p.messages[6]).toMatchObject({ messageKind: 'return', from: null, to: null })
  })

  it('片段位置序身份 fragment:N，关键字 / 条件解析', () => {
    const p = buildZenumlProjection(parse(SAMPLE))
    expect(p.fragments.map((f) => f.elementId)).toEqual(['fragment:1', 'fragment:2', 'fragment:3'])
    expect(p.fragments.map((f) => f.keyword)).toEqual(['if', 'while', 'else'])
    expect(p.fragments[0]?.condition).toBe('(item.stock > 0)')
  })

  it('片段嵌套：内层片段 parentFragmentId 指向外层；片体内消息带 parentFragmentId', () => {
    const p = buildZenumlProjection(parse(SAMPLE))
    expect(p.fragments[0]?.parentFragmentId).toBeNull()
    expect(p.fragments[1]?.parentFragmentId).toBe('fragment:1') // while 在 if 内
    expect(p.fragments[2]?.parentFragmentId).toBeNull() // else 属于 if 链的顶层续开
    // message:3 = Server.reserve()（if 内）；message:4 = Server.retry()（while 内）
    expect(p.messages[2]?.parentFragmentId).toBe('fragment:1')
    expect(p.messages[3]?.parentFragmentId).toBe('fragment:2')
    expect(p.messages[4]?.parentFragmentId).toBe('fragment:3')
    expect(p.messages[0]?.parentFragmentId).toBeNull()
  })

  it('片段 directMessageCount 只计直接消息（不含嵌套片段内的）', () => {
    const p = buildZenumlProjection(parse(SAMPLE))
    expect(p.fragments[0]?.directMessageCount).toBe(1) // Server.reserve()（while 内的不计）
    expect(p.fragments[1]?.directMessageCount).toBe(1) // Server.retry()
    expect(p.fragments[2]?.directMessageCount).toBe(1) // Client.reject()
  })

  it('title 提取；无标题为 null', () => {
    expect(buildZenumlProjection(parse(SAMPLE)).title).toBe('下单流程')
    expect(buildZenumlProjection(parse('zenuml\n    A.b()\n')).title).toBeNull()
  })

  it('nextMessageOrdinal / nextFragmentOrdinal = 总数 + 1', () => {
    const p = buildZenumlProjection(parse(SAMPLE))
    expect(p.nextMessageOrdinal).toBe(p.messages.length + 1)
    expect(p.nextFragmentOrdinal).toBe(p.fragments.length + 1)
  })
})

describe('resolveZenumlSelection（more-diagrams 工单 19）', () => {
  const projection = buildZenumlProjection(parse(SAMPLE))

  it('存在则原样返回（参与者 / 消息 / 片段）', () => {
    expect(resolveZenumlSelection(projection, { kind: 'diagram' })).toEqual({ kind: 'diagram' })
    expect(resolveZenumlSelection(projection, { kind: 'zenuml-participant', elementId: 'participant:Client' })).toEqual({
      kind: 'zenuml-participant',
      elementId: 'participant:Client',
    })
    expect(resolveZenumlSelection(projection, { kind: 'zenuml-message', elementId: 'message:1' })).toEqual({
      kind: 'zenuml-message',
      elementId: 'message:1',
    })
    expect(resolveZenumlSelection(projection, { kind: 'zenuml-fragment', elementId: 'fragment:1' })).toEqual({
      kind: 'zenuml-fragment',
      elementId: 'fragment:1',
    })
  })

  it('不存在回落 null；null / 别种选中也回落 null', () => {
    expect(resolveZenumlSelection(projection, null)).toBeNull()
    expect(resolveZenumlSelection(projection, { kind: 'zenuml-message', elementId: 'message:999' })).toBeNull()
    expect(resolveZenumlSelection(projection, { kind: 'zenuml-participant', elementId: 'participant:Ghost' })).toBeNull()
    expect(resolveZenumlSelection(projection, { kind: 'node', nodeId: 'A' })).toBeNull()
  })
})
