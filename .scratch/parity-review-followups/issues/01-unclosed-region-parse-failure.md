# 01 未闭合 `rect` / `box` 不再让整图解析失败

Status: resolved

来源：`spec.md` 的 F1 / D1。本批唯一会造成**既有图表回退**的问题，优先于其他票。

## D1 定案（2026-09-29）：取 (甲) 保留 entry

实测证据，无需再调研：

- 投影侧不配对：`sequence-projection.ts:174-178` 对 `rect-open` / `box-open` 只是
  `regions.push({ elementId: part.id, ... })`，**不存在**与 `region-end` 配对的逻辑，
  `regions` 数组的每一项独立成项。
- 编辑侧不配对：`sequence.ts:1122` 的 `resolveSetRectColor` 只做
  `getElementById(doc, intent.elementId)` + `part.element.kind !== 'rect-open'` 判断，
  不需要 end 就能改名 / 改色。

故 (甲) 成立：未闭合的 region 只留下一个没有 `region-end` 配对的 `rect-open` entry，
投影里仍可见、仍可改名，与工单 06「平铺进投影、不做分组编辑」的定位一致。
(乙) 回滚走 verbatim 作废——它会让这类图在结构树里彻底看不见，与工单 06 的诉求冲突。

改动就是：收尾检查只对 `scope === 'block'` 的未闭合项抛错，region 未闭合则容忍，
并恢复旧文案「逻辑块缺少匹配的 end」。

## 问题

工单 06 把 `SequenceParser` 的 `blockStack` 换成了含区域块的 `openStack`
（`sequence.ts:569-572`，栈元素 `scope: 'block' | 'region'`），收尾检查随之扩大：

```ts
// sequence.ts:628-630
if (openStack.length > 0) {
  throw parseFailure(openStack[openStack.length - 1].lineNo, '逻辑块或区域块缺少匹配的 end')
}
```

变更前 `rect` / `box` **不进栈**、其 `end` 也不解析（被删注释原文：「清单外块（rect/box）的 end：
不解析，原样保留」），属于 ADR-0004 的逐字保留范围。现在未闭合即整图 `parseFailure`。

**回退场景（必须能复现）**：区域块内嵌逻辑块时，`end` 只够关内层，`rect` 永远等不到自己的 end。

```mermaid
sequenceDiagram
    rect rgb(200, 150, 255)
    loop 每日
    甲->>乙: 打卡
    end
```

- 旧行为：栈内只有 `loop`，`end` 关 `loop`，图正常解析。
- 新行为：栈 `[rect(region), loop(block)]`，`end` 关 `loop`，`rect` 残留 → **整图解析失败**。

## 需求

1. **收尾只检查 `scope === 'block'`**：region 未闭合**不抛错**。错误文案回到
   `逻辑块缺少匹配的 end`（与 `flowchart.ts:864` 的 `subgraph 缺少匹配的 end` 保持同一措辞风格，
   但本票只改 sequence，**不动 flowchart**）。
2. **确定未闭合 region 留下的 `rect-open` / `box-open` entry 怎么处理**（见下两个方案）。
3. **保留**工单 06 已兑现的能力：正常闭合的 `rect` / `box` 仍解析出 `region-end`，
   仍进投影、结构树可见、可改名。

### 两个方案（选其一，在 Comments 写明理由）

- **(甲) 保留 entry（默认，改动最小）**：未闭合 region 的 `rect-open` / `box-open` entry 留在
  `entries` 里，投影可见、可改名，只是没有配对的 `region-end`。与工单 06
  「平铺进投影、不做分组编辑」的定位一致——未闭合只是少了个 end 行，不该让整段消失。
  **前提**：需实测确认投影 / 结构树不假设 open 必有 end。
- **(乙) 回滚 entry、走 verbatim**：把未闭合 region 的 entry 从 `entries` 移除，整段当作不解析，
  完全恢复旧行为。**代价**：这类图在结构树里看不见，与工单 06「可见 + 可改名」冲突。

## 落码位置

- `src/lib/pipeline/sequence.ts`：解析循环里的 `openStack`（`:572` 声明、`:599-616` 进出栈、
  `:628-630` 收尾检查）。
- 若选 (乙)：还需处理 `assembleDocument` 之前对 `entries` 的清理。

## 不变量

- **逻辑块未闭合仍必须报错**：`loop` / `alt` / `opt` 等 `scope: 'block'` 的未闭合行为
  **不得改变**，`parseFailure` 的行号仍指向未闭合的开行。既有用例
  `sequence.test.ts:52`（`expect(stack, ...).toHaveLength(0)`）必须继续绿。
- 正常闭合的 `rect` / `box` 的解析结果**逐字等价**于当前实现（`sequence.test.ts:418-422`、
  `:559-561` 断言了 `rect-open` / `region-end` / `box-open` 的种类序列，不得改变）。
