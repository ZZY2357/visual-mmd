# 06 无 data-id 的结构：`rect` / `box` / `namespace` 的可见与可改名

Status: resolved

**Blocked by: 01**（同属"参与者/分组"的模型层改动，且 01 已动了 sequence 投影）

来源：`spec.md` 的 Q11 定案 + ADR-0014。这三个语法都有一个共同特征：
**渲染成功，但没有任何 `data-id`，且不构成 DOM 包含**。

## 实测事实（勿重复调研）

- `rect rgb(200,220,255) ... end` → `<rect class="rect">`，**`<svg>` 的直接子元素、无 data-id**。
- `box Purple 数据库组 / participant DB / end` → `<rect>` + `<text>`，**均无 data-id**；
  分组是**图形层叠而非 DOM 父子**，DB 仍照常获得 `g[DB]`。
- `namespace Foo { class A }` **可用**，渲染为 `<g class="cluster undefined">` + `<text>Foo</text>`，
  **无 data-id**；且 **`class A` 不在 cluster 内**（`g[A]` 仍在 `g.nodes`，`childDataIds: []`）。

## 需求

三个语法做**同一档**的处理：

1. **解析**（当前全部落入"不解析"）：
   - sequence：`rect` / `box` 及其 `end`（注意 `sequence.ts:431` 现在明确跳过清单外块的 `end`）。
   - class：`namespace ... { ... }`（当前正则 `class.ts:190` 不接受，整行原样保留）。
2. **结构树可见**：在树上呈现（分组/区域节点），可点选。
3. **可改名**：改 `box` 的标签文本 / `namespace` 名 / `rect` 的色值。
4. **明确不做分组编辑**：无"拖入/拖出"、无"把类移进 namespace"——**没有真实的包含语义可编**
   （ADR-0014）。这是本票最重要的边界。
5. **不新增画布交互**：不给它们做点选/右键（无 data-id 可依，且它们不是编辑对象）。
   **若实现中发现必须给它们身份，回到 spec 重新决策，不要自行扩权。**

## 落码位置

- `src/lib/pipeline/sequence.ts`：`rect` / `box` 解析 + 标签/色值的写回意图；头部注释 `:19-20`、
  `:354`、`:431` 同步改。
- `src/lib/pipeline/class.ts`：`namespace` 解析 + 改名意图；注释 `:25-26`、`:411` 同步改。
  **注意 namespace 的 `{}` 配对**——类声明也用 `{}`，正则要能区分。
- `src/lib/projection/*.ts`：三者进投影（作为分组/区域节点）。
- `src/components/StructureTree.tsx`：两图种树的分组分支。
- 属性面板：改名表单。

## 不变量

- **verbatim**：未编辑的分组行逐字保留；`rect`/`box`/`namespace` 的**内部成员行**也不被触碰
  （尤其 namespace：移动类不属本票）。
- **工单 14 的可视范围口径不受影响**：这些矩形无 data-id，**不进**「节点可视范围」的匹配集合，
  方位导航不受影响（spec 已定案，ADR-0014 有说明）。
- `destroy` 仍不进模型（ADR-0014）。

## 测试

- `sequence.test.ts` / `class.test.ts`：三个语法的解析产出、改名意图的落码、verbatim identity。
- `sequence-projection.test.ts` / class 投影测试：三者进投影。
- 结构树渲染测试（如有既有文件则补分支）。

## 验收

- [x] sequence：含 `rect` / `box` 的图，结构树能看到它们、可改标签/色值，落码正确、图可渲染。
      （结构树分支 + `property-panel.test.tsx` 覆盖可见与选中；落码见 `sequence.test.ts` 与
      `sequence-golden.test.ts`，后者用 `mermaid.parse` 验证改名后产物仍合法。**真机渲染外观未做**：
      `（本轮未做真机确认——用户指示跳过真机验收）`）
