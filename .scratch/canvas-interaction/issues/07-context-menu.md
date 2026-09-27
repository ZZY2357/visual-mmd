# 07 右键菜单与连线模式

Status: resolved

## 需求

- 画布右键弹出菜单（阻止浏览器默认菜单；代码面板保留默认行为），单一菜单随右键目标
  变化：
  - 空白处：添加节点、添加连线（进入连线模式）、添加样式、添加子图（flowchart）。
  - 节点上：从这里连线、编辑文本（进入内联编辑）、应用样式（子菜单/展开）、删除。
  - 连线上：编辑标签、删除。
  - mindmap 节点上：添加子节点、编辑文本、删除。
- 连线模式：进入后光标变十字，依次单击起点、终点即创建连线；Esc 或点击空白取消；
  节点右键"从这里连线"省选起点一步。
- 添加样式：菜单位置浮出小表单（名称 + 颜色），提交才落码。
- 属性面板上的"添加节点/添加连线/添加样式"按钮组彻底移除，结构树保留。
- 所有动作复用现有编辑意图管线；添加节点后走内联命名（工单 05）。

## 验收

- 右键空白/节点/连线出现对应菜单；连线模式两步完成连线，Esc 可退。
- 属性面板不再有添加按钮组。

## Comments

- 纯逻辑：`src/lib/editing/context-menu.ts`（右键目标解析 + 菜单项映射，sequence/class
  节点本轮无菜单语义安静关闭）、`src/lib/editing/link-mode.ts`（连线模式状态机：
  idle → pick-start → pick-end → 完成；预选起点直接落 pick-end；Esc/空白取消）。
- Hook：`src/lib/editing/use-canvas-context-menu.ts` 托管菜单/连线模式/添加样式表单三个
  状态；contextmenu 只挂画布容器（代码面板保留默认菜单）；所有动作复用 commitIntent
  编辑意图管线；添加节点走 nextNodeId + beginEdit 内联命名；mindmap 添加子节点复用
  mindmapActionIntents；连线上「编辑标签」联动选中（EdgeForm 承接）。
- 画布：`CanvasPanel.tsx` 接入右键菜单浮层（应用样式原地展开子列表）与「添加样式」
  小表单（名称 + 颜色，提交才落码）；连线模式光标十字，画布单击优先被连线模式消费。
- 属性面板：`PropertyPanel.tsx` 移除「添加」按钮组（AddElementsBox）与 AddKind 状态，
  结构树保留；mindmap 空图的根节点起步表单保留。
- i18n：`app:canvas.menu.*` 新增菜单文案与样式表单文案。
- 测试：`context-menu.test.ts`、`link-mode.test.ts`、`use-canvas-context-menu.test.tsx`
  （目标解析/状态机/hook 行为：菜单联动、添加节点、连线两步与 Esc、样式表单校验、
  mindmap 子节点）。npm test 402 通过，npm run typecheck 通过。
