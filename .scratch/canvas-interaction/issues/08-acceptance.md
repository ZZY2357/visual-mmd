# 08 验收收尾

Status: resolved

Blocked by: 01, 02, 03, 04, 05, 06, 07

## 需求

- 全链路手工验收：样式应用、键盘加节点、内联编辑、缩放平移、右键菜单、连线模式、
  mindmap 全套。
- 回归：导入/导出 .mmd/SVG/PNG 不受视图影响；图表库切换重置视图；五主题下选中态
  可见；窄屏布局不破。
- 补充管线单测（class 语句落码/清理、新节点落码位置）。
- 记录验收结论与本目录。

## Answer

2026-09-27（agent）浏览器实测验收（agent-browser headless Chrome，`npm run dev`，
逐项操作 + 截图/样式断言；非纯单测走查）。结论：**全部通过**；过程中发现并修复
4 个真实缺陷（各见下），修复后复测通过。

### 全链路验收

- **样式应用**：右键空白 →「添加样式」小表单（名称 + 颜色）→ 落码
  `classDef 高亮 fill:#f9f`；节点表单「应用样式」勾选 → `class A 高亮` 落码、
  画布节点即时变色、选中光晕正常。
- **键盘加节点**：画布聚焦后 Tab = `选中 --> 新节点` 并立即浮出内联命名（输入、
  回车落码 `n1[儿子甲]`）；Enter = 经入边推断父加同级（`A --> n2` + 命名）；
  Del 删除节点及触及连线；焦点在代码面板/输入框时 Tab/Enter 不被拦截。
- **内联编辑**：flowchart 与 mindmap 双击均原位浮出输入框（预填当前文本），
  回车/失焦落码、Esc 取消；新建节点后自动进入同一输入框。
- **缩放平移**：滚轮以鼠标为锚点缩放（锚点不变性实测：0.508 → 0.926，锚点处
  图形不动）；背景拖拽平移（transform 随拖拽位移）；「适应窗口」一键回 fit
  （与初始 fit 值一致）。
- **右键菜单**：空白 = 添加节点/添加连线/添加样式/添加子图；节点 = 从这里连线/
  编辑文本/应用样式/删除；连线 = 编辑标签/删除；均随目标变化，点击画布空白关闭。
- **连线模式**：「添加连线」两步单击起点/终点落码 `C --> D` 并选中连线；
  「从这里连线」预选起点省一步；Esc 取消回 idle（光标 crosshair ↔ grab 实测）。
- **mindmap 全套**：画布点选选中 → MindmapNodeForm；画布 Tab/Enter/Del 同
  flowchart；结构树节点聚焦 Tab 加子（缩进跟随层级）/Enter 加同级（preventDefault），
  新节点均触发内联命名；双击改名落码正常。

### 回归验收

- **导出不受视图影响**：缩放至 2.39 倍后导出 SVG 成功，文件内容无任何视图
  transform（App.tsx 走 preview.svg 原始字符串）；PNG 同链路导出成功。
- **图表库切换重置视图**：切换图表类型后 transform 回到初始 fit 值（实测一致）。
- **五主题选中态**：default/neutral/dark/forest/base 五主题切换，`[data-vm-selected]`
  光晕（Mantine 蓝色 drop-shadow，与主题色无关）在含 dark 在内的主题下均实测可见。
- **窄屏布局**：390px 视口下画布占满、光晕可见、布局不破；观察项（非阻塞）：
  390px 下 header 内"画布"标题与"重做"按钮有轻微视觉重叠。

### 补充管线单测

- `class-apply.test.ts` 新增「新节点落码位置」3 例：节点行在 classDef 之后时
  class 语句仍插在 classDef 行后；class 语句存在时 add-node 落在节点区、随后
  apply-class 正确并入共享语句；键盘/菜单新增节点与既有 class 语句互不干扰。

### 发现并修复的问题（各单独提交）

1. **mermaid v12 flowchart 节点无 data-id**（阻塞性，单测合成 DOM 掩盖了它）：
   实测 v12 neo look 边有 `data-id="L_*"` 而节点 `g.node` 只有 DOM id
   `{svgId}-flowchart-{id}-{n}`，画布点选/高亮/内联编辑寻址全链路失效。
   修复：新增 `node-data-ids.ts` 渲染后处理，把节点 DOM id 反注为 data-id
   （幂等、尽力而为），与工单 01 命中路径同类。9fec093
2. **mindmap DOM id 带 svgId 前缀**（阻塞性）：v12 实测为 `{svgId}-node_N` 而非
   `node_N`，适配器精确匹配失效。修复：解析与回查一律按后缀匹配（resolver、
   highlight、内联编辑定位三处）。4b3c065
3. **右键菜单项真实鼠标点击失效**：容器 onPointerDown 在菜单/样式表单浮层上也
   启动背景拖拽并 setPointerCapture，click 被劫持到容器（菜单当作"点击画布"关闭）。
   修复：菜单/样式表单打开时不启动拖拽。4b3c065
4. **代码面板外部同步交替丢失**（根因性）：CodePanel 用单个布尔 isInternalUpdate
   配对外部同步与 CM 回声，外部落码 → 全量回写 → 回声置标 → 下一次外部落码被
   当回声跳过，代码面板停在旧源码（与"源码是唯一真相源"相悖；验收中段大量
   "操作未生效"假象即源于此）。修复：改为无状态 doc 比较，回声不再写入撤销快照。
   b5c35d0；新增 `code-panel.test.tsx` 连续两次外部变更回写回归测试。
   另修复：容器 onClick 无条件 focus() 抢走内联输入框焦点；输入框 display:none
   阶段 focus() 无效导致新建节点命名框不自动聚焦（等 rect 就绪再聚焦）。

### 测试结果

- `npm test`：411 passed（39 文件；验收前基线 402，本单新增 9 例）。
- `npm run typecheck`：通过；`npm run build`：通过。
- 提交：9fec093（flowchart data-id 反注 + 落码位置单测）、4b3c065（mindmap
  后缀匹配 + 菜单指针捕获）、b5c35d0（代码面板同步 + 焦点抢占）。
- 记录验收结论与本目录。
