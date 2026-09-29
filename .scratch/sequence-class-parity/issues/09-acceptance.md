# 09 验收收尾

Status: resolved

**Blocked by: 01-08**（均已 resolved）

来源：`spec.md` 的「验收场景」。本票不写功能，只做**端到端验收**与**回归确认**。

## 完成判据（= spec 的两个场景，闭眼走完）

### 场景 A（类图）

> 加类 → 加两个成员 → 连到另一个类 → **点选这条线并在右侧表单标基数与标签** → 点选这条线并在右侧改成 `*--`。

**已调整（工单 02 裁定 → 本票落盘）**：原第四步写「**双击**线上标上 `1..*` 与标签」。工单 02 已裁定
「点关系标签 / 点基数文本 → **归属到边**」（选中该条关系，右侧出现 `RelationForm`），且 spec 决策是
「双击只用于 class 类名与 sequence 别名，连线不做内联编辑」——故第四步改写为「点选这条线 → 右侧
`RelationForm` 标基数与标签」。**本票用单测/集成测试证明该链路**（见 Comments 场景 A 与
`scenario-a-class-relation.test.tsx`）。

**已知注意点（保留供参考）**：`1..*` 与标签在实测中是**两组不同的文本**——基数 `"1"` / `"*"` 位于
`g.edgeTerminals > foreignObject > span.edgeLabel`，**全程无 data-id**；而标签在
`g.edgeLabel > g[data-id]`（与 edgePaths 共享 id）。正因 data-id 无从归属，工单 02 才靠**位置序标注**
把身份贴到 `g.edgeLabels` 的直接子元素上——点标签 / 点基数沿 DOM 向上命中该 `data-id`。

### 场景 B（时序图）

> 加参与者 → 互发三条消息 → 包一个 alt 块并写条件 → 右键一条消息改箭头并删掉它。

## 回归清单（逐条结论）

> 用户本轮明确跳过真机验收，故**依赖真机几何 / 真实渲染 / 控制台的条目一律不勾选**，
> 逐条标注 `（本轮未做真机确认——用户指示跳过真机验收）`；能靠代码 / 单测确认的条目给出证据。

- **方位导航（工单 14 / ADR-0011）**：四图种方向键落点不变；`rect`/`box`/`namespace` 矩形
  **不进**候选集合；修饰键策略不变。
  - [x] **`rect`/`box`/`namespace` 不进候选集合**：`edge-locate.test.ts:249` 断言 `rect.rect` 无
    data-id、不进 `annotateSequenceIdentities` 的标注集合（进不了候选 = 方位导航吃不到它）。
  - [x] **修饰键策略不变**：`use-canvas-keyboard.test.tsx:379` 断言 Shift/Alt/Meta/Ctrl + 方向键
    **不导航但仍 `preventDefault`**；`use-canvas-keyboard.ts:132` 为策略实现。
  - [ ] 四图种方向键**真实落点**（几何相邻）——`（本轮未做真机确认——用户指示跳过真机验收）`
        （工单 02 曾真机验过 class/sequence 的相邻落点，本轮不重复）。
- **节点寻址（ADR-0007）**：class/sequence 节点点选、内联命名、节点右键菜单不回归。
  - [x] **代码层不回归**：`context-menu.test.ts`（class/sequence 节点菜单项）、
    `use-canvas-context-menu.test.tsx`、`inline-edit.test.ts`、`use-canvas-inline-edit.test.tsx`、
    `data-id.test.ts` 逐字未改、全绿。
  - [ ] 真机**点选几何**（点节点形状内部 / 文字）——`（本轮未做真机确认——用户指示跳过真机验收）`。
- [x] **连线新能力（ADR-0012）：连线点选 / 右键在「中位插入」后仍正确**（本批最易碎的一条）——
      新单测 `scenario-a-class-relation.test.tsx`（第 3 例）中位插入一条关系后，原 `B --> C`
      位置序从 `relation:2` 重排为 `relation:3`，**点文档序第 3 条路径仍选中的是 `B --> C`**；
      `edge-identity.test.ts:64`（位置序对中位插入稳定）+ `edge-locate.test.ts:110`（文档序 = 源码序）佐证。
- **verbatim 底线（ADR-0004/0008）**：未编辑的 `destroy` / `rect` / `box` / `linkStyle` /
      `cssClass` / 注释 / 空行**逐字不变**（做一次全文往返比对）。
  - [x] **全文往返比对已做**：`verbatim-identity.test.ts`（flowchart `FULL_COVERAGE` 含 `linkStyle` /
    `classDef` / `click` / 注释 / 空行）、`sequence.test.ts:109`（`FULL_COVERAGE` 含 `destroy` / `rect` /
    `box` / 注释 / 空行）、`class.test.ts:49`（`FULL_COVERAGE` 含 `linkStyle` / `cssClass` / 注释 / 空行）
    ——全部 `解析 → 不改 → 重组装` **逐字相同**。
