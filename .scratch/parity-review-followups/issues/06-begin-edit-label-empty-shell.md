# 06 `beginEditLabel` 是同款空壳（D5 的连带项）

Status: ready-for-agent

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
