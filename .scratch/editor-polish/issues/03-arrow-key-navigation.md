# 03 方向键导航

Status: needs-triage

Blocked by: 02

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

（空）