- [x] **空图右键（前批工单 04）**：class 加类 / sequence 加参与者不回归——
      `use-canvas-context-menu.test.tsx:589`（class 空图右键 → `add-class`，落码 `classDiagram\nclass 新类`）、
      `:626`（sequence 空图右键 → `add-participant`，落码 `sequenceDiagram\nparticipant 新参与者`）。
      落码可确认；画布渲染外观属真机项。
- **主题选择器（前批工单 01/08）**：不受 `direction` 表单影响。
  - [x] **代码层独立**：主题走 frontmatter、`direction` 走图体语句，两套互不共享状态
    （`theme.test.ts` / `direction-form.test.tsx` 各自全绿）。
  - [ ] 两处下拉同时打开时的 ARIA / 焦点表现——`（本轮未做真机确认——用户指示跳过真机验收）`。
- [ ] **可达性**：`Tab` 在 class/sequence 上不再跳出画布（ADR-0013 记录的代价），`Escape` 与点击仍能离开。
      `（本轮未做真机确认——用户指示跳过真机验收）`——`preventDefault` 由
      `use-canvas-keyboard.test.tsx` 单测断言，但「焦点真的不跳出 / Escape 真能离开」只能在真机确认。
- [ ] 控制台全流程 0 error / 0 warning。`（本轮未做真机确认——用户指示跳过真机验收）`
      ——本票新增的 `scenario-a-class-relation.test.tsx` 在 jsdom 运行 **0 个 React act 警告 / 0 error**，
      但不能替代真机控制台。

## 自动化证据要求

- [x] `npm run typecheck`：**0 错误**（`tsc -b --noEmit`，干净通过）。
- [x] `npm test`：**全绿，53 个测试文件 / 789 个用例**。
  - 对比：批次起点 **46 / 597**；本批 01–08 完成后为 **52 / 786**；本票新增
    `scenario-a-class-relation.test.tsx`（3 例）= **53 / 789**（文件 +1、用例 +3，只增不减）。
- [ ] 真机验收（`browser-acceptance` / `agent-browser`）：**整体跳过**——用户本轮明确指示
      「算了，不搞真机测试了，太慢了」。两个端到端场景改用**单测等价覆盖**（见 Comments），
      **明确不是真机端到端**。

## 落盘

- 本票 Comments 记录：两个场景的实测过程与结果、回归清单的逐条结论、遗留问题（如有）。
- 更新 `docs/mermaid-upgrade-regression-checklist.md`：追加本批新增的回归项——
  **连线 data-id 命名规则**、`create`/`destroy`/`rect`/`box`/`namespace` 渲染结构、
  `destroy` 后不能有消息线、`create` 同名两次报错。
- `spec.md` 工单表标注各票状态。

## Comments

**状态**：resolved（2026-09-29）。本票不写功能，只做验收与落盘。

> **本轮未做真机端到端验收——用户明确指示跳过**（原话「算了，不搞真机测试了，太慢了」；
> `AGENTS.md` 已记为项目常驻规则：「在 /tdd 或 /code-review 中，默认不做真机/浏览器测试」）。
> 两个场景均改为**单测等价覆盖**：走**真实 hook（`useCanvasContextMenu` / `useCanvasSelection`）+
> 真实表单组件 + 真实投影 + 真实 `commitIntent`**，只把 mermaid 渲染产物替换为与 v12 输出同构的
> DOM/SVG 桩；`mermaid.parse` 通过性作弱替代证据。**这不是真机端到端**——逐条真机待验项见「四」。

### 一、完成判据：两个场景

#### 场景 A（类图）— 通过（含一处按工单 02 裁定的改写）

原文：加类 → 加两个成员 → 连到另一个类 → **双击线上标上 `1..*` 与标签** → 点选这条线并在右侧改成 `*--`。

**第四步已改写**为「点选这条线并在右侧表单标基数与标签」。依据两条已定案事实：
工单 02 裁定「点关系标签 / 点基数文本 → **归属到边**」（选中该关系、右侧出现 `RelationForm`）；
spec 决策「双击只用于 class 类名与 sequence 别名，**连线不做内联编辑**」。

覆盖：**新增** `src/components/__tests__/scenario-a-class-relation.test.tsx`（3 例）

