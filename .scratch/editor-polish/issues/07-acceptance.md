# 07 验收收尾

Status: needs-triage

Blocked by: 01, 02, 03, 04, 05, 06

## 需求

全链路手工验收本批六项改动 + 回归既有能力。逐条给出可复现步骤与预期，不通过的记成新的 issue
文件（不要在本文件里改需求）。

## 手工验收清单

**01 主题**
- 新建 flowchart：主题选择器显示「跟随 Mermaid 默认（不设置主题）」；源码里没有 frontmatter。
- 打开默认模板的类图：选择器显示「跟随」，画面是 redux-color 外观；mindmap 同样显示「跟随」但是
  classic 外观 —— 两者不同是**预期**（spec 背景事实）。
- 选「经典（default）」：源码写入 frontmatter，类图外观从 redux-color 变为 classic。
- 选「跟随」：主题键被清除干净（分别构造三种形态验证：只有 theme 行 / config 下还有别的项 /
  frontmatter 只有 config），手写的其它 config 项**逐字保留**。
- 手写 `theme: redux-color` → 选择器回显 `redux-color`；手写 `theme: solarized` → 回显 + 无效提示。
- 11 个主题逐个选一遍，画面都有可见差异或至少不报错。

**02 焦点归还**
- Tab → 输入 `一` → Enter → Tab → 输入 `二` → Enter → Tab → 输入 `三` → Enter：连续三层成立。
- Escape 取消编辑后立刻按 Tab 仍能加节点。
- 点代码面板打字 → 点回画布 → Tab 恢复。
- 鼠标点进内联输入框能正常输入（不再一点就提交）。
- 代码面板里 Tab 仍是缩进。

**03 方向键**
- mindmap：选中中层节点，`←`/`→`/`↑`/`↓` 分别是父/首子/上兄弟/下兄弟；根按 `←`、末兄弟按 `↓`、
  叶子按 `→` 无操作且不滚动页面。
- flowchart：`→`/`↓` 沿源码顺序前进，`←`/`↑` 回退，首尾无操作。
- 未选中时按 `→` 选中第一个节点。
- 焦点在代码面板时方向键是正常光标移动。

**04 空图空白右键**
- 空 `sequenceDiagram`：右键空白 → 添加参与者 → 内联命名 → 落码、渲染。
- 空 `mindmap`：右键空白 → 添加根节点 → 落码；属性面板的根节点表单已移除。
- 空 `classDiagram`（画布应显示 mermaid 解析错误）：右键空白 → 添加类 → 落码后错误消失、图渲染。
- 非空图空白右键仍可加。

**05 mindmap id**
- 新节点默认纯文本 `新节点`，表单 ID 字段为空。
- 填 `NewId` → `NewId[新节点]`（方框），选中/高亮/双击内联编辑不位移。
- 有形状节点设 id → 形状保留（`((圆))` → `id((圆))`）。
- 带空格显示文本：`User Input` → `UserNewInput[User Input]`；清空 id → 回到 `User Input`。
- 非法 id（含空格/括号）无法提交；两个节点同 id 允许。

**06 class/sequence 节点右键**
- class：右键类 → 加成员 / 加关系 / 删除类；删除类时成员与 relation 级联消失。
- sequence：右键参与者 → 加消息 / 删除参与者；删除时消息级联消失。

**07 回归（不回归项）**
- 代码面板 ↔ 画布双向同步；外部落码不被回声吞掉（b5c35d0 的修复）。
- 撤销/重做覆盖本批全部新动作（含清除主题、设/清 id、方向键后的加节点）。
- 导入/导出 `.mmd` / SVG / PNG 不受视图影响；图表库切换重置视图。
- **11 主题**下选中态可见（原验收是"五主题下选中态可见"，主题列表扩容后要点一遍）。
- 窄屏布局不破。
- `npm test`、`npm run typecheck` 全绿。

## Comments

### 01 主题（验收记录）

环境：dev server `http://localhost:5199/`，浏览器 1600×1000，先 `localStorage.clear()` 再 reload。
全部操作走真实 UI（新建菜单 / 主题 `Select` / 代码面板 CodeMirror 手写）；源码证据取自
`localStorage['visual-mmd:library'].diagrams.at(-1).source` 与代码面板实际文本（两者逐字一致）。

- [通过] 新建 flowchart：选择器显示「跟随 Mermaid 默认（不设置主题）」，源码无 frontmatter
  —— 步骤：头部「新建」→「流程图」/ 预期：跟随 + 无 frontmatter / 实际：选择器 input
  `aria-label="选择图表主题"` 的 value = `跟随 Mermaid 默认（不设置主题）`，隐藏 input value =
  `__follow__`；源码 = `flowchart TD\n    A[开始] --> B{是否学会 Mermaid?}\n...`，无 `---` 块 / 通过。
