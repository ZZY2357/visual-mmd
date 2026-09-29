# Spec: 编辑器打磨（editor-polish）

来源：`BUG_AND_FEAT.md` 的五条反馈，经 grilling 会话（2026-09-28）三轮追问后由用户确认。
术语变更已落入 `CONTEXT.md`（主题、节点 ID、显示文本、选中）；两条 ADR：`0009`（mindmap id 可选）、
`0010`（画布键盘作用域与焦点归还）。

**追加（2026-09-29）**：`BUG_AND_FEAT.md` 的第二条反馈「上下左右键切换选中特别严重」经 grilling 三轮
收敛为「方位导航定案」（见下），新增第三条 ADR `0011`（方向键是方位导航）与术语（方位导航 / 结构导航 /
候选 / 节点的可视范围），工单 03 被 14 取代。

本文件是共识的唯一权威记录：**背景事实**（已实测的 mermaid/app 行为，勿重复调研）与**决策记录**
（每条需求的取舍结论）都写在这里；工单文件只写实施细节，不再重述理由。

---

## 背景事实（已实测，勿重复调研）

### 主题（对应工单 01）

- mermaid 12.0.0 注册 **11 个**主题：`base, dark, default, forest, neutral, neo, neo-dark, redux,
  redux-dark, redux-color, redux-dark-color`
  （`node_modules/mermaid/dist/chunks/mermaid.core/chunk-O7XYJQB3.mjs:3999-4033`）。
  app 目前只暴露 5 个（`src/lib/pipeline/frontmatter.ts:16`）。
- v12 把 flowchart/sequence/class/state/er… 的**每图表默认主题**改为 `redux-color`
  （同文件 `:4039` / `:4079` / `:4176`），全局默认仍是 `default`（`:4611`），**mindmap 无该键**（`:4314`）。
  node 实测 `mermaid.mermaidAPI.getConfig()`：顶层 `theme=default`，而
  `flowchart.theme = class.theme = sequence.theme = redux-color`。
- 所以"default 就是 redux-color"是误判。真正的因果：不写主题时**类图/时序图/流程图渲染 redux-color，
  mindmap 渲染经典 default**；而 `readTheme` 只认 5 个名字、其余值一律返回 null，选择器显示
  「默认（default）」（`frontmatter.ts:77-86` + `src/components/ThemePicker.tsx:37`），
  于是"显示值在骗人"——这才是用户看到"两张图一个主题"的原因。
- frontmatter 里的 `theme` **确实能压过**每图表默认（`resolveAppearance` 按层优先，chunk `:5073-5100`），
  所以选择器本身是生效的；副作用是"选 default"会把类图从 redux-color 换成 classic。
- 无法识别的主题值（如 `theme: solarized`）被 mermaid **静默忽略**并回退到图表默认
  （`isUsableAppearance`，chunk `:5055-5058` 附近），不会报错。

### 键盘焦点（对应工单 02）

- 画布 keydown 挂在**容器**上（`src/lib/editing/use-canvas-keyboard.ts:94`），这是刻意设计：
  焦点在代码面板/输入框时事件根本到不了容器。
- tab 失效根因：内联输入框提交后卸载，React 19 不会把焦点还给已移除的元素 → 焦点落到 `<body>` →
  后续 Tab/Enter 到不了容器监听器；而事后没有任何代码把焦点还给容器。
- 加重因素：`src/components/CanvasPanel.tsx:412/414` 的守卫
  `if (closest('input, textarea, .cm-editor') === null) focus()` 后面紧跟一句**无条件** `focus()`，
  守卫等于死代码 → 鼠标点击内联输入框会立刻失焦并触发 `onBlur` 提交（"输入框点不进去"）。

### 右键菜单（对应工单 04、06）

- `src/lib/editing/context-menu.ts:41` 空白菜单**只支持 flowchart**；`:42-46` 的节点分支只认
  flowchart/mindmap，对 class/sequence 的节点返回 `null` —— 即 **class/sequence 的节点右键
  完全没有菜单，不只是空图**。