1. **主链逐步走通**：`classDiagram\nclass Account` 起手 → 空白右键加类（`add-class`，落 `class 新类`）
   → 右键「新类」两次加成员（`add-member` ×2，`afterElementId: 'class:新类'`，
   落 `新类 : +String owner` / `新类 : +int balance`）→ 右键加关系（`add-relation`，落 `新类 --> Account`）
   → 点 `path[data-id="relation:1"]` → 选中 `{kind:'class-relation', elementId:'relation:1'}` 且右侧渲染
   真实 `RelationForm`（表头 `新类 → Account`）→ 改关系类型 `*--`、起点基数 `"1"`、终点基数 `"*"`、
   标签 `拥有` → 最终源码含 `新类 "1" *-- "*" Account : 拥有`，且 `mermaid.parse` 通过。
2. **标签 / 基数命中**：点 `g.edgeLabel` 与点 `g.edgeTerminals` **均选中 `relation:1`**——实证 02 的
   「归属到边」裁定（这也是场景 A 第四步改写得以成立的前提）。
3. **中位插入回归（本批最易碎）**：6 条源码 `A-->B; B-->C; A-->C` → 在 `A --> B` 之后插入一条
   → 原 `B --> C` 位置序由 `relation:2` 变为 `relation:3` → **点文档序第 3 条路径仍选中 `B --> C`**。

#### 场景 B（时序图）— 通过（第三步语义按已知边界收窄）

原文：加参与者 → 互发三条消息 → 包一个 alt 块并写条件 → 右键一条消息改箭头并删掉它。

覆盖：`src/lib/editing/__tests__/use-canvas-context-menu.test.tsx:1500`（工单 04 建，与场景 A 同款手法）
`it('端到端场景 B（单测等价覆盖）：加参与者 → 三条消息 → alt 块 → 改箭头 → 删消息')`

**边界**：第三步只能做到「**新增** alt 块并写条件」，做不到「**把已有消息包进** alt 块」——见「五」第 1 条。

### 二、回归清单逐条结论（正文明细见上）

**能靠代码 / 单测确认的（已勾选并附证据）**

| 条目 | 结论 |
|---|---|
| `rect`/`box`/`namespace` 不进方位导航候选集合 | ✅ `edge-locate.test.ts:249` |
| 方向键修饰键策略不变 | ✅ `use-canvas-keyboard.test.tsx:379` |
| 节点寻址（ADR-0007）代码层不回归 | ✅ 节点相关测试文件逐字未改、全绿 |
| **连线中位插入后仍正确**（最易碎） | ✅ `scenario-a-class-relation.test.tsx` 第 3 例 + `edge-identity.test.ts:64` + `edge-locate.test.ts:110` |
| verbatim 底线（全文往返逐字比对） | ✅ `verbatim-identity.test.ts` / `sequence.test.ts:109` / `class.test.ts:49` 的 `FULL_COVERAGE` |
| 空图右键不回归 | ✅ `use-canvas-context-menu.test.tsx:589` / `:626` |
| 主题选择器与 `direction` 互不干扰（代码层） | ✅ 主题走 frontmatter、`direction` 走图体，两套不共享状态 |

**依赖真机、本轮未确认的（未勾选，逐条标注）**：四图种方向键真实落点；真机点选几何；
主题 / 方向两处下拉同开时的 ARIA 与焦点；**可达性（`Tab` 不跳出画布）**；控制台 0 error / 0 warning。

> **补充说明（真机证据的时效性）**：工单 02 是本批**唯一**真机验过的票，其 Comments 有完整 DOM 证据
> （`selectedInsideSvg:["relation:1"]`、中位插入回归、点标签/点基数归属、sequence 消息/注释/块点选、
> 节点点选与 class/sequence 方位导航不回归、控制台 0 error/0 warning；`.gp1-accept/` 留有探针产物）。
> 但那次真机验收发生在 **02 落地时（`604c01c`）**，其后 **03–08 继续改动了 `context-menu.ts`、
> `use-canvas-context-menu.ts`、`CanvasPanel.tsx`、`canvas-keyboard`、`inline-edit`、pipeline 与表单**。
> 因此它**只能证明 02 当时的状态**，不能直接为最终状态背书——最终状态的真机复验仍在「四」里。

### 三、自动化证据

| 项 | 结果 |
|---|---|
| `npm run typecheck` | **0 错误** |
| `npm test` | **53 个测试文件 / 789 个用例，全绿** |
| 批次起点 → 终态 | **46 / 597 → 53 / 789**（文件 +7、用例 +192，只增不减） |

### 四、待真机确认总清单（汇总 01–08，供日后一次性补验）

1. **可达性（工单 05，代价最高）**：class/sequence 画布上 `Tab` 不再跳出画布，`Escape` / 点击仍能离开
   （ADR-0013 记录的代价）。
