import { describe, expect, it } from 'vitest'
import type { DiagramTypeId } from '../../diagram-registry'
import type { CanvasSelection } from '../data-id'
import { canvasIdOf, fromCanvasId, menuTargetOfCanvas, selectionOfMenuTarget } from '../selection-codec'
import type { ContextMenuTarget } from '../../editing/context-menu'
import { sameSelection, type Selection } from '../../projection/selection'

/** 全部 Selection kind 的样例（工单 03：全 kind 枚举测试的清单；工单 13 补 sankey 两类、14 补 xychart 三类） */
const ALL_KINDS: readonly Selection[] = [
  { kind: 'diagram' },
  { kind: 'node', nodeId: 'A' },
  { kind: 'edge', from: 'A', to: 'B', occurrence: 1 },
  { kind: 'subgraph', elementId: 'subgraph:s1' },
  { kind: 'classdef', name: 'emphasis' },
  { kind: 'participant', actorId: 'B' },
  { kind: 'message', elementId: 'message:1' },
  { kind: 'note', elementId: 'note:1' },
  { kind: 'block', elementId: 'block:1' },
  { kind: 'seq-region', elementId: 'else:1' },
  { kind: 'class', name: 'Foo' },
  { kind: 'class-member', elementId: 'member:1' },
  { kind: 'class-relation', elementId: 'relation:1' },
  { kind: 'class-note', elementId: 'note:1' },
  { kind: 'class-namespace', elementId: 'namespace:Shapes' },
  { kind: 'mindmap-node', elementId: 'mindmap-node:1' },
  { kind: 'sankey-node', name: 'Foo' },
  { kind: 'sankey-link', elementId: 'link:1' },
  { kind: 'xychart-series', elementId: 'series:1' },
  { kind: 'xychart-axis', axis: 'x' },
  { kind: 'xychart-title' },
  // wardley（more-diagrams 工单 23）：节点名字即身份、连线/演化位置序；三类均不可寻址
  { kind: 'wardley-node', name: '茶' },
  { kind: 'wardley-link', elementId: 'wardley-link:1' },
  { kind: 'wardley-evolve', elementId: 'wardley-evolve:1' },
  // venn（more-diagrams 工单 21）：集合名字即身份、交集位置序；两者经 data-venn-sets 反注可寻址
  { kind: 'venn-set', id: 'frontend' },
  { kind: 'venn-union', elementId: 'venn-union:1' },
  // cynefin（more-diagrams 工单 25）：域名词行固定身份、条目/转移位置序；三类均不可寻址
  { kind: 'cynefin-domain', name: 'complex' },
  { kind: 'cynefin-item', elementId: 'cynefin-item:1' },
  { kind: 'cynefin-transition', elementId: 'cynefin-transition:1' },
  // usecase（more-diagrams 工单 26）：actor / 用例 / 边界 / 注释名字即身份、关系位置序；
  // 渲染器已写 data-id 由 nodeAnnotator 归一为 elementId，四类均经 data-id 可寻址
  { kind: 'usecase-actor', elementId: 'actor:Customer' },
  { kind: 'usecase-usecase', elementId: 'usecase:Login' },
  { kind: 'usecase-boundary', elementId: 'boundary:shop' },
  { kind: 'usecase-relation', elementId: 'relation:1' },
  { kind: 'usecase-note', elementId: 'note:1' },
  // eventmodeling（more-diagrams 工单 28）：帧 / 数据块位置序；画布 DOM 无 data-id
  // （research §4/§8.3 实测），两类均不可寻址
  { kind: 'em-frame', elementId: 'frame:1' },
  { kind: 'em-data', elementId: 'data:1' },
  // agentflow（more-diagrams 工单 27）：节点 DOM id 含节点 id 可反注（可寻址）、
  // 边 `data-id="L_from_to_n"`（flowchart 口径，可寻址）；容器无 data-id（不可寻址）、文档行不可寻址
  { kind: 'agentflow-node', nodeId: 'draft' },
  { kind: 'agentflow-edge', elementId: 'edge:draft->lookup' },
  { kind: 'agentflow-flow', elementId: 'container:flow:3' },
  { kind: 'agentflow-doc', elementId: 'agentflow-doc:1' },
  // c4（more-diagrams 工单 18）：元素/边界名字即身份、关系位置序；画布 DOM 无 data-id
  // （实测降级），三类均不可寻址
  { kind: 'c4-element', elementId: 'c4-element:banking' },
  { kind: 'c4-boundary', elementId: 'c4-boundary:b0' },
  { kind: 'c4-relation', elementId: 'relation:1' },
]

