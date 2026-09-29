# 06 · parser → 投影 垫一层稳定 IR（时间盒 spike）

Status: resolved
Blocked by: —
Type: prototype

## 现状（已核实）

四个投影直接吃各 parser 的 data 类型：

- `projection/class-projection.ts:2-13` 从 `../pipeline/class` 导入 `ClassDeclData` /
  `ClassDirectionData` / `MemberData` / `NamespaceData`，**并且第 13 行还从
  `../pipeline/flowchart` 导入了 `ClassDefData`**——跨图种的接缝泄漏。
- `projection/mindmap-projection.ts:2` 导入 `MindmapIconData` / `MindmapNodeData` / `MindmapShapeType`。
- 投影内部靠 `part.element as ClassDeclData` 这类断言取字段。

投影确实只读（ADR-0008，无反向写回），这点没问题。问题是：
**parser 的内部表示变成了投影事实上的公开 interface**——parser 一改内部表示，投影跟着动。

## 为什么是 spike 而不是直接做

我在报告里给这条的评级是 Speculative，理由是代价未知：

- 四个 parser 合计约 3300 行，四个投影合计约 650 行。
- 若 IR 与 `*Data` 几乎一对一，那这层不背任何复杂度——按 codebase-design 的说法，
  它就是**浅层**，引入它反而多一次转换、多一层要维护的形状。
- 判据不在「能不能做」，而在「做完之后投影是否真的获得了图种无关的复用」。

## 方案（时间盒：一个工单，只在 mindmap 上做）

选 mindmap 的理由：最小（投影 78 行 / parser 581 行），且它的 `*Data` 与投影字段最接近一对一——
**如果连 mindmap 都显现不出收益，那这条就可以直接判 No-Go，不必在另外三个上浪费。**

1. 定义 `MindmapElementIR`（id / kind / span / attrs 的图种内稳定形状），放在
   `projection/` 与 `pipeline/` 都可见的位置。
2. `MindmapParser` 输出 IR（或在 `assembleDocument` 后加一步转换）。
3. `mindmap-projection.ts` 只认 IR，不再 import `pipeline/mindmap` 的任何 `*Data`。
4. 跑 `projection/__tests__/mindmap-projection.test.ts` 与 `pipeline/__tests__/mindmap*`。

## Go / No-Go 判据

**Go** —— 三条全中才继续在另外三个图种上推：
- `mindmap-projection.ts` 不再 import `pipeline/mindmap` 的 `*Data` 类型；
- 既有投影测试**语义断言零改动**（改 import 可以，改期望值不行）；
- IR 至少吸收了一处原本散在投影里的逻辑（比如 shape / icon 的归一化），
  即这层确实背了复杂度而不是纯搬运。

**No-Go** —— 出现任一即停，并把结论记成 ADR，避免将来有人再提一次：
- IR 与 `*Data` 一对一、转换函数只是逐字段拷贝；
- 为了对齐 IR，反而要在投影里加回图种分支；
- 转换层自己长出了 100 行以上且无法单测出有意义的用例。

## 测试

- IR 转换的单测：覆盖 icon 归属、id 可选（ADR-0009）、shape 归一化。
- 护栏：`mindmap-golden.test.ts` 与 `verbatim-identity.test.ts` 必须零改动全绿——
  逐字保留是 ADR-0008 的红线，IR 层绝不能碰源码文本。

## 风险

- **最大风险是"为了架构纯洁性而加层"**。spike 的目的恰恰是把这个判断变成事实而不是品味。
- 若判 Go，第二个图种应选 class（197 行投影，且有跨图种 import 的实际痛点），
  不要选 flowchart（1402 行 parser，最大）。

## Decision（已定案）

**不预先写 ADR 草稿**，只在本工单里写清两种结论各自要记什么。

理由：spike 的全部价值在于用事实判 Go / No-Go，而一份预先写好的草稿（哪怕自称中立）
会制造确认偏误——写的人会不自觉地把事实往草稿里填。等结果出来再写，写的是结论而不是预言。

**两种结论都要落 ADR**（编号顺延，预计 0016），这是硬要求不是建议：

- **Go** → 记「投影只认 IR，不再 import parser 的 `*Data`」这条新约定。
- **No-Go** → 记「已试过：IR 与 `*Data` 一对一，转换层只是搬运，属浅层，勿再提」。

No-Go 那条尤其重要——它正是未来探索者需要它才能避免重复建议的那种理由。
（对照：本批次的能力包切分已记为 ADR-0015，正因为它是同类问题里被判定为**值得做**的那个。）

## 实施记录（2026-09-29）

**结论：Go** —— 三条判据全中，ADR 已落 `docs/adr/0016-projection-consumes-ir-not-parser-data.md`。

**做了什么**（严守时间盒，只动 mindmap）：

- 新增 `src/lib/pipeline/mindmap-ir.ts`：`MindmapNodeIR` / `MindmapDocumentIR` +
  `toMindmapIR(doc)` 转换。IR 折叠 icon 行进节点、就地解析 parentId、
  丢弃渲染原文（indent / openRaw / closeRaw / trailing / eol / gapAfterId）；
  `MindmapShapeType` 经 re-export 共享（形状词表与编辑意图共用，不算泄漏）。
- 改写 `src/lib/projection/mindmap-projection.ts`：不再 import `pipeline/mindmap` 的
  任何 `*Data`，只 import mindmap-ir；`buildMindmapProjection` 变成 `toMindmapIR` 直通，
  `resolveMindmapSelection` 原样保留。
- 新增 `src/lib/pipeline/__tests__/mindmap-ir.test.ts`：5 个单测
  （icon 元素级归属、id 可选（ADR-0009）、六种 shape 归一化 + 默认 null、
  父子解析、span 约定）。

**证据（对照判据）**：

1. 投影零 `*Data` import：`grep "pipeline/mindmap'" src/lib/projection/` 仅剩 mindmap-ir。
2. 既有测试语义断言零改动：`mindmap-golden.test.ts`、`verbatim-identity.test.ts`、
   `mindmap-projection.test.ts` 均未动一行，全绿。全量 `npm test`：58 文件 / 837 测试通过；
   `npm run typecheck` 干净。
3. IR 吸收了投影里的两块真实逻辑（icon 归属 + parentId 解析），不是逐字段拷贝；
   转换层约 70 行（含注释），未触发 100 行 No-Go 条款。

**spike 同样量到的代价/边界**（已写进 ADR-0016，防止后人美化）：

- mindmap 投影的公开输出本来就已是稳定形状，真正泄漏只有两处 `as` 断言；
  本票在 mindmap 上的实际内容是「把 icon/parent 逻辑搬进 pipeline + 给形状命名」。
  收益是解耦，不是新能力。
- IR 是图种内形状，不解决跨图种复用；class 投影 import flowchart `ClassDefData`
  的接缝要用同一约定逐图种推广（次选 class，勿先动 flowchart）。
- 不引入 IR 时 TS 下没有第三条路：投影要么 import `*Data`，要么对 `AnyElement`
  无类型读取——这条缝隙是被实测确认的，不是推断。

**测试数字**：新增 5 测（mindmap-ir.test.ts）；既有 837 测零改动全绿。

**ADR 落点**：`docs/adr/0016-projection-consumes-ir-not-parser-data.md`（Go 版：
「投影只认 IR，不 import parser 的 `*Data`」新约定 + 推广顺序 + 共享词表豁免）。