- [x] class：含 `namespace` 的图，结构树能看到命名分组、可改名，落码正确、图可渲染。
      （`class-projection.test.ts` + `property-panel.test.tsx` 覆盖；落码见 `class.test.ts` 与
      `class-golden.test.ts` 的 `mermaid.parse` 合法性校验。**真机渲染外观未做**：
      `（本轮未做真机确认——用户指示跳过真机验收）`）
- [x] 改完名后，分组内的成员/类**位置与归属不变**（因为本就不做移动）。
      （`class-projection.test.ts` 断言 `namespace` 改名不影响 `classes` 归属；verbatim 测试断言内部成员行逐字保留）
- [x] **方位导航不回归**：分组矩形不进候选集合。
      （`edge-locate.test.ts` 新增断言：`rect.rect` 无 data-id、不进 `annotateSequenceIdentities` 的标注集合）
- [x] 源码里未编辑的分组行逐字不变。 （`sequence.test.ts` / `class.test.ts` 的 verbatim identity 用例）
- [ ] 控制台 0 error / 0 warning。 `（本轮未做真机确认——用户指示跳过真机验收）`

## Comments

### 改动文件

管线（核心）：
- `src/lib/pipeline/sequence.ts`：新增 `rect` / `box` 开行与区域 `end` 的解析；头部注释把
  rect/box 从「不解析」移入「覆盖」；新增两个写回意图。`blockStack: number[]` → 带类型的
  `openStack: Array<{ lineNo; scope: 'block' | 'region' }>`。
- `src/lib/pipeline/class.ts`：新增 `namespace ... {` 解析与改名意图；头部注释补 namespace；
  `blockStack: number[]` → `Array<{ lineNo; kind: 'class' | 'namespace' }>`，`}` 按栈顶类型出 end。

投影 / 选中 / 接线：
- `src/lib/projection/sequence-projection.ts`：`ProjectionRegion` 联合 + `SequenceProjection.regions`；`resolveSequenceSelection` 增 `seq-region`。
- `src/lib/projection/class-projection.ts`：`ProjectionNamespace` + `ClassProjection.namespaces`（按名去重）；`resolveClassSelection` 增 `class-namespace`。
- `src/lib/projection/selection.ts`：`Selection` 增 `seq-region` / `class-namespace` 两种，及对应 `selectionKey`。
- `src/lib/editing/sequence-forms.ts`：`setRectColorIntent` / `setBoxLabelIntent`。
- `src/lib/editing/class-forms.ts`：`setNamespaceNameIntent`（空名返回 null）。
- `src/components/StructureTree.tsx`：sequence 树补「区域与分组」分支、class 树补「命名空间」分支。
- `src/components/PropertyPanel.tsx`：`seq-region` → `SequenceRegionForm`、`class-namespace` → `NamespaceForm`。
- `src/components/sequence-forms.tsx`：`SequenceRegionForm`（rect 色值 / box 标签两个子表单）。
- `src/components/class-forms.tsx`：`NamespaceForm`（改名后跟随新 elementId 选中，避免表单回落）。
- `src/i18n/index.ts`：`regions / rectRegion / boxRegion / rectColor / boxLabel / namespaces / namespaceName / invalidNamespaceName`。

测试（新增/改写）：
- `sequence.test.ts`、`class.test.ts`、`sequence-golden.test.ts`、`class-golden.test.ts`、
  `sequence-projection.test.ts`、`property-panel.test.tsx`、`edge-locate.test.ts`；
  新增 `src/lib/projection/__tests__/class-projection.test.ts`。

### 三个语法：模型表示与改名意图

| 语法 | 模型元素 | 字段 | 改名意图 | 写回 |
| --- | --- | --- | --- | --- |
| `rect <色值>` | `RectOpenData` | `gap`、`colorRaw` | `set-rect-color{ elementId, color }` | `renderRectOpen`：`rect$gap$color` |
| `box <颜色?> <标签?>` | `BoxOpenData` | `gap`、`colorRaw: string\|null`、`colorGap`、`label: string\|null` | `set-box-label{ elementId, label }` | `renderBoxOpen`：颜色 token 逐字保留，只换标签 |
| `namespace <名> {` | `NamespaceData` | `gap`、`name`、`tail`（`{` 到行尾原文） | `set-namespace-name{ elementId, name }` | `renderNamespace`：`namespace$gap$name$tail` |

