# 08 只读不可编的五处缺口（补齐写回）

Status: resolved

**Blocked by: 01、02**（01 动了 sequence 投影；02 定了连线身份，关系端点与之相关）

来源：`spec.md` 的「缺口全景 → 只读不可编」一节。这些是**解析已支持、但没有写回意图**的字段，
性质是"看得见改不动"，与本批其他缺口不同，故单开一票。

## 清单（每条附证据）

| # | 图种 | 字段 | 现状证据 |
|---|---|---|---|
| 1 | sequence | `autonumber` 的**起始值 / 步长** | `AutonumberData` 只存 `raw`（`sequence.ts:71-74`）；`set-autonumber` 只能整体开关，不能改 `autonumber 10 10` |
| 2 | sequence | `activate` / `deactivate` 的 **actorId** | `renderActivation :164-167` 的 changes 只支持 `keyword`；`rename-participant` 对此走手工拼串（`:570-572` 有注释） |
| 3 | sequence | note 的**参与者列表**（解析不出时为 `null`） | `sequence-projection.ts:47`：`null` 时 mid 原样保留、**只能改文本** |
| 4 | class | 关系**端点泛型** `Foo~T~` | `RelationData` 存 `fromGenericRaw` / `toGenericRaw`（`:109-118`），但 `renderRelation :136-150` 的 changes **不含 generic**、`set-relation` 无该字段 |
| 5 | class | 类声明的 **`tail`**（行尾原文） | `renderClassDecl :62-74` 只改 name/generic |

## 需求

按"补齐写回"的原则处理，但**逐条判断值不值得做**——本票允许对某条给出"不做"的结论，
**必须在 Comments 写明理由**：

1. **autonumber 起止/步长**：`set-autonumber` 扩参（或新增字段）；表单补两个数字输入。
   注意 `autonumber 10 10` 的语法形态与 `autonumber` 单独一行不同，写回要正确。
2. **activation 的 actorId**：给 `renderActivation` 的 changes 补 id 支持，
   **删掉 `rename-participant` 里的手工拼串**（把手写逻辑收回到 render 层，减少一处特殊分支）。
3. **note 的参与者列表**：`parseNoteLine` / `parseOverActorList` 已能解析
   （`sequence.ts:212-235`、`:238-242`），问题在**投影丢弃**时为 `null`。
   要么让投影保留原始串、要么在前端可编——实现时定，并记录为何选此方案。
4. **关系端点泛型**：`renderRelation` 的 changes 补 `fromGeneric` / `toGeneric`；
   `set-relation` 补字段；`RelationForm` 补两个输入。
5. **类声明 tail**：`tail` 是"类名之后看不看懂的剩余文本"，本质是**语法边界**而非字段。
   **推荐不做**（改了它等于替用户猜语义），但要写进 Comments 说明。

## 落码位置

- `src/lib/pipeline/sequence.ts` / `class.ts`：intent 参数与 render 函数扩展。
- `src/lib/editing/{sequence-forms,class-forms}.ts`：字段映射层。
- `src/components/{sequence-forms,class-forms}.tsx`：表单输入。
- i18n：新字段 label。

## 不变量

- 每条写回都必须**手术式**、未触碰文本逐字保留（ADR-0004/0008）。
- `rename-participant` 的行为在重构后必须**逐字等价**（它有既有单测，不能放松）。

## 测试

- `sequence.test.ts` / `class.test.ts`：每条新字段的解析 → 写回 → verbatim identity。
- `rename-participant` 的既有测试**必须继续全绿**（重构 activation 后的回归保护）。

## 验收

- [x] `autonumber 10 10`：表单能改起始值与步长，落码正确。
- [x] 重命名一个被 `activate` 的参与者：activate 行跟着改（且不再走手工拼串路径）。
- [x] note 的多参与者列表：能改参与者集合，落码正确。
- [x] class 关系端点的泛型（如 `Foo~T~ --> Bar`）：能改，落码正确。
- [x] 类声明 `tail`：给出结论（做或不做），并在 Comments 写明理由。
- [ ] 控制台 0 error / 0 warning。（本轮未做真机确认——用户指示跳过真机验收）

## Comments

### 五条逐条的做/不做结论与理由

1. **autonumber 起始值 / 步长 —— 做。**
   `AutonumberData` 增加 `start` / `step`（按空白切出的第 1、2 个 token 原文，原样保留），新增
   `renderAutonumber`：未改字段时逐字回写 `raw`（保留 `autonumber  10   10` 这类多空白写法），
   改动后按 mermaid 规范重建 `autonumber [start] [step]`；起始值被清空时步长一并去掉（`autonumber <step>`
   在 mermaid 里无意义）。`set-autonumber` 扩参 `start?` / `step?`（缺省 = 保持不变）：行已存在则原地改写，
   不存在则按参数插到 header 后。表单补两个数字输入（`type="number"`，非负整数校验，失焦/回车提交）。
   注意点落实：`autonumber 10 10` 与单独一行的语法形态不同，写回路径单列（存在 / 新建）并各有用例。

