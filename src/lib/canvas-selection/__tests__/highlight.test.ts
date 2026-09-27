import { describe, expect, it } from 'vitest'
import { applyHighlight, clearHighlight } from '../highlight'

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
