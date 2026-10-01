import { resolveZenumlSelection } from '../projection/zenuml-projection'
import { zenumlDeleteIntent, zenumlKeyPlan } from '../editing/canvas-keyboard'
import type { CanvasCapabilities, ProjectionOf } from './capabilities'

/**
 * zenuml 适配器（more-diagrams 工单 19）：把 zenuml 投影接到画布能力包上（ADR-0015）。
 *
 * **画布寻址整体降级（任务 0 实测记录）**：`@mermaid-js/mermaid-zenuml` 1.0.1 经
 * `registerExternalDiagrams` 接入 mermaid 12.0.0 后，渲染产物（`@zenuml/core` 的
 * `renderToSvg`）**无 `data-id`、无 `id` 属性**；唯一的数据属性 `data-participant`
 * （值域 `_STARTER_` / 参与者名）不成稳定映射（既非全部元素都有、也不等于参与者标识符
 * 的注入点）。按 spec 原则「DOM 无 data-id 就不做画布寻址，不伪造」（ADR-0007），本 adapter：
 * - dataIdResolver 恒 null（画布点击不产生选中）、toSelection / canvasIdOf 恒 null、
 *   navigationIds 空数组（方位导航无锚点，回落首元素也没有）；
 * - 双击内联编辑随之不做（双击目标无从解析，改别名走右键菜单「改别名」/ 结构树）；
 * - **结构树是完整编辑入口**：选中（结构树点选）、属性表单、右键空白菜单
 *   （加参与者 / 加消息）与画布键盘（结构树选中后 Tab/Delete）全部可用。
 * 降级清单：参与者/消息/片段画布点选、**画布双击改名**、元素级右键菜单（画布目标不可命中）——
 * 后两者由结构树选中 + 属性面板 / 右键菜单（程序构造目标）承接，语义不缺失。
 * 改别名仍有内联编辑入口（右键菜单「改别名」→ `beginInlineEdit({kind:'zenuml-participant'})`），
 * 只是**不由画布双击触发**（双击目标无从解析）。
 *
 * WIRING-GUIDE 清单中**不适用**的条目（明确写「不做」+ 理由）：
 * - 第 9 项 `node-form-popup.tsx` 的「新建节点后浮出输入框」：不做画布双击命名时不需要
 *   （画布无 data-id，新建走右键空白菜单 / 结构树，无「点击新节点」这一步）；
 *   本工单为该文件新增的是「添加消息」表单浮层（`zenuml-message`），属表单承接而非节点命名；
 * - 第 13 项 `inline-edit.ts` / `use-canvas-inline-edit.ts`：**不做画布双击内联编辑**——
 *   画布无 data-id，双击目标无从解析（ADR-0007 诚实降级）；改别名的内联编辑经右键菜单
 *   程序构造目标触发，`inlineEditTargetFromEvent` 对 zenuml 一律返回 null；
 * - 第 15 项 `node-data-ids.ts` / `edge-adapter.ts` / `edge-locate.ts`：**不做画布可寻址
 *   反注**——渲染器根本无 id / data-id 可注入（任务 0 实测），无从反注。
 *
 * `canvasIdOf` 用 `(_projection, selection)` 签名（工单 19 遵循既有约定）。
 */

export const zenumlCanvasCapabilities: CanvasCapabilities<ProjectionOf<'zenuml'>> = {
  dataIdResolver: () => () => null,
  toSelection: () => null,
  // 画布上没有可寻址 DOM：一律返回 null——安静地不高亮
  canvasIdOf: (_projection, _selection) => null,
  navigationIds: () => [],
  keyboardProjection: (projection) => ({ kind: 'zenuml', projection: projection.zenuml }),
  resolveSelection: (projection, selection) => resolveZenumlSelection(projection.zenuml, selection),
  // 删除意图：唯一映射在 canvas-keyboard.zenumlDeleteIntent
  deleteIntent: (projection, selection) => zenumlDeleteIntent(projection.zenuml, selection),
  // 键位语义：唯一映射在 canvas-keyboard.zenumlKeyPlan
  keyHandler: (projection) => (input) => zenumlKeyPlan(projection.zenuml, input),
}
