# 06 mindmap 画布点选 + 结构树键盘

Status: ready-for-agent

## 需求

- 启用 mindmap 画布点选（解除 `CanvasPanel.tsx` 中 `() => null` 的禁用），需要
  mindmap 渲染 SVG 的 data-id 适配器与投影选中解析（node → MindmapNodeForm）。
- mindmap 画布键盘同 flowchart 方案（工单 04）：Tab 加子节点、Enter 加同级、Del 删除。
- 结构树键盘：焦点在树节点上时，Tab 加子节点 / Enter 加同级节点（preventDefault），
  落码按缩进层级；新节点同样触发内联命名占位。
- mindmap 双击内联编辑由工单 05 覆盖。

## 验收

- mindmap 画布单击节点可选中并联动属性面板；Tab/Enter 在结构树与画布两处均可加节点。
