# 09 class 图节点缺 data-id：新建类后内联命名浮层不可用

Status: resolved

来源：工单 07 手工验收「04 空图空白右键」的通用条目「创建后应**直入内联编辑**（浮出输入框让你命名）」。
sequence / mindmap 两条路径通过，**class 一条不通过**：浮层输入框确实被渲染出来，但 `rect === null`
导致它 `display: none` 且拿不到焦点，用户**看不到也敲不进**新类名。

同一根因还使 **class 画布节点完全无法点选**（详见「实测实际行为」第 4 条），影响面不止本单：
工单 06 的 class 节点右键菜单、工单 04 的 class 内联命名都依赖这条寻址链路。

## 需求

复现步骤：

1. 打开 `http://localhost:5199/`（先清空 localStorage 再 reload），「新建」→「类图」。
2. 在左侧代码面板用键盘把源码整体替换为只剩表头：`classDiagram`。
3. 等画布进入错误态（红色 Alert「源码存在语法错误，画布已停留在最近一次合法状态」）。
4. 在画布空白处右键 → 点「添加类」。
5. 读源码 / localStorage / 画布内联浮层。

预期（工单 04 原文）：

- 第 4 步能弹出菜单并「添加类」，落码 `class 新类`，源码变合法、错误消失、图正常渲染。
- **创建后直入内联编辑**：浮出输入框、预填 `新类`、获得焦点，可直接改名（Enter 提交）。

实测实际行为：

1. 第 3 步：错误态成立 —— 画布上方出现 `.mantine-Alert-root`，文案
   `源码存在语法错误，画布已停留在最近一次合法状态 / Parse error on line 2: classDiagram ------------^ Expecting 'acc_title'...`；
   画布里的 SVG 是**上一次合法渲染的残留**（错误冻结语义，`use-mermaid-preview.ts:41-44`）。
2. 第 4 步：右键空白确实弹出菜单，菜单项 = `["添加类"]`；点击后源码变为
   `classDiagram\nclass 新类`（`localStorage` 逐字一致），**Alert 列表变空**（错误消失）、
   画布渲染出 `新类` 类框 —— 票面这一段**通过**。
3. 第 5 步（**不通过**）：`.canvas-inline-edit` 浮层存在、`input.value === "新类"`，但
   `getComputedStyle(overlay).display === "none"`、`input.offsetParent === null`、
   `document.activeElement === BODY`（不是该 input）。等待 2 秒后再读仍是 `display: none`、
   未聚焦；此时用键盘输入不会进任何输入框，源码也不会变 —— **无法命名新类**。
4. 同一根因的旁证：在 `classDiagram\nclass 新类` 上点结构树顶部的「图表classDiagram」回到图表级选中
   （面板文案回到「类图：在左侧结构树中选中元素编辑属性。」），再用真实鼠标点击画布里的类框
   `g.node`（`id="mmd-preview-22-classId-新类-19"`）——**面板不回到类表单、无高亮**
   （`[data-vm-selected]` 恒为空），即 class 画布节点点选失效。同一操作在 flowchart / mindmap /
   sequence 上均正常。

证据：

- 落码（通过部分）：`localStorage['visual-mmd:library'].diagrams.at(-1).source`
  = `classDiagram\nclass 新类`；`.mantine-Alert-root` 数量由 1 → 0。
- 浮层（不通过部分）：
  `document.querySelector('.canvas-inline-edit').getAttribute('style')`
  → `position: absolute; display: none; width: 40px; z-index: 20; background: var(--mantine-color-body); outline: 1px solid var(--mantine-color-blue-filled); padding-inline: 4px; font-size: 12px;`
  （`display: none` = `src/components/CanvasPanel.tsx:133` 的 `display: rect === null ? 'none' : undefined`）；
  `document.activeElement.tagName` → `BODY`。
- DOM 事实：class 图渲染出的节点 `<g class="node default" id="mmd-preview-22-classId-新类-19">`
  **没有 `data-id`**；整棵 class SVG 里 `[data-id]` 的集合为空（默认类图模板同样如此：`g.node`
  的 id 形如 `mmd-preview-21-classId-BankAccount-14`，带 `data-id` 的只有边 `<path>`
  `id_BankAccount_Account_1` 之类）。对照 sequence 图的参与者元素带 `data-id`（新建参与者后
  `[data-vm-selected]` 命中两处 `data-id = 新参与者`）。
- 代码口径（辅助定位，非判定依据）：
  `src/lib/canvas-selection/node-data-ids.ts:18` 的反注正则
  `/(?:^|-)flowchart-(.+)-(\d+)$/` **只覆盖 flowchart** 的 DOM id 形态
  （`{svgId}-flowchart-{id}-{n}`），v12 的 class 节点 id 形态是
  `{svgId}-classId-{类名}-{n}`，因此既不会被反注 `data-id`，也无法被
  `nodeDataIdResolver`（只认裸类名）命中；`src/lib/editing/use-canvas-inline-edit.ts:90-100`
  的 `findTargetElement` 对 class/sequence/flowchart 一律走 `querySelectorAll('[data-id]')`，
  找不到即 `rect === null` → 浮层 `display:none`。
  注：`src/lib/canvas-selection/data-id.ts:100-104` 已支持「DOM id 也交给 resolver」，
  但 class 的 resolver 只认裸类名，故 `...-className-{n}` 仍匹配不上。
