# 01 · 元素 ID 应当只有一个编解码 module

Status: resolved
Blocked by: —
Type: task

## 现状（已核实）

元素 ID 的生成散在四个 parser 的字符串模板里，消费端在别处重写协议：

**生成端**
- `pipeline/flowchart.ts:736` `link:${from}:${to}#${occurrence}`、`:739` `node:${nodeId}#${occurrence}`
  （`occurrence <= 1` 时不带后缀——这个条件本身也是协议的一部分）
- `pipeline/flowchart.ts:894/908/935` `header#n` / `end#n` / `direction#n`、
  `:946` `classdef:${name}#${count}`、`:956` `class#${entries.length}`
- `pipeline/class.ts:441/449/475` `class:${name}#n` / `namespace:${name}#n` / `classdef:${name}#n`
- `pipeline/sequence.ts:368` `autonumber#n`、`:403/423` `participant:${actorId}#${count}`
- `pipeline/mindmap.ts:245` `mindmap#n`、`:291` `mindmap-node:${nodeCount}`

**消费端重写协议**
- `projection/flowchart-projection.ts:86` `/#(\d+)$/.exec(part.id)` —— 靠正则反解 occurrence
- `projection/sequence-projection.ts:191` 为**隐式参与者**自行合成 `participant:${actorId}`
  （这个 ID 在 `doc` 里并不存在，是投影凭协议造出来的）
- `pipeline/sequence.ts:716/729/779/810` `getElementById(doc, \`participant:${intent.actorId}\`)` —— 四处拼接
- `canvas-selection/mindmap-adapter.ts:39` `mindmapDomIdOf` 用 `/^mindmap-node:(\d+)$/` 反解，
  而生成端在 `pipeline/mindmap.ts:291`——编解码分居两个目录

**不在范围内（已澄清）**：`projection/selection.ts` 的 `selectionKey` 是另一套命名空间
（`class-relation:relation:1`），只用于 `sameSelection`，不参与 DOM 寻址，本次不动。

## 样板

`canvas-selection/edge-identity.ts` 已经是正确形状，照它写：

```ts
const EDGE_IDENTITY_RE = /^(relation|message|note|block):([1-9][0-9]*)$/
export function isEdgeElementId(value: string): boolean
export function edgeElementIdOf(kind: EdgeIdentityKind, ordinal: number): string | null
export function edgeOrdinalOf(elementId: string): { kind: EdgeIdentityKind; ordinal: number } | null
```

ADR-0012 落地得很好。01 不是新设计，是把这个已验证的形状推广到节点类 ID。

## 方案形状

新建 `element-id.ts`，提供**成对的**编码与解码——只提供一半等于没做：

```ts
// 节点类
export function nodeElementId(nodeId: string, occurrence?: number): string
export function parseNodeElementId(id: string): { nodeId: string; occurrence: number } | null
// 参与者
export function participantElementId(actorId: string, occurrence?: number): string
export function parseParticipantElementId(id: string): { actorId: string; occurrence: number } | null
// class / namespace / classdef / mindmap-node 同理
// 通用的 occurrence 后缀
export function withOccurrence(base: string, occurrence: number): string
export function splitOccurrence(id: string): { base: string; occurrence: number }
```

要点：
- `#n` 后缀的「等于 1 时不带」规则只写一次，放进 `withOccurrence` / `splitOccurrence`。
- `occurrence` 的基数是 1（parser 侧），`splitOccurrence` 缺失后缀时返回 1。
- 纯函数、无 DOM、无 React，可单测。

## 分步

1. 建 `element-id.ts`，先只做 `withOccurrence` / `splitOccurrence`（最高频、最易出错的部分）。
2. `flowchart.ts:736/739` 改用 `nodeElementId` / `linkElementId`；跑 `pipeline/__tests__/flowchart*`。
3. `flowchart-projection.ts:86` 改用 `splitOccurrence`，正则消失。
4. `sequence.ts:403/423` 与 `sequence-projection.ts:191` 改用 `participantElementId`；
   `sequence.ts:716/729/779/810` 四处拼接改为调用同一函数。
5. `class.ts:441/449/475`、`mindmap.ts:245/291` 与 `mindmap-adapter.ts:39` 同理。
6. 全量回归：`pipeline/__tests__` + `projection/__tests__` + `canvas-selection/__tests__`。

