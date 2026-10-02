import { resolveJourneySelection } from '../projection/journey-projection'
import { journeyDeleteIntent, journeyKeyPlan } from '../pipeline/journey-keyboard'
import { nonAddressableCapabilities } from './non-addressable-capabilities'
import type { CanvasCapabilities, ProjectionOf } from './capabilities'

/**
 * journey 适配器（more-diagrams 工单 08）：把 journey 投影接到画布能力包上（ADR-0015）。
 *
 * **画布不可寻址（如实降级，ADR-0007）**：mermaid v12 的 journey 渲染器
 * （journeyDiagram 的 drawTask / drawSection）不给任务/section 任何 `data-id`；
 * 任务唯一带 DOM id 的是竖直虚线 `<line id="{svgId}-task{N}">`，且 N 是**渲染顺序
 * 计数器**（taskCount 从 0 起累加）、不是源码身份；任务本体 `<g>` 与 section 的
 * `<g>` / `<rect class="journey-section section-type-N">` 连 id 都没有（N 是配色轮换
 * 序号，与 section 数量不同模，不可反解）。因此本适配器按指南 §4「无画布可寻址元素」
 * 降级：`dataIdResolver` 返回永不命中的 resolver、`toSelection` / `canvasIdOf` 返回
 * null、`navigationIds` 返回 []；**不实现 `edgeAnnotator`**（journey 无连线语法）。
 *
 * 降级随之传导（工单定案）：画布点选、双击内联编辑（改任务名）、元素级画布右键菜单
 * 全部不做——任务名的编辑入口 = 结构树选中 + 右侧属性表单；键盘经能力包 `keyHandler`
 * （`journeyKeyPlan`）对**结构树选中的任务**生效（画布键盘读 store 选中，不依赖 DOM 寻址）。
 */
export const journeyCanvasCapabilities: CanvasCapabilities<ProjectionOf<'journey'>> = nonAddressableCapabilities({
  keyboardProjection: (projection) => ({ kind: 'journey', projection: projection.journey }),
  resolveSelection: (projection, selection) => resolveJourneySelection(projection.journey, selection),
  // 删除意图：唯一映射在 pipeline/journey-keyboard 的 journeyDeleteIntent
  deleteIntent: (projection, selection) => journeyDeleteIntent(projection.journey, selection),
  // 键位语义：唯一映射在 pipeline/journey-keyboard 的 journeyKeyPlan（Tab 同 section 加任务 / Enter 加 section / Delete）
  keyHandler: (projection) => (input) => journeyKeyPlan(projection.journey, input),
})
