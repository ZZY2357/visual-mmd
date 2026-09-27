# 02 — 源码变换管线骨架与 verbatim identity 测试设施

**What to build:** 整个项目的地基（prefactor）：源码变换管线 `(当前源码文本, 编辑意图) → 新源码文本` 的骨架。包含解析器接口（要求为每个元素记录源码文本区间 span）、手术式改写执行器、代码快照栈机制，以及测试设施。用一个最小示例图种端到端跑通管线，测试全部走唯一接缝（源码进、源码出），不依赖 UI。此工单交付后，后续每种图表类型只需要实现"解析器 + 编辑意图"。

**Blocked by:** None — can start immediately（与 01 并行）。

**Status:** done

- [x] verbatim identity：任意合法源码经解析 → 不改 → 重组装，输出与输入逐字相同
- [x] 手术式改写：示例编辑意图只改变目标元素的 span，其余文本（注释、空行、格式、无法解析的语法）逐字不变
- [x] 金样合法性：管线产出的源码能被 mermaid 实际渲染通过
- [x] 撤销/重做以代码快照形式接入管线，连续输入按会话合并为一个快照
- [x] 解析失败时管线返回错误（含行号），投影停留在最近一次合法状态

## 实现备注

- 管线核心：`src/lib/pipeline/`（`pipeline.ts` 的 `applyEdit(source, parser, intent)`、`document.ts` 的 parts/`reassemble`、`flowchart.ts` 最小 flowchart 解析器、`snapshot-stack.ts` 代码快照单栈）。
- 金样合法性以 mermaid v12 `parse()` 验证（与工单 01 的金样用例先例一致；`render()` 的 SVG 产物验证归 UI 层）。
- "投影停留在最近一次合法状态"的画布冻结由 01 交付的 `useMermaidPreview` 保证；本工单补齐其前提：解析失败时 `applyEdit` 返回含行号错误且不产出新源码。
- 种子级限制（后续图种工单扩展）：不解析 subgraph/classDef/linkStyle（原样保留）；节点文本内不允许出现形状括号自身；连线标签内不允许出现箭头终止符；不支持链式连线；节点 id 内不含 `--`。
