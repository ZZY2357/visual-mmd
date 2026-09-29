# Spec: 时序图与类图的对等完善（sequence-class-parity）

来源：`BUG_AND_FEAT.md` 之外的直接指令——用户要求「把时序图和类图也完善」。2026-09-29 grilling
两轮定案：**Q1 范围全开**（四类缺口全补），Q2–Q12 按推荐落实。

本文件是共识的唯一权威记录：**背景事实**（已实测的 mermaid/app 行为，勿重复调研）与**决策记录**
（每条需求的取舍结论）都写在这里；工单文件只写实施细节，不再重述理由。

前序批次：`v1`（12 票，建立四图种管线）、`canvas-interaction`（8 票，画布选中与右键）、
`editor-polish`（14 票，主题/焦点/方位导航）。本批是第四批。

---

## 缺口全景（来自 2026-09-29 勘察，勿重复调研）

勘察结论：ADR-0005 声称的覆盖度**基本属实**，缺口集中在四类。以下每条附证据。

### 类别 (a) 语义边界：解析未支持（原样保留）

- **sequence**：`create` / `destroy`（`sequence.ts:19-20`、`:354`）、`rect` / `box`（含其 `end`，
  `sequence.ts:431`）。`--x`（叉头虚线）不在清单内，不按消息解析（`sequence.ts:207-208`）。
- **class**：`linkStyle`、CSS 注入（`cssClass` / `style`）、`direction`（`class.ts:25-26`、`:411`）；
  `namespace` 落入「无法识别行」（正则 `class.ts:190` 不接受 `:::`）。

### 类别 (b) 画布寻址：连线全线缺失

- `contextMenuTargetFromSelection` 的 edge 分支**只对 flowchart 返回目标**，其余图种返回 `null`
  （`context-menu.ts:66-68`）。
- `canvasToEditorSelection`（`:67-79`）对非 node 的 CanvasSelection 返回 `null`；
  `selectedDataIdOf`（`:82-96`）不覆盖 edge/message。
- **后果**：class 关系边与 sequence 消息线**无法点选、无法右键**——只能从结构树选中后在右侧表单编辑。
- 工单 06 已自认此洞（`06-class-sequence-node-context-menu.md:111`「仍返回 null（本批非目标）」），
  工单 09（`:104`）再次复述。
- 注：投影与表单**已完整支持**这两类元素（`class-relation` / `message` 有各自 elementId，
  `RelationForm` / `MessageForm` 可编辑全部字段）——缺口纯在**画布寻址**，不在管线。

### 类别 (c) 入口缺失：违反 CONTEXT.md 的定义

- `CONTEXT.md:74` 定义「属性面板……元素的**添加入口在画布右键菜单**，不在属性面板」，
  `:78` 称右键菜单为「元素添加的**唯一入口**」。
- 实况：**sequence 的 `add-note` / `add-block`、class 的 `add-note` 没有任何画布入口**；
  结构树是纯选中器（`StructureTree.tsx` 只有 select），也不提供添加动作。
- 即用户**无法在画布上给时序图加 `alt` 块或注释、给类图加注释**，只能手写源码。
- 这是三个批次一路攒下的**模型与实现对峙**，不是"暂缓"能盖住的。

### 类别 (d) 编辑键与双击内联编辑不覆盖这两类图

- Tab / Enter / Delete 对 class/sequence **命中即 return，不落码不 preventDefault**
  （`use-canvas-keyboard.ts:117-118`；工单 14 `:14` 明列非目标）。
- 双击内联编辑只接受 flowchart（data-id）与 mindmap（文本匹配）
  （`inline-edit.ts:82-93`、`use-canvas-inline-edit.ts:151-161`）。
  `CanvasInlineEditTarget` 虽支持 class/sequence，但**仅用于空白右键新建后的立即命名**
  （`inline-edit.ts:106-113` → rename-class / rename-participant）。

### 只读不可编（性质不同的另一类，本批一并记账）

- sequence `autonumber` 只存 `raw`，`set-autonumber` 只能整体开关，**不能改起始值/步长**
  （`sequence.ts:71-74`）。
- sequence `activate`/`deactivate` 不能改 actorId（`renderActivation :164-167` 只支持 keyword；
  `:570-572` rename 时手工拼串）。
