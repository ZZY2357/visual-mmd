# 04 画布键盘焦点体系（Tab/Enter 加节点）

Status: ready-for-agent

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