/**
 * 显式可寻址表（工单 03 定案）：逐格钉住「画布上是否可寻址」。
 * 新增 kind 时必须在这里回答——漏答即测试失败，而不是线上静默（属性面板空白）。
 */
const ADDRESSABLE: Record<DiagramTypeId, ReadonlySet<string>> = {
  flowchart: new Set(['node']),
  sequence: new Set(['participant', 'message', 'note', 'block']),
  class: new Set(['class', 'class-relation']),
  mindmap: new Set(['mindmap-node']),
  // sankey（more-diagrams 工单 13）：节点按名字、链路按位置序 `link:N`，均经位置序反注
  sankey: new Set(['sankey-node', 'sankey-link']),
  // xychart（more-diagrams 工单 14）：系列位置序 `series:N`、标题/轴固定身份，均经类名组反注
  xychart: new Set(['xychart-series', 'xychart-axis', 'xychart-title']),
  // venn（more-diagrams 工单 21）：集合 / 交集经 data-venn-sets 内容键反注为 data-id
  venn: new Set(['venn-set', 'venn-union']),
  // usecase（more-diagrams 工单 26）：四类元素（actor / 用例 / 边界 / 关系）+ 注释，
  // 渲染器已写 data-id、由 nodeAnnotator 归一为投影 elementId，均经 data-id 可寻址
  usecase: new Set([
    'usecase-actor',
    'usecase-usecase',
    'usecase-boundary',
    'usecase-relation',
    'usecase-note',
  ]),
  // agentflow（more-diagrams 工单 27）：节点 DOM id 含节点 id，可反注 → `canvasIdOf` 给节点 id；
  // 边虽有原生 data-id `L_{from}_{to}_{n}`（画布 → 选中可重建，见「menuTargetOfCanvas」用例），
  // 但选中侧只带合成 elementId `edge:{from}->{to}`，无法仅由 Selection 反推 CSS data-id，
  // 故 `canvasIdOf` 对边返回 null（高亮/导航只认节点）——如实标注，不硬凑。
  agentflow: new Set(['agentflow-node']),
  // c4（more-diagrams 工单 18）：画布 DOM 无 data-id（实测降级），三类选中均不可寻址
  c4: new Set([]),
}

const TYPES: readonly DiagramTypeId[] = [
  'flowchart',
  'sequence',
  'class',
  'mindmap',
  'sankey',
  'xychart',
  'venn',
  'usecase',
  'agentflow',
  'c4',
]

/** data-id → CanvasSelection（与各 resolver 的产出形态一致）：
 * 节点类 data-id 即节点 id；位置序连线 data-id 即 elementId；mindmap 的画布选中 id 是 elementId */
