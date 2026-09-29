# Spec: sequence-class-parity 批次的 review 后续（parity-review-followups）

来源：对 `5874603...HEAD`（sequence-class-parity 批次，10 提交 / 59 文件 / +6886 −341）的
两轴 code review。review 结论中**用户勾选要处理的部分**落成工单，其余见文末「未纳入本批」。

本文件是共识的唯一权威记录：背景事实（已核实的代码行为，勿重复调研）与决策记录写在这里；
工单文件只写实施细节，不再重述理由。

前序批次：`v1`（12 票）、`canvas-interaction`（8 票）、`editor-polish`（14 票）、
`sequence-class-parity`（9 票）。本批是第五批，**性质是前一批的返工/补漏，不是新功能**。

**本批只开票，尚未落码。** 用户明确指示在落票与 spec 定案之前不动代码。

---

## 背景事实（已核实，勿重复调研）

每条都附了证据，且均为本次 review 中**实际打开代码核对过**的结论，不是推测。

### F1 未闭合的 `rect` / `box` 会让整图解析失败（回退）

工单 06 把 `SequenceParser` 的 `blockStack` 换成了含区域块的 `openStack`
（`sequence.ts:569-572`，栈元素带 `scope: 'block' | 'region'`），收尾检查随之扩大：

```ts
// sequence.ts:628-630
if (openStack.length > 0) {
  throw parseFailure(openStack[openStack.length - 1].lineNo, '逻辑块或区域块缺少匹配的 end')
}
```

变更前的语义见被删掉的那两行注释（diff 可见）：

```
// 清单外块（rect/box）的 end：不解析，原样保留
```

即 `rect` / `box` **根本不进栈**，其 `end` 也不解析——它们属于「无法解析就逐字保留」的语法
（ADR-0004）。现在它们进栈，**未闭合即整图 parseFailure**。

由此派生一个真实的回退场景：区域块内嵌逻辑块时，`end` 的归属被改变。

```mermaid
sequenceDiagram
    rect rgb(200, 150, 255)
    loop 每日
    甲->>乙: 打卡
    end
```

- 旧行为：`rect` 不进栈，栈内只有 `loop`；这个 `end` 关闭 `loop`；图正常解析。
- 新行为：栈为 `[rect(region), loop(block)]`，`end` 关闭 `loop`（仍对），
  但 `rect` 永远等不到自己的 `end` → **整图解析失败**。

即：一张此前能正常渲染的图，现在打不开了。这是本批唯一会造成**既有图表回退**的问题。

### F2 namespace 改名在重名时选中回落失败

解析器给 namespace 的 part id 带重名序号（`class.ts:449`）：

```ts
id: `namespace:${ns.name}` + (count > 1 ? `#${count}` : '')
```

而 `NamespaceForm` 改名后固定按下式跟随选中（`class-forms.tsx:288`）：

```ts
select({ kind: 'class-namespace', elementId: `namespace:${intent.name}` })
```

两者不一致：当新名字与**另一个已存在的** namespace 重名时，实际 id 是 `namespace:<名>#2`，
表单拼出的 `namespace:<名>` 不存在 → 选中落空 → 表单回落到图表级，用户看不到自己刚改的名字。

### F3 note / block 标了位置序身份，但点选命中不到

`annotateSequenceIdentities` 把 note / block 的身份标在**宿主 `<g>`** 上，而消息标在几何元素本身
（`edge-locate.ts:144-146`）：

```ts
annotateAnchors(hostGroupsOf(...(SEQUENCE_NOTE_RECT)), 'note', counts.notes)
annotateAnchors(hostGroupsOf(...(SEQUENCE_BLOCK_LINE)), 'block', counts.blocks)
```

但 `hitTestEdgeIdentity`（`:177`）只挑**有几何 API** 的元素：
`distanceToPath`（`:155`）在 `typeof geo.getTotalLength !== 'function'` 时直接返回 `null`，
`<g>` 没有 `getTotalLength` → note / block 的身份**永远进不了候选**，函数对它们恒返回 `null`。

结果是工单 02 的「位置序寻址」对 note / block 只兑现了**标注**，没兑现**点选命中**。

### F4 本批新造了 CONTEXT.md 的禁用词

`CONTEXT.md` 的「连线」条 `_Avoid_` 明列 `消息线（仅用于 sequence）`。
`git grep 消息线 5874603` **为空**——该词完全是本批新造的，共 15 处，分布在
`edge-locate.ts`、`context-menu.ts`、`use-canvas-context-menu.ts`、`use-canvas-selection.ts`、
`i18n/index.ts` 及 4 个测试文件。canonical 说法是「消息」或「连线」。

### F5 工单 03 的「编辑类」菜单项没有落码

工单 03 阶段二要求「改两端基数（`cardFrom` / `cardTo`）、改标签」（`03-…md:23`）。
实现里 `editRelation` / `editMessage` 的函数体**只有 `closeMenu()`**
（`use-canvas-context-menu.ts` 约 `:464-481`）：菜单项不落任何码，只关菜单。