- sequence note 的参与者列表解析不出时为 `null`（`sequence-projection.ts:47`，mid 原样保留、只能改文本）。
- class 关系端点泛型 `fromGenericRaw` / `toGenericRaw` 可解析但**无写回**（`renderRelation :136-150`
  的 changes 不含 generic；`set-relation` 无该字段）。
- class 类声明 `tail`（行尾原文）可解析但不可编（`renderClassDecl :62-74` 只改 name/generic）。

### 已支持（勿动）

sequence：participant/actor（含 as 别名）、四种消息、消息简写 `+`/`-`、autonumber 开关、
activate/deactivate 追加、note（over/left/right，含多参与者）、六种块关键字、else/and 分支
——18 个 intent（`sequence.ts:942-976`）。
class：类与成员（含可见性、行式/块式）、泛型、6 种关系、基数、标签、note（for/浮动）、classDef
——15 个 intent（`class.ts:879-915`）。

---

## 决策记录（grilling 两轮结论，勿再翻案）

| 主题 | 决策 |
|---|---|
| 范围 | **全做**（用户明确：「全做，有大把时间可以跑，尽量完善」）——(a)(b)(c)(d) 四类缺口全补 |
| 批次落盘 | 新目录 `.scratch/sequence-class-parity/`，**不追加进已结单的 spec** |
| `CONTEXT.md` 定义 | **补入口让定义成立**（否掉"收窄定义为右键菜单+结构树"）——右键菜单"内容随目标变化"是最好的设计，收窄等于承认只兑现一半；结构树保持纯选中器，不引入第二套添加心智 |
| 推进顺序 | **先动模型、再动交互**：`create`/`destroy` 改变参与者集合语义，连线寻址要按参与者 id 组织端点；先做连线会白改一遍 |
| 连线右键菜单 | **(甲) 起步 + (乙) 收尾**：先"只放删除"验证寻址链路，再补编辑类动作（class 改类型/基数/标签、sequence 改箭头/act/文本）；**(丙) 明确否掉**——不再新增表单浮层，画布上应是"这元素能做什么"而非又一个表单 |
| 连线选中后 | **照旧复用** `RelationForm` / `MessageForm`（纯字段映射层不碰 DOM，复用成本≈0；沿用 flowchart 既定链路） |
| `create`/`destroy`/`rect`/`box` | **做**（Q1 全开后不再是非目标）；但需先定投影模型（见下） |
| 编辑键语义 | class：`Tab` = 加成员、`Enter` = 加关系；sequence：`Tab` = 加参与者、`Enter` = 加消息后一条；两者 `Delete` = 删除选中。**承认是"就近类比"而非严格语义**（flowchart 的 Tab/Enter 本质是"在当前节点附近加一个结构"） |
| 编辑键落点 | **必须复用已有表单**（class 加关系 → `AddRelationInlineForm`；sequence 加消息 → `AddMessageInlineForm`），**不新造浮层** |
| 双击内联编辑 | **只做"改显示文本"**：class 双击类名 → `rename-class`；sequence 双击参与者 → 改 `as` 别名（`set-participant`）。**成员正文、关系标签、消息文本都不做双击**（与"双击节点=选中节点"打架，宁可少做也不让双击不可预测） |
| `linkStyle`/`cssClass` | **不做**（flowchart 同样没做，单独做会造出比 flowchart 更完备的样式编辑器，优先级奇怪） |
| `direction` | **做**（改变布局方向、用户最容易想改；sequence 的 `direction` 与 flowchart 同类选项对齐） |
| 连线身份 | **位置序**（`class-relation:N` / `message:N`），**不用 mermaid `data-id`**——实测会重排（Q13） |
| `destroy` | **不做**（视觉空操作 + 与后续语句冲突，做了会让画布与渲染不一致）（Q14） |
| `create` | **做最小模型**：投影记录参与者生命起点，不做成对闭合（Q15） |
| `rect` / `box` / `namespace` | **解析 + 结构树可见 + 可改名**；**不做分组编辑**（实测均无 data-id、无 DOM 包含语义） |
| 连线命中口径 | **沿真实路径采样**（`getPointAtLength` + `getScreenCTM`）；**禁止用 `getBoundingClientRect().中心`**（class 斜线 bbox 退化，中点命中 `<svg>` 根） |
| 完成判据 | **(乙) 任务判据为主、清单作证**——两个端到端场景走通即算完善（见文末「验收场景」） |
| 验收与落盘 | 沿用惯例：spec.md + 编号工单 + 新增 ADR + `CONTEXT.md` 术语补充 |