- [通过] 默认模板类图：选择器「跟随」，画面是 redux-color 外观（非 classic）
  —— 步骤：「新建」→「类图」/ 预期：跟随 + redux-color / 实际：选择器 = 跟随；SVG 指纹
  `classDiagram` rect `fill=rgb(255,255,255)`、`stroke=rgb(40,37,61)`，style 内 `#28253D`×18、
  `#F9F9FB`×1、`#ECECFF`×0、`#9370DB`×0 —— 与
  `node_modules/mermaid/dist/chunks/mermaid.core/chunk-O7XYJQB3.mjs:3290-3320`（theme-redux-color：
  `mainBkg=#ffffff`、`nodeBorder=#28253D`、`clusterBkg=#F9F9FB`）逐项吻合，classic 的
  `primaryColor=#ECECFF` / `primaryBorderColor=#9370DB` 完全不出现 / 通过。
- [通过] 默认模板 mindmap：选择器「跟随」，画面是 classic 外观 —— 与类图不同，符合 spec 背景事实
  —— 步骤：「新建」→「思维导图」/ 预期：跟随 + classic，且与类图的 redux-color 外观**不同** / 实际
  （对照实验，规避主观判断）：跟随态 SVG style（去掉 `mmd-preview-N` 中的 N 后）hash=1784459392、
  首节点 fill=rgb(0,0,236)；显式选 redux-color 后 hash=-1497625842、fill=rgb(115,115,248)（**不同**
  → 跟随 ≠ redux-color）；显式选 经典（default）后 hash=1784459392（**与跟随态逐字节相同**
  → 跟随 ≡ classic）；中间态 style 含 `#9370DB`×7、`#28253D`×0 / 通过。
- [通过] 选「经典（default）」：源码写入 frontmatter，类图外观 redux-color → classic
  —— 步骤：类图上打开主题下拉选「经典（default）」/ 预期：落码 + 外观变 classic / 实际：源码变为
  `---\nconfig:\n  theme: default\n---\nclassDiagram\n...`（代码面板文本一致）；SVG 指纹 rect
  `fill=rgb(236,236,255)`、`stroke=rgb(147,112,219)`，`#ECECFF`×8、`#9370DB`×13、`#28253D`×0、
  `#ffffde`×1 —— 与切换前（白底 + `#28253D`）外观已改变 / 通过。
- [通过] 选「跟随」：主题键清除干净（三种悬空形态逐一构造），手写其它 config 项逐字保留
  —— 均在代码面板用真实键盘输入（`Control+A` + `insertText`）后从下拉选「跟随」：
  (a) `---\nconfig:\n  theme: forest\n---\nflowchart TD\n    A --> B\n` → 实际
  `flowchart TD\n    A --> B\n`（整块 frontmatter 消失，回到无 frontmatter）/ 通过；
  (b) `---\nconfig:\n  theme: forest\n  flowchart:\n    curve: linear\n---\n…` → 实际
  `---\nconfig:\n  flowchart:\n    curve: linear\n---\nflowchart TD\n    A --> B\n`（只删 theme 行，
  `flowchart:` 与 4 空格缩进的 `curve: linear` 逐字保留）/ 通过；
  (c) `---\ntitle: 我的图\nconfig:\n  theme: forest\n---\n…` → 实际
  `---\ntitle: 我的图\n---\nflowchart TD\n    A --> B\n`（theme 行与悬空 `config:` 行一并删除，
  `title: 我的图` 逐字保留）/ 通过。
- [通过] 手写 `config` 下的 `theme: redux-color` → 选择器回显该值
  —— 步骤：代码面板手写 `---\nconfig:\n  theme: redux-color\n---\n…` / 预期：回显 `redux-color`，
  不再显示「默认」/ 实际：选择器 value = `Redux 彩色（redux-color）`（工单 01 Comments 已声明的
  Mantine Select 恒显 label 取舍，裸名在括号内可见），无错误提示 / 通过。
- [通过] 手写 `theme: solarized` → 回显原文 + 无效提示
  —— 实际：选择器 value = `solarized`（原样裸字符串），下方 error 文案
  `无效主题，已按 Mermaid 默认渲染`，画布不报错（mermaid 静默忽略，回退图表默认）/ 通过。
- [通过] 11 个主题逐个选一遍：画面都有可见差异，且全程 0 报错
  —— 步骤：flowchart 上依次选中 11 个主题，每次记录归一化后的 SVG style hash 与首节点 fill / 实际：
  11 个 hash 互不相同（default -2098113676、neutral -1432245752、dark 2133030451、forest
  -1583617768、base 195618892、redux-color 2024330771、redux-dark-color -1252456952、redux
  1892802116、redux-dark -1822605581、neo 1334895281、neo-dark -1859184458），fill 覆盖
  `rgb(236,236,255)`/`rgb(238,238,238)`/`rgb(31,32,32)`/`rgb(205,228,152)`/`rgb(255,244,221)`/
  `rgb(255,255,255)`/`rgb(17,17,19)`/`rgb(42,32,32)` 等；该轮 console error 列表为空 / 通过。
