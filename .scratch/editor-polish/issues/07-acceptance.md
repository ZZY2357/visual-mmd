# 07 验收收尾

Status: resolved

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

### 06 class/sequence 节点右键（验收记录）

环境：dev server `http://localhost:5199/`，viewport 1600×1000，先 `localStorage.clear()` 再 reload。
全部右键 = 真实 `mousedown right` + `mouseup right`；菜单项 = 菜单浮层里的真实 `<button>`（菜单定位沿用 04：
`div` 且 `style.zIndex === '30'` 且 `style.minWidth === '140px'`）。源码证据取自
`localStorage['visual-mmd:library'].diagrams.at(-1).source`（与代码面板文本一致）。
**踩坑**：`getByRole('button', { name })` 会被属性面板里的同名按钮命中（strict mode 一直等待），
带「添加/删除」语义的菜单项一律改用菜单项包围盒中心真实点击。

- [不通过] class 图（非空，默认模板）右键**任何一个类**都弹不出节点菜单（弹出的是**空白菜单**）
  —— 步骤：「新建」→「类图」（默认模板）→ 对 4 个类框 `g.node` 与 1 个 note 的包围盒中心逐一真实右键
  / 预期：菜单 = `["添加成员","添加关系","删除类（含成员与关系）"]` / 实际：**5 次右键全部**得到
  `["添加类"]` —— 即 `blankMenuItems('class')`（`context-menu.ts:76-77`）的空白菜单，
  且每次 `[data-vm-selected]` 数量恒为 **0**（无任何选中）。旁证：对同一个类框做**左键**单击也不选中
  （`[data-vm-selected]` 仍为空、属性面板不回类表单）。
  DOM 证据：class 节点 id 形如 `mmd-preview-4-classId-BankAccount-4`，`g.node[data-id]` 数量 = **0**；
  整棵 class SVG 里带 `data-id` 的只有边（`id_BankAccount_Account_1` 等）。
  机制：`use-canvas-context-menu.ts:127` 的 `selectionFromEventTarget(e.target, resolver)` 解析不出节点
  → `selection === null` → `context-menu.ts:59` 返回 `{ kind: 'blank' }` → 落入空白菜单。
  即**不是"右键盘弹不出菜单"，而是"弹出的不是节点菜单"**；**受失败单 09 阻塞**（class 节点缺 `data-id`
  → 画布寻址失效，与 09 同一根因），**不另开单**。
  控制台：此路径 `Errors: 0 / Warnings: 0`。
- [无法验证] class「加成员 / 加关系落码正确（表单有起点/终点选择，默认值把右键那个类作为一端）」
  —— 节点菜单不可达（上一条），真实 UI 上无法进入 `AddMemberInlineForm` / `AddRelationInlineForm`，
  故无法验证；**不是"弹出了但落码不对"**。**受失败单 09 阻塞**。
- [无法验证] class「删除类 → 成员与相关 relation 级联消失，图仍可渲染」
  —— 同上：`delete-class` 菜单项不可达，无法在真实浏览器里构造该动作。**受失败单 09 阻塞**。
- [通过] sequence 图（非空，默认模板）：右键一个参与者 → 两项齐全
  —— 步骤：「新建」→「时序图」（默认模板 `actor 使用者` / `participant 系统 as Visual MMD` / …），
  真实右键参与者「使用者」（落点在 `g[data-id="使用者"]` 内，`elementFromPoint` 的
  `closest('[data-id]')` = `使用者`）/ 预期：`["添加消息","删除参与者"]` / 实际：菜单 =
  `["添加消息","删除参与者"]`（与 `context-menu.ts:107-108` 一致），同一次右键 `selectTarget` 命中
  两处 `[data-vm-selected]`。对参与者「系统」右键同样得到这两项 / 通过。
