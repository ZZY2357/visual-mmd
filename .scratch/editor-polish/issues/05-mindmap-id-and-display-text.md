# 05 mindmap 的 id 与显示文本分离

Status: resolved

## 需求

背景（见 spec 与 ADR-0009）：mermaid mindmap 里纯文本节点的 `nodeId` 与显示文本是同一个串；
`id[文本]` 才把两者分开，**且分离必然引入形状**（默认方框）。

- **默认不分离**：新节点仍是纯文本（Tab / 右键新建都落 `新节点` 这类纯文本），**不自动生成 id**。
- 画布内联编辑的编辑对象 = **显示文本**（现状保持，不改）。
- 属性面板表单给两个字段：**显示文本**（现有）+ **节点 ID**（新增），与 flowchart 表单的双字段结构
  对齐（参考 `property-forms.tsx:108-169`）。
- **设置 ID**（当前无 id → 用户填入 `NewId`）：由 `显示文本` 变为 `NewId[显示文本]`。
  - 显示文本**逐字保留**（含空格，即 `User Input` → `UserNewInput[User Input]`，不是丢空格）
  - 节点原有形状（`( )` / `(( ))` / `{{ }}` 等）与 `::icon` **保留**，只插入 id 前缀
  - 原本无形状 → 默认方框 `[]`（外观会从纯文本变为方框，这是语法必然，票面已声明不是 bug）
- **清除 ID**（字段清空）：还原为纯文本节点（去掉 id 前缀，显示文本与形状按 mermaid 语义回落）。
- **改 ID**（已有 id → 换一个）：只改 id 前缀，显示文本与形状不动。
- 校验与重名：字符集沿用 `mindmap.ts:85` 的约束（**禁空白、圆括号、方括号、花括号**），非法时表单
  禁用提交；**重名允许**（mermaid 实测接受 `a[x]` + `a[y]`）。
- 投影补 `id` 字段（现在 `mindmap-projection.ts:41` 把它丢了）；**结构树只显示显示文本**，不加 id 徽标。
- **画布寻址保持位置序**（`mindmap-node:N` / DOM `node_N`）：id 的增删改**不得**影响选中、高亮、
  内联编辑定位。不改 ADR-0007 的 data-id 机制。
- 右键菜单维持三项（加子节点 / 编辑文本 / 删除），**不加"编辑 ID"**。

## 落码位置

- `src/lib/pipeline/mindmap.ts`：新增意图 `set-node-id`（对称 flowchart 的 `renameNodeIntent`，
  参考 `flowchart-forms.ts:111-114` 与 `resolveRenameNode` `flowchart.ts:1052-1065`）；
  `MindmapIntent` 在 `:151-169`；节点渲染在 `renderMindmapNode:132-142`；id 解析在 `parseNodeBody:80-92`
- `src/lib/projection/mindmap-projection.ts:10-20 / :41`（补 `id`）
- `src/components/mindmap-forms.tsx:64-72`（`MindmapNodeForm` 加「节点 ID」字段）
- `src/lib/editing/canvas-keyboard.ts:104-113` 与 `use-canvas-keyboard.ts:73-91`（新建节点保持纯文本，
  无需改逻辑，仅确认不引入 id）

## 验收

- 新建节点默认 `新节点` 纯文本，表单里 ID 字段为空。
- 填入 `NewId` → 源码变 `NewId[新节点]`（原本无形状 → 方框）；画布选中态、高亮、双击内联编辑全部不位移。
- 对有形状的节点设 id → 形状保留，例如 `((圆))` → `id((圆))`。
- 显示文本含空格时保留：`User Input` → `UserNewInput[User Input]`。
- 清空 ID → 还原纯文本 `User Input`。
- 输入含空格/括号的 id → 表单阻止提交（源码不落码）。
- 两个节点用同一个 id → 允许，不报错。
- 撤销/重做覆盖设 id / 清 id。

## 测试

- `pipeline/__tests__/mindmap.test.ts`：设 id / 清 id / 形状保留 / 空格保留 / 非法字符返回 null /
  往返 verbatim identity（未触碰文本逐字不变）。
- `mindmap-projection` 单测：`id` 字段透出、为空时是 null。
- `mindmap-forms` 交互测试：两个字段的取值与提交、非法禁用。
- 金样：`NewId[新节点]` 与 `id((圆))` 必须通过 `mermaid.parse`。

## Comments

- 实现提交 `89978ad`（合并后 `295aa68`）。`npm run typecheck` 与 `npm test` 全绿。新增
  `mindmap-projection.test.ts`、`mindmap-forms.test.tsx`，金样补 `NewId[新节点]` 与 `id((圆))`。
- 清 id 的语义票面两句有张力（"还原纯文本" vs "形状按 mermaid 语义回落"）。实现取：去掉 id 前缀，
  并去掉**分离必然引入的方框**（`UserNewInput[User Input]` → `User Input`），用户自选的圆/
  圆角/六边形形状保留（`root((思维导图))` → `((思维导图)`）。工单 07 验收时确认。
