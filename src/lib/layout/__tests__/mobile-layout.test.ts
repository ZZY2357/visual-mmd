import { describe, expect, it } from 'vitest'
import {
  MOBILE_BREAKPOINT,
  MOBILE_DEFAULT_PANE,
  MOBILE_PANES,
  isMobileViewport,
} from '../mobile-layout'
import { NARROW_BREAKPOINT } from '../pane-layout'

describe('手机单栏断点（工单 15）', () => {
  it('断点及以下为手机（单栏 + 切换器）', () => {
    expect(isMobileViewport(MOBILE_BREAKPOINT)).toBe(true)
    expect(isMobileViewport(375)).toBe(true)
  })

  it('断点以上不是手机', () => {
    expect(isMobileViewport(MOBILE_BREAKPOINT + 1)).toBe(false)
    expect(isMobileViewport(1024)).toBe(false)
  })

  it('手机断点落在窄屏断点之内（手机是窄屏的子集）', () => {
    expect(MOBILE_BREAKPOINT).toBeLessThan(NARROW_BREAKPOINT)
  })

  it('面板词汇覆盖三个面板，顺序为 代码 | 画布 | 属性', () => {
    expect(MOBILE_PANES).toEqual(['code', 'canvas', 'properties'])
  })

  it('默认显示画布', () => {
    expect(MOBILE_DEFAULT_PANE).toBe('canvas')
    expect(MOBILE_PANES).toContain(MOBILE_DEFAULT_PANE)
  })
})
