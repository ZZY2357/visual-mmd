# 04 空图的空白右键菜单

Status: resolved

## 需求

`context-menu.ts:41` 的空白分支目前只对 flowchart 返回 `{ kind: 'blank' }`，class/sequence/mindmap
的空白处右键一律 `null`（菜单不弹）。补齐：

- **classDiagram 空白** → 「添加类」
- **sequenceDiagram 空白** → 「添加参与者」
- **mindmap 空白** → 「添加根节点」
- flowchart 空白菜单维持现状（添加节点 / 连线模式 / 添加样式 / 添加子图），不回归。
- **空 `classDiagram`（只有表头）是 mermaid 解析错误**（画布无 SVG 或停在错误态）——此时右键空白
  **也要能弹出并加类**；加完源码变合法、错误消失、图可渲染。**不改模板**。
- 创建后**直入内联编辑**（与 Tab 流程一致，复用 canvas-interaction 工单 05 的机制）：
  - class：落码 `class 新类`，内联编辑**类名**（`isValidClassName` 接受中文）
  - sequence：落码 `participant 新参与者`，内联编辑**参与者 id**，**不生成 alias**
  - mindmap：落码 `新节点` 纯文本，内联编辑**显示文本**
- mindmap 空白加根节点落地后，**移除属性面板的 `MindmapRootForm` 特殊路径**
  （`src/components/PropertyPanel.tsx:270-275`，组件在 `mindmap-forms.tsx:148-174`）。

## 落码位置

- `src/lib/editing/context-menu.ts:37-50`（`contextMenuTargetFromSelection` 的 blank 分支按 diagramType 分支）、
  `:60-70`（`contextMenuItems` 增加 blank 项）
- `src/lib/editing/use-canvas-context-menu.ts:151-159`（add 动作的接线，现有 `addNode` 可参考）
- 落码意图已存在，无需新增：`add-class`（`class.ts:604-611`）、`add-participant`（`sequence.ts:510-518`）、
  `add-child`（`mindmap.ts:437`）；三者的 `insertAfter` 在只有表头的文档上都回退到表头元素
- `src/components/PropertyPanel.tsx:270-275`、`src/components/mindmap-forms.tsx:148-174`（删除根节点表单）
- i18n：空白菜单项的新文案 key

## 验收

- 空 `sequenceDiagram`：右键空白 → 添加参与者 → 内联编辑 id → 落码 `participant xxx`。
- 空 `mindmap`：右键空白 → 添加根节点 → 内联编辑 → 落码；属性面板不再有根节点表单。
- 空 `classDiagram`（**错误态**）：右键空白 → 添加类 → 落码后错误提示消失、图正常渲染。
- 已有内容的同类图：空白右键也能加（锚点回退到最后一个元素）。
- flowchart 空白菜单不回归。

## 测试

- `context-menu.test.ts`：blank 目标按 diagramType 的判定（class/sequence/mindmap 不再是 null）。
- `use-canvas-context-menu.test.tsx`：点击菜单项 → 断言 `commitIntent` 收到的意图与 afterElementId。
- pipeline 单测：在**只有表头**的文档上 `add-class` / `add-participant` / mindmap `add-child` 各落一条，
  断言输出可被 `mermaid.parse` 接受（金样测试同款校验）。

## Comments

- 实现提交 `e29b069`（合并后 `26db3f3`）。`npm run typecheck` 与 `npm test` 全绿。
- 跨出票面白名单改了 3 个文件，属验收必需的最小改动：`CanvasPanel.tsx`（3 行菜单动作 dispatch，
  否则新菜单项点不动）、`inline-edit.ts`（新增独立类型 `CanvasInlineEditTarget`，class/sequence 落
  `rename-class` / `rename-participant`）、`use-canvas-inline-edit.ts`（trans 目标 + data-id 定位）。
  用独立类型是为了不扩大画布键盘（工单 03/06）的契约。
- 存疑：mindmap 空白加根节点固定预置 `mindmap-node:1`（依赖投影序号契约）；待工单 07 手工验收。
