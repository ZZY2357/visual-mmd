# 07 class / sequence 的 `direction` 表单

Status: resolved

**Blocked by: 01**（同为模型/外观配置项，与参与者生命区间同一批；无硬依赖，可并行）

来源：`spec.md` 的 Q10 定案（(丙)：只做 `direction`，`linkStyle` / `cssClass` 不做）。

## 背景

- `class.ts:25-26`、`:411` 明确把 `direction` 列为"不解析、原样保留"。
- Q10 定案：`linkStyle` / `cssClass` **不做**（flowchart 同样没做，单独给 class/sequence 做会
  造出一个**比 flowchart 更完备的样式编辑器**，优先级奇怪）；但 `direction` 做——
  它**改变布局方向**，用户切一下就能看出差别，且与 flowchart 的同类选项可对齐。

## 需求

1. **解析 `direction`**：class 的 `direction LR` / `RL` / `TB` / `BT`；sequence 的 `direction`
   （决定消息自上而下还是自左向右）。
2. **属性面板的表单**：图表级选中时出现方向选择器。
   - **回显必须如实**：源码里没有 `direction` 时显示「跟随 Mermaid 默认」，**不假装是某个值**
     （这是主题选择器踩过的坑，见 `spec.md`（editor-polish）的"选择器回显"决策）。
3. **写回**：选中方向即手术式插入/改写 `direction` 行；切回「跟随默认」即**删除该行**，
   未触碰文本逐字保留。
4. **align with flowchart**：flowchart 若已有 direction 表单，**复用同一组件与文案**；
   若 flowchart 没有，本票也不为 flowchart 新增（不在范围）。

## 落码位置

- `src/lib/pipeline/class.ts` / `sequence.ts`：`direction` 解析 + `set-direction` 意图；
  注释 `:25-26`、`:411` 同步改。
- `src/lib/projection/*.ts`：图表级投影补 `direction` 字段。
- `src/components/{class-forms,sequence-forms}.tsx`：方向选择器（或复用 flowchart 的既有实现）。
- 属性面板：图表级分支接线。
- i18n：方向选项与「跟随默认」文案。

## 不变量

- **`linkStyle` / `cssClass` / `style` 仍原样保留**（本票不动，spec 的非目标）。
- 主题的既有语义不受影响（主题与 direction 是两个独立配置项）。
- 撤销/重做：新意图走 `commitIntent`。

## 测试

- `class.test.ts` / `sequence.test.ts`：`direction` 解析、写回、删除、verbatim identity。
- 表单单测（如有既有模式则补）。

## 验收

- [x] class 图：图表级选中 → 选 LR，源码出现 `direction LR`（单测覆盖）；**图变为横向布局**
      （本轮未做真机确认——用户指示跳过真机验收）。
- [ ] sequence 图：同理，消息方向改变。→ **不适用**：mermaid 12.0.0 的 `sequenceDiagram`
      **没有** `direction` 语法（实测 `mermaid.parse` 直接报错），做了只能产出非法源码。
      见 Comments「⚠️ 范围偏差（需用户 / 工单 09 裁决）」。
- [x] 选「跟随 Mermaid 默认」→ 源码里的 `direction` 行被删除、其余文本逐字不变
      （单测覆盖。删除只清元素 span，行首缩进与换行留在 verbatim，即原位置留一行空白——
      **全项目既有约定**，spec 已记「被删语句可能留下只有空格的空白行」）。
- [x] 源码里 `direction` 值非法/缺失时，选择器如实回显，不假装：缺失 → 「跟随 Mermaid 默认
      （不设置方向）」；非法（如 `direction XY`）→ 回显原文 `XY` + 无效提示。
- [x] `linkStyle` / `cssClass` 仍逐字保留、不报错（单测覆盖）。
- [ ] 控制台 0 error / 0 warning（本轮未做真机确认——用户指示跳过真机验收）。
      单测侧：新增组件测试运行时 0 个 React act 警告，与既有组件测试同口径。

## Comments

### 改动清单