### 待实测确认后定案（不阻塞已定部分）

- ~~`namespace`~~ **已定案**：mermaid 12.0.0 **可用**，但只是视觉边框、不构成 DOM 包含
  （`childDataIds: []`）；与 sequence 的 `box` 同性质。处理：**解析 + 结构树可见 + 可改名**，
  但**不做"拖入/拖出"这类分组编辑**（无真实包含语义可编）。
- ~~连线身份口径~~ **已定案（Q13）**：`data-id` **实测会重排**，不可作身份 → 见决策记录。
- ~~`rect`/`box` 是否动到可视范围口径~~ **已定案**：`rect`/`box` 渲染出的矩形**均无 data-id**，
  因此**不进**「节点可视范围」的匹配集合（工单 14 §4 的谓词只认 data-id / DOM id 形态），
  方位导航不受影响。`box` 的分组框同理不进。

### Q13–Q15 定案（2026-09-29 用户确认，勿再翻案）

- **Q13 连线身份 = 位置序为主、`data-id` 不用**。理由：`data-id` 实测会重排（见上节两张对照表），
  且会重排的正是本 app 的常规操作路径（右键加关系/加消息按 `afterElementId` **中位插入**）。
  位置序在 app 里天然稳定——parser 已知每条连线在源码的哪一行。
  **明确不做「data-id 优先 + 位置序回退」**：两个来源混用会让"这条线的身份是什么"变成运行时条件决定，
  调试时无法预期。代价：连线位置序随插入重排，影响"选中态在编辑后是否还指向同一元素"——
  但本 app 每次编辑都重渲染，本就不保证选中跨编辑存活。
- **Q14 `destroy` = 不做**。它是视觉空操作（不画十字），且其后不能有任何消息线（含无关语句）。
  做的唯一价值是"让源码里的 `destroy` 在画布上有个可点选代表"，但这会**让画布与 mermaid 渲染结果不一致**
  ——引入一个只有编辑面有、渲染面没有的元素，破坏"画布 = 源码的可视化编辑面"这一核心承诺。
- **Q15 `create` = 做，只做最小模型**。它是唯一一个"既有真实渲染效果（生命线缩短）、又改变结构语义"
  的语法。投影记录参与者的**生命起点**，**不做成对闭合**（`destroy` 摘出去后不需要区间概念）。
  画布不特殊渲染（沿用 mermaid 画出的短生命线）。

---

## 验收场景（完成判据 = 这两条能闭眼走完）

**场景 A（类图）**：加类 → 加两个成员 → 连到另一个类 → 双击线上标上 `1..*` 与标签 →
点选这条线并在右侧改成 `*--`。

**场景 B（时序图）**：加参与者 → 互发三条消息 → 包一个 alt 块并写条件 → 右键一条消息改箭头并删掉它。

走不完 = 表单再多也是假的。

---

## 背景事实（已实测，勿重复调研）

> 原始证据：`.tmp-accept/FINDINGS-gp1.md`（2026-09-29 真机 Chromium）。**注意该目录是临时产物，
> 落盘时应把关键结论抄进本文件，不要依赖它长期存在。**

### 连线 data-id：会重排，不能当身份（2026-09-29 真机实测）

**class 关系边** id 形态 = `id_{源}_{目标}_{N}`（`N` 是全局自增计数器）。

| 场景 | 结果 |
|---|---|
| **末尾追加**一条关系 | 原有 3 条边 id **逐字不变**；新边取 `id_Account_BankAccount_4` ✅ |
| **中间插入**一条关系（`<|--` 之后） | `id_Customer_Account_2` → **`id_Customer_Account_3`**；`id_Account_Ledger_3` → **`id_Account_Ledger_4`** ❌ |

**sequence 消息线** id 形态 = 纯序号 `iN`。

