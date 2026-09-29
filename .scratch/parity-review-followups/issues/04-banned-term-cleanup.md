# 04 清理本批新造的 CONTEXT.md 禁用词

Status: ready-for-agent

来源：`spec.md` 的 F4。纯字符串替换，无决策点，随时可做。

## 问题

`CONTEXT.md` 的「连线」条 `_Avoid_` 明列：

> 消息线（仅用于 sequence）

`git grep 消息线 5874603` **为空**——该词完全是本批新造的。canonical 说法是「消息」或「连线」。

共 **15 处**，分布如下（均为本批引入或本批修改到的文件）：

| 文件 | 行 | 原文片段 |
|---|---|---|
| `src/i18n/index.ts` | 49 | `// 连线菜单（工单 03）：class 关系边 / sequence 消息线；注释与块只补删除` |
| `src/lib/canvas-selection/edge-locate.ts` | 35 | `/** sequence 消息线：普通消息是 line，自消息是 path … */` |
| 同上 | 139 | `/** sequence：标注消息线 / 注释 / 块 … */` |
| 同上 | 149 | `/** 屏幕命中容差（CSS px）：sequence 消息线 only 1.5px 描边 … */` |
| `src/lib/canvas-selection/use-canvas-selection.ts` | 75 | `// 序列消息线只有 1.5px 描边 …` |
| `src/lib/editing/context-menu.ts` | 66 | `// 连线菜单（工单 03）：class 关系边与 sequence 消息线各「编辑 + 删除」；` |
| 同上 | 141 | `* - sequence 消息线（工单 03）：切换箭头 …` |
| `src/lib/editing/use-canvas-context-menu.ts` | 50 | `* - 连线菜单（工单 03）：class 关系边与 sequence 消息线各给「编辑 + 删除」…` |
| 同上 | 468 | `/** sequence 消息线：循环切换箭头 … */` |
| 同上 | 480 | `/** sequence 消息线：编辑激活/文本 … */` |
| `__tests__/edge-locate.test.ts` | 204 | `it('消息线（line/path 的 messageLine0/1）按文档序标 message:N', …)` |
| `__tests__/context-menu.test.ts` | 183 | `it('连线目标（工单 03）：class 关系边与 sequence 消息线各有编辑 + 删除动作', …)` |
| `__tests__/inline-edit.test.ts` | 116 | `it('sequence：双击消息线（resolver 命中 element）→ null …', …)` |
| `__tests__/use-canvas-context-menu.test.tsx` | 32 | `* class 关系边与 sequence 消息线的菜单（工单 03）…` |
| 同上 | 1160 | `it('右键 sequence 消息线：菜单为切换箭头/编辑激活文本/删除并联动选中', …)` |
| `__tests__/use-canvas-inline-edit.test.tsx` | 481 | `it('sequence：双击消息线 → 不进入内联编辑 …', …)` |

（上表 16 行是因为 `use-canvas-context-menu.ts` 与测试文件各有多处；以 `grep -rn 消息线 src/`
的实际输出为准，共 15 处。）

## 需求

1. 把上述所有「消息线」替换为 **「消息」**（sequence 语境下最贴切；`CONTEXT.md` 的「连线」条
   把 sequence 的消息定义为连线的一种，故「消息」合规）。
2. **只替注释、文档字符串与测试标题**——不得改动任何**代码标识符**
   （如 `SEQUENCE_MESSAGE`、`messageLine0/1`、`setMessageIntent` 等一律不动）。
3. 替换后 `grep -rn 消息线 src/` 必须**为空**。
4. 顺带检查：本批是否还新造了 CONTEXT.md 其他 `_Avoid_` 词。已知一处**较弱**的：
   `关系边` 用了禁用字「边」（`CONTEXT.md` 的 canonical 说法是「class 的关系」），
   但仓库既有代码已大量使用「边」（`edgeDataIdResolver` 等），**不在本票处理**，
   仅在 Comments 记录，避免与既有用法打架。

## 落码位置

上表所列文件。**不触碰** `CONTEXT.md` 本身（它是标准来源，不是违规处）。

## 不变量

- 纯注释/文案改动，**零行为变化**：`npm run typecheck` 与 `npm test` 的结果必须与改动前一致
  （53 文件 / 789 用例全绿）。
- 代码标识符、i18n key、DOM class 名（`messageLine0/1`）**一律不动**。

## 测试

无需新增测试。验证方式：

1. `grep -rn 消息线 src/` → 无输出。
2. `npm run typecheck` → 0 error。
3. `npm test` → 53 文件 / 789 用例全绿（与改动前**数字完全相同**，因为只是改了文案）。

## 验收

- [ ] `grep -rn 消息线 src/` 为空。
- [ ] typecheck 0 error，测试数与改动前一致且全绿。
- [ ] git diff 中没有任何标识符被改动（只有注释/字符串/测试标题）。
- [ ] 控制台 0 error / 0 warning。（不适用——纯注释改动，无运行时影响）

## Comments
