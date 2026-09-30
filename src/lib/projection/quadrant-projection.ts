import type { SourceDocument } from '../pipeline/document'
import {
  type QuadrantAxisData,
  type QuadrantPointData,
  type QuadrantQuadrantData,
  type QuadrantStyleField,
  type QuadrantTitleData,
  isQuadrantCoordinate,
  parseQuadrantCoordinate,
} from '../pipeline/quadrant'
import type { Selection } from './selection'

/**
 * quadrant 投影（more-diagrams 工单 12，ADR-0008/0016）：从解析产物派生的只读结构视图，
 * 驱动结构树与属性表单。投影只认解析产物的 *Data（ADR-0016）。
 *
 * - 点是节点元素：text / 坐标 / 内联样式字段，按**位置序**编 elementId（`point:N`，
 *   ADR-0012——quadrant 语法里点没有 id，位置序是唯一可行身份）。
 * - 轴（x-axis / y-axis）与象限标题（quadrant-1..4）是**文档级属性元素**：无删除语义、
 *   不参与键盘增删；轴只改左右（上下）段文本，象限只改标题文本（工单定案）。
 * - 坐标非法（只能来自手写源码，如 `2` / `1.5`——mermaid 词法直接报错）原样保留在
 *   xText/yText 里，coordsValid = false 供结构树/表单标注（不静默改写，工单定案）。
 * - 内联样式只暴露四个已知字段（color / radius / stroke-color / stroke-width，
 *   与 mermaid parseStyles 的分支一致）；未知键的样式条目不进投影但被解析器逐字保留。
 */
export interface ProjectionQuadrantPoint {
  /** `point:N`，位置序身份（ADR-0012）+ 编辑意图寻址键 */
  elementId: string
  /** 点文本（trim 后） */
  text: string
  /** `:::` 类标注的类名；无 null */
  className: string | null
  /** x 坐标原文 */
  xText: string
  /** y 坐标原文 */
  yText: string
  /** x 坐标数值；非坐标词法 null */
  x: number | null
  /** y 坐标数值；非坐标词法 null */
  y: number | null
  /** 坐标是否在 0–1 且合词法（false = 手写源码越界/畸形，结构树标注） */
  coordsValid: boolean
  /** 内联样式字段值原文；未设置 null */
  color: string | null
  radius: string | null
  strokeColor: string | null
  strokeWidth: string | null
}

export interface ProjectionQuadrantQuadrant {
  /** `quadrant:1..4` */
  elementId: string
  /** 1..4（与 mermaid quadrant-N 编号一致） */
  index: 1 | 2 | 3 | 4
  /** 标题文本（trim 后） */
  text: string
}

/** 轴投影：first = x 左段 / y 下段；second = x 右段 / y 上段（null = 无该段/悬空） */
export interface ProjectionQuadrantAxis {
  elementId: 'x-axis' | 'y-axis'
  first: string
  second: string | null
}

export interface QuadrantProjection {
  /** 图表标题文本（`title` 行）；无 null */
  title: string | null
  /** x 轴（左段 → 右段）；无轴行 null */
  xAxis: ProjectionQuadrantAxis | null
  /** y 轴（下段 → 上段）；无轴行 null */
  yAxis: ProjectionQuadrantAxis | null
  /** 已解析的象限标题（文档序；缺失的 quadrant-N 行不产生元素） */
  quadrants: ProjectionQuadrantQuadrant[]
  /** 全部点（文档序；结构树 / 键盘 / 表单寻址） */
  points: ProjectionQuadrantPoint[]
  /** 下一个新增点的预测序号（右键空白加点用；= 点总数 + 1） */
  nextPointOrdinal: number
}

function axisText(segment: QuadrantAxisData['second']): string | null {
  if (segment === null) return null
  const trimmed = segment.text.trim()
  return trimmed === '' ? null : trimmed
}

function styleValueOf(point: QuadrantPointData, field: QuadrantStyleField): string | null {
  const entry = point.styles.find((e) => e.key === field)
  if (entry === undefined) return null
  const ki = entry.raw.indexOf(':')
  return ki === -1 ? null : entry.raw.slice(ki + 1).trim()
}

/** 从解析产物构建 quadrant 投影（纯函数，ADR-0016：投影吃 IR/解析产物） */
export function buildQuadrantProjection(doc: SourceDocument): QuadrantProjection {
  let title: string | null = null
  let xAxis: ProjectionQuadrantAxis | null = null
  let yAxis: ProjectionQuadrantAxis | null = null
  const quadrants: ProjectionQuadrantQuadrant[] = []
  const points: ProjectionQuadrantPoint[] = []

  for (const part of doc.elements) {
    const data = part.element
    if (data.kind === 'quadrant-title') {
      title = (data as QuadrantTitleData).text
    } else if (data.kind === 'quadrant-axis') {
      const axisData = data as QuadrantAxisData
      const axis: ProjectionQuadrantAxis = {
        elementId: axisData.axis === 'x' ? 'x-axis' : 'y-axis',
        first: axisData.first.text.trim(),
        second: axisText(axisData.second),
      }
      if (axisData.axis === 'x') xAxis = axis
      else yAxis = axis
    } else if (data.kind === 'quadrant-quadrant') {
      const q = data as QuadrantQuadrantData
      quadrants.push({ elementId: part.id, index: q.index, text: q.text.trim() })
    } else if (data.kind === 'quadrant-point') {
      const pointData = data as QuadrantPointData
      const x = parseQuadrantCoordinate(pointData.x)
      const y = parseQuadrantCoordinate(pointData.y)
      points.push({
        elementId: part.id,
        text: pointData.text.trim(),
        className: pointData.classAnn,
        xText: pointData.x,
        yText: pointData.y,
        x,
        y,
        coordsValid:
          x !== null && y !== null && isQuadrantCoordinate(pointData.x) && isQuadrantCoordinate(pointData.y),
        color: styleValueOf(pointData, 'color'),
        radius: styleValueOf(pointData, 'radius'),
        strokeColor: styleValueOf(pointData, 'stroke-color'),
        strokeWidth: styleValueOf(pointData, 'stroke-width'),
      })
    }
  }

  return { title, xAxis, yAxis, quadrants, points, nextPointOrdinal: points.length + 1 }
}

// ---------- 选中回落 ----------

/** 选中目标在投影中仍存在则原样返回，否则回落 null（由调用方回落图表级） */
export function resolveQuadrantSelection(
  projection: QuadrantProjection,
  selection: Selection | null,
): Selection | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'diagram':
      return selection
    case 'quadrant-point':
      return projection.points.some((p) => p.elementId === selection.elementId) ? selection : null
    case 'quadrant-axis':
      return (selection.elementId === 'x-axis' && projection.xAxis !== null) ||
        (selection.elementId === 'y-axis' && projection.yAxis !== null)
        ? selection
        : null
    case 'quadrant-quadrant':
      return projection.quadrants.some((q) => q.elementId === selection.elementId) ? selection : null
    default:
      return null
  }
}
