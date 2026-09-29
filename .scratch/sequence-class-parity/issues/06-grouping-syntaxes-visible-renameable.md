# 06 无 data-id 的结构：`rect` / `box` / `namespace` 的可见与可改名

Status: pending

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

- [ ] sequence：含 `rect` / `box` 的图，结构树能看到它们、可改标签/色值，落码正确、图可渲染。
- [ ] class：含 `namespace` 的图，结构树能看到命名分组、可改名，落码正确、图可渲染。
- [ ] 改完名后，分组内的成员/类**位置与归属不变**（因为本就不做移动）。
- [ ] **方位导航不回归**：分组矩形不进候选集合。
- [ ] 源码里未编辑的分组行逐字不变。
- [ ] 控制台 0 error / 0 warning。
