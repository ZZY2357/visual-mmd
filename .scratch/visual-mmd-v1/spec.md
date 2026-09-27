# Visual MMD v1 — 可视化 Mermaid 编辑器

Status: ready-for-agent

## Problem Statement

用户想画 Mermaid 图，但必须先学会 Mermaid 语法——每种图有各自的语法细节、十几种节点形状、数十种连线写法。对不常写图的人来说，每次都要查文档；写错一个箭头就是一屏报错。已有的在线编辑器（如 mermaid-live-editor）只提供"代码 ↔ 渲染预览"的联动，预览不可编辑；商业产品（Mermaid Chart）闭源收费。社区没有任何成熟的开源工具能让人**不学语法**画出 Mermaid 图，同时保住"源码是最终交付物"这一 Mermaid 生态的现实约束（贴进 README、Obsidian、飞书文档的永远是那段文本）。

## Solution

一个纯前端 PWA 编辑器：左侧代码面板显示并允许直接编辑 Mermaid 源码，中间画布实时渲染预览并支持点击选中元素，右侧属性面板用结构树和表单管理节点、连线与样式。用户在表单里做的每一个操作都直接修改源码，看着代码随操作变化，自然学会语法；反向亦然——直接敲代码，画布立即更新。源码是唯一真相源与最终交付物；编辑器永不重排用户没碰过的文本。图表保存在浏览器 localStorage 的图表库中，可导出 .mmd / .svg / .png。

v1 覆盖四种图表类型：flowchart、mindmap、class、sequence。

## User Stories

### 入门与图表库

1. As a 从未学过 Mermaid 的用户, I want 新建图表时从该类型的模板起步, so that 我面对的是一张能跑通的示例图而不是空白
2. As a 用户, I want 在图表库中新建、重命名、复制、删除图表, so that 我能把日常的图都存在浏览器里
3. As a 用户, I want 每次修改自动保存到 localStorage, so that 关掉标签页回来图还在
4. As a 用户, I want 离线打开这个 PWA 继续编辑, so that 没网时也能画图
5. As a 用户, I want 把它安装到桌面作为独立应用使用, so that 它像本地工具而不是网页
6. As a 用户, I want 导入已有的 .mmd 文件开始编辑, so that 我现有的图能迁移进来
7. As a 用户, I want 导出当前 Mermaid 源码为 .mmd 文件, so that 我可以把它贴进 README / 文档
8. As a 用户, I want 导出渲染结果为 SVG 和 PNG, so that 我可以直接插图

### 双面板同步（核心体验）

9. As a 用户, I want 在属性面板修改任何属性时看到左侧源码对应片段实时变化, so that 我不用刻意背语法就记住了写法
10. As a 用户, I want 在代码面板直接敲 Mermaid 语法并看到画布立即更新, so that 我会写语法时可以全速工作
11. As a 用户, I want 代码写错时画布停留在最近一次合法状态的图, so that 打错字不会让画面闪空白
12. As a 用户, I want 代码出错时看到错误行标红与错误信息, so that 我知道哪里坏了
13. As a 用户, I want 源码中我看不懂也没用过的语法（注释、生僻指令）永远原样保留, so that 编辑器绝不弄丢或改写我的内容
14. As a 用户, I want 撤销/重做对所有编辑生效（表单、画布、代码）, so that 任何误操作都可回退
15. As a 用户, I want 连续打字只算一个撤销步骤, so that 撤销不是按字符逐个回退

### 画布交互

16. As a 用户, I want 点击画布中的节点选中它并在属性面板展开其属性, so that 我能对着图找元素
17. As a 用户, I want 选中节点后按 Del 删除、Tab 添加子节点、Enter 添加同级节点, so that 高频操作不用离开键盘
18. As a 用户, I want 在结构树中浏览并选中图的全部元素（包括连线）, so that 画布点不到的元素也有确定入口

### Flowchart

