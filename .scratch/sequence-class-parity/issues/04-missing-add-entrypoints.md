# 04 补全添加入口：让「右键菜单是唯一入口」成立

Status: resolved

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
      （本轮未做真机确认——用户指示跳过真机验收）
      单测已覆盖：菜单为 `['add-participant','add-note','add-block']`、加注释走 `add-note`
      （`Note over 甲,乙: 备注`）、加块表单的**六种关键字选项齐备**（读下拉选项逐个核对文案）、
      提交落码 `add-block` 且空白处不带锚点（回退文档末尾）。「图可渲染」属真机项。
- [ ] sequence 图：参与者右键 → 能加消息（既有）、能加块；块以该参与者为端点。
      （本轮未做真机确认——用户指示跳过真机验收）
      单测已覆盖：菜单为 `['add-message','add-block','delete-participant']`；点「添加逻辑块」
      表单锚点为 `participant:甲`，提交意图带 `afterElementId: 'participant:甲'`，源码中块
      紧跟在 `participant 甲` 声明之后。「画布上真的多出一个块」属真机项。
- [ ] class 图：空白右键 → 能加浮动注释；类节点右键 → 能加 `note for X`。
      （本轮未做真机确认——用户指示跳过真机验收）
      单测已覆盖：空白 → 菜单 `['add-class','add-note']`、提交意图 `className: null` 且无锚点、
      源码 `note "…"`；类节点 → 菜单含 `add-note`、提交意图 `className: 'Foo'` +
      `afterElementId: 'class:Foo'`、源码 `note for Foo "…"`。渲染属真机项。
- [ ] **端到端场景 B 走通**：加参与者 → 互发三条消息 → 包一个 alt 块并写条件 → 右键一条消息改箭头并删掉它。
      （本轮未做真机端到端——用户指示跳过真机验收）
      已用**单测等价覆盖**（`use-canvas-context-menu.test.tsx` 的「端到端场景 B（单测等价覆盖）」）：
      逐步骤断言各自 intent 与 `afterElementId`，每步后按 store 源码重投影（与真实 app 的重渲染同构）。
      这是单测等价覆盖，**不是**真机端到端。
- [x] 所有落码走 `commitIntent`（撤销/重做可用）。
      单测以 `vi.spyOn(commitIntent)` 断言意图与 `afterElementId`，并断言 `canUndo` / `undo()`
      回到原源码；三个表单的提交按钮一律经 `commitIntent`，无旁路。
- [ ] 控制台 0 error / 0 warning。
      （本轮未做真机确认——用户指示跳过真机验收）
      单测运行环境（jsdom + Mantine）无 React 告警输出；真机控制台需按下节清单核对
      （含**空块渲染**这一已知风险，见「遗留风险」）。

---

## Comments

### 改动内容

