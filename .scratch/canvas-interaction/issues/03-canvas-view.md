# 03 画布视图（缩放/平移/fit）

Status: resolved

## 需求

- 画布改为 viewport 模式：初始整图自适应居中（fit）。
- 纯滚轮以鼠标位置为锚点缩放，范围 0.25–4 倍，不做 Ctrl 区分；preventDefault 阻止
  页面滚动。
- 按住背景（非元素）拖拽平移视角。
- 提供浮动的"适应窗口"按钮，一键回到 fit。
- 缩放/平移状态不持久化，切换图表时重置为 fit。
- 导出 SVG/PNG 始终整图，不受视图影响（导出走原始 SVG，与视图变换无关）。

## 验收

- 滚轮缩放以光标为中心；拖拽背景平移；适应窗口按钮恢复整图居中。
- 导出的 SVG/PNG 与缩放平移前一致。

## Comments

- 2026-09-27 实现完成。新增 `src/lib/canvas-view/`：`view-state.ts` 纯换算（fit / 锚点缩放 / 0.25–4 clamp，fit 上限 1 避免小图放大失真），`use-canvas-view.ts` Hook（SVG 换新即重新 fit → 切换图表自然重置；`passive: false` 滚轮以鼠标为锚点缩放并 preventDefault；`setPointerCapture` 背景拖拽平移）。
- 变换只落在渲染 SVG 元素的 CSS transform 上，不改 SVG 内容；导出（App.tsx）走 `preview.svg` 原始字符串，产物与视图无关。
- `useCanvasSelection` 增加可选 `containerRef` 参数，选中链路与视图共享同一容器（工单 01 命中路径注入不受影响）。
- 画布容器改 `overflow: hidden`，右上角浮动「适应窗口」按钮（i18n `canvas.fitView`）一键回 fit。
- 单测：`src/lib/canvas-view/__tests__/view-state.test.ts`（fit / clamp / 锚点不变性 / svgIntrinsicSize）。npm test 328 通过，typecheck 通过。