- 对照（同一轮实测通过，说明缺陷是 class 特有）：sequence 空图加参与者后浮层
  `display: block`、`focused: true`、预填 `新参与者`；mindmap 空图加根节点后浮层同样
  `display: block`、`focused: true`、预填 `新节点`。

附加观察（同一现象链上的次要症状，未单独开单）：因为第 5 步浮层拿不到焦点，`activeElement` 是
`BODY`，而画布容器的 Esc 监听（`use-canvas-context-menu.ts:177-189`）挂在容器上 —— 此时按 Esc
关不掉这次编辑；随后点「新建」切到别的图种，上一次的编辑态会**跨图种残留**（新图种的内联浮层
复用同一实例、`useState` 不重初始化），实测表现为：空 classDiagram 添加类后切到时序图再加参与者，
浮层预填的仍是上一个图的 `新类` 而不是 `新参与者`。清空浏览器重载后重做时序图路径，预填恢复正确
（`新参与者`），故这不是独立可复现的缺陷，只是上述浮层不可用状态的次生现象。

## Comments

**实现（工单 09）**：走"反注 data-id"的归一化路线（与工单 08 的 flowchart 同一条后处理链），
在 `node-data-ids.ts` 增加 class 类框的 DOM id 形态 `{svgId}-classId-{类名}-{n}` → `data-id=类名`，
于是点选解析（data-id.ts）、高亮（highlight.ts）、内联编辑定位（inline-edit.ts 的 `findTargetElement`）、
右键目标解析（context-menu.ts）四处**无需各自打补丁**；不再需要 class 专属适配器
（mindmap 的 `node_N` 是位置序、反注不出源码 id，才走 adapter）。

**真机实测（`npm run dev -- --port 5198`，Chromium/CDP，`localStorage.clear()` 后重载）**：

- DOM 事实（修复后）：`g.node class="node default"` 的 id 为 `mmd-preview-2-classId-BankAccount-9`
  /`...-classId-Account-10`/`...-classId-Customer-11`（实测确认 class 节点确实无原生 data-id），
  反注后三者分别带 `data-id=BankAccount/Account/Customer`（`Account~T~` 的泛型如预期被 mermaid 从 id 里去掉）。
- 目标 1（左键点选）：点类框 → `[data-vm-selected] = ["mmd-preview-2-classId-BankAccount-9"]`（恰好一处），
  属性面板切到该类表单（`类名 = BankAccount`、`泛型` 空、有「删除类」按钮），结构树 `类（2）`。
- 目标 2（右键节点菜单）：右键类框 → 菜单项 = `["添加成员","添加关系","删除类（含成员与关系）"]`（工单 06 的三项），
  点「添加成员」（预选 `所属类 = BankAccount`）填 `String email` → 落码 `BankAccount : +String email`（源码与 localStorage 逐字一致）。
- 目标 3（空白右键新建类 → 直入内联编辑）：空 `classDiagram`（`Alert` 文案与第 3 步一致、`g.node` 0 个）→
  空白右键菜单 `["添加类"]` → 落码 `classDiagram\nclass 新类\n`、Alert 由 1 → 0、类框 id `mmd-preview-1-classId-新类-1` 且 `data-id=新类`；
  `.canvas-inline-edit` **`display: block`**（不再是 `none`）、`input.value = 新类`、
  `document.activeElement` = 该 `INPUT[aria-label=编辑节点文本]`、`offsetParent ≠ null`；
  输入 `订单` + Enter → 源码 `classDiagram\nclass 订单\n`、浮层卸载、焦点回画布容器。
- 回归：flowchart 点选高亮 `...-flowchart-B-1` + 右键菜单 `["从这里连线","编辑文本","应用样式","删除"]` 照旧；
  mindmap 点选高亮 `...-node_1`（`g.node` 仍未带 data-id，未被新正则误伤）、sequence 参与者点选 + 节点菜单
  `["添加消息","删除参与者"]` 照旧；class 关系边点选仍不选中（ADR-0007，非本单范围）、右键仍为空白菜单 `["添加类"]`。
  控制台无错误。

环境限制：本机 in-app Browser 面板不可见（viewport 0x0、`visibilityState=hidden`，rAF 不触发），
故顶栏 Mantine 菜单（`新建`）无法展开、`innerWidth/innerHeight` 为 0 会命中窄屏布局；实测改用
「直接写 `localStorage['visual-mmd:library']`（与各模板一致的源码）+ 重载」等价进入 class 图，
并临时 `Object.defineProperty(window,'innerWidth')` + `resize` 打开三栏布局。截图为该行为下不可用，证据以上述 DOM 快照为准。