| 场景 | 结果 |
|---|---|
| **中间插入**一条消息 | 插入点之后的**全部重排**：自消息 `i6`→`i7`、Note `i4`→`i5`、loop 块 `i7`→`i8` ❌ |

**结论：`data-id` 不能作连线身份。** 右侧右键菜单的加关系/加消息按 `afterElementId` **中位插入**
（工单 06），正好落在最坏场景——所以"末尾追加安全"对本 app 毫无价值。

**参与者的 `data-id` 是参与者名（稳定）**，与消息/note/块的 `iN` 形成对照。

连线数据的**完整清单**（class 基线 14 元素 / 8 id）：`edgePath` 每条边是 **2 个重复 `<path>`**
（只有第 2 个带 `marker-end`）；`g.edgeLabel` 外层包装无 id、内层 `g` 与 edgePaths **共享同一 id**。

### 连线的命中路径（实测）

- **不可用 `getBoundingClientRect().中心`**：class 斜线 bbox 退化（`x=651 y=332 w=36 h=13`），
  中点 `elementFromPoint` 命中 `<svg class="classDiagram">` 根、**无 data-id**。
- **可用「沿真实路径采样」**：`getTotalLength()` + `getPointAtLength()` + `getScreenCTM()` 转屏幕坐标，
  class 边 9/9 采样点**直接命中 `path[data-id]` 自身**；sequence `line[i0]` 中点及沿线 9/9 命中自身。
- sequence 消息线 `pointer-events: auto` + `stroke-width: 1.5px`，**无需额外加粗即已可命中**。
- class 边 `<path>` **同时带 `id` 属性** = `{svgId}-{data-id}`（如 `mmd-preview-2-id_BankAccount_Account_1`），
  可作备选选择器 `[id$="-"+dataId]`。
- **基数 `"1"` / `"*"` 无 data-id**：位于 `g.edgeTerminals > foreignObject > span.edgeLabel`，
  从 span 到 `<svg>` **全程无任何 data-id** → 基数文本**无法**用 data-id 归属到某条边。
- 实测该边 `vmHit:false` —— app 自身的命中标记**未落在连线上**（只在节点上），这就是"边不可点选"的直接原因。

### `create`/`destroy`/`rect`/`box`/`namespace` 渲染行为（实测）

- **`create participant B` 可用**：`line[B].actor-line` 仅从 create 点开始（短段），B 顶/底各一个头像；
  B 的 data-id 仍是名字（稳定）。
- **`destroy B` 是视觉空操作**：不画十字；全 SVG 扫描后 `[data-id]` 集合无任何新增
  （`marker` 里有 X 形路径定义但**未被实例化**）。
- ⚠️ **`destroy` 之后不能有任何消息线**（哪怕与它无关的 `A->>C`），否则整图语法错误。
  **mermaid 官方文档自己的 create+destroy 示例也报同一错误**，且错误信息里带 `undefined`（疑似 12.0.0 bug）。
- **`rect rgb(...)`** → `<rect class="rect">`，**`<svg>` 的直接子元素、无 data-id**。
- **`box Purple 数据库组 ... end`** → `<rect>` + `<text>`，**均无 data-id**；分组是**图形层叠而非 DOM 父子**。
- **`namespace Foo { class A }` 可用**，渲染为 `<g class="cluster undefined">` + `<text>Foo</text>`，无 data-id；
  但 **`class A` 不在 cluster 内**（`g[A]` 仍在 `g.nodes`）→ namespace 只是**视觉边框**。
- `class A:::myClass` / `cssClass "B" myOtherClass` 均可用：给 `g.node` 追加类名（`node default myClass`）。

### 错误态与 app 行为（实测）

| 用例 | 结果 | 说明 |
|---|---|---|
| `create` 同名两次 | ❌ 语法错误 | `It is not possible to have actors with the same id...` |
| `destroy` 不存在的参与者 | ✅ 静默忽略 | 不报错、C 不出现 |
| `destroy` 在末尾 | ✅ | — |
| `destroy` 之后跟 `Note` | ✅ | — |
| `destroy` 之后跟消息线 | ❌ 语法错误 | `The destroyed participant undefined does not have...` |

