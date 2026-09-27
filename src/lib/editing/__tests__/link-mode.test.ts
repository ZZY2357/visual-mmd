import { describe, expect, it } from 'vitest'
import { linkModeTransition } from '../link-mode'

/**
 * 连线模式状态机（工单 07）：idle → pick-start → pick-end → 完成连线；
 * 「从这里连线」带预选起点直接落在 pick-end；Esc / 点击空白任何阶段取消。
 */

describe('linkModeTransition（工单 07 连线模式状态机）', () => {
  it('enter（无预选）→ pick-start', () => {
    expect(linkModeTransition({ stage: 'idle' }, { type: 'enter' }).state).toEqual({ stage: 'pick-start' })
  })

  it('enter（带预选起点）→ 直接 pick-end，省一步', () => {
    expect(linkModeTransition({ stage: 'idle' }, { type: 'enter', preselectedFrom: 'A' }).state).toEqual({
      stage: 'pick-end',
      from: 'A',
    })
  })

  it('pick-start 单击节点 → pick-end（定为起点），不产生连线', () => {
    const { state, completed } = linkModeTransition({ stage: 'pick-start' }, { type: 'click-node', nodeId: 'A' })
    expect(state).toEqual({ stage: 'pick-end', from: 'A' })
    expect(completed).toBeNull()
  })

  it('pick-end 单击节点 → 完成连线并回 idle', () => {
    const { state, completed } = linkModeTransition(
      { stage: 'pick-end', from: 'A' },
      { type: 'click-node', nodeId: 'B' },
    )
    expect(state).toEqual({ stage: 'idle' })
    expect(completed).toEqual({ from: 'A', to: 'B' })
  })

  it('idle 阶段单击节点：状态不变、不产生连线', () => {
    const { state, completed } = linkModeTransition({ stage: 'idle' }, { type: 'click-node', nodeId: 'A' })
    expect(state).toEqual({ stage: 'idle' })
    expect(completed).toBeNull()
  })

  it.each(['click-blank', 'cancel'] as const)('%s：任何非 idle 阶段取消回 idle', (type) => {
    for (const state of [{ stage: 'pick-start' }, { stage: 'pick-end', from: 'A' }] as const) {
      const { state: next, completed } = linkModeTransition(state, { type })
      expect(next).toEqual({ stage: 'idle' })
      expect(completed).toBeNull()
    }
  })
})
