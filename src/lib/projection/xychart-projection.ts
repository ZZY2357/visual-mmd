import type { SourceDocument } from '../pipeline/document'
import {
  decodeXychartText,
  isValidXychartNumberInput,
  isValidXychartText,
  parseXychartNumber,
  type XychartAxisData,
  type XychartHeaderData,
  type XychartSeriesData,
  type XychartTitleData,
} from '../pipeline/xychart'
import type { Selection } from './selection'

/**
 * xychart 投影（more-diagrams 工单 14，ADR-0008/0016）：从解析产物派生的只读结构
 * 视图，驱动结构树与属性表单。投影只认解析产物的 *Data（ADR-0016）。
 *
 * - 系列 = 节点级元素（位置序身份 `series:N`，ADR-0012——语法无元素 id）；
 *   标题与轴 = 文档级属性元素（固定 id）。
 * - **数值原样保留**：values 携带原文（含负号/小数/`.5` 形态），表单编辑保留原字面
 *   格式（`45` 不写 `45.0`，工单定案）；非法数值词法原样保留并标注（不静默改写）。
 * - **点标签（v11.16）不展开**（工单定案）：任一条目带引号标签 → editable=false，
 *   表单只提示，值编辑意图被落码门拒绝。
 */
export interface ProjectionXychartSeries {
  /** `series:N`，位置序身份（ADR-0012）+ 编辑意图寻址键 */
  elementId: string
  seriesType: 'line' | 'bar'
  /** 系列名（解码后）；null = 未命名系列 */
  name: string | null
  /** 名字是否过落码门（false = 手写源码非法名，结构树标注） */
  nameValid: boolean
  /** 数组条目（文档序）：raw 是 token 原文，num 是数值（非法词法 null），label 是
   * v11.16 点标签（无标签 null） */
  values: { raw: string; num: number | null; label: string | null }[]
  /** 是否可值编辑（全部条目为纯数值且至少一个——带点标签的系列整体锁定） */
  editable: boolean
}

export interface ProjectionXychartAxis {
  axis: 'x' | 'y'
  /** 轴标题（解码后）；null = 无标题段（手写源码清单外形态，原样保留） */
  title: string | null
  titleValid: boolean
  /** 后半段形态：categories = 类别数组；range = 数值 range；none = 无后半段 */
  form: 'categories' | 'range' | 'none'
  /** 类别条目（form = categories 时；text 为解码文本，rawValid 标注手写非法词） */
  categories: { raw: string; text: string; rawValid: boolean }[]
  /** 数值 range（form = range 时；原文保留） */
  range: { min: string; max: string } | null
  rangeValid: boolean
}

export interface XychartProjection {
  /** 图表方向（声明头缺省 = vertical） */
  orientation: 'vertical' | 'horizontal'
  /** 图表标题；null = 无标题行 */
  title: { text: string; textValid: boolean } | null
  xAxis: ProjectionXychartAxis
  yAxis: ProjectionXychartAxis
  /** 全部系列（文档序） */
  series: ProjectionXychartSeries[]
}