- [不通过] 顶层（config 块之外）手写 `theme:` 行：既不回显，也不被「跟随」清除 —— **口径张力**，
  待人工裁决（见 `08-theme-toplevel-key-not-cleared.md`）
  —— 步骤：代码面板手写 `---\ntheme: forest\n---\nflowchart TD\n    A --> B\n` / 票面文字「手写
  `theme: redux-color` → 选择器回显」若按字面（顶层写法）理解，应回显 forest / 实际：选择器显示
  「跟随 Mermaid 默认（不设置主题）」（`readTheme` 只认 `config` 下的缩进 theme 行，
  `frontmatter.ts:127-137`），画布仍渲染 redux-color（说明 mermaid v12 同样忽略顶层 `theme:`）；
  再选「跟随」后源码里 `theme: forest` 行仍原样保留（`applySetTheme` 在找不到 `config:` 时直接
  返回原文，`frontmatter.ts:154`）。即：**顶层写法与 config 写法行为不同**，而票面/工单文字未区分。
- 控制台：本节全流程（新建 4 种图 + 主题切换 20+ 次 + CodeMirror 手写 5 次）`playwright-cli console`
  显示 Errors: 0 / Warnings: 0，**未复现**「Encountered two children with the same key」。

### 02 焦点归还（验收记录）

环境同上（1600×1000，真实鼠标点击 / 真实键盘事件）。每步都记录 `document.activeElement`：
画布容器 = `DIV`（无 class，`tabindex=0`），内联输入框 = `INPUT[aria-label="编辑节点文本"]`
（位于 `div.canvas-inline-edit` 浮层内），代码面板 = `DIV.cm-content`。以下三条链式操作全部在
**同一次页面会话内连续完成**，未 reload、未重新点选。

- [通过] Tab → 输入 `一` → Enter → Tab → 输入 `二` → Enter → Tab → 输入 `三` → Enter：连续三层成立
  —— 步骤：点击画布节点 `A`（`DIV[tabindex=0]` 获得焦点）→ 依次 3 轮「Tab → 输入 → Enter」/
  预期：每轮 Tab 都能开出新的内联输入框，Enter 后焦点回到画布容器 / 实际（逐轮实测的
  `activeElement`）：点 A 后 `DIV[tabindex=0]`；第 1 轮 Tab 后 `INPUT[编辑节点文本]`（预填 `n1`）→
  输入 `一` → Enter 后 `DIV[tabindex=0]`；第 2 轮 Tab 后 `INPUT`（预填 `n2`）→ `二` → Enter 后
  `DIV[tabindex=0]`；第 3 轮 Tab 后 `INPUT`（预填 `n3`）→ `三` → Enter 后 `DIV[tabindex=0]`。
  源码（代码面板文本与 localStorage 逐字一致）：
  `flowchart TD\n    A[开始] --> B{是否学会 Mermaid?}\n    A --> n1\n    n1 --> n2\n    n2 --> n3\n
  \    n3[三]\n    n2[二]\n    n1[一]\n    B -- 是 --> C[享受画图]\n ...` → n1/n2/n3 三层链条
  与三次命名全部落码 / 通过。
- [通过] Escape 取消编辑后立刻按 Tab 仍能加节点
  —— 步骤：点选节点 `n1` → Tab（开出内联框，预填 `n4`）→ 输入 `被取消` → Escape → 立刻 Tab →
  输入 `复活` → Enter / 预期：Escape 丢弃本次命名并把焦点还给画布，紧接着的 Tab 仍能新建节点 /
  实际：Escape 后 `activeElement = DIV[tabindex=0]`、内联浮层消失（输入框不在 DOM 中）；紧接着
  Tab 立刻开出 `INPUT`（预填 `n5`），输入 `复活` + Enter 后
  `activeElement = DIV[tabindex=0]`；源码新增 `n1 --> n4\n    n4 --> n5\n    n5[复活]\n    n4[n4]`，
  即 `被取消` 未落码、`复活` 已落码 / 通过。
- [通过] 点代码面板打字 → 点回画布 → Tab 恢复
  —— 步骤：点代码面板并真实敲键盘（`Control+End` + 输入 `\n%% MARKER`）→ `Control+z` 撤销 →
  点画布空白处 → 按 Tab / 预期：点代码面板时焦点在 CodeMirror（Tab 走缩进），点回画布后焦点收回
  容器、Tab 恢复加节点 / 实际：打字后 `activeElement = DIV.cm-content`，
  `document.querySelector('.cm-content').innerText.includes('%% MARKER') === true`（确认真敲进去了）；
  撤销后 marker 消失；点画布空白后 `activeElement = DIV`（非 CodeMirror，`closest('.cm-editor')` 为
  false）；按 Tab 立刻开出 `INPUT[编辑节点文本]` / 通过。
- [通过] 鼠标点进内联输入框能正常输入（不再一点就提交）
  —— 步骤：内联输入框开着（预填 `n7`）时，用真实鼠标在输入框中心 `mousedown+mouseup`，然后打字，
  再 Enter / 预期：点击不触发失焦提交，输入框保持打开且可输入 / 实际：点击前后
  `open=true, val="n7", focused=true`（输入框仍是 `document.activeElement`，节点数未变、无提交）；
  打字后 `val="n7点进来了"` 且仍 focused；Enter 后浮层关闭、焦点回 `DIV[tabindex=0]`，源码
  `n6 --> n7\n    n7[n7点进来了]` / 通过。
