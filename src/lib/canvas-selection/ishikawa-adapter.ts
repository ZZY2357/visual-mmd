import { resolveIshikawaSelection } from '../projection/ishikawa-projection'
import { ishikawaDeleteIntent, ishikawaKeyPlan } from '../editing/canvas-keyboard'
import type { CanvasCapabilities, ProjectionOf } from './capabilities'

/**
 * ishikawa 适配器（more-diagrams 工单 22）：把 ishikawa 投影接到画布能力包上（ADR-0015）。
 *
 * **画布寻址整体降级（research §4 实测记录）**：mermaid 12.0.0 的 ishikawa 渲染器
 * （`dist/chunks/mermaid.core/ishikawaDiagram-OU5B5YK6.mjs`，源码
 * `src/diagrams/ishikawa/ishikawaRenderer.ts`）中 `data-` 出现 **0 次**；元素只带
 * class（`.ishikawa-head-label` / `.ishikawa-label.cause` / `.ishikawa-label.up|down`
 * / `.ishikawa-label.align`），且同一 class 下的多个 `<text>` 只有 DOM 顺序，而
 * `flattenTree` 会按深度奇偶 **pre-order / post-order 重排**（bundle 行 736）——
 * **渲染序 ≠ 源码序**，更不可用 DOM 索引反推源码位置。按 spec 原则「DOM 无 data-id
 * 就不做画布寻址，不伪造」（ADR-0007），本 adapter：
 * - dataIdResolver 恒 null（画布点击不产生选中）、toSelection / canvasIdOf 恒 null、
 *   navigationIds 空数组（方位导航无锚点，回落首节点也没有）；
 * - 双击内联编辑与元素级右键菜单随之不做；
 * - **结构树是完整编辑入口**：选中（结构树点选）、属性表单、右键空白菜单（加主因）
 *   与画布键盘（结构树选中后 Tab/Enter/Delete）全部可用。
 * 降级清单：节点画布点选、双击改名、元素级右键菜单——后两者由结构树选中 + 属性面板承接，
 * 语义不缺失，只是入口位置不同。
 *
 * `canvasIdOf` 用 `(_projection, selection)` 签名（gantt 起升级的约定，工单 22 遵循）。
 */

export const ishikawaCanvasCapabilities: CanvasCapabilities<ProjectionOf<'ishikawa'>> = {
  dataIdResolver: () => () => null,
  toSelection: () => null,
  // 画布上没有可寻址 DOM：一律返回 null——安静地不高亮
  canvasIdOf: (_projection, _selection) => null,
  navigationIds: () => [],
  keyboardProjection: (projection) => ({ kind: 'ishikawa', projection: projection.ishikawa }),
  resolveSelection: (projection, selection) => resolveIshikawaSelection(projection.ishikawa, selection),
  // 删除意图：唯一映射在 canvas-keyboard.ishikawaDeleteIntent
  deleteIntent: (projection, selection) => ishikawaDeleteIntent(projection.ishikawa, selection),
  // 键位语义：唯一映射在 canvas-keyboard.ishikawaKeyPlan
  keyHandler: (projection) => (input) => ishikawaKeyPlan(projection.ishikawa, input),
}
