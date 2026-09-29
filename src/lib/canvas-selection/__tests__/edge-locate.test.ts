import { describe, expect, it } from 'vitest'
import {
  annotateClassRelationIdentities,
  annotateSequenceIdentities,
  hitTestEdgeIdentity,
  relationShapesOf,
} from '../edge-locate'

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

  it('注释（rect.note 的宿主 g）按文档序标 note:N', () => {
    const host = buildSequenceSvg()
    annotateSequenceIdentities(host, counts)
    const noteGroups = Array.from(host.querySelectorAll('rect.note')).map((r) => r.parentElement)
    expect(noteGroups.map((g) => g?.getAttribute('data-id'))).toEqual(['note:1', 'note:2'])
    // 注释内的文本随宿主 g 一起被覆盖，点文本也可归属
    expect(noteGroups[0]?.querySelector('text.noteText')?.textContent).toBe('a note')
  })

  it('块（line.loopLine 的宿主 g，去重）标 block:N', () => {
    const host = buildSequenceSvg()
    annotateSequenceIdentities(host, counts)
    const blockGroup = host.querySelector('line.loopLine')?.parentElement
    expect(blockGroup?.getAttribute('data-id')).toBe('block:1')
    // 同一块的多条 loopLine 只产生一个身份
    const distinct = new Set(Array.from(host.querySelectorAll('line.loopLine')).map((l) => l.parentElement?.getAttribute('data-id')))
    expect(Array.from(distinct)).toEqual(['block:1'])
  })

  it('某个种类条数与投影不符 → 仅该种类不标（其余照标）', () => {
    const host = buildSequenceSvg()
    annotateSequenceIdentities(host, { messages: 9, notes: 2, blocks: 1 })
    expect(host.querySelectorAll('[data-id^="message:"]')).toHaveLength(0)
    expect(host.querySelector('rect.note')?.parentElement?.getAttribute('data-id')).toBe('note:1')
    expect(host.querySelector('line.loopLine')?.parentElement?.getAttribute('data-id')).toBe('block:1')
  })

  it('幂等：重复标注不改变结果', () => {
    const host = buildSequenceSvg()
    annotateSequenceIdentities(host, counts)
    const first = host.innerHTML
    annotateSequenceIdentities(host, counts)
    expect(host.innerHTML).toBe(first)
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