| 文件 | 新建/修改 | 内容 |
|---|---|---|
| `src/lib/editing/context-menu.ts` | 修改 | `ContextMenuItemId` 增 `add-note` / `add-block`；`blankMenuItems` 的 class → `['add-class','add-note']`、sequence → `['add-participant','add-note','add-block']`；`contextMenuItems` 的 class 节点插 `add-note`（删除类之前）、sequence 参与者插 `add-block`（删除参与者之前）；文件头与两处函数注释同步 |
| `src/lib/editing/use-canvas-context-menu.ts` | 修改 | `NodeFormKind` 增 `'note' \| 'block'`；`NodeFormState.anchorElementId` 改为**可选**（空白处右键 = 无锚点）；`openNodeForm` 覆盖 block / note 的目标判定；新增 `addNote` / `addBlock` 并随 hook 返回 |
| `src/components/sequence-forms.tsx` | 修改 | **重建** `AddNoteInlineForm`、`AddBlockInlineForm`（出处见下）；恢复 `BLOCK_KEYWORD_OPTIONS` / `addBlockIntent` / `addNoteIntent` 的 import |
| `src/components/class-forms.tsx` | 修改 | **重建** `AddClassNoteInlineForm`（出处见下），并加 `initialClassName` / `afterElementId` 两个可选 props |
| `src/components/CanvasPanel.tsx` | 修改 | 导入三个新表单；`onMenuItem` 分发 `add-note` → `ctx.addNote()`、`add-block` → `ctx.addBlock()`；`NodeFormPopup` 内渲染三个新表单（按投影图种分派 sequence-note / sequence-block / class-note） |
| `src/i18n/index.ts` | 修改 | `app:canvas.menu` 增 `'add-note'` / `'add-block'` 两条；`app:propertyPanel` 增 `addNoteActorA` / `addNoteActorB` / `addBlockKeyword` / `addNoteTarget` 四条 |
| `src/lib/editing/__tests__/context-menu.test.ts` | 修改 | 反向四条旧断言（class 空白 / sequence 空白 / class 节点 / sequence 参与者）；新增「add-note / add-block 不出现在无此动作的目标上」一条；文件头注释同步 |
| `src/lib/editing/__tests__/use-canvas-context-menu.test.tsx` | 修改 | `Harness` 增渲染三个新表单 + `ContextMenuApi` 增 `addNote`/`addBlock`；新增 `optionTexts` / `selectOption` 两个 Select 下拉辅助；反向 `工单 04 空白处按图种` 与 `工单 06 节点菜单` 中各两条菜单断言；新增 `describe('useCanvasContextMenu（工单 04 添加入口补全）')` 9 条用例（含场景 B 等价覆盖） |

未触碰：`src/components/StructureTree.tsx`（**结构树保持纯选中器**，不引入第二套添加心智）、
`src/lib/pipeline/*`（**零 pipeline 改动**，`add-note` / `add-block` 意图早已存在）、
`edge-adapter` / `edge-locate` / `data-id`（连线寻址不动）。

### 重建的表单出处（commit sha）

工单 06（属性面板改造那一批）在 `75de7cf feat(canvas): class/sequence 节点右键菜单接线（工单 06）`
里删了 9 个死代码表单。本票按工单建议**从 git 历史取回原实现再按右键菜单需求调整，而非重写**：

| 表单 | 取出的修订 | 原始引入提交 | 调整 |
|---|---|---|---|
| `AddNoteInlineForm`（sequence） | `972b37d`（= `75de7cf^`，即删除前的最后一次状态） | `a41672a`（工单 06「sequence 端到端」） | 只改 i18n key（见下）；props 与行为逐字保留 |
| `AddBlockInlineForm`（sequence） | `972b37d` | `a41672a` | 只改 i18n key；props 与行为逐字保留 |
| `AddClassNoteInlineForm`（class） | `972b37d` | 更早的 class 表单批次（`75de7cf` 删除） | 加 `initialClassName`（预选 `note for` 目标）与 `afterElementId`（落码锚点）两个可选 props；把原实现的 `floating: boolean` + `className` 两个状态合并为单个 `target: string`（空串 = 浮动 note），以便用 `initialClassName` 一处完成「预选类 / 缺省浮动」的区分 |

取法与校验：`git log --oneline -S "AddBlockInlineForm" -- src/components/sequence-forms.tsx`
定位删除提交 `75de7cf`，再用 `git show 972b37d:src/components/{sequence,class}-forms.tsx` 取回原文。

### 新 i18n key 命名与理由

工单 06 删掉的旧 key：`noteActorA` / `noteActorB` / `blockKeyword` / `noteTarget`
（以及 `addParticipantId` / `useActor` / 各 `*Title` 等，本票不涉及）。工单要求**不复用旧 key 名**，
故一律加 `add` 前缀重命名，与保留下来给属性面板用的键（`notePosition` / `noteText` / `blockLabel`）
在同一字典里一眼可分：

| 新 key | 文案 | 对应旧 key |
|---|---|---|
| `app:canvas.menu.add-note` | 添加注释 | （新增，无旧名） |
| `app:canvas.menu.add-block` | 添加逻辑块 | （新增，无旧名） |
| `app:propertyPanel.addNoteActorA` | 参与者 A | `noteActorA` |
| `app:propertyPanel.addNoteActorB` | 参与者 B（over 时可选） | `noteActorB` |
| `app:propertyPanel.addBlockKeyword` | 块类型 | `blockKeyword` |
| `app:propertyPanel.addNoteTarget` | note 目标（留空为浮动 note） | `noteTarget` |

