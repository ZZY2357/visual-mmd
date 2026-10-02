import { resolveC4Selection } from '../projection/c4-projection'
import { c4DeleteIntent, c4KeyPlan } from '../pipeline/c4-keyboard'
import { nonAddressableCapabilities } from './non-addressable-capabilities'
import type { CanvasCapabilities, ProjectionOf } from './capabilities'

/**
 * C4 适配器（more-diagrams 工单 18）：把 C4 投影接到画布能力包上（ADR-0015）。
 *
 * **画布寻址整体降级（research §4 实测记录）**：mermaid 12.0.0 的 c4 渲染器
 * （`node_modules/mermaid/dist/chunks/mermaid.core/c4Diagram-YGBWAQC7.mjs` 源码核对）中
 * `data-*` 出现 **0 次**（`grep -c 'data-'` = 0、`grep -o 'data-[a-z-]*'` 输出为空）；
 * `.attr("id", …)` 仅 8 处，**全部落在 `<defs>` 的 marker 定义**（`-database` / `-computer` /
 * `-clock` / `-arrowhead` / `-arrowend` / `-filled-head` / `-crosshead`），不是元素 DOM id；
 * class 只有 `c4`（2 次）/ `c4-external`（1 次）/ `c4-shape`（13 次），无可反注的稳定身份。
 * 按 spec 原则「DOM 无 data-id 就不做画布寻址，不伪造」（ADR-0007），本 adapter：
 * - dataIdResolver 恒 null（画布点击不产生选中）、toSelection / canvasIdOf 恒 null、
 *   navigationIds 空数组（方位导航无锚点，回落首节点也没有）；
 * - 双击内联编辑与元素级右键菜单随之不做（画布上无从解析双击/右键目标）；
 * - **结构树是完整编辑入口**：选中（结构树点选）、属性表单、右键空白菜单（加元素/边界/
 *   连线）与画布键盘（结构树选中后 Tab/Enter/Delete）全部可用。
 * 降级清单：元素 / 边界画布点选、双击改名、元素级右键菜单——后两者由结构树选中 + 属性面板
 * 承接，语义不缺失，只是入口位置不同。
 */
export const c4CanvasCapabilities: CanvasCapabilities<ProjectionOf<'c4'>> = nonAddressableCapabilities({
  keyboardProjection: (projection) => ({ kind: 'c4', projection: projection.c4 }),
  resolveSelection: (projection, selection) => resolveC4Selection(projection.c4, selection),
  // 删除意图：唯一映射在 pipeline/c4-keyboard 的 c4DeleteIntent
  deleteIntent: (projection, selection) => c4DeleteIntent(projection.c4, selection),
  // 键位语义：唯一映射在 pipeline/c4-keyboard 的 c4KeyPlan
  keyHandler: (projection) => (input) => c4KeyPlan(projection.c4, input),
})
