# 03 方向键导航

Status: resolved

Superseded by: 14（语义已作废：树形四向 / 源码顺序线性 → 方位导航，见 ADR-0011）

Blocked by: 02

> 本节以下的需求与验收记录的是**改前**的语义，已被 14 取代，保留以存档（03 的验收记录 `07-acceptance.md:177-244`
> 是「改前行为」的权威证据）。要改方向键请看 14。

## 需求

- 画布聚焦时，方向键**移动选中**（不引入独立于选中的"焦点"概念，也不移动 DOM 焦点；
  焦点始终留在容器 —— 见 `CONTEXT.md` 的「选中」词条与 ADR-0010）。
- 选中变更复用既有 `select()`，自动联动外圈高亮（`CanvasPanel.tsx:71-85` 的 data-id 高亮）
  与属性面板。
- **mindmap（树形四向）**：
  - `←` 父节点（根节点 → 无操作）
  - `→` 第一个子节点（无子节点 → 无操作）
  - `↑` 上一个兄弟 / `↓` 下一个兄弟（到边界无操作）
- **flowchart（线性，按源码顺序）**：
  - `←` / `↑` 上一个节点；`→` / `↓` 下一个节点
  - 顺序 = 投影数组顺序（即源码出现顺序），**不是**画布上的视觉方位
  - 到首/尾无操作
- **无选中时**按方向键 → 选中第一个节点（mindmap = 根节点；flowchart = 投影首个节点）。
- 到边界**不回绕**。
- 按键要 `preventDefault`（否则页面滚动）；沿用既有的 `FOCUS_EXCLUDE_SELECTOR` 排除逻辑：
  焦点在输入控件/代码面板时完全不拦截。
- class/sequence 本批不做。

## 落码位置

- `src/lib/editing/canvas-keyboard.ts`：新增导航的纯逻辑（`keyToNodeAction` 目前只映射 Tab/Enter/Delete，
  `:17-22`）；建议导出 `navigationTarget(projection, selection, key)` 之类的纯函数，便于单测。
- `src/lib/editing/use-canvas-keyboard.ts`：接入 keydown（`keyToNodeAction` 返回 null 时再看导航），
  选中后 `select()`。
- 数据来源：`src/lib/projection/mindmap-projection.ts:10-20`（已有 `depth` / `parentId`，可直接算父/子/兄弟）；
  flowchart 顺序取 `flowchart-projection` 的节点数组顺序。

## 验收

- mindmap：点选一个中层节点，四向移动符合父子兄弟语义；根节点按 `←`、末兄弟按 `↓`、无子节点按 `→`
  都无操作且不报错。
- flowchart：连续 `→` 沿源码顺序前进，`←` 回退；首尾无操作。
- 未选中任何节点时按 `→` 选中第一个节点。
- 方向键不滚动页面；焦点在代码面板时方向键是正常光标移动。

## 测试

- `canvas-keyboard.test.ts`：纯函数用例覆盖 mindmap 四向 + 三种边界 + flowchart 线性 + 无选中起始。
- `use-canvas-keyboard.test.tsx`：容聚焦时方向键 change selection 并 preventDefault；容器外不拦截。

## Comments

- 实现提交 `5f7c7e1`（合并后 `784d517`）。`npm run typecheck` 与 `npm test` 全绿。新增纯函数
  `isNavigationKey` / `navigationTarget`，hook 侧仅在命中后 `preventDefault` + `select()`。
- 决策：「无选中」含 `null` / 图表级选中 / 别种元素 / 选中已不在投影中——都回落为选中首个节点
  （应用初始选中就是图表级，否则开机按方向键没有落点）。
- **2026-09-29 作废（→ 14）**：本单的落点定义（flowchart = 源码顺序、mindmap = 父/子/兄弟）与屏幕方位无关，
  而 mermaid 的布局引擎（flowchart = dagre、mindmap = cose-bilkent）不保证源码顺序与屏幕方位一致，
  用户报的「上下左右键切换选中特别严重」即由此而来（真机实测：flowchart 从 B 按 `→` 落到正下方的 C、
  从 C 按 `→` 落到右上的 D；mindmap 从「双面板同步」按 `↓` 落到右上的「属性面板」）。
  取代者 14 改为**方位导航**（45° 锥内取最近），并覆盖四个图种、补自动平移、修修饰键缺陷；取舍见 ADR-0011。
  `navigationTarget` 及其两个分支函数在 14 中删除；`isNavigationKey` / `keyToNodeAction` /
  `nodeActionIntents` / `mindmapActionIntents` 保留（mindmap 的父子兄弟关系仍由 Tab/Enter 的落码使用）。