- [通过] sequence「加消息落码正确，`from`/`to` 预填为该参与者」
  —— 步骤 A（干净路径）：右键「系统」→ 点「添加消息」→ 表单「起点节点」= `Visual MMD`（隐藏 value = `系统`，
  即右键那个参与者）、「终点节点」= `使用者`（隐藏 value = `使用者`）、「消息样式」= `实线箭头`（`->>`）；
  填消息文本 `S2` → 点「添加」/ 预期：落码在 `participant 系统 as Visual MMD` 之后、`from`/`to` 与预填一致、
  结构树不重复 / 实际：源码新增 `    系统->>使用者: S2`（插在第 4 行该参与者声明之后、`S1` 之前），
  结构树 `参与者（2）`（`使用者` / `Visual MMD系统`），**控制台 0 error / 0 warning** / 通过。
  —— 步骤 B（已知形态，如实复现并引用既有失败单）：右键「使用者」（其声明 `actor 使用者` 在
  `participant 系统 as Visual MMD` **之前**）→「添加消息」→ 起点 = `使用者`、终点 = `Visual MMD`(`系统`)
  → 填 `M1` →「添加」/ 实际：源码 `    使用者->>系统: M1` 插在 `actor 使用者` 之后（对方声明**之前**），
  结构树 `参与者（3）`（`使用者` / `Visual MMD系统` / `系统`，重复），控制台 3 条
  `Encountered two children with the same key, 系统` —— 与
  `10-sequence-add-message-duplicate-participant.md` 逐条吻合（含手写源码对照），**不另开单**。
  两条路径的落码位置均"按锚点 = 右键参与者的声明"正确，重复只出现在 app 侧投影/结构树。
- [通过] sequence「删除参与者 → 其消息级联消失，图仍可渲染」
  —— 步骤：承步骤 B 的图，对参与者「系统」（被 `S1`/`S2`/`打开图表`/`activate`/`渲染预览`/`deactivate`/
  `修改属性`/`源码实时更新`/`Note` 及 loop 体内 1 条语句引用）真实右键 → 点「删除参与者」/
  预期：引用它的语句一并消失、图仍渲染 / 实际：上述 11 条语句全部消失；结构树 `参与者（1）`（只剩 `使用者`）、
  `消息（0）`、`注释（0）`；`.mantine-Alert-root` 数量 **0**（无错误态），画布仍有
  `svg[aria-roledescription="sequence"]`，内含 `使用者` 小人 + `loop` 框（已渲染）/ 通过。
  **观察（非清单项，如实记录）**：级联删除在源码里**残留空白行** —— 每条被删语句留下一行仅含原缩进的空白，
  实测源码 `sequenceDiagram\n    autonumber\n    actor 使用者\n    \n    \n    \n    \n    \n    \n    \n    \n
  \    \n    \n    loop 每次编辑\n        \n    end\n`（10 行 4 空格 + loop 体内 1 行 8 空格）。
  该残留不改变本条判定（消息确实级联消失、图仍渲染），仅记录。
- [通过] mindmap / flowchart 既有节点菜单不回归
  —— flowchart（默认模板）：真实右键节点 `A`（`data-id=A`）→ 菜单 =
  `["从这里连线","编辑文本","应用样式 ","删除"]`（`应用样式` 的 `textContent` 自带尾空格，如实记录），
  `[data-vm-selected]` 命中 1 处；再点「编辑文本」→ `.canvas-inline-edit` `display: block`、
  预填 `开始`、`document.activeElement` = 该 input → 动作链路未回归。
  mindmap（默认模板）：真实右键 `g[id$="-node_1"]`（`双面板同步`）→ 菜单 =
  `["添加子节点","编辑文本","删除"]`；点「添加子节点」→ 源码在 `双面板同步` 子级末尾追加 `      新节点`、
  内联浮层 `display: block` + 预填 `新节点` → 未回归。
- [通过（部分覆盖）] 新增落码走快照栈 → 撤销/重做可用
  —— 用工具栏真实「撤销 / 重做」按钮（非代码面板快捷键）：
  (a) 步骤 B 加 `M1` →「撤销」→ 源码回到无 `M1`、结构树回到 `参与者（2）`；「重做」→ `M1` 与重复参与者
  状态一并恢复（控制台重复 key 报错同步复现）；
  (b) 步骤 A 加 `S2` →「撤销」→ `S2` 消失；「重做」→ 恢复；
  (c) 删除参与者 →「撤销」→ 源码**逐字**回到删除前（含全部语句，含 loop 体）；「重做」→ 再回到删除后状态。
  **未覆盖**：class 的 add-member / add-relation / delete-class 因菜单不可达（受 09 阻塞）无法验证撤销/重做。
