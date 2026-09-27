# 05 内联编辑 + 新节点立即命名

Status: resolved

## 需求

- 双击节点 → 在该节点原位浮出输入框（覆盖原文本位置，随画布缩放/平移变换定位），
  预填当前显示文本；回车或失焦提交（落码改文本），Esc 取消。
- Tab/Enter/右键菜单添加节点后自动进入同一输入框（新节点立即命名）。
- 覆盖 flowchart + mindmap（sequence/class 不做）。
- 需要节点屏幕坐标：从投影/渲染 SVG 中读取元素包围盒，经视图变换换算。

## 验收

- 双击 flowchart 节点与 mindmap 节点均可原位改文本；新建节点后输入框自动弹出。
- 缩放/平移画布后双击，输入框仍对准节点。

## Comments

- 2026-09-27（agent）：已实现并自验通过。
  - 纯逻辑 `src/lib/editing/inline-edit.ts`：双击目标寻址（flowchart data-id 精确匹配；
    mindmap 无稳定 data-id，按可见文本对投影节点尽力匹配）、输入值 → set-node-text
    意图（未改动/清空不落码）、节点包围盒 → 相对画布容器的浮层定位换算。
  - Hook `src/lib/editing/use-canvas-inline-edit.ts` + `CanvasPanel` 接线：双击浮出输入框，
    预填当前显示文本；回车/失焦提交（commitIntent 落码，可撤销）、Esc 取消；SVG 重渲染
    与视图缩放/平移时重算定位，覆盖 flowchart + mindmap（sequence/class 不参与）。
  - 工单 04 占位接通：`useCanvasKeyboard` 的 `onNodeCreated` → 立即进入同一输入框
    （新建节点先以默认名落码，确认后改文本）；`CanvasPanel` 的预留 prop 因此移除。
  - 单测：`inline-edit.test.ts`（寻址/提交/取消/定位换算）、
    `use-canvas-inline-edit.test.tsx`（双击进入、提交落码、未改动与 Esc 不落码、
    beginEdit 路径）。`npm test` 348 passed；`npm run typecheck` 通过。