19. As a 用户, I want 从全部节点形状（矩形、圆角、体育场、菱形、圆、双圆、六边形、平行四边形、梯形、圆柱、旗帜等）中选择, so that 我不用记每种形状的括号写法
20. As a 用户, I want 为连线选择线型（实/虚/粗）、箭头样式、双向与标签、长度, so that 不用记 `-.->` `==>` `o--o` 这些符号
21. As a 用户, I want 创建嵌套的 subgraph 子图并设置标题, so that 分组结构用表单就能搭
22. As a 用户, I want 用表单设置节点填充色、边框色、边框线型、文字色, so that 高亮某个节点的样式需求不用学 classDef 语法
23. As a 用户, I want 设置图的方向（TD/LR 等）, so that 图的走向可以调整

### Sequence

24. As a 用户, I want 添加 participant / actor 并改名, so that 不用记两种声明写法的差别
25. As a 用户, I want 用表单发送四种消息（实线、虚线、叉头、无头）, so that 不用记 `->>` `-->` `-x` `--` 的区别
26. As a 用户, I want 启用 autonumber、为消息激活/停用生命线, so that 常用时序图特性随手可开
27. As a 用户, I want 添加 note（over/left/right）, so that 注释不用手写语法
28. As a 用户, I want 用表单创建 loop / alt-else / opt / par-and / critical / break 逻辑块, so that 复杂时序结构不需要背块语法

### Class

29. As a 用户, I want 添加类并管理成员（属性/方法、可见性 + - # ~、泛型）, so that 成员声明不用手敲
30. As a 用户, I want 从全部关系类型（继承、实现、组合、聚合、关联、依赖）中选择并添加标签与基数, so that 不用记 `<|--` `*--` `o--` 的方向语义
31. As a 用户, I want 为类添加 note, so that 说明文字不用手写语法

### Mindmap

32. As a 用户, I want 在树形缩进界面里增删改层级节点, so that 不用维护缩进文本
33. As a 用户, I want 为节点选择形状（方形、圆角、圆、爆炸、云等）和图标, so that 不用记 `((text))` `::icon()` 写法

### 样式与配置

34. As a 用户, I want 从五种主题中选择, so that 不用学 frontmatter config 写法
35. As a 用户, I want 生僻配置直接在代码面板手写且被完整保留, so that 编辑器不挡高级用法的路

### 界面

36. As a 用户, I want 三栏布局（代码面板 | 画布 | 属性面板）且各栏宽度可拖拽调整、可折叠, so that 我按自己的习惯分配屏幕空间
37. As a 用户, I want 窄屏/小窗上只显示画布, so that 缩小窗口时至少图还能看
38. As a 用户, I want 界面是中文, so that 没有语言门槛

## Implementation Decisions

**总体架构（源码为王，ADR-0008）**

- Mermaid 源码是唯一真相源与最终交付物。UI 状态中的"投影"是源码解析出的只读派生视图，不持久化、不参与撤销。
- 一切编辑（表单操作、画布操作、代码输入、撤销/重做）都表达为对源码的修改。核心接缝为单一纯函数管线：`(当前源码文本, 编辑意图) → 新源码文本`。
- 解析器为每个元素记录源码文本区间（span）；编辑只重写受影响元素的区间，未触碰文本（注释、空行、格式习惯、无法解析的语法）逐字保留。可测试承诺：解析后不做修改再重组装，输出与输入逐字相同（verbatim identity）。
- 旧方案的"透传片段合并机制"不实现——无法映射的语法不参与解析重组装，自然保留。

**解析器（ADR-0004）**

- 为 4 种图表类型自研手写解析器，带 span 追踪。不使用 `@mermaid-js/parser`（调研确认不覆盖这四种图）与 mermaid 内部解析器（npm 不导出，issue #3530）。
- 语法错误处理：解析失败时投影停留在最近一次合法状态；属性面板整体禁用，提示错误行号并支持跳转。

**编辑器实现**