- 控制台汇总：
  - class 节点右键路径 = `Errors: 0 / Warnings: 0`；sequence「系统」路径加消息 = `Errors: 0 / Warnings: 0`。
  - sequence「使用者」路径加消息 = `Errors: 3`（`Encountered two children with the same key, 系统` ×3），
    属失败单 10，已引用。
  - **新观察（非 06 清单项，已做对照实验）**：删除参与者级联后源码剩**空 loop**（loop 体内唯一语句被删），
    该源码在画布上产出大量 React 属性校验 error（`Error: <line> attribute y2: Expected length, "NaN"`、
    `<circle> attribute cy`、`<text> attribute y/x`、`<polygon> attribute points`、`<tspan> attribute x` 等，
    一次渲染 51 条）。**对照实验**：不走本功能，直接在代码面板手写
    `sequenceDiagram\n    actor 使用者\n    loop 每次编辑\n    end\n` → 同样 51 条 error；该源码 reload 后
    零操作仍报错。归因：**mermaid 自身对空 loop 产出 NaN 坐标**，与本批改动无关，故不另开单，仅记录。
- 本节汇总：4 条通过（其中「撤销/重做」1 条为部分覆盖）/ 1 条不通过 / 2 条无法验证。
  不通过项 = class 节点右键菜单不可达，无法验证项 = class 加成员/加关系落码 与 删除类级联，
  **三项均属失败单 09 根因**（class 节点缺 `data-id`），故本节**未新建**任何 issue 文件。

### 07 回归（验收记录）

环境：dev server `http://localhost:5199/`，viewport 1600×1000，先 `localStorage.clear()` 再 reload。
操作全部走真实输入（`playwright-cli` 的真实鼠标 `mousemove/mousedown/mouseup`、真实键盘 `type/press`、
工具栏真实按钮）；**代码面板文本**统一取 `.cm-content .cm-line` 的 `textContent` 以 `\n` join
（实测该值与 `localStorage['visual-mmd:library']` 的 active 图表 `source` **逐字一致**，
`.cm-content` 的 `innerText` 会多一个行尾换行，故不采用）。导出内容用页面内钩子
（改写 `URL.createObjectURL` + `HTMLAnchorElement.prototype.click`）截获 Blob 后读原文，
并核对 playwright-cli 实际落盘文件大小。

**清单条目 1：代码面板 ↔ 画布双向同步 + 外部落码不被回声吞掉**

- [通过] 代码面板 → 画布：面板手改源码，画布随之更新
  —— 步骤：点代码面板 → `Control+a` → 键入 `flowchart LR\n    X[甲] --> Y[乙]\n` / 预期：画布出现
  甲、乙两个节点 / 实际：面板文本与源码**同时**变为 `flowchart LR\n    X[甲] --> Y[乙]\n    `
  （行尾 4 空格是 CodeMirror 在 `\n` 后的 mermaid 自动缩进，如实记录）；画布预览
  `svg#mmd-preview-16` 的 `textContent` 末尾 = `…trebuchet ms",verdana,arial,sans-serif;}甲乙` / 通过。
- [通过] 画布 → 代码面板：画布操作后代码面板立刻反映新源码
  —— 步骤：真实鼠标点选节点 `X`（包围盒中心 734,559）→ `Tab`（开出内联框，预填 `n1`）→ 键入
  `画布加的节点` → `Enter` / 预期：源码落码 + 面板同步 / 实际：源码 = 面板文本 =
  `flowchart LR\n    X[甲] --> Y[乙]\n    X --> n1\n    n1[画布加的节点]\n    `；画布
  `mmd-preview-18` 末尾含 `甲乙画布加的节点`；`[data-vm-selected] = ["n1"]` / 通过。
- [通过] 连续两次**外部落码**（不经面板打字）都被面板吸收（`b5c35d0` 修复的核心）
  —— 步骤：承上，焦点已在画布容器（`DIV[tabindex=0]`）→ 再 `Enter` + 键入 `同级别` + `Enter`
  / 预期：第二次外部落码同样回写到代码面板，不停在旧源码 / 实际：面板文本 =
  `flowchart LR\n    X[甲] --> Y[乙]\n    X --> n1\n    X --> n2\n    n2[同级别]\n    n1[画布加的节点]\n    `
  与源码逐字一致（旧实现在这里会把第二次外部同步吞掉）/ 通过。
