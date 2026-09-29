# 12 「适应窗口」按钮：真实鼠标点击无效（背景拖拽的 setPointerCapture 劫持 click）；键盘 Enter 触发又会顺带加一个节点

Status: resolved

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

### 修复（2026-09-29）

两个缺陷都已修复，根因与工单描述一致；修复前后都在真实浏览器（playwright-cli + Chromium，
`http://localhost:5205/`）做了实测对比。

**根因 A（鼠标点击无效）**：`useCanvasView.onPointerDown` 只用 `closest('svg')` 判断「是不是背景」，
「适应窗口」按钮是画布容器的子节点但不在 `<svg>` 内 → 被当作背景拖拽的起点 → 对容器调用
`setPointerCapture`，把派生的 `click` 劫持到容器，按钮的 `onClick={fit}` 永不执行。

**修复 A**：把命中判定抽成纯函数 `isBackgroundDragTarget(target: Element): boolean`
（放进 `src/lib/canvas-view/view-state.ts`，与既有纯换算同模块）：svg 后代 → `false`；
`button, a[href], input, textarea, select, [contenteditable="true"|""]` 及其后代 → `false`；
其余 → `true`。`onPointerDown` 改为 `if (!isBackgroundDragTarget(e.target as Element)) return`。
`CanvasPanel.tsx` 里既有的浮层守卫（`ctx.menu` / `ctx.styleForm` / `ctx.nodeForm`）保持原样。

**根因 B（Enter 顺带加节点）**：`use-canvas-keyboard.ts` 的 `FOCUS_EXCLUDE_SELECTOR` 不含 `button`，
按钮上的 keydown 冒泡到容器 → 被当作画布节点动作（Enter → 加同级/连出节点）→ 改写源码；
`preventDefault` 又压掉了按钮自身的 Enter→click。

**修复 B**：`FOCUS_EXCLUDE_SELECTOR` 加入 `button`（一处改动同时解决「误落码」与「按钮失去键盘激活」）。

**新增测试**（562 → 568）：
- `src/lib/canvas-view/__tests__/view-state.test.ts`：`isBackgroundDragTarget` 5 个用例 ——
  `<button>`（含嵌套 `<span>`）、`<input>`、`<a href>`、`[contenteditable]` → `false`；
  普通 `<div>` 背景 → `true`；无 href 的 `<a>` → `true`；`<svg>` 及后代（`g`/`text`）→ `false`。
- `src/lib/editing/__tests__/use-canvas-keyboard.test.tsx`：工单 04 describe 内新增
  「焦点在容器内（背景拖拽区）的按钮上」用例 —— 容器内挂真实 `<button><span>适应窗口</span></button>`，
  focus 按钮后在 `<span>` 上派发 Enter，断言 `defaultPrevented === false` 且源码逐字不变。
  既有「焦点逃出容器」用例（容器外 `<button>`）保持绿色。

**验证**：
1. `npm run typecheck` → exit 0。
2. `npm test` → 44 files / 568 tests 全绿（基线 44 / 562，新增 6 个用例）。
3. 真实浏览器（dev :5205 + playwright-cli，示例为默认 flowchart，滚轮把 scale 放到 2.x）：

   A（真实鼠标点击按钮）：
   - 修复前：`pd = [SPAN:适应窗口]`、`clicks = [DIV:#mmd-previ…]`（click 被劫持到容器）；
     transform 点击前后逐字相同：`translate(-14.2711px, -266.542px) scale(2.10488)`
     （点击前 / 点击后同值，视图无变化）。
   - 修复后：`pd = [SPAN:适应窗口]`、`clicks = [SPAN:适应窗口]`；transform
     `translate(-14.2711px, -266.542px) scale(2.10488)` → `translate(116.676px, 24px) scale(0.994275)`
     （回到居中 fit，scale < 2）。

   B（focus 按钮后按 Enter，每次迭代都重新 `focus()` 按钮后再按，避免第一次点击后焦点已被容器
   收走而混入合法的画布键盘操作）：
   - 修复前：fit 执行，但源码同时被改写 —— 连续三次 Enter 让 `A[开始]` 连出 `n1`/`n2`/`n3`
     （落码 `A --> n1`、`n1[n1]` …），预览 id `mmd-preview-3 → 4 → 5`。注意 flowchart 新节点
     用节点 id 作占位文本（见 `useCanvasKeyboard` 文档），所以工单里的 `新节点` 计数不涨，
     这里按落码节点数记为 0 → 1 → 2 → 3。
   - 修复后：`document.activeElement` 为 `<button>适应窗口`；Enter 后 transform
     `scale(2.10488)` → `scale(0.994275)`（fit 确实执行），预览 id 不变（`mmd-preview-2`），
     源码逐字不变（连续三次均无新节点，`新节点` 计数保持 0）。

   回归：空白背景按住拖拽仍平移视图 —— `translate(116.676px, 24px)` →
   `translate(226.676px, -11px)`，位移量与鼠标位移一致、scale 不变。

4. `git status` 仅上列 5 个文件 + 本工单评论，无其它改动。
