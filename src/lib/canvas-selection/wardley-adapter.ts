import { resolveWardleySelection } from '../projection/wardley-projection'
import { wardleyDeleteIntent, wardleyKeyPlan } from '../editing/canvas-keyboard'
import type { CanvasCapabilities, ProjectionOf } from './capabilities'

/**
 * wardley 适配器（more-diagrams 工单 23）：把 wardley 投影接到画布能力包上（ADR-0015）。
 *
 * **画布寻址整体降级（research §4 实测记录）**：mermaid 12.0.0 的 wardley 渲染器
 * （`dist/chunks/mermaid.core/wardleyDiagram-VNRHLVJA.mjs`，源码 `src/diagrams/wardley/
 * wardleyRenderer.ts` 经 sourcemap sourcesContent 核对）中节点组只写 class：
 * `g.attr('class', node => ['wardley-node', node.className && 'wardley-node--'+node.className])`
 * （`:585-594`，仅 `wardley-node` / `wardley-node--anchor|component|pipeline-component`），
 * 标签为 `text.wardley-node-label`。全文**仅 3 处** `attr('id', …)`，都是 SVG `<defs>`
 * 箭头 marker（`arrow-${id}` / `link-arrow-end-${id}` / `link-arrow-start-${id}`，
 * `:98/:113/:128`）——与元素一一对应无关。⇒ 画布点击回映射源码**无法实现**。
 * 按 spec 原则「DOM 无 data-id 就不做画布寻址，不伪造」（ADR-0007），本 adapter：
 * - dataIdResolver 恒 null（画布点击不产生选中）、toSelection / canvasIdOf 恒 null、
 *   navigationIds 空数组（方位导航无锚点）；
 * - 双击内联编辑与元素级右键菜单随之不做；
 * - **结构树是完整编辑入口**：选中（结构树点选）、属性表单、右键空白菜单（加 component /
 *   anchor）与画布键盘（结构树选中后 Tab/Enter/Delete）全部可用。
 * 降级清单：节点画布点选、双击改名、元素级右键菜单——后两者由结构树选中 + 属性面板承接，
 * 语义不缺失，只是入口位置不同。
 */

export const wardleyCanvasCapabilities: CanvasCapabilities<ProjectionOf<'wardley'>> = {
  dataIdResolver: () => () => null,
  toSelection: () => null,
  // 画布上没有可寻址 DOM：一律返回 null——安静地不高亮
  canvasIdOf: () => null,
  navigationIds: () => [],
  keyboardProjection: (projection) => ({ kind: 'wardley', projection: projection.wardley }),
  resolveSelection: (projection, selection) => resolveWardleySelection(projection.wardley, selection),
  // 删除意图：唯一映射在 canvas-keyboard.wardleyDeleteIntent
  deleteIntent: (projection, selection) => wardleyDeleteIntent(projection.wardley, selection),
  // 键位语义：唯一映射在 canvas-keyboard.wardleyKeyPlan
  keyHandler: (projection) => (input) => wardleyKeyPlan(projection.wardley, input),
}
