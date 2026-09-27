import { describe, expect, it, vi, beforeEach, afterEach, type MockInstance } from 'vitest'
import {
  FALLBACK_FILE_NAME,
  downloadBlob,
  prepareSvgForRaster,
  sanitizeFileName,
  withExtension,
} from '../file-io'

describe('sanitizeFileName（图表名 → 文件名）', () => {
  it('普通名称原样保留', () => {
    expect(sanitizeFileName('登录流程图')).toBe('登录流程图')
    expect(sanitizeFileName('user flow 01')).toBe('user flow 01')
  })

  it('剥离路径分隔符与 Windows 非法字符', () => {
    expect(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij')
  })

  it('剥离控制字符并收敛空白', () => {
    expect(sanitizeFileName('  my\t diagram \n v2 ')).toBe('my diagram v2')
  })

  it('清洗后为空时使用兜底名', () => {
    expect(sanitizeFileName('')).toBe(FALLBACK_FILE_NAME)
    expect(sanitizeFileName('///')).toBe(FALLBACK_FILE_NAME)
  })
})

describe('withExtension（拼扩展名不重复）', () => {
  it('为主体补上扩展名', () => {
    expect(withExtension('流程图', 'mmd')).toBe('流程图.mmd')
  })

  it('已带该扩展名时不重复添加', () => {
    expect(withExtension('流程图.mmd', 'mmd')).toBe('流程图.mmd')
    expect(withExtension('graph.SVG', 'svg')).toBe('graph.SVG')
  })

  it('带其他扩展名时仍补目标扩展名', () => {
    expect(withExtension('graph.txt', 'mmd')).toBe('graph.txt.mmd')
  })
})

describe('downloadBlob（浏览器下载接缝）', () => {
  let createObjectURL: MockInstance<(obj: Blob | MediaSource) => string> | undefined

  beforeEach(() => {
    createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:mock-url')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('创建 object URL 并以指定文件名触发下载', () => {
    const blob = new Blob(['flowchart TD\n'], { type: 'text/plain' })
    const appended: HTMLElement[] = []
    const appendSpy = vi
      .spyOn(document.body, 'appendChild')
      .mockImplementation((node) => {
        appended.push(node as HTMLElement)
        return node
      })
    const clickSpy = vi.fn()
    const originalCreateElement = document.createElement.bind(document)
    const anchorCreateSpy = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = originalCreateElement(tag)
      if (tag === 'a') el.click = clickSpy
      return el
    })

    downloadBlob(blob, '流程图.mmd')

    expect(createObjectURL).toHaveBeenCalledWith(blob)
    expect(anchorCreateSpy).toHaveBeenCalledWith('a')
    expect(appended).toHaveLength(1)
    expect((appended[0] as HTMLAnchorElement).download).toBe('流程图.mmd')
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')

    appendSpy.mockRestore()
    anchorCreateSpy.mockRestore()
  })
})

describe('prepareSvgForRaster（SVG → 光栅化准备）', () => {
  it('取 width/height 属性并按 scale 计算输出尺寸', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300px" height="200px"><rect/></svg>'
    const prepared = prepareSvgForRaster(svg, 2)
    expect(prepared.width).toBe(600)
    expect(prepared.height).toBe(400)
    expect(prepared.markup).toContain('width="600"')
    expect(prepared.markup).toContain('height="400"')
  })

  it('缺 width/height 时回落到 viewBox', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 360"></svg>'
    const prepared = prepareSvgForRaster(svg, 2)
    expect(prepared.width).toBe(960)
    expect(prepared.height).toBe(720)
  })

  it('缺 xmlns 时补全，保证 data URL 可加载', () => {
    const svg = '<svg width="10" height="10"></svg>'
    const prepared = prepareSvgForRaster(svg, 1)
    expect(prepared.markup).toContain('xmlns="http://www.w3.org/2000/svg"')
  })

  it('非法 SVG 抛错', () => {
    expect(() => prepareSvgForRaster('not a svg <<<', 2)).toThrow()
  })

  it('尺寸与 viewBox 均缺失时抛错', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
    expect(() => prepareSvgForRaster(svg, 2)).toThrow('svg-size-unknown')
  })

  it('scale 默认 2x，可显式覆盖', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"></svg>'
    expect(prepareSvgForRaster(svg).width).toBe(200)
    expect(prepareSvgForRaster(svg, 3).width).toBe(300)
    expect(prepareSvgForRaster(svg, 3).height).toBe(150)
  })

  it('非整尺寸向上圆整为整数像素', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100.5" height="10.25"></svg>'
    const prepared = prepareSvgForRaster(svg, 2)
    expect(prepared.width).toBe(201)
    expect(prepared.height).toBe(21)
  })
})