- 空图插入本身可用：`class.ts:604-611`（加类）、`sequence.ts:510-518`（加参与者）在只有表头的
  文档上也能落码（`insertAfter` 回退到最后一个元素 = 表头）。
- **空 `classDiagram`（仅表头）在 mermaid 里是解析错误**（happy-dom 实测）；空 `sequenceDiagram`
  合法。app 的错误冻结语义见 `src/lib/use-mermaid-preview.ts:41-44`（失败保留最近一次合法 SVG）。
- class/sequence 的 pipeline 意图**全部已实现**，本批只缺 UI 入口：
  `add-class / rename-class / delete-class / add-member / set-member / delete-member / add-relation /
  set-relation / delete-relation / add-note / set-note / delete-note / add-classdef / set-classdef-prop`
  （`class.ts:881-915`）；
  `add-participant / set-participant / rename-participant / delete-participant / toggle-activation /
  add-message / set-message / delete-message / add-note / set-note / delete-note / set-autonumber /
  add-block / set-block-label / add-else / set-else-label / delete-else / delete-block`
  （`sequence.ts:849-881`）。
- 级联语义**已有先例、无需新定**：`resolveDeleteClass`（`class.ts:660-682`）连带删除类体内成员、
  owner 为该类的行式成员、以及引用该类的 relation；`resolveDeleteParticipant`（`sequence.ts:582-593`）
  连带删除所有引用该 actor 的语句。
- 工单 07 删掉面板添加入口后，一批 `Add*InlineForm` 成为死代码：
  `class-forms.tsx:246/278/319/360`、`sequence-forms.tsx:320/351/406/456`、`property-forms.tsx:355/384/425/447`。
- 校验器都在、且接受中文：`isValidClassName`（`class.ts:873-875`）、`isValidParticipantId`
  （`sequence.ts:837-839`，禁空白与 `:` `,`，禁 `end`）。

### mindmap 的 id 与显示文本（对应工单 05）

- 解析层 id/text **已经分开**（`mindmap.ts:100-118` 的 `MindmapNodeData`，`parseNodeBody` `:80-92`），
  但**投影把 id 丢了**（`mindmap-projection.ts:10-20` / `:41`）；写回只有 text
  （`resolveSetNodeText` `:381-388`）；画布寻址用**源码行位置序**（`mindmap.ts:272` 的
  `mindmap-node:N`，DOM 侧 `node_N`，见 `src/lib/canvas-selection/mindmap-adapter.ts:16-41`），
  与语法 id 无关。
- happy-dom 实测 mermaid mindmap 的节点模型：

  | 源码 | nodeId | descr | 形状 |
  |---|---|---|---|
  | `My Label` | `My Label` | `My Label` | 无（纯文本） |
  | `myid My Label` | `myid My Label` | `myid My Label` | 无 |
  | `myid[My Label]` | `myid` | `My Label` | 方框（type 2） |
  | `myid(My Label)` | `myid` | `My Label` | 圆角（type 1） |

  **结论：没有"无形状但 id ≠ 文本"的写法** → 分离 id 必然引入形状（默认方框 `[]`）。
- 重复 id mermaid **接受**（`a[x]` 与 `a[y]` 并存 parse 通过）→ 重名是 UX 取舍，不是技术约束。
- app 侧 id 字符约束来自自己的解析正则 `mindmap.ts:85`
  `^([^\s()[\]{}]+)([ \t]*)(.+)$`：id 不能含空白、圆括号、方括号、花括号。
- 模板里的根节点 `root((Visual MMD))` 本来就是分离态（id=`root`、显示文本=`Visual MMD`、圆形），
  可作心智模型。

---

## 需求清单

1. **主题清单与语义**：列表扩到 mermaid 的 11 个主题，并新增「跟随 Mermaid 默认（不设置主题）」项；
   选择器如实回显源码里的主题值，非法值给提示。
2. **内联编辑后的焦点归还**：提交（Enter/Esc）后焦点回到画布容器，使 Tab/Enter 立即可用；
   同时修掉容器抢焦点的死守卫。
