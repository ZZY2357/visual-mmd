# Mermaid 大版本升级回归检查清单

工单 05 的画布选中（点击选中、图中高亮）与键盘操作依赖 mermaid 渲染 SVG 上的
`data-id` 属性（ADR-0007）。这是 mermaid 团队**有意提供但未文档化、无稳定性承诺**的
事实约定。`package.json` 将 mermaid 锁定在大版本 v12；**升级 mermaid 大版本时必须
逐项回归本清单**，任一项失败即冻结升级并另开工单。

## 背景：v12 的 data-id 事实约定（实现所依赖的全部行为）

| 渲染产物 | data-id 值 | 代码位置（v12 dist） |
| --- | --- | --- |
| flowchart/其它图节点 `<g>` | 源码节点 id | `chunk-UA2S7LBM.mjs`：`g.attr("data-id", node.id)` |
| subgraph/cluster `<g>` | 源码子图 id | 同上，`data-et="cluster"` |
| flowchart 边 `<path>` | `L_{from}_{to}_{counter}`（counter 0 起，平行边计数有跳号） | `chunk-Z7XXMR3K.mjs`：`svgPath.attr("data-id", edge.id)`；`chunk-ZIGJFQKS.mjs` `getEdgeId` |
| flowchart 边标签 `<g class="label">` | 同边 id | `chunk-Z7XXMR3K.mjs` |
| sequence 参与者/生命线 | 参与者名 | `sequenceDiagram-*.mjs` |

本仓实现消费方（升级时重点核对）：

- `src/lib/canvas-selection/data-id.ts` — data-id → 选中的通用匹配
  （节点精确匹配；边按 `L_*_*_*` 尽力而为解析）
- `src/lib/canvas-selection/flowchart-adapter.ts` — flowchart 投影适配
- `src/lib/canvas-selection/highlight.ts` — `[data-vm-selected]` 标记
- `src/lib/canvas-selection/use-canvas-selection.ts` + `src/components/CanvasPanel.tsx` — 点击接线
- `src/index.css` — `[data-vm-selected]` 高亮样式

## 回归步骤（手动，升级后逐项打勾）

准备：`npm run dev` 打开编辑器，默认 flowchart 模板；另备含 subgraph、
双向连线、平行连线（A --> B 两次）、中文文本节点的源码。

1. **节点 data-id 存在且等于源码 id**
   浏览器 DevTools 检查渲染 SVG：节点 `<g>` 带 `data-id="A"` 等，值与源码节点 id 一致
   （大小写、连字符、中文 id）。subgraph `<g>` 仍带 `data-id`。
2. **点击选中**：点击任一节点（含形状内部与文字）→ 属性面板定位到该节点表单。
3. **图中高亮**：被点节点出现蓝色光晕（`[data-vm-selected]`）；点击结构树另一节点，
   光晕随之移动；SVG 重渲染（改代码）后高亮仍在原选中节点上。
4. **data-id 无法匹配不崩溃**：点击边、标签、空白区域 → 不选中、无控制台报错
   （验收项：退化为仅结构树可选中）。
5. **边的尽力而为匹配**（允许失败，失败则确认 `edgeDataIdResolver` 注释并降级）：
   点击边路径 → 结构树选中对应连线；不匹配时安静不选中。
6. **键盘操作**：选中节点后 Delete 删除、Tab 添加子节点、Enter 添加同级节点，
   每次操作后源码变化正确、Ctrl+Z 可撤销。
7. **焦点隔离**：焦点在代码面板内按 Del/Tab/Enter/任意键 → 不触发画布操作、
   不干扰打字；焦点在属性表单输入框内同理。
8. **securityLevel 语义未变**：`src/lib/use-mermaid-preview.ts` 仍以
   `securityLevel: 'strict'` 初始化；源码中 click 回调不被执行。
9. **渲染错误冻结语义未变**：非法源码时画布停留最近一次合法 SVG。
10. **全量测试**：`npm test`、`npm run typecheck`、`npm run build` 全绿
    （`src/lib/__tests__/golden-validity.test.ts` 覆盖 v12 parse 兼容性）。

## 已知脆弱点

- 边 data-id 的 `L_{from}_{to}_{counter}` 中节点 id 可含 `_`/`-`，匹配按已知边
  集合消歧（尽力而为，见 `edgeDataIdResolver`）；mermaid 平行边 counter 存在跳号
  （第 2 条平行边 counter = 2 而非 1），实现已兼容，格式再变需同步调整。
- 若未来 mermaid 改用 shadow DOM / iframe 渲染，事件委托与
  `dangerouslySetInnerHTML` 注入路径（`useMermaidPreview`）都需重新评估。

## 2026-09-29 追加：连线身份不再依赖 data-id（ADR-0012）

实测证明 class / sequence 的连线 data-id **会随中位插入重排**，因此本仓对连线改用**位置序**身份，
不再消费 mermaid 的连线 data-id。以下事实仅作背景参考，**不再是实现依赖**，但升级时仍需复核
（若某版 mermaid 开始提供稳定连线 id，可回看 ADR-0012 是否值得重新评估）。

