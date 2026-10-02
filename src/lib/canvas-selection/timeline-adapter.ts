import { resolveTimelineSelection } from '../projection/timeline-projection'
import { timelineDeleteIntent, timelineKeyPlan } from '../pipeline/timeline-keyboard'
import type { CanvasCapabilities, ProjectionOf } from './capabilities'

/**
 * timeline 适配器（more-diagrams 工单 05）：把 timeline 投影接到画布能力包上（ADR-0015）。
 *
 * **画布不可寻址（如实降级，ADR-0007）**：mermaid v12 的 timeline 渲染器不给时期/事件/
 * section 任何 `data-id`，节点组 `<g class="timeline-node section-N">` 连 DOM `id` 都没有
 * （唯一带 id 的是背景 `<path id="{svgId}-node-{N}">`，且 N 是**渲染顺序计数器**、不是
 * 源码身份；见工单 Comments 的实测证据）。因此本适配器按指南 §4「无画布可寻址元素」降级：
 * `dataIdResolver` 返回永不命中的 resolver、`toSelection` / `canvasIdOf` 返回 null、
 * `navigationIds` 返回 []；**不实现 `edgeAnnotator`**（timeline 无连线语法）。
 *
 * 编辑入口：结构树（时期/事件/section 全可选中）+ 右侧属性表单是完整入口；键盘经
 * 能力包 `keyHandler`（`timelineKeyPlan`）对**结构树选中的时期**生效（画布键盘读 store 选中，
 * 不依赖 DOM 寻址）。
 */
export const timelineCanvasCapabilities: CanvasCapabilities<ProjectionOf<'timeline'>> = {
  // 无 data-id：永不命中（只认已知元素也无法命中，因为没有东西会带着 data-id 出现）
  dataIdResolver: () => () => null,
  // 画布选中不可能产生（resolver 永不命中）——保留空实现以守能力包形状
  toSelection: () => null,
  // 画布上无高亮目标：时期/事件/section 都不可寻址，安静地不高亮
  canvasIdOf: () => null,
  // 无画布可寻址节点 → 不参与方位导航 / 回落首节点
  navigationIds: () => [],
  keyboardProjection: (projection) => ({ kind: 'timeline', projection: projection.timeline }),
  resolveSelection: (projection, selection) => resolveTimelineSelection(projection.timeline, selection),
  // 删除意图：唯一映射在 pipeline/timeline-keyboard 的 timelineDeleteIntent
  deleteIntent: (projection, selection) => timelineDeleteIntent(projection.timeline, selection),
  // 键位语义：唯一映射在 pipeline/timeline-keyboard 的 timelineKeyPlan（Tab 加事件 / Enter 加时期 / Delete）
  keyHandler: (projection) => (input) => timelineKeyPlan(projection.timeline, input),
}
