# 04 补全添加入口：让「右键菜单是唯一入口」成立

Status: pending

**Blocked by: 02**（note/block 的右键目标要能落在连线或空白上，02 提供定位能力）

来源：`spec.md` 的 Q2 定案（**(甲) 补入口让定义成立**）。这是 (c) 类缺口，也是**模型与实现的对峙**：

- `CONTEXT.md:74` 定义「元素的添加入口在画布右键菜单，不在属性面板」，
  `:78` 称右键菜单为「元素添加的**唯一入口**」。
- 实况：**sequence 的 `add-note` / `add-block`、class 的 `add-note` 没有任何画布入口**；
  结构树是纯选中器（只有 select），也不提供添加动作。
- 即用户**无法在画布上给时序图加 `alt` 块或注释、给类图加注释**，只能手写源码。

## 需求

补全缺失的添加入口，**全部落在右键菜单上**（不把结构树改成"也能加"——那会引入第二套添加心智）：

| 图种 | 右键目标 | 菜单项 | 已有意图 |
|---|---|---|---|
| sequence | 空白 | 添加注释（`note over`） | `add-note`（`sequence.ts:959`） |
| sequence | 空白 | 添加块（loop/alt/opt/par/critical/break） | `add-block`（`:966`） |
| sequence | 参与者 | 添加块（以该参与者为块内首条消息的端点） | `add-block` |
| class | 空白 | 添加注释（浮动 note） | `add-note`（`class.ts:908`，className 缺省=浮动） |
| class | 类节点 | 添加注释（`note for X`） | `add-note`（带 `className`） |

**不新增任何 pipeline 意图**——全部已存在，本票纯 UI 接线。

## 落码位置

- `src/lib/editing/context-menu.ts`：`ContextMenuItemId` 与 `contextMenuItems` 补项；
  空白菜单（`blankMenuItems :72-83`）与节点菜单（`:105-108`）扩容。
- `src/lib/editing/use-canvas-context-menu.ts`：新菜单项的浮层接线
  （**复用 `AddNoteInlineForm` / `AddBlockInlineForm` 的形态**——注意工单 06 曾**删除**这两个表单
  （`06-...md:94-96`：`sequence-forms.tsx` 的 `AddNoteInlineForm` / `AddBlockInlineForm`、
  属性面板的 `AddNodeInlineForm` 等 9 个）。本票需要**重建**其中 sequence 的两个，
  建议从 git 历史取回原实现再按右键菜单需求调整，而非重写）。
- `src/components/sequence-forms.tsx` / `property-forms.tsx`：表单重建。
- i18n：菜单项与表单 label（工单 06 删过一批 key，需重新加回，别用已删的旧 key 名造成混乱）。

## 不变量

- **顺序即语义**：`add-block` 的 `afterElementId` 决定块插在哪——必须是用户右键的那个位置。
- 空图右键（工单 04 的既有能力：class 加类 / sequence 加参与者）不回归。
- 结构树保持**纯选中器**（ADR 层面的决定，见 spec 决策记录）。

## 测试

- `context-menu.test.ts`：新菜单项在正确的目标上出现、在错误的目标上不出现。
- `use-canvas-context-menu.test.tsx`：点击 → 断言 `commitIntent` 的意图与 `afterElementId`。
- pipeline 的 `add-note` / `add-block` 已有单测，无需新增。

## 验收

- [ ] sequence 图：空白右键 → 能加注释、能加块（六种关键字都可选）；落码位置正确、图可渲染。
- [ ] sequence 图：参与者右键 → 能加消息（既有）、能加块；块以该参与者为端点。
- [ ] class 图：空白右键 → 能加浮动注释；类节点右键 → 能加 `note for X`。
- [ ] **端到端场景 B 走通**：加参与者 → 互发三条消息 → 包一个 alt 块并写条件 → 右键一条消息改箭头并删掉它。
- [ ] 所有落码走 `commitIntent`（撤销/重做可用）。
- [ ] 控制台 0 error / 0 warning。
