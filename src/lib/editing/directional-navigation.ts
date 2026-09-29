/**
 * 方位导航的纯几何选点（工单 14）：只吃中心点与投影顺序，
 * 无 DOM、无 store、无 React。DOM 测量（可视范围 → 中心点）在适配层
 * `canvas-measure.ts`，接线在 `use-canvas-keyboard.ts`，本文件只负责「按几何挑一个」。
 *
 * 语义见 ADR-0011 与 CONTEXT.md「方位导航 / 候选」：方向键承诺屏幕方位
 * （四个图种同一套），不承诺源码顺序或树关系。
 */

/** 节点在容器坐标系中的中心点 */
export interface DirectionalPoint {
  cx: number
  cy: number
}

/**
 * 方位导航的纯几何选点：以 anchor 为锚点，在 key 所指方向的 45° 锥形内
 * 取中心距离最近的候选；无候选返回 null。
 *
 * 屏幕坐标，y 轴向下。设 `dx = candidate.cx - anchor.cx`、`dy = candidate.cy - anchor.cy`：
 *
 * | 键 | 锥形条件 |
 * |---|---|
 * | `ArrowRight` | `dx > 0` 且 `|dy| ≤ |dx|` |
 * | `ArrowLeft`  | `dx < 0` 且 `|dy| ≤ |dx|` |
 * | `ArrowDown`  | `dy > 0` 且 `|dx| ≤ |dy|` |
 * | `ArrowUp`    | `dy < 0` 且 `|dx| ≤ |dy|` |
 *
 * - 正好 45°（`|dx| == |dy|`）算候选（故用 `<=`）。
 * - 取「锚点中心 → 候选中心」直线距离最小者，**距离并列时取 candidates 数组靠前者**
 *   （数组顺序即投影顺序）；距离比较用平方距离（避免开方误差），语义仍是欧氏距离。
 * - `key` 不是四个方向键之一 / `candidates` 为空 / 锥内无候选 → `null`（调用方据此无操作）。
 * - 锚点自身若被放进 candidates（`dx == 0 && dy == 0`）不会命中任何锥形，自然被排除，
 *   无需特判。
 */
export function pickDirectionalTarget(
  anchor: DirectionalPoint,
  candidates: ReadonlyArray<DirectionalPoint & { id: string }>,
  key: string,
): string | null {
  const inCone = conePredicateOf(key)
  if (inCone === null) return null

  let bestId: string | null = null
  let bestDistance = Infinity
  for (const candidate of candidates) {
    const dx = candidate.cx - anchor.cx
    const dy = candidate.cy - anchor.cy
    if (!inCone(dx, dy)) continue
    const distance = dx * dx + dy * dy
    // 严格小于：并列时保留数组靠前者（先到者）
    if (distance < bestDistance) {
      bestDistance = distance
      bestId = candidate.id
    }
  }
  return bestId
}

/** key → 该方向的锥形判据（dx/dy 已减去锚点）；非方向键返回 null */
function conePredicateOf(key: string): ((dx: number, dy: number) => boolean) | null {
  switch (key) {
    case 'ArrowRight':
      return (dx, dy) => dx > 0 && Math.abs(dy) <= Math.abs(dx)
    case 'ArrowLeft':
      return (dx, dy) => dx < 0 && Math.abs(dy) <= Math.abs(dx)
    case 'ArrowDown':
      return (dx, dy) => dy > 0 && Math.abs(dx) <= Math.abs(dy)
    case 'ArrowUp':
      return (dx, dy) => dy < 0 && Math.abs(dx) <= Math.abs(dy)
    default:
      return null
  }
}
