# 12 「适应窗口」按钮：真实鼠标点击无效（背景拖拽的 setPointerCapture 劫持 click）；键盘 Enter 触发又会顺带加一个节点

Status: needs-triage

来源：工单 07 手工验收「07 回归」的**题外观察（非清单条目）** —— 为验证「导出不受画布视图
（缩放/平移）影响」而需要缩放/平移/复位视图时，发现画布右上角「适应窗口」按钮点不动。
**不是本批改动引入的回归**（该按钮与背景拖拽的指针捕获都属工单 03 的画布视图），
但真实浏览器上该按钮对鼠标完全不可用，且键盘路径会误改源码。

## 需求

复现步骤 A（鼠标点击无效）：

1. 打开 `http://localhost:5199/`，`localStorage.clear()` 后 reload，「新建」→「流程图」。
2. 在画布上滚动滚轮把图放大（`svg` 的 transform scale 变成 2.x）。
3. 用真实鼠标点击画布右上角「适应窗口」按钮中心。

预期：视图回到 fit（整图居中，scale 变为适配值）。

实测：**视图完全不变**（transform 逐字相同）；按钮没有任何反应。

证据：

- 用 `document` 捕获阶段监听同时记录 `pointerdown` 与 `click`：
  `pointerdown` 落在按钮内的 `SPAN`（文本「适应窗口」），而随后派发的 `click` 目标是
  **画布容器 `DIV`**（`e.target.tagName === 'DIV'`、`textContent` 以 `#mmd-preview-` 开头），
  按钮的 `onClick` 从未执行 —— 实测记录
  `pd = [SPAN:适应窗口]`、`clicks = [DIV:#mmd-previ…]`。
- transform 前后逐字相同：`max-width: none; transform-origin: 0px 0px; transform: translate(-618.089px, -70.8216px) scale(2.02418);`
  （点击前 / 点击后同值）。
- 根因（读码 + 实测一致）：`src/components/CanvasPanel.tsx` 的容器 `onPointerDown` 对「不在 `<svg>` 内」
  的指针按下调用 `setPointerCapture`（背景拖拽平移），按钮是容器子节点、不在 SVG 内，指针捕获把
  派生的 click 劫持到容器。已有的守卫（`4b3c065`）只覆盖 `ctx.menu` / `ctx.styleForm` / `ctx.nodeForm`
  三种浮层，未覆盖这个常驻按钮。

复现步骤 B（键盘路径会顺带加节点）：

1. 承上，让画布上有选中节点（例如点选节点 `A`，属性面板出现节点表单）。
2. 把焦点放到「适应窗口」按钮上（`locator.focus()`，实测 `document.activeElement` 就是该 `<button>`）。
3. 按 `Enter`。

预期：只执行 fit（回到居中视图），源码不变。

实测：`fit()` **确实执行**（transform 变为居中值
`translate(24px, 190.079px) scale(0.873601)`），**但同时源码被插入一个 `新节点`**：
`…画布\n        实时渲染预览\n    属性面板…` → `…画布\n        实时渲染预览\n    新节点\n    属性面板…`
（`新节点` 出现次数 0 → 1）；再重复一次变成 2。即「按 Enter 复位视图」会顺带改源码。

证据：

- 键盘路径实测返回：`{"ae":"<button class=\"mantine-focus-auto …Button-root …\"","idBefore":"mmd-preview-91",
  "trBefore":"…scale(2.31606);","idAfter":"mmd-preview-92","trAfter":"…translate(24px, 242.661px) scale(0.746288);"}`
  —— `idAfter` 变了说明源码变更触发了重渲染，随后 `新节点` 计数 0 → 1 → 2。
- 根因（读码 + 实测一致）：`src/lib/editing/use-canvas-keyboard.ts:31-32` 的
  `FOCUS_EXCLUDE_SELECTOR = '.cm-editor, input, textarea, select, [contenteditable…]'` **不含 `button`**，
  keydown 从按钮冒泡到容器监听器后未被排除 → Enter 被当作画布节点操作
  （`keyToNodeAction`）→ 落码加同级别节点。

## Comments

（空）
