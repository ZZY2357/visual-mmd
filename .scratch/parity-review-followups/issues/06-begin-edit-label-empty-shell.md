# 06 `beginEditLabel` 是同款空壳（D5 的连带项）

Status: resolved

来源：工单 05 的遗留 2。D5 定案把 sequence / class 的「编辑类」菜单项统一成了
「选中该连线 + 关闭菜单」语义，但 flowchart 连线上的同款空壳没动 —— 不动就会留下一个新的不一致：
sequence / class 说「在属性面板中编辑」且真会选中，flowchart 说「编辑标签」却只关菜单。

## 现状（已核实，勿重复调研）

- `src/lib/editing/use-canvas-context-menu.ts:520-522`：

  ```ts
  const beginEditLabel = useCallback((): void => {
    closeMenu()
  }, [closeMenu])
  ```

  与 D5 修掉的 `editRelation` / `editMessage` 是**同一个缺陷形状**：函数体只有 `closeMenu()`。

- 菜单 id `edit-label`（`src/lib/editing/context-menu.ts:62`，`:160` 出现在连线菜单里），
  i18n 文案 `src/i18n/index.ts:62` 为 `'编辑标签'`。

- **属性面板确实有 flowchart 连线的表单**：`src/components/PropertyPanel.tsx:71-75`
  对 `case 'edge'` 渲染 `<EdgeForm edge={projection.edges.find(...)} />`。
  所以改文案为「在属性面板中编辑」**不是谎言** —— 这是本票能照 D5 定案走的前提，已核实。

## 做法

1. `beginEditLabel` 改为指向工单 05 新增的 `selectMenuTargetAndClose`
   （`selectTarget(menu.target)` + `closeMenu()`），行为等价于 D5 定案的第 1 点。
2. i18n 的 `edit-label` 文案改为「在属性面板中编辑」，与工单 05 的两条措辞保持一致
   （工单 05 用的是这个措辞，不是「编辑属性」，因为后者不说明点完去哪儿改）。
3. `selectMenuTargetAndClose` 若只在 relation / message 两条路径上验证过，
   本票要顺带确认它对 flowchart 的 `edge` 选中种类同样成立。

## 测试

- 新增：右键 flowchart 连线 → 点「在属性面板中编辑」→ 菜单关闭、选中停在该连线、
  右侧渲染出 `EdgeForm`。
- 工单 05 的两条既有覆盖（class 关系 / sequence 消息）不得变红。

当前基线：**54 文件 / 804 用例全绿**。既有用例只增不减。

## 验收

- `grep -rn "编辑标签" src/` 为 0。
- `npm run typecheck` 通过，`npm test` 全绿。

## 不在范围内

- 不在菜单内嵌表单（D5 已裁定，与 ADR-0001 一致）。
- 不实现连线标签的原位内联编辑 —— 那是新能力，不是补漏。

## Comments

实际做法（followups-06）：

1. **删掉空壳本身**：`use-canvas-context-menu.ts` 里 `beginEditLabel` 的 `useCallback`
   （函数体只有 `closeMenu()`）整块删除，返回对象改为直接指向工单 05 新增的
   `selectMenuTargetAndClose`——不额外留一层转发函数（避免新的 Middle Man）。
   `editRelation` / `editMessage` / `beginEditLabel` 现在三个 id 共用同一份语义。
2. **文案**：`i18n/index.ts` 的 `edit-label` 由「编辑标签」改为「在属性面板中编辑」，
   与 `edit-relation` / `edit-message` 逐字一致。
3. **注释同步**：`context-menu.ts`（flowchart 连线菜单项说明）与
   `use-canvas-context-menu.ts`（文件头 + `selectMenuTargetAndClose` 的 doc）一并改写；
   菜单 id `edit-label` 未动，`contextMenuItems` 的返回值未动。

`selectMenuTargetAndClose` 对 flowchart `edge` 是否成立：**成立**。它做的是
`selectTarget(menu.target)` + `closeMenu()`，而 `selectTarget` 的 `flowchart-edge` 分支
（`use-canvas-context-menu.ts:207-208`）早已把 `{from,to,occurrence}` 映射成编辑器选中
`{kind:'edge',...}`，与 class-relation / sequence-message 分支同一条链路；
`PropertyPanel` 的 `case 'edge'`：渲染 `EdgeForm`（`PropertyPanel.tsx:71-75`）。
新增的组件级用例实测点完菜单项后右侧真的渲染出 EdgeForm，且标签输入框回显该连线的
现有标签（`A -->|第一步| B` → 「第一步」），即文案不是谎言。

新增用例（3 条，既有 804 条一条没删没红）：

- `src/components/__tests__/flowchart-edge-edit-label.test.tsx`（新文件，2 条）
  1. i18n 三条编辑类菜单项文案逐字一致（`edit-label` / `edit-relation` / `edit-message`
     均为「在属性面板中编辑」）——把 `grep -rn "编辑标签" src/` 为 0 的验收口径写成断言；
  2. 右键 flowchart 连线 → 点「在属性面板中编辑」→ 菜单关闭、选中停在该连线
     （`{kind:'edge',from:'A',to:'B',occurrence:1}`）、右侧出现 EdgeForm（起终点行 +
     标签字段 + 现有标签回显）。
- `src/lib/editing/__tests__/use-canvas-context-menu.test.tsx`（1 条，接在 flowchart 连线
  一条之后）：菜单项自己选中该连线并关闭菜单，且自身不落码（`commitIntent` 未被调用）。

**测试数字**：全量 `npm test` = 56 文件 / 824 用例全绿（基线 54 / 804；本票 +1 文件 +3 用例，
其余增量来自并行工单）。`npm run typecheck` 0 error。

**验收 `grep -rn "编辑标签" src/`**：清理后仅剩 1 处，且是**注释不是文案**——
`src/components/CanvasPanel.tsx:522`「菜单项 → 动作分发（编辑标签/基数/文本：右键时已选中
该连线，右侧表单承接）」。该文件不在本票的文件所有权内（并行代理在改别处），故未动，
留给 team-lead 裁定是否顺手改（改掉即 grep 为 0）。

**偏差**：无功能偏差。唯一超出工单字面范围的是顺带把两条既有用例的标题
（`context-menu.test.ts`「flowchart 连线：…」、`use-canvas-context-menu.test.tsx`
「右键连线：菜单为…」）里的旧说法同步成新文案——用例本身与断言均未改动，只改标题文字。
