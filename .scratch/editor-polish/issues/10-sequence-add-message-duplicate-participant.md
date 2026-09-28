# 10 sequence「添加消息」在对方声明之前落码：结构树出现重复参与者 + React 重复 key 报错

Status: needs-triage

来源：工单 07 手工验收「06 class/sequence 节点右键」的 sequence 条目「加消息落码正确」的旁证
（控制台报错）。**与失败单 09 不是同一根因**（09 是 class 节点缺 `data-id` 导致寻址失效；本单是
sequence 投影未按 actorId 合并隐式参与者）。

## 需求

复现步骤：

1. 打开 `http://localhost:5199/`（先清空 localStorage 再 reload），「新建」→「时序图」（默认模板）。
2. 在画布上对参与者「使用者」真实右键（其声明 `actor 使用者` 在 `participant 系统 as Visual MMD` 之前）
   → 点菜单「添加消息」。
3. 在浮出的消息表单里填消息文本（例如 `M1`）→ 点「添加」。
4. 读右侧结构树的「参与者（N）」条目与 `localStorage['visual-mmd:library']` 的源码；并读控制台。

预期：

- 新消息落码后参与者仍是 2 个（`使用者`、`系统`），结构树无重复项，控制台无 error。

实测实际行为：

- 落码本身合法且位置"按锚点"正确：源码新增 `    使用者->>系统: M1`，插在 `actor 使用者` 之后、
  `participant 系统 as Visual MMD` **之前**（锚点 = 右键那个参与者的声明）。
- **结构树「参与者」计数 2 → 3**：列出 `使用者`、`Visual MMD系统`、`系统`
  —— `系统` 出现两次（一次是消息里隐式使用的、一次是显式声明的）。
- **控制台 3 条 React error**：`Encountered two children with the same key, `系统``。
- 画布 SVG 本身正常（mermaid 侧只渲染一个 `系统` 框，`g[data-id]` 中 `系统` 只出现一次）。

对照实验（证明触发条件是"落码在对方声明之前"，不是"加消息"本身）：

- 对「系统」右键 → 添加消息（锚点 `participant 系统 as Visual MMD` 在 `使用者` 声明之后）→
  落码 `    系统->>使用者: M2`，参与者仍为 **2**、控制台 0 新报错。
- 手写同形态源码（不经过本功能）可独立复现：把源码整体改写为
  `sequenceDiagram\n    A->>B: hi\n    participant B as Bee\n` → 结构树「参与者（**3**）」，
  控制台出现 3 条 `Encountered two children with the same key, `B``。
  即**根因在解析/投影层**：消息里先于声明出现的参与者被记成一个隐式参与者，随后
  `participant X as Y` 又产生一个 actorId 相同的参与者，投影未按 actorId 合并/去重；
  「添加消息」表单以"右键参与者的声明"为插入锚点，会把这种形态从 UI 自动造出来。

证据：

- 源码（`localStorage['visual-mmd:library']`，`activeId` 指向的图）：
  `sequenceDiagram\n    autonumber\n    actor 使用者\n    使用者->>系统: M1\n    participant 系统 as Visual MMD\n
  \    使用者->>系统: 打开图表\n ...`（新增行落在第 3、4 行之间）。
- 结构树（属性面板）文案：`参与者（3）` + 三个按钮 `使用者` / `Visual MMD系统` / `系统`
  （对照撤销该次「添加消息」后立刻回到 `参与者（2）`）。
- 控制台（`playwright-cli console error`）：
  `[ERROR] Encountered two children with the same key, `系统`. ... @ react-dom_client.js:5178` ×3；
  hand-written 对照为 `` `B` `` ×3。
- 画布对照：`document.querySelectorAll('g[data-id]')` 的 `data-id` 集合为
  `["系统","i8","i11","使用者"]`（无重复），说明重复只存在于 app 侧投影/结构树。

## Comments

（空）
