/**
 * 文件进出（工单 10）的纯逻辑与可 mock 接缝：
 * - 文件名处理：图表名 → 安全文件名（含扩展名，不重复加点）
 * - 下载：Blob → a[download] 触发浏览器下载（依赖 DOM，测试中用 spy 验证调用）
 * - 导入：File → 文本（.mmd 内容原样进入代码面板，非法内容走既有错误冻结路径）
 * - SVG → PNG：解析 SVG、按 scale 计算光栅化尺寸、序列化为可加载的 data URL，
 *   再经 canvas 光栅化。数据处理部分（prepareSvgForRaster）是纯 DOM 逻辑可单测；
 *   canvas 绘制与 toBlob 属于浏览器渲染层，不进单元测试（spec 的测试决策）。
 */

/** 文件名清洗后为空时的兜底名 */
export const FALLBACK_FILE_NAME = 'diagram'

/** Windows/macOS 通用非法字符与控制字符 */
// 控制字符（\u0000-\u001F）正是要清洗的目标，故显式豁免 no-control-regex。
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS = /[\\/:*?"<>|\u0000-\u001F]/g

/** 图表名 → 安全文件名主体（去路径分隔符等非法字符，空白收敛，空则兜底） */
export function sanitizeFileName(name: string): string {
  const cleaned = name.replace(FORBIDDEN_CHARS, '').trim().replace(/\s+/g, ' ')
  return cleaned === '' ? FALLBACK_FILE_NAME : cleaned
}

/** 文件名主体 + 扩展名（无点前缀传入）；主体已带该扩展名时不重复添加 */
export function withExtension(base: string, ext: string): string {
  return base.toLowerCase().endsWith(`.${ext.toLowerCase()}`) ? base : `${base}.${ext}`
}

/** 触发浏览器下载（接缝：测试中 spy document/URL 即可验证） */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/** 读取用户选择的文件为文本（.mmd 是纯文本） */
export function readFileText(file: File): Promise<string> {
  return file.text()
}

export interface PreparedSvg {
  /** 光栅化像素宽（含 scale） */
  width: number
  /** 光栅化像素高（含 scale） */
  height: number
  /** 补全 xmlns 与尺寸属性后的 SVG 标记（可直接进 <img>） */
  markup: string
}

function parseLength(value: string | null): number | null {
  if (value === null) return null
  const match = /^\s*(\d+(?:\.\d+)?)\s*(?:px|pt|em|%)?\s*$/.exec(value)
  if (match === null) return null
  const n = Number.parseFloat(match[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * 把 mermaid 渲染产物整理成可光栅化的 SVG：
 * - 解析失败（非法 SVG）抛错
 * - 尺寸优先取 width/height 属性，缺失时回落到 viewBox
 * - 乘以 scale 得到高分辨率输出尺寸（高分辨率：默认 2x）
 * - 补 xmlns，保证 <img> 能加载
 */
export function prepareSvgForRaster(svgText: string, scale = 2): PreparedSvg {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  const svg = doc.documentElement
  if (svg.nodeName === 'parsererror' || doc.querySelector('parsererror') !== null || svg.nodeName.toLowerCase() !== 'svg') {
    throw new Error('invalid-svg')
  }

  const viewBox = svg.getAttribute('viewBox')
  let width = parseLength(svg.getAttribute('width'))
  let height = parseLength(svg.getAttribute('height'))
  if ((width === null || height === null) && viewBox !== null) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number)
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      width ??= parts[2]
      height ??= parts[3]
    }
  }
  if (width === null || height === null) {
    throw new Error('svg-size-unknown')
  }

  if (svg.getAttribute('xmlns') === null) {
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  }
  svg.setAttribute('width', String(Math.round(width * scale)))
  svg.setAttribute('height', String(Math.round(height * scale)))

  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    markup: new XMLSerializer().serializeToString(svg),
  }
}

export interface SvgToPngOptions {
  /** 光栅化倍率（默认 2x 高分辨率） */
  scale?: number
  /** PNG 底色（mermaid SVG 自带背景时以 fill 覆盖，透明背景默认铺白） */
  background?: string
}

/** 加载 SVG data URL 到 Image（独立出来便于必要时 mock） */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('svg-image-load-failed'))
    img.src = src
  })
}

/**
 * SVG 文本 → PNG Blob：与预览渲染一致（输入即预览的同一份 SVG 字符串）。
 * 高分辨率（默认 2x）、默认铺白色背景。
 */
export async function svgToPngBlob(svgText: string, options: SvgToPngOptions = {}): Promise<Blob> {
  const { scale = 2, background = '#ffffff' } = options
  const prepared = prepareSvgForRaster(svgText, scale)
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(prepared.markup)}`
  const img = await loadImage(dataUrl)

  const canvas = document.createElement('canvas')
  canvas.width = prepared.width
  canvas.height = prepared.height
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('canvas-2d-unavailable')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, prepared.width, prepared.height)

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error('canvas-toblob-failed'))
        return
      }
      resolve(blob)
    }, 'image/png')
  })
}
