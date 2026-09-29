import { describe, expect, it } from 'vitest'
import {
  annotateClassRelationIdentities,
  annotateSequenceIdentities,
  hitTestEdgeIdentity,
  relationShapesOf,
} from '../edge-locate'
import {
  elementDataIdResolver,
  nodeDataIdResolver,
  selectionFromEventTarget,
  type DataIdResolver,
} from '../data-id'
import { annotateNodeDataIds } from '../node-data-ids'

/**
 * 连线位置序寻址的 DOM 适配层（工单 02）。
 *
 * 全部注入**假几何 / 假渲染产物**（固定结构与桩函数），不碰真 mermaid——
 * 结构与顺序按 2026-09-29 真机实测抄录（见 spec 的「背景事实」节）。
 */

/** 把元素的 getBoundingClientRect 变成会抛错的桩：证明命中判定没有走 bbox 中心 */
function forbidBBox(el: Element): void {
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => {
      throw new Error('命中判定不得使用 getBoundingClientRect')
    },
  })
}

/** 给元素桩一条用户坐标下的直线路径 + 恒等（1:1）屏幕变换 */
function stubStraightGeometry(el: Element, x1: number, y1: number, x2: number, y2: number): void {
  const length = Math.hypot(x2 - x1, y2 - y1)
  Object.defineProperty(el, 'getTotalLength', { configurable: true, value: () => length })
  Object.defineProperty(el, 'getPointAtLength', {
    configurable: true,
    value: (l: number) => {
      const t = length === 0 ? 0 : l / length
      return { x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t }
    },
  })
  Object.defineProperty(el, 'getScreenCTM', {
    configurable: true,
    value: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
  })
}

/** class 渲染产物：每条关系 1 个 path（实测 mermaid 12.0.0：`.edgePaths > path` 与关系一一对应），
 * 标签与基数在 g.edgeLabels 的直接子元素里（实测：label 组按条数、terminals 组紧随其 label 组）。
 * 这里 3 条关系、子元素只有 3 个——中间那条无标签无基数，用来暴露「按子元素数而不是按关系数
 * 推位置序」的错法 */
function buildClassSvg(): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = `<svg class="classDiagram">
    <g class="edges edgePaths">
      <path class="relation" data-id="id_A_B_1" id="mmd-preview-2-id_A_B_1" marker-end="url(#a)"/>
      <path class="relation" data-id="id_A_C_2" id="mmd-preview-2-id_A_C_2" marker-end="url(#a)"/>
      <path class="relation" data-id="id_B_D_3" id="mmd-preview-2-id_B_D_3" marker-end="url(#a)"/>
    </g>
    <g class="edgeLabels">
      <g class="edgeLabel"><g class="label" data-id="id_A_B_1"><foreignObject><div><span class="edgeLabel">owns</span></div></foreignObject></g></g>
      <g class="edgeTerminals"><g class="inner"><foreignObject><div><span class="edgeLabel">1</span></div></foreignObject></g></g>
      <g class="edgeLabel"><g class="label" data-id="id_B_D_3"><foreignObject><div><span class="edgeLabel">has</span></div></foreignObject></g></g>
    </g>
  </svg>`
  return host
}

/** sequence 渲染产物：注释与块是 g（注释含 rect.note；块含 line.loopLine），消息是 line/path */
function buildSequenceSvg(): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = `<svg class="sequenceDiagram">
    <g data-id="i3"><rect class="note"/><text class="noteText">a note</text></g>
    <g data-id="i8"><line class="loopLine"/><line class="loopLine"/><polygon class="labelBox"/><text class="labelText">alt</text></g>
    <g data-id="i9"><rect class="note"/><text class="noteText">tail</text></g>
    <line class="messageLine0" data-id="i0"/>
    <line class="messageLine1" data-id="i1"/>
    <path class="messageLine0" data-id="i2"/>
  </svg>`
  return host
}