理由：旧名已在字典里消失过一轮，复用同名 key 会让 `git log -S` 在「谁删的、谁又加回来的」
之间失去区分度；加 `add` 前缀直接标明「这条键服务于添加型浮层表单」，也与既有命名习惯
（`addEdgeFrom` / `addEdgeTo` 只服务 `Add*InlineForm`）一致。表单里其余 label 一律**复用保留键**
（`notePosition` / `noteText` / `blockLabel` / `floatingNote` / `add`），不新增重复文案。

### `afterElementId` 的落点验证方式

不变量第一条是**顺序即语义**，所以每条新入口都在单测里钉住锚点（`vi.spyOn(commitIntent)` 取意图字段）：

| 入口 | 落码锚点 | 落地效果（单测断言） |
|---|---|---|
| sequence 空白 → 添加注释 | **不传**（`undefined`） | 管线回退到文档最后一个元素；`Note over 甲,乙: 备注` 落在最后一行之后 |
| sequence 空白 → 添加逻辑块 | **不传** | 块落在文档末尾 |
| sequence 参与者 → 添加逻辑块 | `participant:<actorId>`（右键的那个参与者） | 源码中出现 `participant 甲\n    loop 重试\n    end\n`——块紧跟在**被右键的那个参与者**声明之后，而不是文档末尾 |
| class 空白 → 添加注释 | **不传** | `className: null` → 浮动 note `note "整体说明"` |
| class 类节点 → 添加注释 | `class:<类名>`（右键的那个类） | `note for Foo "Foo 的说明"` |

另用一次性探针（跑完即删）确认过两类产物的 mermaid 可解析性：block-style 类
（`class Foo { … }`）上锚到 `class:Foo` 时 `note for Foo "…"` 会落到花括号**内**、但
`mermaid.parse` 通过；`participant:甲` 锚点与「无锚点」两种块落码也都 `parse` 通过。

### 与 spec 决策的一致性

- **(甲) 补入口让定义成立**：五个入口全部落在右键菜单上；`CONTEXT.md:74/:78` 的
  「添加入口在画布右键菜单 / 右键菜单是元素添加的唯一入口」至此为真。
- **结构树保持纯选中器**：`StructureTree.tsx` 一行未动。
- **零 pipeline 改动**：只用既有 `add-note` / `add-block` 意图，本票纯 UI 接线。
- **非目标**：`linkStyle` / `cssClass` / `--x` / 结构树改造 / 连线寻址换语法 id，一律未碰。

### 关键取舍

1. **`anchorElementId` 由必填改可选**，而不是新开一套「空白表单状态」。理由：空白右键与
   节点右键的差别只有一个锚点，用可空字段表达最省，且 `CanvasPanel` / 测试接线全部复用现有
   `nodeForm` 机制（工单 06 已把该机制与 `styleForm` 并列分层，不引入第二套）。
   `NodeFormState` / `NodeFormKind` 的**名字保持不变**（现已不止服务「节点」右键），
   改名会牵动 CanvasPanel 与既有测试，收益不抵改造面。
2. **`kind: 'note'` 一个枚举值服务两个图种**（sequence 注释 / class `note for`），
   由渲染侧按 `projection.type` 分派——与既有 `kind: 'message'` 只可能出现在 sequence 的写法同构。
3. **菜单项插入位置**：`add-note` / `add-block` 都插在破坏性项**之前**（`delete-class` /
   `delete-participant` 之前），保持「删除永远在末尾且红色」的既有观感。
4. **六个块关键字的可验证性**：Mantine `Select` 的选项渲染在 portal 里，单测靠
   「点开下拉 → 读 `[role="option"]` → 与 `BLOCK_KEYWORD_OPTIONS` × `app:blockKeywords` 逐项比对」
   来断言「六种都可选」，而不是只断言常量表——常量表对了但表单只喂了三种的情况会被抓到。

