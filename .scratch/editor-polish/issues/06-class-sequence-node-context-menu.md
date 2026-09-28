# 06 class/sequence 的节点右键菜单

Status: resolved

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

### 跨白名单改动（如实记录）
- `src/components/CanvasPanel.tsx`：**必要**改动，本票允许且必须。
  - 菜单项 dispatch（`onMenuItem`）新增 `add-member / add-relation / add-message`（开表单浮层）
    与 `delete-class / delete-participant`（→ `ctx.deleteTarget()`）。
  - 节点表单浮层：新增 `NodeFormPopup` 外壳 + 按 `ctx.nodeForm.kind` 渲染
    `AddMemberInlineForm / AddRelationInlineForm / AddMessageInlineForm`（复用属性面板表单）。
  - 附带：删除项红色高亮从 `id === 'delete'` 扩到 `delete-class / delete-participant`；
    画布单击关闭节点表单、表单打开时禁用背景拖拽（与既有 menu/styleForm 同款守卫）。
- 未动 `canvas-keyboard.ts` / `use-canvas-keyboard.ts`。

### 落码设计
- 只做 UI 接线，未新增任何 pipeline 意图。新增菜单项的动作：class
  `add-member`/`add-relation`/`delete-class`；sequence `add-message`/`delete-participant`。
- 添加型动作在菜单位置浮出小表单（提交才 `commitIntent`），锚点 `afterElementId` =
  右键节点的**声明** elementId（`class:<名>` / `participant:<id>`），新元素插到它之后；
  起点默认取右键的那个节点（`initialClassName` / `initialFrom`），终点默认取另一个节点。
- 删除类/参与者直接 `commitIntent(deleteClassIntent|deleteParticipantIntent)`，
  级联（类体成员、owner 为该类的行式成员、引用该类的 relation；引用该 actor 的语句）
  由既有 `resolveDeleteClass` / `resolveDeleteParticipant` 负责，无需新定。
- 表单浮层状态托管在 hook（`nodeForm`），由 CanvasPanel 渲染——与既有 `styleForm`
  （`submitStyleForm` + `AddStyleForm`）同一分层，避免 lib 反向依赖 components。

### 死代码裁决结果
- **保留并接线 3 个**：`AddMemberInlineForm`、`AddRelationInlineForm`（class-forms.tsx）、
  `AddMessageInlineForm`（sequence-forms.tsx）。三个都加了可选 `afterElementId`
  （成员/关系）与 `initialClassName`/`initialFrom` 预选，供右键菜单接线。
- **删除 9 个**（均无外部引用，全量测试确认）：
  - `class-forms.tsx`：`AddClassInlineForm`、`AddClassNoteInlineForm`；
  - `sequence-forms.tsx`：`AddParticipantInlineForm`、`AddNoteInlineForm`、`AddBlockInlineForm`；
  - `property-forms.tsx`：`AddNodeInlineForm`、`AddEdgeInlineForm`、`AddSubgraphInlineForm`、
    `AddClassDefInlineForm`。
- **i18n key**：连同删除这些表单专属、且全网已无引用的 key——
  `addNodeId/addNodeText/addEdgeLabel/addSubgraphLabel/addParticipantId/useActor/noteActorA/noteActorB/noteTarget/blockKeyword`；
  另清理工单 07 删面板入口后遗留、同样零引用的 `*Title` 系列（`addNodeTitle/addEdgeTitle/
  addSubgraphTitle/addClassDefTitle/addParticipantTitle/addMessageTitle/addNoteTitle/
  addBlockTitle/addClassTitle/addMemberTitle/addRelationTitle`）与 `noNodeAvailable`。
  保留 `addEdgeFrom/addEdgeTo`（两个保留表单仍用）。

### 验证
- `npm run typecheck`：通过（无输出错误）。
- `npm test`：**43 files / 519 tests 全绿**。
- 未做浏览器实测（"图仍可渲染"依赖真实 mermaid 渲染）：落码合法性由 `commitIntent`→
  `applyEdit` 校验（失败即不落码），级联由既有 pipeline 单测覆盖。

### 存疑
- `contextMenuTargetFromSelection` 对 class/sequence 的**连线**仍返回 null（本批非目标）。
- sequence/class 的画布节点选中依赖 mermaid 的 `data-id`（ADR-0007 事实约定，尽力而为）；
  测不到 `data-id` 时右键不会弹节点菜单（既有行为，非本票引入）。