- [通过] 代码面板里 Tab 仍是缩进（不回归）
  —— 步骤：点代码面板 → `Control+Home` → 按 Tab / 预期：首行缩进、画布不加节点 / 实际：代码面板
  首行由 `"flowchart TD"` 变为 `"  flowchart TD"`（2 空格缩进，`activeElement` 仍在 `.cm-content`），
  同一时刻画布节点计数不变（`n\d+[` 出现次数 7 → 7，未新增）；`Control+z` 后首行回到
  `"flowchart TD"` / 通过。
- 控制台：本节全流程（3 层连续新建 4 次、Escape 取消、代码面板打字/撤销 3 次、点击输入框）
  `playwright-cli console error` 返回 **Errors: 0 / Warnings: 0**。
  另按线索做了一次定向尝试：手写含重复节点的源码
  `flowchart TD\n    A[一] --> B\n    A[二] --> C\n`，控制台仍 0 报错（结构树里 `A` 被去重为
  单个 `一A`）——**本轮未能复现** React「Encountered two children with the same key」，无法给出
  触发视图/操作。该报错在 01/02 两节所覆盖的路径上均未出现。

### 03 方向键（验收记录）

环境：dev server `http://localhost:5199/`，viewport 1600×1000，先 `localStorage.clear()` 再 reload。
全部按键走真实键盘事件（`playwright-cli press`）。**判定依据三件套**：(a) 渲染 SVG 上的选中标记属性
`[data-vm-selected]`（`src/lib/canvas-selection/highlight.ts:9` 的 `HIGHLIGHT_ATTR`，mindmap 走
`id.endsWith('-node_N')` 后缀匹配）；(b) 右侧属性面板的表单联动（选中节点时出现「显示文本 / 形状 /
节点 ID」，图表级选中时为「方向」）；(c) `document.activeElement`（画布容器 = 无 class 的
`DIV[tabindex="0"]`）。`preventDefault` 用 `document` 级 keydown 监听器读 `e.defaultPrevented`
（监听器挂在 React 根容器之上、冒泡更晚，故读到的是 app/CodeMirror 处理后的结果）。

**mindmap**（新建 → 思维导图，默认模板）。源码（代码面板文本与 `localStorage` 一致）：
`mindmap\n  root((Visual MMD))\n    双面板同步\n      代码面板\n        源码是唯一真相源\n      画布\n        实时渲染预览\n    属性面板\n      结构树\n        树形缩进编辑\n      属性表单\n    图表库\n      ::icon(fa fa-database)\n      localStorage 自动保存\n      导出 mmd / svg / png\n`。
DOM 节点 `mmd-preview-3-node_0..node_12`，用 `textContent` 实测出投影序映射：
`_0=Visual MMD(根)`、`_1=双面板同步`、`_2=代码面板`、`_3=源码是唯一真相源`、`_4=画布`、
`_5=实时渲染预览`、`_6=属性面板`、`_7=结构树`、`_8=树形缩进编辑`、`_9=属性表单`、`_10=图表库`、
`_11=localStorage 自动保存`、`_12=导出 mmd / svg / png`（与源码 DFS 前序逐条吻合）。

- [通过] mindmap 中层节点四向语义正确（父 / 首子 / 上兄弟 / 下兄弟）
  —— 步骤：真实鼠标点选画布上的「属性面板」（`g[id$="-node_6"]`）后依次按 `←`/`→`/`↑`/`↓`
  （每次按完回读状态，必要时用反向键回到 `_6` 重取基线）/ 预期：`←`=父、`→`=第一个子、
  `↑`=上一个兄弟、`↓`=下一个兄弟 / 实际：`←` → `mmd-preview-3-node_0`（面板「显示文本」=
  `Visual MMD`、「形状」= `圆 (( )`、「节点 ID」= `root`）；`→`（从根）→ `node_1`（`双面板同步`）；
  `↑`（从 `_6`）→ `node_1`（`双面板同步`）；`↓`（从 `_1`）→ `node_6`（`属性面板`）→ `node_10`
  （`图表库`，面板「图标」= `fa fa-database`）/ 通过。
- [通过] mindmap 三种边界均无操作、不回绕
  —— 步骤：分别把选中停在根节点 / 第一个兄弟 / 最后一个兄弟 / 叶子后按越界方向键 / 预期：无操作 /
  实际：根 `node_0` 按 `←` → 仍 `node_0`；首兄弟 `node_1`（`双面板同步`）按 `↑` → 仍 `node_1`；
  末兄弟 `node_10`（`图表库`）按 `↓` → 仍 `node_10`；叶子 `node_3`（`源码是唯一真相源`，无子）按
  `→` → 仍 `node_3`。四个用例的状态回读与按键前逐字相同，未出现回绕到另一端 / 通过。
