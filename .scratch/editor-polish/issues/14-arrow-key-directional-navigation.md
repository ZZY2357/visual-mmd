# 14 方向键改为方位导航（按画布几何方位选邻近节点）

Status: resolved

来源：`BUG_AND_FEAT.md`「上下左右键切换选中特别严重，你写个测试，模拟键盘输入，看看哪个节点被选中」。
2026-09-29 grilling 定案，决策记录见 `spec.md` 的「方位导航定案」节，理由与取舍见 ADR-0011。
**取代 03**：03 的「mindmap 树形四向 / flowchart 源码顺序线性」语义作废（见文末 Comments）。

## 需求

### 1. 适用图种

flowchart、mindmap、class、sequence **四者同一套方位语义**（03 只做前两者）。
编辑键（Tab / Enter / Delete）**不扩**：仍只在 flowchart / mindmap 生效（本批非目标，见 `spec.md`）。

### 2. 方位导航规则（纯几何，ADR-0011）

- **锚点** = 当前选中节点的**可视范围中心**（可视范围定义见 §4）。
- **候选** = 其余节点中，中心落在按键所指方向的 45° 锥形内者。设 `dx` = 候选中心 x − 锚点中心 x，
  `dy` = 候选中心 y − 锚点中心 y（屏幕坐标，y 轴向下）：

  | 键 | 锥形条件 |
  |---|---|
  | `→` | `dx > 0` 且 `|dy| ≤ |dx|` |
  | `←` | `dx < 0` 且 `|dy| ≤ |dx|` |
  | `↓` | `dy > 0` 且 `|dx| ≤ |dy|` |
  | `↑` | `dy < 0` 且 `|dx| ≤ |dy|` |

  边界（`|dx| == |dy|`，即正好 45°）**算候选**。
- **新选中** = 候选中「锚点中心 → 候选中心」的直线距离最小者；**并列取投影顺序靠前者**。
- **无候选** → 无操作（选中不变），但仍 `preventDefault`（不回绕）。

### 3. 无选中 / 失效选中

没有锚点时方位无从谈起，一律回落为**选中投影第一个节点**（与方向键无关）：
flowchart = 首个节点、mindmap = 根、sequence = 首个参与者、class = 首个类。
「无选中」含 `null`、图表级选中、元素种类与本图种不符、选中已不在投影中（沿用 03 的口径）。
投影为空 → 无操作。

### 4. 节点位置口径（真机实测得出）

某一节点的**可视范围** = 「高亮会标出的全部元素」外接矩形的**并集**。
判定直接复用 `src/lib/canvas-selection/highlight.ts:24-34` 的匹配谓词
（`el.data-id === id || el.id === id || el.id.endsWith('-' + id)`），保证「位置」与「高亮」永远是同一集合。

### 5. 修饰键（修既有缺陷）

Ctrl / Cmd / Alt / Shift 任一按住 → **不导航**；但按键是四个方向键时仍 `preventDefault`。
修掉两处现状缺陷（真机已验证）：`use-canvas-keyboard.ts:57` 的提前 `return` 未 `preventDefault`
→ `Alt+←/→` 与 `Cmd+←/→` 会触发浏览器前进/后退；`Shift+方向键` 会**静默改变选中**。

### 6. 自动平移（新特性）

选中变更后，若新节点的可视范围**未完全落在画布可见区内**，则以**最小位移**把它推进来
（四周留 24px 边距，与 `fitView` 的 padding 同值）；已完全可见则**不动视图**。
`scale` 不变，只改 `tx/ty`；**瞬时生效，不加补间**（`transform` 直接写 SVG，加 CSS transition 会
连带把滚轮缩放、拖拽平移也变成动画）。

### 7. 界面文案

`src/i18n/index.ts` 的 `canvas.keyboardHint` 增补方向键：
`点击节点选中后：方向键移动选中 · Delete 删除 · Tab 添加子节点 · Enter 添加同级节点`

### 8. 不变量

