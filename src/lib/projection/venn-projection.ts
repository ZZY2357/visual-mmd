import type { SourceDocument } from '../pipeline/document'
import type { VennAreaData, VennTitleData } from '../pipeline/venn'
import type { Selection } from './selection'

/**
 * venn-beta 投影（more-diagrams 工单 21，ADR-0008/0016）：从解析产物派生的只读结构视图。
 *
 * - 集合（set）是**名字即身份**：元素身份 `venn-set:<id>`——id 是源码书写的内容键，
 *   `data-venn-sets` 单 id 值就是它（research §4/§8 实测）。
 * - 交集（union）走**位置序身份** `venn-union:N`（1 基文档序，ADR-0012）——
 *   `data-venn-sets` 键是 id 列表**字典序拼接**，源码书写序与选中的 id 顺序都无关；
 *   同一 id 列表重复书写会同键冲突，位置序才是唯一稳定身份（research §8）。
 *   `canvasKey` 存该交集在 DOM 上的 `data-venn-sets` 内容键，供画布反注/高亮反解。
 * - text 节点与单条 `style` **整体降级**（research §4/§8：无任何 `data-*`）——
 *   不建元素，画布不可点选；结构树 + 属性表单是完整编辑入口（守 ADR-0007）。
 * - 尺寸非法（手写源码的清单外形态，如 `set A:1,5`）在解析层已整行不认（逐字保留），
 *   能进投影的 size 一定合法；`sizeText` 保留原文供表单显示。
 */

export interface ProjectionVennArea {
  /** `venn-set:<id>`（名字即身份）或 `venn-union:N`（位置序身份） */
  elementId: string
  /** set | union */
  kind: 'set' | 'union'
  /** set 的 id / union 的 id 列表（书写序，去空白）；union 至少 2 项 */
  ids: string[]
  /** 显示标签：`["…"]` 内原文；无 label null */
  label: string | null
  /** 尺寸段原文；无尺寸 null */
  sizeText: string | null
  /**
   * 该区域在画布上的 `data-venn-sets` 内容键（id 列表字典序、`_` 连接）。
   * set = 单个 id；union = 排序后 join('_')。与 research §8 实测一致。
   */
  canvasKey: string
}

export interface VennProjection {
  /** 全部集合（文档序） */
  sets: ProjectionVennArea[]
  /** 全部交集（文档序，位置序身份） */
  unions: ProjectionVennArea[]
  /** 集合 + 交集，文档序平铺（键盘 / 表单寻址用） */
  areas: ProjectionVennArea[]
  /** 文档级标题（无标题行 null） */
  title: string | null
  /** 下一个新增集合的 id 占位（右键空白「加集合」用；`setN` 形态避重） */
  nextSetId: string
  /** 下一个新增交集的位置序序号（= 交集总数 + 1） */
  nextUnionOrdinal: number
}

/** id 列表 → `data-venn-sets` 内容键（字典序、`_` 连接；与 mermaid DB 的 sort 一致） */
export function vennCanvasKeyOf(ids: readonly string[]): string {
  return [...ids].sort().join('_')
}

/** 从解析产物构建 venn 投影（纯函数，ADR-0016：投影吃解析产物） */
export function buildVennProjection(doc: SourceDocument): VennProjection {
  const sets: ProjectionVennArea[] = []
  const unions: ProjectionVennArea[] = []
  const areas: ProjectionVennArea[] = []
  let title: string | null = null
  let unionOrdinal = 0

  for (const part of doc.elements) {
    const data = part.element
    if (data.kind === 'venn-title') {
      title = (data as VennTitleData).text
      continue
    }
    if (data.kind !== 'venn-set' && data.kind !== 'venn-union') continue
    const area = data as VennAreaData
    const ids = area.refs
      .split(',')
      .map((x) => x.trim())
      .filter((x) => x !== '')
    const projection: ProjectionVennArea = {
      elementId: part.id,
      kind: data.kind === 'venn-set' ? 'set' : 'union',
      ids,
      label: area.labelRaw !== null ? area.labelRaw.slice(2, -2) : null,
      sizeText: area.size,
      canvasKey: vennCanvasKeyOf(ids),
    }
    areas.push(projection)
    if (projection.kind === 'set') sets.push(projection)
    else {
      unionOrdinal++
      unions.push(projection)
    }
  }

  const usedSetIds = new Set(sets.flatMap((s) => s.ids))
  let n = sets.length + 1
  while (usedSetIds.has(`set${n}`)) n++

  return {
    sets,
    unions,
    areas,
    title,
    nextSetId: `set${n}`,
    nextUnionOrdinal: unionOrdinal + 1,
  }
}

// ---------- 选中回落 ----------

/** 选中目标在投影中仍存在则原样返回，否则回落 null（由调用方回落图表级） */
export function resolveVennSelection(
  projection: VennProjection,
  selection: Selection | null,
): Selection | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'diagram':
      return selection
    case 'venn-set':
      return projection.sets.some((s) => s.ids[0] === selection.id) ? selection : null
    case 'venn-union':
      return projection.unions.some((u) => u.elementId === selection.elementId) ? selection : null
    default:
      return null
  }
}
