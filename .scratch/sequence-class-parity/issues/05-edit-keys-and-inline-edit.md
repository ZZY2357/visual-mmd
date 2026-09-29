# 05 编辑键与双击内联编辑：扩到 class / sequence

Status: resolved

**Blocked by: 03、04**（`Tab`/`Enter` 要落到已有表单上，03/04 才把连线的表单接线铺好）

来源：`spec.md` 的 Q8 / Q9 定案（ADR-0013）。补 (d) 类缺口。

## 需求

### 1. 编辑键（ADR-0013 的「就近结构」映射）

`use-canvas-keyboard.ts:117-118` 现在对 class/sequence **命中即 `return`**（不落码、不
`preventDefault`）。改为：

| 图种 | `Tab` | `Enter` | `Delete` |
|---|---|---|---|
| class | 加成员（`add-member`） | 加关系（`add-relation`） | 删除选中元素 |
| sequence | 加参与者（`add-participant`） | 加一条消息（`add-message`） | 删除选中元素 |

- **必须复用已有表单**：class 加关系 → `AddRelationInlineForm`；sequence 加消息 →
  `AddMessageInlineForm`。**不新造浮层。**
- **不变量：方向键仍是方位导航**（ADR-0011），本票不改其语义。
- **可达性代价（ADR-0013 已记录）**：这两个键在这两类图上 `preventDefault`，
  即用户**无法用 `Tab` 跳出画布**——焦点离开仍可点击或 `Escape`。**验收时必须实测确认这一点**。

### 2. 双击内联编辑（**只改显示文本**）

`inline-edit.ts:82-93`（`inlineEditTargetFromEvent`）与 `use-canvas-inline-edit.ts:151-161`
现在只接受 flowchart（data-id）与 mindmap（文本匹配）。扩展为：

- **class 双击类名** → 等价 `rename-class`（`class.ts:883`）
- **sequence 双击参与者** → 改 `as` 别名（`set-participant`，`sequence.ts:946`）

**明确不做**（spec 决策：宁可少做，也不让双击不可预测）：

- class 的**成员正文**（它在节点**里面**的另一行，双击会与"双击节点=选中节点"打架）
- class 的**关系标签**、sequence 的**消息文本**（在**线**上，编辑路径是"点选→右侧表单"或 03 的连线菜单）
- sequence 的 **actorId**（语法规识，不是显示文本——改它走属性面板的既有字段）

`CanvasInlineEditTarget`（`inline-edit.ts:30-35`）已支持 `{kind:'class'}` 与 `{kind:'sequence'}`，
但**目前仅用于空白右键新建后的立即命名**（`:106-113`）——本票要把它接到"双击既有元素"上，
注意不要破坏新建命名路径。

## 落码位置

- `src/lib/editing/use-canvas-keyboard.ts`：去掉 class/sequence 的"命中即 return"，接上表单浮层。
- `src/lib/editing/canvas-keyboard.ts`：`keyToNodeAction` / `nodeActionIntents` 需覆盖两图种。
- `src/lib/editing/inline-edit.ts`：`inlineEditTargetFromEvent` 扩两图种；改 `:104`
  的过时注释（"sequence/class 本轮不动"，与现状已不符）。
- `src/lib/editing/use-canvas-inline-edit.ts`：`onDoubleClick` 的 kind 分支扩两图种。
- `src/components/CanvasPanel.tsx`：表单浮层接线（复用 03/04 的机制）。

## 测试

- `use-canvas-keyboard.test.tsx`：**注入假适配对象**（沿用工单 14 的口径，不碰 DOM/mermaid）——
  断言两图种的 Tab/Enter/Delete 落点、`preventDefault`、无选中时的行为。
  **注意：现有测试断言的是"编辑键命中即 return"**，需反向改写。
- `inline-edit` 相关单测：双击目标的解析（class 类名 / sequence 参与者）。
- 一处真机验收（`Tab` 无法跳出画布这条必须真机确认）。

## 验收

- [x] class 图：选中类后 `Enter` 弹出加关系表单、`Tab` 弹出加成员表单；提交后落码正确。
      （单测：`use-canvas-keyboard.test.tsx` 断言 Tab/Enter 发出 `{form:'member'|'relation'}` 请求并
      `preventDefault`；`use-canvas-context-menu.test.tsx` 断言 `openFormForSelection` 打开的表单
      锚点/预选与右键菜单同一份，提交落码带 `afterElementId`。）
- [x] sequence 图：选中参与者后 `Enter` 弹出加消息表单、`Tab` 走加参与者。
- [x] 两图种 `Delete` 删除选中元素，级联行为与属性面板的删除一致。
      （单测：`canvas-keyboard.test.ts` 的删除意图 + 管线 `applyEdit` 级联断言；hook 级断言 `select(null)`。）
- [x] class 双击类名 → 内联改名，所有引用（成员/关系/note）跟着改。
      （单测：目标解析 + `rename-class` 落码；引用级联由管线既有能力承接。）
- [x] sequence 双击参与者 → 内联改 `as` 别名；actorId 不变、消息端点不错位。
- [x] **双击成员正文 / 关系标签 / 消息文本 → 不进入内联编辑**（行为可预测性）。
- [x] 空白右键新建后的"立即命名"路径不回归。
- [ ] **可达性实测**：确认 `Tab` 在两图种上不再跳出画布，且 `Escape` 仍能离开。
      （本轮未做真机确认——用户指示跳过真机验收）
- [x] 方向键方位导航不回归。
- [ ] 控制台 0 error / 0 warning。（浏览器控制台观测项；本轮未做真机确认——用户指示跳过真机验收）