方向键只 `select()`，**不移动 DOM 焦点**（ADR-0010）；焦点在代码面板 / 输入控件 / 按钮时完全不拦截
（沿用 `FOCUS_EXCLUDE_SELECTOR`）；高亮与属性面板照旧由 `select()` 联动，无需改选中链路。

---

## 已实测事实（2026-09-29 真机，勿重复调研）

容器实测 468×569 @ (436,135)，`overflow:hidden`（可见区 = 容器内容盒）；当前视图 `scale≈0.4405`。

| 图种 | 每节点「高亮元素」个数 | 元素形态 | 实测中心（屏幕坐标） |
|---|---|---|---|
| flowchart | 1 | `g.node.default`；`data-id` 由 `annotateNodeDataIds` 反注，DOM id `{svgId}-flowchart-{id}-{n}` | A(656,189) B(656,347) C(656,650) D(704,565) |
| class | 1 | `g.node.default`；DOM id `{svgId}-classId-{类名}-{n}` | Customer(577,199) BankAccount(711,322) Account(644,467) Ledger(644,640) |
| mindmap | 1 | `g[id$="-node_N"]`；内部 `path.node-bkg` 与 g **同 id**（DOM 重名、非嵌套）；各节点 g 互为**兄弟**，bbox 只含自己（根 45×45，不是整图） | 根 node_0(681,428) node_1 双面板同步(630,467) node_6 属性面板(694,374) node_11(832,456) … |
| sequence | **2** | 生命线 `line.actor-line`（h≈356，中心即上下两个实例的中点）+ 顶部实例 `g`；**底部实例不带 data-id** | 使用者 并集中心(585,376)／顶部实例(585,195)／生命线中点(585,407)；系统 并集中心(746,376) |

- **并集口径对 sequence 是必要的**：若取「顶部实例」，选中的高亮范围（生命线 + 顶部实例）与位置口径不一致。
- 布局引擎：mindmap = cose-bilkent 力导向（`mindmapDb.getData()` 硬编码 `layout='cose-bilkent'`），
  flowchart = dagre；**两者都不保证源码顺序与屏幕方位一致**（这是本单的根因）。
- 视图变换只落在 SVG 元素上（`translate(tx,ty) scale(scale)`，`use-canvas-view.ts:70`），
  故 `getBoundingClientRect()` 返回的**已是屏幕像素**，不需要按 scale 换算；
  屏幕坐标 → 容器坐标有现成函数 `overlayRectInContainer`（`src/lib/editing/inline-edit.ts:132`）。
- sequence / class 的 `data-id` 除节点外还落在**连线**上（`id_Customer_Account_2`、`i1`、`i7`、`edgeNote0`…），
  所以测量**必须按本图种节点 id 逐个查**，不能扫 `[data-id]` 反推节点。

---

## 落码位置与接缝

三段式：**纯函数（可单测）/ DOM 测量适配层 / hook 接线**。理由：happy-dom 渲染不出 mermaid
（flowchart 得空 SVG，mindmap 抛 `Could not create canvas of type 2d`），导航又是第一次依赖渲染产物。

### 1. 纯函数（无 DOM、无 store）

- 新文件 `src/lib/editing/directional-navigation.ts`：
  - `pickDirectionalTarget(anchor: {cx:number; cy:number}, candidates: {id:string; cx:number; cy:number}[], key): string | null`
    —— 只吃中心点与顺序（数组顺序即投影顺序，用于并列取先者）；返回 `null` = 无候选。
- `src/lib/canvas-view/view-state.ts` 增加 `panIntoView(view, targetRect, containerSize, margin): ViewState`
  —— 与 `zoomAtPoint` / `fitView` 同处（该文件的注释已声明「容器坐标 = tx + scale × 内容坐标」的约定）；
  `tx` 与容器坐标是 1:1 平移，故只改 `tx/ty`。

### 2. DOM 测量适配层

- 新文件 `src/lib/editing/canvas-measure.ts`：`measureNodeExtents(container: HTMLElement, root: ParentNode, dataIds: string[]): Map<string, Rect>`
  —— 逐个 data-id 按 §4 的谓词找元素、`toRect()` 取外接矩形并**并集**、`overlayRectInContainer()` 换成容器坐标。
  不做缓存（模板规模 2–13 节点）；`root` 缺失或节点查不到时该条不出现在 Map 里（= 不参与导航）。