- [通过] 「画布 → 面板 → 画布 → 面板 → 画布 → 面板」交替 3 轮后两边仍一致
  —— 步骤与逐轮证据（每轮结束都读一次 `panel === source`）：
  第 1 轮 面板写 `flowchart LR\n    X[甲] --> Y[乙]`（画布 `mmd-preview-16` 末尾 `甲乙`）；
  第 2 轮 画布加 `n1[画布加的节点]`（面板同步）；第 3 轮 面板写 `flowchart TD\n    M[三] --> N[四]`
  （画布 `mmd-preview-33` 末尾 `三四`）；第 4 轮 画布加 `n1[c2节点]`（`mmd-preview-35`）；
  第 5 轮 面板写 `flowchart LR\n    P[五] --> Q[六]`（`mmd-preview-48`）；第 6 轮 画布加
  `n1[c3节点]`（`mmd-preview-50`）。六次 `panel === source` 全部 true，`.mantine-Alert-root` 恒为 0
  —— 面板未出现"停在旧源码"、也未出现回声交替吞掉 / 通过。
  控制台：本节（含 4 次面板整体改写 + 4 次画布落码）`playwright-cli console error` =
  **Errors: 0 / Warnings: 0**。

**清单条目 2：撤销/重做覆盖本批全部新动作**

- [通过] 清除主题（选「跟随」）可撤销、可重做
  —— 步骤：结构树点「图表LR」回到图表级 → 主题下拉选「森林（forest）」→ 再选「跟随 Mermaid 默认
  （不设置主题）」→ 工具栏「撤销」→「重做」/ 预期：清除动作可逆 / 实际：选 forest 后源码首部为
  `---\nconfig:\n  theme: forest\n---\n`；选「跟随」后该 frontmatter 整块消失、面板同步、选择器回显
  「跟随 Mermaid 默认（不设置主题）」；「撤销」→ 源码重新出现 `---\nconfig:\n  theme: forest\n---\n`
  且选择器回显 `森林（forest）`；「重做」→ 再次清除、选择器回「跟随…」/ 通过。
- [通过] 设 / 清 mindmap 节点 id 可撤销、可重做
  —— 步骤：「新建」→「思维导图」→ 真实鼠标点选 `g[id$="-node_1"]`（`双面板同步`）→ 面板「节点 ID」
  填 `UbId` + Enter → 撤销 → 重做；再清空 id + Enter → 撤销 → 重做 / 实际（源码逐字）：
  `    双面板同步` →（设 id）→ `    UbId[双面板同步]` →（撤销）→ `    双面板同步` →（重做）→
  `    UbId[双面板同步]` →（清 id）→ `    双面板同步` →（撤销）→ `    UbId[双面板同步]` →
  （重做）→ `    双面板同步`，全程 `panel === source` / 通过。
- [通过] 方向键移动选中后再加节点（Tab/Enter）可撤销、可重做
  —— 步骤：flowchart `flowchart LR\n    P[五] --> Q[六]\n    P --> n1\n    n1[c3节点]`、选中 `n1`
  → 按 `ArrowLeft`（选中移到 `Q`，`[data-vm-selected] = ["Q"]`，方向键语义见 03 节）→
  `Tab` 开出内联框（预填 `n2`）→ 键入 `方向键后加节点` → `Enter` → 工具栏「撤销」×N →「重做」×N
  / 预期：这串新动作全部进快照栈 / 实际：落码后源码 = `…\n    Q --> n2\n    n2[方向键后加节点]\n…`；
  连续「撤销」6 次逐步退回（`n2[方向键后加节点]` → `n2[n2]` → 去掉 `Q --> n2` → 去掉 `n2[n2]`
  → `n1[c3节点]`→`n1[n1]` → 去掉 `P --> n1` → `flowchart LR\n    P[五] --> Q[六]`，六次每次源码都变），
  「重做」6 次逐字回到含 `n2[方向键后加节点]` 的状态（此时「重做」按钮 `disabled = true`）/
  通过。**注**：一次"加节点 + 命名"会落成 2 个快照（先结构后文本），故一次用户流程需要两次撤销，
  如实记录。
- 控制台：本节（主题切换 + 下拉选择 4 次 + 面板填表 4 次 + 撤销/重做 18 次）Errors: 0 / Warnings: 0。

**清单条目 3：导入/导出 `.mmd` / SVG / PNG，不受视图影响；切图表重置视图**