- **app 行为**：语法错误**不抛异常、不崩**，画布保留最近一次合法渲染 + 横幅
  「源码存在语法错误，画布已停留在最近一次合法状态」（`use-mermaid-preview.ts:41-44`）。
- 控制台：全部用例（含报错用例）**0 error / 0 warning**；mermaid 解析错误被 app 捕获后走 UI。

### 已知事实（前批实测，复用）

- mermaid 12.0.0 给 sequence/class 的 `data-id` **除节点外也落在连线上**
  （`id_Customer_Account_2`、`i1`、`i7`、`edgeNote0`……）——工单 14 `:88`。
- class 的 `g.node` 在 mermaid v12 **无原生 `data-id`**，靠 `node-data-ids.ts:27` 反注 DOM id
  形态 `{svgId}-classId-{类名}-{n}`（工单 09，承接 ADR-0007）。
- sequence 参与者的可视范围需取**并集**（`line.actor-line` + 顶部实例 `g`；底部实例不带 data-id）
  ——工单 14 §4。
- sequence `MESSAGE_RE` 不接受 `--x`（`sequence.ts:207-208`）。
- 被删语句可能留下「只有空格的空白行」，工单 11 `:112-113` 明列不在其范围。

---

## 惯例决定（沿用前批）

- 源码是唯一真相源；一切编辑走 `commitIntent` → 快照撤销栈，新意图自动获得撤销/重做。
- 手术式改写，未触碰文本逐字保留（ADR-0004/0008）。
- 元素的添加入口只在右键菜单，不在属性面板（本批要**补全**这条，不是推翻）。
- 方向键是方位导航（ADR-0011），四图种统一；本批不得反向引入结构语义。
- mermaid 大版本升级时需回归：主题清单、每图表默认主题、mindmap id 语法、空 `classDiagram`
  解析行为，**本批追加**：连线 data-id 命名规则、`create`/`destroy`/`rect`/`box` 渲染结构。

## 非目标（本批不做，勿顺手扩）

- `linkStyle` / `cssClass` / `style` 的编辑（flowchart 亦无，见决策记录）。
- `--x`（叉头虚线）消息类型。
- 消息/关系的**多行文本**与转义细节。
- 结构树改造为"可添加"（保持纯选中器）。
- 把画布寻址从位置序改为语法 id（会牵动 ADR-0007 的 data-id 机制）。

## 工单

**推进顺序**：模型层先行（01）→ 连线地基（02）→ 交互层（03/04）→ 编辑键（05）→
独立能力（06/07/08，可与 03-05 并行）→ 验收（09）。

- 01 `create` 进投影模型（`01-sequence-create-enters-model.md`）—— **无前置阻塞，必须先行**
- 02 连线的元素身份：位置序寻址（`02-edge-identity-ordinal-addressing.md`）—— **Blocked by: 01**
- 03 连线的右键菜单（`03-edge-context-menu.md`）—— **Blocked by: 02**
- 04 补全添加入口（`04-missing-add-entrypoints.md`）—— **Blocked by: 02**
- 05 编辑键与双击内联编辑（`05-edit-keys-and-inline-edit.md`）—— **Blocked by: 03、04**
- 06 无 data-id 的结构：`rect`/`box`/`namespace`（`06-grouping-syntaxes-visible-renameable.md`）
  —— **Blocked by: 01**
- 07 `direction` 表单（`07-direction-form.md`）—— **Blocked by: 01**（无硬依赖，可并行）
- 08 只读不可编的五处缺口（`08-readonly-gaps.md`）—— **Blocked by: 01、02**
- 09 验收收尾（`09-acceptance.md`）—— **Blocked by: 01-08**

## ADR

- `0012-edge-identity-is-ordinal-not-data-id.md` —— 连线身份是位置序（Q13）
- `0013-edit-keys-map-to-nearest-structure.md` —— 编辑键的「就近结构」映射（Q8）
- `0014-create-enters-the-model-destroy-does-not.md` —— `create` 进模型、`destroy` 不进（Q14/Q15）

## 术语（已落入 `CONTEXT.md`）

`CONTEXT.md` 新增「连线与元素身份」节：**元素 / 元素 ID / 连线**，并记录"显示文本与语法标识的分离"。