3. **方向键导航**：方向键移动**选中**（~~mindmap 走树形四向，flowchart 走源码顺序的线性前后~~ ——
   该语义已由下节「方位导航定案」取代：四个图种统一按画布方位取最近节点）。
4. **空图右键菜单**：class/sequence/mindmap 的空白右键也能创建元素，创建后直入内联编辑。
5. **mindmap 的 id 与显示文本分离**：默认纯文本（id 不自动生成）；显式设置 id 时插入前缀并保留
   显示文本与形状；清除 id 还原纯文本。
6. **class/sequence 的节点右键菜单**：把已存在的 pipeline 意图接到右键菜单上（最小可用集）。

---

## 决策记录（grilling 三轮的结论，勿再翻案）

| 主题 | 决策 |
|---|---|
| 批次落盘 | 新目录 `.scratch/editor-polish/`，6 张实现票 + 1 张验收票；顺序见文末 |
| 主题清单 | **11 个全暴露**（含 `base`），另加置顶「跟随 Mermaid 默认（不设置主题）」 |
| 「默认」语义 | 「不设置」与 `default` 是两回事：`default` 改叫「经典（default）」；选「跟随」= 删除源码里的主题键 |
| 选择器回显 | `readTheme` 返回**原始字符串**，选择器回显原文；完全没有 theme 键时显示「跟随」 |
| 非法主题值 | 回显原文 + 提示"无效主题，已按 Mermaid 默认渲染"（mermaid 会静默忽略） |
| 清除主题的悬空结构 | 删 `theme:` 行 → 若 config 无其它有效子项则删 `config:` 行 → 若 frontmatter 因此为空则删整块；用户手写的其它 config 项逐字保留 |
| 焦点归还 | 仅 Enter/Esc 提交与点击画布时归还；**失焦提交不归还**；否掉把监听升到 window |
| 抢焦点死守卫 | 本批一并修（删无条件 `focus()`） |
| 方向键语义 | 只移动**选中**，不引入独立"焦点"概念、不移动 DOM 焦点 |
| 方向键模型 | mindmap：`←` 父、`→` 第一个子、`↑/↓` 兄弟；flowchart：`←/↑` 上一个、`→/↓` 下一个（**源码顺序**）—— **已作废**，见「方位导航定案」 |
| 方向键边界 | 到边界**无操作**（不回绕）；无选中时按键选中第一个节点（mindmap 根 / flowchart 首节点） |
| 方向键覆盖 | 本批只做 mindmap + flowchart；class/sequence 不做 —— **已作废**，见「方位导航定案」（四个图种全做） |
| 空白菜单 | class → 添加类；sequence → 添加参与者；mindmap → 添加根节点；flowchart 保持现状 |
| 空类图的非法态 | 按"错误态也能右键加类、加完即修复"实现并验收，**不改模板** |
| 空白菜单落点 | 创建后直入内联编辑；默认名 `新类` / `新参与者` / `新节点`；sequence 不生成 alias |
| mindmap 空白加根节点 | 落地后移除属性面板的 `MindmapRootForm`（`PropertyPanel.tsx:270-275`） |
| mindmap id 默认 | **不自动生成**：新节点仍是纯文本，id 保持缺席（ADR-0009） |
| mindmap id 输入入口 | 只有属性面板表单的「节点 ID」字段；画布内联编辑只改显示文本；右键菜单不加"编辑 ID" |
| mindmap 分离写法 | 插入 id 前缀 + 显示文本**逐字保留（含空格）** + 原形状保留（无形状则方框 `[]`） |
| mindmap id 清除 | 字段清空 = 还原纯文本节点（撤销分离的唯一途径） |
| mindmap id 校验 | 禁空白/圆括号/方括号/花括号（与 `mindmap.ts:85` 一致）；**允许重名**（mermaid 实测接受） |
| mindmap 投影与树 | 投影补 `id` 字段；结构树只显示显示文本；画布寻址保持位置序，id 变更不影响选中/高亮 |
| class/sequence 节点菜单 | 并入本批（06 票）；最小可用集：class = 加成员/加关系/删除类，sequence = 加消息/删除参与者；注释/块/条件分支暂缓 |
| 验收 | 单开 `07-acceptance.md`，`Blocked by: 01-06` |
| 推进方式 | 先只落票，用户逐张过目后再开工（不在本轮动代码） |

