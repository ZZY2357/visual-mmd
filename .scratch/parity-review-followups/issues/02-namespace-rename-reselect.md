# 02 namespace 改名在重名时跟随选中

Status: resolved

来源：`spec.md` 的 F2。纯前端表单与解析 id 不一致导致的选中丢失，范围小且无决策点。

## 问题

解析器给 namespace 的 part id 带重名序号（`class.ts:449`）：

```ts
entries.push({ span, id: `namespace:${ns.name}` + (count > 1 ? `#${count}` : ''), data: ns })
```

即**第 2 次及以后**出现的同名 namespace，id 是 `namespace:<名>#2`、`#3`……

而 `NamespaceForm` 改名成功后固定按下式跟随选中（`class-forms.tsx:288`）：

```ts
select({ kind: 'class-namespace', elementId: `namespace:${intent.name}` })
```

这个拼接**没有重名序号**。当用户把某个 namespace 改成与**另一个已存在的** namespace 同名的名字时：

- 解析器实际产出的 id 是 `namespace:<名>#2`；
- 表单拼出的是 `namespace:<名>` → 投影里查不到 → 选中落空 → 表单回落到图表级。

用户刚改完名字，表单却跳走了，看不到自己输入的结果。

## 需求

让改名后的跟随选中**用解析器真实产出的 elementId**，而不是表单自己拼。

1. 首选：`setNamespaceNameIntent` 提交的意图**在写回后回传真实 elementId**，表单 `select` 用它。
   如果现有 `commitIntent` 的返回值拿不到新 id（很可能——它是同步返回 boolean 的），走方案 2。
2. 备选：表单在 commit 后从**当前投影**里按名字反查（`class-namespace` 的 `namespaces` 列表，
   见 `class-projection.ts:93`、`:192-193` 的 `namespaces.some(n => n.elementId === …)`），
   取匹配项的 `elementId`；查不到时**保持原选中不动**（比回落到图表级更稳）。
3. **不要**在表单里复刻 `#${count}` 的序号规则——那是解析器的知识，表单复刻等于把 id 规则散到两处
   （正是 Shotgun Surgery 的成因）。

## 落码位置

- `src/components/class-forms.tsx`：`NamespaceForm`（`:281-311`，关注 `:288` 的 `select`）。
- 若走方案 1：`src/lib/pipeline/class.ts` 的 `set-namespace-name` 意图（`:1099` 声明）
  及其 `resolveRewrites` 分支；`src/lib/editing/class-forms.ts` 的 `setNamespaceNameIntent`。
- 若走方案 2：需要 `useEditorStore` 能读到当前投影的 `namespaces`。

## 不变量

- **改名本身的行为不得改变**：`set-namespace-name` 的写回结果逐字等价，既有用例不受影响。
- **非重名场景必须继续工作**：改成唯一名字时，选中仍跟到 `namespace:<名>`（这是当前唯一被测试覆盖
  的路径，不能为了修重名而把它改坏）。
- 逐字保留（ADR-0004 / ADR-0008）：本票只动「改名后选中谁」，不动任何源码写回逻辑。

## 测试

- `src/components/class-forms.tsx` 相关测试（或新增 `namespace-rename-reselect.test.tsx`）：
  1. 图里已有两个同名 namespace（如两个 `namespace Foo`），把其中一个改名 → 提交后选中
     **仍在刚改的 namespace 上**，表单不回落图表级。
  2. 把 namespace 改成一个**唯一**的名字 → 选中跟到新 id（保护现有路径）。
  3. 改成一个与既有 namespace 重名的名字 → 选中跟到带序号的 id（`namespace:<名>#2`）。
- `src/lib/pipeline/__tests__/class.test.ts`：`set-namespace-name` 的写回用例保持全绿
  （本票不应改动写回结果，若变红说明动错了地方）。

## 验收

