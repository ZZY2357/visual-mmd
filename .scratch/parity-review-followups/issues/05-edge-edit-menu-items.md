# 05 工单 03「编辑类」菜单项的实际落码

Status: resolved

来源：`spec.md` 的 F5 / D5。口径未定，先定案再动手。

## D5 定案（2026-09-29）：不在菜单内嵌表单，菜单项 = 明确的「编辑属性」入口

**口径：算部分兑现，承诺改口径 + 文案澄清，不新增菜单内表单。**

理由（与既有裁定对齐，不是权宜）：

- ADR-0001 是「表单驱动编辑，不是自由画布」，`CONTEXT.md` 也把**属性面板**定义为
  选中元素属性表单的唯一入口。在右键菜单里再开一套基数 / 标签编辑，等于引入第二个
  编辑入口，两处的脏数据与校验规则会各自漂移。
- 现状并非「完全不可编」：菜单已联动选中（工单 03 阶段一成果），关菜单后属性面板
  出现 `RelationForm` / `MessageForm`，用户能在那里改基数与标签。真正的问题是
  **菜单项文案暗示「点了就能改」，实际只关菜单** —— 是误导，不是缺失。

故本票的落码范围是：

1. `editRelation` / `editMessage` 从「只有 `closeMenu()` 的空动作」改为**明确的
   选中该连线 + 关闭菜单**语义（若已等价，保留行为、消除 U1 的 Middle Man 气味）。
2. 菜单项文案改为不含糊的「编辑属性」（中英 i18n 同步），消除「点了没反应」的错觉。
3. `spec.md` 里工单 03 阶段二的承诺同步改为「经属性面板完成」，并在此处留痕。

## 问题

工单 03 阶段二（(乙) 同等待遇）要求（`03-edge-context-menu.md:21-25`）：

> - **class 关系边**：改关系类型（`set-relation` 的 `kind`）、改两端基数（`cardFrom` / `cardTo`）、
>   改标签（`label`）、删除。
> - **sequence 消息**：改箭头（`arrow`）、改 act（`act`）、改文本（`text`）、删除。
>
> **明确否掉 (丙)**：不再新增表单浮层。……阶段二的字段编辑**直接改**（如箭头类型用子菜单/循环切换）
> 或走**已有的**节点表单浮层机制，不新建组件。

现状（`use-canvas-context-menu.ts`）：

| 动作 | 实现 | 是否落码 |
|---|---|---|
| class 改关系类型 | `cycleRelationKind`（约 `:455-461`） | ✅ 直接 `set-relation` 循环切换 |
| sequence 改箭头 | `cycleMessageArrow`（`:468-477`） | ✅ 直接 `set-message` 循环切换 |
| class 改基数 / 改标签 | `editRelation`（`:464-466`） | ❌ **函数体只有 `closeMenu()`** |
| sequence 改 act / 改文本 | `editMessage`（`:480-482`） | ❌ **函数体只有 `closeMenu()`** |

即：能「循环切换」的两种做完了，剩下四种**菜单项本身不落任何码**，只关菜单。

需要说清楚的是**这不是「完全不可编」**：右键菜单**已联动选中**（工单 03 阶段一的成果），
关掉菜单后右侧属性面板会出现 `RelationForm` / `MessageForm`，用户在那里**能改**基数与标签。
所以缺口是「菜单项自身是个空动作」，不是「功能不可达」。是否算兑现工单 03，取决于下面两个口径。

## 待定案（这是 `needs-triage` 的原因，请勿跳过）

工单 03 只允许两条路径：**直接改** 或 **走已有的节点表单浮层**。而现状走的是第三条——
「关菜单 → 右侧属性面板」。按 `CONTEXT.md:73-74`，属性面板是「画布右侧的编辑区，由结构树（上）
与选中元素属性表单（下）组成」，与右键菜单是两个不同的东西，且 `CONTEXT.md:74` 明确
「元素的添加入口在画布右键菜单，**不在属性面板**」。所以现状严格讲**不符合**工单 03 的授权。

两个口径选其一：

- **(甲) 菜单内直接落码**。难点：基数 / 标签 / act / 文本里，**基数**是枚举性的
  （`1`、`*`、`0..1`、`1..*` 等常见值），适合子菜单直接改；**标签、文本**是自由文本，
  菜单里没法直接改，只能弹输入框——而弹输入框正是 (丙) 否掉的「又一个表单」。
  可能的折中：基数走子菜单直接落码，标签 / act / 文本保持现状并**在工单 03 里明确承认**
  这条路径。
- **(乙) 承认现状即兑现**，把工单 03 的文案改为「编辑类动作 = 联动选中 + 关闭菜单，
  编辑在右侧属性面板完成」，并把「编辑基数/标签」的菜单项改名为更诚实的措辞
  （如「在属性面板中编辑」），避免用户以为点了会直接改。

