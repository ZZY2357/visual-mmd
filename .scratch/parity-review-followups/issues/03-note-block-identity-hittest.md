# 03 note / block 的位置序身份可被点选命中

Status: resolved

来源：`spec.md` 的 F3。工单 02 的「位置序寻址」对 note / block 只兑现了**标注**，没兑现**命中**。

## D3 定案（2026-09-29）：身份下移到几何元素，同宿主共享一个 elementId

实测证据，无需再调研：

- `hostGroupsOf`（`edge-locate.ts:87`）把 `data-id` 标在**宿主 `<g>`** 上。
- `distanceToPath`（`:153`）在 `typeof geo.getTotalLength !== 'function'` 时返回 `null`；
  `<g>` 没有 `getTotalLength` → note / block 恒返回 `null`，永远进不了候选。
- 宿主形态见既有 fixture（`edge-locate.test.ts:68-70`）：
  `<g><rect class="note"/><text class="noteText"/></g>`、
  `<g><line class="loopLine"/><line class="loopLine"/><polygon/><text/></g>`。
  **一个块有两条 `loopLine`** —— 所以不能简单地把身份标在每个 `line.loopLine` 上，
  那会让一个块拿到两个位置序。

定案做法：

1. 位置序的**计数单位仍是宿主 `<g>`**（`hostGroupsOf` 的去重与文档序保持不变）。
2. `annotateAnchors` 改为把**同一个 elementId 标到该宿主下所有几何元素**上
   （note → `rect.note`；block → 每条 `line.loopLine`）。同组共享一个 id，命中时取最近者，
   语义与「点这个块」一致。
3. `distanceToPath` 无需改动 —— 它拿到的是真正的几何元素了。

**必须顺带验证的两个连带风险**（写进测试，不要只靠肉眼）：

- mermaid 自己已在宿主 `<g>` 上写了 `data-id="i3"` / `"i8"`。身份下移后，
  宿主上的 mermaid id 保留、子元素拿我们的 elementId。要确认 `hitTestEdgeIdentity`
  的 `isEdgeElementId` 过滤仍把 mermaid 的 id 排除在外。
- `data-id.ts` / `node-data-ids.ts` 遍历 `[data-id]` 做**节点**命中。子元素上新增
  elementId 后，要确认不会被节点命中路径误吃（尤其是 `rect.note` 与节点 `<rect>` 同标签）。

## 问题

`annotateSequenceIdentities` 把身份标在两类不同的元素上（`edge-locate.ts:144-146`）：

```ts
annotateAnchors(Array.from(root.querySelectorAll(SEQUENCE_MESSAGE)), 'message', counts.messages)
annotateAnchors(hostGroupsOf(Array.from(root.querySelectorAll(SEQUENCE_NOTE_RECT))), 'note', counts.notes)
annotateAnchors(hostGroupsOf(Array.from(root.querySelectorAll(SEQUENCE_BLOCK_LINE))), 'block', counts.blocks)
```

- 消息：身份标在**几何元素**（`line` / `path`）本身。
- note / block：身份标在**宿主 `<g>`** 上（`hostGroupsOf`，`:87-98`，取 `parentElement` 去重）。

但 `hitTestEdgeIdentity`（`:177`）只挑有几何 API 的元素：`distanceToPath`（`:155`）在
`typeof geo.getTotalLength !== 'function'` 时直接 `return null`，而 `<g>` **没有** `getTotalLength`
→ note / block 的身份**永远进不了候选**，函数对它们恒返回 `null`。

后果：note / block 的 `note:N` / `block:N` 身份只是被写进了 DOM 的 `data-id`，点选时取不到。
工单 02 承诺的「连线位置序寻址」对这两类元素实际是断的。

## 需求

1. **先实测确认**（这是 `needs-triage` 的原因）：note / block 渲染产物的 DOM 形态——
   宿主 `<g>` 里究竟是 `rect.note` / `line.loopLine` 还是别的；`<g>` 自身有无可测几何。
   **把实测结论写进 Comments 再动手**，不要凭猜测定命中策略。
