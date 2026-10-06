import { describe, expect, it } from 'vitest'
import { c4Parser } from '../../pipeline/c4'
import { buildC4Projection, c4KnownAliases, resolveC4Selection } from '../c4-projection'
import type { SourceDocument } from '../../pipeline/document'

/**
 * C4 投影测试（more-diagrams 工单 18，ADR-0008/0012/0016）：
 * 元素 / 边界名字即身份（`c4-element:<alias>` / `c4-boundary:<alias>`）、关系位置序身份
 * （`relation:N`）、边界归属（含 Deployment Node 嵌套）、`external` 标记、
 * 只读 extras（sprite / tags / link）透传、选中回落。
 */

function parse(source: string): SourceDocument {
  const result = c4Parser.parse(source)
  if (!result.ok) throw new Error(`解析失败：${result.error.message}`)
  return result.doc
}

const SAMPLE = `C4Context
    title 网上银行系统
    Person(customer, "个人客户", "使用网银的客户")
    System(banking, "网银系统", "核心业务系统")
    System_Ext(email, "邮件系统")
    Enterprise_Boundary(b0, "银行边界") {
        SystemDb(db, "客户数据库", "Oracle")
        System(dbUsed, "已用系统")
    }
    Rel(customer, banking, "访问", "HTTPS")
    Rel(banking, email, "发送通知", "SMTP", $descr="通过邮件网关")
    Rel_D(banking, db, "读写")
`

describe('buildC4Projection（more-diagrams 工单 18）', () => {
  it('keyword 取自声明头', () => {
    expect(buildC4Projection(parse(SAMPLE)).keyword).toBe('C4Context')
    expect(buildC4Projection(parse('C4Deployment\n')).keyword).toBe('C4Deployment')
  })

  it('元素名字即身份 `c4-element:<alias>`（文档序），宏 / 种类 / 变体透传', () => {
    const p = buildC4Projection(parse(SAMPLE))
    expect(p.elements.map((e) => e.elementId)).toEqual([
      'c4-element:customer',
      'c4-element:banking',
      'c4-element:email',
      'c4-element:db',
      'c4-element:dbUsed',
    ])
    expect(p.elements.map((e) => e.macro)).toEqual(['Person', 'System', 'System_Ext', 'SystemDb', 'System'])
    expect(p.elements.map((e) => e.elementKind)).toEqual(['person', 'system', 'system', 'system', 'system'])
    expect(p.elements.map((e) => e.variant)).toEqual(['', '', '_Ext', 'Db', ''])
  })

  it('label 剥离引号；无 label 回落 alias（hasLabel 区分）', () => {
    const p = buildC4Projection(parse('C4Context\n    System(a, "有标签")\n    System(b)\n'))
    const a = p.elements.find((e) => e.elementId === 'c4-element:a')!
    const b = p.elements.find((e) => e.elementId === 'c4-element:b')!
    expect(a.label).toBe('有标签')
    expect(a.hasLabel).toBe(true)
    expect(b.label).toBe('b')
    expect(b.hasLabel).toBe(false)
  })

  it('techn / descr 与只读 extras（sprite / tags / link）透传', () => {
    const p = buildC4Projection(
      parse('C4Container\n    Container(api, "API", "Go", "接口层", "sprite1", "tag1", $link="https://x")\n'),
    )
    expect(p.elements[0]).toMatchObject({
      alias: 'api',
      techn: 'Go',
      descr: '接口层',
      sprite: 'sprite1',
      tags: 'tag1',
      link: 'https://x',
    })
  })

  it('Person / System 家族无 techn 位（第 3 位是 descr）', () => {
    const p = buildC4Projection(parse('C4Context\n    Person(a, "A", "描述")\n'))
    expect(p.elements[0]).toMatchObject({ techn: null, descr: '描述' })
  })

  it('external：`_Ext` 变体（含 `Db_Ext` / `Queue_Ext`）为 true', () => {
    const p = buildC4Projection(
      parse('C4Context\n    System_Ext(a, "A")\n    SystemDb_Ext(b, "B")\n    SystemQueue_Ext(c, "C")\n    System(d, "D")\n'),
    )
    expect(p.elements.map((e) => e.external)).toEqual([true, true, true, false])
  })

  it('边界名字即身份 `c4-boundary:<alias>`；boundaryKind / techn / memberCount 透传', () => {
    const p = buildC4Projection(parse(SAMPLE))
    expect(p.boundaries.map((b) => b.elementId)).toEqual(['c4-boundary:b0'])
    const b0 = p.boundaries[0]
    expect(b0).toMatchObject({
      macro: 'Enterprise_Boundary',
      boundaryKind: 'enterprise',
      alias: 'b0',
      label: '银行边界',
      hasLabel: true,
      memberCount: 2,
    })
  })

  it('Deployment Node 也是边界（boundaryKind = deployment）且可嵌套（parentAlias）', () => {
    const p = buildC4Projection(
      parse('C4Deployment\n    Deployment_Node(dc, "机房", "类型") {\n        Node(n, "节点") {\n            System(s, "S")\n        }\n    }\n'),
    )
    expect(p.boundaries.map((b) => b.boundaryKind)).toEqual(['deployment', 'deployment'])
    expect(p.boundaries.map((b) => b.parentAlias)).toEqual([null, 'dc'])
    expect(p.boundaries[0]?.techn).toBe('类型')
    expect(p.boundaries[0]?.memberCount).toBe(0)
    expect(p.boundaries[1]?.memberCount).toBe(1)
  })

  it('边界内元素带 boundaryAlias，顶层元素 null', () => {
    const p = buildC4Projection(parse(SAMPLE))
    const byId = (id: string) => p.elements.find((e) => e.elementId === id)
    expect(byId('c4-element:db')!.boundaryAlias).toBe('b0')
    expect(byId('c4-element:dbUsed')!.boundaryAlias).toBe('b0')
    expect(byId('c4-element:banking')!.boundaryAlias).toBeNull()
  })

  it('关系位置序身份 `relation:N`（1 基文档序），端点 / 方向 / 宏透传', () => {
    const p = buildC4Projection(parse(SAMPLE))
    expect(p.relations.map((r) => r.elementId)).toEqual(['relation:1', 'relation:2', 'relation:3'])
    expect(p.relations[0]).toMatchObject({
      macro: 'Rel',
      from: 'customer',
      to: 'banking',
      label: '访问',
      techn: 'HTTPS',
      direction: 'default',
    })
    // 命名参数 descr 透传
    expect(p.relations[1]).toMatchObject({ label: '发送通知', techn: 'SMTP', descr: '通过邮件网关' })
    // 方向别名透传到 direction
    expect(p.relations[2]).toMatchObject({ macro: 'Rel_D', direction: 'D' })
  })

  it('BiRel / Rel_Back 标记与 RelIndex 的 indexRaw 透传', () => {
    const p = buildC4Projection(
      parse('C4Context\n    System(a, "A")\n    System(b, "B")\n    BiRel(a, b, "双向")\n    Rel_Back(a, b, "反向")\n    RelIndex(5, a, b, "有序")\n'),
    )
    expect(p.relations.map((r) => r.bidirectional)).toEqual([true, false, false])
    expect(p.relations.map((r) => r.reversed)).toEqual([false, true, false])
    expect(p.relations[2]).toMatchObject({ indexed: true, indexRaw: '5', label: '有序' })
    expect(p.relations[0]?.indexRaw).toBeNull()
  })

  it('悬空引用端点不凭空造元素（投影只反映源码声明）', () => {
    const p = buildC4Projection(parse('C4Context\n    System(a, "A")\n    Rel(a, nowhere, "悬空")\n'))
    expect(p.elements.map((e) => e.elementId)).toEqual(['c4-element:a'])
    expect(p.relations[0]).toMatchObject({ from: 'a', to: 'nowhere' })
  })

  it('nextRelationOrdinal = 关系总数 + 1', () => {
    expect(buildC4Projection(parse(SAMPLE)).nextRelationOrdinal).toBe(4)
    expect(buildC4Projection(parse('C4Context\n')).nextRelationOrdinal).toBe(1)
  })

  it('空图退化形态', () => {
    const p = buildC4Projection(parse('C4Context\n'))
    expect(p.keyword).toBe('C4Context')
    expect(p.elements).toEqual([])
    expect(p.boundaries).toEqual([])
    expect(p.relations).toEqual([])
  })
})

