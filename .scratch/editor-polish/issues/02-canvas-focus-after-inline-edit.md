# 02 内联编辑后的焦点归还

Status: resolved

## 需求

复现：Tab 新建节点 → 输入显示名称 → Enter → 再按 Tab **不能**再建节点（Enter 同样失效）。
根因（已核实）：内联输入框提交后卸载，React 19 不把焦点还给已移除的元素，焦点落到 `<body>`，
而 keydown 监听挂在画布容器上（`use-canvas-keyboard.ts:94`），事件到不了容器；事后无任何代码
把焦点还给容器。

- **Enter / Escape 提交后把焦点归还画布容器**，使 Tab/Enter/Delete 立即可用于连续操作。
- **失焦提交（点击画布之外，如代码面板）不归还焦点** —— 否则用户点代码面板会被拽回画布。
- 点击画布空白/节点时归还焦点（既有行为，保留）。
- 修 `src/components/CanvasPanel.tsx:412/414`：目前
  `if (closest('input, textarea, .cm-editor') === null) focus()` 之后紧跟一句**无条件** `focus()`，
  守卫是死代码 → 鼠标点内联输入框会立刻失焦并触发 `onBlur` 提交。改为仅在点击目标是画布
  背景/节点时才 `focus()`。
- 维持监听挂**容器**（不升到 window）：升 window 会劫持全站 Tab/Enter，污染代码面板的
  `indentWithTab`（`CodePanel.tsx:77`）与所有输入框。契约见 ADR-0010。

## 落码位置

- `src/lib/editing/use-canvas-inline-edit.ts`（`commit` 的调用点需要区分提交来源）
- `src/components/CanvasPanel.tsx:88-131`（内联输入框的 onKeyDown/onBlur）、`:392-438`（容器）、
  `:407-423`（onClick 聚焦逻辑）
- `src/lib/editing/use-canvas-keyboard.ts`（不动挂载方式，只依赖焦点已归还）

实现提示：提交来源可用事件类型区分（keydown 提交 → 归还；blur 提交 → 不归还）；归还时机要避开
本次提交引发的重渲染，可用 `queueMicrotask` 或在 React 提交后置一个标记。

## 验收

- Tab → 输入 → Enter → Tab → 输入 → Enter → Tab：连续加出三层子节点。
- Escape 取消编辑后，Tab 仍可用。
- 点代码面板再点回画布，Tab 恢复可用。
- 鼠标点击内联输入框可以正常聚焦并输入（不再一点即提交）。
- 焦点在代码面板打字时 Tab 仍是缩进（不回归）。

## 测试

- `use-canvas-inline-edit.test.tsx`：Enter 提交后断言 `document.activeElement` 是画布容器；
  blur 提交后**不是**。
- `use-canvas-keyboard.test.tsx`：现有用例是直接向容器 dispatch 事件，掩盖了"焦点掉到 body"这一
  路径；补一条"提交后不重新聚焦则事件不生效"的用例把 bug 钉住（或改为端到端的焦点断言）。

## Comments

- 实现提交 `188ad36`（合并后 `469657e`）。`npm run typecheck` 与 `npm test` 全绿。
- `use-canvas-keyboard.ts` 未改动，监听仍挂画布容器（ADR-0010）。
- 存疑：`CanvasPanel.tsx` 无组件级测试，抢焦点死守卫的修复靠走查验证（票面只允许改两个测试文件）；
  `.canvas-inline-edit` 是否落在 Mantine wrapper 根属推断，待工单 07 手工验收确认。
