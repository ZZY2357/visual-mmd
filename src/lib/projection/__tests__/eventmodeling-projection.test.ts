import { describe, expect, it } from 'vitest'
import { eventModelingParser } from '../../pipeline/eventmodeling'
import {
  buildEventModelingProjection,
  emFrameElementIdOf,
  resolveEventModelingSelection,
} from '../eventmodeling-projection'
import type { SourceDocument } from '../../pipeline/document'

/**
 * eventmodeling 投影测试（more-diagrams 工单 28）：帧 / 数据块位置序身份（ADR-0012）、
 * **默认关系推断**（research §3/§8.4，逐字对齐渲染器 `decidePositionRelation`）、
 * 泳道分组（research §8.5）、选中回落。
 */

function parse(source: string): SourceDocument {
  const result = eventModelingParser.parse(source)
  if (!result.ok) throw new Error(`解析失败：${result.error.message}`)
  return result.doc
}

const SAMPLE = `eventmodeling

tf 01 ui CartUI
tf 02 cmd AddItem
tf 03 evt ItemAdded [[ItemAdded]]
rf 04 cmd ClearCart
tf 05 evt CartCleared ->> 03

data ItemAdded {
  price: number
}
`

describe('buildEventModelingProjection（more-diagrams 工单 28）', () => {
  it('帧位置序身份 `frame:N` + 字段派生（泳道 / 命名空间 / 名字 / 是否重置帧）', () => {
    const p = buildEventModelingProjection(parse(SAMPLE))
    expect(p.frames.map((f) => f.elementId)).toEqual([
      'frame:1',
      'frame:2',
      'frame:3',
      'frame:4',
      'frame:5',
    ])
    expect(p.frames[0]).toMatchObject({
      frameId: '01',
      entityType: 'ui',
      group: 'ui',
      swimlane: 'ui',
      entityIdentifier: 'CartUI',
      namespace: '',
      name: 'CartUI',
      isReset: false,
    })
    expect(p.frames[3]).toMatchObject({ keyword: 'rf', isReset: true })
  })

  it('数据块位置序身份 `data:N` + 类型前缀 + 引用回填', () => {
    const p = buildEventModelingProjection(parse(SAMPLE))
    expect(p.dataBlocks.map((d) => d.elementId)).toEqual(['data:1'])
    expect(p.dataBlocks[0]).toMatchObject({ name: 'ItemAdded', dataType: null })
    expect(p.dataBlocks[0]?.referencedBy).toEqual(['frame:3'])
  })

  it('命名空间泳道标签：带命名空间加前缀 `UI/A: ` / `C/RM: ` / `Stream: `', () => {
    const p = buildEventModelingProjection(
      parse('eventmodeling\n\ntf 1 ui Shop.CartUI\ntf 2 cmd Shop.AddItem\ntf 3 evt Shop.ItemAdded\n'),
    )
    expect(p.frames[0]?.swimlaneLabel).toBe('UI/A: Shop')
    expect(p.frames[1]?.swimlaneLabel).toBe('C/RM: Shop')
    expect(p.frames[2]?.swimlaneLabel).toBe('Stream: Shop')
  })

  it('默认关系推断（research §8.4）：首帧 / 重置帧无入边；否则倒扫第一个异泳道帧', () => {
    const p = buildEventModelingProjection(parse(SAMPLE))
    // frame:1 首帧无入边；frame:4 是 rf 无入边
    expect(p.relations.find((r) => r.target === 'frame:1')).toBeUndefined()
    expect(p.relations.find((r) => r.target === 'frame:4')).toBeUndefined()
    // frame:2（crm）倒扫到 frame:1（ui，异泳道）→ inferred
    expect(p.relations.find((r) => r.target === 'frame:2')).toMatchObject({
      source: 'frame:1',
      origin: 'inferred',
      editable: false,
    })
    // frame:3（events）倒扫到 frame:2（crm，异泳道）→ inferred
    expect(p.relations.find((r) => r.target === 'frame:3')).toMatchObject({
      source: 'frame:2',
      origin: 'inferred',
      editable: false,
    })
  })

  it('显式来源 `->>` → origin=explicit、editable=true（来源 = 被引用帧）', () => {
    const p = buildEventModelingProjection(parse(SAMPLE))
    const explicit = p.relations.find((r) => r.target === 'frame:5')
    expect(explicit).toMatchObject({ source: 'frame:3', origin: 'explicit', editable: true })
  })

  it('泳道分组：按泳道带 + 命名空间归并为泳道（首次出现序）', () => {
    const p = buildEventModelingProjection(parse(SAMPLE))
    expect(p.swimlanes.map((s) => s.swimlane)).toEqual(['ui', 'crm', 'events'])
    expect(p.swimlanes[0]?.frames.map((f) => f.elementId)).toEqual(['frame:1'])
    expect(p.swimlanes[1]?.frames.map((f) => f.elementId)).toEqual(['frame:2', 'frame:4'])
    expect(p.swimlanes[2]?.frames.map((f) => f.elementId)).toEqual(['frame:3', 'frame:5'])
  })

  it('文档级声明行（entity / note / gwt）不进选中面，进 docLines', () => {
    const p = buildEventModelingProjection(
      parse('eventmodeling\nentity Shop.Cart\ntf 1 ui A\nnote 1 {\n  hi\n}\ngwt 1 given a when b then c\n'),
    )
    expect(p.docLines.map((d) => d.docKind)).toEqual(['entity', 'note', 'gwt'])
  })

  it('nextFrameOrdinal = 帧数 + 1', () => {
    const p = buildEventModelingProjection(parse(SAMPLE))
    expect(p.nextFrameOrdinal).toBe(6)
  })
})

describe('emFrameElementIdOf / resolveEventModelingSelection', () => {
  const p = buildEventModelingProjection(parse(SAMPLE))

  it('emFrameElementIdOf：帧号 → elementId；未声明返回 undefined', () => {
    expect(emFrameElementIdOf(p, '03')).toBe('frame:3')
    expect(emFrameElementIdOf(p, '99')).toBeUndefined()
  })

  it('resolveEventModelingSelection：存在原样返回，不存在 / 别种落 null', () => {
    expect(resolveEventModelingSelection(p, { kind: 'em-frame', elementId: 'frame:1' })).toEqual({
      kind: 'em-frame',
      elementId: 'frame:1',
    })
    expect(resolveEventModelingSelection(p, { kind: 'em-data', elementId: 'data:1' })).toEqual({
      kind: 'em-data',
      elementId: 'data:1',
    })
    expect(resolveEventModelingSelection(p, { kind: 'em-relation', elementId: 'relation:1' })).toEqual({
      kind: 'em-relation',
      elementId: 'relation:1',
    })
    expect(resolveEventModelingSelection(p, { kind: 'em-frame', elementId: 'frame:99' })).toBeNull()
    expect(resolveEventModelingSelection(p, { kind: 'node', nodeId: 'x' })).toBeNull()
    expect(resolveEventModelingSelection(p, null)).toBeNull()
    expect(resolveEventModelingSelection(p, { kind: 'diagram' })).toEqual({ kind: 'diagram' })
  })
})