## 测试

- 新增 `element-id` 单测：编解码往返（property 式，覆盖含 `#` 与不含 `#` 两种形态）。
- 关键新增用例：`occurrence === 1` 时**不带**后缀且能解回 1——这是最容易漂移的一条。
- 既有测试中字面量断言（如 `elementId === 'participant:B'`）若形态未变应全绿；
  若有失败，说明撞到了真实漂移，要逐个确认是修测试还是修实现。

## 验收

- `grep -rn 'participant:\|node:\|mindmap-node:' src/lib` 里不再出现**拼接**形式的字符串模板。
- `flowchart-projection.ts` 里不再有 `/#(\d+)$/` 手写正则。
- 全量测试绿。

## 风险

- 元素 ID 是编辑意图的寻址键，改错会让「点了没反应」。故第 2–5 步**逐个图种**推进，
  每步跑该图种全套测试，不批量替换。
- `sequence-projection.ts:191` 合成的隐式参与者 ID 是**有意**行为（ADR-0010 相关），
  改成调用 codec 后语义必须完全不变——这里加一条针对性用例钉住。

## Decision（已定案）

**放 `src/lib/pipeline/element-id.ts`。**

被否掉的替代是 `src/lib/element-id.ts`（两端平级）：那样 pipeline 与 projection 都依赖一个中立模块，
看着更对称，但会新增一条「pipeline → 顶层模块」的依赖方向。而现状是 projection 依赖
`pipeline/document`——生成端就近放，既复用既有依赖方向，又让「改协议」这件事的
locality 落在 parser 与 codec 同处一个目录上。

换目录本身成本不高（易逆转），故不为此单独开 ADR。

## 收尾裁定（2026-09-29，team-lead）

### 1. `canvas-keyboard.ts:130` 的拼接已一并清掉

原 `const newElementId = \`mindmap-node:${end + 2}\`` 改为 `mindmapNodeElementId(end + 2)`。
因为 codec 的实现就是 `` `mindmap-node:${ordinal}` ``，替换后**字符串逐字相同**，是零风险的等价替换，
不是行为改动。清掉它之后，工单的验收 grep 在 `src/lib` 下**已为 0**
（`src/lib/projection/selection.ts` 的 `selectionKey` 除外，见下）。
该文件属工单 04 的范围，但改动只是一行且证明等价，故提前收掉，避免协议继续分裂。

### 2. `header#n` / `end#n` / `direction#n` / `class#n` / `mindmap#n` **不纳入** codec

已核实：`flowchart.ts:893/907/934/955` 与 `mindmap.ts:246` 用的是 **`entries.length`** ——
全局条目计数，且**恒带后缀**；连第一个 `header` / `mindmap` 是否带后缀都是用
`entries.some(...)` 现判的。而 `withOccurrence` 的语义是 **per-key occurrence、等于 1 时不带后缀**。

两者不等价：`class#${entries.length}` 在空文档上会产出 `class#0`，而 occurrence 的下界是 1。
硬套 codec 会**改变 ID 形态**，连带要改测试与选中链路 —— 那是另一件事，不在本票「收敛协议」的范围内。

结论：保留现状，在此留痕。**若日后要统一，正确做法是先决定这两类计数要不要合并语义，
再动 ID 形态**，不能反过来靠 codec 顺手改。

### 3. `selection.ts` 的 `selectionKey` 仍不动

它是另一套命名空间（`class-relation:relation:1` 对 `relation:1`），只用于 `sameSelection` 相等性比较，
不参与 DOM 寻址。工单「不在范围内（已澄清）」一节已说明，此处重申以免后人重复提出。

## 实施记录（2026-09-29）

**落点**：`src/lib/pipeline/element-id.ts`（按 Decision）。
核心是 `withOccurrence(base, occurrence?)` / `splitOccurrence(id)` 一对：`occurrence <= 1` 时不带
`#n` 后缀、缺失后缀解回 1；按**最后一个** `#` 切分，故 base 自身可含 `#`。
其上叠 `<prefix>:<key>` 的 keyed 编解码（node / participant / class / namespace / classdef），
外加 `linkElementId`（两个 key）与 `mindmapNodeElementId` / `parseMindmapNodeElementId`（1 基位置序）。
形状照抄 `canvas-selection/edge-identity.ts`：纯函数、解析不出返回 null，绝不凭空造身份。

