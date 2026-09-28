# 06 class/sequence 的节点右键菜单

Status: ready-for-agent

## 需求

`context-menu.ts:42-46` 对 class/sequence 的节点返回 `null`，即这两类图的节点右键**完全没有菜单**
（不只是空图 —— 空图那条在工单 04）。`CONTEXT.md` 把右键菜单定义为"元素添加的唯一入口"，
所以这是模型与实现不一致的洞，本批补齐**最小可用集**：

- **class 类的节点菜单**：添加成员（`add-member`）/ 添加关系（`add-relation`）/ 删除类（`delete-class`）
- **sequence 参与者的节点菜单**：添加消息（`add-message`）/ 删除参与者（`delete-participant`）
- 注释、块、条件分支**本批不做**（留在非目标里）。

**关键前提：pipeline 意图与级联语义全部已存在，本票只做 UI 接线。**

- 意图：`add-member { className, vis?, text?, afterElementId? }`、`add-relation { from, to, kind,
  cardFrom?, cardTo?, label?, afterElementId? }`、`delete-class { name }`（`class.ts:881-915`）；
  `add-message { from, to, arrow?, act?, text?, afterElementId? }`、`delete-participant { actorId }`
  （`sequence.ts:849-881`）。
- 级联无需新定：`resolveDeleteClass`（`class.ts:660-682`）连带类体成员与引用该类的 relation；
  `resolveDeleteParticipant`（`sequence.ts:582-593`）连带所有引用该 actor 的语句。
- 画布选中已可用：class/sequence 的节点选中 id 就是**类名 / 参与者 actorId**
  （`CanvasPanel.tsx:48-53` 的 `resolverOf` + `nodeDataIdResolver`）。

死代码表单的裁决（由本票负责，工单 07 删掉面板入口后遗留）：

- **保留并接线 3 个**：`AddMemberInlineForm`（`class-forms.tsx:278`）、
  `AddRelationInlineForm`（`class-forms.tsx:319`）、`AddMessageInlineForm`（`sequence-forms.tsx:351`）。
- **本批不接线的其余 `Add*InlineForm` 直接删除**（连同其专属 i18n key）：
  `class-forms.tsx:246/360`、`sequence-forms.tsx:320/406/456`、`property-forms.tsx:355/384/425/447`。
  若某处删除牵连过大（被其它模块间接引用等），允许保留但必须在 Comments 里写明原因。

## 落码位置

- `src/lib/editing/context-menu.ts`：
  - `ContextMenuTarget` 增加 `{ kind: 'class-node'; name: string }` 与
    `{ kind: 'sequence-participant'; actorId: string }`
  - `contextMenuTargetFromSelection:42-46` 的节点分支补两个图种
  - `ContextMenuItemId` 增加 `add-member | add-relation | delete-class | add-message | delete-participant`
  - `contextMenuItems:60-70` 补两个 case
  - 文件头注释里"sequence/class 的节点本轮未定义其菜单"的说明要同步改掉
- `src/lib/editing/use-canvas-context-menu.ts`：新菜单项的动作接线（落码 intent + 表单浮层；
  参考现有 flowchart `add-node` / `add-style` 的浮层实现 `:151-159`、`:202-227`）
- `src/components/{class-forms,sequence-forms}.tsx`：复用/删除表单
- i18n：新菜单项与表单 label

## 验收

- class 图（非空）：右键一个类 → 出现三项；加成员/加关系落码正确；删除类时其成员与相关 relation
  一并消失（级联）、图仍可渲染。
- sequence 图（非空）：右键一个参与者 → 出现两项；加消息落码正确（含 `from`/`to` 预填为该参与者）；
  删除参与者时其消息一并消失、图仍可渲染。
- 加关系/加消息的表单有起点/终点选择，且默认值合理（右键那个节点作为一端）。
- mindmap / flowchart 的既有菜单不回归。
- 新增落码全部走 `commitIntent`（撤销/重做可用）。

## 测试

- `context-menu.test.ts`：两个新目标 → 目标与菜单项列表；其余图种仍返回 null/空。
- `use-canvas-context-menu.test.tsx`：点击新菜单项 → 断言 `commitIntent` 的意图与 `afterElementId`。
- pipeline 已有单测覆盖 delete 级联与 add 意图，无需新增（如发现覆盖缺口再补）。

## Comments

（空）
