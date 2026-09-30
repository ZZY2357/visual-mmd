import type { SourceDocument } from '../pipeline/document'
import {
  type PieSectorData,
  type PieTitleData,
  isPieValuePositive,
  parsePieValue,
} from '../pipeline/pie'
import type { Selection } from './selection'

/**
 * pie 投影（more-diagrams 工单 10，ADR-0008/0016）：从解析产物派生的只读结构视图，
 * 驱动结构树与属性表单。投影只认解析产物的 *Data（ADR-0016）。
 *
 * - 扇区是节点元素：label + 数值，按**位置序**编 elementId（`sector:N`，ADR-0012——
 *   pie 语法里没有节点 id，位置序是唯一可行身份）。
 * - 数值非法（负数/零/非 NUMBER_PIE 词法，只能来自手写源码）**原样保留**在 valueText 里，
 *   valuePositive = false 供结构树/表单标注（不静默改写用户源码，工单定案——负数是
 *   mermaid 落码错误、零被渲染层静默过滤）。
 */
export interface ProjectionPieSector {
  /** `sector:N`，位置序身份（ADR-0012）+ 编辑意图寻址键 */
  elementId: string
  /** 引号内标签文本（转义序列逐字保留） */
  label: string
  /** 数值段原文（负数/零原样保留） */
  valueText: string
  /** 数值段可解析出的数值；非 NUMBER_PIE 词法 null */
  value: number | null
  /** 数值是否合法（>0；false = 手写源码负数/零，结构树标注） */
  valuePositive: boolean
}

export interface PieProjection {
  /** 图表标题文本（`title` 行）；无 null */
  title: string | null
  /** 全部扇区（文档序；结构树 / 键盘 / 表单寻址） */
  sectors: ProjectionPieSector[]
  /** 下一个新增扇区的预测序号（右键空白加扇区用；= 扇区总数 + 1） */
  nextSectorOrdinal: number
}

/** 从解析产物构建 pie 投影（纯函数，ADR-0016：投影吃 IR/解析产物） */
export function buildPieProjection(doc: SourceDocument): PieProjection {
  const sectors: ProjectionPieSector[] = []
  let title: string | null = null

  for (const part of doc.elements) {
    const data = part.element
    if (data.kind === 'pie-title') {
      title = (data as PieTitleData).text
    } else if (data.kind === 'pie-sector') {
      const node = data as PieSectorData
      sectors.push({
        elementId: part.id,
        label: node.label,
        valueText: node.value,
        value: parsePieValue(node.value),
        valuePositive: isPieValuePositive(node.value),
      })
    }
  }

  return {
    title,
    sectors,
    nextSectorOrdinal: sectors.length + 1,
  }
}

// ---------- 选中回落 ----------

/** 选中目标在投影中仍存在则原样返回，否则回落 null（由调用方回落图表级） */
export function resolvePieSelection(
  projection: PieProjection,
  selection: Selection | null,
): Selection | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'diagram':
      return selection
    case 'pie-sector':
      return projection.sectors.some((s) => s.elementId === selection.elementId) ? selection : null
    default:
      return null
  }
}
