import { describe, expect, it } from 'vitest'
import { applyHighlight, clearHighlight, applyHint, clearHint } from '../highlight'

function buildSvg(): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = `<svg>
    <g data-id="A"><rect/></g>
    <g data-id="B"><rect/></g>
    <g data-id="L_A_B_0"><path/></g>
  </svg>`
  return host
}

describe('画布选中高亮（工单 05）', () => {
  it('高亮 data-id 匹配的全部元素', () => {
    const host = buildSvg()
    applyHighlight(host, 'A')
    const marked = host.querySelectorAll('[data-vm-selected]')
    expect(marked.length).toBe(1)
    expect(marked[0].getAttribute('data-id')).toBe('A')
  })

  it('无 data-id 时按 DOM id 匹配（工单 06：mindmap 节点 g id = node_N）', () => {
    const host = document.createElement('div')
    host.innerHTML = `<svg id="m0"><g id="node_1"><rect/></g></svg>`
    applyHighlight(host, 'node_1')
    const marked = host.querySelectorAll('[data-vm-selected]')
    expect(marked.length).toBe(1)
    expect(marked[0].getAttribute('id')).toBe('node_1')
  })

  it('DOM id 不相等的不误标（svg 根 id 等不受影响）', () => {
    const host = document.createElement('div')
    host.innerHTML = `<svg id="m0"><g id="node_1"><rect/></g></svg>`
    applyHighlight(host, 'node_2')
    expect(host.querySelectorAll('[data-vm-selected]').length).toBe(0)
  })

  it('重复调用先清除旧标记（单选语义）', () => {
    const host = buildSvg()
    applyHighlight(host, 'A')
    applyHighlight(host, 'B')
    const marked = host.querySelectorAll('[data-vm-selected]')
    expect(marked.length).toBe(1)
    expect(marked[0].getAttribute('data-id')).toBe('B')
  })

  it('清除后不留任何标记', () => {
    const host = buildSvg()
    applyHighlight(host, 'A')
    clearHighlight(host)
    expect(host.querySelectorAll('[data-vm-selected]').length).toBe(0)
  })

  it('选中元素不存在时静默无事发生（不崩溃）', () => {
    const host = buildSvg()
    expect(() => applyHighlight(host, '不存在')).not.toThrow()
    expect(host.querySelectorAll('[data-vm-selected]').length).toBe(0)
  })
})

describe('画布光标提示（工单 16）', () => {
  it('提示标在 data-id 匹配的元素上，且不写选中高亮标记', () => {
    const host = buildSvg()
    applyHint(host, 'B')
    const hinted = host.querySelectorAll('[data-vm-hinted]')
    expect(hinted.length).toBe(1)
    expect(hinted[0].getAttribute('data-id')).toBe('B')
    // 提示与选中高亮分离：不产生 data-vm-selected
    expect(host.querySelectorAll('[data-vm-selected]').length).toBe(0)
  })

  it('提示与选中高亮可共存于不同元素', () => {
    const host = buildSvg()
    applyHighlight(host, 'A')
    applyHint(host, 'B')
    expect(host.querySelector('[data-id="A"]')?.getAttribute('data-vm-selected')).toBe('true')
    expect(host.querySelector('[data-id="B"]')?.getAttribute('data-vm-hinted')).toBe('true')
  })

  it('重复调用先清除旧提示（至多一个）', () => {
    const host = buildSvg()
    applyHint(host, 'A')
    applyHint(host, 'B')
    const hinted = host.querySelectorAll('[data-vm-hinted]')
    expect(hinted.length).toBe(1)
    expect(hinted[0].getAttribute('data-id')).toBe('B')
  })

  it('clearHint 清除提示但不影响选中高亮', () => {
    const host = buildSvg()
    applyHighlight(host, 'A')
    applyHint(host, 'B')
    clearHint(host)
    expect(host.querySelectorAll('[data-vm-hinted]').length).toBe(0)
    expect(host.querySelectorAll('[data-vm-selected]').length).toBe(1)
  })

  it('元素不存在时静默无事发生', () => {
    const host = buildSvg()
    expect(() => applyHint(host, '不存在')).not.toThrow()
    expect(host.querySelectorAll('[data-vm-hinted]').length).toBe(0)
  })
})
