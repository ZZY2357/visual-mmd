import { describe, expect, it } from 'vitest'
import { usecaseParser } from '../../pipeline/usecase'
import {
  buildUsecaseProjection,
  deriveUsecaseId,
  resolveUsecaseSelection,
  usecaseNodeIds,
} from '../usecase-projection'
import type { SourceDocument } from '../../pipeline/document'

/**
 * usecase 投影测试（more-diagrams 工单 26）：节点名字即身份、关系位置序身份、
 * 系统边界归属、关系种类分层（含 `: include` / `: extend` 标签，research §43）、
 * data-id 对齐（research §4 实测）、选中回落。
 *
 * 语法事实以 mermaid 实测 DB 为准：`actor Admin("Administrator")` 的 id 是前导标识符
 * `Admin`（标签只是别名），`"Reset password"` 无前导标识符时才由标签推导 id。
 */

function parse(source: string): SourceDocument {
  const result = usecaseParser.parse(source)
  if (!result.ok) throw new Error(`解析失败：${result.error.message}`)
  return result.doc
}

const SAMPLE = `usecase-beta
    actor Customer
    actor Admin("Administrator")
    Browse("Browse Products")
    Checkout("Checkout")
    Customer --> Browse
    Customer --> Checkout
    Checkout ..> : include Pay
    Pay("Pay")
    Admin --|> Customer
    systemBoundary shop["Online Shop"] {
      Gateway("Pay Gateway")
    }
    note for Customer "常客"
`

describe('buildUsecaseProjection（more-diagrams 工单 26）', () => {
  it('节点名字即身份：actor / 用例 / 边界 / note（文档序）', () => {
    const p = buildUsecaseProjection(parse(SAMPLE))
    expect(p.nodes.map((n) => n.elementId)).toEqual([
      'actor:Customer',
      'actor:Admin',
      'usecase:Browse',
      'usecase:Checkout',
      'usecase:Pay',
      'boundary:shop',
      'usecase:Gateway',
      'note:1',
    ])
    expect(p.nodes.map((n) => n.nodeKind)).toEqual([
      'actor',
      'actor',
      'usecase',
      'usecase',
      'usecase',
      'boundary',
      'usecase',
      'note',
    ])
  })

  it('关系位置序身份 `relation:N`，ordinal 从 1 起、dataId = `edge-${ordinal}`（research §4 实测）', () => {
    const p = buildUsecaseProjection(parse(SAMPLE))
    expect(p.relations.map((r) => r.elementId)).toEqual(['relation:1', 'relation:2', 'relation:3', 'relation:4'])
    expect(p.relations.map((r) => r.ordinal)).toEqual([1, 2, 3, 4])
    expect(p.relations.map((r) => r.dataId)).toEqual(['edge-1', 'edge-2', 'edge-3', 'edge-4'])
  })

  it('关系端点 / 算子逐字保留，label 剥离引号 / `:` 前缀（无标签为 null）', () => {
    const p = buildUsecaseProjection(parse(SAMPLE))
    expect(p.relations[0]).toMatchObject({
      source: 'Customer',
      target: 'Browse',
      operator: '-->',
      label: null,
    })
    expect(p.relations[2]).toMatchObject({
      source: 'Checkout',
      target: 'Pay',
      operator: '..>',
      label: 'include',
    })
  })

  it('关系种类分层：`: include` → include、`: extend` → extend、`--|>` → generalization、实心 → assoc', () => {
    const p = buildUsecaseProjection(parse(SAMPLE))
    expect(p.relations.map((r) => r.relationKind)).toEqual(['assoc', 'assoc', 'include', 'generalization'])
    const q = buildUsecaseProjection(
      parse('usecase-beta\n    a --x b\n    c ..> : extend d\n    e --|> f\n'),
    )
    expect(q.relations.map((r) => r.relationKind)).toEqual(['assoc', 'extend', 'generalization'])
  })

  it('节点标签剥离引号；无标签回落为 id；别名不改 id', () => {
    const p = buildUsecaseProjection(parse(SAMPLE))
    const byId = (id: string) => p.nodes.find((n) => n.elementId === id)
    expect(byId('actor:Customer')!.label).toBe('Customer')
    // actor Admin("Administrator")：id 是 Admin，标签是派生显示名
    expect(byId('actor:Admin')!.label).toBe('Administrator')
    expect(byId('usecase:Browse')!.label).toBe('Browse Products')
    // 无标签 → 回落 id
    expect(byId('usecase:Checkout')!.label).toBe('Checkout')
  })

  it('无前导标识符的引号声明：id 由标签推导（`"Reset password"` → `Reset_password`）', () => {
    const p = buildUsecaseProjection(parse('usecase-beta\n    "Reset password"\n'))
    const derived = p.nodes.find((n) => n.nodeKind === 'usecase')!
    expect(derived.id).toBe('Reset_password')
    expect(derived.id).toBe(deriveUsecaseId('Reset password'))
    expect(derived.dataId).toBe('Reset_password')
    expect(derived.label).toBe('Reset password')
  })

  it('系统边界归属：边界内声明挂 boundaryId，边界外为 null', () => {
    const p = buildUsecaseProjection(parse(SAMPLE))
    const byId = (id: string) => p.nodes.find((n) => n.elementId === id)
    expect(byId('boundary:shop')!.boundaryId).toBeNull()
    expect(byId('usecase:Gateway')!.boundaryId).toBe('shop')
    expect(byId('usecase:Browse')!.boundaryId).toBeNull()
    expect(p.boundaries.map((b) => b.elementId)).toEqual(['boundary:shop'])
  })

  it('悬空引用端点不凭空造节点（投影只反映源码声明）', () => {
    const q = buildUsecaseProjection(parse('usecase-beta\n    actor A\n    A --> Nowhere\n'))
    expect(q.nodes.map((n) => n.elementId)).toEqual(['actor:A'])
    expect(q.relations[0]).toMatchObject({ source: 'A', target: 'Nowhere', relationKind: 'assoc' })
  })

  it('形状：显式 `rect` 声明保留；actor / 边界 / note 恒 ellipse', () => {
    const p = buildUsecaseProjection(parse('usecase-beta\n    actor A\n    B[Report]\n'))
    expect(p.nodes.find((n) => n.elementId === 'usecase:B')!.shape).toBe('rect')
    expect(p.nodes.find((n) => n.nodeKind === 'actor')!.shape).toBe('ellipse')
  })

  it('nextRelationOrdinal = 关系总数 + 1', () => {
    const p = buildUsecaseProjection(parse(SAMPLE))
    expect(p.nextRelationOrdinal).toBe(5)
    expect(buildUsecaseProjection(parse('usecase-beta\n')).nextRelationOrdinal).toBe(1)
  })

  it('空图退化形态', () => {
    const p = buildUsecaseProjection(parse('usecase-beta\n'))
    expect(p.nodes).toEqual([])
    expect(p.relations).toEqual([])
    expect(p.boundaries).toEqual([])
  })
})