describe('c4KnownAliases（工单 18）', () => {
  it('边界 alias 在前、元素 alias 在后（供 Tab / 菜单避重）', () => {
    const p = buildC4Projection(parse(SAMPLE))
    expect(c4KnownAliases(p)).toEqual(['b0', 'customer', 'banking', 'email', 'db', 'dbUsed'])
  })

  it('空图的已知别名为空', () => {
    expect(c4KnownAliases(buildC4Projection(parse('C4Context\n')))).toEqual([])
  })
})

describe('resolveC4Selection（工单 18）', () => {
  const p = buildC4Projection(parse(SAMPLE))

  it('存在的元素 / 边界 / 关系选中原样返回；diagram 原样返回', () => {
    const el = { kind: 'c4-element', elementId: 'c4-element:banking' } as const
    expect(resolveC4Selection(p, el)).toEqual(el)
    const bd = { kind: 'c4-boundary', elementId: 'c4-boundary:b0' } as const
    expect(resolveC4Selection(p, bd)).toEqual(bd)
    const rel = { kind: 'c4-relation', elementId: 'relation:1' } as const
    expect(resolveC4Selection(p, rel)).toEqual(rel)
    expect(resolveC4Selection(p, { kind: 'diagram' })).toEqual({ kind: 'diagram' })
  })

  it('不存在的选中 / null / 别种选中 → null', () => {
    expect(resolveC4Selection(p, { kind: 'c4-element', elementId: 'c4-element:__不存在__' })).toBeNull()
    expect(resolveC4Selection(p, { kind: 'c4-boundary', elementId: 'c4-boundary:__不存在__' })).toBeNull()
    expect(resolveC4Selection(p, { kind: 'c4-relation', elementId: 'relation:99' })).toBeNull()
    // 跨 kind 误配（元素 id 冒充边界）也回落
    expect(resolveC4Selection(p, { kind: 'c4-boundary', elementId: 'c4-element:banking' })).toBeNull()
    expect(resolveC4Selection(p, null)).toBeNull()
    expect(resolveC4Selection(p, { kind: 'node', nodeId: 'n1' })).toBeNull()
    expect(resolveC4Selection(p, { kind: 'state', id: 'n1' })).toBeNull()
  })
})