describe('relationShapesOf（投影 → g.edgeLabels 的期望子元素序列）', () => {
  it('有标签或有基数 → 有 label 组；有任一基数 → 有 terminals 组', () => {
    expect(
      relationShapesOf([
        { label: 'owns', cardFrom: '1', cardTo: '*' },
        { label: null, cardFrom: null, cardTo: null },
        { label: 'lbl', cardFrom: null, cardTo: null },
        { label: null, cardFrom: '0..*', cardTo: null },
      ]),
    ).toEqual([
      { labelGroup: true, terminalsGroup: true },
      { labelGroup: false, terminalsGroup: false },
      { labelGroup: true, terminalsGroup: false },
      { labelGroup: true, terminalsGroup: true },
    ])
  })

  it('空标签（`A --> B :`）也算有 label 组（投影 label 为 \'\' 而非 null）', () => {
    expect(relationShapesOf([{ label: '', cardFrom: null, cardTo: null }])).toEqual([
      { labelGroup: true, terminalsGroup: false },
    ])
  })
})

describe('class 关系边标注（工单 02）', () => {
  // 第 1 条：标签 + 基数；第 2 条：无标签无基数；第 3 条：只有标签
  const shapes = relationShapesOf([
    { label: 'owns', cardFrom: '1', cardTo: '*' },
    { label: null, cardFrom: null, cardTo: null },
    { label: 'has', cardFrom: null, cardTo: null },
  ])

  it('每条关系按其源码位置编号（文档序 = 源码序）', () => {
    const host = buildClassSvg()
    annotateClassRelationIdentities(host, shapes)
    const paths = Array.from(host.querySelectorAll('.edgePaths > path'))
    expect(paths.map((p) => p.getAttribute('data-id'))).toEqual(['relation:1', 'relation:2', 'relation:3'])
    // 边上不再保留 mermaid 的 from/to/counter 形态（身份不是 data-id）
    expect(paths.every((p) => (p.getAttribute('data-id') ?? '').startsWith('relation:'))).toBe(true)
  })

  it('同一关系出现相邻重复 path（重复渲染 / 命中克隆未标记）→ 去重后仍按关系数编号', () => {
    const host = document.createElement('div')
    host.innerHTML = `<svg><g class="edgePaths">
      <path data-id="id_A_B_1"/><path data-id="id_A_B_1"/>
      <path data-id="id_A_C_2"/><path data-id="id_A_C_2"/>
    </g></svg>`
    annotateClassRelationIdentities(host, relationShapesOf([
      { label: null, cardFrom: null, cardTo: null },
      { label: null, cardFrom: null, cardTo: null },
    ]))
    expect(Array.from(host.querySelectorAll('.edgePaths > path')).map((p) => p.getAttribute('data-id'))).toEqual([
      'relation:1',
      'relation:1',
      'relation:2',
      'relation:2',
    ])
  })

  it('标签组与基数组都归属到对应关系（点标签/点基数 = 选中该条关系）', () => {
    const host = buildClassSvg()
    annotateClassRelationIdentities(host, shapes)
    const labels = Array.from(host.querySelectorAll('g.edgeLabels > *'))
    // 中间那条关系没有子元素，但位置序不塌缩：第 3 个子元素归 relation:3
    expect(labels.map((el) => el.getAttribute('data-id'))).toEqual(['relation:1', 'relation:1', 'relation:3'])
    // 标签文字与基数文字都在被标注的组内（沿 DOM 向上即可归属）
    expect(labels[0].querySelector('span.edgeLabel')?.textContent).toBe('owns')
    expect(labels[1].querySelector('span.edgeLabel')?.textContent).toBe('1')
    expect(labels[2].querySelector('span.edgeLabel')?.textContent).toBe('has')
  })

  it('幂等：重复标注不改变结果（选中变化触发的重跑）', () => {
    const host = buildClassSvg()
    annotateClassRelationIdentities(host, shapes)
    const first = host.innerHTML
    annotateClassRelationIdentities(host, shapes)
    expect(host.innerHTML).toBe(first)
  })

  it('工单 01 的命中克隆（data-vm-hit）不参与数位置序', () => {
    const host = buildClassSvg()
    const edgePaths = host.querySelector('.edgePaths')!
    const first = edgePaths.querySelector('path')!
    const clone = first.cloneNode() as Element
    clone.setAttribute('data-vm-hit', 'true')
    clone.removeAttribute('id')
    edgePaths.insertBefore(clone, first)
    annotateClassRelationIdentities(host, shapes)
    // 原 3 条关系仍是 relation:1/2/3（克隆被排除，没有把序号数歪）
    const originals = Array.from(host.querySelectorAll('.edgePaths > path:not([data-vm-hit])'))
    expect(originals).toHaveLength(3)
    expect(originals.map((p) => p.getAttribute('data-id'))).toEqual(['relation:1', 'relation:2', 'relation:3'])
  })

  it('结构与投影不同构（path 组数 ≠ 关系数）→ 一律不标（绝不误归属）', () => {
    const host = buildClassSvg()
    annotateClassRelationIdentities(host, shapes.slice(0, 1))
    expect(host.querySelectorAll('[data-id^="relation:"]')).toHaveLength(0)
    expect(host.querySelector('.edgePaths > path')?.getAttribute('data-id')).toBe('id_A_B_1')
  })

  it('g.edgeLabels 子元素序列与期望不符 → label/terminals 不标（path 仍标）', () => {
    const host = buildClassSvg()
    // 投影说三条关系都没有标签/基数（期望 0 个子元素），DOM 里却出现了 3 个标签组 → 不符
    annotateClassRelationIdentities(
      host,
      relationShapesOf([
        { label: null, cardFrom: null, cardTo: null },
        { label: null, cardFrom: null, cardTo: null },
        { label: null, cardFrom: null, cardTo: null },
      ]),
    )
    expect(host.querySelector('g.edgePaths > path')?.getAttribute('data-id')).toBe('relation:1')
    expect(host.querySelector('g.edgeLabels > *')?.getAttribute('data-id')).toBeNull()
  })

  it('关系为空 → 不标（不抛错）', () => {
    const host = buildClassSvg()
    expect(() => annotateClassRelationIdentities(host, [])).not.toThrow()
    expect(host.querySelectorAll('[data-id^="relation:"]')).toHaveLength(0)
  })
})