| 文件 | 改动 |
| --- | --- |
| `src/lib/pipeline/class.ts` | 新增 `ClassDirectionData` + `renderDirection` + `DIRECTION_RE` / `CLASS_DIRECTIONS`；`classifyLine` 解析顶层 `direction <取值>`；`set-direction` 意图与 `resolveSetDirection`；模块头注释与 `:456` 的「不解析」清单同步去掉 direction |
| `src/lib/pipeline/flowchart.ts` | 私有 `DIRECTIONS` 改导出（供共用表单判定「手写值」，无行为变化） |
| `src/lib/projection/class-projection.ts` | `ClassProjection.direction: string \| null`（无该行 = null；非法值照原样带出） |
| `src/lib/editing/class-forms.ts` | `setClassDirectionIntent(direction: string \| null)` |
| `src/components/property-forms.tsx` | `DiagramForm` 泛化：`onSelect` + `allowFollowDefault` + `knownDirections`，新增哨兵与「手写值如实回显」 |
| `src/components/PropertyPanel.tsx` | 图表级分支接线：flowchart 传 `DIRECTIONS`；class 传 `allowFollowDefault`（原 class 图表级提示文案换成方向表单） |
| `src/i18n/index.ts` | `app:directions.followDefault`、`app:propertyPanel.directionInvalid` |
| 测试 | `class.test.ts`（+11）、`class-projection.test.ts`（+4）、`class-golden.test.ts`（+1 并改写 1）、`sequence.test.ts`（+2）、新增 `src/components/__tests__/direction-form.test.tsx`（7） |

### flowchart 是否已有 direction 表单：**有，直接复用同一组件与文案**

- `property-forms.tsx` 早有 `DiagramForm`（`app:propertyPanel.direction` +
  `app:directions.*` + `DIRECTION_OPTIONS`），flowchart 的图表级分支一直在用。
- 做法：**不新建表单**，把 `DiagramForm` 泛化了一层——把「提交」从组件内部写死的
  `setDirectionIntent` 提成 `onSelect` 回调，并加两个可选开关：
  - `allowFollowDefault`：只在 class 启用（置顶「跟随 Mermaid 默认（不设置方向）」）；
  - `knownDirections`：判定「手写值」的合法取值全集，flowchart 传 `DIRECTIONS`
    （含 `TD`），避免把合法的 `flowchart TD` 误判成「手写非法值」而弹错。
- 组件与文案 100% 复用：同一个 label key、同一份 `app:directions.*`、同一个选项顺序。
  flowchart 的取值列表与缺省回显口径（`direction ?? 'TB'`）**逐字未变**；新增的组件测试里有一条
  flowchart 回归用例（选 LR → 表头变 `flowchart LR`、下拉仍 4 项、不出现「跟随默认」）。
- **未为 flowchart 新增任何能力**（本票非目标守住）。

### 「跟随默认」的表示法与回显策略

沿用 editor-polish 批次主题选择器的定案（「选择器回显」）：**源码是唯一真相源，选择器只如实回显**。

- 哨兵值 `FOLLOW_DIRECTION_VALUE = '__follow__'`（不是方向 token，仅作 Select 选项），
  与 `ThemePicker` 的 `__follow__` 同一手法。
- 源码没有 `direction` 行 → `projection.direction === null` → 回显「跟随 Mermaid 默认（不设置方向）」，
  **不假装成 TB**（flowchart 那条分支保留 `?? 'TB'`：表头必有方向 token，是 mermaid 的事实默认，属旧口径不动）。
- 选「跟随默认」→ `set-direction { direction: null }` → 删除该行；源码本来就没有 = 无操作（返回空重写表，
  与 sequence `set-autonumber` 同口径，不报错）。
- 手写非法值（如 `direction XY`）→ 不在 `knownDirections` 里 → 原文 `XY` 作为**额外选项**回显 +
  `error` 提示「无效方向，Mermaid 将忽略它并回退到默认」——与实测一致：mermaid 的词法只认
  `TB|BT|RL|LR`（大小写敏感），其它取值被当普通文本**静默忽略**。
- 因 `mermaid` 的 classDiagram 词法**只**认这四种（实测 `direction TD` / `direction lr` 都被忽略，
  `TD` 不是别名），落码侧按 `CLASS_DIRECTIONS = [TB, BT, RL, LR]` 白名单校验，取值统一归一为大写；
  非法取值不落码（`applyEdit` 返回 `ok: false`）。

### `direction` 行的插入位置策略

- **插入**：`insertAfter(class-header)` → 紧跟 `classDiagram` 之后、**跟随表头行缩进**（通常列 0），
  与 mermaid 文档写法一致，也是 sequence `set-autonumber` 的锚点口径。
- **改写**：源码已有 `direction` 行就**原地改写**（只重写那一行的元素 span，行内 gap 逐字保留）。
- **删除**：`direction: null` → 该元素 span 重写为空；行首缩进与换行留在 verbatim
  （全项目既有约定，`delete-member` / `delete-note` / `set-autonumber` 同理）。