function canvasSelectionOf(sel: Selection, dataId: string): CanvasSelection {
  if (
    sel.kind === 'node' ||
    sel.kind === 'participant' ||
    sel.kind === 'class' ||
    sel.kind === 'sankey-node' ||
    sel.kind === 'xychart-series' ||
    sel.kind === 'xychart-axis' ||
    sel.kind === 'xychart-title' ||
    // venn（more-diagrams 工单 21）：集合 / 交集的画布选中都是 node（data-id = elementId）
    sel.kind === 'venn-set' ||
    sel.kind === 'venn-union' ||
    // usecase（more-diagrams 工单 26）：四类元素 + 注释的画布选中都是 node（data-id = elementId）
    sel.kind === 'usecase-actor' ||
    sel.kind === 'usecase-usecase' ||
    sel.kind === 'usecase-boundary' ||
    sel.kind === 'usecase-relation' ||
    sel.kind === 'usecase-note' ||
    // agentflow（more-diagrams 工单 27）：节点画布选中是 node（反注后 data-id = nodeId）
    sel.kind === 'agentflow-node' ||
    // c4（more-diagrams 工单 18）：三类选中画布无 data-id（降级），此处仅为形态完整
    sel.kind === 'c4-element' ||
    sel.kind === 'c4-boundary' ||
    sel.kind === 'c4-relation'
  ) {
    return { kind: 'node', id: dataId }
  }
  if (sel.kind === 'mindmap-node') return { kind: 'node', id: sel.elementId }
  return { kind: 'element', elementId: dataId }
}

describe('canvasIdOf', () => {
  it('可寻址的 kind 给出 data-id，不可寻址的 kind 返回 null', () => {
    const addressableKinds = new Set([
      'node',
      'participant',
      'class',
      'class-relation',
      'message',
      'note',
      'block',
      'mindmap-node',
      'sankey-node',
      'sankey-link',
      'xychart-series',
      'xychart-axis',
      'xychart-title',
      'venn-set',
      'venn-union',
      'usecase-actor',
      'usecase-usecase',
      'usecase-boundary',
      'usecase-relation',
      'usecase-note',
      'agentflow-node',
    ])
    for (const sel of ALL_KINDS) {
      const dataId = canvasIdOf(sel)
      if (addressableKinds.has(sel.kind)) {
        expect(dataId, sel.kind).not.toBeNull()
      } else {
        expect(dataId, sel.kind).toBeNull()
      }
    }
  })

  it('mindmap-node 的 data-id 是 DOM id 形态 node_{N-1}', () => {
    expect(canvasIdOf({ kind: 'mindmap-node', elementId: 'mindmap-node:3' })).toBe('node_2')
  })
})

describe('fromCanvasId（往返）', () => {
  it('全 kind × 全图种逐格核对：可寻址组合 sameSelection 回原选中，不可寻址组合不回', () => {
    for (const type of TYPES) {
      for (const sel of ALL_KINDS) {
        const label = `${type}/${sel.kind}`
        const dataId = canvasIdOf(sel)
        if (dataId === null) {
          // 画布上根本没有 data-id：这类 kind 在任何图种都不可寻址
          expect(ADDRESSABLE[type].has(sel.kind), label).toBe(false)
          continue
        }
        const back = fromCanvasId(type, canvasSelectionOf(sel, dataId))
        if (ADDRESSABLE[type].has(sel.kind)) {
          expect(back, label).not.toBeNull()
          expect(sameSelection(back as Selection, sel), label).toBe(true)
        } else {
          // 跨图种命名空间（如 participant 的 data-id 在 flowchart 下命中 node）：
          // 不产生同一个选中
          expect(back === null || !sameSelection(back, sel), label).toBe(true)
        }
      }
    }
  })

  it('flowchart 走 toEditorSelection：edge 命中、element 不命中（既有行为不变）', () => {
    expect(fromCanvasId('flowchart', { kind: 'edge', from: 'A', to: 'B', occurrence: 2 })).toEqual({
      kind: 'edge',
      from: 'A',
      to: 'B',
      occurrence: 2,
    })
    expect(fromCanvasId('flowchart', { kind: 'element', elementId: 'message:1' })).toBeNull()
  })
})