| 渲染产物 | data-id 值（v12 实测） | 稳定性 |
| --- | --- | --- |
| class 关系边 `<path>` | `id_{源}_{目标}_{N}`（`N` 全局自增） | **中位插入后后缀重排** |
| class 关系边 `<path>` 的 `id` 属性 | `{svgId}-{data-id}` | 同左 |
| class 关系标签内层 `<g>` | 与同边 edgePaths **共享同一 id** | 同左 |
| class 基数 `"1"`/`"*"`（`span.edgeLabel`） | **无任何 data-id** | — |
| sequence 消息线 `<line>` | 纯序号 `iN` | **插入点之后全部重排** |
| sequence note `<g>` / loop 块 `<g>` | 纯序号 `iN`（与消息共用计数器） | 同左 |
| sequence 参与者生命线 / 实例 | 参与者名 | **稳定**（ADR-0007 对节点仍成立） |

新增回归项：

1. **连线可点选**（工单 02 后）：class 关系边与 sequence 消息线点击可选中；
   **必须在"中位插入一条新连线"之后复测**——这是最易碎的场景。
2. **连线命中路径**：沿真实路径采样（`getTotalLength` + `getPointAtLength` + `getScreenCTM`）
   能命中连线元素；**确认 `getBoundingClientRect().中心` 仍不可用**（class 斜线 bbox 退化）。
3. **`create` / `destroy` / `rect` / `box` / `namespace` 渲染结构**：
   - `create participant B` → 生命线仅从 create 点开始；
   - `destroy B` → **仍不画十字标记**（若某版开始渲染，可回看 ADR-0014 是否值得重新评估）；
   - `rect` / `box` / `namespace` 产物**仍无 data-id**、且**不构成 DOM 包含**
     （`namespace` 的 `childDataIds` 应为空）。
4. **错误态**：
   - `destroy` 之后存在消息线 → 仍报
     `...does not have an associated destroying message after its declaration`（含 `undefined` 疑似 bug）；
   - `create` 同名两次 → 仍报 `It is not possible to have actors with the same id...`；
   - `destroy` 一个不存在的参与者 → 仍**静默忽略**。
5. **工单 14 的可视范围口径不受影响**：`rect`/`box`/`namespace` 矩形仍无 data-id，
   故仍不进方位导航的候选集合。
6. **class 标签 / 基数的位置序归属**（工单 02）：`annotateClassRelationIdentities` 把
   `g.edgeLabels` 的**直接子元素**按「逐条关系一个 label 组、紧随其 terminals 组」的期望序列
   对齐到关系序（条数 / 顺序任一不符即整体放弃标注）；sequence 的注释 / 块标注同理依赖
   `rect.note` / `line.loopLine` 的宿主 `g` 结构。升版若改这些结构，对应种类退化为
   「点标签 / 点基数不响应」，**不会点错关系**（这条是工单 02 引入的新的 mermaid 结构依赖）。

## 2026-10-01 追加：more-diagrams 批次全部新图种（工单 29 验收）

`more-diagrams` 批次把覆盖目标扩到 mermaid 全部图种（ADR-0017）。本批新增 27 图种
（`DIAGRAM_TYPE_LIST` 实测 31 = 4 原有 + 27 新增）；升版时**每图种按下表逐项复核**。
复核口径：`detect` 关键字是否仍被认领、模板能否被自身解析器解析、`mermaid.parse` 能否通过、
结构树是否非空、`data-*` 可寻址结论是否仍成立（`annotate*DataIds` 是否仍能反注）。

### A. 关键字检测（`detect` 逐条复核；本仓 `diagram-registry.ts` 的 detect 正则）

| 图种 | 关键字 | 备注 |
| --- | --- | --- |
| state | `stateDiagram` / `stateDiagram-v2` | 双声明同认 |
| er | `erDiagram` | |
| gitgraph | `gitGraph` | |
| timeline | `timeline` | |
| kanban | `kanban` | |
| requirement | `requirementDiagram` | `requirementDiagram_v2` 在 v12 已消失，**不认** |
| journey | `journey` | |
| block | `block` / `block-beta` | 双关键字 |
| pie | `pie` | |
| gantt | `gantt` | |
| quadrant | `quadrantChart` | |
| sankey | `sankey` / `sankey-beta` | 双关键字、行尾仅空白 |
| xychart | `xychart` / `xychart-beta`（可带 `horizontal`/`vertical`） | 双关键字 |
| radar | `radar-beta` | |
| packet | `packet` / `packet-beta` | 双关键字 |
| architecture | `architecture-beta` | 行尾仅空白 |
| c4 | `C4Context`/`C4Container`/`C4Component`/`C4Dynamic`/`C4Deployment` | **全大写**、大小写敏感 |
| treemap | `treemap` / `treemap-beta` | 双关键字、**大小写敏感** |
| venn | `venn-beta` | 裸关键字、**大小写敏感** |
| ishikawa | `ishikawa` / `ishikawa-beta` | 双关键字 |
| wardley | `wardley-beta` | |
| treeview | `treeView-beta` | 裸关键字、**大小写敏感**（`treeView` 不认） |
| cynefin | `cynefin-beta` / `cynefin-beta:` | **大小写敏感** |
| usecase | `usecase-beta`（可带 `direction`） | 裸 `usecase` **不认** |
| eventmodeling | `eventmodeling`（正文首行） | **非 frontmatter 声明式**；无 `-beta` 后缀 |
| agentflow | `agentflow-beta`（可带方向） | **大小写敏感**，无裸名 |
| zenuml | `zenuml` | 外部 `@mermaid-js/mermaid-zenuml` 注册；只读渲染、**不进 `DIAGRAM_TYPE_LIST` 编辑链** |

