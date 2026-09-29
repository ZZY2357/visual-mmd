# 03 · 选中的互逆映射收敛成一处 codec

Status: needs-triage
Blocked by: 01
Type: task

## 现状（已核实）

四份手写的、互为逆向的映射表：

| 映射 | 位置 | 方向 |
| --- | --- | --- |
| `selectedDataIdOf` | `CanvasPanel.tsx:106` | Selection → 画布 data-id |
| `canvasToEditorSelection` | `CanvasPanel.tsx:89` | 画布 CanvasSelection → Selection |
| `navigation.toSelection` | `CanvasPanel.tsx:452` | resolver + 上者的组合 |
| `selectTarget` | `use-canvas-context-menu.ts:203`（9 分支） | ContextMenuTarget → Selection |
| `contextMenuTargetFromSelection` | `context-menu.ts:82` | CanvasSelection + 图种 → ContextMenuTarget |

外加四个 `resolve*Selection`（`flowchart-projection.ts:122`、`class-projection.ts:179`、
`sequence-projection.ts:204`、`mindmap-projection.ts:68`）——这是**第四件事**（存在性检查），
在 04 里处理，不在本工单。

问题不是「重复」，是**穷尽性靠人眼维护**：`selectedDataIdOf` 有 `default: return null`，
任何一处漏一个 kind，症状是「右键选中了但属性面板空白」——不抛错、不报红，静默。

## 方案形状

新建 `src/lib/canvas-selection/selection-codec.ts`，把互为逆向的两对收进同一个模块：

```ts
/** Selection → 画布 data-id；画布上不可寻址的 kind（diagram / subgraph / classdef /
 *  class-member / class-note / seq-region / class-namespace）返回 null */
export function canvasIdOf(selection: Selection): string | null

/** 画布 CanvasSelection + 图种 → Selection */
export function fromCanvasId(diagramType: DiagramTypeId, canvas: CanvasSelection): Selection | null

/** ContextMenuTarget → Selection（搬自 selectTarget） */
export function selectionOfMenuTarget(target: ContextMenuTarget): Selection | null

/** CanvasSelection + 图种 → ContextMenuTarget（搬自 contextMenuTargetFromSelection） */
export function menuTargetOfCanvas(diagramType: DiagramTypeId, canvas: CanvasSelection | null): ContextMenuTarget | null
```

要点：
- **不追求类型层穷尽。** `selectedDataIdOf` 的 `default: return null` 是有意的——
  画布本来就只可寻址一部分 kind。硬改成 `assertNever` 会扭曲类型。
- 正确做法是**表驱动 + 全 kind 枚举测试**：把这 16 个 kind 的「是否可寻址」写成一张显式表，
  再加一条遍历全部 kind 的测试。这样新增 kind 时，测试会逼你回答「它可寻址吗」，
  而漏答是测试失败而非线上静默。
- 依赖 01：`mindmapDomIdOf` 这类形态转换应走 01 的 codec，本模块不再自己拼串。

## 分步

1. 建 `selection-codec.ts`，搬入 `canvasIdOf` / `fromCanvasId`（行为逐字照搬，不改语义）。
2. `CanvasPanel` 的两个函数改为转调；跑 `use-canvas-keyboard` 与 `scenario-a` 测试。
3. 搬入 `selectionOfMenuTarget` / `menuTargetOfCanvas`；`use-canvas-context-menu` 与
   `context-menu.ts` 改为转调。
4. 写「全 kind 可寻址表」测试，钉住 16 个 kind 的答案。
5. 删除 `CanvasPanel.tsx:89/106` 与 `use-canvas-context-menu.ts:203` 的原实现。

## 测试

- **往返测试**（本工单的核心价值）：对每种可寻址 kind，
  `fromCanvasId(type, canvasSelectionOf(sel))` 应 `sameSelection` 回原 `sel`。
  遍历 16 个 kind × 4 个图种，不可寻址的组合断言返回 `null`。
- 现有 `scenario-a-class-relation.test.tsx` 必须保持绿——它是目前唯一真正钉住
  「中位插入后仍选中同一条」的测试，也是本工单的护栏。
- `context-menu.test.ts` 与 `use-canvas-context-menu.test.tsx` 应零改动全绿。

## 验收

- `CanvasPanel.tsx` 里不再有 `canvasToEditorSelection` / `selectedDataIdOf` 的函数体。
- 新增的往返测试覆盖全部 16 个 kind。
- 全量测试绿。

## 风险

- `canvasToEditorSelection` 对 flowchart 走的是 `toEditorSelection`（`flowchart-adapter.ts:26`），
  与其它三图种不同——搬的时候**保留这个分支**，不要为了统一而统一。它留在 `fromCanvasId` 内部即可。
- `selectTarget` 的 9 个分支里有几支是「什么都不做」（blank 目标不 select），
  搬的时候保留这个语义（`selectionOfMenuTarget({kind:'blank'})` 返回 `null`）。

## Decision（已定案）

**`resolve*Selection` 不收进本工单，归 04。**

它是「选中在当前投影里还存在吗」，属投影自己的事；且四份各自 switch 的 kind
**互不重叠**（flowchart 只认 node/edge/subgraph/classdef，class 只认 class-*，以此类推），
合成一份反而要重新引入图种分发——等于把 04 要消灭的东西在 codec 里又造一遍。

它在 04 里作为 `CanvasCapabilities.resolveSelection` 的一项，由各自 adapter 持有。
本工单只做「Selection ↔ 画布 id ↔ ContextMenuTarget」这三件互为逆向的事。

**穷尽性的做法也已定**：不做类型层 `assertNever`。`canvasIdOf` 的 `default: return null`
是有意的（画布本来就只可寻址一部分 kind），硬改会扭曲类型。改用「显式可寻址表 +
遍历全部 16 个 kind 的测试」——新增 kind 时测试逼你回答「它可寻址吗」，
漏答是测试失败而不是线上静默。
