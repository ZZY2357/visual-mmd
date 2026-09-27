# 01 连线点选命中修复

Status: ready-for-agent

用户反馈：画布上连线点不了（选中无效）。边在 SVG 中的可视描边很窄，命中区域过小。

## 需求

- 给 flowchart 渲染出的每条边加透明宽命中路径（stroke-width 约 12px、stroke 透明、
  pointer-events 命中），复用现有 `data-id` 点选链路（`use-canvas-selection.ts`）。
- 点击连线后进入边选中态，右侧属性面板联动切换到 EdgeForm。
- 选中态视觉与其他元素统一（外圈描边高亮）。

## 验收

- flowchart 画布中单击任意连线可选中，属性面板显示该边的标签/线型/箭头表单。
- 节点点击选中不受影响。