**逐个图种推进（每步跑该图种全套）**

| 步 | 改动 | 测试 |
| --- | --- | --- |
| 1 | 建 `element-id.ts` + 单测 | 新增 13 例；先红后绿 |
| 2 | `flowchart.ts`：`linkElementId` / `nodeElementId` 移入 codec（原处保留 re-export，供 `editing/canvas-keyboard` 取用）；`classdef:${name}#${count}` → `classDefElementId` | pipeline + projection 全绿 |
| 3 | `flowchart-projection.ts`：`/#(\d+)$/` → `splitOccurrence(part.id)`，正则消失 | flowchart-projection + editing + canvas-selection 全绿 |
| 4 | `sequence.ts`：两处声明 id → `participantElementId`，四处 `getElementById` 拼接 → 同一函数；`autonumber#n` → `withOccurrence`（语义逐字等价）；`sequence-projection.ts:191` 隐式参与者 → `participantElementId(actorId)` | sequence.test 82 / sequence-golden 12 / sequence-projection 34 全绿 |
| 5 | `class.ts` 三处（class / namespace / classdef）→ codec；`mindmap.ts` 节点 id → `mindmapNodeElementId`；`mindmap-adapter.ts` 的 `/^mindmap-node:(\d+)$/` → `parseMindmapNodeElementId` | class 82 / mindmap 53 全绿 |
| 6 | 全量回归 | 56 文件 / 824 用例全绿（基线 54 / 804；本票 +17 例，其余 +3 为并行批次新增） |

**新增用例**
- `pipeline/__tests__/element-id.test.ts`（13 例）：`occurrence === 1` 不带后缀且能解回 1（最易漂移的一条）；
  base 含 `#` 的往返；`#0` / `#01` / 尾 `#` 不算 occurrence；五类 keyed ID 的往返与非本前缀返回 null；
  mindmap 位置序与 `node_{N-1}` 换算同源。
- `projection/__tests__/sequence-projection.test.ts`（+4 例，钉住风险二）：隐式参与者合成 `participant:<id>`
  不带后缀；该 id 在文档里确实不存在（有意行为，不是漏解析）；有声明时取声明行 id（重名第二次为
  `participant:A#2`，不被合成覆盖）；引用先于声明仍合并为一个。

**验收 grep（实测）**
- `flowchart-projection.ts` 已无 `#` 字面量，`/#(\d+)$/` 消失；全仓再无手写的 occurrence 反解正则。
- `src/lib` 里**仍**有拼接形式的两处（均在本次文件所有权之外，待裁定）：
  1. `editing/canvas-keyboard.ts:130` `` `mindmap-node:${end + 2}` `` —— 归工单 04，且该文件正被并行批次改动；
     已提供 `mindmapNodeElementId`，改它是一行替换。
  2. `projection/selection.ts:40/46/48/58` 的 `selectionKey`（`node:` / `classdef:` / `participant:` / `class:`）
     —— 本票「不在范围内」已澄清：那是另一套命名空间，只用于 `sameSelection` 相等性比较，不参与 DOM 寻址。

**与分步的偏差**
1. 第 4 步多改了 `sequence.ts` 的 `autonumber#n`（现状清单里列了、分步里没列）：它的规则与
   `withOccurrence` 逐字等价，一并收敛；sequence 全套测试无变化。
2. 未动的几处 id（`flowchart.ts` 的 `header#n` / `end#n` / `direction#n` / `class#n`、
   `mindmap.ts` 的 `mindmap#n`）：它们用的是 `entries.length`（**全局条目计数，且恒带后缀**），
   不是 per-key occurrence——换成 `withOccurrence` 会把 `class#1` 变成 `class`，语义不等价。
   留待后续决定是否统一（统一意味着改 id 形态，要连带查全部测试与选中链路）。
3. `class` / `namespace` / `classdef` 的**解码**端暂无消费方，只编码端在调；按工单「只提供编码不提供解码
   等于没做」的要求成对提供，并已测。