2. **activate / deactivate 的 actorId —— 做。**
   `renderActivation` 的 changes 补 `actorId?`；`resolveRenameParticipant` 里删掉手工拼串
   （原 `:717-718` 的先 `renderActivation(act, {})` 再 `\`${act.keyword}${act.gap}${intent.newId}\``），
   改为一次 `renderActivation(act, { actorId: intent.newId })`。等价性见下。

3. **note 的参与者列表 —— 做（选「前端可编」方案）。**
   选此方案的理由：解析层与投影层**本就已把 `actors` 解析出来**（`NoteData.actors` 非 null 时原样透出），
   缺的只是表单没有对应控件——`set-note` 的 `actors` 字段早已存在且落地正确。方案 (a)「投影保留原始串」
   并不能独立兑现「可编」（仍要再加一层 UI 与一个「原始 mid 写回」的新概念，与 `NoteData.mid` 重复），
   反而把"语法串"渗进模型。故：投影保持忠实（`actors: null` = 真解析不出，未触碰时 `mid` 逐字保留），
   `NoteForm` 增加「参与者（逗号分隔）」输入，复用 `set-note.actors`；`actors` 为 null 的行从空起步，
   输入后落码为规范 `Note over A,B: …`。管线侧对空集合的拒绝保持不变（note 至少要有一个参与者）。

4. **关系端点泛型 —— 做。**
   `renderRelation` 的 changes 补 `fromGeneric` / `toGeneric`（string | null，规范渲染 `~X~`，空/null = 无泛型；
   未给字段逐字保留原 `*GenericRaw`）；`set-relation` 与 `setRelationIntent` 补两字段；
   `ProjectionRelation` 补 `fromGeneric` / `toGeneric`（去 `~` 后）；`RelationForm` 补两个输入。

5. **类声明 `tail` —— 不做（采纳工单推荐）。**
   `tail` 是「名字（含泛型）之后到行尾的原文」（`ClassDeclData.tail`，如 ` {`、`{`、` { class A }`），
   本质是**语法边界**而非可编辑字段：它承载开块的花括号、行尾注释或任何 mermaid 后续语法的界标。
   给一个自由文本输入让它可编，等于让用户替解析器猜语义——写错一个字符就会改变块结构或产出非法源码，
   而它当前正是「改 name/generic 时逐字保留其余一切」这条 verbatim 承诺的载体。缺的从来不是"可编辑"，
   而是"无需编辑"。故明确不做，也不为它开表单入口。

### 第 2 条：手工拼串删除与 `rename-participant` 等价性验证

- **删除**：`src/lib/pipeline/sequence.ts` 的 `resolveRenameParticipant` 中，原先是两行连续 `rewrites.set`——
  第一行 `renderActivation(act, {})` 的产物被第二行手工拼串 `\`${act.keyword}${act.gap}${intent.newId}\``
  立即覆盖（死代码），现合并为 `renderActivation(act, { actorId: intent.newId })`。
- **字节等价证明**：`renderActivation(d, changes)` = `\`${changes.keyword ?? d.keyword}${d.gap}${changes.actorId ?? d.actorId}\``。
  仅传 `actorId` 时 = `\`${act.keyword}${act.gap}${newId}\``，与旧的手工拼串**逐字节相同**（`keyword`/`gap` 均取原值）。
  因此改写表对任意输入完全一致，行为等价。
- **回归保护**：既有 `rename-participant` 用例全部保持绿——「声明 + 全部引用一起改，别名保留」
  （含消息、`Note over`）、「create 行与全部引用一起改名」、「Note right of 甲 的参与者一并改名」。
  新增用例补上此前未覆盖的 activation 路径：`activate`/`deactivate` 行一并改名 + 行内空白逐字保留。

### 测试结果

- `npm run typecheck`：通过（`tsc -b --noEmit`，0 error）。
- `npm test`：**52 个测试文件 / 786 个用例，全绿**（基线 51 / 752 → 净增 1 文件 / 34 用例，只增不减）。
- 新增/扩展用例分布：`sequence.test.ts`（autonumber 解析/写回/verbatim 9、activation 改名 2、note 集合 3）、
  `class.test.ts`（端点泛型 7）、`sequence-projection.test.ts`（autonumber 进投影 4）、
  `class-projection.test.ts`（端点泛型进投影 1）、新增 `components/__tests__/readonly-gaps-forms.test.tsx`（8）。

### 待真机确认清单

- 控制台 0 error / 0 warning（验收第 6 项）：本轮未做真机确认——用户指示跳过真机验收。
  说明：本票只新增表单输入与 render/intent 字段，未新增任何 `console.*`；单测层面无新增 React error/warning
  （既有 `code-panel.test.tsx` 的 react-i18next warning 为先前既有噪声，与本票无关）。
- 待真机走查项：`autonumber` 开状态下起始值/步长输入与 mermaid 渲染编号是否一致；`Note over A,B` 改参与者后
  画布注释跨度是否随之更新；`Foo~T~ --> Bar` 改泛型后类图端点标签是否重绘。

