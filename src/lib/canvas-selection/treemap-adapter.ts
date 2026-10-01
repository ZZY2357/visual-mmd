import { resolveTreemapSelection } from '../projection/treemap-projection'
import { treemapDeleteIntent, treemapKeyPlan } from '../editing/canvas-keyboard'
import type { CanvasCapabilities, ProjectionOf } from './capabilities'

/**
 * treemap 适配器（more-diagrams 工单 20）：把 treemap 投影接到画布能力包上（ADR-0015）。
 *
 * **画布寻址整体降级（research §4 实测记录）**：mermaid 12.0.0 的 treemap 渲染器
 * （`dist/chunks/mermaid.core/diagram-3UASUU5V.mjs`，源码 `src/diagrams/treemap/renderer.ts`
 * 经 sourcemap sourcesContent 核对）中 `data-` 出现 **0 次**；唯一的 id 是按索引编号的
 * 裁剪路径 def（`clip-section-${id}-${i}` / `clip-${id}-${i}`），元素只带 class +
 * d3 布局索引（`treemapSection section${i}` / `treemapNode treemapLeafGroup leaf${i}`），
 * 且索引按**值降序**（`.sort((b,a)=>b.value-a.value)`）——索引序 ≠ 源码序，改值即变序，
 * 无法反注。按 spec 原则「DOM 无 data-id 就不做画布寻址，不伪造」（ADR-0007），本 adapter：
 * - dataIdResolver 恒 null（画布点击不产生选中）、toSelection / canvasIdOf 恒 null、
 *   navigationIds 空数组（方位导航无锚点，回落首节点也没有）；
 * - 双击内联编辑与元素级右键菜单随之不做；
 * - **结构树是完整编辑入口**：选中（结构树点选）、属性表单、右键空白菜单（加分组/加叶子）
 *   与画布键盘（结构树选中后 Tab/Enter/Delete）全部可用。
 * 降级清单：节点画布点选、双击改名、元素级右键菜单——后两者由结构树选中 + 属性面板承接，
 * 语义不缺失，只是入口位置不同。
 */

export const treemapCanvasCapabilities: CanvasCapabilities<ProjectionOf<'treemap'>> = {
  dataIdResolver: () => () => null,
  toSelection: () => null,
  // 画布上没有可寻址 DOM：一律返回 null——安静地不高亮
  canvasIdOf: () => null,
  navigationIds: () => [],
  keyboardProjection: (projection) => ({ kind: 'treemap', projection: projection.treemap }),
  resolveSelection: (projection, selection) => resolveTreemapSelection(projection.treemap, selection),
  // 删除意图：唯一映射在 canvas-keyboard.treemapDeleteIntent
  deleteIntent: (projection, selection) => treemapDeleteIntent(projection.treemap, selection),
  // 键位语义：唯一映射在 canvas-keyboard.treemapKeyPlan
  keyHandler: (projection) => (input) => treemapKeyPlan(projection.treemap, input),
}
