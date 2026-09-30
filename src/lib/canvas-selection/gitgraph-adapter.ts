import { resolveGitgraphSelection } from '../projection/gitgraph-projection'
import { gitgraphDeleteIntent, gitgraphKeyPlan } from '../editing/canvas-keyboard'
import type { CanvasCapabilities, ProjectionOf } from './capabilities'

/**
 * gitGraph 适配器（more-diagrams 工单 04）：把 gitGraph 投影接到画布能力包上（ADR-0015）。
 *
 * **画布寻址整体降级（工单定案，实测记录）**：mermaid 12.0.0 的 gitGraph 渲染器
 * （gitGraphRenderer 的 drawCommit）给提交圆点只写 class（`commit {id} …`），
 * **不写 data-id、也不写独立 DOM id**；分支标签同样没有可寻址标识。按 spec 原则
 * 「DOM 无 data-id 就不做画布寻址，不伪造」，本 adapter：
 * - dataIdResolver 恒 null（画布点击不产生选中）、toSelection / canvasIdOf 恒 null、
 *   navigationIds 空数组（方位导航无锚点，回落首节点也没有）；
 * - 双击内联编辑（改提交 id）随之不做——提交 id 在右侧属性表单改；
 * - **结构树是完整编辑入口**：选中（结构树点选）、属性表单、右键空白菜单（加提交/加分支）
 *   与画布键盘（结构树选中后 Delete/Tab/Enter）全部可用。
 * 降级清单：提交/分支画布点选、提交双击改 id、提交右键菜单（改 id/标签/类型/删除）
 * ——后两者由结构树选中 + 属性面板承接，语义不缺失，只是入口位置不同。
 */

export const gitgraphCanvasCapabilities: CanvasCapabilities<ProjectionOf<'gitgraph'>> = {
  dataIdResolver: () => () => null,
  toSelection: () => null,
  // 画布上没有可寻址 DOM：一律返回 null——安静地不高亮
  canvasIdOf: () => null,
  navigationIds: () => [],
  keyboardProjection: (projection) => ({ kind: 'gitgraph', projection: projection.gitgraph }),
  resolveSelection: (projection, selection) => resolveGitgraphSelection(projection.gitgraph, selection),
  // 删除意图：唯一映射在 canvas-keyboard.gitgraphDeleteIntent
  deleteIntent: (projection, selection) => gitgraphDeleteIntent(projection.gitgraph, selection),
  // 键位语义：唯一映射在 canvas-keyboard.gitgraphKeyPlan
  keyHandler: (projection) => (input) => gitgraphKeyPlan(projection.gitgraph, input),
}