- [通过] 方向键只移动选中，DOM 焦点始终留在画布容器
  —— 步骤：每次按键后读 `document.activeElement` / 预期：焦点不动 / 实际：本节 mindmap 全流程
  （约 14 次按键）`activeElement` 恒为 `DIV/`（tagName=DIV，className 为空，`tabindex="0"`）；
  属性面板随选中联动（默认模板→`方向`；点节点→`显示文本/形状/节点ID/删除节点`）/ 通过。
- [通过] 未选中任何节点时按 `→` 选中第一个节点（mindmap = 根）
  —— 步骤：点结构树顶部的「图表mindmap」按钮（回到图表级选中，`[data-vm-selected]` = 空、面板只剩
  「主题」），再点画布空白使容器获得焦点，然后按 `→` / 预期：选中根节点 / 实际：`→` 后
  `[data-vm-selected]` = `mmd-preview-3-node_0`，面板 = `Visual MMD / 圆 (( ) / root` / 通过。
- [通过] 边界按键 `preventDefault` 成立（"不滚动页面"的正向证据）
  —— 步骤：在 `document` 级挂 keydown 监听器记录 `defaultPrevented`，焦点在画布容器时按根节点的
  `←`（越界无操作）与 `↑` / 预期：被 `preventDefault` 拦截 / 实际：记录 =
  `[{"k":"ArrowLeft","pd":true},{"k":"ArrowUp","pd":true}]` / 通过。
  说明：页面本身 `documentElement.scrollHeight === clientHeight === 1000`（整页不可滚动），
  画布容器 `overflow-x/y: hidden`，所以**无法用滚动位移做证据**，改用 `defaultPrevented`；
  全流程 `window.scrollX/Y` 恒为 `[0,0]`（作为辅助观察，不单独构成结论）。

**flowchart**（默认模板）。投影/结构树顺序 = `A(开始)`、`B(是否学会 Mermaid?)`、`C(享受画图)`、
`D(用 Visual MMD)`，data-id 依次 `A/B/C/D`。

- [通过] flowchart 未选中时按 `→` 选中投影首个节点；`→`/`↓` 前进、`←`/`↑` 回退、首尾无操作
  —— 步骤：点画布空白（`[data-vm-selected]` = 空），按 `→` ×4、再 `←` ×2、`↑` ×2、`←` ×1、
  `↓` ×1 / 预期：A → B → C → D → 尾无操作；再 C → B → A → 首无操作 → 首无操作；`↓` → B /
  实际（逐步回读）：`→`=`A` → `B` → `C` → `D` → `D`（尾不回绕）；`←`=`C` → `B`；`↑`=`A`；
  再 `↑`=`A`（首不回绕）；再 `←`=`A`；`↓`=`B`（`↓` 与 `→` 同义、`↑` 与 `←` 同义）/ 通过。
- [通过] 焦点在代码面板时方向键是正常光标移动、不被画布拦截
  —— 步骤：真实鼠标点代码面板（落点在源码第 2 行），读 DOM Selection 的 anchor/offset，然后按
  `→`×3、`←`、`↓` / 预期：光标正常移动，画布选中不变 / 实际：`activeElement` 恒为
  `DIV/cm-content cm-lineWrapping`（`closest('.cm-editor')` 为真）；offset 15 → 17 → 18 → 17（`←`），
  `↓` 换到下一行 `    B -- 是 --> C[享受画图]`；同一期间 `[data-vm-selected]` 恒为 `["B"]` 不变。
  另实测画布容器**不包含** CodeMirror：`document.querySelector('main div[tabindex="0"]').contains(document.querySelector('.cm-editor')) === false`
  —— 说明事件根本到不了容器监听器，符合 design 意图 / 通过。

- 控制台：本节全流程（创建 mindmap + 约 14 次 mindmap 按键 + 约 12 次 flowchart 按键 + 代码面板
  6 次按键）`playwright-cli console error` 返回 **Errors: 0 / Warnings: 0**。
- 题外观察（**非本节清单项，仅记录，不判通过/不通过**）：在 **mindmap** 画布上真实鼠标点击空白处
  （实测两点 470,200 与 500,940，均为无节点的空白区），选中**不会**被清除（`[data-vm-selected]` 与
  属性面板保持原节点）——本节的"无选中"起点因此改用「结构树 → 图表mindmap」按钮构造。flowchart 的
  空白点击是否清除选中本轮**未单独构造对照实验**（首次 flowchart 点击前状态本就是图表级），故不对
  两种图种的行为差异下结论。
- 本节汇总：7 条通过 / 0 条不通过 / 0 条无法验证。

### 04 空图空白右键（验收记录）

环境：dev server `http://localhost:5199/`，viewport 1600×1000，先 `localStorage.clear()` 再 reload。
所有右键 = 真实 `mousedown right` + `mouseup right`（Chromium 在 mousedown 时派发 `contextmenu`），
菜单项 = 点击浮层里的真实 `<button>`。菜单存在性用「`div` 且 `style.zIndex === '30'` 且
`style.minWidth === '140px'`」定位（`ContextMenuOverlay` 的根样式，`CanvasPanel.tsx:180-191`；
**踩坑**：菜单项是 `UnstyledButton`，没有 `role="menuitem"`，用 role 查会误判为"菜单没弹出"）。
"空图"均由代码面板（`Control+a` + 键盘输入）把源码整体改写成只剩表头。