describe('usecaseNodeIds / deriveUsecaseId 透传（工单 26）', () => {
  it('usecaseNodeIds 排掉边界，保留 actor / 用例 / note', () => {
    const p = buildUsecaseProjection(parse(SAMPLE))
    expect(usecaseNodeIds(p)).toEqual([
      'Customer',
      'Admin',
      'Browse',
      'Checkout',
      'Pay',
      'Gateway',
      '1',
    ])
  })

  it('deriveUsecaseId 与渲染器同口径（非词字符 → `_`）', () => {
    expect(deriveUsecaseId('Reset password')).toBe('Reset_password')
    expect(deriveUsecaseId('a-b.c')).toBe('a_b_c')
  })
})

describe('resolveUsecaseSelection（工单 26）', () => {
  const p = buildUsecaseProjection(parse(SAMPLE))

  it('存在的节点 / 关系选中原样返回；diagram 原样返回', () => {
    const actor = { kind: 'usecase-actor', elementId: 'actor:Customer' } as const
    expect(resolveUsecaseSelection(p, actor)).toEqual(actor)
    const uc = { kind: 'usecase-usecase', elementId: 'usecase:Browse' } as const
    expect(resolveUsecaseSelection(p, uc)).toEqual(uc)
    const bd = { kind: 'usecase-boundary', elementId: 'boundary:shop' } as const
    expect(resolveUsecaseSelection(p, bd)).toEqual(bd)
    const note = { kind: 'usecase-note', elementId: 'note:1' } as const
    expect(resolveUsecaseSelection(p, note)).toEqual(note)
    const rel = { kind: 'usecase-relation', elementId: 'relation:1' } as const
    expect(resolveUsecaseSelection(p, rel)).toEqual(rel)
    expect(resolveUsecaseSelection(p, { kind: 'diagram' })).toEqual({ kind: 'diagram' })
  })

  it('不存在的选中 / null / 别种选中 → null', () => {
    expect(resolveUsecaseSelection(p, { kind: 'usecase-actor', elementId: 'actor:__不存在__' })).toBeNull()
    expect(resolveUsecaseSelection(p, { kind: 'usecase-relation', elementId: 'relation:99' })).toBeNull()
    expect(resolveUsecaseSelection(p, null)).toBeNull()
    expect(resolveUsecaseSelection(p, { kind: 'node', nodeId: 'n1' })).toBeNull()
  })
})