需要澄清的是：右键菜单本身**已联动选中**（这是工单 03 阶段一的成果），关掉菜单后右侧属性面板
会出现 `RelationForm` / `MessageForm`，用户**能在那里**改基数与标签。所以这不是「完全不可编」，
而是「菜单项自身是个空动作」。是否算兑现工单 03，取决于口径——见 D5。

**口径已改（2026-09-29，D5 定案，落码见工单 05）：工单 03 阶段二那句承诺已由「菜单内直接改」
改为「经属性面板完成」。**

| | 原文（`03-edge-context-menu.md:23-25`） | 新口径 |
|---|---|---|
| 承诺 | class 关系边「改两端基数（`cardFrom` / `cardTo`）、改标签（`label`）」；sequence 消息线「改 act、改文本」——阶段二的字段编辑**直接改**或走已有的节点表单浮层 | 这四项**经属性面板完成**：菜单项 = 选中该连线 + 关闭菜单，字段在右侧 `RelationForm` / `MessageForm` 改 |

理由（与既有裁定对齐）：ADR-0001 是「表单驱动编辑，不是自由画布」，`CONTEXT.md:73-74` 把**属性面板**
定义为选中元素属性表单的入口；在右键菜单里再开一套基数 / 标签编辑等于引入第二个编辑入口，
两处的脏数据与校验规则会各自漂移。（丙）「画布上应是『这元素能做什么』而非又一个表单」的立意
同样支持这条口径。

---

## 决策记录

| 主题 | 决策 |
|---|---|
| 范围 | **只处理用户勾选的两组**：确定性缺陷（F1–F4）+ 工单 03 补落码（F5）。重构类气味与口径断言**不纳入**（见文末） |
| 推进顺序 | 先 F1（唯一会造成既有图表回退），其余可并行；F4 是纯字符串替换，随时可做 |
| F1 的收口方向 | **region 不参与收尾抛错**——只对 `scope === 'block'` 的未闭合项抛 `逻辑块缺少匹配的 end`（恢复旧文案），region 未闭合则容忍。~~待定案点见 D1~~ → **D1 已于 2026-09-29 定案为 (甲) 保留 entry**（证据见工单 01） |
| F5 的口径 | ~~待定案（needs-triage）~~ → **D5 已于 2026-09-29 定案**：菜单项不内嵌表单，改为明确的「在属性面板中编辑」入口（措辞取「在属性面板中编辑」而非「编辑属性」，后者不说明点完去哪儿改）；工单 03 阶段二承诺同步改为「经属性面板完成」（理由见工单 05） |
| 02 去掉投影里的按名去重 | **已裁定：接受**（实施中新增，非票面范围）。`buildClassProjection` 原先按名字去重，第 2 个同名 namespace 不进投影 → 不可见也不可选中，只改表单达不到「面板不回落图表级」的验收。去掉后每个 namespace 各自成项，与 `CONTEXT.md`「元素：投影中可被选中的最小单位……拥有各自的元素 ID」同口径。易逆转，不开 ADR |
| 03 身份标注范围超出 D3 字面枚举 | **已裁定：接受**。D3 原话「note → `rect.note`；block → 每条 `line.loopLine`」有漏洞：只标几何锚点的话，点在注释**文字**上会找不到身份（文字占注释绝大部分面积，且 `SVGTextElement` 没有 `getTotalLength`，几何兜底接不住），相对现状是回退。改为标「宿主直接子元素中的非 `<g>`」覆盖 DOM 上行与几何采样两条路径；排除 `<g>` 以免块内嵌内容被误归属成块。**这是我写定案时的遗漏，不是实现跑偏** |
| 落盘 | 新目录 `.scratch/parity-review-followups/`，不追加进已结单的 `sequence-class-parity/spec.md` |
| 验收惯例 | 沿用前批：spec.md + 编号工单 + 必要的新 ADR + `CONTEXT.md` 术语补充 |

### D1 待定案：region 未闭合时，已解析出的 `rect-open` entry 怎么办

F1 修「不抛错」只是第一步，还有个连带问题：未闭合的 region 会留下一个**没有 `region-end` 配对**的
`rect-open` entry。两种处理：

- **(甲) 保留 entry**（改动最小）：投影里仍可见、仍可改名——与工单 06「平铺进投影、不做分组编辑」
  的定位一致，未闭合只是少了个 end 行。风险：投影/结构树是否假设了 open 必有 end，需实测确认。
- **(乙) 回滚 entry、走 verbatim**：把未闭合 region 的 entry 从 `entries` 移除，整段当作不解析——
  完全恢复旧行为。风险：与工单 06「结构树可见 + 可改名」的诉求冲突（这类图就看不见了）。

**票内默认按 (甲) 写**，(乙) 作为备选；实施时若有实测证据表明 (甲) 会让投影出错，改用 (乙) 并在
Comments 写明。

---

## 工单索引