**倾向 (乙)**：它与 (丙)「画布上应是『这元素能做什么』而非又一个表单」的立意一致，
且右侧表单是既有能力、无需新建组件。但**需要人类确认**，因为工单 03 原文写的是「直接改」。

## 需求（按 (乙) 写，若定案为 (甲) 则相应调整）

1. 菜单项措辞改为如实描述行为（如「在属性面板中编辑…」），i18n 同步。
2. 若定案含 (甲) 的基数子菜单：`context-menu.ts` 的 `ContextMenuItemId` 增量级选项项，
   `cycleRelationKind` 旁加一个基数循环/子菜单，`set-relation` 的 `cardFrom` / `cardTo` 直接落码。
3. **不新建任何表单组件**（(丙) 仍然有效）。
4. 更新 `03-edge-context-menu.md` 的 Comments，记录最终口径与理由。

## 落码位置

- `src/lib/editing/use-canvas-context-menu.ts`：`editRelation`（`:464`）、`editMessage`（`:480`）。
- `src/lib/editing/context-menu.ts`：`ContextMenuItemId`、`contextMenuItems`、文件头注释 `:15-17`。
- `src/i18n/index.ts`：菜单项文案。
- 若选 (甲)：`src/lib/editing/class-forms.ts` 的 `setRelationIntent`（基数选项来源）。

## 不变量

- **已落码的两个循环动作不得改变**：`cycleRelationKind` / `cycleMessageArrow` 行为与既有用例全绿。
- **右键联动选中不得破坏**（这是工单 03 阶段一的核心成果，也是现状唯一让编辑可达的原因）。
- 不新建表单组件（(丙)）。
- 逐字保留（ADR-0004 / ADR-0008）：写回路径仍走既有 `set-relation` / `set-message`，不新增写回逻辑。

## 测试

- `src/lib/editing/__tests__/use-canvas-context-menu.test.tsx`（既有 `:1160` 等用例保护现状）：
  1. 若 (乙)：菜单项点击后**菜单关闭且选中保持在该边上**（既有用例应已覆盖，补一条显式断言
     「关菜单后右侧出现对应表单」的集成用例）。
  2. 若 (甲)：基数子菜单点击后 `set-relation` 的 `cardFrom` / `cardTo` **直接落码**，
     源码出现对应基数文本。
  3. 回归保护：`cycleRelationKind` / `cycleMessageArrow` 既有用例全绿。

## 验收

- [ ] 口径已定案并写进 Comments（(甲) 还是 (乙)，理由）。
- [ ] 定案对应的用例全绿，既有用例无一条变红/被删。
- [ ] `03-edge-context-menu.md` 已同步（口径或文案）。
- [ ] 未新建任何表单组件。
- [ ] 控制台 0 error / 0 warning。（按 `AGENTS.md` 当前规则，默认不做真机确认；若需真机，单独提出）

## Comments

### 定案：按 (乙) 落码（已在票头写死，此处记做法）

不在菜单内嵌表单。菜单项 = **明确的「编辑属性」入口**：`editRelation` / `editMessage` 的语义写成
「**选中该连线 + 关闭菜单**」，字段编辑在右侧属性面板（`RelationForm` / `MessageForm`）完成。

| 文件 | 改动 |
|---|---|
| `src/lib/editing/use-canvas-context-menu.ts` | 删掉两个只有 `closeMenu()` 的空壳函数；新增 `selectMenuTargetAndClose`（`selectTarget(menu.target)` + `closeMenu()`）；返回对象里 `editRelation` / `editMessage` 都指向它（两个 id 保留是因为目标种类不同）；文件头「连线菜单」段同步 |
| `src/lib/editing/context-menu.ts` | `ContextMenuItemId` 上方注释、`contextMenuItems` 上方菜单清单注释同步为新语义（**未动**返回值与 id 集合） |
| `src/i18n/index.ts` | 两条菜单项文案改口径（见下） |
| `src/lib/editing/__tests__/use-canvas-context-menu.test.tsx` | 补强 2 条既有用例 |
| `src/components/__tests__/scenario-a-class-relation.test.tsx` | 新增 1 条「属性面板得到该连线」的集成用例 |

**为什么这样算消解 U1 的 Middle Man**：气味来自「函数体只有 `closeMenu()`」——菜单项不表达任何语义，
选中靠右键时的联动隐式成立。现在选中由菜单项自己确认（先把选中清掉再点菜单项，选中仍落回该连线，
用例即按此写），属性面板拿到哪条连线不再依赖调用链的隐式前提。

### 文案改动（原文 → 新文）

| key | 原文 | 新文 |
|---|---|---|
| `app:canvas.menu.edit-relation` | 编辑基数与标签 | **在属性面板中编辑** |
| `app:canvas.menu.edit-message` | 编辑激活与文本 | **在属性面板中编辑** |

