import { describe, expect, it } from 'vitest'
import {
  emEntityGroupOf,
  emNamespaceOf,
  emNameOf,
  emSwimlaneOfGroup,
  eventModelingParser,
  isEmEntityType,
  isValidEmDataName,
  isValidEmEntityIdentifier,
  isValidEmFrameId,
  type EmDataBlockData,
  type EmFrameData,
} from '../eventmodeling'
import { reassemble, type SourceDocument } from '../document'

/**
 * eventmodeling 解析器测试（more-diagrams 工单 28，语法事实以
 * .scratch/more-diagrams/research/event-modeling.md §8 为准——本次已实测复核）：
 * 解析（verbatim identity）、意图往返、逐字保留、非法源码 / 非法编辑边界。
 *
 * **重要更正**：声明关键字是**正文首行的裸 `eventmodeling`**（无 `-beta` 后缀），
 * **不是 frontmatter 声明式**（工单原假设作废，research §8.1 实测）。
 */

function parse(source: string): SourceDocument {
  const result = eventModelingParser.parse(source)
  if (!result.ok) throw new Error(`解析失败：${result.error.message}（行 ${result.error.line}）`)
  return result.doc
}

function apply(
  doc: SourceDocument,
  intent: Parameters<typeof eventModelingParser.resolveRewrites>[1],
): SourceDocument {
  const rewrites = eventModelingParser.resolveRewrites(doc, intent)
  if (rewrites === null) throw new Error(`意图被拒绝：${JSON.stringify(intent)}`)
  return parse(reassemble(doc, rewrites))
}

const SAMPLE = `eventmodeling

tf 01 ui CartUI
tf 02 cmd AddItem
tf 03 evt ItemAdded [[ItemAdded]]

data ItemAdded {
  description: string
  price: number
}
`

describe('eventmodeling 解析（more-diagrams 工单 28）', () => {
  it('verbatim identity：解析后不做修改再重组装，输出与输入逐字相同', () => {
    expect(reassemble(parse(SAMPLE))).toBe(SAMPLE)
  })

  it('声明头：只认裸关键字 eventmodeling（无 -beta 后缀）', () => {
    expect(parse('eventmodeling\n').elements[0]?.element.kind).toBe('eventmodeling-header')
    expect(eventModelingParser.parse('eventmodeling-beta\n').ok).toBe(false)
    expect(eventModelingParser.parse('EventModeling\n').ok).toBe(false)
  })

  it('缺表头：解析失败并报首行', () => {
    const result = eventModelingParser.parse('tf 01 ui CartUI\n')
    if (result.ok) throw new Error('缺表头必须解析失败')
    expect(result.error.line).toBe(1)
  })

  it('帧行：element id = `frame:N`（位置序，ADR-0012），字段逐字保留', () => {
    const doc = parse('eventmodeling\n\ntf 01 ui CartUI\ntf 02 cmd AddItem\n')
    const frames = doc.elements.filter((p) => p.element.kind === 'em-frame')
    expect(frames.map((p) => p.id)).toEqual(['frame:1', 'frame:2'])
    expect(frames[0]?.element).toMatchObject({
      keyword: 'tf',
      frameId: '01',
      entityType: 'ui',
      entityIdentifier: 'CartUI',
      sourceFrames: [],
      dataReference: null,
    })
  })

  it('帧行：关键字别名（tf / timeframe / rf / resetframe）+ 显式来源 `->>` 与数据块引用 `[[..]]`', () => {
    const doc = parse(
      'eventmodeling\n\ntf 1 ui A\ntimeframe 2 cmd B ->> 1\ntf 3 evt C ->> 1 ->> 2 [[D]]\nrf 4 evt E\ndata D {\n}\n',
    )
    const frames = doc.elements.filter((p) => p.element.kind === 'em-frame') as unknown as { element: EmFrameData }[]
    expect(frames[0]?.element.keyword).toBe('tf')
    expect(frames[1]?.element.keyword).toBe('timeframe')
    expect(frames[1]?.element.sourceFrames).toEqual(['1'])
    expect(frames[2]?.element.sourceFrames).toEqual(['1', '2'])
    expect(frames[2]?.element.dataReference).toBe('D')
    expect(frames[3]?.element.keyword).toBe('rf')
  })

  it('数据块：element id = `data:N`（位置序），名字 / 类型前缀 / 块体逐字保留（opaque）', () => {
    const doc = parse('eventmodeling\n\ndata ItemAdded {\n  price: number\n}\n')
    const blocks = doc.elements.filter((p) => p.element.kind === 'em-data') as unknown as { id: string; element: EmDataBlockData }[]
    expect(blocks.map((p) => p.id)).toEqual(['data:1'])
    expect(blocks[0]?.element.name).toBe('ItemAdded')
    expect(blocks[0]?.element.dataType).toBeNull()
    expect(blocks[0]?.element.raw).toBe('data ItemAdded {\n  price: number\n}\n')
  })

  it('数据块：反引号类型前缀（json 等）逐字保留', () => {
    const doc = parse('eventmodeling\n\ndata X `json`{\n  "a": 1\n}\n')
    const block = doc.elements.find((p) => p.element.kind === 'em-data')?.element as EmDataBlockData
    expect(block.dataType).toBe('json')
    expect(block.name).toBe('X')
  })

  it('非法帧号（4 位）/ 非法标识不被识别为帧行（逐字保留，不崩）', () => {
    const doc = parse('eventmodeling\n\ntf 1234 ui CartUI\n')
    expect(doc.elements.some((p) => p.element.kind === 'em-frame')).toBe(false)
    expect(reassemble(doc)).toContain('tf 1234 ui CartUI')
  })
})

