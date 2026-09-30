import { resolvePieSelection } from '../projection/pie-projection'
import { pieDeleteIntent, pieKeyPlan } from '../editing/canvas-keyboard'
import type { CanvasCapabilities, ProjectionOf } from './capabilities'

/**
 * pie 适配器（more-diagrams 工单 10）：把 pie 投影接到画布能力包上（ADR-0015）。
 *
 * **画布不可寻址（如实降级，ADR-0007）**：mermaid v12 的 pie 渲染器
 * （pieDiagram 的 draw）不给扇区任何 `data-id`，也没有 DOM id——扇区本体是
 * `append("path")`（只有 d / fill / class="pieCircle"，node_modules/mermaid/dist/
 * chunks/mermaid.core/pieDiagram-5QR66LMP.mjs 渲染函数 191–200 行），百分比文本
 * `append("text")`（class="slice"，202–206 行），图例 `append("g")`（class="legend"，
 * 212–213 行），三者都无 id / data-id 可反解。且渲染前 filteredArcs 会把合计占比
 * 取整为 0% 的扇区整个过滤掉——DOM 元素与源码扇区连「位置序对齐」都不成立。
 * 因此本适配器按指南 §4「无画布可寻址元素」降级：`dataIdResolver` 返回永不命中的
 * resolver、`toSelection` / `canvasIdOf` 返回 null、`navigationIds` 返回 []；
 * **不实现 `edgeAnnotator`**（pie 无连线语法）。
 *
 * 降级随之传导（工单定案）：画布点选、双击内联编辑（改标签）、元素级画布右键菜单
 * 全部不做——标签/数值的编辑入口 = 结构树选中 + 右侧属性表单；键盘经能力包
 * `keyHandler`（`pieKeyPlan`）对**结构树选中的扇区**生效（画布键盘读 store 选中，
 * 不依赖 DOM 寻址）。
 */
export const pieCanvasCapabilities: CanvasCapabilities<ProjectionOf<'pie'>> = {
  // 无 data-id：永不命中（只认已知元素也无法命中，因为没有东西会带着 data-id 出现）
  dataIdResolver: () => () => null,
  // 画布选中不可能产生（resolver 永不命中）——保留空实现以守能力包形状
  toSelection: () => null,
  // 画布上无高亮目标：扇区不可寻址，安静地不高亮
  canvasIdOf: () => null,
  // 无画布可寻址节点 → 不参与方位导航 / 回落首节点
  navigationIds: () => [],
  keyboardProjection: (projection) => ({ kind: 'pie', projection: projection.pie }),
  resolveSelection: (projection, selection) => resolvePieSelection(projection.pie, selection),
  // 删除意图：唯一映射在 canvas-keyboard.pieDeleteIntent
  deleteIntent: (projection, selection) => pieDeleteIntent(projection.pie, selection),
  // 键位语义：唯一映射在 canvas-keyboard.pieKeyPlan（Tab 加扇区 / Delete 删除；
  // Enter 无自然类比，工单定案不做）
  keyHandler: (projection) => (input) => pieKeyPlan(projection.pie, input),
}
