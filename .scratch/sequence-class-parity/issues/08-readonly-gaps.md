# 08 只读不可编的五处缺口（补齐写回）

Status: pending

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

- [ ] `autonumber 10 10`：表单能改起始值与步长，落码正确。
- [ ] 重命名一个被 `activate` 的参与者：activate 行跟着改（且不再走手工拼串路径）。
- [ ] note 的多参与者列表：能改参与者集合，落码正确。
- [ ] class 关系端点的泛型（如 `Foo~T~ --> Bar`）：能改，落码正确。
- [ ] 类声明 `tail`：给出结论（做或不做），并在 Comments 写明理由。
- [ ] 控制台 0 error / 0 warning。