- 取「在属性面板中编辑」而非字面「编辑属性」，是因为后者仍不说明**点完去哪儿改**，
  消不掉「点了没反应」的错觉；工单「需求 1」给的示例措辞也是「在属性面板中编辑…」。
  若人类裁定要字面「编辑属性」，替换这两条 zh 字符串即可，无其它耦合。
- **i18n 只有 zh 一个 locale**（`src/i18n/index.ts` 头注释：spec 要求「从第一天接入但只配中文 locale」，
  resources 里只有 `zh: zhDict`），故无 en 字典需要同步——**这点与票面「中英 i18n 同步」不符，需人裁定**
  （要么承认只有 zh，要么补 en 字典——后者属新增能力，本票不做）。

### 测试

补强（既有两条，标题随文案改）：

- `use-canvas-context-menu.test.tsx`「菜单「在属性面板中编辑」（关系）」：先把选中清掉 → 点菜单项 →
  `menu` 为 null、选中回到 `{ kind: 'class-relation', elementId: 'relation:1' }`、
  `commitIntent` **未被调用**（编辑项不是落码动作）。
- 同文件「（消息）」一条：`{ kind: 'message', elementId: 'message:1' }`，同样断言不落码。

新增：

- `scenario-a-class-relation.test.tsx`「右键关系边 → 「在属性面板中编辑」：菜单关闭、选中停在该关系、
  右侧出现它的表单（工单 05）」——真实 `PropertyPanel` 渲染出该关系的表单
  （断言出现 `Foo → Bar` 表头 + `起点基数（可选）` + `关系标签（可选）` 字段）。

回归保护（未改、全绿）：`cycleRelationKind` / `cycleMessageArrow` 的循环用例、删除用例、
`context-menu.test.ts` 的菜单项清单断言（id 集合未动）。

### 测试结果

- `npx vitest run src/lib/editing/__tests__/use-canvas-context-menu.test.tsx src/lib/editing/__tests__/context-menu.test.ts src/components/__tests__/scenario-a-class-relation.test.tsx` → **78 passed**
- `npm run typecheck` → 通过
- `npm test`（全量，与工单 02/03 两位代理并行落码期间跑的）：**54 文件 / 804 用例，803 passed / 1 failed**。
  **失败那条在 `src/lib/canvas-selection/__tests__/edge-locate.test.ts`**——工单 03（note / block 命中）
  那位代理正在改的并行区域（同一份工作区里跑第二次时失败数已从 9 降到 1，随他的提交收敛），
  与本票改动无交集：本票未碰 `edge-locate.ts` / `pipeline/`，本票涉及的 5 个文件全绿。
  基线（53 文件 / 789 用例）只增不减，既有用例无一条变红或被删。

### spec.md 改了哪一句（需要人复核）

改动位置：`.scratch/parity-review-followups/spec.md` 的 **F5 段末尾**（追加，未删改既有句子）
与**工单索引表**第 05 行（`needs-triage` → `resolved`）。

被改口径的承诺原文在 `.scratch/sequence-class-parity/issues/03-edge-context-menu.md:23-25`：

> - **class 关系边**：改关系类型（`set-relation` 的 `kind`）、改两端基数（`cardFrom` / `cardTo`）、
>   改标签（`label`）、删除。
> - **sequence 消息线**：改箭头（`arrow`）、改 act（`act`）、改文本（`text`）、删除。
>
> **明确否掉 (丙)**：不再新增表单浮层。……阶段二的字段编辑**直接改**（如箭头类型用子菜单/循环切换）
> 或走**已有的**节点表单浮层机制，不新建组件。

**改的是其中四项（改基数 / 改标签 / 改 act / 改文本）的兑现方式**，新口径：

> 这四项**经属性面板完成**：菜单项 = 选中该连线 + 关闭菜单，字段在右侧 `RelationForm` / `MessageForm` 改。

（改关系类型 / 改箭头两项维持原样，仍是菜单内循环直接改。）

同时在 `03-edge-context-menu.md` 的 Comments 追加了「工单 05 的口径同步」小节，把这条新口径写回前批工单，
避免两个目录的口径各说各话。

### 遗留（需人裁定）

1. **i18n 只有 zh**——票面/派单写「中英 i18n 同步」，仓库无 en 字典。上面「文案改动」段已说明。
2. **`beginEditLabel`（flowchart 连线「编辑标签」）仍是同款空壳**：函数体只有 `closeMenu()`，
   注释写「右键时已选中该连线」。本票没动它——工单 05 的不变量是「flowchart 的 edge 菜单不回归」，
   且 U1 的 Middle Man 只点名了 `editRelation` / `editMessage`。若要一并消解，
   让它也指向 `selectMenuTargetAndClose` 即可（行为等价，选中仍是那条 flowchart 边）。
3. **控制台 0 error / 0 warning**：按 `AGENTS.md` 当前规则（默认不做真机/浏览器验收）未做真机确认。
   本票是纯 UI 语义改动，单测已覆盖「菜单关 + 选中在该连线 + 右侧表单拿到它」。
