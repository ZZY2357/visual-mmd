# 自研解析器，带源码区间追踪

双向同步与导入已有代码都要求"Mermaid 源码 → 投影"的解析。我们决定为每种图表类型自研手写解析器（v1：flowchart、mindmap、class、sequence）。配合 ADR-0008 的"源码为唯一真相源"，解析器必须为每个元素记录源码文本区间（span），以支撑手术式局部编辑；可测试承诺为 verbatim identity：解析后不做修改再重组装，输出与输入逐字相同。

被否决的替代方案：
- `@mermaid-js/parser`（官方 langium 解析器）：调研确认（2026-09）其覆盖图种不含 v1 的四种图（flowchart/mindmap/class/sequence 仍是主包 jison），且无透传机制，双向同步会丢信息；交叉验证亦不可行。
- mermaid 包内部解析器：调研确认（2026-09）npm 包不导出任何解析器产物（issue #3530），官方 `parse()` 只做校验不返回 AST（issue #2523）；复用即依赖未公开的内部 API，风险不可控。

验证手段：解析器与代码生成器是纯函数，用 vitest 做"源码 ↔ 模型"金样往返用例覆盖，生成源码必须能被 mermaid 实际渲染通过；每个修复的 bug 先补用例。
