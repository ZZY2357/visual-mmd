import { describe, expect, it } from 'vitest'
import { erParser } from '../../pipeline/er'
import { buildErProjection, resolveErSelection } from '../er-projection'

/**
 * er 投影测试（more-diagrams 工单 03，ADR-0016）：投影吃解析产物、
 * 实体归并 / 隐式实体、属性归属、关系位置序、选中回落。
 */

function parseOk(source: string) {
  const result = erParser.parse(source)
  if (!result.ok) throw new Error(`解析失败：${result.error.message}`)
  return buildErProjection(result.doc)
}

describe('buildErProjection', () => {
  it('实体 / 属性 / 关系与 direction 全部入投影', () => {
    const p = parseOk(`erDiagram
    direction LR

    CAR {
        string make PK "制造商"
        int? year
    }
    DRIVER

    CAR ||--|{ DRIVER : "drives"
    DRIVER }|..|{ CAR : insured
`)
    expect(p.direction).toBe('LR')
    expect(p.entities.map((e) => e.name)).toEqual(['CAR', 'DRIVER'])
    expect(p.entities[0]!.attributes.map((a) => a.name)).toEqual(['make', 'year'])
    expect(p.entities[0]!.attributes[0]).toMatchObject({ keys: ['PK'], comment: '制造商', nullable: false })
    expect(p.entities[0]!.attributes[1]).toMatchObject({ nullable: true, keys: [] })
    expect(p.relations).toMatchObject([
      { from: 'CAR', to: 'DRIVER', cardLeft: '||', line: 'identifying', cardRight: '|{', label: '"drives"' },
      { from: 'DRIVER', to: 'CAR', line: 'non-identifying', label: 'insured' },
    ])
    expect(p.relations.map((r) => r.elementId)).toEqual(['relation:1', 'relation:2'])
    expect(p.attributes.map((a) => a.elementId)).toEqual(['attr:1', 'attr:2'])
  })

  it('关系引用的隐式实体 elementId 为 null，被关系引用后归并到同一实体', () => {
    const p = parseOk('erDiagram\n    A ||--o{ B : has\n')
    expect(p.entities.map((e) => [e.name, e.elementId])).toEqual([
      ['A', null],
      ['B', null],
    ])
  })

  it('别名入投影；属性块的 tail 与属性锚点齐备（Tab 加属性预测用）', () => {
    const p = parseOk(`erDiagram
    CAR[汽车] {
        string make PK
        string model
    }
    TRUCK
`)
    const car = p.entities.find((e) => e.name === 'CAR')!
    expect(car.alias).toBe('汽车')
    expect(car.hasBlock).toBe(true)
    expect(car.attributes.map((a) => a.elementId)).toEqual(['attr:1', 'attr:2'])
    expect(car.attrAnchorElementId).toBe('attr:2')
    expect(car.nextAttrOrdinal).toBe(3)
    const truck = p.entities.find((e) => e.name === 'TRUCK')!
    expect(truck.hasBlock).toBe(false)
    expect(truck.attrAnchorElementId).toBe(truck.elementId)
    expect(truck.nextAttrOrdinal).toBe(3)
  })
})

describe('resolveErSelection：选中回落（ADR-0015）', () => {
  const projection = parseOk(`erDiagram
    CAR {
        string make PK
    }
    CAR ||--o{ DRIVER : has
`)

  it('现存的选中原样返回', () => {
    expect(resolveErSelection(projection, { kind: 'er-entity', name: 'CAR' })).toEqual({ kind: 'er-entity', name: 'CAR' })
    expect(resolveErSelection(projection, { kind: 'er-attribute', elementId: 'attr:1' })).toEqual({
      kind: 'er-attribute',
      elementId: 'attr:1',
    })
    expect(resolveErSelection(projection, { kind: 'er-relation', elementId: 'relation:1' })).not.toBeNull()
    expect(resolveErSelection(projection, { kind: 'diagram' })).toEqual({ kind: 'diagram' })
  })

  it('不存在的选中回落 null', () => {
    expect(resolveErSelection(projection, { kind: 'er-entity', name: 'GONE' })).toBeNull()
    expect(resolveErSelection(projection, { kind: 'er-attribute', elementId: 'attr:9' })).toBeNull()
    expect(resolveErSelection(projection, { kind: 'er-relation', elementId: 'relation:9' })).toBeNull()
    expect(resolveErSelection(projection, null)).toBeNull()
  })
})