describe('sequence 连线/注释/块标注（工单 02）', () => {
  const counts = { messages: 3, notes: 2, blocks: 1 }

  it('消息线（line/path 的 messageLine0/1）按文档序标 message:N', () => {
    const host = buildSequenceSvg()
    annotateSequenceIdentities(host, counts)
    expect(
      Array.from(host.querySelectorAll('line[class~="messageLine0"], line[class~="messageLine1"], path[class~="messageLine0"]')).map(
        (el) => el.getAttribute('data-id'),
      ),
    ).toEqual(['message:1', 'message:2', 'message:3'])
  })

  it('注释（rect.note 及同宿主兄弟元素）按文档序标 note:N', () => {
    const host = buildSequenceSvg()
    annotateSequenceIdentities(host, counts)
    const noteRects = Array.from(host.querySelectorAll('rect.note'))
    expect(noteRects.map((r) => r.getAttribute('data-id'))).toEqual(['note:1', 'note:2'])
    // 身份下移到几何元素后，宿主 <g> 保留 mermaid 自己的 data-id（i3 / i9），不被覆盖
    expect(noteRects.map((r) => r.parentElement?.getAttribute('data-id'))).toEqual(['i3', 'i9'])
    // 注释内的文本共享同一身份，点文本即可归属
    expect(noteRects[0]?.parentElement?.querySelector('text.noteText')?.getAttribute('data-id')).toBe('note:1')
    expect(noteRects[0]?.parentElement?.querySelector('text.noteText')?.textContent).toBe('a note')
  })

  it('块（line.loopLine 及同宿主兄弟元素，按宿主去重）标 block:N', () => {
    const host = buildSequenceSvg()
    annotateSequenceIdentities(host, counts)
    // 同一块的多条 loopLine 共享一个身份（位置序按宿主计，不按线计）
    const distinct = new Set(Array.from(host.querySelectorAll('line.loopLine')).map((l) => l.getAttribute('data-id')))
    expect(Array.from(distinct)).toEqual(['block:1'])
    // 块的标签（labelBox / labelText）也共享同一身份
    expect(host.querySelector('polygon.labelBox')?.getAttribute('data-id')).toBe('block:1')
    expect(host.querySelector('text.labelText')?.getAttribute('data-id')).toBe('block:1')
    expect(host.querySelector('line.loopLine')?.parentElement?.getAttribute('data-id')).toBe('i8')
  })

  it('某个种类条数与投影不符 → 仅该种类不标（其余照标）', () => {
    const host = buildSequenceSvg()
    annotateSequenceIdentities(host, { messages: 9, notes: 2, blocks: 1 })
    expect(host.querySelectorAll('[data-id^="message:"]')).toHaveLength(0)
    expect(host.querySelector('rect.note')?.getAttribute('data-id')).toBe('note:1')
    expect(host.querySelector('line.loopLine')?.getAttribute('data-id')).toBe('block:1')
  })

  it('幂等：重复标注不改变结果', () => {
    const host = buildSequenceSvg()
    annotateSequenceIdentities(host, counts)
    const first = host.innerHTML
    annotateSequenceIdentities(host, counts)
    expect(host.innerHTML).toBe(first)
  })

  it('rect 区域块（rect.rect，工单 06）不是标注对象：无 data-id、不进命中集合', () => {
    const host = document.createElement('div')
    // 区域矩形是 <svg> 的直接子元素、无 data-id（实测）；块与注释照旧
    host.innerHTML = `<svg class="sequenceDiagram">
      <rect class="rect"/>
      <g data-id="i8"><line class="loopLine"/></g>
      <g data-id="i3"><rect class="note"/><text class="noteText">a note</text></g>
    </svg>`
    annotateSequenceIdentities(host, { messages: 0, notes: 1, blocks: 1 })
    expect(host.querySelector('rect.rect')?.getAttribute('data-id')).toBeNull()
    expect(host.querySelector('line.loopLine')?.getAttribute('data-id')).toBe('block:1')
    expect(host.querySelector('rect.note')?.getAttribute('data-id')).toBe('note:1')
  })
})

