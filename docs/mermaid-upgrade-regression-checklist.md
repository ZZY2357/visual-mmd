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
