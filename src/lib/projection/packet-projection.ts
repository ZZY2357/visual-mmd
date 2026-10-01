import type { SourceDocument } from '../pipeline/document'
import {
  absoluteRangeOf,
  type PacketFieldData,
  type PacketFieldForm,
} from '../pipeline/packet'
import type { Selection } from './selection'

/**
 * packet 投影（more-diagrams 工单 16，ADR-0008/0016）：从解析产物派生的只读结构视图，
 * 驱动结构树与属性表单。投影只认解析产物的 *Data（ADR-0016）。
 *
 * - 字段是节点元素：name + 位形态，按**位置序**编 elementId（`field:N`，ADR-0012——
 *   packet 语法里字段没有 id，位置序是唯一可行身份）。
 * - **位区间归一（工单定案）**：`+count` 与 `start:` 形态依赖前序字段结束位，投影按
 *   文档序归一为绝对区间 [absStart, absEnd]；原形态（form）原样保留供落码「保留原
 *   形态」。`contiguous` 标注该字段起点是否衔接前序（显式起点不等于前序结束位 + 1
 *   即 false——mermaid 12 整图渲染失败，结构树标注，不静默改写）。
 * - 画布 DOM 的 data-id 由渲染后处理按 start-bit 映射反注（见 packet-adapter /
 *   node-data-ids）。
 */
export interface ProjectionPacketField {
  /** `field:N`，位置序身份（ADR-0012）+ 编辑意图寻址键 */
  elementId: string
  /** 字段名（引号内原文） */
  name: string
  /** 位形态（原文数字；落码「保留原形态」的依据） */
  form: PacketFieldForm
  /** 归一后的绝对起始位 */
  absStart: number
  /** 归一后的绝对结束位（含） */
  absEnd: number
  /** 起点是否衔接前序字段（首个字段须从 0 起；count 形态恒 true） */
  contiguous: boolean
  /** 位宽（absEnd - absStart + 1） */
  bits: number
}

export interface PacketProjection {
  /** 全部字段（文档序；结构树 / 键盘 / 表单寻址） */
  fields: ProjectionPacketField[]
  /** 下一个新增字段的预测序号（右键空白加字段用；= 字段总数 + 1） */
  nextFieldOrdinal: number
}

/** 从解析产物构建 packet 投影（纯函数，ADR-0016：投影吃 IR/解析产物） */
export function buildPacketProjection(doc: SourceDocument): PacketProjection {
  const fields: ProjectionPacketField[] = []
  let previousEnd = -1
  for (const part of doc.elements) {
    const data = part.element
    if (data.kind !== 'packet-field') continue
    const field = data as PacketFieldData
    const range = absoluteRangeOf(field.form, previousEnd)
    // 形态在解析门已保证可归一（range/single 显式数字、count > 0）；防御 null
    if (range === null) continue
    fields.push({
      elementId: part.id,
      name: field.name,
      form: field.form,
      absStart: range.start,
      absEnd: range.end,
      // 显式起点（range/single）必须恰好接在前序结束位 + 1（首个从 0 起）；
      // count 形态按前序自动衔接，恒连续
      contiguous:
        field.form.kind === 'count' ||
        (field.form.kind === 'range'
          ? Number(field.form.start) === previousEnd + 1
          : Number(field.form.start) === previousEnd + 1),
      bits: range.end - range.start + 1,
    })
    previousEnd = range.end
  }
  return { fields, nextFieldOrdinal: fields.length + 1 }
}

// ---------- 选中回落 ----------

/** 选中目标在投影中仍存在则原样返回，否则回落 null（由调用方回落图表级） */
export function resolvePacketSelection(
  projection: PacketProjection,
  selection: Selection | null,
): Selection | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'diagram':
      return selection
    case 'packet-field':
      return projection.fields.some((f) => f.elementId === selection.elementId) ? selection : null
    default:
      return null
  }
}