---

## 验收后裁定（07 验收开出的失败单，2026-09-29）

07 手工验收通过 01–06 的大部分条目，但不通过 5 条，各开失败单并逐条修复。其中两条属**口径裁定**
（需记在此处，勿再翻案）：

| 主题 | 决策 |
| --- | --- |
| 顶层 `theme:` 行 | **视为无效文本**（08 单裁定）：mermaid 只识别 `config.theme`；只有顶层 `theme:` 时选择器仍显示「跟随」、不识别也不清除，选「跟随」时该行**逐字保留**（属未触碰文本，ADR-0004/0008）；不加「无效写法」告警。原票面「只有 theme 行」应读作「`config` 块下的 theme 行」 |
| mindmap 清 id 的形状取舍 | **保留用户自选形状、只丢分离引入的方框**（05 单补裁定）：`User Input` → `UserNewInput[User Input]` → 清 id → `User Input`（方框一并去掉）；`myid(圆角)` → `(圆角)`、根 `((思维导图))` 保持圆形。判定规则 `shapeType === 'square'` 视为分离产物丢弃，其余形状保留；已知取舍：刻意选的方框清除后会一并丢失。详见 ADR-0009 |

其余三条是**实现缺陷**（非口径），修复记录见各自票面 Comments：

- **09** class 图 `g.node` 在 mermaid v12 无原生 `data-id` → 反注 DOM id 形态 `{svgId}-classId-{类名}-{n}`，
  恢复点选/内联编辑/节点右键菜单（承接 ADR-0007，未改寻址模型）。
- **10** sequence 投影未按 actorId 合并隐式参与者（消息早于声明出现时结构树重复 + React 重复 key）
  → 改为「首现顺序 + 按 actorId 归一的单一信息表」。
- **11** 级联删除参与者后残留空 `loop`/`alt` 块（mermaid 渲染期成批 NaN 属性 error）
  → 追加 `pruneEmptyBlocks` 不动点清理，只清理**本次删除删空**的块（原本就空的不碰，守 verbatim 底线）。
- **12**（07 回归的题外观察）「适应窗口」按钮被背景拖拽的 `setPointerCapture` 劫持 + 按钮上按 Enter
  会误落码 → 抽出纯命中判定 `isBackgroundDragTarget`（svg 后代与交互控件都不启动拖拽），
  键盘焦点排除表补 `button`。

---

## 方位导航定案（2026-09-29，grilling 第三轮）

来源：`BUG_AND_FEAT.md` 的新反馈「上下左右键切换选中特别严重，你写个测试，模拟键盘输入，看看哪个节点
被选中」。先按该反馈写了**直接调用事件函数**的测试（不模拟真机键盘），再用真机
`getBoundingClientRect()` 测量，确认根因：方向键原先按**源码顺序 / 树关系**定义落点，而 mermaid 的
布局（flowchart = dagre、mindmap = cose-bilkent 力导向）与源码顺序无关。真机实测：flowchart 从 B 按 `→`
落到**正下方**的 C、从 C 按 `→` 落到**右上**的 D；mindmap 从「双面板同步」按 `↓` 落到**右上**的
「属性面板」、从根按 `→` 落到**左下**的第一个子节点。

grilling 定案（用户逐条确认）：