- 逐字保留（ADR-0004 / ADR-0008）不放松：本票只让「解析不该失败」的图重新解析成功，
  不新增对 region 内部行的解析。

## 测试

- `src/lib/pipeline/__tests__/sequence.test.ts` 新增：
  1. `rect` 内嵌 `loop` 且只有一个 `end` → **解析成功**（方案 (甲) 下断言 `rect-open` 存在、
     无 `region-end`；方案 (乙) 下断言整段 verbatim）。
  2. `box` 完全未闭合（无任何 `end`）→ 解析成功，同上断言。
  3. **回归保护**：`loop` 未闭合 → 仍 `parseFailure`，行号指向 `loop` 行。
  4. 正常 `rect … / … / end` → 仍出 `rect-open` + `region-end`（保护工单 06 成果）。

## 验收

- [ ] 上面 4 条用例全绿，且既有用例无一条变红/被删。
- [ ] 在 Comments 写明选了 (甲) 还是 (乙)，以及理由与实测证据。
- [ ] 控制台 0 error / 0 warning。（按 `AGENTS.md` 当前规则，默认不做真机确认；若需真机，单独提出）

## Comments

### 2026-09-29 实施记录（followups-01）

**选 (甲) 保留 entry**，D1 已在票首定案，实施时复核了它的两个前提，均成立：

- `src/lib/projection/sequence-projection.ts:174-178`：`rect-open` / `box-open` 各自
  `regions.push({ elementId: part.id, ... })`，没有任何与 `region-end` 配对的代码，
  `regions` 是独立成项的数组 → 缺 end 不会让投影报错或缺项。
- `sequence.ts` 的 `resolveSetRectColor` / `resolveSetBoxLabel` 只用
  `getElementById(doc, intent.elementId)` 定位 open entry，不需要 end → 仍可改名 / 改色。
- 另核 `matchingEnd`（`:964`）与 `blockShapes`（`:978`）只统计 `block-open` / `block-end`，
  `region-end` 不参与深度计数 → 未闭合 region 不会污染逻辑块的 end 配对。

**实际做法**：只改 `src/lib/pipeline/sequence.ts` 的收尾检查一处（`parseDocument` 末尾）。
原 `if (openStack.length > 0) throw …` 改为从栈顶向栈底找第一个 `scope === 'block'` 的未闭合项，
找到才抛；纯 region 残留不抛。文案恢复 `逻辑块缺少匹配的 end`。
取「最内层未闭合的逻辑块」而非「栈底」，是为了与旧行为（rect 不进栈时取栈顶）行号一致；
`[loop(block), rect(region)]` 这种 rect 内层未闭合的场景现在报 loop 行，与旧实现相同。

未新增对 region 内部行的任何解析，逐字保留（ADR-0004 / ADR-0008）不放松：
用例里断言了 `reassemble(parsed.doc)` 与输入逐字相同。

**新增用例**（`src/lib/pipeline/__tests__/sequence.test.ts`，新增 describe
「未闭合 rect / box 不解析失败（工单 01）」，共 4 条）：

1. `rect` 内嵌 `loop` 且只有一个 `end` → 解析成功，种类序列
   `seq-header / rect-open / block-open / message / block-end`（`end` 关 `loop`，无 `region-end`），
   并断言重组装逐字相同。
2. `box` 完全无 `end` → 解析成功，`box-open` 保留、无 `region-end`。
3. 回归保护：`loop` 未闭合仍 `parseFailure`（行号 3、文案「逻辑块缺少匹配的 end」）；
   另加一条 `loop 外层 / rect … / end`（`end` 关 rect、loop 未闭合）→ 仍报错且行号指 loop（行 2）。
4. 正常闭合的 `rect` / `box` 仍出 `open` + `region-end`（保护工单 06 成果）。

**全量测试结果**：`npm run typecheck` 通过（0 error）。`npx vitest run` 全量 53 文件 / 794 用例，
**793 通过 / 1 失败**——失败的是 `src/components/__tests__/scenario-a-class-relation.test.tsx:444`
（class 关系的右键菜单选中），该文件与 `use-canvas-context-menu.test.tsx` 当时正被并行代理
（工单 05）修改中，**与本次改动无关**（本次只碰 `sequence.ts` 与其测试）。
本人负责的 4 个 sequence / 投影测试文件（`sequence.test.ts` 82、`sequence-golden.test.ts` 12、
`verbatim-identity.test.ts` 9、`sequence-projection.test.ts` 30）全绿，共 133 用例。

**与定案的偏差**：无。既有用例未改未删。

**提交**：`aa8c7b4 fix(sequence): 未闭合 rect/box 不再让整图解析失败（工单 01）`

**验收项**：用例 4 条全绿 ✓；(甲)/(乙) 选择已写明 ✓；控制台 0 error / 0 warning —— 按 `AGENTS.md`
当前规则默认不做真机确认，本票为纯解析器改动且无 UI/渲染路径变更，建议标「不适用」。