/** 从解析产物构建 xychart 投影（纯函数，ADR-0016：投影吃解析产物） */
export function buildXychartProjection(doc: SourceDocument): XychartProjection {
  let orientation: 'vertical' | 'horizontal' = 'vertical'
  let title: XychartProjection['title'] = null
  const axes: Record<'x' | 'y', ProjectionXychartAxis | null> = { x: null, y: null }
  const series: ProjectionXychartSeries[] = []

  for (const part of doc.elements) {
    const kind = part.element.kind
    if (kind === 'xychart-header') {
      const d = part.element as XychartHeaderData
      if (d.orientation !== undefined) orientation = d.orientation
      continue
    }
    if (kind === 'xychart-title') {
      const d = part.element as XychartTitleData
      const text = d.textRaw.startsWith('"') && d.textRaw.endsWith('"')
        ? d.textRaw.slice(1, -1)
        : d.textRaw
      title = { text, textValid: isValidXychartText(text) }
      continue
    }
    if (kind === 'xychart-axis') {
      const d = part.element as XychartAxisData
      let form: ProjectionXychartAxis['form'] = 'none'
      let categories: ProjectionXychartAxis['categories'] = []
      let range: ProjectionXychartAxis['range'] = null
      if (d.restRaw !== null) {
        if (d.restRaw.startsWith('[')) {
          form = 'categories'
          const inner = d.restRaw.slice(1, -1)
          for (const token of splitCategories(inner)) {
            const quoted = token.startsWith('"') && token.endsWith('"') && token.length >= 2
            const text = quoted ? token.slice(1, -1) : token
            categories.push({ raw: token, text, rawValid: isValidXychartText(text) })
          }
        } else {
          form = 'range'
          const m = /^\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*-->\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*$/.exec(d.restRaw)
          if (m !== null) {
            range = { min: m[1]!, max: m[2]! }
          } else {
            // 手写非法 range 原样保留并标注
            range = { min: d.restRaw, max: '' }
          }
        }
      }
      const titleText = d.titleRaw === null ? null : decodeXychartText(d.titleRaw)
      axes[d.axis] = {
        axis: d.axis,
        title: titleText,
        titleValid: titleText === null ? true : isValidXychartText(titleText),
        form,
        categories,
        range,
        rangeValid:
          form !== 'range' ||
          (range !== null && isValidXychartNumberInput(range.min) && isValidXychartNumberInput(range.max)),
      }
      continue
    }
    if (kind === 'xychart-series') {
      const d = part.element as XychartSeriesData
      const values = seriesValuesOf(d)
      const name = d.nameRaw === null ? null : decodeXychartText(d.nameRaw)
      series.push({
        elementId: part.id,
        seriesType: d.seriesType,
        name,
        nameValid: name === null ? true : isValidXychartText(name),
        values,
        editable: values.length > 0 && values.every((v) => v.label === null && v.num !== null),
      })
    }
  }

  return {
    orientation,
    title,
    xAxis: axes.x ?? emptyAxis('x'),
    yAxis: axes.y ?? emptyAxis('y'),
    series,
  }
}

/** 类别 token 切分（顶层逗号；引号段内的逗号不切） */
function splitCategories(inner: string): string[] {
  const tokens: string[] = []
  let current = ''
  let inQuote = false
  for (const ch of inner) {
    if (ch === '"') {
      inQuote = !inQuote
      current += ch
      continue
    }
    if (ch === ',' && !inQuote) {
      tokens.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim() !== '') tokens.push(current.trim())
  return tokens.filter((t) => t !== '')
}

function seriesValuesOf(d: XychartSeriesData): ProjectionXychartSeries['values'] {
  const inner = d.arrayRaw.slice(1, -1)
  const out: ProjectionXychartSeries['values'] = []
  let inQuote = false
  let token = ''
  const flush = (): void => {
    const trimmed = token.trim()
    if (trimmed === '') return
    if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
      out.push({ raw: trimmed, num: null, label: trimmed.slice(1, -1) })
    } else {
      out.push({ raw: trimmed, num: parseXychartNumber(trimmed), label: null })
    }
    token = ''
  }
  for (const ch of inner) {
    if (ch === '"') {
      inQuote = !inQuote
      token += ch
      continue
    }
    if ((ch === ',' || ch === ' ' || ch === '\t') && !inQuote) {
      flush()
      continue
    }
    token += ch
  }
  flush()
  void inQuote
  return out
}

function emptyAxis(axis: 'x' | 'y'): ProjectionXychartAxis {
  return { axis, title: null, titleValid: true, form: 'none', categories: [], range: null, rangeValid: true }
}

// ---------- 选中回落 ----------

/** 选中目标在投影中仍存在则原样返回，否则回落 null（由调用方回落图表级） */
export function resolveXychartSelection(
  projection: XychartProjection,
  selection: Selection | null,
): Selection | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'diagram':
      return selection
    case 'xychart-title':
      return projection.title !== null ? selection : null
    case 'xychart-axis':
      return selection.axis === 'x' || selection.axis === 'y' ? selection : null
    case 'xychart-series':
      return projection.series.some((s) => s.elementId === selection.elementId) ? selection : null
    default:
      return null
  }
}