2. **控制台 0 error / 0 warning**（03/04/05/06/07/08 均列此条）：全流程各路径（渲染期，非 `parse` 期）。
3. **⚠️ 空块渲染（工单 04）**：`add-block` 只落 `open` + `end`，新块必空；`sequence.ts` 既有注释记着
   空块会让 mermaid **渲染期**产出成批 `attribute …: Expected length, "NaN"` console error。
   本轮只验到 `mermaid.parse` 通过——**渲染期是否报错需真机确认**，且直接关系第 2 条。
4. **连线菜单（工单 03）**：class 关系边 / sequence 消息线右键菜单项与红色删除项；循环切换连点逐级推进
   （`-->`→`..>`…；`->>`→`-->`→`-x`→`--`）；「编辑基数与标签」/「编辑激活与文本」收起菜单后右侧表单出现；
   删除块时 `open`→`end` 整段消失。
5. **添加入口（工单 04）**：sequence 空白 / 参与者右键的注释与逻辑块表单；块类型六项下拉；
   参与者右键加的块是否落在该参与者附近；class 浮动注释与 `note for X`（含 block-style 类是否落在花括号内）。
6. **编辑键与双击（工单 05）**：class 双击类名进改名、双击成员正文不进入（守卫依赖 mermaid 真实文本切分）；
   sequence 双击参与者改别名后参与者框文本更新、端点不错位；键盘表单浮出位置在缩放 / 平移下的观感。
7. **分组语法（工单 06）**：含 `rect`/`box` 的 sequence 图与含 `namespace` 的 class 图的
   结构树节点渲染、点选、改名后的画布外观与重渲染即时性。
8. **`direction`（工单 07）**：class 选 LR 后画布真的横向布局；选「跟随默认」回到默认布局；
   手写非法值时选择器如实回显；与主题选择器互不干扰。
9. **只读缺口（工单 08）**：`autonumber` 开状态下起始值 / 步长与渲染编号一致；
   `Note over A,B` 改参与者后注释跨度更新；`Foo~T~ --> Bar` 改泛型后端点标签重绘。

### 五、遗留问题

1. **「把已有消息包进块」做不到（能力缺口，非本票引入）**：`add-block` 只落 `open` + `end`；
   `add-message` / `add-note` 的 `afterElementId` 锚点语义（`insertAfter` 把新行紧贴锚点）决定新行落在
   块**外**，全项目没有「块内插入」入口。真正支持需动 pipeline（新增块内插入的锚点语义），
   超出本批「纯 UI 接线、不新增 pipeline 意图」的边界。→ 已写入 `spec.md`「范围修正」。
2. **工单 07 的 sequence 部分不适用**：mermaid 12.0.0 无 `sequenceDiagram` 的 `direction` 语法
   （实测 `sequenceDiagram\ndirection LR` → `Parse error on line 2`；`classDiagram\ndirection LR` 与
   `flowchart LR` 通过）。范围已收敛到 class，`sequence.test.ts` 有锁死断言。→ 已写入 `spec.md`。
3. **工单 08 的类声明 `tail` 不做**：`tail` 是语法边界（花括号 / 行尾注释等界标）而非可编辑字段，
   给它自由文本入口等于让用户替解析器猜语义。→ 已写入 `spec.md`。
4. **删除留白行**：删元素只清 span、原位置留一行空白——全项目既有约定
   （`delete-member` / `set-autonumber` 同款），spec 已记不在本批范围。
5. **连线位置序随插入重排**：ADR-0012 的既知代价——本 app 每次编辑都重渲染，不保证选中态跨编辑存活。
6. **`classDiagramHint` 成为未使用的 i18n key**（工单 07 顺带记录）：图表级提示被方向表单取代，
   保留未删，属本批范围外的清理项。
7. **`code-panel.test.tsx` 的 react-i18next warning** 为先前既有噪声，与本批无关（工单 08 记录）。

### 六、落盘核对

- `docs/mermaid-upgrade-regression-checklist.md`：批次定案（`5874603`）已追加「连线 data-id 命名规则 /
  `create`·`destroy`·`rect`·`box`·`namespace` 渲染结构 / `destroy` 后不能有消息线 / `create` 同名两次报错」
  等项（现第 1–5 条）；本票追加**第 6 条**——工单 02 引入的**新 mermaid 结构依赖**
  （`g.edgeLabels` 子元素序列与关系序同构、`rect.note` / `line.loopLine` 的宿主 `g` 结构），
  升版若改这些结构，对应种类退化为「点标签 / 点基数不响应」而非点错关系。
- `spec.md`：工单表已逐票标注 resolved；新增「范围修正」节记录上述第 1/2/3 条。
