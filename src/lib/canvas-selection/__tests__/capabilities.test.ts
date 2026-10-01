import { describe, expect, it } from 'vitest'
import {
  BLOCK_TEMPLATE,
  ARCHITECTURE_TEMPLATE,
  CLASS_TEMPLATE,
  DIAGRAM_TYPES,
  KANBAN_TEMPLATE,
  MINDMAP_TEMPLATE,
  SANKEY_TEMPLATE,
  XYCHART_TEMPLATE,
  SEQUENCE_TEMPLATE,
  VENN_TEMPLATE,
  USECASE_TEMPLATE,
  C4_TEMPLATE,
  type AnyProjection,
} from '../../diagram-registry'
import { DEFAULT_DIAGRAM_SOURCE } from '../../storage'
import { capabilitiesOf } from '../capabilities'
import { c4CanvasCapabilities } from '../c4-adapter'
import { classDataIdResolver } from '../class-adapter'
import { sequenceDataIdResolver } from '../sequence-adapter'
import { kanbanDataIdResolver } from '../kanban-adapter'
import { blockDataIdResolver } from '../block-adapter'
import { sankeyDataIdResolver } from '../sankey-adapter'
import { xychartDataIdResolver } from '../xychart-adapter'
import type { Selection } from '../../projection/selection'

/**
 * 画布能力包查表测试（工单 04）：图种 × 能力，断言无 undefined 遗漏；
 * 尤其是可选成员 edgeAnnotator——无位置序连线的图种（含 kanban）必须没有。
 * 另含 class / sequence / kanban / block adapter 的 resolver 对照行为。
 */

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const SOURCES = {
  flowchart: DEFAULT_DIAGRAM_SOURCE,
  sequence: SEQUENCE_TEMPLATE,
  class: CLASS_TEMPLATE,
  mindmap: MINDMAP_TEMPLATE,
  kanban: KANBAN_TEMPLATE,
  block: BLOCK_TEMPLATE,
  sankey: SANKEY_TEMPLATE,
  xychart: XYCHART_TEMPLATE,
  architecture: ARCHITECTURE_TEMPLATE,
  venn: VENN_TEMPLATE,
  usecase: USECASE_TEMPLATE,
  c4: C4_TEMPLATE,
} as const

function projectionOf(type: keyof typeof SOURCES): AnyProjection {
  const registration = DIAGRAM_TYPES[type]
  const parsed = registration.parser.parse(SOURCES[type])
  if (!parsed.ok) throw new Error(`模板必须可解析：${type}`)
  return registration.buildProjection(parsed.doc)
}

const TYPES = ['flowchart', 'sequence', 'class', 'mindmap', 'kanban', 'block', 'sankey', 'xychart', 'architecture', 'venn', 'usecase'] as const

describe('capabilitiesOf：8 图种 × 8 能力查表（工单 04 + architecture-deepening-2 工单 03 + 工单 09/13/14）', () => {
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

      const hasOrdinalEdges =
        type === 'class' || type === 'sequence' || type === 'block' || type === 'sankey' || type === 'xychart'
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

  it('block（more-diagrams 工单 09）：块 id → 节点/嵌套块选中（带前缀），边 elementId → 位置序选中，未知 → null', () => {
    const projection = projectionOf('block') as Extract<AnyProjection, { type: 'block' }>
    const resolve = blockDataIdResolver(projection.block)
    const node = projection.block.nodes[0]
    expect(resolve(node.id)).toEqual({ kind: 'node', id: `block-node:${node.id}` })
    const group = projection.block.groups[0]
    expect(resolve(group.id)).toEqual({ kind: 'node', id: `block-group:${group.id}` })
    const edge = projection.block.edges[0]
    expect(resolve(edge.elementId)).toEqual({ kind: 'element', elementId: edge.elementId })
    expect(resolve('__nope__')).toBeNull()
  })

  it('sankey（more-diagrams 工单 13）：节点名 → 节点选中，链路 elementId → 位置序选中，未知 → null', () => {
    const projection = projectionOf('sankey') as Extract<AnyProjection, { type: 'sankey' }>
    const resolve = sankeyDataIdResolver(projection.sankey)
    const node = projection.sankey.nodes[0]
    expect(resolve(node.name)).toEqual({ kind: 'node', id: node.name })
    const link = projection.sankey.links[0]
    expect(resolve(link.elementId)).toEqual({ kind: 'element', elementId: link.elementId })
    // 渲染器的全局计数器 id 形态（node-N）不是身份，安静拒绝
    expect(resolve('node-1')).toBeNull()
    expect(resolve('__nope__')).toBeNull()
  })

  it('xychart（more-diagrams 工单 14）：系列位置序 / 标题与轴固定身份 → 节点选中，未知 → null', () => {
    const projection = projectionOf('xychart') as Extract<AnyProjection, { type: 'xychart' }>
    const resolve = xychartDataIdResolver(projection.xychart)
    const series = projection.xychart.series[0]
    expect(resolve(series.elementId)).toEqual({ kind: 'node', id: series.elementId })
    expect(resolve('xychart-title')).toEqual({ kind: 'node', id: 'xychart-title' })
    expect(resolve('xychart-x-axis')).toEqual({ kind: 'node', id: 'xychart-x-axis' })
    expect(resolve('xychart-y-axis')).toEqual({ kind: 'node', id: 'xychart-y-axis' })
    // 渲染器根本没有 data-id / id 写入——任何别形 id 安静拒绝
    expect(resolve('line-plot-0')).toBeNull()
    expect(resolve('__nope__')).toBeNull()
  })
})

describe('c4 能力包（more-diagrams 工单 18：画布 DOM 无 data-id 的诚实降级）', () => {
  it('八项能力齐备、无 edgeAnnotator；导航 / 画布寻址整体降级（null / 空）', () => {
    const projection = projectionOf('c4')
    const caps = capabilitiesOf(projection)

    // 查表命中注册表实例（registry 只持引用）
    expect(caps).toBe(DIAGRAM_TYPES.c4.canvas)
    expect(caps).toBe(c4CanvasCapabilities)

    // 实测：渲染器 `data-*` 出现 0 次、8 处 id 全在 <defs> marker、class 只有 c4/c4-external/c4-shape
    // → 画布无任何可寻址节点：navigationIds 空、resolver 永不命中、canvasIdOf 恒 null、toSelection 恒 null
    expect(caps.navigationIds(projection)).toEqual([])
    expect(caps.dataIdResolver(projection)('c4-element:banking')).toBeNull()
    expect(caps.toSelection({ kind: 'node', id: 'banking' })).toBeNull()
    // canvasIdOf 用 (*, *) 签名（工单 18 接口约定）——任何选中都不可寻址
    expect(
      caps.canvasIdOf(projection, { kind: 'c4-element', elementId: 'c4-element:banking' }),
    ).toBeNull()
    expect(caps.canvasIdOf(projection, { kind: 'c4-boundary', elementId: 'c4-boundary:b0' })).toBeNull()
    expect(caps.canvasIdOf(projection, { kind: 'c4-relation', elementId: 'relation:1' })).toBeNull()

    // edgeAnnotator 是可选成员，c4 不得实现（无位置序连线的画布注记）
    expect(caps.edgeAnnotator).toBeUndefined()

    // 键盘投影 / 选中回落 / 删除意图仍齐备（结构树 + 属性表单是唯一完整编辑入口）
    expect(caps.keyboardProjection(projection).kind).toBe('c4')
    expect(typeof caps.resolveSelection).toBe('function')
    expect(typeof caps.deleteIntent).toBe('function')
    expect(typeof caps.keyHandler).toBe('function')
  })
})