### 3. hook 与组件接线

- `src/components/CanvasPanel.tsx`：把导航能力打包成一个**适配对象**（`useMemo`/`useRef`，
  依赖 `[projection, svg]` 与容器 ref），传给 `useCanvasKeyboard`：

  | 成员 | 复用点 |
  |---|---|
  | `extents(): {dataId, rect}[]` | `measureNodeExtents` + 各图种节点列表（见下） |
  | `dataIdOf(selection): string \| null` | 现成的 `selectedDataIdOf`（`CanvasPanel.tsx:76-90`） |
  | `toSelection(dataId): Selection \| null` | 现成的 `resolverOf`（`:53-58`）+ `canvasToEditorSelection`（`:61-73`） |
  | `reveal(dataId): void` | `useCanvasView` 新增暴露的 setter（见下） |
  | `firstSelection(): Selection \| null` | 各图种节点列表的首项 |

  各图种的节点 data-id 列表（投影顺序）：flowchart = `nodes[].nodeId`；class = `classes[].name`；
  sequence = `participants[].actorId`；mindmap = `nodes[].elementId` 经 `mindmapDomIdOf`（`mindmap-adapter.ts`）。

- `src/lib/canvas-view/use-canvas-view.ts`：返回值补一个把视图设到给定值的入口
  （如 `revealRect(rectInContainer: Rect)`，内部 `panIntoView(viewRef.current, …)` + `setView`；
  `view === null`（尚未 fit）时不动）。
- `src/lib/editing/use-canvas-keyboard.ts`：
  - `CanvasKeyboardOptions` 增加 `navigation?: CanvasNavigation`。
  - 方向键分支改为：修饰键策略（§5）→ `extents()` → `pickDirectionalTarget` →
    `toSelection(target)` → `select()` → `reveal(target)`；无选中/失效选中 → `select(firstSelection())`。
  - **class / sequence 的编辑键**：`target.kind` 为这两者时，`keyToNodeAction` 命中也要直接 `return`
    （不落码、不 `preventDefault`）——它们只享受方向键。
  - `CanvasKeyboardProjection` union 扩到四个图种（`{kind:'class', projection: ClassProjection}`、
    `{kind:'sequence', projection: SequenceProjection}`）。
- `src/lib/editing/canvas-keyboard.ts`：**删除** `navigationTarget` / `flowchartNavigationTarget` /
  `mindmapNavigationTarget`（结构导航退场）。`isNavigationKey`、`keyToNodeAction`、
  `nodeActionIntents`、`mindmapActionIntents` 保留——mindmap 的父/子/兄弟关系仍由 Tab/Enter 的**落码**使用。
- 删掉因 03 而不再使用的 `use-canvas-keyboard` 依赖项（如无）。

---

## 手算预期（按 §2 规则推出，供验收对照；与实现不符先查实现）

「—」= 无候选、按键无操作。

flowchart TD 模板（源码顺序 A→B→C→D，B 分叉到 C/D）：

| 起点 | `↑` | `↓` | `←` | `→` |
|---|---|---|---|---|
| A 开始(656,189) | — | B | — | — |
| B 是否学会 Mermaid?(656,347) | A | **D**（D 比 C 近） | — | — |
| C 享受画图(656,650) | **D**（D 比 B 近） | — | — | — |
| D 用 Visual MMD(704,565) | ~~C~~ **B** [^d-row] | — | — | — |

[^d-row]: **票面勘误（2026-09-29 验收补记）**：本行原记 `↑` → C，与 §2 规则矛盾——C(656,650) 在
  D(704,565) 的**下方**（`dy = +85 > 0`），不属 `↑` 的锥形（要求 `dy < 0`）。该表坐标取自 07 验收时的
  真机量测，两点的纵向关系与「C 在 D 上方」的直觉相反。按 §2 规则，D 的 `↑` 候选只有 B(656,347)
  （`dx=-48, dy=-218`，`|dx| ≤ |dy|` 成立），故应为 **B**。真机实测（本项验收）亦为 B。实现正确，
  是手算表自身笔误。

