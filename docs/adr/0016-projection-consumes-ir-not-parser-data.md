# 投影只认 IR，不 import parser 的 `*Data`

四个投影直接消费各 parser 的 data 类型，parser 的内部表示成了投影事实上的公开
interface：`projection/mindmap-projection.ts` 曾 import `MindmapNodeData` / `MindmapIconData`
并靠 `part.element as MindmapNodeData` 断言取字段；`projection/class-projection.ts`
甚至跨图种 import `pipeline/flowchart` 的 `ClassDefData`。parser 一改内部表示，投影跟着动。

工单 06 判定这是 Speculative：四个 parser 约 3300 行、四个投影约 650 行，若 IR 与
`*Data` 一对一，这层就是浅层，引入它反而多一次转换、多一层形状。因此先做时间盒
spike，只在 mindmap 上试（最小：投影 78 行 / parser 581 行），用三条判据裁决
（`.scratch/architecture-deepening/issues/06-projection-ir-spike.md`）。

**Spike 结果（2026-09-29）：Go——三条判据全中。**

- `mindmap-projection.ts` 不再 import `pipeline/mindmap` 的任何 `*Data`，
  只 import 新增的 `pipeline/mindmap-ir.ts`。
- 既有测试语义断言零改动：护栏 `mindmap-golden.test.ts` 与 `verbatim-identity.test.ts`
  未动一行而全绿，全量 837 个测试通过（58 个文件），改动只新增文件 +
  改写 `mindmap-projection.ts` 本体。
- IR 不是逐字段搬运，吸收了原本散在投影里的两块逻辑：
  `::icon()` 行归属（折叠进节点，投影不再见到独立 icon 元素）与
  `parentId` 解析（最近更浅前序节点，缩进栈语义离开投影）；
  同时丢弃读侧不需要的渲染原文（indent / openRaw / closeRaw / trailing / eol / gapAfterId）。
  转换层约 70 行（含文档注释），配 5 个有意义的单测
  （icon 归属、id 可选（ADR-0009）、六种 shape 归一化、span 约定）。

**决定**：

- **投影只认 IR**：`projection/*-projection.ts` 不得 import 同图种 parser 的
  `*Data` 类型。IR 落在 `src/lib/pipeline/<diagram>-ir.ts`（projection 本就依赖
  pipeline 方向，与 ADR-0015 定 01 号工单落点的理由相同，不新增反向依赖）。
- **IR 层允许（且仅允许）依赖 parser 表示**：`AnyElement` 到 IR 的结构性读取
  （一次 `as unknown as`）集中在 IR 转换文件内；投影不再出现 `as *Data` 断言。
  这是 TS 下绕开 parser 内部表示的唯一干净缝隙——不引入 IR 的话，投影要么继续
  import `*Data`，要么对 `AnyElement` 做无类型读取，没有第三条路（spike 中实测）。
- **形状词表（`MindmapShapeType` 等）是共享内核，不算泄漏**：六值形状并集同时被
  编辑意图（`MindmapIntent`）与表单消费，IR 对其做 re-export，投影经 IR 取用。
  「不 import `*Data`」约束的是 parser 的内部表示（行级原文字段），不是图种语义词表。

**边界与诚实的注记**（spike 同样量到了这些）：

- mindmap 的投影公开输出本来就已经是一个稳定形状（`ProjectionMindmapNode` 不泄漏
  任何 parser 类型），真正的泄漏只有两处 `as` 断言。因此 mindmap 上 IR 的实际内容
  是「把 icon 归属与父子解析从投影搬进 pipeline、给这层形状一个名字」，
  `buildMindmapProjection` 变成 `toMindmapIR` 的直通。收益是解耦（parser 内部表示
  的改动只被 IR 转换吸收）而非新增能力；投影文件从 78 行降到约 50 行。
- IR 是**图种内**稳定形状，不承诺图种间复用——mindmap IR 不会被 flowchart 消费。
  跨图种接缝（class 投影 import flowchart 的 `ClassDefData`）的解法是同一约定的
  推广，不是设计一个万能 IR。
- spike 只动了 mindmap。**推广顺序若继续：class 次之**（197 行投影，且有跨图种
  import 的实际痛点），flowchart 最后（1402 行 parser）；每图种一个工单，
  沿用本票的三条判据验收。

**后果**：

- parser 重构（例如改 `MindmapNodeData` 的字段）不再波及投影与全部消费组件，
  波及面收敛到 `mindmap-ir.ts` 一个文件。
- 逐字保留红线（ADR-0008）不受影响：IR 是读侧派生物，不参与重组装，
  golden / verbatim 护栏零改动全绿即证据。
- 与 ADR-0004（手写 parser + passthrough）不冲突：不换 parser、不改逐字承诺，
  只在解析产物之上加一层读侧视图。