- [通过] 导出 `.mmd` 的内容与代码面板逐字一致
  —— 步骤：当前图为「思维导图」（源码首部 `---\nconfig:\n  theme: neo-dark\n---\n`）→ 点「导出」→
  「导出为 .mmd」→ 读截获的 Blob / 预期：`text === 代码面板文本` / 实际：
  `(await blob.text()) === __panel()` **true**，且 `=== localStorage source` **true**
  （256 字符 / 358 字节 UTF-8）；playwright-cli 落盘 `.playwright-cli/思维导图.mmd`
  大小 **358 字节** = Blob 大小 / 通过。
- [通过] 导出 SVG / PNG 成功（内容/格式可用）
  —— 实际：`.svg` Blob `type=image/svg+xml;charset=utf-8`、**46898 字节**，首部
  `<svg id="mmd-preview-91" width="100%" xmlns="http://www.w3.org/2000/svg" class="mindmapDiagram" style=…`，
  落盘 `.playwright-cli/思维导图.svg`；`.png` Blob `type=image/png`、**16134 字节**，
  前 8 字节 = `137,80,78,71,13,10,26,10`（PNG magic），IHDR 尺寸 **200×1150**（= SVG 原始尺寸 ×2
  的 2x 光栅化），落盘 `.playwright-cli/思维导图.png` / 通过。
- [通过] 导出**不受画布视图（缩放/平移）影响**（逐字节对照）
  —— 步骤：记录预览 `svg#mmd-preview-91` 的 transform 与 id → 导出 SVG/PNG（基线）→
  在画布上真实拖拽平移 + 两次滚轮缩放（transform 变为
  `translate(390.381px, -880.647px) scale(2.31606)`，基线是
  `translate(95.1964px, -704.894px) scale(2.14871)`）→ 再导出 SVG/PNG / 预期：两份产物逐字节相同 /
  实际：SVG **46898 == 46898 字节且逐字节相同**、PNG **16134 == 16134 字节且逐字节相同**；
  两次导出之间预览 `svg` id 恒为 `mmd-preview-91`（**证明期间未发生重渲染**，排除了
  "mermaid 每次渲染换 id" 的干扰因素）/ 通过。
  **踩坑记录**：首次对照（`mmd-preview-90` vs `-91`）出现大小不同（45203 / 46898），定位为
  中途源码被误改导致预览重渲染（非视图原因）；改用"确认 id 不变再比字节"的方式重做后方为上述结论。
- [通过] 图表库**切换图表时视图重置为 fit**
  —— 步骤：把 mindmap 放大 + 平移（transform 为
  `translate(-467.375px, -10.0999px) scale(1.74223)`）→ 打开「图表库」抽屉 → 点「打开图表 流程图」
  → 读新预览 / 预期：新图回到 fit（缩放/平移不复存在）/ 实际：新预览 `mmd-preview-95` 的 transform =
  `translate(118px, 351.5px) scale(1)`，且**正好居中**（容器 788×849、svg 552×146 →
  `(788-552)/2 = 118`、`(849-146)/2 = 351.5` 与实测逐值吻合）；再点「打开图表 思维导图」→
  `mmd-preview-96` transform = `translate(24px, 187.873px) scale(0.822969)`，同样居中
  （`(788-740)/2 = 24`、`(849-473)/2 = 188`）/ 通过。
- [通过] 导入 `.mmd`（往返）
  —— 步骤：把导出的 .mmd 另存为 `import-check.mmd`（内容 `flowchart TD\n    IMPORT[导入验证] --> OK[成功]\n`）
  → 对隐藏 `input[type=file]` 真实 `setInputFiles` / 预期：文件内容原样成为当前源码 / 实际：面板文本 =
  `flowchart TD\n    IMPORT[导入验证] --> OK[成功]\n`（含文件末尾换行）与源码逐字一致，画布
  `mmd-preview-97` 渲染出 `导入验证成功`；工具栏「撤销」回到导入前源码 / 通过。
- **踩坑记录（非清单项）**：「图表库」抽屉点选图表后**不会自动关闭**，其 `mantine-Drawer-overlay`
  继续拦截点击（实测 `撤销` 按钮的点击被 overlay 拦截并 500ms 重试），需 `Escape` 关闭；
  另 `getByRole('button', { name: '导出' })` 是 strict-mode 歧义（还命中代码面板标题旁的
  「导出 mmd / svg / png」文本按钮），必须 `exact: true`。两条都只影响自动化脚本，不判通过/不通过。