mindmap 模板（13 节点，力导向）：

| 起点 | `↑` | `↓` | `←` | `→` |
|---|---|---|---|---|
| 根 node_0(681,428) | 属性面板 | 代码面板 | 双面板同步 | 图表库 |
| 双面板同步 node_1(630,467) | 属性面板 | 代码面板 | 画布 | 根 Visual MMD |
| 源码是唯一真相源 node_3(600,539) | 代码面板 | — | 实时渲染预览 | 根 Visual MMD |

**注意这张表就是本单的目的**：TD 流程图里纵向走向由 `↑/↓` 承担、`←/→` 多为无操作；
力导向 mindmap 里「父节点」可能落在右上方（node_1 的父是 `→` 而不是 `←`）——方向键不再承诺树关系。

---

## 测试

- `directional-navigation.test.ts`（纯函数，假坐标）：四向锥形、45° 边界（`|dx|==|dy|`）、
  斜向远 vs 正向近的取舍、距离并列取投影顺序、锚点自身排除、无候选返回 `null`、空候选列表。
- `view-state.test.ts` 补 `panIntoView`：已完全可见 → 原样返回；越左/右/上/下边界 → 最小位移且留边距；
  两侧都越界（节点比可见区大）→ 取使其起点可见的位移。
- `use-canvas-keyboard.test.tsx`：**注入假的 navigation 适配对象**（假矩形，不碰 DOM、不碰 mermaid）——
  断言四向落点、无候选时选中不变但有 `preventDefault`、修饰键不导航但 `preventDefault`、
  无选中时落首个节点、`class`/`sequence` 的 Tab/Enter/Delete 不落码不拦截、焦点在代码面板时不拦截。
  （这是 03 的 `use-canvas-keyboard.test.tsx` 的改造；比 monkey-patch `getBoundingClientRect` 更干净，
  故 Q8 的「hook 级测试用假几何」以注入适配对象落实。）
- 一次真机验收（浏览器，四图种各走一遍）。

## 验收

- [x] 四图种：从选中节点按方向键，新选中中心确实落在该方向的 45° 锥内，且是候选中最近的（并列取投影序）。
- [x] 本单根因的两个反例被修掉：flowchart 从 B 按 `→`、从 C 按 `→` 都**不再是**源码顺序的 C / D；
      mindmap 从「双面板同步」按 `↓` 不再是右上的「属性面板」。
- [x] 与上表逐格对照（至少覆盖表中全部格子）。
- [x] 无候选 / 到边界：无操作、选中不变、仍 `preventDefault`（不滚动页面）。
- [x] 无选中（含图表级选中）时按任一方向键 → 选中投影首个节点。
- [x] `Shift+方向键` 不改变选中；`Alt+方向键`、`Ctrl/Cmd+方向键` 不改变选中且不触发浏览器前进/后退。
- [x] 自动平移：节点在视野内时视图纹丝不动；把节点拖出视野（或放大后）再按方向键 → 最小位移带回视野并留 24px 边距。
- [x] 焦点在代码面板时方向键是正常光标移动、不被拦截；全流程 `document.activeElement` 恒为画布容器。
- [x] 控制台 0 error / 0 warning。

## Comments

- 本单由 2026-09-29 的 grilling 定案（三轮，用户逐条确认），**取代 03**：03 的 `navigationTarget` 把
  flowchart 的顺序定义为「源码顺序」、mindmap 定义为「父/子/兄弟」，而 mermaid 的布局引擎（dagre /
  cose-bilkent）不保证源码顺序与屏幕方位一致，这正是用户报的「上下左右键切换选中特别严重」的根因。
  03 的验收记录（`07-acceptance.md:177-244`）仍然有效——它记录的正是「改前的行为」。

