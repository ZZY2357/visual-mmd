# 02 classDef 应用到节点

Status: ready-for-agent

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
