import { resolveEventModelingSelection } from '../projection/eventmodeling-projection'
import { eventModelingDeleteIntent, eventModelingKeyPlan } from '../pipeline/eventmodeling-keyboard'
import type { CanvasCapabilities, ProjectionOf } from './capabilities'

/**
 * eventmodeling 适配器（more-diagrams 工单 28）：把 eventmodeling 投影接到画布能力包上（ADR-0015）。
 *
 * **画布不可寻址（如实降级，ADR-0007）**：mermaid 12.0.0 的 eventmodeling 渲染器
 * （diagram-ATOU4E4O.mjs）全程不给任何可寻址 id / data-id——`g.em-box`（603 行）、
 * `g.em-swimlane`（642 行）、`path.em-relation`（636 行）三处皆无 data-id / 稳定 id；
 * 唯一带 id 的是 `<defs>` 里的箭头 marker `em-arrowhead-${diagramId}`（660/667 行），
 * **不是元素级 id**（research §4/§8.3 静态核对证据）。因此本适配器按指南 §4
 * 「无画布可寻址元素」**整体降级**：`dataIdResolver` 返回永不命中的 resolver、
 * `toSelection` / `canvasIdOf` 返回 null、`navigationIds` 返回 []；
 * **不实现 `edgeAnnotator` / `nodeAnnotator`**（不伪造 id、不退回 flowchart 范式）。
 *
 * 降级随之传导（工单定案）：画布点选、元素级画布右键菜单全部不做——帧 / 数据块的编辑
 * 入口 = **结构树选中 + 右侧属性表单 + 空白右键加帧 / 加数据块**；键盘经能力包
 * `keyHandler`（`eventModelingKeyPlan`）对**结构树选中**生效（画布键盘读 store 选中，
 * 不依赖 DOM 寻址）。派生连线（默认推断关系，无源码语句）只读，不可删。
 */
export const eventModelingCanvasCapabilities: CanvasCapabilities<ProjectionOf<'eventmodeling'>> = {
  // 无 data-id：永不命中（没有东西会带着 data-id 出现）
  dataIdResolver: () => () => null,
  // 画布选中不可能产生（resolver 永不命中）——保留空实现以守能力包形状
  toSelection: () => null,
  // 画布上无高亮目标：帧 / 数据块不可寻址，安静地不高亮
  canvasIdOf: (_projection, _selection) => null,
  // 无画布可寻址节点 → 不参与方位导航 / 回落首节点
  navigationIds: () => [],
  keyboardProjection: (projection) => ({ kind: 'eventmodeling', projection: projection.eventmodeling }),
  resolveSelection: (projection, selection) =>
    resolveEventModelingSelection(projection.eventmodeling, selection),
  // 删除意图：唯一映射在 pipeline/eventmodeling-keyboard 的 eventModelingDeleteIntent
  deleteIntent: (projection, selection) =>
    eventModelingDeleteIntent(projection.eventmodeling, selection),
  // 键位语义：唯一映射在 pipeline/eventmodeling-keyboard 的 eventModelingKeyPlan（帧上 Tab 加同泳道帧 /
  // Enter 加事件帧 / Delete 删除；数据块上无 Tab/Enter 语义）
  keyHandler: (projection) => (input) => eventModelingKeyPlan(projection.eventmodeling, input),
}
