# 02 classDef 应用到节点

Status: resolved

用户反馈：添加样式（classDef）后无法作用到某个节点。

## 需求

- 选中节点时，NodeForm 新增"应用样式"多选下拉，列出当前图的全部 classDef。
- 勾选 → 落码为独立 `class 节点id 样式名` 语句（手术式追加/改写，逐字保留既有文本）；
  取消勾选 → 删除对应语句（仅当该语句只服务这一对时整行删除，多节点共享时只摘除该
  节点 id）。一个节点可挂多个样式。
- 管线（`src/lib/pipeline/flowchart.ts`）需新增 class 语句的解析数据（目前解析器刻意
  不解析 class 语句，见文件头注释）与对应编辑意图；投影暴露"节点 → 已应用样式"。
- 移除 classDef 本身时，同步清理引用它的 `class` 语句。

## 验收

- 添加 classDef 后在节点表单勾选，源码出现 `class A hello`，画布节点变色。
- 取消勾选后语句被移除，画布恢复。

## Comments

实现要点（2026-09-27）：

- 解析器（`src/lib/pipeline/flowchart.ts`）：新增 `class` 语句解析（`ClassStatementData` +
  `parseClassLine` + `renderClassStatement`），支持 `class A 样式名` 与 `class A, B 样式名`
  多节点共享写法，分隔符/缩进/行尾残留逐字保留；格式不符的行仍原样保留（ADR-0008）。
  文件头注释同步更新（class 语句从"不解析"清单移入覆盖清单）。
- 编辑意图：`apply-class`（落码为独立 `class 节点 样式名` 行，跟随该样式的 classDef 行插入；
  已有同样式语句时追加节点 id，幂等）、`unapply-class`（语句只服务这一对时整行删除，
  多节点共享时只摘除该节点 id，幂等）、`delete-classdef`（删除 classDef 行并同步清理引用它的
  class 语句）。删除后残留缩进空行，与 delete-node 等既有删除意图的落码约定一致。
- 投影（`flowchart-projection.ts`）：`FlowchartProjection.appliedStyles` 暴露"节点 → 已应用样式"。
- 表单：`NodeForm` 新增"应用样式"MultiSelect（列出全部 classDef，勾选/取消勾选映射为
  apply/unapply-class 意图，一个节点可挂多个样式）；`ClassDefForm` 新增删除按钮触发
  delete-classdef。意图映射纯函数在 `src/lib/editing/flowchart-forms.ts`。
- i18n：`propertyPanel.applyStyles`（应用样式）、`propertyPanel.applyStylesEmpty`（暂无样式）。

验证：新增 `src/lib/pipeline/__tests__/class-apply.test.ts`（class 语句 verbatim identity、
投影展开、落码/追加/摘除/整行删除/同步清理/幂等，共 12 例）；npm test 318 通过、
npm run typecheck 通过。
