# 0017 图种覆盖目标改为 mermaid 全部图种、分层对齐

> **状态：accepted**（扩展 ADR-0005 的覆盖目标，未推翻其总原则）

日期：2026-09-30（more-diagrams 批次）

## 背景

ADR-0005 把 v1 覆盖范围定为四种图（flowchart、sequence、class、mindmap），此后每个批次都在
这四种上做纵深（连线寻址、添加入口、编辑键）。用户在 2026-09-30 提出把"别的图也全实现了"。

mermaid 12.0.0 共约 30 个图种，性质差异极大：结构类（state/ER/……）能套用"选中+表单"模型；
数据展示类（pie/gantt/sankey/……）本质是数据渲染，元素寻址与画布交互的着力点各不相同，
zenuml 还依赖外部渲染包。

## 决策

1. **覆盖目标改为 mermaid 全部图种**，不再停留在四图纵深。
2. **分层对齐而非全语法对齐**：每图种的核心语法做全链路（解析→投影→结构树→表单，视 DOM
   可寻址性决定画布交互），清单外语法逐字保留（ADR-0004/0008 不变）。
3. **画布点选按 DOM 可寻址性降级**：无 data-id 可寻址的元素不伪造画布交互，结构树仍是完整
   编辑入口底线。数据展示类以结构树+表单为主。
4. **未注册图种走只读降级**（渲染 + 代码面板 + 占位提示），不再默认落进 flowchart 误解析。

## 后果

- 加图种的边际成本收敛为"一张工单一个图种"（注册表与能力包地基已就绪，ADR-0015）。
- v1 四图种的既有行为与既有决策（ADR-0007/0012/0013/0014）全部继续适用，不回退。
- 画布交互承诺从"所有图种对等"收窄为"可寻址的对等、不可寻址的结构树对等"——
  CONTEXT.md 的画布相关定义按此口径理解。
- 未注册图种的 detect 默认行为从"当作 flowchart"改为"只读降级"，属可观察行为变化。

## 落地（more-diagrams 工单 29 验收，2026-10-01）

本批 28 张工单全部 resolved 并合入 main，**覆盖范围无缩水**——分层对齐按既定承诺兑现：

- **`DIAGRAM_TYPE_LIST` 实测 31 图种** = 4 原有（flowchart/sequence/class/mindmap）+ 27 新增
  （第一波 17 + 第二波 9 + zenuml 之外的盘点差异见下）。计数由 `diagram-registry.test.ts` 钉住。
- **可寻址图种**（画布点选 / 高亮 / 内联编辑原样生效，走 flowchart/class 同一条 data-id 链路）：
  kanban、requirement、usecase、agentflow、venn（集合/交集）、既有四图种。
- **不可寻址图种**（ADR-0007 诚实降级：不伪造 DOM 交互，结构树 + 属性表单为完整编辑入口）：
  gitgraph、timeline、journey、pie、gantt、quadrant、sankey、xychart、radar、packet、architecture、
  c4、treemap、ishikawa、wardley、cynefin、eventmodeling。降级证据（渲染 chunk 行号）逐图种
  落在各工单 Comments 与 `docs/mermaid-upgrade-regression-checklist.md`。
- **只读渲染**（不进 `DIAGRAM_TYPE_LIST` 可视化编辑链）：**zenuml**——依赖外部
  `@mermaid-js/mermaid-zenuml` 懒加载注册，按工单 19 任务 0 的降级路径处理（渲染 + 代码面板照常，
  表单降级提示）。
- **升格（超出工单原文、e2e 必需的唯一一项）**：gitgraph 新增 `checkout`/`switch` 语句插入与
  「切换分支」按钮（`branch` 创建即 checkout、`merge` 只作用于当前分支，否则 e2e「merge 回 main」
  无手段）。其余图种无升格。
- **验收期间真机走查暴露 3 个此前单测未覆盖的真 Bug**（ER 属性行分隔 / ER 关系锚点 / Gantt 元数据
  表单 React 19 `currentTarget` 陷阱），全部修复并加回归测试——证明「单测 + `mermaid.parse`」证据链
  不能替代真机走查（详见 spec.md 落地修正节与工单 29 Comments）。