**清单条目 4：11 个主题下选中态可见**

- [通过] 11 个主题逐个切换，选中态（高亮）在画布上均实际生效
  —— 步骤：mindmap 上真实鼠标点选 `g[id$="-node_1"]`（保持选中），依次在下拉里选 11 个主题，
  每次读 `[data-vm-selected]` 命中的元素与 `getComputedStyle(el).filter` / 预期：每个主题下都有
  可见的选中高亮 / 实际：11 个主题
  （经典 `default`、中性 `neutral`、暗色 `dark`、森林 `forest`、基础 `base`、Redux 彩色 `redux-color`、
  Redux 暗色 `redux-dark-color`、Redux `redux`、Redux 暗色 `redux-dark`、新派 `neo`、新派暗色 `neo-dark`）
  **全部**命中 1~2 个 `[data-vm-selected]` 元素，其 computed `filter` 恒为
  `drop-shadow(rgb(34, 139, 230) 0px 0px 4px)`（即 `src/index.css:19-21` 的 `[data-vm-selected]` 规则，
  `--mantine-color-blue-6 = #228be6` 已解析）；命中元素包围盒非空（随主题字形为 93x26 / 87x44 / 91x26），
  说明高亮落在真实渲染出来的节点上。
  **如实说明**：票面写"外圈描边高亮"，实现是 `filter: drop-shadow(...)` 光晕（非描边），
  视觉上仍是围绕节点的一圈蓝色光晕。
  11 轮换主题期间 `playwright-cli console error` = Errors 0（该段未新增任何 error）/ 通过。

**清单条目 5：窄屏布局不破**

- [通过] 视口 480×900 下按设计只显示画布，且无破版
  —— 步骤：`resize 480 900` / 预期：只显示画布 / 实际：`.cm-editor` 不在 DOM
  （`document.querySelector('.cm-editor') === null`）、属性面板
  `[aria-label="结构与属性面板"]` 不在 DOM，`svg[id^="mmd-preview"]` 在；
  `documentElement.scrollWidth === clientWidth === 480`（**无横向溢出**）、`body.scrollWidth = 480`、
  `main` 无溢出、`main` = 480×900；截图
  `C:\Users\zzy2357\AppData\Local\Temp\vmmd-verify\narrow-480.png`（只见头部 + 画布，无面板残留）。
  回到 1000×900 与 1600×1000 时两面板都回来且 `scrollWidth - clientWidth = 0` / 通过。

**清单条目 6：`npm test` / `npm run typecheck` 全绿**

- [通过] 本节自行复跑（编排方结论一致）
  —— 实际：`npm test` → `Test Files 43 passed (43)`、`Tests 519 passed (519)`、exit code **0**
  （日志 `Duration 4.13s`）；`npm run typecheck`（`tsc -b --noEmit`）**无输出、exit code 0** / 通过。

**题外确认（前一节 06 的新观察）：UI 级联删除后源码是否残留空 `loop`/`alt` 块**

- [不通过] **是 app 侧级联删除留下的空块**（不是只有手写源码才会出现）—— 已开失败单
  `11-cascade-delete-leaves-empty-block.md`
  —— 步骤 A：`localStorage.clear()` + reload →「新建」→「时序图」（默认模板末尾
  `loop 每次编辑` + 块体内 1 条语句）→ 在画布上对参与者「系统」真实右键 → 点「删除参与者」/ 预期：
  级联删掉语句、不留空块 / 实际：源码变为
  `sequenceDiagram\n    autonumber\n    actor 使用者\n    \n    \n    \n    \n    \n    \n    \n    \n    loop 每次编辑\n        \n    end\n`
  —— `loop 每次编辑` 与 `end` 之间**没有任何语句**（块体为空），另有 8 行"只有 4 个空格"的空白行；
  该源码在画布上新增 **51 条** console error（`<line> attribute y1/y2: Expected length, "NaN"`、
  `<circle> attribute cy`、`<text> attribute x/y`、`<tspan> attribute x` 等），删除前该时点
  Errors = 0；`.mantine-Alert-root = 0`（语法合法，畸形点是"空块"结构）。
  步骤 B（换 `alt` 验证不是 loop 特有）：代码面板改写为
  `sequenceDiagram\nactor A\nparticipant B as Bee\nalt 条件一\nA->>B: hi\nend` → 对参与者 `B`
  真实右键 →「删除参与者」/ 实际：源码变为 `sequenceDiagram\nactor A\n\nalt 条件一\n\nend`
  —— `alt` 块体为空，再新增 **47 条**同型 NaN error（该时点
  `Total messages: 102 (Errors: 98, Warnings: 0)`，98 条全部是 NaN 属性）。
  对照：手写空块同样报同型 error（沿用 06 节结论 + reload 后加载本单产出的含空 `alt` 存档、
  零操作再报约 50 条），说明 NaN 渲染属 mermaid 行为，**但空块是 app 制造的**，故开单。

