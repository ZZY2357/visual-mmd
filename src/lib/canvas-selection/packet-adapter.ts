import { resolvePacketSelection, type PacketProjection } from '../projection/packet-projection'
import type { Selection } from '../projection/selection'
import { packetDeleteIntent, packetKeyPlan } from '../editing/canvas-keyboard'
import { annotatePacketDataIds } from './node-data-ids'
import type { CanvasSelection, DataIdResolver } from './data-id'
import type { CanvasCapabilities, ProjectionOf } from './capabilities'

/**
 * packet 适配器（more-diagrams 工单 16）：把 packet 投影接到画布能力包上（ADR-0015）。
 * **有画布寻址（start-bit 映射反注）**——结论来自 mermaid 12.0.0 渲染器源码离线核对
 * （`diagram-MLGK6HIB.mjs` 的 draw/drawWord，已记入工单 Comments）：
 *
 * - 渲染器**不给任何元素写 id / data-id**（全文件 0 处），但每行 append 一个 `g`
 *   （无类名），行内每块依次 `rect.packetBlock` + `text.packetLabel` +
 *   `text.packetByte.start`（位号文本 = 块的绝对起始位）——结构专属且稳定。
 * - `annotatePacketDataIds`（node-data-ids）按块的 start-bit 落在哪个字段的绝对区间
 *   反注 `field:N`（ADR-0012 位置序），**不依赖 bitsPerRow**（字段跨行拆块也能归属），
 *   作用域严格限定在 packet 专属结构内，不进 `nodeIdOfDomId` 通用循环（工单 06 约定）；
 *   任一块归属失败 / showBits 关闭 / DOM 与投影不符时整体不标。
 * - **不实现 `edgeAnnotator`**（packet 无连线语法，capabilities 查表测试断言）。
 * - 字段跨行拆出的多个块共享同一 data-id（同属一个源码字段）——点选/高亮同亮，
 *   与 quadrant 轴双标签同口径。
 */
export function packetDataIdResolver(projection: PacketProjection): DataIdResolver {
  const known = new Set<string>(projection.fields.map((f) => f.elementId))
  return (dataId) => (known.has(dataId) ? { kind: 'node', id: dataId } : null)
}

/**
 * 画布选中（data-id = 投影 elementId `field:N`）→ 编辑器选中（唯一映射，adapter 与
 * `selection-codec` 的 fromCanvasId / menuTargetOfCanvas 共用）。
 */
export function packetSelectionOf(canvas: CanvasSelection): Selection | null {
  if (canvas.kind !== 'node') return null
  return /^field:[0-9]+$/.test(canvas.id) ? { kind: 'packet-field', elementId: canvas.id } : null
}

/** packet 画布能力包：字段按 start-bit 映射反注寻址 */
export const packetCanvasCapabilities: CanvasCapabilities<ProjectionOf<'packet'>> = {
  dataIdResolver: (projection) => packetDataIdResolver(projection.packet),
  toSelection: (canvas) => packetSelectionOf(canvas),
  // data-id 即投影 elementId（渲染后按 start-bit 映射反注）
  canvasIdOf: (_projection, selection) => {
    if (selection.kind === 'packet-field') return selection.elementId
    return null
  },
  // 方位导航：字段（投影顺序）
  navigationIds: (projection) => projection.packet.fields.map((f) => f.elementId),
  keyboardProjection: (projection) => ({ kind: 'packet', projection: projection.packet }),
  nodeAnnotator: (projection) => (root) =>
    annotatePacketDataIds(
      root,
      projection.packet.fields.map((f) => ({
        elementId: f.elementId,
        absStart: f.absStart,
        absEnd: f.absEnd,
      })),
    ),
  resolveSelection: (projection, selection) => resolvePacketSelection(projection.packet, selection),
  // 删除意图：唯一映射在 canvas-keyboard.packetDeleteIntent（结果序列不连续时管线拒绝）
  deleteIntent: (projection, selection) => packetDeleteIntent(projection.packet, selection),
  // 键位语义：唯一映射在 canvas-keyboard.packetKeyPlan（Tab 加字段 +count 衔接前序 /
  // Delete 删字段；Enter 无自然类比，工单定案不做）
  keyHandler: (projection) => (input) => packetKeyPlan(projection.packet, input),
}
