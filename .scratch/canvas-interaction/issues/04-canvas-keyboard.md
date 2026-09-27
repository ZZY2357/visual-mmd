# 04 画布键盘焦点体系（Tab/Enter 加节点）

Status: resolved

## 需求

- 画布容器 `tabindex=0`，点击画布后持有焦点；focus 样式去掉默认 outline。
- Tab/Enter/Del 仅在画布聚焦时拦截生效（preventDefault，阻止浏览器"选中下一个表单
  元素"）；焦点在代码面板或任何输入框时完全不拦截。
- Flowchart 语义（在现有 `canvas-keyboard.ts` 基础上扩展）：
  - Tab = 从选中节点连出新节点：`选中 --> 新节点`。
  - Enter = 选中节点有入边时 `父 --> 新节点`；无入边时 `选中 --> 新节点`。
  - 新节点 id 沿用现有自动命名惯例。
- 新节点创建后触发内联命名（工单 05 提供 hook，本单先接占位）。

## 验收

- 点选节点后按 Tab/Enter 分别加子/同级节点，浏览器焦点不跳走。
- 焦点在代码面板打字时按 Tab 是正常缩进/跳格。

## Comments

- 实现方式：`use-canvas-keyboard.ts` 的 keydown 从 window 级改为挂在画布容器上——
  焦点在代码面板/输入框时事件根本不会到达容器，天然满足"只在画布聚焦时拦截"；
  容器内输入控件的排除逻辑（`.cm-editor, input, …`）防御性保留。
- `CanvasPanel` 容器加 `tabindex=0`、`outline: none`，点击（含节点）时显式 `focus()`。
- Tab/Enter/Del 语义与新节点 id 命名沿用既有 `canvas-keyboard.ts`（前序工单已实现），
  本单将其接入画布焦点体系。
- 工单 05 占位：`CanvasPanelProps.onNodeCreated(nodeId)` 回调，新节点落码并选中后触发；
  内联命名实现留待工单 05。
- 新增 `use-canvas-keyboard.test.tsx`（happy-dom + react act）：容器聚焦时 Tab/Enter
  生效并 preventDefault、输入控件与容器外不拦截、未选中节点不处理、onNodeCreated 回调。
- 验证：npm test 333 通过；npm run typecheck 通过。
