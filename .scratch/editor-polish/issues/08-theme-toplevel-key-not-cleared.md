# 08 顶层 theme 行（config 块之外）不回显也不被清除

Status: needs-triage

来源：工单 07 手工验收「01 主题」第 4、5 条。**这是口径张力，不是已确认的缺陷**，需人工裁决：
工单 01 / 07 的文字写作「手写 `theme: redux-color` → 选择器回显 `redux-color`」、
「选『跟随』：主题键被清除干净（三种形态：只有 theme 行 / config 下还有别的项 / frontmatter 只有
config）」，但都没写清「只有 theme 行」指的是**顶层 `theme:` 行**还是**config 块下的 theme 行**。
按 config 写法验收全部通过；按顶层写法验收不通过（见下）。实现与 mermaid v12 的行为自洽，
所以不排除只是票面文字过宽，请裁决是改票面还是改实现。

## 需求

复现步骤：

1. 打开 `http://localhost:5199/`（先清空 localStorage 再 reload），「新建」→「流程图」。
2. 在左侧代码面板（CodeMirror）用键盘把源码整体替换为：
   `---\ntheme: forest\n---\nflowchart TD\n    A --> B\n`
3. 读属性面板顶部的主题选择器与画布外观。
4. 打开主题下拉，选中第一项「跟随 Mermaid 默认（不设置主题）」，再读源码。

预期：

- 若「手写 theme」含顶层写法：第 3 步选择器应回显 `forest`（或至少给出无效提示）；
  第 4 步应把 `theme:` 键清除干净（连带悬空结构）。
- 若「手写 theme」只指 config 写法：本单可关为 wontfix，并请在票面文字里写明「config 块下」。

实测实际行为：

- 第 3 步：选择器显示 `跟随 Mermaid 默认（不设置主题）`（`__follow__`），**不回显 `forest`、也无
  无效主题提示**。画布仍按图表默认 redux-color 渲染（首节点
  `fill=rgb(255,255,255)`、`stroke=rgb(40,37,61)`），说明 **mermaid v12 自身也忽略顶层 `theme:`**。
- 第 4 步：源码逐字不变，`---\ntheme: forest\n---` 仍在。

证据：

- 现象：`[...document.querySelectorAll('input')].find(x=>x.getAttribute('aria-label')==='选择图表主题').value`
  → `跟随 Mermaid 默认（不设置主题）`；`localStorage['visual-mmd:library'].diagrams.at(-1).source`
  → `---\ntheme: forest\n---\nflowchart TD\n    A --> B\n`（选中「跟随」后仍是这一串）。
- 代码口径：`src/lib/pipeline/frontmatter.ts:127-137` `readTheme` 必须先 `findConfigLine` 命中
  顶层 `config:` 才继续找缩进的 theme 行，顶层 `theme:` 一律返回 `null`；
  `frontmatter.ts:154` `if (configIdx === -1) return source` —— 清除分支在没有 `config:` 时直接
  返回原文，所以顶层 `theme:` 行不会被删。
- 对照：config 写法的三种悬空形态（只有 theme 行 / config 下还有别的项 / frontmatter 只有 config）
  在 07 验收里**全部通过**，含手写 config 项逐字保留。

## Comments

（空）