### B. 画布 DOM 可寻址性（升版复核本列结论；列「不可寻址」者走 ADR-0007 诚实降级）

| 图种 | 可寻址性（v12 实测） | 复核动作 |
| --- | --- | --- |
| kanban | **可寻址**（节点 DOM id = `{svgId}-{节点id}`，`annotateKanbanDataIds` 反注） | 确认 `.sections`/`.items` 内 `.cluster`/`.node` 的 DOM id 形态未变 |
| requirement | **可寻址**（`{svgId}-{名字}`，`annotateRequirementDataIds` 反注，作用域 `g.root g.nodes g.node`） | 确认统一 dagre 布局器仍落 `g.root > g.nodes` |
| usecase | **可寻址**（渲染器原生写 `data-id`；另有 `data-usecase-id`/`data-usecase-kind`；边 `data-id=edge-N`） | 确认原生 `data-id` 未移除 |
| agentflow | **可寻址**（前缀 `agentflow-`，节点/边均 `data-id`） | 确认前缀未变 |
| venn | **部分可寻址**（集合/交集 `data-venn-sets` 反注为 `data-id`；text/单条 style 无 `data-*` 降级） | 确认 @upsetjs/venn.js 仍写 `data-venn-sets` |
| gitgraph | **不可寻址**（提交 id 只在 `class` 属性；全 chunk 仅 `<defs>` 有 id） | 确认 `drawCommitBullet` 未改 `data-id` |
| timeline | **不可寻址**（`drawNode` 只写 class；背景板 id 走渲染计数器） | 确认无新增 `data-id` |
| journey | **不可寻址**（渲染器无 `data-id`） | 同上 |
| pie | **不可寻址**（无 `data-id`） | 同上 |
| radar | **不可寻址** | 同上 |
| sankey | **不可寻址**（CSV 流渲染无 `data-id`） | 同上 |
| xychart | **不可寻址**（点/系列无 `data-id`） | 同上 |
| treemap | **不可寻址**（且渲染器按值重排 DOM，渲染序 ≠ 源码序） | 同上，**不可用 DOM 索引反推源位置** |
| ishikawa | **不可寻址**（同上，按深度重排） | 同上 |
| wardley | **不可寻址**（`data-*` 计数为 0） | 同上 |
| cynefin | **不可寻址** | 同上 |
| eventmodeling | **不可寻址** | 同上 |
| zenuml | **不可寻址 → 只读渲染降级** | 确认外部包未提供可寻址结构 |

### C. 结构依赖（升版时最易碎的断言，逐图种复核）

1. **连线身份=位置序（ADR-0012）** 适用于所有带连线的图种：state 转移、er 关系、requirement
   关系、block 边、architecture 边、agentflow 边等。升版若改连线渲染顺序，`relation:N` 归属
   随之变化——各图种解析器的关系条数 / 顺序不符即**整体放弃标注**（不误归属）。
2. **缩进即语法**：kanban（卡片归属列）、ishikawa（相对缩进挂因果链）、usecase 等——升版若改
   缩进解析语义，需复核落码缩进。
3. **CSV 流非同构**：sankey 正文是 RFC-4180 变体 CSV，不套行式语句框架；升版若改 CSV 词法
   （引号 / 转义 / 空行），需单独复核 `pipeline/sankey.ts`。
4. **关键字大小写**：treemap / venn / treeview / cynefin / usecase / agentflow / c4 的 `detect`
   **大小写敏感**（与 mermaid 探测器同口径，均无 `i` 位）；升版若放宽关键字大小写，需同步放宽。
5. **裸关键字独占**：venn / treeView / zenuml / eventmodeling / C4 的声明行必须是裸关键字
   （行尾仅空白）；升版若允许同行尾随内容，需同步放宽。
6. **`mermaid.parse` 收口**：`src/lib/__tests__/golden-validity.test.ts` 遍历 `DIAGRAM_TYPE_LIST`
   的每张模板 + 全部新图种关键字的 `detect` 互不误判（`diagram-registry.test.ts`）——升版后
   **这两组测试必须全绿**，任一红即冻结升级。
