# 01 sequence `create` 进投影模型（生命起点）

Status: resolved

来源：`spec.md` 的 Q15 定案（ADR-0014）。**无前置阻塞，且必须先行**——`create` 改变参与者集合语义，
连线寻址（03/04）要按参与者 id 组织消息端点，先做连线会白改一遍。

## 需求

1. **解析 `create participant B` / `create actor B`**：产出结构数据（参与者 id、关键字、别名、
   所在行）。当前 `sequence.ts:19-20`、`:354` 把它归入"不解析、原样保留"。
   - **重复 create 不在此处校验**：由渲染层报错（mermaid 自己会报"actors with the same id"），
     解析器照常产出。
2. **投影记录生命起点**：`ParticipantProjection` 增加可选字段表示"由 create 引入"。
   - **不做成对闭合**（无 `destroy` 端点，ADR-0014）——只要一个起点标记，不要区间。
3. **结构树可见**：由 create 引入的参与者在树上体现（徽标或后缀，形式自定，与既有
   `active` 徽标风格一致）。
4. **可改名**：创建后参与者仍走既有 `rename-participant`（`create participant B as 别名` 的
   别名也可改）。**不新增 intent**——`create` 只影响"参与者从哪开始存在"，不改变后续编辑方式。
5. **画布不特殊渲染**：沿用 mermaid 画出的短生命线；不新增元素、不新增命中区。

## 落码位置

- `src/lib/pipeline/sequence.ts`：`classifyLine`（`:251-356`）增加 create 分支；头部注释
  `:19-20` 与行尾注释 `:354` 同步改（`create` 移出"不解析"清单，`destroy` 留在里面）。
  **注意**：序列化时 create 行必须**逐字保留**（verbatim）直到用户主动编辑——ADR-0004/0008。
- `src/lib/projection/sequence-projection.ts`：参与者合并逻辑（工单 10 的"按 actorId 归一"）
  需容纳 create 行的参与者；补生命起点字段。
- `src/components/StructureTree.tsx`：`SequenceTree`（`:142-219`）参与者分支（`:158-170`）加徽标。

## 不变量

- **verbatim 底线**：未被编辑触碰的 create 行逐字保留；`destroy` / `rect` / `box` 仍原样保留。
- `commitIntent` 的撤销栈不受影响（本票不新增 intent）。
- 既有 18 个 intent 的行为不变。

## 测试

- `sequence.test.ts`：create 行解析产出的结构数据；verbatim identity（含 create 行的源码往返不变）。
- `sequence-projection.test.ts`：create 引入的参与者进投影、归一正确、生命起点字段正确。
- 结构树渲染测试（如有既有文件则补分支，无则不加——避免为单点新建组件测试）。

## 验收

- [x] 源码含 `create participant B` 的图：结构树能看到 B 且标出"由 create 引入"。
- [x] 改 B 的别名为中文，落码正确、`create participant B as 新别名` 形态正确、图仍可渲染。
- [x] 源码里的 create 行在未编辑时逐字不变（注释、空格、缩进都保留）。
- [x] `destroy` / `rect` / `box` 仍逐字保留、不进投影。
- [x] 控制台 0 error / 0 warning。

## Comments

**状态**：resolved（2026-09-29）。

### 实际改动

- `src/lib/pipeline/sequence.ts`（修改）
  - 新增 `CREATE_RE = /^create([ \t]+)(participant|actor)([ \t]+)(\S+)([ \t]+as[ \t]+(.+?))?[ \t]*$/i`。
  - `classifyLine` 在 participant 分支前新增 create 分支：**产出 `kind: 'participant'` 元素**
    （id 仍为 `participant:<actorId>`，与重复声明共用计数器），把 `create` 关键字与其后空白作为
    `createPrefixRaw` 记下。
  - `ParticipantData` 新增字段 `createPrefixRaw: string | null`；`renderParticipant` 在改写
    （改 id / 改别名）时把该前缀原样拼回。
  - 头部注释（覆盖清单加 `create`、不解析清单去掉 `create`）与 `classifyLine` 行尾注释同步更新。