describe('selectionOfMenuTarget', () => {
  it('全部元素目标逐个映射为对应 Selection', () => {
    const cases: readonly (readonly [ContextMenuTarget, Selection])[] = [
      [{ kind: 'element', selection: { kind: 'node', nodeId: 'A' } }, { kind: 'node', nodeId: 'A' }],
      [
        { kind: 'element', selection: { kind: 'edge', from: 'A', to: 'B', occurrence: 2 } },
        { kind: 'edge', from: 'A', to: 'B', occurrence: 2 },
      ],
      [{ kind: 'element', selection: { kind: 'mindmap-node', elementId: 'mindmap-node:1' } }, { kind: 'mindmap-node', elementId: 'mindmap-node:1' }],
      [{ kind: 'element', selection: { kind: 'class', name: 'Foo' } }, { kind: 'class', name: 'Foo' }],
      [{ kind: 'element', selection: { kind: 'participant', actorId: 'B' } }, { kind: 'participant', actorId: 'B' }],
      [{ kind: 'element', selection: { kind: 'class-relation', elementId: 'relation:1' } }, { kind: 'class-relation', elementId: 'relation:1' }],
      [{ kind: 'element', selection: { kind: 'message', elementId: 'message:1' } }, { kind: 'message', elementId: 'message:1' }],
      [{ kind: 'element', selection: { kind: 'note', elementId: 'note:1' } }, { kind: 'note', elementId: 'note:1' }],
      [{ kind: 'element', selection: { kind: 'block', elementId: 'block:1' } }, { kind: 'block', elementId: 'block:1' }],
      // sankey（more-diagrams 工单 13）：节点 / 链路菜单目标一一对应各自 Selection kind
      [{ kind: 'element', selection: { kind: 'sankey-node', name: 'Foo' } }, { kind: 'sankey-node', name: 'Foo' }],
      [{ kind: 'element', selection: { kind: 'sankey-link', elementId: 'link:1' } }, { kind: 'sankey-link', elementId: 'link:1' }],
      // xychart（more-diagrams 工单 14）：系列 / 轴 / 标题菜单目标一一对应各自 Selection kind
      [{ kind: 'element', selection: { kind: 'xychart-series', elementId: 'series:1' } }, { kind: 'xychart-series', elementId: 'series:1' }],
      [{ kind: 'element', selection: { kind: 'xychart-axis', axis: 'x' } }, { kind: 'xychart-axis', axis: 'x' }],
      [{ kind: 'element', selection: { kind: 'xychart-title' } }, { kind: 'xychart-title' }],
      // cynefin（more-diagrams 工单 25）：域 / 条目 / 转移菜单目标一一对应各自 Selection kind
      [{ kind: 'element', selection: { kind: 'cynefin-domain', name: 'complex' } }, { kind: 'cynefin-domain', name: 'complex' }],
      [{ kind: 'element', selection: { kind: 'cynefin-item', elementId: 'cynefin-item:1' } }, { kind: 'cynefin-item', elementId: 'cynefin-item:1' }],
      [
        { kind: 'element', selection: { kind: 'cynefin-transition', elementId: 'cynefin-transition:1' } },
        { kind: 'cynefin-transition', elementId: 'cynefin-transition:1' },
      ],
      // agentflow（more-diagrams 工单 27）：节点 / 边 / 容器 / 文档行菜单目标一一对应各自 Selection kind
      [{ kind: 'element', selection: { kind: 'agentflow-node', nodeId: 'draft' } }, { kind: 'agentflow-node', nodeId: 'draft' }],
      [
        { kind: 'element', selection: { kind: 'agentflow-edge', elementId: 'edge:draft->lookup' } },
        { kind: 'agentflow-edge', elementId: 'edge:draft->lookup' },
      ],
      [{ kind: 'element', selection: { kind: 'agentflow-flow', elementId: 'container:flow:3' } }, { kind: 'agentflow-flow', elementId: 'container:flow:3' }],
      [{ kind: 'element', selection: { kind: 'agentflow-doc', elementId: 'agentflow-doc:1' } }, { kind: 'agentflow-doc', elementId: 'agentflow-doc:1' }],
      // c4（more-diagrams 工单 18）：元素 / 边界 / 关系菜单目标一一对应各自 Selection kind
      [{ kind: 'element', selection: { kind: 'c4-element', elementId: 'c4-element:banking' } }, { kind: 'c4-element', elementId: 'c4-element:banking' }],
      [{ kind: 'element', selection: { kind: 'c4-boundary', elementId: 'c4-boundary:b0' } }, { kind: 'c4-boundary', elementId: 'c4-boundary:b0' }],
      [{ kind: 'element', selection: { kind: 'c4-relation', elementId: 'relation:1' } }, { kind: 'c4-relation', elementId: 'relation:1' }],
    ]
    for (const [target, sel] of cases) {
      expect(selectionOfMenuTarget(target), target.kind).toEqual(sel)
    }
  })

  it('blank 目标什么都不选（既有语义：空白菜单不 select）', () => {
    expect(selectionOfMenuTarget({ kind: 'blank', diagramType: 'flowchart' })).toBeNull()
  })
})

