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
