# 02 连线的元素身份：位置序寻址（打通选中链路）

Status: resolved

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

- [x] class 图：点击一条关系边 → 该边被选中（高亮）、右侧出现 `RelationForm`。
- [x] class 图：点击关系**标签**、点击**基数文本**，行为符合预期（基数无 data-id，
      需明确是"不响应"还是"归属到边"——实现时定，并在 Comments 记录）。
- [x] sequence 图：点击一条消息线 → 选中、右侧出现 `MessageForm`。
- [x] **中位插入回归**：插入一条新关系/新消息后，再点原有连线，选中的仍是**同一条语义上的线**
      （位置序正确反映源码顺序）。
- [x] 节点点选不回归；方向键导航不回归。
- [x] 控制台 0 error / 0 warning。

## Comments

### 裁定：点击 class 关系**标签** / **基数文本** → **归属到边**

- **结论**：点关系标签（`g.edgeLabel span.edgeLabel`）与点基数文本（`g.edgeTerminals span.edgeLabel`）
  都**归属到该关系边**——选中该边、右侧出现 `RelationForm`，与点线同效。
- **理由**：本票用**位置序**而非 data-id 做身份。`g.edgeLabels` 的直接子元素序列与投影的逐条关系
  序列同构（实测：关系 1 = 标签 + 基数组、关系 2 = 标签、关系 3 = 无标签无基数、关系 4 = 标签 + 基数组），
  据此把每个 `g.edgeLabel` / `g.edgeTerminals` 子元素也标上其所属关系的 `data-id`（`relation:N`）。
  点击标签/基数时沿 DOM 向上命中该 `data-id` → 选中该边。**这不是 data-id 路径**：spec 记载的
  「基数文本从 `span` 到 `<svg>` 全程无 data-id」依旧成立，正因 data-id 无从归属，才必须靠位置序标注
  把身份"贴"上去。**工单 09 场景 A 可依赖此结论**。
- **代价 / 退化边界**：`annotateClassRelationIdentities` 依赖「`g.edgeLabels` 子元素序列与投影逐条同构」。
  mermaid 升版若改此结构，该种类退化为「点标签/基数不响应」（整体放弃标注），**不会点错关系**。

### 实际改动

- **新建** `src/lib/canvas-selection/edge-identity.ts`（纯函数）：`isEdgeElementId` /
  `edgeElementIdOf(kind, ordinal)` / `edgeOrdinalOf(elementId)`；elementId 形如
  `relation:N` / `message:N` / `note:N` / `block:N`，N 为 1 基。
- **新建** `src/lib/canvas-selection/edge-locate.ts`（DOM 适配层，与 `canvas-measure.ts` 同层）：
  - `relationShapesOf(relations)`：由投影算出每条关系的「有无标签 / 有无基数」形状，用于把
    `g.edgeLabels` 子元素序列对齐到关系序。
  - `annotateClassRelationIdentities(root, shapes)` / `annotateSequenceIdentities(root, counts)`：
    把位置序身份写到对应 DOM 元素的 `data-id` 上（沿用节点 data-id 反注的同一机制）。
  - `hitTestEdgeIdentity(root, clientX, clientY, tolerance)`：兜底命中，沿**真实路径**采样
    （`getTotalLength` / `getPointAtLength` / `getScreenCTM`），**不用 bbox 中心**。
  - **绝不误归属**：候选条数与投影条数不符时，该种类整体放弃标注（宁可点不到，不可点错）。
- **新建** `src/lib/canvas-selection/edge-adapter.ts`：`edgeSelectionOf(diagramType, elementId)` →
  编辑器 `Selection`（class → `class-relation`；sequence → `message` / `note` / `block`）。
- **修改** `src/lib/canvas-selection/data-id.ts`：`CanvasSelection` 新增 `{ kind:'element', elementId }`
  变体；新增 `elementDataIdResolver`。
- **修改** `src/lib/canvas-selection/use-canvas-selection.ts`：新增 `annotateEdges` / `hitTestEdge`
  选项；渲染后处理链固定为 `annotateNodeDataIds → annotateEdges → addEdgeHitAreas → 高亮`
  （标注必须在工单 01 克隆之前，克隆才能继承身份）；onClick 先 `selectionFromEventTarget`，
  未命中再 `hitTestEdgeIdentity` 兜底。
- **修改** `src/components/CanvasPanel.tsx`：`resolverOf` 对 class/sequence 改为 `nodes ?? edges`；
  `canvasToEditorSelection` 增加 `element` 分支走 `edgeSelectionOf`；`selectedDataIdOf` 增加四类连线；
  新增 `sequenceEdgeCounts` 并接线 `annotateEdges` / `hitTestEdge`。
- **修改** `src/lib/canvas-selection/flowchart-adapter.ts`：`toEditorSelection` 返回
  `Selection | null`，并为 `element` 变体补 `null`（flowchart 无位置序连线）。
- **修改** `src/lib/editing/context-menu.ts`：`ContextMenuTarget` 新增 `class-relation` /
  `sequence-message` / `sequence-note` / `sequence-block`（各带 elementId），
  `contextMenuTargetFromSelection` 复用 `edgeSelectionOf` 收窄；四类连线 target 的菜单项
  **暂返回 `[]`**（落点属工单 03）。

