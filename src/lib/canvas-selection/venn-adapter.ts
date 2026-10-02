import { resolveVennSelection, type VennProjection } from '../projection/venn-projection'
import type { Selection } from '../projection/selection'
import { vennDeleteIntent, vennKeyPlan } from '../pipeline/venn-keyboard'
import { annotateVennDataIds } from './node-data-ids'
import type { CanvasSelection, DataIdResolver } from './data-id'
import type { CanvasCapabilities, ProjectionOf } from './capabilities'

/**
 * venn-beta 适配器（more-diagrams 工单 21）：把 venn 投影接到画布能力包上（ADR-0015）。
 *
 * **有画布寻址（content-key 反注）** —— 结论来自工单 21 的 DOM 实测（.scratch/more-diagrams/
 * research/venn.md §8）：venn 的布局引擎 @upsetjs/venn.js 给每个区域节点写了唯一可用的
 * 地址属性 **`data-venn-sets="<id 列表以 '_' 连接>"`**（单集合 = id，交集 = 字典序拼接；
 * 这是整棵 SVG 里唯一的 `data-*`）。既有 data-id 链路只认 `data-id`，故 `annotateVennDataIds`
 * 把它反注成 `data-id`（值 = 投影 elementId `venn-set:<id>` / `venn-union:N`），
 * 点选 / 高亮 / 右键菜单随之原样生效（与 quadrant/packet 的反注同款）。
 *
 * - 集合 / 交集**可寻址**；未在源码里的合成交集区域（venn.js 自动补的成对交集）不在反注表里，
 *   点它们安静地不选中（如实降级，绝不误归属）。
 * - **text 节点与单条 `style` 不可寻址**（research §4/§8 实测：文本 DOM 链
 *   `venn-text-area > foreignObject.venn-text-node-fo > span.venn-text-node` 无任何 data-*）——
 *   不建元素，画布点不中；结构树 + 属性表单是其编辑入口（守 ADR-0007）。
 * - 不实现 `edgeAnnotator`（venn 无连线语法，capabilities 查表测试断言）。
 */

/** `data-venn-sets` 内容键 → 投影 elementId（反注表；同一键取首个元素——重复 id 列表同键冲突） */
export function vennKeyMap(projection: VennProjection): Map<string, string> {
  const map = new Map<string, string>()
  for (const area of projection.areas) {
    if (!map.has(area.canvasKey)) map.set(area.canvasKey, area.elementId)
  }
  return map
}

/** 投影中全部可寻址 data-id（= elementId，反注后由 resolver 认领） */
export function vennCanvasIds(projection: VennProjection): string[] {
  return projection.areas.map((a) => a.elementId)
}

/** data-id（= 投影 elementId）→ CanvasSelection（唯一映射，adapter 与 selection-codec 共用） */
export function vennDataIdResolver(projection: VennProjection): DataIdResolver {
  const known = new Set(vennCanvasIds(projection))
  return (dataId) => (known.has(dataId) ? { kind: 'node', id: dataId } : null)
}

export function vennSelectionOf(canvas: CanvasSelection): Selection | null {
  if (canvas.kind !== 'node') return null
  const id = canvas.id
  if (id.startsWith('venn-set:')) return { kind: 'venn-set', id: id.slice('venn-set:'.length) }
  if (/^venn-union:[0-9]+$/.test(id)) return { kind: 'venn-union', elementId: id }
  return null
}

/** venn 画布能力包：集合 / 交集按 `data-venn-sets` 内容键反注寻址 */
export const vennCanvasCapabilities: CanvasCapabilities<ProjectionOf<'venn'>> = {
  dataIdResolver: (projection) => vennDataIdResolver(projection.venn),
  toSelection: (canvas) => vennSelectionOf(canvas),
  // data-id 即投影 elementId（渲染后按 data-venn-sets 内容键反注）
  canvasIdOf: (_projection, selection) => {
    if (selection.kind === 'venn-set') return `venn-set:${selection.id}`
    if (selection.kind === 'venn-union') return selection.elementId
    return null
  },
  // 方位导航：集合与交集（文档序）；text/style 不参与
  navigationIds: (projection) => projection.venn.areas.map((a) => a.elementId),
  keyboardProjection: (projection) => ({ kind: 'venn', projection: projection.venn }),
  nodeAnnotator: (projection) => (root) => annotateVennDataIds(root, vennKeyMap(projection.venn)),
  resolveSelection: (projection, selection) => resolveVennSelection(projection.venn, selection),
  // 删除意图：唯一映射在 pipeline/venn-keyboard 的 vennDeleteIntent
  deleteIntent: (projection, selection) => vennDeleteIntent(projection.venn, selection),
  // 键位语义：唯一映射在 pipeline/venn-keyboard 的 vennKeyPlan
  keyHandler: (projection) => (input) => vennKeyPlan(projection.venn, input),
}