- [通过] 空 `sequenceDiagram`：右键空白 → 「添加参与者」→ 内联命名 → 落码 + 渲染
  —— 步骤：「新建」→「时序图」，代码面板整体改写为 `sequenceDiagram`（代码面板文本与 `localStorage`
  逐字一致），画布空白 (700,500) 右键 / 预期：菜单含「添加参与者」，点击后落码 `participant xxx`、
  直入内联命名、图能渲染 / 实际：菜单 = `["添加参与者"]`；点击后源码 =
  `sequenceDiagram\nparticipant 新参与者`，内联浮层 `display: block`、`input.value = 新参与者`、
  `focused: true`，选中 = `新参与者`（两处 `[data-vm-selected]`）；键盘输入 `验收参与者` + Enter 后
  源码 = `sequenceDiagram\nparticipant 验收参与者`，浮层关闭；画布 SVG
  `aria-roledescription="sequence"`、`text` 节点 = `["验收参与者","验收参与者"]`、`rect` 2 个
  （上下两个参与者框）→ 已渲染 / 通过。
- [通过] 空 `mindmap`：右键空白 → 「添加根节点」→ 落码；属性面板的「根节点」表单已移除
  —— 步骤：「新建」→「思维导图」，源码整体改写为 `mindmap`（此时画布无节点、面板显示「（暂无节点）」），
  先读面板再在空白处右键 / 预期：面板不再有旧起步表单；菜单含「添加根节点」，点击后落码
  `新节点`（纯文本，不自动生成 id）并直入内联命名 / 实际：**改造前**的面板 = `主题|图表mindmap|（暂无节点）|
  思维导图：在上方结构树中点选节点…`，`innerText.includes('思维导图为空') === false`、
  面板内按钮只有 `["图表mindmap"]`（**没有**「添加根节点」按钮）——对照被移除的旧组件
  `MindmapRootForm`（`git show 784d517~1:src/components/mindmap-forms.tsx` 末段，含
  `mindmapEmptyHint`「思维导图为空：先添加一个根节点…」+ 输入框 + `addRootNode`「添加根节点」按钮），
  且当前 `src/i18n/index.ts` 已无 `mindmapEmptyHint` / `addRootNode` 两个 key；右键后菜单 =
  `["添加根节点"]`，点击后源码 = `mindmap\n  新节点\n\n`、内联浮层 `display: block` + `focused: true`
  + 预填 `新节点`；输入 `验收根节点` + Enter 后源码 = `mindmap\n  验收根节点\n\n` / 通过。
- [通过] 存疑点（前序实现者上报）：mindmap 空图加根节点后，选中/高亮落在正确的那个节点上
  —— 步骤：沿上一条，在 `添加根节点` 落码后立刻（未命名前）与命名后各读一次画布 DOM / 预期：唯一的
  新节点既被渲染也被高亮，而不是高亮到一个不存在的序号 / 实际：落码后画布节点集合 =
  `[{id:"mmd-preview-16-node_0", txt:"新节点", hl:true}]`（**只有一个节点，且就是被高亮的那一个**），
  `[data-vm-selected] = ["mmd-preview-16-node_0"]`，属性面板切到节点表单（`显示文本` = `新节点`）；
  命名为 `验收根节点` 后 SVG 重渲染为 `mmd-preview-17-node_0`，高亮**跟随**到新 id 且唯一
  （`[{node_0, txt:"验收根节点", hl:true}]`）。即预置的 `mindmap-node:1` 与实际新节点一致，
  未观察到错位 / 通过。
- [通过] 空 `classDiagram`（仅表头 = mermaid 解析错误）：右键空白能弹菜单 → 「添加类」→ 落码后错误
  消失、图渲染 —— 步骤：「新建」→「类图」，源码整体改写为 `classDiagram`，等错误态出现，画布空白
  (470,940) 右键 → 点「添加类」/ 预期：错误态下仍能弹出并可加类，加完源码合法、错误消失、图渲染 /
  实际：错误态成立 —— `.mantine-Alert-root` 文案 =
  `源码存在语法错误，画布已停留在最近一次合法状态` + `Parse error on line 2: classDiagram ------------^
  Expecting 'acc_title', ...`，画布里的 SVG 是**上一次合法渲染的残留**（错误冻结语义）；
  此时右键仍弹出菜单 = `["添加类"]`；点击后源码 = `classDiagram\nclass 新类`，`.mantine-Alert-root`
  数量 **1 → 0**（错误消失），画布 `innerText` = `新类\n\n适应窗口`（类框已渲染） / 通过。