describe('menuTargetOfCanvas（往返）', () => {
  it('canvas 为 null → blank（图种随目标携带）', () => {
    expect(menuTargetOfCanvas('class', null)).toEqual({ kind: 'blank', diagramType: 'class' })
  })

  it('节点选中按图种落成各自 Selection；连线 flowchart 走 edge，其它图种的 mermaid 连线不弹菜单', () => {
    expect(menuTargetOfCanvas('flowchart', { kind: 'node', id: 'A' })).toEqual({
      kind: 'element',
      selection: { kind: 'node', nodeId: 'A' },
    })
    expect(menuTargetOfCanvas('mindmap', { kind: 'node', id: 'mindmap-node:1' })).toEqual({
      kind: 'element',
      selection: { kind: 'mindmap-node', elementId: 'mindmap-node:1' },
    })
    expect(menuTargetOfCanvas('class', { kind: 'node', id: 'Foo' })).toEqual({
      kind: 'element',
      selection: { kind: 'class', name: 'Foo' },
    })
    expect(menuTargetOfCanvas('sequence', { kind: 'node', id: 'B' })).toEqual({
      kind: 'element',
      selection: { kind: 'participant', actorId: 'B' },
    })
    expect(menuTargetOfCanvas('flowchart', { kind: 'edge', from: 'A', to: 'B', occurrence: 1 })).toEqual({
      kind: 'element',
      selection: { kind: 'edge', from: 'A', to: 'B', occurrence: 1 },
    })
    expect(menuTargetOfCanvas('class', { kind: 'edge', from: 'A', to: 'B', occurrence: 1 })).toBeNull()
    // agentflow（more-diagrams 工单 27）：节点 data-id 即源码节点 id 反注；
    // 边身份同 flowchart 口径（`L_{from}_{to}_{n}`），反注为 `agentflow-edge`
    expect(menuTargetOfCanvas('agentflow', { kind: 'node', id: 'draft' })).toEqual({
      kind: 'element',
      selection: { kind: 'agentflow-node', nodeId: 'draft' },
    })
    expect(menuTargetOfCanvas('agentflow', { kind: 'edge', from: 'draft', to: 'lookup', occurrence: 1 })).toEqual({
      kind: 'element',
      selection: { kind: 'agentflow-edge', elementId: 'edge:draft->lookup' },
    })
    expect(menuTargetOfCanvas('agentflow', { kind: 'edge', from: 'draft', to: 'lookup', occurrence: 2 })).toEqual({
      kind: 'element',
      selection: { kind: 'agentflow-edge', elementId: 'edge:draft->lookup#2' },
    })
  })

  it('位置序连线经 edgeSelectionOf 收窄：本图种可寻址的才是菜单目标', () => {
    expect(menuTargetOfCanvas('class', { kind: 'element', elementId: 'relation:1' })).toEqual({
      kind: 'element',
      selection: { kind: 'class-relation', elementId: 'relation:1' },
    })
    expect(menuTargetOfCanvas('sequence', { kind: 'element', elementId: 'message:2' })).toEqual({
      kind: 'element',
      selection: { kind: 'message', elementId: 'message:2' },
    })
    // sankey（more-diagrams 工单 13）：链路 `link:N` 是位置序身份；节点 data-id 即名字
    expect(menuTargetOfCanvas('sankey', { kind: 'element', elementId: 'link:1' })).toEqual({
      kind: 'element',
      selection: { kind: 'sankey-link', elementId: 'link:1' },
    })
    expect(menuTargetOfCanvas('sankey', { kind: 'node', id: 'Foo' })).toEqual({
      kind: 'element',
      selection: { kind: 'sankey-node', name: 'Foo' },
    })
    // xychart（more-diagrams 工单 14）：node.id = `series:N` / 固定身份（类名组反注）
    expect(menuTargetOfCanvas('xychart', { kind: 'node', id: 'series:2' })).toEqual({
      kind: 'element',
      selection: { kind: 'xychart-series', elementId: 'series:2' },
    })
    expect(menuTargetOfCanvas('xychart', { kind: 'node', id: 'xychart-y-axis' })).toEqual({
      kind: 'element',
      selection: { kind: 'xychart-axis', axis: 'y' },
    })
    expect(menuTargetOfCanvas('xychart', { kind: 'node', id: 'xychart-title' })).toEqual({
      kind: 'element',
      selection: { kind: 'xychart-title' },
    })
    expect(menuTargetOfCanvas('xychart', { kind: 'node', id: '__nope__' })).toBeNull()
    // mermaid 自己的连线 id 不是位置序身份 → null（安静地不弹菜单）
    expect(menuTargetOfCanvas('class', { kind: 'element', elementId: 'id_A_B_1' })).toBeNull()
    // c4（more-diagrams 工单 18）：画布 DOM 无 data-id（实测降级），节点 / 元素目标不命中
    expect(menuTargetOfCanvas('c4', { kind: 'node', id: 'c4-element:banking' })).toBeNull()
    expect(menuTargetOfCanvas('c4', { kind: 'node', id: 'c4-boundary:b0' })).toBeNull()
    expect(menuTargetOfCanvas('c4', { kind: 'element', elementId: 'relation:1' })).toBeNull()
  })

  it('menuTargetOfCanvas → selectionOfMenuTarget 与 fromCanvasId 同解（两套目标同一选中）', () => {
    const canvasCases: readonly (readonly [DiagramTypeId, CanvasSelection])[] = [
      ['flowchart', { kind: 'node', id: 'A' }],
      ['flowchart', { kind: 'edge', from: 'A', to: 'B', occurrence: 1 }],
      ['sequence', { kind: 'node', id: 'B' }],
      ['sequence', { kind: 'element', elementId: 'message:1' }],
      ['class', { kind: 'node', id: 'Foo' }],
      ['class', { kind: 'element', elementId: 'relation:1' }],
      ['mindmap', { kind: 'node', id: 'mindmap-node:1' }],
      ['xychart', { kind: 'node', id: 'series:1' }],
      ['xychart', { kind: 'node', id: 'xychart-x-axis' }],
      ['xychart', { kind: 'node', id: 'xychart-title' }],
      ['agentflow', { kind: 'node', id: 'draft' }],
      ['agentflow', { kind: 'edge', from: 'draft', to: 'lookup', occurrence: 1 }],
    ]
    for (const [type, canvas] of canvasCases) {
      const target = menuTargetOfCanvas(type, canvas)
      expect(target, `${type}/${canvas.kind}`).not.toBeNull()
      const viaTarget = selectionOfMenuTarget(target as ContextMenuTarget)
      const viaCodec = fromCanvasId(type, canvas)
      // 两条路径产出同一个选中（blank 除外——上面列举的全是元素目标）
      expect(viaTarget !== null && viaCodec !== null && sameSelection(viaTarget, viaCodec), `${type}/${canvas.kind}`).toBe(
        true,
      )
    }
  })
})
