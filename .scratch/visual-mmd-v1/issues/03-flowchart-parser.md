# 03 — Flowchart 解析器

**What to build:** flowchart 的完整解析器：全部节点形状、全部连线类型（线型/箭头/双向/标签/长度）、subgraph（含嵌套与标题）、classDef 常用项（填充/边框/线型/文字色）、方向（TD/LR 等），全部带 span 追踪。linkStyle、click 回调不解析、原样保留。三类测试用例（verbatim identity / 手术式改写 / 金样渲染合法）全绿。本工单不涉及 UI。

**Blocked by:** 02 — 源码变换管线骨架。

**Status:** ready-for-agent

- [ ] 解析 → 投影覆盖 ADR-0005 清单内的全部语法，清单外语法不报错、逐字保留
- [ ] verbatim identity：覆盖全部语法的用例集通过
- [ ] 手术式改写：改名/换形状/改线型等编辑意图只改目标 span
- [ ] 金样：变换产物全部能被 mermaid 渲染通过
- [ ] 语法错误的用例返回含行号的错误