**题外观察（非清单条目）：画布「适应窗口」按钮对鼠标不可用，键盘触发会误改源码**

- [不通过] 真实鼠标点击「适应窗口」**完全无反应**（视图不变）；把焦点放到该按钮再按 `Enter`
  虽能复位视图，**却同时往源码里插入一个 `新节点`** —— 已开失败单
  `12-fit-view-button-pointer-capture-hijack.md`
  —— 步骤：flowchart 上滚轮放大到 `scale(2.02418)` → 真实鼠标点「适应窗口」按钮中心 / 预期：回到 fit /
  实际：transform 点击前后**逐字相同**（`translate(-618.089px, -70.8216px) scale(2.02418)`）；
  捕获阶段监听显示 `pointerdown` 落在按钮内的 `SPAN`（文本「适应窗口」），但随后的 `click` 目标是
  **画布容器 `DIV`**，按钮 `onClick` 从未执行（背景拖拽的 `setPointerCapture` 劫持了 click；
  `CanvasPanel.tsx` 现有守卫只覆盖菜单/两种表单浮层）。键盘路径：`focus()` 到按钮后
  `document.activeElement` 确为该 `<button>`，按 `Enter` 后 transform 变为居中 fit 值
  `translate(24px, 190.079px) scale(0.873601)`，**同时源码新增 `    新节点`**（计数 0 → 1），
  重复一次变 2（`use-canvas-keyboard.ts` 的 `FOCUS_EXCLUDE_SELECTOR` 不含 `button`，按键冒泡被当画布操作）。
  **归类**：非本批改动引入（该按钮与指针捕获同属工单 03），但真实浏览器上鼠标不可用，故开单。

- 控制台汇总（本节全流程）：新建 5 张图（含时序/思维导图/流程图）+ 面板整体改写 5 次 +
  画布落码 4 次 + 主题切换 11 次 + 撤销/重做 18 次 + 导出 9 次 + 导入 1 次 + 缩放/平移/切图 →
  **级联删除之前** `playwright-cli console error` = `Errors: 0 / Warnings: 0`（含 11 主题轮询、
  全部导出/导入、"重复 key"之类旧报错均**未复现**）。
  仅在「UI 级联删除留下空块」路径出现 error：空 `loop` +51 条、空 `alt` +47 条
  （该时点 `Total messages: 102 (Errors: 98, Warnings: 0)`，98 条全部是 mermaid 的
  `attribute …: Expected length, "NaN"`），reload 加载该存档再 +50 条 —— 已在失败单 11 记录。
- 本节汇总：清单 6 条（拆成 14 项子检查，含 4 条"逐字节/逐项对照"）**全部通过** /
  题外发现 **2 条不通过**（空 `loop`/`alt` 级联残留 → 单 11；适应窗口按钮 → 单 12）/
  0 条无法验证。**未修改任何源码**（`git status` 干净）。
  证据文件：`C:\Users\zzy2357\AppData\Local\Temp\vmmd-verify\narrow-480.png`；
  导出产物 `.playwright-cli/思维导图.mmd|svg|png`（358 / 46898 / 16134 字节）。

### 收尾

以上 01-07 七节均为**真实浏览器实测**记录（证据含源码文本、DOM 片段、字节级导出对照、截图）。
**7 节全部执行完毕，验收过程未改动任何源码。**

验收发现 **5 条不通过**，已各开一张失败单（均 `Status: needs-triage`，按票面要求未在本票改需求）：

