# 05 · 菜单项动作分发从 26 分支链改成表

Status: resolved
Blocked by: —
Type: task

## 现状（已核实）

`CanvasPanel.tsx:523-556` 的 `onMenuItem` 是一条 26 分支的 if-else 链，**无 default**。
漏一项的后果是点击静默无反应——不报错、不报红。

好消息是**另外三处已经是表驱动的**：

- `ContextMenuItemId` union（`context-menu.ts:43`）
- `contextMenuItems(target)`（`context-menu.ts:151`）——按目标返回菜单项列表
- 标签 `t(\`app:canvas.menu.${id}\`)`（`CanvasPanel.tsx:222`）——按命名约定直接取 i18n

所以本工单只差**动作**这一项没有表。范围比扫描报告里估计的小。

## 方案形状

```ts
// src/lib/editing/menu-actions.ts
export type MenuAction = (ctx: CanvasMenuContext, target: ContextMenuTarget | undefined) => void

export const MENU_ACTIONS: Record<ContextMenuItemId, MenuAction> = {
  'add-node': (ctx) => ctx.addNode(),
  'link-mode': (ctx) => ctx.enterLinkMode(),
  // ...
}
```

关键收益来自 `Record<ContextMenuItemId, MenuAction>`：**漏一项是编译错误**，
而当前的静默无反应正是漏项的典型症状。这一条把运行期静默失败变成了类型层不可构造。

调用方只剩一行：

```ts
const onMenuItem = (id: ContextMenuItemId): void => {
  MENU_ACTIONS[id](ctx, ctx.menu?.target)
}
```

## 需要单独处理的两个分支

- **`link-from-here`**：唯一依赖 `target` 且要 narrow 到 `flowchart-node` 的分支
  （`CanvasPanel.tsx:545-547`）。表里的动作签名带 `target` 就是为了它，逻辑原样搬。
- **删除组 6 项**（`delete-class` / `delete-participant` / `delete-relation` /
  `delete-message` / `delete-note` / `delete-block`）共用 `ctx.deleteTarget()`。
  表里直接写 6 行即可——**不要**为了少写 6 行而引入二级查表，那就把简单问题复杂化了。

## 分步

1. 建 `menu-actions.ts`，把 26 个分支逐个搬进 `MENU_ACTIONS`（含上述两个特殊分支）。
2. `CanvasPanel` 的 `onMenuItem` 换成查表。
3. 删除 26 分支链。
4. 加一条快照测试钉住 `MENU_ACTIONS` 的键集合，防止将来有人加菜单项却忘了动作
   （`Record` 已在类型层保证，快照是为了在 review 里看得见）。

## 测试

- 类型层：`Record<ContextMenuItemId, MenuAction>` 本身即保证穷尽，无需额外测试。
- 行为层：`context-menu.test.ts` 与 `use-canvas-context-menu.test.tsx` 应零改动全绿。
- 新增：`MENU_ACTIONS` 的键集合与 `contextMenuItems` 能返回的全部 id 取并集——
  断言二者一致（防止出现「菜单能显示但点了没反应」的项）。

## 验收

- `CanvasPanel.tsx` 里不再有 `else if (id === ...)`。
- 全量测试绿。
- 加一个新菜单项的改动点从 4 处（union / 菜单表 / i18n / 分发链）降到 3 处，且第 3 处编译期兜底。

## 风险

- 低。这是六个候选里唯一一个「接口已经存在、只是没用上」的改动，无语义风险。
- 唯一要小心的是搬的时候别顺手改动作语义——本工单是纯搬运 + 换分发方式。

## Decision（已定案）

**独立 `src/lib/editing/menu-actions.ts`。**

被否掉的替代是并入 `editing/context-menu.ts`（174 行）：那个文件现在管「菜单长什么样」
（`ContextMenuTarget` / `contextMenuItems` / `blankMenuItems`），动作管「点了做什么」，
两者变化频率不同——加一个菜单项改的是前者，改一个动作的接线改的是后者。
合在一起会让同一个文件承担两种变更理由。

不为此开 ADR：这是显而易见的选择，没有值得记住的被否决方案。

## 实施记录

2026-09-29，分支 `ticket-05-menu-actions`。

- 新增 `src/lib/editing/menu-actions.ts`：`MENU_ACTIONS: Record<ContextMenuItemId, MenuAction>`（27 键，含删除组 6 行、`link-from-here` narrow 原样搬）。
- `CanvasPanel.tsx` 的 `onMenuItem` 换成一行查表 `MENU_ACTIONS[id](ctx, ctx.menu?.target)`，26 分支链删除。
- 新增 `src/lib/editing/__tests__/menu-actions.test.ts`：断言 `MENU_ACTIONS` 键集合与 `contextMenuItems` 对全部目标形状（blank × 4 图种 + 其余 9 种 kind）返回 id 的并集一致。

### 验收 grep 实测

- `grep -c "else if (id ===" CanvasPanel.tsx` → `0`（不再有分发链；唯一残留的 `id === 'apply-style'` 是菜单渲染的子菜单开关三元，非分发）。
- 新加菜单项改动点 4 → 3，第 3 处（动作表）由 `Record` 编译期兜底。

### 与分步的偏差（1 处，需知悉）

union 里有 `apply-style`（27 个 id），但原 26 分支链里**没有**它——它在 CanvasPanel 中被渲染成子菜单开关，点样式名直接调 `ctx.applyStyle(name)`，从不经 `onMenuItem`。由于 `Record` 要求穷尽，表里保留了 `'apply-style'` 键，但实现为显式 no-op 并注释说明不可达（`ctx.applyStyle` 签名要求 className 参数，无参调用不成立）。穷尽性测试因此是「键集合 == 菜单 id 并集」直接相等，无需例外。

### 测试

全量 `npm test`：**58 文件 834 用例全绿**（基线 57/832，+1 文件 +2 用例）。`npm run typecheck` 绿。行为层 `context-menu.test.ts` 与 `use-canvas-context-menu.test.tsx` 零改动全绿。
