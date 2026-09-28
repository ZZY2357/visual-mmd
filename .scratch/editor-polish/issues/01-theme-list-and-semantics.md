# 01 主题清单与语义

Status: needs-triage

## 需求

- 主题列表从 5 个扩到 mermaid 12 的 **11 个**：`base, dark, default, forest, neutral, neo, neo-dark,
  redux, redux-dark, redux-color, redux-dark-color`；并在列表**最前**加一项「跟随 Mermaid 默认
  （不设置主题）」，其值为 null/空。
- 「不设置」与 `default` 必须可区分：`default` 的文案改为「经典（default）」。
- 选「跟随」= 把源码里的主题键**清除干净**：删 `theme:` 行 → 若 `config:` 下再无其它有效子项
  （忽略空行与 `#` 注释）则连 `config:` 行一起删 → 若 frontmatter 因此变空则连整个 frontmatter
  块一起删（回到"无 frontmatter"）。用户手写的其它 config 项（如 `themeVariables:`）必须逐字保留。
- `readTheme` 改为返回源码里的**原始字符串**（不再用白名单吞掉）；选择器回显原文。
  完全没有 theme 键时显示「跟随」项。
- 手写非法主题值（如 `theme: solarized`）时回显原文，并提示"无效主题，已按 Mermaid 默认渲染"
  （mermaid 对无法识别的主题是静默忽略，不报错，见 spec 背景事实）。
- 撤销/重做覆盖以上全部操作（走既有快照栈）。

## 落码位置

- `src/lib/pipeline/frontmatter.ts`：`MermaidTheme` 类型、`MERMAID_THEMES`、`isMermaidTheme`、
  `readTheme` 签名（`string | null`）、`applySetTheme` 增加"清除"分支。
- `src/store/editor.ts:182-190`：`set-theme` 意图接受清除（`null`）。
- `src/components/ThemePicker.tsx`：选项、回显、非法值提示、`current ?? 'default'` 的兜底逻辑要改。
- `src/i18n/index.ts:130-136`：主题文案表。

文案（最终）：

| 值 | 文案 |
|---|---|
| （不设置） | 跟随 Mermaid 默认（不设置主题） |
| default | 经典（default） |
| neutral | 中性（neutral） |
| dark | 暗色（dark） |
| forest | 森林（forest） |
| base | 基础（base） |
| redux-color | Redux 彩色（redux-color） |
| redux-dark-color | Redux 暗色（redux-dark-color） |
| redux | Redux（redux） |
| redux-dark | Redux 暗色（redux-dark） |
| neo | 新派（neo） |
| neo-dark | 新派暗色（neo-dark） |

非法值提示文案新 key，例如 `app:propertyPanel.themeInvalid`。

## 验收

- 下拉含 12 项（跟随 + 11 主题）。
- 新建 flowchart（无 frontmatter）显示「跟随」；此时**类图外观是 redux-color、mindmap 是 classic**
  —— 这是预期，不是 bug（见 spec 背景事实）。
- 选「经典（default）」→ 源码写入 frontmatter，类图外观从 redux-color 变为 classic。
- 选「跟随」→ 主题键被清除；三种悬空形态（孤 `theme:` 行 / 空 `config:` / 空 frontmatter）都被清干净；
  用户手写的其它 config 项逐字保留。
- 手写 `theme: redux-color` → 选择器回显 `redux-color`（不再显示"默认"）。
- 手写 `theme: solarized` → 回显原文 + 无效提示。
- 撤销/重做逐项可用。

## 测试

- `frontmatter` 单测：11 主题往返；清除的三种悬空形态；手写 config 项保留；非法值回显。
- `store/__tests__/theme.test.ts`：清除意图；`isMermaidTheme` 白名单扩到 11 后 `'solarized'` 仍应被拒。
- `frontmatter.test.ts` 里循环 5 主题的金样 parse 测试改为循环 11 主题（钉住 11 个名字在 mermaid v12
  都能 parse）。

## Comments

（空）