2. 让 `hitTestEdgeIdentity` 也能返回 note / block 的身份。候选策略（实测后选其一）：
   - **(甲) 宿主 `<g>` 走包围盒**：对没有 `getTotalLength` 的元素，改用 `getBoundingClientRect()`
     算到点/矩形的最近距离。**注意**：工单 02 决策记录明确「**禁止**用
     `getBoundingClientRect().中心`」做连线命中（class 斜线 bbox 退化、中点命中 `<svg>` 根）——
     本票只把 bbox 用作**距离度量**、不用中心点，与该禁令**不冲突**，但要在 Comments 说明清楚。
   - **(乙) 下探到子几何元素**：命中判定用 `<g>` 内部的 `rect` / `line`（它们有几何 API），
     命中后**向上取宿主 `<g>` 的 `data-id`**。语义更接近消息的现有做法。
3. 命中后必须能一路走到选中：确认 `canvasToEditorSelection` / `selectedDataIdOf` 对
   `note:N` / `block:N` 的处理已经打通（工单 02 的既有成果），本票只补命中这一环。

## 落码位置

- `src/lib/canvas-selection/edge-locate.ts`：`distanceToPath`（`:155`）、`hitTestEdgeIdentity`（`:177`）、
  `hostGroupsOf`（`:87`）、`annotateSequenceIdentities`（`:143`）。
- 若命中策略需要区分 kind：`isEdgeElementId` 的判别（`:177` 循环内）。
- 测试：`src/lib/canvas-selection/__tests__/edge-locate.test.ts`。

## 不变量

- **消息的现有命中行为不得改变**：工单 02 的既有用例（含「沿真实路径采样」「容差 4px 不吃空白」
  `EDGE_HIT_TOLERANCE`、`:149`）必须全部继续绿。
- **不得引入 bbox 中心点命中**——工单 02 的禁令仍然有效，本票不推翻它。
- `annotateSequenceIdentities` 的标注结果（`note:N` / `block:N` 的编号与文档序）不得改变，
  否则会连带破坏工单 04 / 06 依赖编号的链路。
- 逐字保留（ADR-0004 / ADR-0008）：本票只动画布命中，不动任何源码写回。

## 测试

- `edge-locate.test.ts` 新增（用例需能构造宿主 `<g>` 的真实 DOM 形态，形态以实测结论为准）：
  1. 点在 note 的矩形上 → 返回 `note:N`（N 为正确序号）。
  2. 点在 block 的线上 → 返回 `block:N`。
  3. **回归保护**：点消息仍返回 `message:N`；远离任何元素仍返回 `null`。
  4. 边界：note / block 与消息重叠时，取**最近**的那个（与现有 `best` 距离比较逻辑一致）。

## 验收

- [ ] 实测结论已写进 Comments（DOM 形态 + 选了哪个策略 + 理由）。
- [ ] 上面 4 条用例全绿，工单 02 的既有用例无一条变红/被删。
- [ ] 右键 note / block 能弹出对应菜单（端到端确认命中 → 选中 → 菜单链路通了）。
- [ ] 控制台 0 error / 0 warning。（按 `AGENTS.md` 当前规则，默认不做真机确认；若需真机，单独提出）

## Comments

### 实测结论（2026-09-29，无需再调研）

DOM 形态沿用既有 fixture（`edge-locate.test.ts` 抄自真机实测）：

- 注释：`<g data-id="i3"><rect class="note"/><text class="noteText">…</text></g>`
- 块：`<g data-id="i8"><line class="loopLine"/><line class="loopLine"/><polygon class="labelBox"/><text class="labelText">…</text></g>`

即：**一个块有两条 `loopLine`**（上下边框）；宿主 `<g>` 只有 mermaid 自己的 `data-id`（`i3` / `i8`），
自身无可测几何（`getTotalLength` 不存在）。

### 选了哪个策略

D3 定案的**(乙) 下探到子几何元素**，按定案逐条落地：

