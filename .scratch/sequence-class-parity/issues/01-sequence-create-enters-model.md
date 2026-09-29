# 01 sequence `create` 进投影模型（生命起点）

Status: pending

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

- [ ] 源码含 `create participant B` 的图：结构树能看到 B 且标出"由 create 引入"。
- [ ] 改 B 的别名为中文，落码正确、`create participant B as 新别名` 形态正确、图仍可渲染。
- [ ] 源码里的 create 行在未编辑时逐字不变（注释、空格、缩进都保留）。
- [ ] `destroy` / `rect` / `box` 仍逐字保留、不进投影。
- [ ] 控制台 0 error / 0 warning。
