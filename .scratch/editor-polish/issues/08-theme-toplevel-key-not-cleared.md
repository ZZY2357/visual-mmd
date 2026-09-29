# 08 顶层 theme 行（config 块之外）不回显也不被清除

Status: resolved

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

### 裁定（用户 2026-09-29 确认）：顶层 `theme:` 行视为无效文本

mermaid frontmatter 的合法主题写法只有 `config.theme`；顶层 `theme:` 不是受支持的直接键，
属用户误写。据此：

- **不识别**：`readTheme` 对只有顶层 `theme:` 的源码仍返回 `null`（选择器照旧显示
  「跟随 Mermaid 默认」）。
- **不清除**：选「跟随」时该行**逐字保留** —— 它属于「未被编辑触碰的文本」，
  受 ADR-0004 / ADR-0008 的逐字保留承诺保护。
- **不加 UI 提示**：不为此新增「无效写法」告警，保持简单。

因此本单**不是缺陷，是票面文字过宽**（原「只有 theme 行」应读作「`config` 块下的 theme 行」）；
按本裁定落地口径与测试，不改实现行为。

### 证据 1：mermaid 12 的取值路径（源码）

`node_modules/mermaid/dist/mermaid.esm.mjs`（`src/diagram-api/frontmatter.ts` 编译产物）
的 `extractFrontMatter` 解析 YAML 后**只取三个键**：

```js
if (parsed.displayMode) metadata.displayMode = parsed.displayMode.toString();
if (parsed.title)       metadata.title       = parsed.title.toString();
if (parsed.config)      metadata.config      = parsed.config;   // ← 只有 config 键进入 metadata
```

随后 `processFrontmatter` 里 `const { displayMode, title, config = {} } = metadata;` —— 顶层
`theme:`（YAML 顶层键）解析出来了却**从未被读取**，`parsed.config` 为 undefined 时 config 直接
取默认空对象，故对最终配置零影响。类型定义也一致：
`node_modules/mermaid/dist/diagram-api/frontmatter.d.ts` 的 `FrontMatterMetadata` 只有
`title? / displayMode? / config?` 三个字段。

### 证据 2：浏览器实测（playwright，dev server :5299，类图 `classDiagram / class Animal / Animal : +int age`）

种子写入 `localStorage['visual-mmd:library']` 后 reload，读 `svg g.node path` 的计算样式：

| 用例 | 源码 frontmatter | 节点 fill / stroke | 主题选择器 |
| --- | --- | --- | --- |
| A 基线 | 无 | `rgb(253,244,255)` / `rgb(232,121,249)` | 跟随 Mermaid 默认（不设置主题） |
| **B 顶层** | `theme: default` | **`rgb(253,244,255)` / `rgb(232,121,249)`（与 A 逐位相同）** | **跟随 Mermaid 默认** |
| C config | `config:\n  theme: default` | `rgb(236,236,255)` / `rgb(147,112,219)`（与 A 不同） | 经典（default） |
| **D 顶层** | `theme: forest` | **`rgb(253,244,255)` / `rgb(232,121,249)`（与 A 逐位相同）** | **跟随 Mermaid 默认** |
| E config | `config:\n  theme: forest` | `rgb(205,228,152)`（变绿，森林生效） | 森林（forest） |

B/D 与基线 A 逐位相同 → **顶层 `theme:` 确实被 mermaid 静默忽略**；C/E 证明同一主题名写在
`config:` 下会生效。裁定前提成立，未与实测冲突。

### 证据 3：UI 端到端（源码 `---\ntheme: forest\n---\nclassDiagram\n...`）

1. 初始：选择器「跟随 Mermaid 默认」，节点 fill `rgb(253,244,255)`（未受影响）。
2. 选「森林（forest）」→ 源码变为
   `---\ntheme: forest\nconfig:\n  theme: forest\n---\n...`（**顶层行逐字保留**，config 块追加其后），
   节点变绿 `rgb(205,228,152)`。
3. 再选「跟随」→ 源码回到 `---\ntheme: forest\n---\n...`（**顶层行仍在，只删了悬空的 config 块**），
   节点色回到 `rgb(253,244,255)`。

### 落地

- `src/lib/pipeline/frontmatter.ts`：`readTheme` 的文档注释补**一行**说明「只识别 `config.theme`，
  顶层 `theme:` 视为无效文本」；**无行为改动**。
- `src/lib/pipeline/__tests__/frontmatter.test.ts`：新增 `describe('顶层 `theme:` 视为无效文本（工单 08 口径）')`，
  5 个用例钉住：
  1. 只有顶层 `theme:`（无 `config`）→ `readTheme` 返回 `null`；
  2. `applySetTheme(src, null)` → 源码恒等（逐字保留，含多余空格的 `theme:  forest  `）；
  3. `applySetTheme(src, 'dark')` → 无 config 时在顶层行**之后**追加 `config:\n  theme: dark`；
     已有 `config.theme` 时只改写 config 下那一行；两种情形顶层行均逐字保留；
  4. 顶层与 `config.theme` 并存 → `readTheme` 取 **`config.theme`**（顶层被忽略）；
  5. 并存时清除 → 只删 `config.theme`（config 下再无有效子项则连 `config:` 行一起删），
     顶层行逐字保留、frontmatter 因顶层行仍有效而保留。

`applySetTheme` 三种组合的实际行为（已按实际实现钉住，未改行为）：

| 输入 | `theme = null`（跟随） | `theme = 'dark'` |
| --- | --- | --- |
| 只有顶层 `theme: forest` | 原文恒等，顶层行保留 | 追加 `config:\n  theme: dark`（在顶层行之后） |
| 只有 `config.theme` | 删 config.theme（连带悬空 config/frontmatter） | 改写 config 下那一行 |
| 顶层 + `config.theme` 并存 | 只删 config.theme（连带悬空 config），顶层行保留 | 改写 config 下那一行，顶层行保留 |

验证：`npm test` → 43 个文件 / **524 条全过**（519 既有 + 5 新增）；`npm run typecheck` → 退出码 0。