/** sequence 消息（与 edge-locate 内的 SEQUENCE_MESSAGE 同形态），用于桩几何 */
const SEQUENCE_MESSAGE_SELECTOR =
  'line[class~="messageLine0"], line[class~="messageLine1"], path[class~="messageLine0"], path[class~="messageLine1"]'

describe('sequence 注释/块的点选命中（工单 03）', () => {
  const counts = { messages: 3, notes: 2, blocks: 1 }

  /** 给 fixture 的几何元素桩上互不重叠的直线：note:1 在 y=0、note:2 在 y=40、
   *  块的两条 loopLine 在 y=100 / y=120、三条消息在 y=200 / 220 / 240。
   *  探测点固定取 x=0（采样的端点必被采到），避免采样步长带来的取整误差 */
  function buildHitFixture(): HTMLElement {
    const host = buildSequenceSvg()
    annotateSequenceIdentities(host, counts)
    const notes = Array.from(host.querySelectorAll('rect.note'))
    stubStraightGeometry(notes[0], 0, 0, 100, 0)
    stubStraightGeometry(notes[1], 0, 40, 100, 40)
    const loops = Array.from(host.querySelectorAll('line.loopLine'))
    stubStraightGeometry(loops[0], 0, 100, 100, 100)
    stubStraightGeometry(loops[1], 0, 120, 100, 120)
    const messages = Array.from(host.querySelectorAll(SEQUENCE_MESSAGE_SELECTOR))
    stubStraightGeometry(messages[0], 0, 200, 100, 200)
    stubStraightGeometry(messages[1], 0, 220, 100, 220)
    stubStraightGeometry(messages[2], 0, 240, 100, 240)
    return host
  }

  it('点在 note 的矩形上 → 命中其位置序身份 note:N', () => {
    const host = buildHitFixture()
    expect(hitTestEdgeIdentity(host, 0, 1, 4)).toBe('note:1')
    expect(hitTestEdgeIdentity(host, 0, 41, 4)).toBe('note:2')
  })

  it('点在 block 的线上 → 命中 block:N；同一块的两条 loopLine 只对应一个身份', () => {
    const host = buildHitFixture()
    expect(hitTestEdgeIdentity(host, 0, 101, 4)).toBe('block:1')
    // 第二条 loopLine：同一个块，同一个身份（位置序按宿主计）
    expect(hitTestEdgeIdentity(host, 0, 121, 4)).toBe('block:1')
    // 两条边框线之间的空白不属于任何元素
    expect(hitTestEdgeIdentity(host, 0, 110, 4)).toBeNull()
  })

  it('消息命中行为不变（工单 02 的既有语义）；远离任何元素 → null', () => {
    const host = buildHitFixture()
    expect(hitTestEdgeIdentity(host, 0, 201, 4)).toBe('message:1')
    expect(hitTestEdgeIdentity(host, 0, 221, 4)).toBe('message:2')
    expect(hitTestEdgeIdentity(host, 0, 241, 4)).toBe('message:3')
    expect(hitTestEdgeIdentity(host, 0, 300, 4)).toBeNull()
  })

  it('note 与消息相邻时取最近的一个（与既有 best 距离比较一致）', () => {
    const host = document.createElement('div')
    host.innerHTML = `<svg><g data-id="i3"><rect class="note"/></g><line class="messageLine0" data-id="i0"/></svg>`
    annotateSequenceIdentities(host, { messages: 1, notes: 1, blocks: 0 })
    stubStraightGeometry(host.querySelector('rect.note')!, 0, 0, 100, 0)
    stubStraightGeometry(host.querySelector('line')!, 0, 6, 100, 6)
    expect(hitTestEdgeIdentity(host, 0, 2, 4)).toBe('note:1') // 距 note 2、距 message 4
    expect(hitTestEdgeIdentity(host, 0, 5, 4)).toBe('message:1') // note 已出容差，message 距 1
    expect(hitTestEdgeIdentity(host, 0, 20, 4)).toBeNull()
  })

  it('宿主 <g> 保留 mermaid 的 iN（i3 / i8），且 iN 不参与几何命中', () => {
    const host = buildSequenceSvg()
    annotateSequenceIdentities(host, counts)
    const noteHost = host.querySelector('rect.note')!.parentElement!
    const blockHost = host.querySelector('line.loopLine')!.parentElement!
    expect(noteHost.getAttribute('data-id')).toBe('i3')
    expect(blockHost.getAttribute('data-id')).toBe('i8')
    // 给宿主 <g> 桩一条几何：若 mermaid 的 iN 被当成连线身份，点这里会返回 'i3'
    stubStraightGeometry(noteHost, 0, 900, 100, 900)
    expect(hitTestEdgeIdentity(host, 50, 900, 4)).toBeNull()
    // 几何命中只认子元素上的位置序身份
    stubStraightGeometry(host.querySelector('rect.note')!, 0, 900, 100, 900)
    expect(hitTestEdgeIdentity(host, 50, 900, 4)).toBe('note:1')
  })

  it('身份下移不被节点命中路径误吃（rect.note 与节点 rect 同标签）', () => {
    const host = document.createElement('div')
    host.innerHTML = `<svg class="sequenceDiagram">
      <g class="node" data-id="甲"><rect/><text>甲</text></g>
      <g data-id="i3"><rect class="note"/><text class="noteText">a note</text></g>
    </svg>`
    annotateNodeDataIds(host)
    annotateSequenceIdentities(host, { messages: 0, notes: 1, blocks: 0 })
    const resolver: DataIdResolver = (dataId) =>
      nodeDataIdResolver(['甲'])(dataId) ?? elementDataIdResolver(['note:1'])(dataId)
    // 节点反注只认 g.node：rect.note 拿到的是注释身份，不是节点 id
    expect(host.querySelector('rect.note')?.getAttribute('data-id')).toBe('note:1')
    expect(selectionFromEventTarget(host.querySelector('rect.note'), resolver)).toEqual({
      kind: 'element',
      elementId: 'note:1',
    })
    // 点注释文字：宿主 <g> 的 mermaid iN 不被任何 resolver 认领，靠子元素上的身份归属
    expect(selectionFromEventTarget(host.querySelector('text.noteText'), resolver)).toEqual({
      kind: 'element',
      elementId: 'note:1',
    })
    // 节点自身照旧命中
    expect(selectionFromEventTarget(host.querySelector('g.node > rect'), resolver)).toEqual({
      kind: 'node',
      id: '甲',
    })
  })
})

