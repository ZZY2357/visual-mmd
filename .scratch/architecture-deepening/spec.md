# Architecture deepening — 六个候选的实施方案

来源：`/improve-codebase-architecture` 于 2026-09-29 的扫描。走查范围由提交历史决定——
最近 10 个提交全在做 sequence / class 编辑能力对齐，故集中在
`pipeline/`、`projection/`、`canvas-selection/`、`editing/`、`CanvasPanel.tsx` 这条链路。

## 实施顺序

依赖决定顺序，不是重要性。**04 是顶推项**，但它压在 01 与 03 之上。

```
01 元素 ID codec          无依赖 · 纯收益 · 最底层
   └──► 03 选中 codec     依赖 01 的形态清单
             └──► 04 画布能力包   ← 顶推项，依赖 01 + 03

02 插入内核               无依赖 · 可与 01 并行
05 菜单动作表             无依赖 · 随时可做
06 投影 IR                时间盒 spike · 最后做
```

## 三处对扫描报告的修正

写方案时核到的事实与报告有三处出入，以本文件为准：

1. **能力包不是新发明，已经存在。** `canvas-keyboard.ts:243` 的 `CanvasNavigation`
   （`extents` / `dataIdOf` / `toSelection` / `reveal` / `firstSelection`）就是一个能力包接口，
   且在 `CanvasPanel.tsx:449-488` 现场组装。所以 04 的性质从「引入 bundle」变成
   「把既有 bundle 模式推到全部能力，并把组装移出 CanvasPanel」——比原先估计的更稳。

2. **`selection.ts` 的 `selectionKey` 不是元素 ID 的消费端。** 报告把它列为「协议被重写」，
   实际上 `selectionKey` 是**另一套命名空间**（`class-relation:relation:1`，而 parser 的元素 ID 是 `relation:1`），
   只用于 `sameSelection` 相等性比较，不参与 DOM 寻址。真正的消费端重写只有
   `flowchart-projection.ts:86`（正则反解 occurrence）、`sequence-projection.ts:191`（合成隐式参与者的 ID）、
   `sequence.ts` 里 4 处 `getElementById(doc, \`participant:${...}\`)` 拼接。01 的范围据此收窄。

3. **连线的编解码已经有正确样板。** `canvas-selection/edge-identity.ts` 就是一个完整的
   codec（正则 + `edgeElementIdOf` + `edgeOrdinalOf` + `isEdgeElementId`），ADR-0012 落地得很好。
   01 的正确做法不是新设计一套，而是**把这个已验证的形状推广到节点类 ID**。

## 共同约定

- 每个候选一个工单文件，一次提交；不跨候选混改。
- 默认不做真机 / 浏览器验收（AGENTS.md）。依赖 DOM 的部分走 happy-dom 单测或手工确认。
- 任何候选若触碰已裁定事项（ADR-0001 / 0004 / 0005 / 0007 / 0008 / 0009 / 0012 / 0013 / 0014），
  先记 ADR 再动代码；不定的在工单里单列。
- 「图种分支」是可数的验收指标：动完之后 `grep -c 'projection.type ==='` 必须下降，且不得新增。

## 明确不做

- `lib/editing/*-forms.ts` 那层（232/195/151/77 行）看着浅，但那是 ADR-0001 为可测试性付的租金，
  接口≈实现是有意为之。只收敛四份文件里重复的枚举（形状 / 箭头 / 可见性），不抽层。
- 把四份手写 parser 换成 `@mermaid-js/parser`：ADR-0004 已裁定。
- 表单分发从 `switch` 改成配置：加一个属性目前只改 1 个 case + intent + i18n，这层不痛。

## 已定案

岔路已在各工单的 `## Decision` 小节落定，此处是索引与理由。

| # | 岔路 | 定案 | 理由（一句话） |
| --- | --- | --- | --- |
| 01 | 元素 ID codec 放哪 | `src/lib/pipeline/element-id.ts` | projection 已依赖 `pipeline/document`，不新增依赖方向；生成端就近，改协议时 locality 最好 |
| 03 | `resolve*Selection` 是否收进选中 codec | **否**，归 04 | 它是「选中在投影里还存在吗」，属投影自己的事；四份各自 switch 的 kind 互不重叠，合成一份反而要重新引入图种分发 |
| 04 | 能力包挂 registry 还是独立模块 | **两者兼得**：接口定义在 `canvas-selection/capabilities.ts`，实例挂在 `DiagramTypeRegistration.canvas` 字段 | registry 只持引用不塞实现（不撑胖），同时「加一种图」仍是一处改动 |
| 04 | `extents` / `reveal` 是否进包 | **不进**，留在 hook 层组装 | 进包则包要持有容器引用、变有状态对象，会废掉 `use-canvas-keyboard` 现有的假注入测试手段 |
| 05 | 动作表放哪 | `src/lib/editing/menu-actions.ts` | `context-menu.ts` 管「菜单长什么样」，动作管「点了做什么」，变化频率不同 |
| 06 | 是否预写 No-Go 版 ADR 草稿 | **不预写** | 预写会产生确认偏误，与 spike「用事实判断」的目的相悖；改为在工单里写清两种结论各自要记什么 |

第 04 条的两项定案**已升格为 ADR-0015**（`docs/adr/0015-canvas-capabilities-hold-diagram-knowledge-only.md`）——
它是顶推项的核心切分，难以逆转，且后人在改 `CanvasPanel` 时必然会问「为什么 `extents` 不在包里」。

其余几条不单独开 ADR：01 换目录成本不高（易逆转），03/05/06 属于「我们做了显而易见的选择」，
没有值得记住的被否决方案。

06 的 spike 结束后**无论 Go 还是 No-Go 都要落 ADR**（编号顺延，预计 0016）——
No-Go 尤其重要：它正是未来探索者需要它才能避免重复建议的那种理由。

## 批次收官（2026-09-29）

六票全部 resolved（01 由主线程完成，02 由主线程完成，03/04/05/06 由子代理在独立 git worktree
完成后经审查逐票合入 main）。全量验证：`npm run typecheck` 0 error；`npm test` **61 文件 / 864 用例全绿**。

- 新增模块：`pipeline/insert.ts`（02）、`editing/menu-actions.ts`（05）、
  `canvas-selection/selection-codec.ts`（03）、`canvas-selection/capabilities.ts` + 四图种 adapter（04）、
  `pipeline/mindmap-ir.ts`（06）。
- ADR：0015（04 前置）、0016（06 spike，Go）。
- `grep -c 'projection.type ==='`：CanvasPanel 20 → 0，PropertyPanel 6 → 0，全库 43 → 26，未新增。
- 留给人类的欠账不变：U3（浏览器验收基线属越权）、U4（禁用字「边」），见 parity-review-followups/spec.md。
