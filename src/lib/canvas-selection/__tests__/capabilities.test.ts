import { describe, expect, it } from 'vitest'
import {
  CLASS_TEMPLATE,
  DIAGRAM_TYPES,
  KANBAN_TEMPLATE,
  MINDMAP_TEMPLATE,
  SEQUENCE_TEMPLATE,
  type AnyProjection,
} from '../../diagram-registry'
import { DEFAULT_DIAGRAM_SOURCE } from '../../storage'
import { capabilitiesOf } from '../capabilities'
import { classDataIdResolver } from '../class-adapter'
import { sequenceDataIdResolver } from '../sequence-adapter'
import { kanbanDataIdResolver } from '../kanban-adapter'
import type { Selection } from '../../projection/selection'

/**
 * 画布能力包查表测试（工单 04）：图种 × 能力，断言无 undefined 遗漏；
 * 尤其是可选成员 edgeAnnotator——无位置序连线的图种（含 kanban）必须没有。
 * 另含 class / sequence / kanban adapter 的 resolver 对照行为。
 */

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const SOURCES = {
  flowchart: DEFAULT_DIAGRAM_SOURCE,
  sequence: SEQUENCE_TEMPLATE,
  class: CLASS_TEMPLATE,
  mindmap: MINDMAP_TEMPLATE,
  kanban: KANBAN_TEMPLATE,
} as const

function projectionOf(type: keyof typeof SOURCES): AnyProjection {
  const registration = DIAGRAM_TYPES[type]
  const parsed = registration.parser.parse(SOURCES[type])
  if (!parsed.ok) throw new Error(`模板必须可解析：${type}`)
  return registration.buildProjection(parsed.doc)
}

const TYPES = ['flowchart', 'sequence', 'class', 'mindmap', 'kanban'] as const

describe('capabilitiesOf：5 图种 × 8 能力查表（工单 04 + architecture-deepening-2 工单 03）', () => {
  for (const type of TYPES) {
    it(`${type}：八项能力齐备（edgeAnnotator 按图种有无位置序连线）`, () => {
      const projection = projectionOf(type)
      const caps = capabilitiesOf(projection)

      // 查表命中注册表实例（registry 只持引用）
      expect(caps).toBe(DIAGRAM_TYPES[type].canvas)

      const resolver = caps.dataIdResolver(projection)
      expect(typeof resolver).toBe('function')
      expect(typeof caps.toSelection).toBe('function')
      expect(typeof caps.canvasIdOf).toBe('function')
      expect(typeof caps.navigationIds).toBe('function')

      const keyboard = caps.keyboardProjection(projection)
      expect(keyboard.kind).toBe(type)

      expect(typeof caps.resolveSelection).toBe('function')
      expect(typeof caps.deleteIntent).toBe('function')

      const hasOrdinalEdges = type === 'class' || type === 'sequence'
      if (hasOrdinalEdges) {
        expect(typeof caps.edgeAnnotator).toBe('function')
        expect(typeof caps.edgeAnnotator?.(projection)).toBe('function')
      } else {
        // 可选成员正是最容易漏的地方：无位置序连线的图种不得实现
        expect(caps.edgeAnnotator).toBeUndefined()
      }
    })

    it(`${type}：导航 id ↔ 选中 ↔ data-id 往返一致（投影顺序首元素）`, () => {
      const projection = projectionOf(type)
      const caps = capabilitiesOf(projection)
      const ids = caps.navigationIds(projection)
      expect(ids.length).toBeGreaterThan(0)

      const resolver = caps.dataIdResolver(projection)
      const canvas = resolver(ids[0])
      if (canvas === null) throw new Error('首元素必须可解析')
      const editorSelection = caps.toSelection(canvas)
      if (editorSelection === null) throw new Error('画布选中必须可映射为编辑器选中')
      expect(caps.canvasIdOf(projection, editorSelection)).toBe(ids[0])

      // 选中回落：存在的选中原样返回，不存在的落 null，null 进 null 出
      expect(caps.resolveSelection(projection, editorSelection)).toEqual(editorSelection)
      expect(caps.resolveSelection(projection, null)).toBeNull()
      const bogus: Selection = { kind: 'node', nodeId: '__不存在__' }
      expect(caps.resolveSelection(projection, bogus)).toBeNull()
    })
  }

  it('flowchart：navigationIds 即 nodes[].nodeId', () => {
    const projection = projectionOf('flowchart') as Extract<AnyProjection, { type: 'flowchart' }>
    expect(capabilitiesOf(projection).navigationIds(projection)).toEqual(
      projection.flowchart.nodes.map((n) => n.nodeId),
    )
  })

  it('mindmap：navigationIds 是 DOM id 形态（node_0 起），resolver 也认它', () => {
    const projection = projectionOf('mindmap') as Extract<AnyProjection, { type: 'mindmap' }>
    const ids = capabilitiesOf(projection).navigationIds(projection)
    expect(ids[0]).toBe('node_0')
    expect(capabilitiesOf(projection).dataIdResolver(projection)('node_0')).toEqual({
      kind: 'node',
      id: projection.mindmap.nodes[0].elementId,
    })
  })
})

describe('class/sequence adapter resolver 对照（与原 CanvasPanel.resolverOf 同约定）', () => {
  it('class：类名 → 节点选中，关系 elementId → 位置序选中，未知 → null', () => {
    const projection = projectionOf('class') as Extract<AnyProjection, { type: 'class' }>
    const resolve = classDataIdResolver(projection.class)
    const cls = projection.class.classes[0]
    expect(resolve(cls.name)).toEqual({ kind: 'node', id: cls.name })
    const relation = projection.class.relations[0]
    expect(resolve(relation.elementId)).toEqual({ kind: 'element', elementId: relation.elementId })
    expect(resolve('__nope__')).toBeNull()
  })

  it('sequence：actorId → 节点选中，消息/注释/块 elementId → 位置序选中，未知 → null', () => {
    const projection = projectionOf('sequence') as Extract<AnyProjection, { type: 'sequence' }>
    const resolve = sequenceDataIdResolver(projection.sequence)
    const participant = projection.sequence.participants[0]
    expect(resolve(participant.actorId)).toEqual({ kind: 'node', id: participant.actorId })
    const message = projection.sequence.messages[0]
    expect(resolve(message.elementId)).toEqual({ kind: 'element', elementId: message.elementId })
    const note = projection.sequence.notes[0]
    expect(resolve(note.elementId)).toEqual({ kind: 'element', elementId: note.elementId })
    const block = projection.sequence.blocks.find((b) => b.keyword !== 'else' && b.keyword !== 'and')
    if (block === undefined) throw new Error('模板必须含 block-open')
    expect(resolve(block.elementId)).toEqual({ kind: 'element', elementId: block.elementId })
    expect(resolve('__nope__')).toBeNull()
  })

  it('kanban：列 / 卡片的节点 id → 节点选中（带 elementId 前缀），未知 → null', () => {
    const projection = projectionOf('kanban') as Extract<AnyProjection, { type: 'kanban' }>
    const resolve = kanbanDataIdResolver(projection.kanban)
    const column = projection.kanban.columns[0]
    expect(resolve(column.id)).toEqual({ kind: 'node', id: column.elementId })
    const card = projection.kanban.cards[0]
    expect(resolve(card.id)).toEqual({ kind: 'node', id: card.elementId })
    expect(resolve('__nope__')).toBeNull()
  })
})