- [不通过] 「创建后直入内联编辑（浮出输入框让你命名）」在 **class** 上失效
  —— 步骤：承上，读 `.canvas-inline-edit` 浮层与 `document.activeElement`（并等 2 秒后复读）/
  预期：浮层可见、预填 `新类`、获得焦点，可直接改名 / 实际：浮层**被渲染出来但不可用** ——
  `getComputedStyle(overlay).display === "none"`、`input.offsetParent === null`、
  `document.activeElement === BODY`（不是该 input），2 秒后复读仍相同；此时敲键盘进不了任何输入框、
  源码不变。同一现象链的旁证：在 `classDiagram\nclass 新类` 上先用结构树「图表classDiagram」回到图表级
  选中（面板 = 「类图：在左侧结构树中选中元素编辑属性。」），再真实点击画布类框
  `g.node`（`id="mmd-preview-22-classId-新类-19"`），面板**不回到类表单**、`[data-vm-selected]` 仍为空
  —— class 画布节点点选同样失效（同样操作在 flowchart/mindmap/sequence 上均正常）。DOM 证据：
  class 图整棵 SVG 内 `[data-id]` 为空集（默认类图模板亦然：`g.node` 的 id 形如
  `mmd-preview-21-classId-BankAccount-14`，带 `data-id` 的只有边 `<path> id_BankAccount_Account_1`），
  而 `use-canvas-inline-edit.ts:90-100` 对 class 只看 `[data-id]` → `rect === null` →
  `CanvasPanel.tsx:133` 的 `display: rect === null ? 'none' : undefined` 把它藏掉。已开失败单
  `09-class-inline-edit-target-unresolved.md`。**对照**：sequence 与 mindmap 两条路径的浮层
  均为 `display: block` + `focused: true` + 预填正确默认名，故缺陷是 class 特有。
- [通过] 已有内容的同类图：空白右键也能加（锚点回退到最后一个元素）
  —— 步骤：分别在**非空**的 sequence（默认时序模板）/ class（`classDiagram\nclass 新类`）/
  mindmap（`mindmap\n  验收根节点`）上右键空白并点添加项 / 预期：菜单照常弹出、新元素追加到最后
  一个元素之后 / 实际：sequence 菜单 = `["添加参与者"]`，点击后源码在末尾 `end` 之后追加
  `    participant 新参与者`（内联浮层 `display: block` + `focused: true`，选中 = `新参与者`）；
  class 菜单 = `["添加类"]`，点击后源码追加 `class 新类2`（**内联浮层同上述 class 缺陷不可用**）；
  mindmap 菜单 = `["添加根节点"]`，点击后源码 = `mindmap\n  验收根节点\n    新节点\n`，高亮 =
  `mmd-preview-18-node_1`（**就是新建的那个节点**，`node_0` = `验收根节点` 未被误标）/ 通过。
- [通过] flowchart 空白菜单不回归（添加节点 / 连线模式 / 添加样式 / 添加子图）
  —— 步骤：在默认 flowchart 模板与非空 `flowchart TD` 上各右键一次空白 / 预期：四项齐全且功能可用 /
  实际：两种情况下菜单都 = `["添加节点","添加连线","添加样式","添加子图"]`（票面写「连线模式」，
  UI 实际 label 是 `添加连线`，对应 `context-menu` 的 `link-mode`，`src/i18n/index.ts:39` 附近）；
  点「添加节点」后源码追加 `    n1[n1]`、内联浮层 `display: block` + `focused: true` + 预填 `n1`、
  选中 = `n1` / 通过。

- 控制台：本节全流程（新建 5 种图 + 改源码 6 次 + 空图右键 4 次 + 非空右键 4 次 + 点击菜单项 7 次）
  `playwright-cli console error` / `console warning` 均返回 **Errors: 0 / Warnings: 0**。
- 本节汇总：6 条通过 / 1 条不通过（class 内联命名）/ 0 条无法验证；不通过项已开
  `09-class-inline-edit-target-unresolved.md`。

### 05 mindmap id（验收记录）

环境：dev server `http://localhost:5199/`，viewport 1600×1000，先 `localStorage.clear()` 再 reload。
操作全部走真实 UI（右键菜单 / 属性面板表单 / 真实鼠标 `page.mouse.dblclick` / 真实键盘）；
源码证据取自 `localStorage['visual-mmd:library'].diagrams.at(-1).source`（与代码面板逐字一致）。

- [通过] 新节点默认纯文本 `新节点`，属性面板 ID 字段为空
  —— 步骤：「新建」→「思维导图」（默认模板）→ 在画布节点「localStorage 自动保存」的真实包围盒中心
  右键 → 点菜单「添加子节点」/ 预期：源码追加纯文本 `新节点`、ID 字段空 / 实际：源码新增
  `        新节点`（无括号、无 id）；画布内联浮层自动打开（`style` 无 `display:none`、
  `input.value = 新节点`、`document.activeElement === INPUT`）；Enter 提交后属性面板 =
  `显示文本: 新节点`、`形状: 默认（无形状）`、`节点 ID: ""` / 通过。
- [通过] 填 `NewId` → 源码 `NewId[新节点]`（方框），选中/高亮/双击内联编辑不位移
  —— 步骤：「节点 ID」字段填 `NewId` + Enter / 预期：分离写法 + 引入方框 + 位置序寻址不受影响 /
  实际：源码 `        NewId[新节点]`；画布 `[data-vm-selected]` 仍是 `mmd-preview-5-node_12`
  （**同一个逻辑节点**、未错位），且该节点 `g[data-vm-selected]` 唯一；形状选择器显示 `方形 [ ]`；
  对该节点真实 `page.mouse.dblclick` → 内联浮层 `display` 非 none、预填 `新节点`、`focused: true`、
  浮层 `top` 与节点包围盒对齐（节点 box `[1107,626]`、浮层 box `[1081,626]`，同 y） / 通过。
