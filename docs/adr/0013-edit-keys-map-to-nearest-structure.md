# 类图与时序图的编辑键按「就近结构」映射，而非子/同级

`flowchart` 与 `mindmap` 的画布编辑键有既定语义：`Tab` 加子节点、`Enter` 加同级节点、`Delete` 删除
（`canvas-keyboard.ts` 的 `keyToNodeAction`）。`class` 与 `sequence` 一直没有这两个键——命中即
`return`，不落码也不 `preventDefault`（工单 14 明确列为非目标）。

**难点在于这两类图上没有"子"和"同级"**：class 是有向图（多父可达、类之间只有关系没有层级），
sequence 是严格时间序（参与者是列、消息是行，谈不上父子）。把树语义硬套过来只会得到一个
用户无法预测的键。

**决定：按"就近结构"映射，并明确承认这是就近类比而非严格语义。**

| 图种 | `Tab` | `Enter` | `Delete` |
|---|---|---|---|
| class | 加成员（`add-member`） | 加关系（`add-relation`） | 删除选中元素 |
| sequence | 加参与者（`add-participant`） | 加一条消息（`add-message`） | 删除选中元素 |

判据是"**当前元素附近最近的那个结构**"——flowchart 的 `Tab`/`Enter` 本质也是"在当前节点附近加一个
结构"，只是那里最近的恰好是子/同级。class 里最近的是成员与关系，sequence 里是消息与参与者。

**配套约束**（防止这套类比失控）：

- 两个键**必须落到已有表单**（class 加关系 → `AddRelationInlineForm`；sequence 加消息 →
  `AddMessageInlineForm`），**不新造浮层**。已有三处表单浮层，再加会开始彼此打架。
- 与 ADR-0011 不冲突：方向键仍是纯几何方位导航，本 ADR 只扩大编辑键的适用范围，不改其语义模型。
- **可达性代价**：这两个键在这两个图种上也要 `preventDefault`（因为是编辑动作），
  意味着用户在这两类图的画布上**无法用 `Tab` 跳出画布**。这是刻意接受的代价——焦点离开画布
  仍可用点击或 `Escape`。