### 关键取舍

1. **身份 = 投影既有 elementId（1 基），不另造 0 基编号**。工单正文写 `class-relation:{n}`（0 基），
   但 spec.md Q13 的权威口径是「位置序」，且投影/pipeline 早已产出 `relation:N`
   （`src/lib/pipeline/class.ts:368`，`counters.relation++` 后取用，1 基）、`message:N` /
   `note:N` / `block:N`（`src/lib/pipeline/sequence.ts`）。按「源码唯一真相源」复用这套 elementId，
   可直接走既有 `commitIntent` → 快照撤销栈，编辑意图零转换；另造 0 基编号只会多出一层纯粹的口径转换。
   故画布 `data-id` 取 `relation:N`，编辑器 `Selection` 的 `kind` 仍是 `class-relation`。
2. **不用 mermaid `data-id`**（ADR-0012）：本 app 右键加关系/加消息按 `afterElementId` **中位插入**，
   mermaid 的 `id_{源}_{目标}_{N}`（class）/ `iN`（sequence）实测会重排，正是最坏场景。
   位置序 = 文档序：mermaid 按源码顺序产出连线 DOM，「文档序第 k 个候选」即「源码第 k 条」。
3. **沿真实路径采样命中**，禁用 bbox 中心（class 斜线 bbox 退化，中点命中 `<svg>` 根）。
4. **候选与投影条数必须一致才标注**，否则整体放弃——容忍「点不到」，绝不容忍「点错」。

### 对本票正文两处实测的修正

- 正文 §2 称「每条 class 边是 **2 个重复 `<path>`**，只有第 2 个带 `marker-end`」。真机探针
  （页面内直接用 mermaid 12.0.0 `render`，绕过 app 后处理）确认：**mermaid 每条 class 关系只产出
  1 个 `<path>`**（`.edgePaths` 子元素数 == 关系数）。正文所述「2 个」实为**本 app 工单 01 的命中克隆**
  （克隆无 `id`、无 `marker-end`、带 `data-vm-hit`）。实现保留「相邻同值去重」以兼容两种结构，
  但不把克隆当身份依据。
- sequence 的 `iN` 不是「块内消息独立编号」而是全局渲染序号（含注释/块）；块内消息的 `data-id`
  在 DOM 上出现在块外顺序、无包含关系 → 更确认必须用「文档序 + 投影条数」而非 `iN`。

### 测试结果

- `npm run typecheck`：**0 error**。
- `npm test`：**49 个测试文件 / 650 个用例全绿**（基线 46 文件 / 613 用例；本票 +3 文件 +37 用例，只增不减）。
  - 新增：`edge-identity.test.ts`（7）、`edge-adapter.test.ts`（4）、`edge-locate.test.ts`（20，含
    「命中判定不得用 bbox」的 `forbidBBox` 断言、假几何注入、重复 path 去重、命中克隆排除、
    条数不符整体放弃、采样命中 / 容差 / 最近优先 / 只认位置序身份）。
  - 修改：`data-id.test.ts`（+2，`elementDataIdResolver`）、`context-menu.test.ts`（+ 四类连线 target、
    按图种收窄、连线菜单项暂空）。

### 真机验收（agent-browser，vite dev :5199）

- class 点关系边 → `selectedInsideSvg:["relation:1"]`，面板出现
  `A → B / 关系类型 / 起点基数 / 终点基数 / 关系标签 / 删除关系`（`RelationForm`）。✅
- **中位插入回归**：源码 `A --> B; A "1" --> C; A --> D; B --> D : lbl; C "0..*" --> D`，在
  `B --> D` 前插入 `A --> D` 后点击 `B --> D : lbl` 的线 → 选中 `relation:4`、面板显示 `B → D`
  （语义仍是原来那条线）。✅
- 点标签 → 归属到边：点 `lbl` → `relation:3`、面板 `B → D`。✅
- 点基数 → 归属到边：点 `"1"` → `relation:2`、面板 `A → C`。✅
- sequence 点消息 → `["message:1"]`、`MessageForm`。✅
- sequence 点注释 → `["note:1"]`、注释表单（注释位置 / 注释文本 / 删除注释）。✅
- sequence 点块 → `["block:1"]`、块表单（分支 / 块标题 / 删除逻辑块）。✅
- **节点点选不回归**：class 点 A → `["A"]` + 类表单；sequence 点参与者 A → `["A","A"]` + 参与者表单。✅
- **方向键方位导航不回归**：class 选中 A → `ArrowDown` → B；sequence 选中 A → `ArrowRight` → B
  （均为几何相邻；无候选时保持原选中不动）。✅
- **控制台 0 error / 0 warning**。✅

### 未做项

- 四类连线 target 的**右键菜单项**（`contextMenuItems`）暂返回 `[]`——按工单拆属工单 03 的落点；
  本票只把选中链路（点击）打通并预留 target 形状。
- flowchart 的 `element` 变体 `toEditorSelection` 返回 `null`（flowchart 无位置序连线，本票不涉及）。
- `rect` / `box` / `namespace`（无 data-id / 包含语义，ADR-0014）、`destroy`（不进模型）——
  spec「非目标」，不做。