- [ ] 上面 3 条用例全绿，既有用例无一条变红/被删。
- [ ] 表单不复刻 `#${count}` 序号规则（Code review 时确认 id 规则只有解析器一处）。
- [ ] 控制台 0 error / 0 warning。（按 `AGENTS.md` 当前规则，默认不做真机确认；若需真机，单独提出）

## Comments

### 实际做法（走的是方案 1 的变体：意图落码后重新解析取回真实 id）

表单不再拼 id。`NamespaceForm` 提交后（`src/components/class-forms.tsx:284-294`）：

1. 提交前记下 `source`；
2. `commitIntent(setNamespaceNameIntent(...))`；
3. 调 `namespaceIdAfterRename(before, after, elementId)`（**新增，放在 `src/lib/pipeline/class.ts`**）
   取回真实 id 再 `select`；取不到（解析失败/找不到）时**保持原选中不动**，不回落。

`namespaceIdAfterRename` 重新解析改名后的源码，由解析器给出 id（重名时自带 `#N` 序号）。
改名只替换行内文本，元素在 namespace 出现序列里的**位置不变**，故按出现序号在新旧源码间对齐。
`#${count}` 规则仍只有解析器一处，表单与 editing 层都没有复刻。

### 一处超出票面「落码位置」的改动（必要前提）

`src/lib/projection/class-projection.ts` 的 `buildClassProjection` 原先**按名字去重**
（`namespaceSeen`），第 2 个同名 namespace 的 `namespace:<名>#2` 根本不进投影 ——
既不可见也不可选中，`resolveClassSelection` 也会把它判为失效。
只改表单的话，选中即便拿到 `namespace:Shapes#2`，属性面板照样回落图表级（票面验收
「面板不回落图表级」达不到），票内用例 1（两个同名 namespace 里改一个）也无从操作。

故去掉去重：每个 namespace 元素各自成项（id 本就唯一），结构树 `key={ns.elementId}` 不受影响。
与 CONTEXT.md「元素：投影中可被选中的最小单位……拥有各自的元素 ID」同口径。

### 新增用例

- `src/components/__tests__/namespace-rename-reselect.test.tsx`（新文件，3 例，happy-dom + PropertyPanel 实渲染）：
  1. 改成唯一名字 `Geometry` → 选中 `namespace:Geometry`，重渲染后面板仍在 namespace 表单上（保护既有路径）；
  2. 改成与既有 namespace 重名 `Shapes` → 选中 `namespace:Shapes#2`，源码里两个 `namespace Shapes {`，
     按新源码重新派生投影重渲染后「命名空间名」输入框仍显示 `Shapes`（不回落图表级）；
  3. 图里已有两个 `namespace Foo`，给第 2 个（`namespace:Foo#2`）改名 `Bar` → 选中 `namespace:Bar`，
     面板仍在 namespace 表单上。（改前 2、3 均为红：`#2` 选中落空 / 面板回落，已实测确认）
- `src/lib/projection/__tests__/class-projection.test.ts`（+1 例）：同名 namespace 各自成项，
  `namespace:Foo#2` 进投影且能被 `resolveClassSelection` 命中。

### 测试与提交

- 类型检查 `npm run typecheck`：我的改动 0 error（有 2 条既存 error 在
  `src/lib/canvas-selection/__tests__/edge-locate.test.ts`，属工单 03 的在改文件，与本票无关）。
- 单文件：新测试 3/3 绿；class 链路 + 组件 + store 共 14 文件 / 125 用例全绿。
- 全量 `npm test`：**54 文件 / 804 用例全绿**（基线 53 / 789；+1 文件 +15 用例，其中本票 +4，
  其余为并行代理新增）。既有用例无一条变红或被删。
- 提交：内容落在 `7900d5a`（**注意**：该提交是 followups-05 的工单 05 提交，
  我把文件 add 进共享 index 后其 `git commit` 把整个 index 一起提交了，故两个工单挤在同一次提交；
  内容完整正确、工作区无残留。是否拆分为两次提交待 team-lead 裁定，未擅自改写他人提交）。
