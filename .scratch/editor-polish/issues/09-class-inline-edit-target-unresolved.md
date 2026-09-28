# 09 class 图节点缺 data-id：新建类后内联命名浮层不可用

Status: needs-triage

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

（空）
