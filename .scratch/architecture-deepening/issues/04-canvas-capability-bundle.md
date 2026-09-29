# 04 · 图种 → 画布能力 bundle（顶推项）

Status: needs-triage
Blocked by: 01, 03
Type: task

## 现状（已核实）

`CanvasPanel.tsx`（761 行）里有 **24 处** `projection.type ===`，散在 6 个分发函数里：
`resolverOf`:71 / `canvasToEditorSelection`:89 / `selectedDataIdOf`:106 /
`nodeDataIdsOf`:133 / `keyboardProjectionOf`:146 / `annotateEdges`:575。
另有 `PropertyPanel.tsx:237` 的 `resolveProjectionSelection` 是**第七处**分发（4 分支）。

而 `canvas-selection/data-id.ts` 的头注释写着：

> 新图种接入画布选中只需实现一个 resolver，无需改动画布组件与高亮逻辑。

这句话只对了一半：画布实际要 6 种能力，只有第 1 种落到了 seam 上。现存 adapter 也只有两个
（`flowchart-adapter.ts` 35 行、`mindmap-adapter.ts` 41 行），sequence / class 是在 `resolverOf` 里
用 `nodeDataIdResolver` / `elementDataIdResolver` **现场拼**的。

**关键事实（修正了扫描报告）**：能力包不是新发明。`canvas-keyboard.ts:243` 的 `CanvasNavigation`
已经是这个形状：

```ts
export interface CanvasNavigation {
  extents(): NodeExtent[]
  dataIdOf(selection: Selection | null): string | null
  toSelection(dataId: string): Selection | null
  reveal(dataId: string): void
  firstSelection(): Selection | null
}
```

它在 `CanvasPanel.tsx:449-488` 现场组装，测试可以注入假实现。所以本工单的性质是
**把这个既有模式推到全部能力，并把组装移出 CanvasPanel**——不是从零设计。

## 方案形状

**能力包只装「图种知识」，不装 DOM。**

```ts
// src/lib/canvas-selection/capabilities.ts
export interface CanvasCapabilities {
  /** 已有：data-id → CanvasSelection */
  dataIdResolver(projection: AnyProjection): DataIdResolver
  /** 新：画布选中 → 编辑器选中（原 canvasToEditorSelection） */
  toSelection(canvas: CanvasSelection): Selection | null
  /** 新：编辑器选中 → 画布 data-id（原 selectedDataIdOf） */
  canvasIdOf(selection: Selection): string | null
  /** 新：参与方位导航 / 回落首节点的 id 列表（原 nodeDataIdsOf） */
  navigationIds(projection: AnyProjection): string[]
  /** 新：画布键盘的 tagged union（原 keyboardProjectionOf） */
  keyboardProjection(projection: AnyProjection): CanvasKeyboardProjection
  /** 新：连线位置序标注；flowchart / mindmap 无 → undefined（原 annotateEdges 三元链） */
  edgeAnnotator?(projection: AnyProjection): (root: ParentNode) => void
  /** 新：选中在投影中是否仍存在（原四份 resolve*Selection） */
  resolveSelection(selection: Selection | null): Selection | null
}

export function capabilitiesOf(projection: AnyProjection): CanvasCapabilities
```

`extents` / `reveal` **故意不进包**——它们依赖 DOM 容器与 `useCanvasView` 的 `revealRect`，
是运行期的东西，不是图种知识。`CanvasNavigation` 继续由 hook 层用 `capabilitiesOf(...) + 容器` 组装。
**这是本方案最关键的切分**：静态图种知识进包，运行期 DOM 测量留在外面。

每种图一个 adapter：`canvas-selection/{flowchart,mindmap,class,sequence}-adapter.ts`
（前两个已存在，补后两个）。

`CanvasPanel` 最后只剩一句 `const caps = capabilitiesOf(projection)`，24 处分支归零。

## 分步（每步都不改 CanvasPanel 行为）