| 单 | 标题 | 影响面 |
|---|---|---|
| [08](08-theme-toplevel-key-not-cleared.md) | 顶层 `theme:` 行（config 块之外）不回显也不被清除 | 口径张力：需先裁定"顶层 theme 是否算受支持写法" |
| [09](09-class-inline-edit-target-unresolved.md) | class 节点缺 `data-id` → class 的画布点选 / 内联编辑 / 节点右键菜单全不可用 | **功能性缺口**；06 节的 1 条不通过 + 2 条无法验证都归因于此 |
| [10](10-sequence-add-message-duplicate-participant.md) | sequence 隐式参与者未按 actorId 合并 → 结构树重复参与者 + React 重复 key | 功能性 bug，根因在投影层 |
| [11](11-cascade-delete-leaves-empty-block.md) | 「删除参与者」级联后残留空 `loop`/`alt` 块，mermaid 侧产出成批 NaN 属性 error | 功能性 bug |
| [12](12-fit-view-button-pointer-capture-hijack.md) | 「适应窗口」按钮真实鼠标点击被背景拖拽的指针捕获劫持；键盘 Enter 触发又误加节点 | 交互 bug |

另有 **1 处口径张力**（未开单，记录在 05 节）：对**用户自选形状**的 mindmap 节点先设 id 再清空 id，
实现**保留**了自选形状（`((圆))` → `CircleId((圆))` → `((圆))`），而票面另一句写"还原纯文本"；
纯文本节点被分离引入的方框则会一并去掉。需裁定取哪种口径。

回归基线：`npm test` 43 files / 519 tests 全绿；`npm run typecheck` 无输出。

### 修复波复验（2026-09-29）

5 条失败单已全部处理（08/09/10/11 修复提交 + 12 修复提交），合并到 `main` 后**在真实浏览器（dev :5207）
逐条复验通过**，并在合并树上复跑测试：

| 单 | 结论 | 复验证据（合并后真机） |
|---|---|---|
| 08 | resolved（口径裁定，**无行为改动**） | 顶层 `theme:` 视为无效文本：不识别/不清除/不加告警，选「跟随」时逐字保留；裁定前提（mermaid 静默忽略顶层 theme）由源码 + 计算样式实测双重确认；补 5 条钉住测试 |
| 09 | resolved | class `g.node` 反注 `data-id` 后：左键点选 → `[data-vm-selected]` 恰 1 处、面板切到该类表单；右键 → 节点菜单 `添加成员/添加关系/删除类`；空类图空白右键加类后 `.canvas-inline-edit` 可交互；控制台 0 error |
| 10 | resolved | 原作弊源码（消息先于声明）结构树 = **参与者（2）**、无重复；控制台 0 条 `Encountered two children with the same key`；UI 路径（右键 使用者 → 添加消息）产出同样的"消息在前"形态，仍为 2 个参与者 |
| 11 | resolved | 默认模板删 `系统` → `loop 每次编辑…end` **整块移除**、无空块、0 条 NaN error（原 +51）；`alt` 用例同样整块移除、0 条（原 +47）；未引用语句（`autonumber` / `actor 使用者` / `A->>A: self`）逐字保留 |
| 12 | resolved | 真鼠标点「适应窗口」→ 派生 `click` 落在 `SPAN:适应窗口`（不再被劫持到容器 DIV），transform `scale(2.44552)` → 居中 `scale(0.994275)`；按钮聚焦后 Enter 只 fit、源码逐字不变（原每按一次加一个节点） |

口径张力（05 节那条，无需开单）已由用户裁定：**保留用户自选形状、只丢分离引入的方框**
（`User Input` → `UserNewInput[User Input]` → 清 id → `User Input`；`myid(圆角)` → `(圆角)`）。
已记入 ADR-0009 与 `spec.md` 的「验收后裁定」小节；行为由 `mindmap.test.ts` 4 条测试钉住。

合并树基线：`npm test` **44 files / 568 tests 全绿**；`npm run typecheck` 退出码 0。

**修复波复验时新发现 1 条缺陷（不在原 5 条内）**，已开单：[13](13-sequence-note-left-right-of-actors-unparsed.md)
—— `Note left of X` / `Note right of X` 的参与者解析不出来（`actors === null`），导致
（a）删除参与者时该 note 漏删、被删参与者又被 mermaid 隐式复现（画布上没删掉）；
（b）只在 note 里出现的参与者投影/画布背离。`Status: needs-triage`，待裁决是否本轮修。


