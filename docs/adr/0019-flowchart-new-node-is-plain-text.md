# flowchart 新建节点默认纯文本：不生成机器 id，分离只在用户显式设置时发生

> **状态：accepted**（2026-10-07，用户裁定）

## 背景

ADR-0009 已为 mindmap 定下模型：节点 id 是可选语法，新建节点一律落纯文本，id 与显示文本
是同一个串，只有用户在属性面板显式填入 ID 时才改写成 `id[显示文本]` 的分裂形式。但
flowchart（默认图种）没有对齐：

- Tab / Enter / 右键空白新建节点用 `nextNodeId` 生成 `n1`、`n2`、`n3` 机器 id 并落 `n1[n1]`；
- 双击内联编辑纯文本（裸词）节点时，`set-node-text` 会强制套上方框并保留旧词当 id
  （`旧词[新文本]`）——用户只是改了文本，id 和显示文本却被擅自分离。

## 决策

flowchart 对齐 ADR-0009 模型（显示文本与语法标识默认是同一个串；两者分离只在用户显式
指定时发生）：

1. **新建 = 纯文本占位**：Tab / Enter / 右键空白新建节点落裸词行（`add-node` 的
   `shape: null`），占位串「新节点」按 `nextFreeName` 避重（`新节点2`……），不生成机器 id。
   占位串由 `domain-strings.newNodePlaceholderId()` 提供（en 为无空格的 `NewNode`——
   裸词受 id 字符集约束，与 `newElementName('node')` 的显示名是两个概念）。
2. **内联编辑纯文本节点 = 改语法 id**：新文本是合法裸词时，全部出现处（含连线端点）
   重写为同一裸词，纯文本形式保持；含空格等裸词不可能的文本才回落「旧词保留为 id +
   方框承接文本」——这是语法必然（mermaid 裸词不能含空白），不是默认分离。
3. **属性面板「节点 ID」= 显式分离**：`rename-node` 对纯文本节点渲染 `MyId[旧词]`
   （旧词保留为显示文本，方框为分离必然引入的形状），其余出现处跟随新 id（否则节点
   被拆成两个）；带形状的节点改 id 不触碰显示文本（逐字重写全部出现）。
4. **选中跟随**：裸词重命名后旧选中随 id 失效，内联编辑 hook 与属性面板「显示文本 /
   节点 ID」字段都把选中迁移到新 id。

## 理由

- 源码是唯一交付物（ADR-0008）：机器 id 是往用户语法里塞机器命名，ADR-0009 已在
  mindmap 上裁定过同样的理由；flowchart 作为默认图种更没有理由更差。
- 语法前提成立：mermaid 接受裸词节点行（金样库 `chinese` 样例 `开始 --> 判断` 已钉住）；
  示例图表库的 flowchart（`需求[收集需求] --> 设计[方案设计]`）本来就在用这个风格。

## 已知取舍

- 把纯文本节点重命名为**已存在的其他节点 id** 时，遵循 mermaid 同名合并语义（与既有
  `rename-node` 行为一致），内联编辑不额外拦截；撤销可回。
- 「内联编辑含空格文本」与「属性面板设 ID」都会让节点从纯文本变为方框——分离必然引入
  形状（同 ADR-0009），是语法必然，不是缺陷。

## 落码位置

- `src/lib/pipeline/flowchart.ts`：`add-node` 的 `shape: null` 裸词形式、
  `set-node-text` 裸词分支（合法裸词 → 全部出现处重写）、`rename-node` 裸分裂。
- `src/lib/pipeline/flowchart-keyboard.ts` / `src/lib/editing/menu-actions.ts`：
  新建占位串避重（`nextFreeName` + `newNodePlaceholderId`），不再使用机器 id。
- `src/i18n/domain-strings.ts`：`newNodePlaceholderId()`。
- `src/lib/editing/use-canvas-inline-edit.ts` / `src/components/property-forms.tsx`：
  选中跟随。

行为由单测钉住：`src/lib/editing/__tests__/canvas-keyboard.test.ts` 的
「flowchart 默认纯文本节点（ADR-0009 对齐）」组。