| # | 标题 | Status | Blocked by |
|---|---|---|---|
| 01 | 未闭合 `rect`/`box` 不再让整图解析失败 | **resolved**（`aa8c7b4`） | — |
| 02 | namespace 改名在重名时跟随选中 | **resolved**（`91ebfec`） | — |
| 03 | note / block 的位置序身份可被点选命中 | **resolved**（`9907446`） | — |
| 04 | 清理 CONTEXT.md 禁用词（本批新造 15 处） | 进行中 | — |
| 05 | 工单 03「编辑类」菜单项的实际落码 | **resolved**（`f7a48c4`） | — |
| 06 | `beginEditLabel` 是同款空壳（05 的连带项） | ready-for-agent | 04（共用 i18n / 菜单文件） |

三张 `needs-triage` 已于 2026-09-29 全部定案：D1 取 (甲)（证据见工单 01）、
D3 取「身份下移到几何元素、同宿主共享一个 id」（证据见工单 03）、
D5 取「不内嵌表单、改口径 + 改文案」（理由见工单 05）。

06 是 05 的连带项，不是新需求：**不动它就会留下一个新的不一致** —— sequence / class 说
「在属性面板中编辑」且真会选中，flowchart 说「编辑标签」却只关菜单。前提已核实：
`PropertyPanel.tsx:71-75` 对 `case 'edge'` 渲染 `EdgeForm`，故 flowchart 连线在属性面板确有表单。

**全量验证（2026-09-29，四票合并后）**：`npm run typecheck` 0 error；`npm test`
**54 文件 / 804 用例全绿**（基线 53 / 789，+15 用例，既有用例无一变红或删除）。

**未处理**：验收项「控制台 0 error / 0 warning」——见文末 U3，涉及项目级基线，不由 agent 自行处理。
注：02 的实施过程中曾报「`edge-locate.test.ts` 有 2 条既存 error」，事后复检为并行编辑导致的瞬时状态，
`npm run typecheck` 现为 0 error，不是真问题。

---

## 未纳入本批（用户本次未勾选，记录以免丢失）

以下均来自同一份 review，**不进工单**，待日后决定。如需启动，各自新建目录开票。

### U1 重构类气味（Standards 轴，全为判断性）

- **Duplicated Code**：`canvas-keyboard.ts` 约 `:150` 与 `:161` 两函数结构逐行相同、仅返回值不同 → 合成 `keyToAction(key, mods, { tab, enter })`。
- **Middle Man**：`use-canvas-context-menu.ts` 的 `editRelation` / `editMessage` 函数体只有 `closeMenu()` → 由 `onMenuItem` 直接调 `ctx.closeMenu()`。（与工单 05 重叠，若 05 定案为「菜单内直接落码」则此项自动消解）
- **Shotgun Surgery**：新增一个菜单项需改 4 处（`context-menu.ts` 的 id + items、`i18n`、`use-canvas-context-menu.ts` 的回调与返回对象、`CanvasPanel.tsx` 的 `onMenuItem` 分发与 `DESTRUCTIVE_MENU_ITEMS`）→ 收进一张 item → action 表。
- **Mysterious Name**：`EditKeyRequest.form` 含 `'participant'`，但 `openFormForSelection` 只接受三种，participant 实际走 `ctx.addParticipant()`（`CanvasPanel.tsx` 约 `:498`）→ 类型与实际路径不符。

### U2 口径与断言补强（Spec 轴）

- 工单 02 写「n = 关系在投影中的顺序（**0 基**）」，实现用 1 基 elementId 并同时保留 0 基 ordinal（`edge-identity.ts`）→ 口径不一致，需统一并同步工单 02 文案。
- `sequenceEdgeCounts` 完全依赖「文档序 = 源码序」这一约定，**没有任何断言绑定** → 建议补一条不变量测试。
- 工单 07 承诺「未为 flowchart 新增任何能力」，但 `flowchart.ts` 的私有 `DIRECTIONS` 被导出、`FlowchartSelectionForm` 被改（`PropertyPanel.tsx`）→ 需确认是有意复用还是越界。

### U3 验收基线的越权改动（Spec 轴，需人类裁定）

工单 05 要求「可达性代价……**验收时必须实测确认**」（`05-…md:25`），该项在 05 / 09 均未勾选
（`09-…md:66`）。而本批的 `808e150` 往 `AGENTS.md` 顶部加了「在 /tdd 或 /code-review 中，默认不做
真机/浏览器测试」——工单 09 只授权改 `spec.md` 与升级回归清单，**改项目级验收基线属越权**，并使
03 / 04 / 06 / 07 / 08 的「控制台 0 error / 0 warning」验收项全部落空。

注：这条规则大概率是用户自己要求加的，作为**批次内改动**它仍需归位——要么补一条 ADR 记录该决定，
要么把受影响的验收项改标为「不适用」并写明原因。涉及项目级基线，**不由 agent 自行处理**。

---

## 验收原则

- 本批每条修复都必须有**回归测试**：F1 要有「未闭合 rect / box 不解析失败」的用例，
  F2 要有「改名到重名 namespace 后选中仍在」的用例，F3 要有「点选 note / block 命中身份」的用例。
- 既有测试**只增不减**：基线为 53 文件 / 789 用例全绿（前批落盘数字），不允许任何既有用例变红或删除。
- 逐字保留（ADR-0004 / ADR-0008）**不因本批任何改动而放松**：修复的是「解析不该失败 / 选中不该丢」，
  不是放宽 verbatim 承诺。