### 测试结果

- `npx vitest run src/lib/editing/__tests__/context-menu.test.ts` → **23 tests passed**（22 → 23，+1）
- `npx vitest run src/lib/editing/__tests__/use-canvas-context-menu.test.tsx` → **47 tests passed**（39 → 47，+8）
- `npm test` → **49 个测试文件 / 670 个用例，全绿**（基线 661 → +9，只增不减）
- `npm run typecheck` → 通过

### 待真机确认清单

1. **sequence 空白右键**：菜单出现且含「添加参与者 / 添加注释 / 添加逻辑块」；点「添加注释」
   浮出表单（位置 / 参与者 A / 参与者 B / 文本），提交后画布出现 `Note over …`，控制台 0 error / 0 warning。
2. **sequence 空白「添加逻辑块」**：块类型下拉列出六项（循环 loop / 分支 alt / 可选 opt /
   并行 par / 关键 critical / 中断 break）；选非默认项（如 alt）+ 填标题后提交，画布出现该块。
3. **sequence 参与者右键「添加逻辑块」**：块出现在**该参与者附近**（声明行之后），而不是图末。
4. **⚠️ 空块渲染**：`add-block` 只落 `open` + `end` 两行，**新块一定是空的**，而
   `sequence.ts` 的「级联删除后清理空块」注释记着「空块会让 mermaid 渲染期产出成批
   `attribute …: Expected length, "NaN"` console error」。本轮只验到 `mermaid.parse` 通过，
   **渲染期是否报错需真机确认**——这直接关系验收项「控制台 0 error / 0 warning」。
   同时请确认：右键参与者加的块能否由后续操作把内容放进去（见「遗留风险」）。
5. **class 空白右键「添加注释」**：`note 目标` 下拉首项为「浮动 note」，提交后画布出现浮动注释。
6. **class 类节点右键「添加注释」**：下拉**预选该类**，提交后画布出现指向该类的注释；
   另需确认 block-style 类（`class Foo { … }`）时 `note for Foo "…"` 落在花括号内是否渲染正常。
7. **不回归**：flowchart 空白四项、mindmap 添加根节点、class 空图加类、sequence 空图加参与者
   行为不变；连线菜单（工单 03）不变；打开新表单浮层时背景拖拽不劫持指针（工单 08 修过的
   `setPointerCapture`）。

### 遗留风险

- **空的逻辑块无法填入内容（pipeline 层既有局限，非本票引入）**：`add-block` 只落
  `open` + `end` 两行，而「往块里加东西」没有任何入口——
  `add-message` / `add-note` 的 `afterElementId` 只能锚到参与者声明或文档最后一个元素，
  都会落在块**外**（`insertAfter` 把新行紧贴锚点，后插的比先插的更靠近锚点）。
  因此「包一个 alt 块」目前只能理解为「新增一个 alt 块并写条件」，**做不到把已有消息包进去**。
  这是本票**没有**解决的事：要真正支持得动 pipeline（新增「在块内插入」的锚点语义），
  超出「纯 UI 接线、不新增 pipeline 意图」的工单边界，留给后续批次。
- 验收项「块以该参与者为块内首条消息的端点」按**最字面的读法**实现：以右键的那个参与者声明
  为锚点（`participant:<id>`），块紧接着它展开——满足「顺序即语义：必须是用户右键的那个位置」。
  上一条的空块问题意味着「块内首条消息」暂时不存在。
- 空块若真机确认报错，是 `add-block` 的既有性质（工单 04 之前 `add-block` 无画布入口，
  所以这个坑此前用户碰不到）。建议后续单开一票处理（候选方案：`resolveAddBlock` 落码时
  生成可渲染的最小非空块，或为空块加占位语句）。
- 表单按钮在必填项为空（如 class note 未填文本）时是「点了没反应」（`addNoteIntent` 返回
  `null`）。这是**取回原实现的既有行为**，本票未改（与 `AddMemberInlineForm` 等一致）。