describe('eventmodeling 词法助手（research §6 坑 8：按首个点切分）', () => {
  it('命名空间 = 首个点之前；名字 = 末个点之后', () => {
    expect(emNamespaceOf('Shop.Cart.AddItem')).toBe('Shop')
    expect(emNameOf('Shop.Cart.AddItem')).toBe('AddItem')
    expect(emNamespaceOf('Plain')).toBe('')
    expect(emNameOf('Plain')).toBe('Plain')
  })

  it('实体类型归一 → 泳道：ui→UI/Automation、pcr/cmd→Command|Processor、rmo→Read Model、evt→Events', () => {
    expect(emEntityGroupOf('ui')).toBe('ui')
    expect(emEntityGroupOf('pcr')).toBe('pcr')
    expect(emEntityGroupOf('processor')).toBe('pcr')
    expect(emEntityGroupOf('cmd')).toBe('cmd')
    expect(emEntityGroupOf('command')).toBe('cmd')
    expect(emEntityGroupOf('rmo')).toBe('rmo')
    expect(emEntityGroupOf('readmodel')).toBe('rmo')
    expect(emEntityGroupOf('evt')).toBe('evt')
    expect(emEntityGroupOf('event')).toBe('evt')
    expect(emSwimlaneOfGroup('ui')).toBe('ui')
    expect(emSwimlaneOfGroup('pcr')).toBe('ui')
    expect(emSwimlaneOfGroup('cmd')).toBe('crm')
    expect(emSwimlaneOfGroup('rmo')).toBe('crm')
    expect(emSwimlaneOfGroup('evt')).toBe('events')
  })

  it('词法校验：帧号 1–3 位 / 标识 / 数据块名', () => {
    expect(isValidEmFrameId('1')).toBe(true)
    expect(isValidEmFrameId('01')).toBe(true)
    expect(isValidEmFrameId('123')).toBe(true)
    expect(isValidEmFrameId('1234')).toBe(false)
    expect(isValidEmFrameId('0a')).toBe(false)
    expect(isValidEmEntityIdentifier('Shop.Cart')).toBe(true)
    expect(isValidEmEntityIdentifier('1Bad')).toBe(false)
    expect(isValidEmDataName('ItemAdded')).toBe(true)
    expect(isValidEmDataName('Item Added')).toBe(false)
    expect(isEmEntityType('evt')).toBe(true)
    expect(isEmEntityType('bogus')).toBe(false)
  })
})

