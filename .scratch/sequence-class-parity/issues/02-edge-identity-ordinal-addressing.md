# 02 连线的元素身份：位置序寻址（打通选中链路）

Status: pending

**Blocked by: 01**（参与者语义变更后消息端点的组织方式要跟着定）

来源：`spec.md` 的 Q13 定案（ADR-0012）。**这是 (b)(c) 两类缺口的共同地基**——没有它，
连线既点不到（b）也无法作为右键目标（c）。

## 需求

### 1. 连线身份 = 位置序

- **class**：`class-relation:{n}`，`n` = 关系在投影中的顺序（0 基）。
- **sequence**：`message:{n}` / `note:{n}` / `block:{n}`，各自按投影顺序编号。
- **明确不用 mermaid `data-id`**（实测会重排，ADR-0012 有对照表）。
- **不纳入本票**：`rect` / `box` / `namespace`（无 data-id、无包含语义，ADR-0014）；
  `destroy`（不进模型）。

### 2. 从源码位置到 DOM 的映射

位置序身份要能落到 DOM 上才能点选。**实测给出的可行路径**：

- **class 关系边**：`<path data-id="id_{源}_{目标}_{N}">` **同时带 `id` 属性** =
  `{svgId}-{data-id}`。可作备选选择器 `[id$="-"+dataId]`。
- **命中判定**：**不能用 `getBoundingClientRect().中心`**——class 斜线 bbox 退化
  （实测 `x=651 y=332 w=36 h=13`），中点 `elementFromPoint` 命中 `<svg class="classDiagram">` 根、
  无 data-id。**必须沿真实路径采样**：`getTotalLength()` + `getPointAtLength()` +
  `getScreenCTM()` 转屏幕坐标（实测 9/9 采样点直达 `path[data-id]` 自身）。
- **sequence 消息线**：`<line data-id="iN">`，`pointer-events: auto` + `stroke-width: 1.5px`，
  **无需额外加粗即已可命中**（实测中点及沿线 9/9 命中自身）。
- 每条 class 边是 **2 个重复 `<path>`**（只有第 2 个带 `marker-end`）→ 遍历时必须去重或只取一个。

### 3. 落码位置（三段式，沿用工单 14 的分层理由）

- **纯函数**（可单测，无 DOM）：位置序 ↔ elementId 的互转、候选连线的顺序稳定性断言。
- **DOM 适配层**：把关联的连线元素找到并命中（沿路径采样）。与 `canvas-measure.ts` 同层。
- **接线**：`canvasToEditorSelection`（`CanvasPanel.tsx:67-79`）、`selectedDataIdOf`（`:82-96`）、
  `context-menu.ts:55-69` 的 edge 分支。

### 4. 不变量

- **节点寻址不动**：ADR-0007 对节点仍成立（类名/参与者名 data-id 稳定，实测确认）。
- 方向键（ADR-0011）的方位导航不受影响——它只吃节点的可视范围。
- 属性面板的既有表单（`RelationForm` / `MessageForm`）**照旧复用**，不新建表单。

## 测试

- 纯函数单测：位置序生成、elementId 互转、顺序稳定性。
- DOM 适配层：**注入假几何**（不碰真 mermaid）——沿路径采样的命中、bbox 退化场景不误判。
- 一次真机验收（见「验收」）。

## 验收

- [ ] class 图：点击一条关系边 → 该边被选中（高亮）、右侧出现 `RelationForm`。
- [ ] class 图：点击关系**标签**、点击**基数文本**，行为符合预期（基数无 data-id，
      需明确是"不响应"还是"归属到边"——实现时定，并在 Comments 记录）。
- [ ] sequence 图：点击一条消息线 → 选中、右侧出现 `MessageForm`。
- [ ] **中位插入回归**：插入一条新关系/新消息后，再点原有连线，选中的仍是**同一条语义上的线**
      （位置序正确反映源码顺序）。
- [ ] 节点点选不回归；方向键导航不回归。
- [ ] 控制台 0 error / 0 warning。