describe('连线命中判定：沿真实路径采样（工单 02）', () => {
  /** 一条斜线：bbox 中心明显不在路径上（class 斜线 bbox 退化的等价场景） */
  function buildSlantedEdge(): { host: HTMLElement; path: Element } {
    const host = document.createElement('div')
    host.innerHTML = `<svg><path data-id="relation:1"/></svg>`
    const path = host.querySelector('path')!
    stubStraightGeometry(path, 10, 10, 30, 30)
    // 若命中判定偷偷用 bbox 中心，这里会直接抛错暴露
    forbidBBox(path)
    return { host, path }
  }

  it('落在路径上 → 命中该连线身份', () => {
    const { host } = buildSlantedEdge()
    expect(hitTestEdgeIdentity(host, 20, 20, 4)).toBe('relation:1')
    expect(hitTestEdgeIdentity(host, 10, 10, 4)).toBe('relation:1') // 端点
  })

  it('bbox 退化场景：点在 bbox 中心之外（斜线对角空隙）不误判', () => {
    const { host } = buildSlantedEdge()
    // bbox（10,10)-(30,30) 的中心是 (20,20)，恰在线上；取 (10,30) 这个 bbox 内但离线 14px 的点
    expect(hitTestEdgeIdentity(host, 10, 30, 4)).toBeNull()
    expect(hitTestEdgeIdentity(host, 30, 10, 4)).toBeNull()
  })

  it('超出容差 → null；多候选取最近的一条', () => {
    const host = document.createElement('div')
    host.innerHTML = `<svg><path data-id="relation:1"/><path data-id="relation:2"/></svg>`
    const [a, b] = Array.from(host.querySelectorAll('path'))
    stubStraightGeometry(a, 0, 0, 100, 0)
    stubStraightGeometry(b, 0, 10, 100, 10)
    expect(hitTestEdgeIdentity(host, 50, 50, 4)).toBeNull()
    expect(hitTestEdgeIdentity(host, 50, 1, 4)).toBe('relation:1')
    expect(hitTestEdgeIdentity(host, 50, 9, 4)).toBe('relation:2')
  })

  it('只认位置序身份：节点 id / flowchart 边 data-id / mermaid iN 不参与几何命中', () => {
    const host = document.createElement('div')
    host.innerHTML = `<svg>
      <g data-id="A"><rect/></g>
      <path data-id="L_A_B_0"/>
      <line data-id="i0"/>
      <path data-id="message:1"/>
    </svg>`
    for (const el of Array.from(host.querySelectorAll('[data-id]'))) stubStraightGeometry(el, 0, 0, 100, 0)
    expect(hitTestEdgeIdentity(host, 50, 0, 4)).toBe('message:1')
  })

  it('没有几何 API（如未渲染 / 非几何元素）→ null，不抛错', () => {
    const host = document.createElement('div')
    host.innerHTML = `<svg><g data-id="note:1"><rect class="note"/></g><path data-id="block:1"/></svg>`
    expect(() => hitTestEdgeIdentity(host, 0, 0, 4)).not.toThrow()
    expect(hitTestEdgeIdentity(host, 0, 0, 4)).toBeNull()
  })
})
