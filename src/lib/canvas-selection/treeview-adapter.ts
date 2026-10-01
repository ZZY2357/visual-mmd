import { resolveTreeviewSelection } from '../projection/treeview-projection'
import { treeviewDeleteIntent, treeviewKeyPlan } from '../editing/canvas-keyboard'
import type { CanvasCapabilities, ProjectionOf } from './capabilities'

/**
 * treeView-beta 适配器（more-diagrams 工单 24）：把 treeView 投影接到画布能力包上（ADR-0015）。
 *
 * **画布寻址整体降级（research §4 实测记录）**：mermaid 12.0.0 的 treeView 渲染器
 * （`dist/chunks/mermaid.core/treeViewDiagram-*.mjs`，源码 `src/diagrams/treeView/treeViewRenderer.ts`）
 * 中 `data-` 出现 **0 次**、`attr('id')` 亦 **0 次**；节点只被画成 `<g class="treeView-node">`
 * 下的 `<rect>` + `<text>`，**没有任何可反查源码位置的标识**。叠加一个更根本的问题：
 * **源码里的目录/文件节点在画布上是「行」的视觉呈现（带缩进的文本行），而不是树的边**——
 * 渲染布局由 d3-hierarchy 的 tidy tree 决定（pre-order 遍历 + 定位），与源码行序无一一对应，
 * 更不可用 DOM 索引反推源码位置。按 spec 原则「DOM 无 data-id 就不做画布寻址，不伪造」
 * （ADR-0007），本 adapter：
 * - dataIdResolver 恒 null（画布点击不产生选中）、toSelection / canvasIdOf 恒 null、
 *   navigationIds 空数组（方位导航无锚点，回落首节点也没有）；
 * - 双击内联编辑与元素级右键菜单随之不做；
 * - **结构树是完整编辑入口**：选中（结构树点选）、属性表单（改名 / 切换目录 / 删除）、
 *   右键空白菜单（加根节点）与画布键盘（结构树选中后 Tab/Enter/Delete）全部可用。
 * 降级清单：节点画布点选、双击改名、元素级右键菜单——后两者由结构树选中 + 属性面板承接，
 * 语义不缺失，只是入口位置不同。降级证据见 research/treeview.md §4 与提交信息。
 *
 * `canvasIdOf` 用 `(_projection, selection)` 签名（gantt 起升级的约定，工单 22/24 遵循）。
 */

export const treeviewCanvasCapabilities: CanvasCapabilities<ProjectionOf<'treeview'>> = {
  dataIdResolver: () => () => null,
  toSelection: () => null,
  // 画布上没有可寻址 DOM：一律返回 null——安静地不高亮
  canvasIdOf: (_projection, _selection) => null,
  navigationIds: () => [],
  keyboardProjection: (projection) => ({ kind: 'treeview', projection: projection.treeview }),
  resolveSelection: (projection, selection) => resolveTreeviewSelection(projection.treeview, selection),
  // 删除意图：唯一映射在 canvas-keyboard.treeviewDeleteIntent
  deleteIntent: (projection, selection) => treeviewDeleteIntent(projection.treeview, selection),
  // 键位语义：唯一映射在 canvas-keyboard.treeviewKeyPlan
  keyHandler: (projection) => (input) => treeviewKeyPlan(projection.treeview, input),
}
