import { describe, expect, it } from 'vitest'
import {
  CANVAS_MIN,
  NARROW_BREAKPOINT,
  clampWidth,
  isNarrowViewport,
  maxCodePanelWidth,
  maxPropsPanelWidth,
  resolveCollapse,
} from '../pane-layout'

describe('窄屏只显示画布', () => {
  it('断点以下为窄屏', () => {
    expect(isNarrowViewport(NARROW_BREAKPOINT - 1)).toBe(true)
    expect(isNarrowViewport(375)).toBe(true)
  })

  it('断点及以上为全模式', () => {
    expect(isNarrowViewport(NARROW_BREAKPOINT)).toBe(false)
    expect(isNarrowViewport(1920)).toBe(false)
  })

  it('断点保证全模式下三栏最小宽度 + 分隔条放得下', () => {
    // 240(代码) + 260(属性) + CANVAS_MIN + 6*2(分隔条) + 折叠按钮 ≈ 850
    const minSum = 240 + 260 + CANVAS_MIN + 12 + 30
    expect(NARROW_BREAKPOINT).toBeGreaterThanOrEqual(minSum)
  })
})

describe('宽度夹取', () => {
  it('低于最小宽度时抬到最小', () => {
    expect(clampWidth(100, 240, 800)).toBe(240)
  })

  it('高于最大宽度时压到最大', () => {
    expect(clampWidth(900, 240, 800)).toBe(800)
  })

  it('区间内原样返回', () => {
    expect(clampWidth(400, 240, 800)).toBe(400)
  })

  it('max 低于 min 时以 min 为准（极限视宽不破版）', () => {
    expect(clampWidth(300, 260, 200)).toBe(260)
  })
})

describe('面板最大宽度保护（画布永不被挤破）', () => {
  it('代码面板最大宽度 = 视口 − 画布最小 − 属性面板占用', () => {
    expect(maxCodePanelWidth(1400, 340)).toBe(1400 - CANVAS_MIN - 340)
  })

  it('属性面板折叠时不占用宽度', () => {
    expect(maxCodePanelWidth(1400, null)).toBe(1400 - CANVAS_MIN)
  })

  it('属性面板最大宽度 = 视口 − 画布最小 − 代码面板占用', () => {
    expect(maxPropsPanelWidth(1400, 400)).toBe(1400 - CANVAS_MIN - 400)
  })

  it('拖到极限边界后画布仍保有最小宽度', () => {
    const windowWidth = 960
    const code = clampWidth(
      maxCodePanelWidth(windowWidth, 260),
      240,
      maxCodePanelWidth(windowWidth, 260),
    )
    expect(windowWidth - code - 260).toBeGreaterThanOrEqual(CANVAS_MIN)
  })
})

describe('折叠互斥', () => {
  it('另一面板未折叠时允许折叠', () => {
    expect(resolveCollapse(true, false)).toBe(true)
    expect(resolveCollapse(false, false)).toBe(false)
  })

  it('另一面板已折叠时不允许再折叠', () => {
    expect(resolveCollapse(true, true)).toBe(false)
  })
})