| 主题 | 决策 |
| --- | --- |
| 语义模型 | **方位导航**（几何）：新选中 = 该方向 45° 锥内、中心距离最近的节点；无候选无操作；并列取投影序 |
| 适用图种 | **四个图种全部**（flowchart / mindmap / class / sequence）同一套语义 |
| 被放弃的 | mindmap 的树形四向（`←` 父 / `→` 首子 / `↑↓` 兄弟）—— 方向键不再承诺树关系（ADR-0011） |
| 修饰键 | Ctrl/Cmd/Alt/Shift 任一按住 → 不导航，但仍 `preventDefault`（修掉 `Alt/Ctrl+方向键` 触发浏览器前进后退、`Shift+方向键` 静默改选中的既有缺陷） |
| 无选中回落 | 保留「有落点」：选中**投影第一个节点**，与方向键无关（= 改前既有行为） |
| 节点位置口径 | 节点可视范围 = 所有「高亮会标出的元素」外接矩形的**并集**（sequence 参与者有两个元素：生命线 + 顶部实例；底部实例不带 data-id） |
| 位置来源 | 渲染后的 DOM 实测（`getBoundingClientRect`，已含 CSS transform）；不做缓存 |
| 自动平移 | **做**：新节点未完全落在可见区时，以最小位移（留 24px，同 `fitView` 的 padding）推进视野；完全可见则视图不动；瞬时无补间 |
| 编辑键范围 | 不扩：Tab/Enter/Delete 仍只在 flowchart / mindmap 生效（class/sequence 只享受方向键） |
| 界面文案 | `canvas.keyboardHint` 增补「方向键移动选中」 |
| 测试口径 | 纯函数单测（假坐标）+ hook 单测（**注入假 navigation 适配对象**，不碰 DOM/mermaid）+ 一次真机验收 |
| 落盘 | ADR-0011、CONTEXT 术语（方位导航 / 结构导航 / 候选 / 节点的可视范围）、工单 14；工单 03 作废 |

工单 03 的树形 / 源码顺序语义**据此作废**（`Superseded by: 14`）。03 的验收记录仍有效——它记录的正是
「改前的行为」。完整的规则、实测事实表、接缝设计与手算预期见 `issues/14-arrow-key-directional-navigation.md`。

---

## 惯例决定

- 选中态：外圈描边高亮（沿用 `canvas-interaction` 既有实现）。
- 所有编辑走 `commitIntent` → 快照撤销栈，新意图（如清除主题、设置 mindmap id）自动获得撤销/重做。
- 源码是唯一真相源：新增/清除主题、设置/清除 id 都必须是手术式改写，未触碰文本逐字保留（ADR-0004/0008）。
- mermaid 大版本升级时需回归：主题清单（v12 的 11 个）、每图表默认主题、mindmap id 语法、空 `classDiagram` 的解析行为。

## 非目标（本批不做，勿顺手扩）

- class/sequence 的注释、块、条件分支菜单项；class/sequence 的画布键盘加节点（Tab/Enter/Delete）。
- ~~flowchart 的**几何**方向键（本批是源码顺序线性）；mindmap 之外图种的树形导航。~~
  —— **已撤销**：由 2026-09-29「方位导航定案」与工单 14 接管（四个图种统一几何方位导航）。
- 主题的 `look` 选项（classic / neo / handDrawn）选择器。
- 把画布寻址从位置序改为语法 id（会牵动 ADR-0007 的 data-id 机制）。

## 工单

- 01 主题清单与语义（`01-theme-list-and-semantics.md`）
- 02 内联编辑后的焦点归还（`02-canvas-focus-after-inline-edit.md`）
- 03 方向键导航（`03-arrow-key-navigation.md`）—— **Blocked by 02**
- 04 空图的空白右键菜单（`04-blank-context-menu-on-empty-diagram.md`）
- 05 mindmap 的 id 与显示文本分离（`05-mindmap-id-and-display-text.md`）
- 06 class/sequence 的节点右键菜单（`06-class-sequence-node-context-menu.md`）
- 07 验收收尾（`07-acceptance.md`）—— **Blocked by 01-06**
- 14 方向键改为方位导航（`14-arrow-key-directional-navigation.md`）—— 取代 03；无前置阻塞
  （**已实现并验收，2026-09-29**；接缝为「纯函数 `directional-navigation` / DOM 测量 `canvas-measure` /
  hook 接线」三段，详见该票 Comments）
