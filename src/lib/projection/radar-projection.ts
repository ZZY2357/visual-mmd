import type { SourceDocument } from '../pipeline/document'
import {
  type RadarAxisData,
  type RadarCurveData,
  type RadarCurveForm,
  type RadarOptionData,
  type RadarTitleData,
  unescapeRadarLabel,
} from '../pipeline/radar'
import type { Selection } from './selection'

/**
 * radar-beta 投影（more-diagrams 工单 15，ADR-0008/0016）：从解析产物派生的只读结构
 * 视图，驱动结构树与属性表单。投影只认解析产物的 *Data（ADR-0016）。
 *
 * - 轴 / 曲线 / 选项走**位置序**身份（`axis:N` / `curve:N` / `option:N`，ADR-0012——
 *   轴与曲线虽有语法 id，但 id 可改名（set-axis-id / set-curve-id），位置序是唯一
 *   稳定身份）。
 * - **双形态归一**（工单明确）：键值（`axisId: value`）与值列表（裸 NUMBER 序列）
 *   两种曲线条目都归一为 `axisId → 数值` 映射供表单展示与编辑；**落码侧保留原形态**
 *   （管线 radar.ts 定点改写，未触碰条目 raw 逐字回写）。
 *   - 键值形态：条目 ref → 数值（ref 不在轴集合中的条目原样保留在映射里——手写源码
 *     可能引用不存在的轴，mermaid 渲染会报错，表单如实展示不静默丢弃）；
 *   - 值列表形态：按**位置序**对齐轴（mermaid db 语义：第 i 个值属于第 i 个轴），
 *     超出轴数量的多余值被忽略（曲线 form 已标 value-list，结构树可辨）。
 * - 选项（max / min / graticule / ticks / showLegend）按文档序进 options 数组
 *   （同名可重复出现，最后一个生效是 mermaid db 语义，表单编辑走图表级字段）。
 */
export interface ProjectionRadarAxis {
  /** `axis:N`，位置序身份（ADR-0012）+ 编辑意图寻址键 */
  elementId: string
  /** 语法 id（显示用；改名走 set-axis-id 意图，身份不受影响） */
  id: string
  /** 展示文本（label 反转义近似；无 label null——渲染层回退 id） */
  label: string | null
}

export interface ProjectionRadarCurve {
  /** `curve:N`，位置序身份（ADR-0012）+ 编辑意图寻址键 */
  elementId: string
  /** 语法 id（显示用） */
  id: string
  /** 展示文本（label 反转义近似；无 label null——渲染层回退 id） */
  label: string | null
  /** 条目原文形态（落码保留原形态的判据） */
  form: RadarCurveForm
  /** 归一映射：axisId → 数值（raw 形态空映射） */
  values: Record<string, number>
}

export interface ProjectionRadarOption {
  /** `option:N`，位置序身份（ADR-0012） */
  elementId: string
  /** 选项名（max / min / graticule / ticks / showLegend） */
  name: string
  /** 值段原文（去外侧空白） */
  value: string
}

export interface RadarProjection {
  /** 图表标题文本（`title` 行）；无 null */
  title: string | null
  /** 全部轴（文档序；结构树 / 键盘 / 表单寻址） */
  axes: ProjectionRadarAxis[]
  /** 全部曲线（文档序；values 是双形态归一映射） */
  curves: ProjectionRadarCurve[]
  /** 全部选项（文档序；同名重复时后者生效） */
  options: ProjectionRadarOption[]
  /** 下一个新增轴的预测序号（右键空白加轴用；= 轴总数 + 1） */
  nextAxisOrdinal: number
  /** 下一个新增曲线的预测序号（右键空白加曲线用；= 曲线总数 + 1） */
  nextCurveOrdinal: number
}

/** 值列表条目按位置序对齐轴（mermaid computeCurveEntries 语义：第 i 个值属于第 i 个轴） */
function valueListEntries(data: RadarCurveData, axisIds: string[]): Record<string, number> {
  const values: Record<string, number> = {}
  const numbers = data.pieces
  for (let i = 0; i < numbers.length && i < axisIds.length; i++) {
    values[axisIds[i]] = Number.parseFloat(numbers[i].num)
  }
  return values
}

/** 键值条目 ref → 数值（ref 不在轴集合也保留——如实展示手写源码的悬空引用） */
function keyedEntries(data: RadarCurveData): Record<string, number> {
  const values: Record<string, number> = {}
  for (const piece of data.pieces) {
    if (piece.kind !== 'keyed' || piece.ref === undefined) continue
    values[piece.ref] = Number.parseFloat(piece.num)
  }
  return values
}

/** 从解析产物构建 radar 投影（纯函数，ADR-0016：投影吃 IR/解析产物） */
export function buildRadarProjection(doc: SourceDocument): RadarProjection {
  let title: string | null = null
  const axes: ProjectionRadarAxis[] = []
  const axisIds: string[] = []
  const curves: ProjectionRadarCurve[] = []
  const options: ProjectionRadarOption[] = []

  // 第一遍：title / 轴 / 选项（曲线的值列表对齐需要完整轴表，放第二遍）
  const curveParts: { elementId: string; data: RadarCurveData }[] = []
  for (const part of doc.elements) {
    const data = part.element
    if (data.kind === 'radar-title') {
      title = (data as RadarTitleData).text
    } else if (data.kind === 'radar-axis') {
      const axis = data as RadarAxisData
      axes.push({
        elementId: part.id,
        id: axis.id,
        label: axis.hasLabel ? unescapeRadarLabel(axis.label) : null,
      })
      axisIds.push(axis.id)
    } else if (data.kind === 'radar-curve') {
      curveParts.push({ elementId: part.id, data: data as RadarCurveData })
    } else if (data.kind === 'radar-option') {
      const option = data as RadarOptionData
      options.push({ elementId: part.id, name: option.name, value: option.value })
    }
  }

  // 第二遍：曲线双形态归一为 axisId → 数值映射
  for (const { elementId, data } of curveParts) {
    curves.push({
      elementId,
      id: data.id,
      label: data.hasLabel ? unescapeRadarLabel(data.label) : null,
      form: data.form,
      values:
        data.form === 'keyed'
          ? keyedEntries(data)
          : data.form === 'value-list'
            ? valueListEntries(data, axisIds)
            : {},
    })
  }

  return {
    title,
    axes,
    curves,
    options,
    nextAxisOrdinal: axes.length + 1,
    nextCurveOrdinal: curves.length + 1,
  }
}

// ---------- 选中回落 ----------

/** 选中目标在投影中仍存在则原样返回，否则回落 null（由调用方回落图表级） */
export function resolveRadarSelection(
  projection: RadarProjection,
  selection: Selection | null,
): Selection | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'diagram':
      return selection
    case 'radar-axis':
      return projection.axes.some((a) => a.elementId === selection.elementId) ? selection : null
    case 'radar-curve':
      return projection.curves.some((c) => c.elementId === selection.elementId) ? selection : null
    default:
      return null
  }
}
