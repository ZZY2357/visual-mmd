import { resolveRadarSelection } from '../projection/radar-projection'
import { radarDeleteIntent, radarKeyPlan } from '../pipeline/radar-keyboard'
import { nonAddressableCapabilities } from './non-addressable-capabilities'
import type { CanvasCapabilities, ProjectionOf } from './capabilities'

/**
 * radar 适配器（more-diagrams 工单 15）：把 radar-beta 投影接到画布能力包上（ADR-0015）。
 *
 * **画布不可寻址（如实降级，ADR-0007）**：mermaid 12 的 radar 渲染器
 * （diagram-MPIPVDR6.mjs）全程不给任何 DOM id / data-id——轴标签
 * `append("text")` 只有 `class="radarAxisLabel"`（drawAxes 206 行），曲线
 * `class="radarCurve-N"`（drawCurves），图例 `class="radarLegend"`，三处皆无
 * id / data-id 可反解（工单 Comments 记录证据）。因此本适配器按指南 §4
 * 「无画布可寻址元素」降级：`dataIdResolver` 返回永不命中的 resolver、
 * `toSelection` / `canvasIdOf` 返回 null、`navigationIds` 返回 []；
 * **不实现 `edgeAnnotator`**（radar 无连线语法）。
 *
 * 降级随之传导（工单定案）：画布点选、元素级画布右键菜单全部不做——轴 / 曲线的
 * 编辑入口 = 结构树选中 + 右侧属性表单 + 空白右键加轴 / 加曲线；键盘经能力包
 * `keyHandler`（`radarKeyPlan`）对**结构树选中**生效（画布键盘读 store 选中，
 * 不依赖 DOM 寻址）；轴 label 另有双击内联编辑（按 class 文本匹配，与 mindmap
 * 同范式，见 inline-edit.ts——canvasIdOf 高亮不做，两者独立）。
 */
export const radarCanvasCapabilities: CanvasCapabilities<ProjectionOf<'radar'>> = nonAddressableCapabilities({
  keyboardProjection: (projection) => ({ kind: 'radar', projection: projection.radar }),
  resolveSelection: (projection, selection) => resolveRadarSelection(projection.radar, selection),
  // 删除意图：唯一映射在 pipeline/radar-keyboard 的 radarDeleteIntent
  deleteIntent: (projection, selection) => radarDeleteIntent(projection.radar, selection),
  // 键位语义：唯一映射在 pipeline/radar-keyboard 的 radarKeyPlan（轴上 Tab 加轴 / 曲线上 Tab 加曲线 /
  // Delete 删除；Enter 无自然类比，工单定案不做）
  keyHandler: (projection) => (input) => radarKeyPlan(projection.radar, input),
})