- **已实现并验收（2026-09-29）**。三段式接缝照票面落地，另修了一处评审发现的重复：

  | 接缝 | 落点 |
  | --- | --- |
  | 纯函数 | 新增 `src/lib/editing/directional-navigation.ts`（`pickDirectionalTarget`，导出 `DirectionalPoint`）；`src/lib/canvas-view/view-state.ts` 新增 `panIntoView` |
  | DOM 测量 | 新增 `src/lib/editing/canvas-measure.ts`（`measureNodeExtents`） |
  | 接线 | `canvas-keyboard.ts`（删 `navigationTarget` 一系、扩四图种、新增 `CanvasNavigation`/`NodeExtent`）、`use-canvas-keyboard.ts`（修饰键策略 + `navigate` 闭包）、`use-canvas-view.ts`（`revealRect`）、`CanvasPanel.tsx`（`nodeDataIdsOf` + `keyboardProjectionOf` + 适配对象）、`i18n`（`canvas.keyboardHint`） |

  评审修正：`highlight.ts` 抽出并导出 `matchesDataId` / `DATA_ID_CANDIDATE_SELECTOR`，`canvas-measure` 改为
  **import 复用**（原为逐字重抄谓词）——这样「位置与高亮是同一集合」由代码保证，不再靠人工对齐；
  删除未被引用的死类型 `DirectionalKey`。

- **自动化证据**：`npm run typecheck` 0 错误；`npm test` **46 文件 / 597 用例全绿**（新增
  `directional-navigation.test.ts` 11 例、`canvas-measure.test.ts` 8 例、`view-state.test.ts` 的
  `panIntoView` 组，改写 `canvas-keyboard.test.ts`（删结构导航 9 例）与 `use-canvas-keyboard.test.tsx`
  （注入假 `CanvasNavigation` 的 3 个 describe））。

- **真机验收证据**（Chromium，vite dev，`agent-browser` 真实键盘事件；容器 446×398）：

  - **flowchart**（默认模板，节点中心 A(213,44) B(214,150) C(213,354) D(246,297)）逐格实测
    A`↓`→B、B`↓`→**D**、B`↑`→A、D`↑`→B、C`↑`→**D**、A`↑`/A`←`/A`→`/C`↓`/C`←`/C`→`/D`↓`/D`←`/D`→`
    全部**无操作**——与 §2 规则的预测逐格一致，且 B`↓`→D 正是票面点名的根因反例（改前为源码顺序的 C）。
    上表 D 行的笔误见 [^d-row]。
  - **mindmap**（模板 13 节点，力导向）：连续 8 步（node_0`←`→node_1、node_1`↓`→node_2、node_2`↓`→node_3…
    node_6`↓`→node_0）实测落点与按实测中心算出的 §2 预测**完全一致**；票面点名的反例复测：从
    「双面板同步」(node_1) 按 `↓` 落到**正下方的「代码面板」(node_2)**，不再落到右上的「属性面板」(node_6)。
  - **class**（模板 4 类）：BankAccount`↓`⇄Account`↑` 互达，横向无候选时无操作；无选中按 `↓` 落首个类
    BankAccount。
  - **sequence**（模板 2 参与者）：`使用者`/`系统` 各自命中 **2** 个元素（`line.actor-line` + 顶部 `g`）——
    §4 的并集口径在真机成立；`→`/`←` 在两者间互达，纵向无候选；无选中按 `↓` 落首个参与者 `使用者`。
  - **修饰键**：`Shift`/`Alt`/`Control`/`Meta` + 方向键四次全部不改变选中，且页面未发生前进/后退。
  - **自动平移**：放大到 `scale≈1.334` 后，选中节点未完全可见 → 位移后上边界恰好 24px、下边界恰好
    24px，`scale` 与另一轴不变；目标已完全可见时 `svg.style.transform` 逐字不变（`translate(144.183px, 24px)
    scale(0.667939)` 四次按键后完全相同）。
  - **不变量**：全流程 `document.activeElement` 恒为画布容器；焦点移到代码面板（`.cm-content`）后方向键
    完全不拦截、选中不变。
  - **控制台**：`agent-browser console` 与 `errors` 均为空（0 error / 0 warning）。
