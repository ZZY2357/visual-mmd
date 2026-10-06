# sequence 的 create 进模型，destroy 不进

> **状态：accepted**

`create participant` 与 `destroy` 一直落在 ADR-0005 的"不解析、原样保留"里。两者在语法上成对，
但**实测（2026-09-29 真机）显示它们的渲染行为完全不对称**，因此处置也分开。

- **`create participant B` 可用且有真实渲染产出**：`line[B].actor-line` **只从 create 点开始**
  （短段生命线），B 在顶部与底部各有一个实例框。
- **`destroy B` 是视觉空操作**：mermaid **不画任何十字标记**；全 SVG 扫描后 `[data-id]` 集合无任何新增
  （`marker` 里有 X 形路径定义，但**从未被实例化**）。且 `destroy` 之后**不能有任何消息线**——
  哪怕是与它无关的 `A->>C`，整图都会语法错误（`The destroyed participant undefined does not have an
  associated destroying message after its declaration`）。**mermaid 官方文档自己的 create+destroy
  示例也报同一错误**，且错误信息里带一个 `undefined`，疑似 12.0.0 的 bug。

**决定**：

- **`create` 进模型**：投影给参与者记录**生命起点**（不做成对闭合——因为 `destroy` 不进来，
  不需要"区间"这个概念）。画布不特殊渲染，沿用 mermaid 画出的短生命线；属性面板与结构树体现
  "此参与者由 create 引入"。
- **`destroy` 不进模型**：写进 non-goal。做的唯一价值是"让源码里的 `destroy` 在画布上有个可点选
  代表"，但那会**让画布与 mermaid 渲染结果不一致**——引入一个只有编辑面有、渲染面没有的元素，
  恰好破坏本应用的核心承诺"画布 = 源码的可视化编辑面"。

**`rect` / `box` / `namespace` 一并说明**：实测三者均**渲染成功但无 `data-id`**，且都不构成 DOM 包含
（`box` 的分组是图形层叠；`namespace` 的 `<g class="cluster undefined">` 不含 `class A`，
`childDataIds: []`）。因此它们**不进投影的结构模型**，只做"解析 + 结构树可见 + 可改名"，
**不做分组编辑**（没有真实包含语义可编）。此决定同时保护了工单 14 的「节点可视范围」口径——
`rect`/`box` 矩形不进匹配集合，方位导航不受影响。

**顺带的回归提醒**：`destroy` 之后不能有消息线、`create` 同名两次会语法错误——这两条已记入
`docs/mermaid-upgrade-regression-checklist.md` 的回归项，mermaid 升版时需复核是否仍是此行为。