- [通过] 有形状的节点设 id → 形状保留（`((圆))` → `id((圆))`）
  —— 步骤：属性面板「+ 添加子节点」子表单里「节点文本 = 圆」+「形状 = 圆 (( ))」→「添加」，
  得到源码 `          ((圆))`（用户自选圆形、无 id）；再在该节点「节点 ID」填 `CircleId` / 预期：
  `CircleId((圆))` 且圆形保留 / 实际：源码 `          CircleId((圆))`；画布该节点 SVG 仍含 `<circle>`
  （`shapes = circle,rect`，`circle` 包围盒 `[1138,633,30,30]`），形状选择器显示 `圆 (( ))` / 通过。
- [通过] 显示文本含空格保留：`User Input` → `UserNewInput[User Input]`；清空 id → 回落 `User Input`
  —— 步骤：面板「+ 添加子节点」子表单「节点文本 = User Input」+「形状 = 默认（无形状）」→「添加」
  → 源码 `            User Input`（空格保留、纯文本）；选中后「节点 ID」填 `UserNewInput` / 预期：
  `UserNewInput[User Input]`（不丢空格）/ 实际：源码 `            UserNewInput[User Input]`；
  再清空「节点 ID」+ Enter → 源码回落 `            User Input` / 通过。
- [通过] 非法 id（含空格 / 圆括号 / 方括号 / 花括号）→ 表单阻止提交、源码不落码 + 错误提示
  —— 步骤：逐次在「节点 ID」填 `Bad Id` / `Bad(Id)` / `Bad[Id]` / `Bad{Id}` + Enter / 预期：不落码 +
  提示 / 实际：**四例全部**源码不变（仍为 `User Input`，`src.indexOf('Bad') === -1`），输入框带
  `[invalid]` 属性，其 `.mantine-TextInput-error` 文案恒为
  `ID 不能包含空白、圆括号、方括号、花括号`；画布无 Alert / 通过。
- [通过] 两个不同节点用同一个 id → 允许、不报错
  —— 步骤：把 `User Input` 节点 id 设为 `dup`（`dup[User Input]`），再把 `新节点` 节点 id 也设为
  `dup` / 预期：允许 / 实际：源码同时含 `        dup[新节点]` 与 `            dup[User Input]`
  （`dup[` 出现 2 次），ID 字段无 `[invalid]`、无错误文案、`.mantine-Alert-root` 数量 0、画布正常
  渲染 / 通过。
- [通过] 撤销/重做覆盖 设 id / 清 id
  —— 步骤：连续两次「撤销」→ 连续两次「重做」；再对 `dup[User Input]` 清空 id，然后「撤销」/
  「重做」各一次 / 实际：设 id 链 `dup[新节点]` →（撤销）→ `NewId[新节点]` / `User Input`，
  重做链回到 `dup[新节点]` + `dup[User Input]`；清 id 链 `dup[User Input]` →（清空）→
  `User Input` →（撤销）→ `dup[User Input]` →（重做）→ `User Input`，全程源码文本可逆 / 通过。

**存疑点（如实记录实际观察，不下结论，供编排方裁定）**：对**用户自选形状**的节点先设 id 再清空 id，
形状**保留了**。

- 步骤：承上「圆」节点，源码 `((圆))`（用户自选圆形、无 id）→ 设 id `CircleId` → 再清空 id。
- 实际（源码）：`((圆))` → 设 id → `CircleId((圆))` → 清空 id → **`((圆))`**（**不是**回落成 `圆`）。
- 实际（画布外观）：清空前该节点为 `<circle>` 30×30（`circle` 包围盒 `[1138,633,30,30]`）；
  清空后仍是同一个 `<circle>`（`shapes = circle,rect`，`circle` 包围盒 `[1138,633,30,30]`）
  → **用户自选形状保留**。
- 对照：对**纯文本**节点（`User Input`）设 id 再清空，源码 `User Input` → `UserNewInput[User Input]`
  → 清空 → `User Input`（**完全回到纯文本**）—— 因为该方框是"分离必然引入的"、清除时一并去掉。
- 即实现取的是"保留用户自选形状、只去掉分离必然引入的方框"，与票面另一句"还原纯文本"的字面表述
  不一致；实际观察以本记录为准。

- 控制台：本节全流程（新建 mindmap + 右键加子节点 + 面板子表单加 3 个节点 + 设/清 id 约 8 次 +
  非法 id 4 次 + 撤销/重做 5 次 + 双击 + 多次点选）`playwright-cli console` 显示
  **Errors: 0 / Warnings: 0**。

- 本节汇总：7 条通过 / 0 条不通过 / 0 条无法验证；存疑点已如实记录（无新增失败单）。
