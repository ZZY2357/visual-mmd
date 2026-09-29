# 05 编辑键与双击内联编辑：扩到 class / sequence

Status: pending

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

- [ ] class 图：选中类后 `Enter` 弹出加关系表单、`Tab` 弹出加成员表单；提交后落码正确。
- [ ] sequence 图：选中参与者后 `Enter` 弹出加消息表单、`Tab` 走加参与者。
- [ ] 两图种 `Delete` 删除选中元素，级联行为与属性面板的删除一致。
- [ ] class 双击类名 → 内联改名，所有引用（成员/关系/note）跟着改。
- [ ] sequence 双击参与者 → 内联改 `as` 别名；actorId 不变、消息端点不错位。
- [ ] **双击成员正文 / 关系标签 / 消息文本 → 不进入内联编辑**（行为可预测性）。
- [ ] 空白右键新建后的"立即命名"路径不回归。
- [ ] **可达性实测**：确认 `Tab` 在两图种上不再跳出画布，且 `Escape` 仍能离开。
- [ ] 方向键方位导航不回归。
- [ ] 控制台 0 error / 0 warning。