1. 位置序的计数单位仍是宿主 `<g>` —— `hostGroupsOf`（:87）的去重与文档序**一行未改**。
2. 新增 `annotateHostAnchors`（`edge-locate.ts`）：同一 elementId 标到该宿主的**子元素**上，
   同宿主共享一个 id → 一个块的两条 `loopLine` 只占一个位置序（`block:1`）。
3. `distanceToPath` **未改** —— 它现在拿到的是真正的几何元素。

**未采用**（甲）宿主走包围盒：本票没引入任何 `getBoundingClientRect`，工单 02 的
「禁止 bbox 中心点命中」禁令不受影响（既有的 `forbidBBox` 桩用例仍绿）。

### 一处超出 D3 字面枚举的落码（需人裁定）

D3 点名的是「note → `rect.note`；block → 每条 `line.loopLine`」。实现标的是
**宿主直接子元素中的非 `<g>`**，即额外含 `text.noteText` / `polygon.labelBox` / `text.labelText`。

理由（实测推演，非猜测）：身份下移后宿主 `<g>` 上只剩 mermaid 的 `iN`，`selectionFromEventTarget`
沿 DOM 上行时 `iN` 不被任何 resolver 认领；若只标几何锚点，**点在注释文字上会找不到身份**
（注释的绝大部分面积是文字，而文字到 `rect.note` 描边的距离远大于 4px 容差，几何兜底也接不住）
—— 相对现状（身份在宿主上，点文字可归属）是回退。排除 `<g>` 是为了不把块内嵌的内容也归属成块。

### 既有用例的断言位置（需人裁定）

D3 要求「宿主上的 mermaid id 保留」，与既有用例断言「宿主 `<g>` 的 data-id = `note:N` / `block:N`」
不可兼得。处理：**用例一条未删**，只把 3 处断言的落点从宿主 `<g>` 改到子元素，标题与意图保留，
并**顺带补上**「宿主仍为 `i3` / `i9` / `i8`」的断言。`edge-locate.test.ts` 用例数 21 → 27。

### 新增用例（`src/lib/canvas-selection/__tests__/edge-locate.test.ts`，新 describe「sequence 注释/块的点选命中（工单 03）」）

1. 点在 note 的矩形上 → 命中位置序身份 `note:1` / `note:2`。
2. 点在 block 的线上 → 命中 `block:1`；**同一块的两条 `loopLine` 只对应一个身份**（两条线各自
   命中都返回 `block:1`），两条边框线之间的空白 → `null`。
3. 消息命中行为不变（`message:1/2/3`），远离任何元素 → `null`。
4. note 与消息相邻时取最近的一个（与既有 `best` 距离比较一致）。
5. **连带风险 1**：宿主 `<g>` 保留 mermaid 的 `i3` / `i8`；给宿主桩上几何后点它仍返回 `null`
   （`isEdgeElementId` 把 mermaid id 排除在外），身份只来自子元素。
6. **连带风险 2**：`rect.note` 上的 `note:1` 不被节点命中路径误吃 —— 走 `annotateNodeDataIds`
   （只认 `g.node`）+ 节点/连线复合 resolver，点注释矩形与注释文字都得到
   `{ kind: 'element', elementId: 'note:1' }`，节点 `甲` 仍照旧命中 `{ kind: 'node' }`。

### 验证结果

- `npm run typecheck`：通过。
- `npx vitest run src/lib/canvas-selection/__tests__/edge-locate.test.ts`：27/27 绿。
- `npm test`（全量）：**54 文件 / 804 用例全绿**，无一条既有用例变红或被删
  （基线 53 / 789；增量来自本票 +6 与并行工单的新增文件）。
- 术语：CONTEXT.md 的禁用词 `消息线`（:108）本票**未新增**（新增注释里的一处已改为「消息」）。

### 未做的验收项

- 「右键 note / block 能弹出对应菜单」与「控制台 0 error / 0 warning」：按 `AGENTS.md` 当前规则
  默认不做真机/浏览器验收。命中的一端已由上面的单测钉住，选中 → 菜单链路沿用工单 03/02 的既有成果，
  本票未改动菜单与 i18n 文件。
