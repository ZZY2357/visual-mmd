# 06 mindmap 画布点选 + 结构树键盘

Status: resolved

## 需求

- 启用 mindmap 画布点选（解除 `CanvasPanel.tsx` 中 `() => null` 的禁用），需要
  mindmap 渲染 SVG 的 data-id 适配器与投影选中解析（node → MindmapNodeForm）。
- mindmap 画布键盘同 flowchart 方案（工单 04）：Tab 加子节点、Enter 加同级、Del 删除。
- 结构树键盘：焦点在树节点上时，Tab 加子节点 / Enter 加同级节点（preventDefault），
  落码按缩进层级；新节点同样触发内联命名占位。
- mindmap 双击内联编辑由工单 05 覆盖。

## 验收

- mindmap 画布单击节点可选中并联动属性面板；Tab/Enter 在结构树与画布两处均可加节点。

## Comments

- 关键事实（实测 mermaid v12 dist 确认）：mindmap 渲染不发 `data-id`，但每个节点
  `<g>` 带 DOM id `node_N`（N = 源码节点行 0 起序），与解析器 `mindmap-node:{N+1}`
  编号一一对应。故在 `data-id.ts` 的选中解析与 `highlight.ts` 的高亮中加入 DOM id
  回落（data-id 优先），`mindmap-adapter.ts` 负责 `node_N ↔ mindmap-node:{N+1}` 映射。
- 画布键盘：`useCanvasKeyboard` 泛化为 tagged union（flowchart | mindmap），mindmap
  动作 → 意图见 `canvas-keyboard.ts` 的 `mindmapActionIntents`（落码按缩进层级，根节点
  Enter 退化为加子，同 flowchart 方案）；新节点 elementId 确定性预计算。
- 结构树键盘：MindmapTree 树节点聚焦时 Tab/Enter（preventDefault）→ `mindmapActionIntents`
  落码 → 选中 → 经 store 新增的 `pendingInlineEdit` 请求（gotoLine 同款 nonce 模式）
  通知 CanvasPanel 进入内联命名。
- 内联编辑：双击 mindmap 现优先走 resolver（DOM id 精确匹配），文本匹配保留为回落；
  浮层定位同样优先按 DOM id。工单 05 双击行为保持可用。
- 自验：npm test 34 文件 371 用例全过；npm run typecheck 无错。