三者都有独立 `kind`，统一落入 `SequenceElementData` / `ClassElementData` 联合；elementId 形如
`rect:1` / `box:1` / `namespace:<名字>`（重名 namespace 记为 `namespace:<名字>#N`，但投影只取首个）。

### namespace 的 `{}` 配对策略

类声明也用 `{}`，题面要求「正则要能区分」——采用**同类块栈**区分：`blockStack` 里每个条目
带 `kind: 'class' | 'namespace'`，`}` 按栈顶类型出 `class-end` / `namespace-end`，两族块互不串味；
`classifyLine` 的入栈判定区分 `class ... {`（`openBrace`）与 `namespace ... {`（`tail` 尾随 `{`）。
只认「`{` 与名字同行」的写法：
- 多行 `namespace Foo { ... }`：开行入栈，`}` 出栈。
- 单行 `namespace Foo { class A }`：同行即闭合，**不入栈**（内部原样保留，不拆内联类）。
- `{` 换行的写法（mermaid 也接受）：保持 verbatim 不解析。

### 关键取舍

- **box 颜色/标签拆分保守处理**：mermaid 用 `window.CSS.supports` 校验单词是否为合法颜色名，
  解析器是纯函数（ADR-0004）不碰浏览器 API，故仅当首段之后**仍有非空白文本**时才把首段当颜色
  token（`box Purple 组` → 颜色 `Purple` + 标签 `组`；`box 只有标签` → 整段是标签）。
  逐字回写不受此拆分影响——`renderBoxOpen` 原样拼回。
- **sequence 的 end 共用栈**：`end` 关闭最内层开行；`scope` 分开记录使 rect/box 的 end 出
  `region-end`、不影响逻辑块的 `matchingEnd` / `blockShapes` / `pruneEmptyBlocks`。
  无匹配开行的 `end` 仍 verbatim 保留（清单外）。
- **不做分组编辑**：三者的内部成员行完全不被触碰（verbatim 测试断言），没有任何拖入/拖出、
  把类移进 namespace 的能力——因为渲染产物无真实包含语义（ADR-0014）。
- **不新增画布交互**：三者只从结构树点选，`SequenceRegionForm` / `NamespaceForm` 只在属性面板出现；
  画布上无 data-id、无可命中 DOM（`edge-locate.test.ts` 断言 `rect.rect` 不被标注）。

### 是否触发「必须给身份」的越权

**否。** 全部需求（解析 / 树可见 / 可改名 / 不做分组编辑 / 不加画布交互）都能在不给
rect/box/namespace 任何 data-id 或画布命中区的前提下完成，未发现必须给身份的情形，
无需回到 spec 重新决策。

### 测试结果

- `npm run typecheck`：干净通过。
- `npm test`：**50 个测试文件 / 728 个用例全绿**（基线 49 / 698，只增不减）。
- 涉及本票的关键用例：sequence/class 解析与改名意图、verbatim identity、投影 regions/namespaces、
  结构树与属性表单、方位导航不回归、golden `mermaid.parse` 合法性。

### 待真机确认清单（本轮未做真机确认——用户指示跳过真机验收）

1. 含 `rect` / `box` 的 sequence 图：结构树「区域与分组」节点渲染、点选、属性表单改名后的
   画布实际渲染外观与颜色/标签变化。
2. 含 `namespace` 的 class 图：结构树「命名空间」节点渲染、点选、改名后的画布实际渲染外观。
3. 改名（rect 色值 / box 标签 / namespace 名）后画布重渲染的即时性，以及控制台 0 error / 0 warning。
4. 方位导航在真实渲染下的表现（单元层已断言分组矩形不进候选集合）。