- 多个 `direction` 行时取**首个**（投影与落码两侧同口径）。

### 关键取舍

- **解析口径保守**：整行必须恰好是 `direction <单个取值>` 才算方向，否则落回后续解析——
  这样「名为 `direction` 的类的一行式成员」（`direction : +String x`）不会被误吞。
  代价：`direction LR %% 注释` / `direction LR extra` 这类**行尾带尾巴**的写法不解析（保持 verbatim）。
  mermaid 的词法 `.*direction\s+LR[^\n]*` 会把整行吞掉并按 LR 生效，故这是**已知的窄边界**，
  不覆盖（覆盖它需要在改写时保留行尾尾巴，收益不抵复杂度）。
- **花括号块内不认作方向**：`class A { direction LR }` 仍按块内成员处理（保持工单 07 之前的既有行为，
  也贴合 mermaid 里 `direction` 只在顶层语句位置合法）。
- **不新增结构树条目**：方向是图表级配置，与 flowchart 的 `direction` 一样只在属性面板出现。
- **不动主题语义**：主题走 frontmatter、方向走图体语句，两个独立配置项互不影响。

### 测试结果

- `npm run typecheck`：干净通过。
- `npm test`：**51 个测试文件 / 752 个用例全绿**（基线 50 / 728，文件 +1、用例 +24，只增不减）。
- 覆盖：class `direction` 的解析 / verbatim（缩进、多空白、CRLF、无尾随换行）/ 插入 / 改写 / 删除 /
  非法取值不落码 / 块内不误判；投影 direction；golden `mermaid.parse` 合法性（插入 / 改写 / 删除三态）；
  表单实际交互（回显、选项清单、选 LR 落码、选「跟随默认」删行 + 撤销、非法值回显、flowchart 回归、
  linkStyle / cssClass 逐字保留）。

### ⚠️ 范围偏差（需用户 / 工单 09 裁决）

**工单要求的「sequence 的 `direction`」不存在于 mermaid 12.0.0，本票未实现（也不应实现）。**

- 实证 1（本仓库 mermaid 12.0.0）：`mermaid.parse('sequenceDiagram\ndirection LR\nA->>B: hi\n')`
  **拒绝**，报 `Parse error on line 2 … Expecting 'SOLID_ARROW'…`（已落成
  `sequence.test.ts` 的断言，避免以后有人再踩）。同时 `sequenceDiagram\ndirection LR\n` 里的那行
  也是 lexer 不认识的 token。
- 实证 2（mermaid 语法面）：`direction` 只适用于 flowchart / ER / class / state；
  sequence 的文档与语料一致记为「direction declaration ignored（TB 隐含）」。
- 实证 3（依赖检查）：`node_modules/mermaid/dist/chunks/mermaid.core/sequenceDiagram-*.mjs`
  全文只有 `isBidirectional`（消息箭头相关），**没有** direction 关键字。
- 结论：给 sequence 做「可选可删的方向表单」只能产出**语法错误**的源码，直接违反
  「源码始终是合法 mermaid」这条既有不变量（golden 测试会红）。故 sequence 的 `direction` 行
  继续走「不解析、原样保留」老路（ADR-0008），并加了回归用例锁死这一边界。
- 另外：spec 缺口全景 (a) 里 `direction` **本来就只列在 class 名下**（sequence 那一节列的是
  `create`/`destroy`/`rect`/`box`），Q10 的「与 flowchart 同类选项对齐」也指向 flowchart 家族
  （flowchart / ER / class / state）。据此判断工单标题与需求 1 里的 sequence 部分是**误扩**，
  本票按 class 兑现，sequence 部分如实记账、请用户或工单 09 从 07 的范围里划掉。

### 待真机确认清单（本轮未做真机确认——用户指示跳过真机验收）

1. class 图：图表级选中 → 选「从左到右（LR）」，**画布真的变成横向布局**（弱替代证据：golden 测试
   已证 `direction LR` 产物能被 mermaid 12 `parse` 通过）。
2. class 图：选「跟随 Mermaid 默认」后画布回到 mermaid 默认布局（TB）。
3. 手写非法值（`classDiagram\ndirection XY`）时，选择器如实显示 `XY` + 提示，且画布按默认布局渲染。
4. 全部上述交互的控制台 **0 error / 0 warning**。
5. 主题选择器与方向选择器互不干扰（两处下拉同时打开时的 ARIA / 焦点表现）。

