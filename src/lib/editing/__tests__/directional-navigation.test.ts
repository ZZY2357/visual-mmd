import { describe, expect, it } from 'vitest'
import { pickDirectionalTarget, type DirectionalPoint } from '../directional-navigation'

/** 便捷构造候选（id 即期望返回值） */
function at(id: string, cx: number, cy: number): DirectionalPoint & { id: string } {
  return { id, cx, cy }
}

const ORIGIN: DirectionalPoint = { cx: 0, cy: 0 }

describe('pickDirectionalTarget（工单 14 方位导航）', () => {
  it('四向锥形各取到该方向的候选', () => {
    const candidates = [at('right', 10, 0), at('left', -10, 0), at('down', 0, 10), at('up', 0, -10)]
    expect(pickDirectionalTarget(ORIGIN, candidates, 'ArrowRight')).toBe('right')
    expect(pickDirectionalTarget(ORIGIN, candidates, 'ArrowLeft')).toBe('left')
    expect(pickDirectionalTarget(ORIGIN, candidates, 'ArrowDown')).toBe('down')
    expect(pickDirectionalTarget(ORIGIN, candidates, 'ArrowUp')).toBe('up')
  })

  it('正好 45°（|dx| == |dy|）算候选：右下角点对 → 与 ↓ 都命中', () => {
    const candidates = [at('diagonal', 10, 10)]
    expect(pickDirectionalTarget(ORIGIN, candidates, 'ArrowRight')).toBe('diagonal')
    expect(pickDirectionalTarget(ORIGIN, candidates, 'ArrowDown')).toBe('diagonal')
  })

  it('锥外候选被排除：dx=10, dy=30 对 → 不命中，但对 ↓ 命中', () => {
    const candidates = [at('steep', 10, 30)]
    expect(pickDirectionalTarget(ORIGIN, candidates, 'ArrowRight')).toBeNull()
    expect(pickDirectionalTarget(ORIGIN, candidates, 'ArrowDown')).toBe('steep')
  })

  it('斜向远 vs 正向近：正向近者胜', () => {
    const candidates = [at('diagonal', 10, 10), at('straight', 10, 0)]
    expect(pickDirectionalTarget(ORIGIN, candidates, 'ArrowRight')).toBe('straight')
  })

  it('斜向近 vs 正向远：斜向近者胜', () => {
    const candidates = [at('straight', 20, 0), at('diagonal', 11, 10)]
    expect(pickDirectionalTarget(ORIGIN, candidates, 'ArrowRight')).toBe('diagonal')
  })

  it('距离并列时取 candidates 数组靠前者（交换顺序则结果随之改变）', () => {
    const a = at('a', 10, 10)
    const b = at('b', 10, -10) // 与 a 等距，都在 → 锥内
    expect(pickDirectionalTarget(ORIGIN, [a, b], 'ArrowRight')).toBe('a')
    expect(pickDirectionalTarget(ORIGIN, [b, a], 'ArrowRight')).toBe('b')
  })

  it('某方向锥内无候选 → null', () => {
    const candidates = [at('left', -10, 0)]
    expect(pickDirectionalTarget(ORIGIN, candidates, 'ArrowRight')).toBeNull()
    expect(pickDirectionalTarget(ORIGIN, candidates, 'ArrowUp')).toBeNull()
    expect(pickDirectionalTarget(ORIGIN, candidates, 'ArrowDown')).toBeNull()
    expect(pickDirectionalTarget(ORIGIN, candidates, 'ArrowLeft')).toBe('left')
  })

  it('空候选数组 → null', () => {
    expect(pickDirectionalTarget(ORIGIN, [], 'ArrowRight')).toBeNull()
    expect(pickDirectionalTarget(ORIGIN, [], 'ArrowDown')).toBeNull()
  })

  it('非方向键 → null', () => {
    const candidates = [at('right', 10, 0)]
    expect(pickDirectionalTarget(ORIGIN, candidates, 'Tab')).toBeNull()
    expect(pickDirectionalTarget(ORIGIN, candidates, 'a')).toBeNull()
    expect(pickDirectionalTarget(ORIGIN, candidates, 'Escape')).toBeNull()
  })

  it('锚点自身若在候选中，不会命中任何锥形（返回的是别的节点）', () => {
    const anchor = { cx: 5, cy: 5 }
    const candidates = [at('self', 5, 5), at('right', 20, 5)]
    expect(pickDirectionalTarget(anchor, candidates, 'ArrowRight')).toBe('right')
    // 只剩自己时四向都无候选
    expect(pickDirectionalTarget(anchor, [at('self', 5, 5)], 'ArrowRight')).toBeNull()
    expect(pickDirectionalTarget(anchor, [at('self', 5, 5)], 'ArrowLeft')).toBeNull()
    expect(pickDirectionalTarget(anchor, [at('self', 5, 5)], 'ArrowUp')).toBeNull()
    expect(pickDirectionalTarget(anchor, [at('self', 5, 5)], 'ArrowDown')).toBeNull()
  })

  it('工单手算表场景：B(656,347) 的候选 A/C/D', () => {
    const anchor = { cx: 656, cy: 347 } // B
    const candidates = [at('A', 656, 189), at('C', 656, 650), at('D', 704, 565)]
    expect(pickDirectionalTarget(anchor, candidates, 'ArrowUp')).toBe('A')
    expect(pickDirectionalTarget(anchor, candidates, 'ArrowDown')).toBe('D') // D 比 C 近
    expect(pickDirectionalTarget(anchor, candidates, 'ArrowLeft')).toBeNull()
    expect(pickDirectionalTarget(anchor, candidates, 'ArrowRight')).toBeNull()
  })
})