describe('eventmodeling 意图往返（手术式改写，ADR-0008）', () => {
  it('set-em-frame：改帧号连带重写其他帧的 `->>` 引用', () => {
    const doc = parse('eventmodeling\n\ntf 1 ui A\ntf 2 cmd B ->> 1\n')
    const next = apply(doc, { type: 'set-em-frame', elementId: 'frame:1', frameId: '9' })
    expect(reassemble(next)).toContain('tf 9 ui A')
    expect(reassemble(next)).toContain('tf 2 cmd B ->> 9')
  })

  it('set-em-frame：改帧号连带重写 note / gwt 的帧号引用', () => {
    const doc = parse('eventmodeling\n\ntf 1 ui A\nnote 1 {\n  hi\n}\n')
    const next = apply(doc, { type: 'set-em-frame', elementId: 'frame:1', frameId: '7' })
    expect(reassemble(next)).toContain('note 7 {')
  })

  it('set-em-frame：改实体类型 / 标识 / 显式来源 / 数据块引用', () => {
    const doc = parse('eventmodeling\n\ntf 1 ui A\ndata D {\n}\n')
    const next = apply(doc, {
      type: 'set-em-frame',
      elementId: 'frame:1',
      entityType: 'evt',
      entityIdentifier: 'B',
      sourceFrames: [],
      dataReference: 'D',
    })
    expect(reassemble(next)).toContain('tf 1 evt B [[D]]')
  })

  it('set-em-data-name：只动名字 token，块体逐字保留', () => {
    const doc = parse('eventmodeling\n\ndata Old {\n  price: number\n}\n')
    const next = apply(doc, { type: 'set-em-data-name', elementId: 'data:1', name: 'New' })
    const out = reassemble(next)
    expect(out).toContain('data New {')
    expect(out).toContain('  price: number\n')
    expect(out).toContain('}')
  })

  it('add-em-frame：追加到文档末尾（缩进跟随首个帧行）', () => {
    const doc = parse('eventmodeling\n\ntf 1 ui A\n')
    const next = apply(doc, {
      type: 'add-em-frame',
      frameId: '2',
      entityType: 'evt',
      entityIdentifier: 'B',
    })
    expect(reassemble(next)).toContain('tf 2 evt B')
    expect(next.elements.some((p) => p.element.kind === 'em-frame')).toBe(true)
  })

  it('add-em-data：追加 `data <name> {` + 空体 + `}` 三行', () => {
    const doc = parse('eventmodeling\n\ntf 1 ui A\n')
    const next = apply(doc, { type: 'add-em-data', name: 'D' })
    expect(reassemble(next)).toContain('data D {\n}\n')
  })

  it('delete-em-frame：删除帧行', () => {
    const doc = parse('eventmodeling\n\ntf 1 ui A\ntf 2 cmd B\n')
    const next = apply(doc, { type: 'delete-em-frame', elementId: 'frame:2' })
    const frames = next.elements.filter((p) => p.element.kind === 'em-frame')
    expect(frames).toHaveLength(1)
    expect(frames[0]?.element).toMatchObject({ entityIdentifier: 'A' })
  })

  it('delete-em-data：删除整块', () => {
    const doc = parse('eventmodeling\n\ntf 1 ui A\ndata D {\n  x: number\n}\n')
    const next = apply(doc, { type: 'delete-em-data', elementId: 'data:1' })
    expect(next.elements.some((p) => p.element.kind === 'em-data')).toBe(false)
  })
})

describe('eventmodeling 非法编辑边界', () => {
  it('非法帧号 / 非法标识 / 非法数据块名被拒绝（返回 null）', () => {
    const doc = parse(SAMPLE)
    expect(eventModelingParser.resolveRewrites(doc, { type: 'set-em-frame', elementId: 'frame:1', frameId: '1234' })).toBeNull()
    expect(eventModelingParser.resolveRewrites(doc, { type: 'set-em-frame', elementId: 'frame:1', entityIdentifier: '1Bad' })).toBeNull()
    expect(eventModelingParser.resolveRewrites(doc, { type: 'add-em-data', name: 'bad name' })).toBeNull()
    expect(eventModelingParser.resolveRewrites(doc, { type: 'set-em-data-name', elementId: 'data:1', name: 'bad name' })).toBeNull()
  })

  it('不存在的 elementId / 错种元素被拒绝', () => {
    const doc = parse(SAMPLE)
    expect(eventModelingParser.resolveRewrites(doc, { type: 'delete-em-frame', elementId: 'frame:99' })).toBeNull()
    expect(eventModelingParser.resolveRewrites(doc, { type: 'delete-em-data', elementId: 'data:99' })).toBeNull()
    expect(eventModelingParser.resolveRewrites(doc, { type: 'set-em-data-name', elementId: 'frame:1', name: 'X' })).toBeNull()
  })

  it('无变化的编辑返回 null（不产生空快照）', () => {
    const doc = parse(SAMPLE)
    expect(eventModelingParser.resolveRewrites(doc, { type: 'set-em-frame', elementId: 'frame:1', frameId: '01' })).toBeNull()
    expect(eventModelingParser.resolveRewrites(doc, { type: 'set-em-data-name', elementId: 'data:1', name: 'ItemAdded' })).toBeNull()
  })
})