- 技术栈：React + Mantine + Vite + TypeScript；PWA 用 vite-plugin-pwa（可安装、离线可用）。
- 代码面板用 CodeMirror 6（语法高亮、错误行标红、行号跳转、输入会话合并）。
- 状态管理用 zustand：store 持有当前源码文本、快照栈、图表库索引；投影为源码的 memo 派生。
- 撤销/重做 = 代码快照单栈，连续代码输入按输入会话合并为一个快照。
- 画布点击选中依赖 mermaid 渲染 SVG 上的 `data-id`（事实约定，ADR-0007）；mermaid 锁定 v12，大版本升级必须回归选中映射。边的选中以结构树为主入口，画布侧对边只做尽力而为的 DOM 匹配。
- mermaid 渲染以 `securityLevel: 'strict'` 运行；不执行源码中的 click 回调（原样保留即可）。
- 布局：三栏（代码面板 | 画布 | 属性面板），面板拖拽调宽、可折叠；窄屏只显示画布。属性面板上半为结构树、下半为选中元素属性表单。
- 图表库与当前图表 id 持久化于 localStorage；自动保存于每次源码变更。
- 导出：.mmd（当前源码文本）、.svg / .png（由 mermaid 渲染产物导出）。
- i18next 从第一天接入但只配中文 locale；全部文案经过 i18n 字典。
- 每种图表类型一个模板，新建时按类型套用。

**v1 功能范围（ADR-0005）**

- Flowchart：全部节点形状、全部连线类型、subgraph（含嵌套）、classDef 常用项、方向。不解析、原样保留：linkStyle、click 回调。
- Sequence：participant/actor、四种消息、autonumber、activate/deactivate（含简写）、note、六种逻辑块。不解析、原样保留：create/destroy、rect、box。
- Class：类与成员（可见性、泛型）、全部关系类型、标签与基数、note、classDef。不解析、原样保留：linkStyle、CSS 注入。
- Mindmap：层级节点、全部节点形状、::icon() 图标。无不解析项。
- 样式：五种主题选择器 + 常用 classDef 项表单化；全量 frontmatter config 不做表单。

## Testing Decisions

- 好的测试只断言外部可见行为：对这套架构，外部行为就是源码文本的变化与渲染产物的合法性，不测内部数据结构。
- **唯一测试接缝**：源码变换管线 `(当前源码文本, 编辑意图) → 新源码文本`（纯函数）。解析器、手术式改写、快照栈全部封装在其后，通过该接缝覆盖。
- 三类核心用例（vitest）：
  1. **verbatim identity**：任意合法源码经解析→不改→重组装，输出逐字等于输入。
  2. **手术式改写**：给定编辑意图，断言只有目标元素的 span 发生变化，其余文本逐字不变。
  3. **金样合法性**：变换产出的源码必须能被 mermaid 实际渲染通过（渲染失败即用例失败）。
- 每种图表类型一组上述用例；修复任何解析 bug 时先补用例再修。
- UI 组件、mermaid 渲染、画布选中不进单元测试；画布选中映射（data-id）只做升级 mermaid 大版本时的手动回归检查。
- 代码库当前为空，无既有测试先例；本 spec 即建立先例。

## Out of Scope

- 后端、账号系统、云同步、分享链接（ADR-0002：纯前端 PWA + localStorage）。
- File System Access API 本地文件直读直写（ADR-0002 明确否决，仅留 .mmd 导入导出）。
- 自由画布拖放定位（ADR-0001：Mermaid 布局自动计算，不可行于多数图类型）。
- 悬停联动（代码行 ↔ 画布元素高亮）——roadmap 第一项，待 data-id 映射经 v1 验证（ADR-0005、ADR-0007）。
- 其余图表类型（v1 仅四种；架构按"一种类型 = 一个解析器 + 一套表单 schema"预留扩展点）。
- 全量 frontmatter config 编辑器、graphConfig 的逐项表单。
- 移动端编辑（窄屏仅展示画布）；英文翻译（仅留 i18n 门）。
- 执行源码中的 click 回调、CSS 注入的表单化。

## Further Notes

- 全部设计决策见 `CONTEXT.md`（术语表）与 `docs/adr/0001`–`0008`；ADR-0003、0006 的部分内容已被 ADR-0008 取代，实现时以 0008 为准。
- 实现顺序建议：先搭源码变换管线骨架与 verbatim identity 测试设施（这是整个项目的地基），再做 flowchart 端到端打通三栏 UI，然后按 sequence → class → mindmap 扩展。
- 社区无成熟先例可抄（调研确认双向转换库均不成熟），解析器是核心资产，工时预估的主要构成。