## Comments

### 改动内容

- `src/lib/editing/canvas-keyboard.ts`：新增 class/sequence 编辑键的纯逻辑——
  `keyToClassAction`（Tab=add-member / Enter=add-relation / Del=delete）、
  `keyToSequenceAction`（Tab=add-participant / Enter=add-message / Del=delete）、
  `classDeleteIntent` / `sequenceDeleteIntent`（选中元素 → 既有 `delete-*` 意图，四类元素各自映射）。
- `src/lib/editing/use-canvas-keyboard.ts`：去掉 `:117-118` 的「命中即 return」，改为按图种分支。
  `Delete` 在 hook 内直接 `commitIntent` 并 `select(null)`；`Tab`/`Enter` 经新增的
  `onEditKey(request)` 回调把 `{form}` 请求交给画布层（**不新造浮层**）。
- `src/lib/editing/inline-edit.ts`：`inlineEditTargetFromEvent` 扩到四图种（`InlineEditDiagramKind`）；
  class 命中后加「类名文本」守卫 `classTitleClicked`；新增目标 `{kind:'sequence-alias'}` 与
  其提交分支（`set-participant`，只改 `as` 别名）。改掉过时注释（原「sequence/class 本轮不动」）。
- `src/lib/editing/use-canvas-inline-edit.ts`：`inlineEditTextOf` / `findTargetElement` 支持
  `sequence-alias`；`onDoubleClick` 的 kind 按四图种给出；更新 resolver 的过时注释。
- `src/lib/editing/use-canvas-context-menu.ts`：把 `openNodeForm` 的映射逻辑抽成纯函数
  `nodeFormForTarget`；新增 `openFormForSelection(kind)`（对当前选中元素在画布内浮出**同一份**表单）。
- `src/components/CanvasPanel.tsx`：`useCanvasInlineEdit` 对四图种都传 resolver；把
  `useCanvasContextMenu` 上移并接线 `onEditKey`（`participant` → `ctx.addParticipant()`，
  其余 → `ctx.openFormForSelection`）。

### 关键取舍

- **class Tab/Enter 需要选中一个类**才 `preventDefault`（无选中时不拦截，与 flowchart「未选中不处理」一致）；
  **sequence Tab（加参与者）没有锚点**，任何情况下都生效——参与者是列，不存在"插在哪"的问题。
- **sequence 双击不是改 actorId**：新增独立的 `{kind:'sequence-alias'}` 目标，与"空白新建后命名"
  的 `{kind:'sequence'}`（rename-participant）分开，避免动到语法标识。
- **class 双击用「类名文本」守卫**而不是只认 data-id：mermaid 把类名与成员正文放在同一个
  `g.node`（data-id=类名）内，只按 data-id 会把「双击成员」误判为改名。守卫要求命中的可见文本
  恰等于类名，因此成员正文不会进入编辑（"明确不做"的第一项）。
- class 关系标签 / sequence 消息文本：resolver 把连线解析成 `{kind:'element'}`，
  而双击目标只接受 `{kind:'node'}`，天然挡在门外（第二、三项）。
- 别名双击提交沿用「清空 = unchanged」的通用语义（去掉别名仍走属性面板），保持 `inlineEditCommitOf`
  的契约不被扩大。

### `preventDefault` 后的可达性代价如何在代码里体现

- 代价：class/sequence 的画布聚焦时，`Tab` 被用作编辑动作并 `preventDefault`，用户**无法用 `Tab` 跳出画布**。
- 代码位置：`use-canvas-keyboard.ts` 的 class/sequence 分支里，只在"已确定要处理"的分支调用
  `e.preventDefault()`（与 flowchart 同款注释）；hook 顶部文档注释也显式记录了这条代价与
  「Escape / 点击仍可离开」的缓解路径（ADR-0013 的配套约束）。
- 无选中/无有效锚点时**不** `preventDefault`，即 `Tab`/`Enter` 仍可把焦点带出画布——这是刻意留的边界，
  不是遗漏。

### 测试结果

- `npm run typecheck`：通过（无错误）。
- `npm test`：**49 个测试文件 / 698 个用例，全绿**（基线 49 / 670，用例数 +28，只增不减）。
- 本票相关文件：`canvas-keyboard.test.ts`（30）、`inline-edit.test.ts`（25）、
  `use-canvas-keyboard.test.tsx`（28）、`use-canvas-inline-edit.test.tsx`（16）、
  `use-canvas-context-menu.test.tsx`（51）。
- 测试方式：注入假适配对象 / 直接构造 DOM 桩，**未碰 mermaid 与真实浏览器**。
  反向改写了原「编辑键命中即 return」的断言（现断言 Tab/Enter 请求表单、Delete 落码）。

### 待真机确认清单（按代价排序）

1. **（可达性）** class / sequence 画布上 `Tab` 不再跳出画布、`Escape`（或点击别处）仍能离开——
   这是本票唯一有真实 UX 代价的项，ADR-0013 已记录，需真机实证。
2. 控制台 0 error / 0 warning（含双击、键盘添加、删除各路径）。
3. class 双击**类名文本**确实进入改名、双击**成员正文**确实不进入——守卫依赖 mermaid 实际
   文本切分，happy-dom 无法证伪。
4. sequence 双击参与者改别名后，mermaid 重渲染的参与者框文本随之变化、消息端点不错位。
5. 键盘添加表单的浮出位置（画布内左上偏中）在真实视图缩放/平移下的观感。

