# 01 连线点选命中修复

Status: resolved

用户反馈：画布上连线点不了（选中无效）。边在 SVG 中的可视描边很窄，命中区域过小。

## 需求

- 给 flowchart 渲染出的每条边加透明宽命中路径（stroke-width 约 12px、stroke 透明、
  pointer-events 命中），复用现有 `data-id` 点选链路（`use-canvas-selection.ts`）。
- 点击连线后进入边选中态，右侧属性面板联动切换到 EdgeForm。
- 选中态视觉与其他元素统一（外圈描边高亮）。

## 验收

- flowchart 画布中单击任意连线可选中，属性面板显示该边的标签/线型/箭头表单。
- 节点点击选中不受影响。

## Comments

实现要点：

- 新增 `src/lib/canvas-selection/edge-hit-area.ts`：`addEdgeHitAreas` 对渲染 SVG 中
  `g.edgePaths` 内每条带 `data-id` 的边 path 克隆一条命中路径（`data-vm-hit` 标记），
  内联样式 `stroke: transparent; stroke-width: 12px; fill: none; pointer-events: stroke`，
  并去掉 marker-start/marker-end 避免透明描边重绘箭头。幂等（重复调用不重复克隆）。
- 接入点：`use-canvas-selection.ts` 的高亮 effect 中先补命中区域再打高亮——该 effect
  在 SVG 重注入与选中变化时都会运行，命中克隆随之保持最新。
- 选中链路零改动：命中克隆复制原 path 的 `data-id`（`L_{from}_{to}_{n}`），点击经
  `edgeDataIdResolver` 解析为边选中 → `CanvasPanel` → store → `PropertyPanel` 切换
  EdgeForm（标签/线型/箭头等），与结构树点选共用同一链路。
- 选中态视觉复用既有 `[data-vm-selected]` filter 光晕（高亮按 data-id 匹配全部元素，
  原边 path 与命中克隆同时被标记，视觉与节点统一），无新增 i18n 文案。

验证结果：

- 新增单测 `src/lib/canvas-selection/__tests__/edge-hit-area.test.ts`（4 项：克隆注入与
  样式/data-id、命中克隆经 data-id 链路解析出边选中、幂等、marker 移除）。
- `npm test` 306/306 通过；`npm run typecheck` 通过（无 lint script）。
