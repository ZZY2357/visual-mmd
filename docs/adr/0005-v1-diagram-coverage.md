# v1 图表功能覆盖范围清单

> **状态：superseded-by-0017** —— 覆盖目标已由 [ADR-0017](0017-diagram-coverage-is-all-types-tiered.md) 从「v1 四图种」改为「mermaid 全部图种、分层对齐」；本文的逐图种语法清单作为历史细节保留。

v1 总原则：结构全覆盖、常用样式表单化；清单外的语法不报错、不丢弃，在源码中逐字原样保留（见 ADR-0008）。

- **Flowchart**：全部节点形状、全部连线类型（线型/箭头/双向/标签/长度）、subgraph（含嵌套）、classDef 常用项（填充/边框/线型/文字色）。不解析、原样保留：linkStyle、click 回调。
- **Sequence**：participant/actor、四种消息、autonumber、activate/deactivate（含简写）、note、loop/alt/opt/par/critical/break 块。不解析、原样保留：create/destroy、rect、box。
- **Class**：类与成员（可见性、泛型）、全部关系类型、标签与基数、note、classDef。不解析、原样保留：linkStyle、CSS 注入。
- **Mindmap**：层级节点、全部节点形状、::icon() 图标。无不解析项。

悬停联动（代码行 ↔ 画布元素高亮）明确不进 v1，作为 roadmap 第一项，待渲染 DOM 映射经 v1 验证后再做。