1. 补 `class-adapter.ts` / `sequence-adapter.ts`，**先只实现 `dataIdResolver`**，
   照 `mindmap-adapter.ts` 的样子。`resolverOf` 改为查表。跑 `canvas-selection/__tests__`。
2. `navigationIds` / `keyboardProjection` / `edgeAnnotator` 三项移进 adapter；
   `nodeDataIdsOf` / `keyboardProjectionOf` / `annotateEdges` 改为查表。
   跑 `use-canvas-keyboard` + `edge-locate` + `scenario-a`。
3. `toSelection` / `canvasIdOf` 移进 adapter（依赖 03）。跑 `scenario-a` + `use-canvas-context-menu`。
4. `resolveSelection` 移进 adapter；删掉 `PropertyPanel.tsx:237` 的分发。
5. 删除 `CanvasPanel.tsx` 里 6 个分发函数与 `resolverOf`，换成一次查表。
6. **新增 `CanvasPanel` 的测试**——它目前是全库唯一没有测试文件的组件，
   用假 bundle 注入即可（这一步才是本工单真正的收益兑现）。

## 测试

- adapter 层：每图种一份「同源码 → 同 resolver 结果」的对照测试，
  与旧 `resolverOf` 的行为逐一比对（可以先写快照再重构，保证零漂移）。
- `capabilitiesOf` 的查表测试：4 个图种 × 7 项能力，断言无 undefined 遗漏。
- `CanvasPanel` 首次测试：注入假 bundle，断言「点击 → select 被调用」与「选中 → 高亮 id 正确」。
- 护栏：`scenario-a-class-relation.test.tsx`、`use-canvas-keyboard.test.tsx`、
  `use-canvas-context-menu.test.tsx`（1574 行）必须零改动全绿。

## 验收

- `grep -c 'projection.type ===' src/components/CanvasPanel.tsx` 从 24 降到 ≤ 1。
- `grep -c 'projection.type ===' src/components/PropertyPanel.tsx` 从 6 降到 0。
- 「加第 5 种图要动几个文件」从 ≥10 降到 1（新增一个 adapter + registry 一行）。
- `CanvasPanel` 有测试文件。

## 风险

- **本工单是全表风险最高的一个**：`CanvasPanel` 是缝合层且零测试。
  故第 1–4 步严格「adapter 与旧函数并存、逐项切换」，第 5 步才删旧函数。
  任何一步测试红了就停在原地，不带着红往前走。
- `annotateEdges` 只有 class / sequence 有，做成可选成员；但**可选成员正是最容易漏的地方**——
  `capabilitiesOf` 的查表测试要专门断言 flowchart / mindmap 的 `edgeAnnotator === undefined`。
- 与 ADR-0007 / ADR-0012 不冲突：它们裁定「用什么当元素身份」，本工单收敛的是
  「谁把这些身份翻译成画布行为」。

## Decision（已定案 · 已升格为 ADR-0015）

两条岔路都定了，理由与后果见
`docs/adr/0015-canvas-capabilities-hold-diagram-knowledge-only.md`，此处只记结论：

1. **接口定义在 `src/lib/canvas-selection/capabilities.ts`，实例挂在
   `DiagramTypeRegistration.canvas` 字段上。** 这不是二选一而是两者兼得：
   registry 只持引用、不含实现，不会从 143 行撑胖；同时「加一种图」仍是一处改动
   （新建 adapter + 在 registration 上挂一行），`capabilitiesOf()` 实现为查表。
2. **`extents` / `reveal` 不进包，留在 hook 层组装。** 否决「全进包」的理由不是审美：
   那样包要持有容器引用、变有状态对象，会废掉 `use-canvas-keyboard` 现有的
   「注入假 navigation 即可测」的能力——而这是当前方位导航（ADR-0011）唯一能脱离真机验收的
   测试手段（AGENTS.md 默认不做真机验收）。
