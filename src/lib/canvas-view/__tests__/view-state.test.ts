import { describe, expect, it } from 'vitest'
import { MAX_SCALE, MIN_SCALE, clampScale, fitView, isBackgroundDragTarget, zoomAtPoint } from '../view-state'
import { svgIntrinsicSize } from '../use-canvas-view'

describe('clampScale', () => {
  it('落在 0.25–4 区间内', () => {
    expect(clampScale(0.1)).toBe(MIN_SCALE)
    expect(clampScale(10)).toBe(MAX_SCALE)
    expect(clampScale(1.5)).toBe(1.5)
  })
})

describe('fitView', () => {
  it('大图等比缩小并留边居中', () => {
    // 容器 1000×800，图 2000×400：受宽度限制 scale = (1000-48)/2000 = 0.476
    const view = fitView(1000, 800, 2000, 400)
    expect(view.scale).toBeCloseTo(952 / 2000)
    expect(view.tx).toBeCloseTo(24)
    expect(view.ty).toBeCloseTo((800 - 400 * view.scale) / 2)
  })

  it('小图不放大超过 1 倍，直接居中', () => {
    const view = fitView(1000, 800, 200, 100)
    expect(view.scale).toBe(1)
    expect(view.tx).toBe(400)
    expect(view.ty).toBe(350)
  })

  it('非法尺寸退回恒等视图', () => {
    expect(fitView(0, 0, 100, 100)).toEqual({ scale: 1, tx: 0, ty: 0 })
    expect(fitView(100, 100, 0, 0)).toEqual({ scale: 1, tx: 0, ty: 0 })
  })
})

describe('zoomAtPoint', () => {
  it('锚点下的内容点缩放前后保持在同一屏幕位置', () => {
    const view = { scale: 1, tx: 10, ty: 20 }
    const px = 300
    const py = 200
    const next = zoomAtPoint(view, 2, px, py)
    // 锚点对应的内容坐标：px = tx + scale × cx
    const cx = (px - view.tx) / view.scale
    const cy = (py - view.ty) / view.scale
    expect(next.tx + next.scale * cx).toBeCloseTo(px)
    expect(next.ty + next.scale * cy).toBeCloseTo(py)
  })

  it('缩放值先经过 clamp', () => {
    const view = { scale: 1, tx: 0, ty: 0 }
    expect(zoomAtPoint(view, 100, 50, 50).scale).toBe(MAX_SCALE)
    expect(zoomAtPoint(view, 0.01, 50, 50).scale).toBe(MIN_SCALE)
  })

  it('连续缩放叠加不超过范围', () => {
    let view = { scale: 4, tx: 0, ty: 0 }
    view = zoomAtPoint(view, view.scale * 1.5, 100, 100)
    expect(view.scale).toBe(MAX_SCALE)
  })
})

describe('svgIntrinsicSize', () => {
  const parse = (html: string) => {
    const host = document.createElement('div')
    host.innerHTML = html
    return svgIntrinsicSize(host.querySelector('svg') as Element)
  }

  it('优先 width/height 属性', () => {
    expect(parse('<svg width="640" height="480" viewBox="0 0 100 100"></svg>')).toEqual({
      width: 640,
      height: 480,
    })
  })

  it('width/height 缺失或百分比时回落 viewBox', () => {
    expect(parse('<svg width="100%" viewBox="0 0 320 240"></svg>')).toEqual({ width: 320, height: 240 })
    expect(parse('<svg viewBox="0,0 128 64"></svg>')).toEqual({ width: 128, height: 64 })
  })

  it('无从读取尺寸时返回 null', () => {
    expect(parse('<svg></svg>')).toBeNull()
    expect(parse('<svg viewBox="0 0 0 10"></svg>')).toBeNull()
  })
})

describe('isBackgroundDragTarget（工单 12：背景拖拽的命中判定）', () => {
  const parse = (html: string) => {
    const host = document.createElement('div')
    host.innerHTML = html
    return host.firstElementChild as Element
  }

  it('普通背景元素算背景：可以启动拖拽平移', () => {
    expect(isBackgroundDragTarget(parse('<div class="canvas-bg"></div>'))).toBe(true)
  })

  it('button 及其嵌套子元素（真实点击落在内层 span）不算背景', () => {
    const button = parse('<button><span>适应窗口</span></button>')
    expect(isBackgroundDragTarget(button)).toBe(false)
    expect(isBackgroundDragTarget(button.querySelector('span') as Element)).toBe(false)
  })

  it('其余交互控件（input / a[href] / contenteditable）不算背景', () => {
    expect(isBackgroundDragTarget(parse('<input type="text">'))).toBe(false)
    expect(isBackgroundDragTarget(parse('<a href="#x">链接</a>'))).toBe(false)
    expect(isBackgroundDragTarget(parse('<div contenteditable="true"></div>'))).toBe(false)
    expect(isBackgroundDragTarget(parse('<div contenteditable=""></div>'))).toBe(false)
  })

  it('无 href 的 a 不是交互控件：仍算背景（与键盘排除表口径一致）', () => {
    expect(isBackgroundDragTarget(parse('<a>锚点</a>'))).toBe(true)
  })

  it('svg 及其后代（节点/连线/标签）不算背景：指针事件留给选中链路', () => {
    const svg = parse('<svg width="100" height="100"><g><rect /><text>节点</text></g></svg>')
    expect(isBackgroundDragTarget(svg)).toBe(false)
    expect(isBackgroundDragTarget(svg.querySelector('g') as Element)).toBe(false)
    expect(isBackgroundDragTarget(svg.querySelector('text') as Element)).toBe(false)
  })
})
