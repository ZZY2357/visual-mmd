import { resolveCynefinSelection } from '../projection/cynefin-projection'
import { cynefinDeleteIntent, cynefinKeyPlan } from '../pipeline/cynefin-keyboard'
import { nonAddressableCapabilities } from './non-addressable-capabilities'
import type { CanvasCapabilities, ProjectionOf } from './capabilities'

/**
 * cynefin 适配器（more-diagrams 工单 25）：把 cynefin 投影接到画布能力包上（ADR-0015）。
 *
 * **画布寻址整体降级（research §4/§8.1 实测记录）**：mermaid 12.0.0 的 cynefin 渲染器
 * （`dist/chunks/mermaid.core/cynefinDiagram-VND7K2PF.mjs`，源码
 * `src/diagrams/cynefin/cynefinRenderer.ts`，437 行）中 `data-` 出现 **0 次**；
 * `.attr('id', …)` 仅 1 处（`cynefinRenderer.ts:358` 的 `<defs>` 箭头 marker
 * `cynefin-arrow-${id}`，与「域/条目/转移」元素一一对应无关）。元素只带 class
 * （域背景 `.cynefinDomain`、域标签 `.cynefinDomainLabel`、条目 `.cynefinItemText` /
 * `.cynefinItem`（溢出 `.cynefinItemOverflow`）、转移 `.cynefinArrowLine` /
 * `.cynefinArrowLabel`）——全部无 id / data-id。按 spec 原则「DOM 无 data-id
 * 就不做画布寻址，不伪造」（ADR-0007），本 adapter：
 * - dataIdResolver 恒 null（画布点击不产生选中）、toSelection / canvasIdOf 恒 null、
 *   navigationIds 空数组（方位导航无锚点，回落首元素也没有）；
 * - 双击内联编辑与元素级右键菜单随之不做；
 * - **结构树是完整编辑入口**：选中（结构树点选）、属性表单、右键空白菜单（加条目 / 加转移）
 *   与画布键盘（结构树选中后 Tab/Enter/Delete）全部可用。
 * 降级清单：域/条目画布点选、双击改名、元素级右键菜单——后两者由结构树选中 + 属性面板承接，
 * 语义不缺失，只是入口位置不同。
 *
 * WIRING-GUIDE 清单中**不适用**的条目（明确写「不做」+ 理由）：
 * - 第 9 项 `node-form-popup.tsx` 的「新建节点后浮出输入框」：不做双击内联命名时不需要
 *   （画布无 data-id，新建走右键空白菜单 / 结构树，无「点击新节点」这一步）；
 * - 第 13 项 `inline-edit.ts` / `use-canvas-inline-edit.ts`：**不做双击内联编辑**——
 *   画布无 data-id，双击目标无从解析（ADR-0007 诚实降级），文本编辑在右侧表单；
 * - 第 15 项 `node-data-ids.ts` / `edge-adapter.ts` / `edge-locate.ts`：**不做画布可寻址
 *   反注**——渲染器根本无 id / data-id 可注入（research §8.1 实测），无从反注。

 */

export const cynefinCanvasCapabilities: CanvasCapabilities<ProjectionOf<'cynefin'>> = nonAddressableCapabilities({
  keyboardProjection: (projection) => ({ kind: 'cynefin', projection: projection.cynefin }),
  resolveSelection: (projection, selection) => resolveCynefinSelection(projection.cynefin, selection),
  // 删除意图：唯一映射在 pipeline/cynefin-keyboard 的 cynefinDeleteIntent
  deleteIntent: (projection, selection) => cynefinDeleteIntent(projection.cynefin, selection),
  // 键位语义：唯一映射在 pipeline/cynefin-keyboard 的 cynefinKeyPlan
  keyHandler: (projection) => (input) => cynefinKeyPlan(projection.cynefin, input),
})