- `src/lib/projection/sequence-projection.ts`（修改）
  - `ProjectionParticipant` 新增可选字段 `created?: boolean`；仅当声明元素 `createPrefixRaw !== null`
    时置 `true`（普通声明与隐式引用**不设**该键，避免结构树误标、也保住既有 `toEqual` 断言）。
  - 合并注释括号补上 `create participant` / `create actor`。
- `src/components/StructureTree.tsx`（修改）：`SequenceTree` 参与者分支的 `detail` 改为数组拼装
  （` · ` 连接），在既有 alias-id / `activate` 之后追加 `由 create 引入`。
- `src/i18n/index.ts`（修改）：新增 `app.propertyPanel.createdByCreate: '由 create 引入'`。
- `src/lib/pipeline/__tests__/sequence.test.ts`（修改）：verbatim 源列表新增 create 用例；新增
  `create 声明进模型（工单 01，ADR-0014）` 8 例（解析形状、对照 null、前缀空白逐字、verbatim、
  set-participant、rename-participant、destroy/rect/box 保留）。
- `src/lib/projection/__tests__/sequence-projection.test.ts`（修改）：新增 6 例（进投影 + created、
  actor 关键字、隐式引用不误标、普通声明对照、归并不串位、destroy/rect/box 不进投影）。
- `src/lib/pipeline/__tests__/sequence-golden.test.ts`（修改）：新增 2 例，验证 create 行改别名 / 改名后
  mermaid v12 `parse` 仍通过（对应"图仍可渲染"）。

### 关键取舍与理由

1. **create 复用 `participant` 元素类型，而非新增 `kind: 'create'`**。这样
   `set-participant` / `rename-participant` / `delete-participant` / `toggle-activation` 全部既有
   resolve 逻辑（都按 `participant:<actorId>` 寻址）**零改动即生效**，直接满足"不新增 intent"。代价是
   `ParticipantData` 多一个 `createPrefixRaw` 字段，让改写时能把 `create ` 前缀拼回——选它就等于把
   "生命起点"降级成普通声明，故必须保留。
2. **`createPrefixRaw` 记原文而非布尔**。与既有 `gap` / `aliasRaw` / `arrowRaw` 同思路，`create` 与
   关键字之间的空白（含多空格 / 制表符）在用户改写该行时也逐字保留。
3. **verbatim 由"未触碰即原样切片"保证**（`assembleDocument`/`reassemble`），未编辑的 create 行不经过
   render；本票只需保证 render 路径（改别名 / 改名）不丢前缀。
4. **投影的 `created` 只在为真时出现**：既有投影测试用 `toEqual` 精确断言对象形状，置 `false` 会破坏它们；
   可选字段缺省也更贴合"生命起点"是例外而非常态。
5. **未新增 ADR / 未改 `spec.md`**：ADR-0014 已记录本决策；`spec.md` 工单状态表按约定留给工单 09。

### 与工单预期的偏差

- 工单「落码位置」只列了结构树，故**只改了结构树**。ADR-0014 另提到"属性面板……体现此参与者由 create
  引入"，本票**未在 `ParticipantForm` 加提示**——遵工单范围（验收清单也只查结构树）。若需补，属工单 08
  （只读缺口）或后续小票更合适。
- ADR-0005 line 6 仍写"不解析、原样保留：create/destroy"，**未一并修订**（ADR 为历史决策记录，create 的
  变更已由 ADR-0014 承接；不改 ADR-0005，避免越出本票）。若维护方要求文档同步，可另开小票。

### 测试结果

- `npx vitest run` 三个相关文件：`sequence.test.ts` 52 例、`sequence-projection.test.ts` 23 例、
  `sequence-golden.test.ts` 11 例，全绿。
- `npm test`（全量）：**46 个测试文件 / 613 个用例，全部通过**（基线 46 / 597，用例 +16，文件数不变）。
- `npm run typecheck`：0 错误。
- 控制台：无新增 `console` 输出；全量测试未出现新增 error / warning（仅既有 i18next 相关提示）。

### 遗留 / 风险

- `create` 与 `participant` 同名声明会共用 `participant:<id>` 计数（后者得 `#2`），寻址恒指首个——与既有
  重复声明语义一致；解析器不做重复校验（交渲染层报错），符合工单要求。
- `destroy` 仍不进模型；本票未触碰 `rect` / `box`（属工单 06）。
