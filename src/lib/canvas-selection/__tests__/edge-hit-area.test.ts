import { describe, expect, it } from 'vitest'
import { addEdgeHitAreas } from '../edge-hit-area'
import { selectionFromEventTarget } from '../data-id'
import type { DataIdResolver } from '../data-id'

/** 模拟 mermaid flowchart 渲染产物：g.edgePaths 内每条边一个带 data-id 的 path */
function buildSvg(): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = `<svg>
    <g class="edgePaths">
      <path id="L_A_B_0" data-id="L_A_B_0" class="flowchart-link" d="M 0 0 L 10 10" marker-end="url(#arrow)"/>
      <path id="L_A_B_1" data-id="L_A_B_1" class="flowchart-link" d="M 0 5 L 10 15"/>
    </g>
  </svg>`
  return host
}

const resolver: DataIdResolver = (dataId) =>
  dataId === 'L_A_B_0' ? { kind: 'edge', from: 'A', to: 'B', occurrence: 1 } : null

describe('连线命中区域（工单 01）', () => {
  it('每条边注入一条透明宽描边的命中克隆，data-id 与原 path 一致', () => {
    const host = buildSvg()
    addEdgeHitAreas(host)
    const hits = host.querySelectorAll('[data-vm-hit]')
    expect(hits.length).toBe(2)
    expect(hits[0].getAttribute('data-id')).toBe('L_A_B_0')
    const style = hits[0].getAttribute('style') ?? ''
    expect(style).toContain('stroke: transparent')
    expect(style).toContain('stroke-width: 12px')
    expect(style).toContain('pointer-events: stroke')
    // 原渲染 path 不动（克隆也带 data-id，排除后计数）
    expect(host.querySelectorAll('.edgePaths path[data-id]:not([data-vm-hit])').length).toBe(2)
  })

  it('命中克隆的 data-id 走既有选中链路，可解析出边选中', () => {
    const host = buildSvg()
    addEdgeHitAreas(host)
    const hit = host.querySelector('[data-vm-hit][data-id="L_A_B_0"]')
    expect(hit).not.toBeNull()
    expect(selectionFromEventTarget(hit, resolver)).toEqual({
      kind: 'edge',
      from: 'A',
      to: 'B',
      occurrence: 1,
    })
  })

  it('重复调用幂等，不产生重复克隆', () => {
    const host = buildSvg()
    addEdgeHitAreas(host)
    addEdgeHitAreas(host)
    expect(host.querySelectorAll('[data-vm-hit]').length).toBe(2)
  })

  it('克隆去掉 marker，避免透明描边重绘箭头', () => {
    const host = buildSvg()
    addEdgeHitAreas(host)
    const hit = host.querySelector('[data-vm-hit]')
    expect(hit?.getAttribute('marker-end')).toBeNull()
  })
})
