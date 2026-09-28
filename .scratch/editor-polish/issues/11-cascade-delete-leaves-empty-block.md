# 11 删除参与者级联后残留空 loop / alt 块（该源码在 mermaid 侧产出成批 NaN 属性 console error）

Status: needs-triage

来源：工单 07 手工验收「07 回归」的题外确认项（前一节 06 只记录为"残留空白行 + 空 loop"，
并把 NaN 报错归因给 mermaid；本节按编排方要求确认**空块是不是 app 侧级联删除制造的**）。
结论：**是 app 侧制造的** —— 真实 UI 走「删除参与者」后，被删语句所在的 `loop` / `alt` 块体变空而块
本身被保留，故属本单。

## 需求

复现步骤 A（空 loop，默认模板路径）：

1. 打开 `http://localhost:5199/`，先 `localStorage.clear()` 再 reload。
2. 「新建」→「时序图」（默认模板，末尾是 `loop 每次编辑` + 块体内 1 条语句
   `系统->>系统: 保存到 localStorage`）。
3. 在画布上对参与者「系统」真实右键（`mousedown right` + `mouseup right`）→ 点菜单「删除参与者」。
4. 读源码（代码面板文本，与 `localStorage['visual-mmd:library']` 逐字一致）与控制台。

预期：

- 引用被删参与者的语句级联消失；**不得留下块体为空的 `loop` 块**（要么整块移除，要么块内仍有语句）。

实测：

- 源码（级联删除前 → 后）：

  ```text
  sequenceDiagram
      autonumber
      actor 使用者
      participant 系统 as Visual MMD
      使用者->>系统: 打开图表
      activate 系统
      系统-->>使用者: 渲染预览
      deactivate 系统
      使用者->>系统: 修改属性
      系统-->>使用者: 源码实时更新
      Note over 使用者,系统: 左侧代码随表单变化
      loop 每次编辑
          系统->>系统: 保存到 localStorage
      end
  ```

  →

  ```text
  sequenceDiagram
      autonumber
      actor 使用者
  <-- 8 行「只有 4 个空格」的空白行
      loop 每次编辑
  <-- 1 行只有 8 个空格（原块体内唯一语句）
      end
  ```

  （`<--` 行是注释标记，实际文件里这些行只有空格、没有字符。）
  即 **`loop 每次编辑` 与 `end` 之间没有任何语句**（块体为空），另有被删语句留下的空白行。
  原文（转义）：`sequenceDiagram\n    autonumber\n    actor 使用者\n    \n    \n    \n    \n    \n    \n    \n    \n    loop 每次编辑\n        \n    end\n`。
- 该源码在画布上产出 **51 条 console error**（`Error: <line> attribute y1/y2: Expected length, "NaN"`、
  `<circle> attribute cy`、`<text> attribute x/y`、`<tspan> attribute x`、`<polygon> attribute points` 等），
  删除前该时点 `playwright-cli console error` = `Errors: 0 / Warnings: 0`。
- `.mantine-Alert-root` 数量 = 0：源码**语法合法**（mermaid 能 parse），畸形点是"空块"这个结构。

复现步骤 B（空 alt，换一种块验证不是 loop 特有，块体与语句均由真实 UI 删除）：

1. 代码面板整体改写（`Control+a` + 键盘输入）为
   `sequenceDiagram\nactor A\nparticipant B as Bee\nalt 条件一\nA->>B: hi\nend`（面板文本与 localStorage 逐字一致）。
2. 画布上对参与者 `B` 真实右键 → 「删除参与者」。

实测：源码变为 `sequenceDiagram\nactor A\n\nalt 条件一\n\nend` —— `alt 条件一` 与 `end` 之间为空行，
**块体为空**；新增 **47 条**同型 NaN console error（该时点
`Total messages: 102 (Errors: 98, Warnings: 0)`，98 条全部是 NaN 属性）。

补充观察：

- 残留空白行在两种路径上都存在；`participant B as Bee` 被删后那一行也只剩空白。
- **对照**（沿用前一节 06 的结论，用于区分责任）：手写 `sequenceDiagram\n    actor 使用者\n    loop 每次编辑\n    end\n`
  （不经本功能）同样报同型 error；reload 后加载本单产出的含空 `alt` 存档、零操作亦再报约 50 条同型 error。
  即 NaN 渲染是 mermaid 对空块的行为，**本单要修的是 app 不该留下空块**。

证据：

- 源码：`localStorage['visual-mmd:library']` 与代码面板逐字一致（上述两段）。
- 控制台：删除前 `Errors: 0 / Warnings: 0` → 空 loop 后 +51 条 → 空 alt 后 +47 条
  （`Total messages: 102 (Errors: 98, Warnings: 0)`）；reload 后 +50 条（日志
  `.playwright-cli/console-2026-09-28T14-48-52-695Z.log` 的 `#L5-L55`、`#L56-L102`、`#L103-L152`）。
- 画布：删除前后均无错误态（`.mantine-Alert-root` = 0），图仍渲染（`svg[aria-roledescription="sequence"]`）。

## Comments

（空）
